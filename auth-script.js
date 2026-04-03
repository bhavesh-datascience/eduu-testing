// Apply Dark Mode immediately if saved
(function () {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
})();

document.addEventListener("DOMContentLoaded", () => {
    initializePasswordToggle();
    initializePasswordStrength();
    initializeFormValidation();
});

// Toggle Password Visibility
function initializePasswordToggle() {
    const passwordToggles = document.querySelectorAll(".password-toggle");
    passwordToggles.forEach((toggle) => {
        toggle.addEventListener("click", function () {
            const passwordInput = this.previousElementSibling;
            const icon = this.querySelector("i");
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                icon.className = "fas fa-eye-slash";
            } else {
                passwordInput.type = "password";
                icon.className = "fas fa-eye";
            }
        });
    });
}

// Password Strength Meter
function initializePasswordStrength() {
    const passwordInput = document.getElementById("password");
    if (!passwordInput) return;

    const strengthSegments = document.querySelectorAll(".strength-segment");
    const strengthText = document.querySelector(".strength-text");

    passwordInput.addEventListener("input", function () {
        const password = this.value;
        let strength = 0;

        if (password.length >= 8) strength += 1;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength += 1;
        if (password.match(/[0-9]/) || password.match(/[^a-zA-Z0-9]/)) strength += 1;
        if (password.length >= 12) strength += 1;

        strengthSegments.forEach((segment, index) => {
            segment.className = "strength-segment";
            if (index < strength) {
                if (strength === 1) segment.classList.add("weak");
                else if (strength === 2) segment.classList.add("medium");
                else segment.classList.add("strong");
            }
        });

        if (password.length === 0) {
            strengthText.textContent = "Password strength";
            strengthText.style.color = "";
        } else if (strength === 1) {
            strengthText.textContent = "Weak"; strengthText.style.color = "#ff4757";
        } else if (strength === 2) {
            strengthText.textContent = "Medium"; strengthText.style.color = "#ffa502";
        } else {
            strengthText.textContent = "Strong"; strengthText.style.color = "#2ed573";
        }
    });
}

// Form Submission Logic
function initializeFormValidation() {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");

    // LOGIN LOGIC
    if (loginForm) {
        loginForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const formData = {
                email: document.getElementById("email").value,
                password: document.getElementById("password").value
            };

            processAuthentication(loginForm, "/api/login", formData, "Login");
        });
    }

    // SIGNUP LOGIC
    if (signupForm) {
        signupForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const username = document.getElementById("username").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            // --- NEW FRONTEND VALIDATION CHECKS ---
            if (username.length < 2) {
                alert("Username must be at least 2 characters long.");
                return;
            }
            if (password.length < 8) {
                alert("Password must be at least 8 characters long.");
                return;
            }
            if (password !== confirmPassword) {
                alert("Passwords do not match!");
                return;
            }

            const formData = {
                username: username,
                email: email,
                password: password
            };

            processAuthentication(signupForm, "/api/signup", formData, "Signup");
        });
    }
}

// Backend Communication
function processAuthentication(form, endpoint, formData, type) {
    const submitButton = form.querySelector("button[type='submit']");
    const originalBtnText = submitButton.textContent;

    submitButton.textContent = "Processing...";
    submitButton.disabled = true;

    // Use relative path so it works on localhost AND Render dynamically
    fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
    })
        .then(response => response.json().then(data => ({ status: response.status, body: data })))
        .then(res => {
            if (res.status >= 200 && res.status < 300) {
                // SUCCESS: Details are correct, save user data
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("user", JSON.stringify(res.body.user));

                // --- FIX: Save user_id and user_email for the Gamification Quiz ---
                if (res.body.user && res.body.user.id) {
                    localStorage.setItem("user_id", res.body.user.id);
                }
                if (res.body.user && res.body.user.email) {
                    localStorage.setItem("user_email", res.body.user.email);
                }

                // ROUTING LOGIC: Signup goes to details, Login goes to dashboard
                if (type === "Signup") {
                    window.location.href = "details.html";
                } else {
                    window.location.href = "dashboard.html";
                }
            } else {
                // FAILURE: Display the requested alert for wrong credentials
                if (type === "Login" && res.status === 401) {
                    alert("Wrong username or password");
                } else if (res.status === 422) {
                    alert("Validation Error: Please ensure your password is at least 8 characters long and you have entered a valid email.");
                } else {
                    alert(res.body.detail || "An error occurred. Please try again.");
                }

                // Reset button
                submitButton.textContent = originalBtnText;
                submitButton.disabled = false;
            }
        })
        .catch(error => {
            alert("Server connection failed. Is the backend running?");
            submitButton.textContent = originalBtnText;
            submitButton.disabled = false;
            console.error("Error:", error);
        });
}