// Apply Dark Mode
(function() { if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode'); })();

document.addEventListener("DOMContentLoaded", () => {
    setupCommonElements(); 
    initPomodoroLogic(); 
});

// --- COMMON DASHBOARD LOGIC (Profile & Logout) ---
function setupCommonElements() {
    const userDataString = localStorage.getItem("user");
    if (!userDataString) { window.location.href = "login.html"; return; }

    try {
        const user = JSON.parse(userDataString);
        const displayName = user.full_name || user.email.split('@')[0];
        document.getElementById("profile-name-display").textContent = displayName;
        document.getElementById("profile-img-placeholder").textContent = displayName.charAt(0).toUpperCase();
    } catch (e) { console.error(e); }

    const logout = () => { localStorage.removeItem('isLoggedIn'); localStorage.removeItem('user'); window.location.href = 'login.html'; };
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) logoutLink.addEventListener('click', logout);
}

// --- POMODORO TIMER LOGIC ---
let totalTime = 25 * 60; // 25 minutes
let timeLeft = 25 * 60;
let timerId = null;
let isRunning = false;
let currentMode = 'focus'; 
let roundsCompleted = 0;

function initPomodoroLogic() {
    const ringContainer = document.getElementById('timer-ring');
    const timerDisplay = document.getElementById('timer-display');
    const timerStatus = document.getElementById('timer-status');
    const timerIcon = document.getElementById('timer-icon');
    
    const playPauseBtn = document.getElementById('play-pause-btn');
    const resetBtn = document.getElementById('reset-btn');

    const focusModeBtn = document.getElementById('mode-focus');
    const breakModeBtn = document.getElementById('mode-break');
    const roundsCount = document.getElementById('rounds-count');

    // 1. Play / Pause
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (isRunning) {
                // PAUSE
                clearInterval(timerId);
                isRunning = false;
                playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                timerStatus.textContent = "Paused";
            } else {
                // PLAY
                isRunning = true;
                playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                timerStatus.textContent = currentMode === 'focus' ? "Focusing..." : "Relaxing...";

                timerId = setInterval(() => {
                    timeLeft--;
                    updateUI();
                    
                    if (timeLeft <= 0) {
                        clearInterval(timerId);
                        isRunning = false;
                        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                        
                        if (currentMode === 'focus') {
                            roundsCompleted++;
                            roundsCount.textContent = roundsCompleted;
                            timerStatus.textContent = "Session Complete!";
                            setMode('break'); // Auto-switch to break
                        } else {
                            timerStatus.textContent = "Break Over!";
                            setMode('focus'); // Auto-switch back to focus
                        }
                    }
                }, 1000);
            }
        });
    }

    // 2. Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            clearInterval(timerId);
            isRunning = false;
            timeLeft = totalTime;
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            timerStatus.textContent = "Paused";
            updateUI();
        });
    }

    // 3. Mode Toggles
    if (focusModeBtn) focusModeBtn.addEventListener('click', () => { if(currentMode !== 'focus') setMode('focus'); });
    if (breakModeBtn) breakModeBtn.addEventListener('click', () => { if(currentMode !== 'break') setMode('break'); });

    // Helper: Update UI text and ring percentage
    function updateUI() {
        let m = Math.floor(timeLeft / 60);
        let s = timeLeft % 60;
        timerDisplay.textContent = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;

        let percentage = (timeLeft / totalTime) * 100;
        ringContainer.style.setProperty('--progress', `${percentage}%`);
    }

    // Helper: Switch between Focus/Break colors
    function setMode(mode) {
        currentMode = mode;
        clearInterval(timerId);
        isRunning = false;
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        timerStatus.textContent = "Paused";

        if (mode === 'focus') {
            totalTime = 25 * 60;
            ringContainer.style.setProperty('--ring-color', '#5a5ce6'); 
            playPauseBtn.style.background = '#5a5ce6';
            timerIcon.className = 'fa-solid fa-person-praying';
            timerIcon.style.color = '#5a5ce6';
            focusModeBtn.classList.add('active');
            breakModeBtn.classList.remove('active');
        } else {
            totalTime = 5 * 60; 
            ringContainer.style.setProperty('--ring-color', '#1dd1a1'); 
            playPauseBtn.style.background = '#1dd1a1';
            timerIcon.className = 'fa-solid fa-mug-hot';
            timerIcon.style.color = '#1dd1a1';
            breakModeBtn.classList.add('active');
            focusModeBtn.classList.remove('active');
        }
        
        timeLeft = totalTime;
        updateUI();
    }
}