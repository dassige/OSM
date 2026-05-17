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

    // ── Capture install prompt globally (all pages) ──────────────────────────
    // Stored on window so the About modal can trigger it from any page.
    window.__pwaInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        window.__pwaInstallPrompt = e;
        // Notify the About modal if it's already open
        var btn = document.getElementById('pwa-about-install-btn');
        if (btn) btn.style.display = 'inline-flex';
        // Attempt to show the banner (no-op if conditions aren't met)
        tryShowBanner();
    });

    window.addEventListener('appinstalled', function () {
        window.__pwaInstallPrompt = null;
        removeBanner();
        var btn = document.getElementById('pwa-about-install-btn');
        if (btn) btn.style.display = 'none';
    });

    // ── Install Banner ───────────────────────────────────────────────────────
    // Only show on the dashboard (index), only once per session, not if already installed.
    var isIndexPage = window.location.pathname === '/' ||
                      window.location.pathname === '/index.html' ||
                      window.location.pathname.endsWith('/index.html');

    var isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true;

    var bannerSuppressed = isInstalled ||
                           !isIndexPage ||
                           sessionStorage.getItem('pwa-install-offered') === 'true' ||
                           localStorage.getItem('pwa-install-dismissed') === 'true';

    var appName = 'OpReady'; // fallback; overwritten by ui-config fetch below
    var configReady = false;

    // Fetch app name from ui-config (same source every other page uses)
    fetch('/ui-config')
        .then(function (r) { return r.json(); })
        .then(function (cfg) { if (cfg.loginTitle) appName = cfg.loginTitle; })
        .catch(function () {})
        .finally(function () {
            configReady = true;
            // If the install prompt already fired while we were fetching, show now
            if (window.__pwaInstallPrompt) tryShowBanner();
        });

    function tryShowBanner() {
        if (bannerSuppressed) return;
        if (!configReady) return; // wait for app name
        if (!window.__pwaInstallPrompt) return;
        showBanner();
    }

    function showBanner() {
        if (document.getElementById('pwa-install-banner')) return;
        // Mark as offered for this session — won't re-appear on subsequent page visits
        sessionStorage.setItem('pwa-install-offered', 'true');

        var banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.setAttribute('role', 'banner');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML =
            '<div class="pwa-banner-content">' +
                '<img src="/icons/icon-72.png" alt="' + appName + ' icon" class="pwa-banner-icon" onerror="this.style.display=\'none\'">' +
                '<div class="pwa-banner-text">' +
                    '<strong>Install ' + appName + '</strong>' +
                    '<span>Add to your home screen for quick access</span>' +
                '</div>' +
                '<div class="pwa-banner-actions">' +
                    '<button id="pwa-install-btn" class="pwa-btn-install">Install</button>' +
                    '<button id="pwa-dismiss-btn" class="pwa-btn-dismiss" aria-label="Dismiss install banner">&#x2715;</button>' +
                '</div>' +
            '</div>';

        document.body.insertBefore(banner, document.body.firstChild);

        document.getElementById('pwa-install-btn').addEventListener('click', function () {
            triggerPwaInstall(function () { removeBanner(); });
        });

        document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
            removeBanner();
            localStorage.setItem('pwa-install-dismissed', 'true');
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

    // ── Shared install trigger (used by banner + About modal) ────────────────
    window.triggerPwaInstall = function (onAccepted) {
        var prompt = window.__pwaInstallPrompt;
        if (!prompt) return;
        prompt.prompt();
        prompt.userChoice.then(function (result) {
            window.__pwaInstallPrompt = null;
            if (result.outcome === 'accepted') {
                localStorage.removeItem('pwa-install-dismissed');
                if (typeof onAccepted === 'function') onAccepted();
            }
        });
    };
})();
