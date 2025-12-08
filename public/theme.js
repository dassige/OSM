// public/theme.js

(function() {
    // 1. Apply theme immediately on load to prevent "flash of white"
    // We check LocalStorage (instant) before waiting for the Server (async)
    const savedTheme = localStorage.getItem('theme_dark_mode');
    if (savedTheme === 'true') {
        document.body.classList.add('dark-mode');
    }

    // 2. Wait for Socket.IO to load
    // We use a small interval to ensure 'socket' is defined from the main app
    const initThemeSync = () => {
        if (typeof socket === 'undefined') {
            // If socket isn't global yet, wait a bit (e.g. if loaded before app.js)
            setTimeout(initThemeSync, 50); 
            return;
        }

        // Listen for server-side preference updates (cross-device sync)
        socket.on('preferences-data', (prefs) => {
            const isDark = prefs.theme_dark_mode === true || prefs.theme_dark_mode === 'true';
            
            // Sync LocalStorage
            localStorage.setItem('theme_dark_mode', isDark);
            
            // Apply to Body
            if (isDark) document.body.classList.add('dark-mode');
            else document.body.classList.remove('dark-mode');
            
            // Update Toggle Switch UI (only if it exists on this page)
            const toggle = document.getElementById('darkModeToggle');
            if (toggle) toggle.checked = isDark;
        });
        
        // Ask server for latest prefs
        socket.emit('get-preferences');
    };

    // Start checking for socket
    initThemeSync();

    // 3. Expose the Toggle Function globally so the HTML checkbox can call it
    window.toggleDarkMode = function(isChecked) {
        // Optimistic UI update (Instant)
        if (isChecked) document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');

        // Save to LocalStorage
        localStorage.setItem('theme_dark_mode', isChecked);

        // Save to Database (via Socket)
        if (typeof socket !== 'undefined') {
            socket.emit('update-preference', { key: 'theme_dark_mode', value: isChecked });
        }
    };
})();