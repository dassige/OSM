
 // Fetch UI Config
        fetch('/ui-config')
            .then(response => response.json())
            .then(config => {
                if (config.loginTitle) {
                    document.getElementById('loginTitle').textContent = config.loginTitle;
                    document.title = config.loginTitle + " - Login";
                }
                if (config.version) {
                    document.getElementById('disp-version').textContent = config.version;
                }
                if (config.loginLogo) {
                    const logoImg = document.getElementById('loginLogo');
                    logoImg.src = config.loginLogo;
                    logoImg.style.display = 'block';
                }
                if (config.appBackground) {
                    document.body.style.backgroundImage = `url('${config.appBackground}')`;
                }
                // [NEW] Check for Demo Mode
                if (config.appMode === 'demo') {
                    document.getElementById('demoBanner').style.display = 'block';
                    document.getElementById('demoLink').style.display = 'block';
                }
            })
            .catch(err => console.error("Failed to load UI config:", err));



        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('errorMsg');

            btn.disabled = true;
            btn.textContent = "Signing In...";
            errorMsg.style.display = 'none';

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    window.location.href = '/';
                    sessionStorage.removeItem('hasShownReviewModal');
                } else {
                    // [NEW] Extract the specific error message from the backend response
                    const data = await response.json();

                    if (response.status === 403) {
                        // [NEW] Handle specific security status messages
                        if (data.error && data.error.includes("disabled")) {
                            errorMsg.textContent = "User DISABLED";
                        } else if (data.error && data.error.includes("blocked")) {
                            errorMsg.textContent = "User BLOCKED. Contact the administrator";
                        } else {
                            errorMsg.textContent = data.error || "Access Denied";
                        }
                    } else {
                        // Fallback for 401 and other errors
                        errorMsg.textContent = "Invalid credentials";
                    }

                    errorMsg.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = "Sign In";
                }
            } catch (err) {
                console.error(err);
                errorMsg.textContent = "Connection error";
                errorMsg.style.display = 'block';
                btn.disabled = false;
                btn.textContent = "Sign In";
            }
        });
        // Forgot Password Logic
        function openForgotModal() { document.getElementById('forgotModal').style.display = 'block'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }

        // [NEW] Demo Credentials Logic
        async function showDemoCreds() {
            document.getElementById('demoCredsModal').style.display = 'block';
            try {
                const res = await fetch('/api/demo-credentials');
                if (res.ok) {
                    const creds = await res.json();
                    document.getElementById('demoUser').textContent = creds.username;
                    document.getElementById('demoPass').textContent = creds.password;
                } else {
                    document.getElementById('demoUser').textContent = "Error fetching credentials";
                }
            } catch (e) {
                document.getElementById('demoUser').textContent = "Connection Error";
            }
        }

        document.getElementById('forgotForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            const msg = document.getElementById('forgotMsg');
            const btn = e.target.querySelector('button');

            if (!confirm(`Are you sure you want to reset the password for ${email}?`)) return;

            btn.disabled = true;
            btn.textContent = "Sending...";
            msg.style.display = 'none';

            try {
                const res = await fetch('/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await res.json();

                if (res.ok) {
                    showToast('Please check your email for the new password.', 'success');
                    closeModal('forgotModal');
                    document.getElementById('forgotForm').reset();
                } else {
                    msg.textContent = data.error || "Failed to reset password.";
                    msg.style.display = 'block';
                }
            } catch (err) {
                msg.textContent = "Server connection error.";
                msg.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = "Reset Password";
            }
        });

        // Close modal on outside click
        window.onclick = function (event) {
            if (event.target == document.getElementById('forgotModal')) closeModal('forgotModal');
            if (event.target == document.getElementById('demoCredsModal')) closeModal('demoCredsModal');
        }
