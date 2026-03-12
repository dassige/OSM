// public/toast.js

(function() {
    // 1. Create Container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // 2. Define Icons (SVG strings)
    const icons = {
        success: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        error: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        info: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
    };

    // 3. Expose Global Function
    window.showToast = function(message, type = 'info', duration = 4000) {
        // Create Toast Element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Structure: Icon + Message
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${message}</div>
            <div class="toast-close">&times;</div>
        `;

        // Add to DOM
        const container = document.getElementById('toast-container');
        container.appendChild(toast);

        // Trigger Animation (slight delay to allow DOM render)
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Close Logic
        const removeToast = () => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300); // Wait for fade out animation
        };

        // Auto-remove
        let timer = setTimeout(removeToast, duration);

        // Click to close
        toast.querySelector('.toast-close').onclick = () => {
            clearTimeout(timer);
            removeToast();
        };
    };
})();