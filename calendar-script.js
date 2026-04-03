// Apply Dark Mode immediately if saved
(function() { 
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
})();

document.addEventListener("DOMContentLoaded", () => {
    setupCommonElements(); 
    initCalendarLogic(); 
});

// --- COMMON DASHBOARD LOGIC (Profile & Logout) ---
function setupCommonElements() {
    const userDataString = localStorage.getItem("user");
    
    // Redirect to login if not authenticated
    if (!userDataString) { 
        window.location.href = "login.html"; 
        return; 
    }
    
    try {
        const user = JSON.parse(userDataString);
        const displayName = user.full_name || user.email.split('@')[0];
        const profileNameEl = document.getElementById("profile-name-display");
        const profileImgPlaceholder = document.getElementById("profile-img-placeholder");
        
        if (profileNameEl) profileNameEl.textContent = displayName;
        if (profileImgPlaceholder) profileImgPlaceholder.textContent = displayName.charAt(0).toUpperCase();
    } catch (e) { 
        console.error("Error setting up profile:", e); 
    }
    
    // Setup Logout
    const logout = () => { 
        localStorage.removeItem('isLoggedIn'); 
        localStorage.removeItem('user'); 
        window.location.href = 'login.html'; 
    };
    
    const logoutLink = document.getElementById('logout-link');
    const logoutIcon = document.getElementById('logout-icon');
    
    if (logoutLink) logoutLink.addEventListener('click', logout);
    if (logoutIcon) logoutIcon.addEventListener('click', logout);
}

// --- CALENDAR MANAGEMENT LOGIC (Strictly ID-based) ---
async function initCalendarLogic() {
    const userString = localStorage.getItem("user");
    if (!userString) return;
    
    const user = JSON.parse(userString);
    
    // 1. STRICTLY GRAB THE PRIMARY KEY ID
    const userId = user.id || user.user_id; 
    
    if (!userId) {
        console.error("No User ID found! Please log out and log back in.");
        document.getElementById('full-schedule-list-container').innerHTML = 
            '<p style="text-align:center; color:#ff4757;">Session Error: Please log out and log back in to manage your schedule.</p>';
        return;
    }

    const taskNameInput = document.getElementById('task-name');
    const taskStartInput = document.getElementById('task-start');
    const taskEndInput = document.getElementById('task-end');
    const addTaskBtn = document.getElementById('add-task-btn');
    const scheduleContainer = document.getElementById('full-schedule-list-container');
    const titleEl = document.getElementById('schedule-date-title');

    // 2. Figure out which date was clicked from the Dashboard
    const urlParams = new URLSearchParams(window.location.search);
    let selectedDate = urlParams.get('date');
    
    if (!selectedDate) {
        const today = new Date();
        let m = today.getMonth() + 1;
        let d = today.getDate();
        selectedDate = `${today.getFullYear()}-${m < 10 ? '0'+m : m}-${d < 10 ? '0'+d : d}`;
    }

    const dateObj = new Date(selectedDate);
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    if (titleEl) titleEl.textContent = `Schedule for ${dateObj.toLocaleDateString('en-US', options)}`;

    // Define these globally within this function so all helpers can use them
    let allSchedules = {};
    let currentDaySchedule = [];

    // Helper: Convert 24hr to 12hr AM/PM format
    function formatTime12h(time24) {
        if (!time24) return '';
        let [hours, minutes] = time24.split(':');
        hours = parseInt(hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12; 
        return `${hours < 10 ? '0'+hours : hours}:${minutes} ${ampm}`;
    }

    // Draw the list on the screen
    function renderFullSchedule() {
        if (!scheduleContainer) return;
        scheduleContainer.innerHTML = ''; 

        if (currentDaySchedule.length === 0) {
            scheduleContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:14px; margin-top: 20px;">No tasks added yet. Create your first task above!</p>';
            return;
        }

        currentDaySchedule.forEach((task, index) => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            const dotStyle = index === 0 ? 'background: var(--text-white);' : 'background: rgba(255,255,255,0.3);';
            
            item.innerHTML = `
                <div class="time-dot" style="${dotStyle}"></div>
                <div style="flex-grow: 1;">
                    <h4 style="font-size:16px; font-weight:700; margin-bottom:4px;">${task.name}</h4>
                    <span style="font-size:13px; opacity:0.7;">${task.timeString}</span>
                </div>
                <button class="delete-task-btn" onclick="deleteTask(${index})" title="Remove Task">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            scheduleContainer.appendChild(item);
        });
    }

    // 3. FETCH ACTUAL DATA FROM DATABASE USING ID (WAIT FOR IT!)
    try {
        const response = await fetch(`http://localhost:8000/api/get-schedule/${userId}`);
        const data = await response.json();
        
        if (data.status === "success" && data.schedule) {
            allSchedules = data.schedule; 
        }
    } catch (error) {
        console.error("Error fetching schedule from DB:", error);
    }

    // 🌟 THE FIX: We only grab the specific day's tasks AFTER the fetch is completely done!
    currentDaySchedule = allSchedules[selectedDate] || [];
    
    // Initial draw on page load (NOW it has the data)
    renderFullSchedule();

    // 4. DELETING A TASK (Syncs to DB)
    window.deleteTask = function(index) {
        currentDaySchedule.splice(index, 1); 
        allSchedules[selectedDate] = currentDaySchedule; 
        
        syncScheduleToBackend(userId, allSchedules); 
        renderFullSchedule(); 
    };

    // 5. ADDING A TASK (Syncs to DB)
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            const name = taskNameInput.value.trim();
            const start = taskStartInput.value;
            const end = taskEndInput.value;

            if (!name || !start || !end) {
                alert("Please fill in the task name and both start and end times!");
                return;
            }

            const timeString = `${formatTime12h(start)} - ${formatTime12h(end)}`;
            
            // Push to our local array, update the master object, and save
            currentDaySchedule.push({ name, timeString });
            allSchedules[selectedDate] = currentDaySchedule;
            
            syncScheduleToBackend(userId, allSchedules); 
            
            // Clear inputs for the next task
            taskNameInput.value = '';
            taskStartInput.value = '';
            taskEndInput.value = '';
            
            renderFullSchedule();
        });
    }
}

// --- HELPER FUNCTION TO SEND DATA TO FASTAPI ---
function syncScheduleToBackend(userId, scheduleData) {
    fetch('http://localhost:8000/api/update-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, schedule: scheduleData })
    })
    .then(response => response.json())
    .then(data => console.log("Success:", data.message))
    .catch(error => console.error("Error saving to db:", error));
}