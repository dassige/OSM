// public/utils.js

/**
 * Injects the Confirm Modal HTML/CSS into the page if not present.
 */
(function setupConfirmModal() {
    if (document.getElementById('customConfirmModal')) return;

    // Define CSS for the modal specifically
    const style = document.createElement('style');
    style.innerHTML = `
        #customConfirmModal {
            display: none;
            position: fixed;
            z-index: 10500;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
            align-items: center;
            justify-content: center;
        }
        #customConfirmModal[style*="display: flex"],
        #customConfirmModal[style*="display:flex"] {
            display: flex !important;
        }
        #customConfirmModal .modal-content {
            background-color: var(--bg-card, #fff);
            color: var(--text-main, #333);
            margin: 0;
            padding: 25px;
            border: 1px solid var(--border-color, #ddd);
            width: 90%;
            max-width: 400px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .confirm-btn-group { text-align: right; margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; }
        .confirm-btn { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; font-size: 14px; }
        .confirm-btn-cancel { background: #6c757d; color: white; }
        .confirm-btn-cancel:hover { background: #5a6268; }
        .confirm-btn-ok { background: var(--primary, #007bff); color: white; }
        .confirm-btn-ok:hover { opacity: 0.9; }
    `;
    document.head.appendChild(style);

    // Define HTML
    const div = document.createElement('div');
    div.id = 'customConfirmModal';
    div.innerHTML = `
        <div class="modal-content">
            <h3 id="confirmTitle" style="margin-top:0; font-size:1.25rem;">Confirm</h3>
            <p id="confirmMessage" style="color: var(--text-muted, #666); line-height: 1.5; margin: 15px 0;"></p>
            <div class="confirm-btn-group">
                <button id="btnConfirmCancel" class="confirm-btn confirm-btn-cancel">Cancel</button>
                <button id="btnConfirmYes" class="confirm-btn confirm-btn-ok">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
})();

// --- CUSTOM PROMPT MODAL LOGIC ---
(function setupPromptModal() {
    if (document.getElementById('customPromptModal')) return;

    const style = document.createElement('style');
    style.innerHTML = `
        #customPromptModal {
            display: none; position: fixed; z-index: 10500; left: 0; top: 0; width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
            align-items: center; justify-content: center;
        }
        #customPromptModal[style*="display: flex"],
        #customPromptModal[style*="display:flex"] { display: flex !important; }
        #customPromptModal .modal-content {
            background-color: var(--bg-card, #fff); color: var(--text-main, #333);
            margin: 0; padding: 25px; border: 1px solid var(--border-color, #ddd); width: 90%; max-width: 400px;
            border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); animation: fadeIn 0.2s ease-out;
        }
        .prompt-input {
            width: 100%; padding: 10px; margin-top: 15px; border: 1px solid var(--border-color); border-radius: 4px;
            background: var(--input-bg); color: var(--text-main); box-sizing: border-box; font-size: 16px;
        }
    `;
    document.head.appendChild(style);

    const div = document.createElement('div');
    div.id = 'customPromptModal';
    div.innerHTML = `
        <div class="modal-content">
            <h3 id="promptTitle" style="margin-top:0; font-size:1.25rem;">Action Required</h3>
            <p id="promptMessage" style="color: var(--text-muted, #666); line-height: 1.5; margin: 15px 0;"></p>
            <input type="text" id="promptInput" class="prompt-input" autocomplete="off">
            <div class="confirm-btn-group">
                <button id="btnPromptCancel" class="confirm-btn confirm-btn-cancel">Cancel</button>
                <button id="btnPromptYes" class="confirm-btn confirm-btn-ok">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
})();

/**
 * Asynchronous replacement for native prompt() requiring specific text matching
 * @param {string} title - The header of the modal
 * @param {string} message - The body text (supports HTML)
 * @param {string} requiredText - The exact text the user must type to enable the confirm button
 * @returns {Promise<boolean>}
 */
window.promptAction = function(title, message, requiredText) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customPromptModal');
        const titleEl = document.getElementById('promptTitle');
        const msgEl = document.getElementById('promptMessage');
        const inputEl = document.getElementById('promptInput');
        const btnYes = document.getElementById('btnPromptYes');
        const btnCancel = document.getElementById('btnPromptCancel');

        titleEl.textContent = title || 'Confirm Action';
        msgEl.innerHTML = message || `Please type <strong>${requiredText}</strong> to proceed.`;
        inputEl.value = '';
        inputEl.placeholder = `Type '${requiredText}'`;
        
        // Disable submit button initially
        btnYes.disabled = true;
        btnYes.style.opacity = '0.5';

        modal.style.display = 'flex';
        inputEl.focus();

        const validateInput = () => {
            if (inputEl.value === requiredText) {
                btnYes.disabled = false;
                btnYes.style.opacity = '1';
                btnYes.classList.add('btn-danger'); // Add danger styling for high-risk prompts
            } else {
                btnYes.disabled = true;
                btnYes.style.opacity = '0.5';
                btnYes.classList.remove('btn-danger');
            }
        };

        inputEl.addEventListener('input', validateInput);

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.onclick = null;
            btnCancel.onclick = null;
            inputEl.removeEventListener('input', validateInput);
            window.removeEventListener('keydown', handleKey);
        };

        const handleKey = (e) => { 
            if (e.key === 'Escape') { cleanup(); resolve(false); } 
            if (e.key === 'Enter' && !btnYes.disabled) { cleanup(); resolve(true); }
        };

        window.addEventListener('keydown', handleKey);

        btnYes.onclick = () => { cleanup(); resolve(true); };
        btnCancel.onclick = () => { cleanup(); resolve(false); };
        
        modal.onclick = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };
    });
};
/**
 * Asynchronous replacement for native confirm()
 * @param {string} title - The header of the modal
 * @param {string} message - The body text
 * @returns {Promise<boolean>}
 */
window.confirmAction = function(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const msgEl = document.getElementById('confirmMessage');
        const btnYes = document.getElementById('btnConfirmYes');
        const btnCancel = document.getElementById('btnConfirmCancel');

        titleEl.textContent = title || 'Confirm Action';
        msgEl.textContent = message || 'Are you sure you want to proceed?';
        modal.style.display = 'flex';

        // Focus the confirm button for accessibility/keyboard usage
        btnYes.focus();

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.onclick = null;
            btnCancel.onclick = null;
            window.removeEventListener('keydown', handleKey);
        };

        const handleKey = (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(false); }
        };

        window.addEventListener('keydown', handleKey);

        btnYes.onclick = () => { cleanup(); resolve(true); };
        btnCancel.onclick = () => { cleanup(); resolve(false); };
        
        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) { cleanup(); resolve(false); }
        };
    });
};
/**
 * Opens a modal by ID and ensures it is visible.
 */
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'block';
    }
};

/**
 * Closes a modal by ID.
 */
window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * Global click-outside listener to close modals
 */
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});
const _GITHUB_REPO = 'https://github.com/dassige/OSM';
let _cachedReleaseUrl = null;

window.resolveReleaseUrl = async function(version) {
    if (_cachedReleaseUrl !== null) return _cachedReleaseUrl;
    try {
        const res = await fetch(
            `https://api.github.com/repos/dassige/OSM/releases/tags/v${version}`,
            { headers: { Accept: 'application/vnd.github+json' } }
        );
        _cachedReleaseUrl = res.ok
            ? `${_GITHUB_REPO}/releases/tag/v${version}`
            : `${_GITHUB_REPO}/releases`;
    } catch (_) {
        _cachedReleaseUrl = `${_GITHUB_REPO}/releases`;
    }
    return _cachedReleaseUrl;
};

window.applyReleaseLink = function(linkEl, url, version) {
    const isSpecific = url.includes('/tag/');
    linkEl.href = url;
    linkEl.textContent = isSpecific ? 'View Release Notes' : 'View All Releases';
    linkEl.title = isSpecific
        ? `View release notes for v${version} on GitHub`
        : `No specific release found for v${version} — view all releases on GitHub`;
};

/**
 * Injects and opens a centralized About Modal
 */
window.showAboutModal = async function() {
    let modal = document.getElementById('globalAboutModal');

    // Create modal if it doesn't exist in DOM
    if (!modal) {
        const config = await (await fetch('/ui-config')).json();
        
        const style = document.createElement('style');
        style.innerHTML = `
            #globalAboutModal .modal-about-logo { max-width: 100px; margin: 0 auto 15px; display: block; }
            .modal-centered-content { text-align: center; max-width: 450px; }
            .modal-credits { margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px; font-size: 0.85em; text-align: left; }
        `;
        document.head.appendChild(style);

        modal = document.createElement('div');
        modal.id = 'globalAboutModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content modal-centered-content">
                <span class="close-btn" onclick="closeModal('globalAboutModal')">&times;</span>
                <img src="${config.loginLogo || 'resources/logo.png'}" alt="App Logo" class="modal-about-logo">
                <h2 style="margin-top: 0;">About</h2>
                <p style="font-size: 1.1em; color: var(--text-muted);">${config.loginTitle}</p>
                <div style="margin: 20px 0; font-size: 0.9em;">
                    <p><strong>Version:</strong> ${config.version}</p>
                    <p><strong>Version Date:</strong> ${config.deployDate}</p>
                    <p><strong>Release Notes:</strong> <a id="globalAboutReleaseLink" href="${_GITHUB_REPO}/releases" target="_blank" rel="noopener" title="View release notes on GitHub">Loading…</a></p>
                </div>
                <div class="modal-credits">
                    <p style="text-align: center; font-weight: bold; margin-bottom: 10px;">Credits</p>
                    <ul style="padding-left: 20px; line-height: 1.6;">
                        <li><strong>Developer:</strong> Gerardo Dassi</li>
                        <li><strong>Stack:</strong> Node.js, SQLite, Litestream</li>
                        <li><strong>Icons:</strong> Feather Icons</li>
                    </ul>
                </div>
                <div class="modal-actions-center" style="gap:10px; flex-wrap:wrap;">
                    <button id="pwa-about-install-btn" class="btn-primary"
                        style="display:none; align-items:center; gap:6px;"
                        onclick="triggerPwaInstall(function(){ document.getElementById('pwa-about-install-btn').style.display='none'; })"
                        title="Install ${config.loginTitle} as an app on this device">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Install App
                    </button>
                    <button onclick="closeModal('globalAboutModal')" class="btn-secondary">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        window.resolveReleaseUrl(config.version).then(function(url) {
            const link = document.getElementById('globalAboutReleaseLink');
            if (link) window.applyReleaseLink(link, url, config.version);
        });
    }

    // Show Install button only when the browser has a pending install prompt and app isn't installed
    var installBtn = document.getElementById('pwa-about-install-btn');
    if (installBtn) {
        var alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                               window.navigator.standalone === true;
        installBtn.style.display =
            (!alreadyInstalled && window.__pwaInstallPrompt) ? 'inline-flex' : 'none';
    }

    modal.style.display = 'block';
};


const RANK_ICONS = {
    'FF': '/assets/ff.png',
    'RFF': '/assets/rff.png',
    'QFF': '/assets/qff.png',
    'SFF': '/assets/sff.png',
    'SO': '/assets/so.png',
    'SSO': '/assets/sso.png'
};
/**
 * Formats a rank string into an HTML layout containing the helmet icon and text.
 * @param {string} rank - The rank string (e.g., 'QFF', 'SO')
 * @returns {string} - HTML string to be injected into the table cell
 */
window.formatRankCell = function(rank) {
    if (!rank || rank === '-') return '-';
    
    const normalizedRank = rank.trim().toUpperCase();
    const iconPath = RANK_ICONS[normalizedRank];
    
    if (iconPath) {
        return `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <img src="${iconPath}" alt="${normalizedRank}" style="width: 26px; height: auto; object-fit: contain;">
                <span style="font-weight: 600; color: var(--primary-purple, #4b0082);">${rank}</span>
            </div>
        `;
    }
    
    // Fallback if the rank doesn't match a known helmet
    return `<span class="badge" style="background:var(--border-color); color:var(--text-main);">${rank}</span>`;
};
/**
 * Injects and manages a global loading spinner overlay
 * @param {string} message - The text to display below the spinner
 */
window.showGlobalSpinner = function(message = "Processing...") {
    let spinnerOverlay = document.getElementById('globalSpinnerOverlay');
    
    // Create the overlay if it doesn't exist in the DOM
    if (!spinnerOverlay) {
        const style = document.createElement('style');
        style.innerHTML = `
            #globalSpinnerOverlay {
                display: none; position: fixed; z-index: 10005; left: 0; top: 0;
                width: 100%; height: 100%; background-color: rgba(0,0,0,0.6);
                backdrop-filter: blur(3px); align-items: center; justify-content: center;
                flex-direction: column; color: white; font-family: sans-serif;
            }
            .custom-spinner {
                width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.3);
                border-radius: 50%; border-top-color: #fff;
                animation: spin 1s ease-in-out infinite; margin-bottom: 15px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);

        spinnerOverlay = document.createElement('div');
        spinnerOverlay.id = 'globalSpinnerOverlay';
        spinnerOverlay.innerHTML = `
            <div class="custom-spinner"></div>
            <div id="globalSpinnerText" style="font-size: 1.2rem; font-weight: 500;"></div>
        `;
        document.body.appendChild(spinnerOverlay);
    }
    
    // Set message and display
    document.getElementById('globalSpinnerText').innerText = message;
    spinnerOverlay.style.display = 'flex';
};

/**
 * Hides the global loading spinner
 */
window.hideGlobalSpinner = function() {
    const spinnerOverlay = document.getElementById('globalSpinnerOverlay');
    if (spinnerOverlay) {
        spinnerOverlay.style.display = 'none';
    }
};

// --- PAGE TITLE UTILITY ---
(function() {
    // Single cached fetch shared across all callers on a page
    let _configPromise = null;
    function _getConfig() {
        if (!_configPromise) {
            _configPromise = fetch('/ui-config').then(r => r.json()).catch(() => ({}));
        }
        return _configPromise;
    }

    /**
     * Sets both the browser tab title and the visible page heading, then syncs
     * the mobile top banner (if present).
     *
     * @param {string} tabPrefix   - Prefix for document.title, e.g. "Skills Management"
     * @param {string} headingText - Text for the <h1>, e.g. "Manage Skills"
     *                               Defaults to tabPrefix when omitted.
     * @param {string} headerId    - ID of the heading element (default: "pageHeader")
     */
    window.initPageTitle = async function(tabPrefix, headingText, headerId) {
        headerId = headerId || 'pageHeader';
        const displayText = headingText || tabPrefix;
        const cfg = await _getConfig();
        const appName = cfg.loginTitle || 'OpReady';
        document.title = tabPrefix + ' - ' + appName;
        const el = document.getElementById(headerId);
        if (el) el.innerText = displayText + ' - ' + appName;
        // Sync the mobile banner title (shows only the section name, no app suffix)
        const bannerTitle = document.getElementById('mobileBannerTitle');
        if (bannerTitle) bannerTitle.textContent = displayText;
    };
})();

// CSRF token auto-attachment — intercepts all same-origin mutating fetch calls
// and adds the X-CSRF-Token header. Skipped when the token endpoint returns
// non-200 (e.g. on the login page where no session exists yet).
(function setupCsrfFetch() {
    let _token = null;
    let _pending = null;
    const _orig = window.fetch.bind(window);

    function getCsrfToken() {
        if (_token) return Promise.resolve(_token);
        if (_pending) return _pending;
        _pending = _orig('/api/csrf-token')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(d) { _token = d ? d.token : null; _pending = null; return _token; })
            .catch(function() { _pending = null; return null; });
        return _pending;
    }

    window.fetch = function(input, init) {
        init = init || {};
        var method = (init.method || 'GET').toUpperCase();
        var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
        var mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1;
        var sameOrigin = url.charAt(0) === '/' || url.indexOf('http') !== 0;

        if (mutating && sameOrigin) {
            return getCsrfToken().then(function(token) {
                if (token) {
                    init = Object.assign({}, init, {
                        headers: Object.assign({}, init.headers, { 'X-CSRF-Token': token })
                    });
                }
                return _orig(input, init);
            });
        }
        return _orig(input, init);
    };
})();