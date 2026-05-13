/* OpReady PWA — Service Worker registration + Install banner */
(function () {
    'use strict';

    // ── Service Worker Registration ──────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(function (reg) {
                    // Check for SW updates every hour
                    setInterval(function () { reg.update(); }, 3600000);
                })
                .catch(function (err) {
                    console.warn('[PWA] Service worker registration failed:', err);
                });
        });
    }

    // ── Install Banner ───────────────────────────────────────────────────────
    // Don't show on the login page — user isn't in the app yet
    var isLoginPage = window.location.pathname === '/login.html' ||
                      window.location.pathname.endsWith('/login.html');
    if (isLoginPage) return;

    // Don't show if already running as installed PWA
    var isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true;
    if (isInstalled) return;

    // Don't re-show if permanently dismissed
    if (localStorage.getItem('pwa-install-dismissed') === 'true') return;

    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        showBanner();
    });

    // Detect when installed from outside the banner
    window.addEventListener('appinstalled', function () {
        removeBanner();
        deferredPrompt = null;
    });

    function showBanner() {
        if (document.getElementById('pwa-install-banner')) return;

        var banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.setAttribute('role', 'banner');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML =
            '<div class="pwa-banner-content">' +
                '<img src="/icons/icon-72.png" alt="OpReady icon" class="pwa-banner-icon" onerror="this.style.display=\'none\'">' +
                '<div class="pwa-banner-text">' +
                    '<strong>Install OpReady</strong>' +
                    '<span>Add to your home screen for quick access — works offline too.</span>' +
                '</div>' +
                '<div class="pwa-banner-actions">' +
                    '<button id="pwa-install-btn" class="pwa-btn-install">Install</button>' +
                    '<button id="pwa-dismiss-btn" class="pwa-btn-dismiss" aria-label="Dismiss install banner">&#x2715;</button>' +
                '</div>' +
            '</div>';

        document.body.insertBefore(banner, document.body.firstChild);

        document.getElementById('pwa-install-btn').addEventListener('click', function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function (result) {
                if (result.outcome === 'accepted') {
                    removeBanner();
                }
                deferredPrompt = null;
            });
        });

        document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
            removeBanner();
            // Remember dismissal per-session only (not permanent)
        });
    }

    function removeBanner() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) {
            banner.classList.add('pwa-banner-hiding');
            setTimeout(function () {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            }, 300);
        }
    }
})();
