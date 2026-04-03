// --- GLOBAL LOGOUT LOGIC ---
window.logout = function() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user'); 
    window.location.href = 'login.html';
};

// Catch clicks on ANY logout button (sidebar or top header)
document.addEventListener('click', (e) => {
    if (e.target.id === 'logout-link' || 
        e.target.id === 'logout-icon' || 
        e.target.closest('#logout-link') || 
        e.target.closest('#logout-icon')) {
        
        e.preventDefault(); // Stops the page from jumping to the top
        window.logout();
    }
});