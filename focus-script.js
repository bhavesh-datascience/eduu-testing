// Apply Dark Mode immediately if saved
(function() { 
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
})();

document.addEventListener("DOMContentLoaded", () => {
    setupCommonElements(); 
    initReadonlySchedule(); 
});

// --- COMMON DASHBOARD LOGIC (Profile & Logout) ---
function setupCommonElements() {
    const userDataString = localStorage.getItem("user");
    
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

// --- READ-ONLY SCHEDULE LOGIC (Strictly ID-based) ---
async function initReadonlySchedule() {
    const scheduleContainer = document.getElementById('schedule-list-container');
    if (!scheduleContainer) return;

    const userString = localStorage.getItem("user");
    if (!userString) return;
    
    const user = JSON.parse(userString);
    
    // 1. STRICTLY GRAB UNIQUE ID
    const userId = user.id;

    if (!userId) {
        scheduleContainer.innerHTML = '<p style="text-align:center; color:#ff4757; font-size:14px; margin-top:30px;">Session Error: Please log out and log back in.</p>';
        return; 
    }

    // 2. Figure out what "Today" is
    const today = new Date();
    let m = today.getMonth() + 1;
    let d = today.getDate();
    const todayStr = `${today.getFullYear()}-${m < 10 ? '0'+m : m}-${d < 10 ? '0'+d : d}`;

    // 3. Fetch from FastAPI Backend using ID
    let allSchedules = {};
    try {
        const response = await fetch(`http://localhost:8000/api/get-schedule/${userId}`);
        const data = await response.json();
        if (data.status === "success" && data.schedule) {
            allSchedules = data.schedule; 
        }
    } catch (error) {
        console.error("Error fetching schedule from DB:", error);
    }

    // 4. Render only today's tasks
    let todaysSchedule = allSchedules[todayStr] || [];
    scheduleContainer.innerHTML = ''; 

    if (todaysSchedule.length === 0) {
        scheduleContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:14px; margin-top:30px;">Your schedule is clear for today. Click below to add tasks!</p>';
        return;
    }

    todaysSchedule.forEach((task, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        // First item gets a solid white dot, the rest are slightly transparent
        const dotStyle = index === 0 ? 'background: var(--text-white);' : 'background: rgba(255,255,255,0.3);';
        
        // No delete buttons here, just a clean list
        item.innerHTML = `
            <div class="time-dot" style="${dotStyle}"></div>
            <div style="flex-grow: 1;">
                <h4 style="font-size:16px; font-weight:700; margin-bottom:4px;">${task.name}</h4>
                <span style="font-size:13px; opacity:0.7;">${task.timeString}</span>
            </div>
        `;
        scheduleContainer.appendChild(item);
    });
}