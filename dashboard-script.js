// Apply Dark Mode immediately if saved
(function () {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') { document.body.classList.add('light-mode'); }
})();

// Global array to hold the exams
let currentExams = [];

document.addEventListener("DOMContentLoaded", () => {
    checkLoginStatus();
    initStreakAndTimer();
    initDashboardCalendar();
    setupExamModal();

    // Check if we are on the settings page to populate data
    if (window.location.pathname.includes("settings.html")) {
        populateSettingsFields();
    }
});

function checkLoginStatus() {
    const userDataString = localStorage.getItem("user");
    if (userDataString) {
        try {
            const user = JSON.parse(userDataString);
            const profileNameEl = document.getElementById("profile-name-display");
            const profileImgPlaceholder = document.getElementById("profile-img-placeholder");
            const heroGreetingEl = document.getElementById("hero-greeting");

            if (user) {
                const displayName = user.full_name || user.email.split('@')[0];
                const firstName = displayName.split(' ')[0];
                if (profileNameEl) profileNameEl.textContent = displayName;
                if (heroGreetingEl) heroGreetingEl.textContent = `Hello ${firstName}`;
                if (profileImgPlaceholder && displayName) profileImgPlaceholder.textContent = displayName.charAt(0).toUpperCase();

                // REDIRECT LOGIC: Make profile clickable to go to settings
                const profileArea = profileNameEl?.parentElement;
                if (profileArea) {
                    profileArea.style.cursor = "pointer";
                    profileArea.title = "Go to Settings";
                    profileArea.onclick = () => { window.location.href = "settings.html"; };
                }

                const userId = user.id || user.user_id;
                if (userId) {
                    // Only fetch dashboard stats if we are on the dashboard page
                    if (document.getElementById("stat-progress")) {
                        fetchDashboardData(userId);
                    }
                    loadTodayTasks(userId);
                } else {
                    console.warn("No user ID found! Please log out and log back in.");
                }
            }
        } catch (e) { console.error("Error parsing user data:", e); }
    } else { window.location.href = "login.html"; }
}

// --- SETTINGS PAGE LOGIC ---

function populateSettingsFields() {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    // Set Header info
    document.getElementById('settings-name-title').textContent = user.full_name || "User";
    document.getElementById('settings-email-title').textContent = user.email;
    document.getElementById('settings-avatar').textContent = (user.full_name || user.email).charAt(0).toUpperCase();

    // Fill Inputs
    document.getElementById('set-fullname').value = user.full_name || "";

    // Connect Save Button
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        saveBtn.onclick = saveSettings;
    }
}

async function saveSettings() {
    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user.id || user.user_id;
    const saveBtn = document.getElementById('save-settings-btn');

    // Show loading state
    saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    // Prepare payload matching server StudentDetailsPayload schema
    const payload = {
        personal_details: {
            full_name: document.getElementById('set-fullname').value,
            mobile_number: document.getElementById('set-mobile').value,
            email: user.email,
            gender: "Not Specified",
            date_of_birth: "2000-01-01",
            city: "Not Specified",
            state: "Not Specified"
        },
        academic_details: {
            class_standard: document.getElementById('set-class').value,
            board: document.getElementById('set-board').value,
            stream: "None",
            subjects: []
        },
        learning_preferences: {
            exam_preparation_for: [document.getElementById('set-exams').value],
            preferred_language: "English",
            weak_subjects: [],
            strong_subjects: []
        }
    };

    try {
        const response = await fetch(`/api/update-student-details/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update LocalStorage so name reflects in UI immediately
            user.full_name = payload.personal_details.full_name;
            localStorage.setItem("user", JSON.stringify(user));
            alert("Settings saved successfully!");
            window.location.href = "dashboard.html";
        } else {
            alert("Error: " + (data.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Save failed:", error);
        alert("Failed to update settings. Check server connection.");
    } finally {
        saveBtn.innerHTML = 'Save Changes';
        saveBtn.disabled = false;
    }
}

// --- REMAINING DASHBOARD LOGIC (STREAK, TIMER, CALENDAR) ---

function initStreakAndTimer() {
    const userString = localStorage.getItem("user");
    if (!userString) return;
    try {
        const user = JSON.parse(userString);
        const userId = user.id || user.user_id;
        if (!userId) return;

        const today = new Date().toDateString();
        const lastVisitKey = "lastVisitDate_id" + userId;
        const streakKey = "currentStreak_id" + userId;
        const timeKey = "dailyTimeSeconds_id" + userId;
        const lastTimeDateKey = "lastTimeDate_id" + userId;

        let lastVisit = localStorage.getItem(lastVisitKey);
        let streak = parseInt(localStorage.getItem(streakKey)) || 0;

        if (lastVisit !== today) {
            if (lastVisit) {
                let yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastVisit === yesterday.toDateString()) streak++;
                else streak = 1;
            } else { streak = 1; }
            localStorage.setItem(lastVisitKey, today);
            localStorage.setItem(streakKey, streak);
        }

        const streakEl = document.getElementById("stat-streak");
        if (streakEl) streakEl.textContent = streak;

        let dailyTimeSeconds = parseInt(localStorage.getItem(timeKey)) || 0;
        let lastTimeDate = localStorage.getItem(lastTimeDateKey);

        if (lastTimeDate !== today) {
            dailyTimeSeconds = 0;
            localStorage.setItem(lastTimeDateKey, today);
        }

        const timeEl = document.getElementById("stat-time");
        function formatTime(totalSeconds) {
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            if (h > 0) return `${h}h ${m}m`;
            else if (m > 0) return `${m}m`;
            else return `${s}s`;
        }

        setInterval(() => {
            dailyTimeSeconds++;
            localStorage.setItem(timeKey, dailyTimeSeconds);
            if (timeEl) timeEl.textContent = formatTime(dailyTimeSeconds);
        }, 1000);

        if (timeEl) timeEl.textContent = formatTime(dailyTimeSeconds);
    } catch (e) { console.error("Error setting up streak and timer:", e); }
}

function fetchDashboardData(userId) {
    fetch(`/api/dashboard-stats/${userId}`)
        .then(response => {
            if (!response.ok) throw new Error("Could not fetch stats");
            return response.json();
        })
        .then(data => {
            const heroSubtitle = document.getElementById("hero-subtitle");
            if (heroSubtitle) heroSubtitle.textContent = data.hero_subtitle;

            const progressEl = document.getElementById("stat-progress");
            const pendingEl = document.getElementById("stat-pending");
            if (progressEl) progressEl.textContent = data.stats.progress + "%";
            if (pendingEl) pendingEl.textContent = data.stats.pending;

            currentExams = data.upcoming_exams || [];
            renderExams(currentExams);
            
            // Pass the dynamic attendance labels returning from the backend
            renderCharts(data.charts.performance, data.charts.attendance, data.charts.attendance_labels);
        })
        .catch(error => console.error("Error fetching dashboard data:", error));
}

function renderExams(exams) {
    const examsContainer = document.getElementById("exams-container");
    if (!examsContainer) return;
    examsContainer.innerHTML = "";
    if (exams.length === 0) {
        examsContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; margin-top: 10px;">No exams added.</p>';
        return;
    }
    exams.forEach((exam, index) => {
        examsContainer.innerHTML += `
            <div class="list-row" style="position: relative; margin-top: 15px;">
                <i class="fa-solid fa-book list-icon"></i>
                <div>
                    <h4 style="margin: 0; font-size: 15px; font-weight: 700;">${exam.subject}</h4>
                    <p style="margin: 4px 0 0 0; font-size:11px; opacity:0.7;">${exam.date} • ${exam.time}</p>
                </div>
                <i class="fa-solid fa-trash" title="Remove Exam" style="position: absolute; right: 10px; top: 10px; cursor: pointer; opacity: 0.4; font-size: 14px; transition: 0.3s;" onclick="deleteExam(${index})" onmouseover="this.style.opacity='1'; this.style.color='#ff4757';" onmouseout="this.style.opacity='0.4'; this.style.color='white';"></i>
            </div>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0 0 0;">
        `;
    });
}

function formatExamDate(dateStr) {
    const date = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let d = date.getDate();
    return `${months[date.getMonth()]} ${d < 10 ? '0' + d : d}`;
}

function formatExamTime(time24) {
    if (!time24) return '';
    let [hours, minutes] = time24.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours < 10 ? '0' + hours : hours}:${minutes} ${ampm}`;
}

function setupExamModal() {
    const addBtn = document.getElementById('open-exam-modal-btn');
    const modal = document.getElementById('add-exam-modal');
    const overlay = document.getElementById('modal-overlay');
    const cancelBtn = document.getElementById('cancel-exam-btn');
    const saveBtn = document.getElementById('save-exam-btn');
    if (!addBtn || !modal) return;
    addBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        overlay.style.display = 'block';
    });
    const close = () => {
        modal.style.display = 'none';
        overlay.style.display = 'none';
        document.getElementById('exam-subject-input').value = '';
        document.getElementById('exam-date-input').value = '';
        document.getElementById('exam-time-input').value = '';
    };
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    saveBtn.addEventListener('click', () => {
        const subject = document.getElementById('exam-subject-input').value.trim();
        const rawDate = document.getElementById('exam-date-input').value;
        const rawTime = document.getElementById('exam-time-input').value;
        if (!subject || !rawDate || !rawTime) { alert("Please fill in all fields."); return; }
        const formattedDate = formatExamDate(rawDate);
        const formattedTime = formatExamTime(rawTime);
        currentExams.push({ subject: subject, date: formattedDate, time: formattedTime });
        const user = JSON.parse(localStorage.getItem("user"));
        const userId = user.id || user.user_id;
        syncExamsToBackend(userId, currentExams);
        renderExams(currentExams);
        close();
    });
}

window.deleteExam = function (index) {
    currentExams.splice(index, 1);
    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user.id || user.user_id;
    syncExamsToBackend(userId, currentExams);
    renderExams(currentExams);
};

function syncExamsToBackend(userId, exams) {
    fetch('/api/update-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exams: exams })
    }).catch(error => console.error("Error saving exams:", error));
}

// Added dynamic label support and layout heights to fix invisible chart bug
function renderCharts(perfData, attData, attLabels) {
    // Fallback if labels aren't provided by API
    if (!attLabels) {
        attLabels = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
    }

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#fff';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    } else {
        console.error("Chart.js is not loaded.");
        return;
    }

    const ctxPEl = document.getElementById('perfChart');
    if (ctxPEl) {
        // Guarantee visibility: force parent container height
        if(ctxPEl.parentElement) {
            ctxPEl.parentElement.style.position = 'relative';
            ctxPEl.parentElement.style.minHeight = '200px'; 
        }

        const ctxP = ctxPEl.getContext('2d');
        if (window.perfChartInstance) window.perfChartInstance.destroy();
        const centerText = {
            id: 'centerText', beforeDraw: function (chart) {
                var width = chart.width, height = chart.height, ctx = chart.ctx;
                ctx.restore(); ctx.font = "800 24px Nunito"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
                var text = perfData[0] + "%", textX = Math.round((width - ctx.measureText(text).width) / 2), textY = height / 2;
                ctx.fillText(text, textX, textY); ctx.save();
            }
        };
        window.perfChartInstance = new Chart(ctxP, {
            type: 'doughnut',
            data: { datasets: [{ data: perfData, backgroundColor: ['#ffffff', 'rgba(255,255,255,0.1)'], borderWidth: 0, cutout: '80%', borderRadius: 20 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
            plugins: [centerText]
        });
    }

    const ctxAEl = document.getElementById('attChart');
    if (ctxAEl) {
        // Guarantee visibility: force parent container height
        if(ctxAEl.parentElement) {
            ctxAEl.parentElement.style.position = 'relative';
            ctxAEl.parentElement.style.minHeight = '200px'; 
        }

        const ctxA = ctxAEl.getContext('2d');
        if (window.attChartInstance) window.attChartInstance.destroy();
        let gradient = ctxA.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        window.attChartInstance = new Chart(ctxA, {
            type: 'line',
            data: {
                labels: attLabels, // Utilizing dynamic labels
                datasets: [{
                    label: 'Activity', data: attData, borderColor: '#ffffff', backgroundColor: gradient,
                    borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#ffffff', pointBorderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 12 } } }, y: { display: false } },
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
    }
}

async function loadTodayTasks(userId) {
    const today = new Date();
    let m = today.getMonth() + 1;
    let d = today.getDate();
    const todayStr = `${today.getFullYear()}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`;
    try {
        const response = await fetch(`/api/get-schedule/${userId}`);
        const data = await response.json();
        const taskContainer = document.getElementById('dashboard-tasks-container');
        if (!taskContainer) return;
        if (data.status === "success" && data.schedule && data.schedule[todayStr]) {
            const tasks = data.schedule[todayStr];
            taskContainer.innerHTML = '';
            if (tasks.length === 0) {
                taskContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; padding: 10px 0;">No tasks scheduled for today.</p>';
                return;
            }
            tasks.forEach(task => {
                taskContainer.innerHTML += `
                    <div class="dash-task-item">
                        <div class="dash-task-dot"></div>
                        <div class="dash-task-info">
                            <h4 style="font-size: 15px;">${task.name}</h4>
                            <p style="font-size: 11px;">${task.timeString}</p>
                        </div>
                    </div>
                `;
            });
        } else {
            taskContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; padding: 10px 0;">No tasks scheduled for today.</p>';
        }
    } catch (error) { console.error("Error loading today's tasks:", error); }
}

function initDashboardCalendar() {
    const currentDate = document.querySelector(".current-date");
    const daysTag = document.querySelector(".days");
    const prevNextIcon = document.querySelectorAll(".calendar-icons span");
    if (!daysTag) return;
    let date = new Date(), currYear = date.getFullYear(), currMonth = date.getMonth();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const renderCalendar = () => {
        let firstDayofMonth = new Date(currYear, currMonth, 1).getDay(),
            lastDateofMonth = new Date(currYear, currMonth + 1, 0).getDate(),
            lastDayofMonth = new Date(currYear, currMonth, lastDateofMonth).getDay(),
            lastDateofLastMonth = new Date(currYear, currMonth, 0).getDate();
        let liTag = "";
        for (let i = firstDayofMonth; i > 0; i--) { liTag += `<li class="inactive">${lastDateofLastMonth - i + 1}</li>`; }
        for (let i = 1; i <= lastDateofMonth; i++) {
            let isToday = i === new Date().getDate() && currMonth === new Date().getMonth() && currYear === new Date().getFullYear() ? "active" : "";
            let m = currMonth + 1; let d = i;
            let dateStr = `${currYear}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`;
            liTag += `<li class="${isToday} clickable-day" data-date="${dateStr}" style="cursor: pointer; position: relative; z-index: 10;" title="Add tasks for ${dateStr}">${i}</li>`;
        }
        for (let i = lastDayofMonth; i < 6; i++) { liTag += `<li class="inactive">${i - lastDayofMonth + 1}</li>` }
        if (currentDate) { currentDate.innerText = `${months[currMonth]} ${currYear}`; }
        daysTag.innerHTML = liTag;
        const clickableDays = daysTag.querySelectorAll('.clickable-day');
        clickableDays.forEach(day => {
            day.addEventListener('click', function () {
                const selectedDate = this.getAttribute('data-date');
                window.location.href = `calendar.html?date=${selectedDate}`;
            });
        });
    }
    renderCalendar();
    if (prevNextIcon) {
        prevNextIcon.forEach(icon => {
            icon.addEventListener("click", () => {
                currMonth = icon.id === "prev" ? currMonth - 1 : currMonth + 1;
                if (currMonth < 0 || currMonth > 11) {
                    date = new Date(currYear, currMonth, new Date().getDate());
                    currYear = date.getFullYear(); currMonth = date.getMonth();
                } else { date = new Date(); }
                renderCalendar();
            });
        });
    }
}

function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'logout-link' || e.target.id === 'logout-icon' || e.target.closest('#logout-link')) { logout(); }
});