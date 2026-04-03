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

function renderCharts(perfData, attData, attLabels) {

    // --- DYNAMIC WEEK OVERRIDE ---
    // We dynamically generate the last 7 days (e.g., "Mon", "Tue") based on the current date
    // and force the chart to use these instead of the months coming from the backend.
    const dynamicWeekLabels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dynamicWeekLabels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    // Override the backend labels with our dynamic week
    attLabels = dynamicWeekLabels;
    // -----------------------------

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#fff';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    } else {
        console.error("Chart.js is not loaded.");
        return;
    }

    const ctxPEl = document.getElementById('perfChart');
    if (ctxPEl) {
        if (ctxPEl.parentElement) {
            ctxPEl.parentElement.style.position = 'relative';
            ctxPEl.parentElement.style.minHeight = '200px';
        }

        const ctxP = ctxPEl.getContext('2d');
        if (window.perfChartInstance) window.perfChartInstance.destroy();
        const centerText = {
            id: 'centerText', beforeDraw: function (chart) {
                var width = chart.width, height = chart.height, ctx = chart.ctx;
                ctx.restore(); ctx.font = "800 24px Nunito"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
                var text = perfData && perfData.length ? perfData[0] + "%" : "0%", textX = Math.round((width - ctx.measureText(text).width) / 2), textY = height / 2;
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
        if (ctxAEl.parentElement) {
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
                labels: attLabels, // Now strictly using dynamic week days
                datasets: [{
                    label: 'Time Spent', data: attData, borderColor: '#ffffff', backgroundColor: gradient,
                    borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#ffffff', pointBorderWidth: 1, pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 12 } } },
                    y: { display: false }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        displayColors: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 13 },
                        bodyFont: { size: 14, weight: 'bold' },
                        callbacks: {
                            label: function (context) {
                                return context.parsed.y + ' hrs';
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                }
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

// ==========================================
// TASK SCHEDULING LOGIC (DASHBOARD)
// ==========================================

window.dashboardAllSchedules = {};
window.dashboardUserId = null;

async function loadDashboardSchedule() {
    const userString = localStorage.getItem('user');
    if (!userString) return;

    const user = JSON.parse(userString);
    window.dashboardUserId = user.id || user.user_id;

    if (!window.dashboardUserId) {
        console.error("No user ID found for dashboard schedule.");
        return;
    }

    const todayContainer = document.getElementById('dashboard-today-list');
    const futureContainer = document.getElementById('dashboard-future-list');

    const today = new Date();
    const todayStr = [
        today.getFullYear(),
        (today.getMonth() + 1).toString().padStart(2, '0'),
        today.getDate().toString().padStart(2, '0')
    ].join('-');

    try {
        const response = await fetch(`/api/get-schedule/${window.dashboardUserId}`);
        const data = await response.json();

        if (data.status === "success" && data.schedule) {
            window.dashboardAllSchedules = data.schedule;

            let todayTasks = [];
            let futureTasks = [];

            for (const [taskDate, tasksArray] of Object.entries(window.dashboardAllSchedules)) {
                if (taskDate === todayStr) {
                    todayTasks = tasksArray.map((task, idx) => ({
                        ...task,
                        date: taskDate,
                        originalIndex: idx
                    }));
                } else if (taskDate > todayStr) {
                    tasksArray.forEach((task, idx) => {
                        futureTasks.push({
                            date: taskDate,
                            originalIndex: idx,
                            name: task.name,
                            timeString: task.timeString,
                            isDone: task.isDone
                        });
                    });
                }
            }

            futureTasks.sort((a, b) => a.date.localeCompare(b.date));

            if (todayContainer) {
                if (todayTasks.length === 0) {
                    todayContainer.innerHTML = '<p style="opacity: 0.6; font-size: 14px; text-align: center; margin: 10px 0;">No tasks scheduled for today. Take a break!</p>';
                } else {
                    todayContainer.innerHTML = todayTasks.map(t => {
                        const checkColor = t.isDone ? '#2ed573' : 'rgba(255,255,255,0.4)';
                        return `
                        <div class="timeline-item" style="${t.isDone ? 'opacity: 0.4; text-decoration: line-through;' : ''}">
                            <div class="time-dot" style="background: ${t.isDone ? '#2ed573' : 'var(--text-white)'};"></div>
                            <div style="flex-grow: 1;">
                                <h4 style="font-size:15px; margin-bottom:2px;">${t.name}</h4>
                                <span style="font-size:12px; opacity:0.7;">${t.timeString}</span>
                            </div>
                            <div style="display: flex; gap: 15px; align-items: center; margin-left: 10px;">
                                <button onclick="toggleDashboardTask('${t.date}', ${t.originalIndex})" title="Mark as Done" style="background:none; border:none; color:${checkColor}; cursor:pointer; font-size: 18px; transition: 0.3s;">
                                    <i class="fa-solid fa-circle-check"></i>
                                </button>
                                <button onclick="deleteDashboardTask('${t.date}', ${t.originalIndex})" title="Remove Task" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size: 16px; transition: 0.3s;">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    `}).join('');
                }
            }

            if (futureContainer) {
                if (futureTasks.length === 0) {
                    futureContainer.innerHTML = '<p style="opacity: 0.6; font-size: 14px; text-align: center; margin: 10px 0;">No upcoming tasks. You are all caught up!</p>';
                } else {
                    futureContainer.innerHTML = futureTasks.map(t => {
                        const dateObj = new Date(t.date);
                        const prettyDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const checkColor = t.isDone ? '#2ed573' : 'rgba(255,255,255,0.4)';

                        return `
                        <div class="timeline-item" style="opacity: 0.9; ${t.isDone ? 'text-decoration: line-through; opacity: 0.4;' : ''}">
                            <div class="time-dot" style="background: transparent; border: 2px solid #c5a668;"></div>
                            
                            <div style="flex-grow: 1;">
                                <h4 style="font-size:15px; margin-bottom:2px; color: #e2e8f0;">${t.name}</h4>
                                <span style="font-size:12px; opacity:0.7;">${t.timeString}</span>
                            </div>
                            
                            <div style="font-size: 12px; font-weight: bold; background: rgba(197, 166, 104, 0.2); color: #f1c40f; padding: 5px 10px; border-radius: 6px; white-space: nowrap;">
                                ${prettyDate}
                            </div>

                            <div style="display: flex; gap: 15px; align-items: center; margin-left: 15px;">
                                <button onclick="toggleDashboardTask('${t.date}', ${t.originalIndex})" title="Mark as Done" style="background:none; border:none; color:${checkColor}; cursor:pointer; font-size: 18px; transition: 0.3s;">
                                    <i class="fa-solid fa-circle-check"></i>
                                </button>
                                <button onclick="deleteDashboardTask('${t.date}', ${t.originalIndex})" title="Remove Task" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size: 16px; transition: 0.3s;">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            }

        }
    } catch (error) {
        console.error("Error fetching dashboard schedule:", error);
        if (todayContainer) todayContainer.innerHTML = '<p style="color:#ff4757; text-align:center;">Failed to load schedule.</p>';
    }
}

window.toggleDashboardTask = function (dateStr, index) {
    window.deleteDashboardTask(dateStr, index);
};

window.deleteDashboardTask = function (dateStr, index) {
    if (!window.dashboardAllSchedules[dateStr]) return;
    window.dashboardAllSchedules[dateStr].splice(index, 1);
    if (window.dashboardAllSchedules[dateStr].length === 0) {
        delete window.dashboardAllSchedules[dateStr];
    }
    syncDashboardSchedule(window.dashboardUserId, window.dashboardAllSchedules);
    loadDashboardSchedule();
};

function syncDashboardSchedule(userId, scheduleData) {
    fetch('/api/update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, schedule: scheduleData })
    })
        .then(response => response.json())
        .catch(error => console.error("Error saving dashboard schedule to db:", error));
}

loadDashboardSchedule();

// ==========================================
// SMART RECOMMENDATIONS LOGIC
// ==========================================
function loadSmartRecommendations() {
    const recContainer = document.getElementById('smart-recommendations-list');
    if (!recContainer) return;

    const recommendations = [
        {
            title: "Start a Focus Session",
            desc: "You have pending tasks. Start a 25-minute Pomodoro timer to knock them out.",
            icon: "fa-stopwatch",
            color: "#ff4757",
            link: "focus.html"
        },
        {
            title: "Take a Practice Quiz",
            desc: "Boost your retention by taking a quick quiz on your recent subjects.",
            icon: "fa-clipboard-question",
            color: "#6366f1",
            link: "quiz-dashboard.html"
        },
        {
            title: "Join Group Study",
            desc: "Collaborate and discuss complex topics with your peers in a study room.",
            icon: "fa-users",
            color: "#2ed573",
            link: "group-study.html"
        }
    ];

    recContainer.innerHTML = recommendations.map(rec => `
        <div style="display: flex; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; transition: 0.3s; cursor: pointer;" 
             onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.transform='translateX(5px)';" 
             onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.transform='translateX(0)';" 
             onclick="window.location.href='${rec.link}'">
             
            <div style="width: 45px; height: 45px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${rec.color}; margin-right: 15px; flex-shrink: 0;">
                <i class="fa-solid ${rec.icon}"></i>
            </div>
            
            <div style="flex-grow: 1;">
                <h4 style="margin: 0 0 5px 0; font-size: 15px; color: #e2e8f0;">${rec.title}</h4>
                <p style="margin: 0; font-size: 12px; color: #cbd5e1; opacity: 0.8; line-height: 1.4;">${rec.desc}</p>
            </div>
            
            <i class="fa-solid fa-chevron-right" style="color: rgba(255,255,255,0.3); font-size: 14px; margin-left: 10px;"></i>
        </div>
    `).join('');
}

loadSmartRecommendations();

function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'logout-link' || e.target.id === 'logout-icon' || e.target.closest('#logout-link')) { logout(); }
});