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
        msgEl.innerHTML = message || 'Are you sure you want to proceed?';
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
// --- CUSTOM PROMPT-WITH-INPUT MODAL (value field + confirmation keyword) ---
(function setupPromptInputModal() {
    if (document.getElementById('customPromptInputModal')) return;

    const style = document.createElement('style');
    style.innerHTML = `
        #customPromptInputModal {
            display: none; position: fixed; z-index: 10500; left: 0; top: 0; width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
            align-items: center; justify-content: center;
        }
        #customPromptInputModal[style*="display: flex"],
        #customPromptInputModal[style*="display:flex"] { display: flex !important; }
        #customPromptInputModal .modal-content {
            background-color: var(--bg-card, #fff); color: var(--text-main, #333);
            margin: 0; padding: 25px; border: 1px solid var(--border-color, #ddd); width: 90%; max-width: 420px;
            border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); animation: fadeIn 0.2s ease-out;
        }
        .prompt-input-label {
            display: block; font-size: 13px; font-weight: 600;
            color: var(--text-muted, #666); margin: 15px 0 6px;
        }
    `;
    document.head.appendChild(style);

    const div = document.createElement('div');
    div.id = 'customPromptInputModal';
    div.innerHTML = `
        <div class="modal-content">
            <h3 id="promptInputTitle" style="margin-top:0; font-size:1.25rem;">Action Required</h3>
            <p id="promptInputMessage" style="color: var(--text-muted, #666); line-height: 1.5; margin: 15px 0 0;"></p>
            <label id="promptInputValueLabel" class="prompt-input-label" for="promptInputValue"></label>
            <input id="promptInputValue" class="prompt-input" autocomplete="off">
            <label id="promptInputConfirmLabel" class="prompt-input-label" for="promptInputConfirm"></label>
            <input type="text" id="promptInputConfirm" class="prompt-input" autocomplete="off">
            <div class="confirm-btn-group">
                <button id="btnPromptInputCancel" class="confirm-btn confirm-btn-cancel">Cancel</button>
                <button id="btnPromptInputYes" class="confirm-btn confirm-btn-ok">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
})();

/**
 * Custom modal: a labelled value input (text or number) PLUS a confirmation keyword.
 * @param {string} title
 * @param {string} message          - HTML allowed
 * @param {object} opts
 * @param {string}  opts.inputLabel   - Label shown above the value field
 * @param {*}       opts.inputDefault - Pre-filled value
 * @param {string}  [opts.inputType]  - 'number' | 'text'  (default: 'text')
 * @param {number}  [opts.inputMin]   - Minimum allowed value for number inputs
 * @param {string}  opts.requiredText - Confirmation keyword the user must type exactly
 * @returns {Promise<string|null>}  The trimmed value string when confirmed, null when cancelled
 */
window.promptActionWithInput = function(title, message, opts) {
    return new Promise((resolve) => {
        const modal        = document.getElementById('customPromptInputModal');
        const titleEl      = document.getElementById('promptInputTitle');
        const msgEl        = document.getElementById('promptInputMessage');
        const valueLabel   = document.getElementById('promptInputValueLabel');
        const valueEl      = document.getElementById('promptInputValue');
        const confirmLabel = document.getElementById('promptInputConfirmLabel');
        const confirmEl    = document.getElementById('promptInputConfirm');
        const btnYes       = document.getElementById('btnPromptInputYes');
        const btnCancel    = document.getElementById('btnPromptInputCancel');

        titleEl.textContent      = title || 'Action Required';
        msgEl.innerHTML          = message || '';
        valueLabel.textContent   = opts.inputLabel || 'Value';
        confirmLabel.innerHTML   = `Type <strong>${opts.requiredText}</strong> to confirm`;

        valueEl.type  = opts.inputType || 'text';
        valueEl.value = opts.inputDefault != null ? String(opts.inputDefault) : '';
        if (opts.inputType === 'number') {
            valueEl.min = opts.inputMin != null ? String(opts.inputMin) : '1';
        } else {
            valueEl.removeAttribute('min');
        }
        confirmEl.value       = '';
        confirmEl.placeholder = `Type '${opts.requiredText}'`;

        btnYes.disabled      = true;
        btnYes.style.opacity = '0.5';
        btnYes.classList.remove('btn-danger');

        modal.style.display = 'flex';
        valueEl.focus();
        valueEl.select();

        const validate = () => {
            const min     = parseFloat(valueEl.min);
            const num     = parseFloat(valueEl.value);
            const valueOk = valueEl.value.trim() !== '' &&
                (opts.inputType !== 'number' || (!isNaN(num) && (isNaN(min) || num >= min)));
            const ok      = valueOk && confirmEl.value === opts.requiredText;
            btnYes.disabled      = !ok;
            btnYes.style.opacity = ok ? '1' : '0.5';
            if (ok) btnYes.classList.add('btn-danger');
            else    btnYes.classList.remove('btn-danger');
        };

        valueEl.addEventListener('input', validate);
        confirmEl.addEventListener('input', validate);

        const cleanup = () => {
            modal.style.display = 'none';
            btnYes.onclick    = null;
            btnCancel.onclick = null;
            modal.onclick     = null;
            valueEl.removeEventListener('input', validate);
            confirmEl.removeEventListener('input', validate);
            window.removeEventListener('keydown', handleKey);
        };

        const handleKey = (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(null); }
            if (e.key === 'Enter' && !btnYes.disabled) { cleanup(); resolve(valueEl.value.trim()); }
        };

        window.addEventListener('keydown', handleKey);
        btnYes.onclick    = () => { cleanup(); resolve(valueEl.value.trim()); };
        btnCancel.onclick = () => { cleanup(); resolve(null); };
        modal.onclick     = (e) => { if (e.target === modal) { cleanup(); resolve(null); } };
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
let _cachedReleaseBody = null;

window.resolveReleaseUrl = async function(version) {
    if (_cachedReleaseUrl !== null) return _cachedReleaseUrl;
    try {
        const res = await fetch(
            `https://api.github.com/repos/dassige/OSM/releases/tags/v${version}`,
            { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (res.ok) {
            const data = await res.json();
            _cachedReleaseUrl = `${_GITHUB_REPO}/releases/tag/v${version}`;
            _cachedReleaseBody = data.body || null;
        } else {
            _cachedReleaseUrl = `${_GITHUB_REPO}/releases`;
            _cachedReleaseBody = null;
        }
    } catch (_) {
        _cachedReleaseUrl = `${_GITHUB_REPO}/releases`;
        _cachedReleaseBody = null;
    }
    return _cachedReleaseUrl;
};

function _renderMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        line = line.replace(/`([^`]+)`/g, '<code style="background:var(--input-bg);padding:1px 4px;border-radius:3px;font-size:0.88em;font-family:monospace;">$1</code>');
        line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--primary);">$1</a>');
        line = line.replace(/(?<!href=")https?:\/\/[^\s<>"')\]]+/g, function(url) {
            return '<a href="' + url.replace(/[.,!?;:]+$/, '') + '" target="_blank" rel="noopener" style="color:var(--primary);">' + url.replace(/[.,!?;:]+$/, '') + '</a>';
        });
        if (/^### /.test(lines[i])) {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<h4 style="margin:14px 0 5px;">' + line.slice(4) + '</h4>';
        } else if (/^## /.test(lines[i])) {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<h3 style="margin:18px 0 7px;border-bottom:1px solid var(--border-color);padding-bottom:4px;">' + line.slice(3) + '</h3>';
        } else if (/^# /.test(lines[i])) {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<h2 style="margin:18px 0 7px;">' + line.slice(2) + '</h2>';
        } else if (/^[\*\-] /.test(lines[i])) {
            if (!inList) { html += '<ul style="margin:5px 0;padding-left:20px;line-height:1.7;">'; inList = true; }
            html += '<li>' + line.slice(2) + '</li>';
        } else if (lines[i].trim() === '') {
            if (inList) { html += '</ul>'; inList = false; }
        } else {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<p style="margin:5px 0;">' + line + '</p>';
        }
    }
    if (inList) html += '</ul>';
    return html;
}

window.showReleaseNotesModal = async function(version) {
    closeModal('globalAboutModal');
    let modal = document.getElementById('globalReleaseNotesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalReleaseNotesModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:680px;width:95%;max-height:82vh;display:flex;flex-direction:column;">
                <span class="close-btn" onclick="closeModal('globalReleaseNotesModal')">&times;</span>
                <h2 style="margin-top:0;">Release Notes</h2>
                <div id="globalReleaseNotesBody" style="overflow-y:auto;flex:1;padding-right:4px;font-size:0.92em;"></div>
                <div class="modal-actions-center" style="margin-top:16px;">
                    <button onclick="closeModal('globalReleaseNotesModal')" class="btn-secondary" title="Close release notes">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    const bodyEl = document.getElementById('globalReleaseNotesBody');
    bodyEl.innerHTML = '<p style="color:var(--text-muted);">Loading release notes…</p>';
    modal.style.display = 'block';

    // Use cached body if already fetched; otherwise fetch directly (bypasses stale cache from pre-fetch failures)
    let notesBody = _cachedReleaseBody;
    if (!notesBody) {
        try {
            const res = await fetch(
                `https://api.github.com/repos/dassige/OSM/releases/tags/v${version}`,
                { headers: { Accept: 'application/vnd.github+json' } }
            );
            if (res.ok) {
                const data = await res.json();
                notesBody = data.body || null;
                _cachedReleaseBody = notesBody;
                _cachedReleaseUrl = `${_GITHUB_REPO}/releases/tag/v${version}`;
            }
        } catch (_) {}
    }

    if (notesBody) {
        bodyEl.innerHTML = _renderMarkdown(notesBody);
    } else {
        bodyEl.innerHTML = `<p style="color:var(--text-muted);">Release notes are not available for this version. <a href="${_GITHUB_REPO}/releases" target="_blank" rel="noopener" style="color:var(--primary);">View on GitHub</a>.</p>`;
    }
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
                    ${config.parentCommitId ? `<p><strong>Parent Commit:</strong> <span style="font-family:monospace;">${config.parentCommitId.slice(0, 7)}</span></p>` : ''}
                    <p><strong>Release Notes:</strong> <button class="btn-informative btn-sm" onclick="showReleaseNotesModal('${config.version}')" title="View release notes for v${config.version}" style="margin-left:4px;">View Release Notes</button></p>
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

        window.resolveReleaseUrl(config.version);
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
 * FENZ rank list ordered by authority (highest first).
 * Mirrors services/rank-config.js — update both if the list changes.
 */
window.FENZ_RANKS = [
    { abbreviation: 'CFO',  fullName: 'Chief Fire Officer',       priority: 1 },
    { abbreviation: 'DCFO', fullName: 'Deputy Chief Fire Officer', priority: 2 },
    { abbreviation: 'SSO',  fullName: 'Senior Station Officer',    priority: 3 },
    { abbreviation: 'SO',   fullName: 'Station Officer',           priority: 4 },
    { abbreviation: 'SFF',  fullName: 'Senior Firefighter',        priority: 5 },
    { abbreviation: 'QFF',  fullName: 'Qualified Firefighter',     priority: 6 },
    { abbreviation: 'FF',   fullName: 'Firefighter',               priority: 7 },
    { abbreviation: 'RFF',  fullName: 'Recruit Firefighter',       priority: 8 },
];

(function buildRankPriorityMap() {
    const map = new Map(window.FENZ_RANKS.map(r => [r.abbreviation, r.priority]));
    /**
     * Return the numeric priority for a rank abbreviation or a raw member name string.
     * Lower number = higher authority. Unknown ranks return 99.
     * Use this for sorting rank columns (compare by number, not alphabetically).
     *
     * @param {string} rankOrName  e.g. "QFF" or "QFF Smith, J"
     * @returns {number}
     */
    window.getRankPriority = function(rankOrName) {
        if (!rankOrName || rankOrName === '-') return 99;
        const upper = String(rankOrName).trim().toUpperCase();
        if (map.has(upper)) return map.get(upper);
        for (const [abbr, priority] of map) {
            if (upper.startsWith(abbr + ' ') || upper.startsWith(abbr + ',')) return priority;
        }
        return 99;
    };

    /**
     * Build a display name from structured ETL fields, falling back to rawName.
     * Format: "RANK LastName, FirstName"
     *
     * @param {string} rank
     * @param {string} lastName
     * @param {string} firstName
     * @param {string} rawName  Fallback when structured fields are absent
     * @returns {string}
     */
    window.formatMemberName = function(rank, lastName, firstName, rawName) {
        if (lastName) {
            const r  = rank      ? rank.trim() + ' '       : '';
            const fn = firstName ? ', ' + firstName.trim() : '';
            return `${r}${lastName.trim()}${fn}`;
        }
        return rawName || '';
    };
})();

window.showGlobalSpinner = function(message = "Processing...") {
    let overlay = document.getElementById('globalSpinnerOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalSpinnerOverlay';
        overlay.innerHTML = `
            <div class="custom-spinner"></div>
            <div id="globalSpinnerText"></div>
            <div id="globalSpinnerSub"></div>
        `;
        document.body.appendChild(overlay);
    }
    document.getElementById('globalSpinnerText').textContent = message;
    document.getElementById('globalSpinnerSub').textContent = '';
    overlay.style.display = 'flex';
};

window.updateGlobalSpinnerMessage = function(message, subMessage) {
    const textEl = document.getElementById('globalSpinnerText');
    const subEl = document.getElementById('globalSpinnerSub');
    if (textEl) textEl.textContent = message;
    if (subEl) subEl.textContent = subMessage || '';
};

window.hideGlobalSpinner = function() {
    const overlay = document.getElementById('globalSpinnerOverlay');
    if (overlay) overlay.style.display = 'none';
};

/**
 * Shows a loading indicator inside a container element.
 * For <tbody> targets a spanning <tr> is injected; for all others a centred div.
 * @param {string|Element} target - element ID or element reference
 * @param {string} [message] - optional text below the spinner
 */
window.initFilePicker = function(inputId, labelId, onChange) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    input.addEventListener('change', function() {
        const f = this.files[0];
        if (f) {
            label.textContent = f.name;
            label.classList.add('has-file');
        } else {
            label.textContent = 'No file chosen';
            label.classList.remove('has-file');
        }
        if (typeof onChange === 'function') onChange(f);
    });
};

window.resetFilePicker = function(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input) input.value = '';
    if (label) { label.textContent = 'No file chosen'; label.classList.remove('has-file'); }
};

window.showContainerLoader = function(target, message) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    const msg = message
        ? `<div style="font-size:0.88em; margin-top:8px;">${message}</div>`
        : '';
    if (el.tagName === 'TBODY') {
        let cols = 6;
        const table = el.closest('table');
        if (table) { const ths = table.querySelectorAll('thead th'); if (ths.length) cols = ths.length; }
        el.innerHTML = `<tr><td colspan="${cols}" style="text-align:center; padding:28px; color:var(--text-muted);">
            <div class="spinner" style="margin:0 auto 0; display:block; border-top-color:var(--primary);"></div>${msg}
        </td></tr>`;
    } else {
        el.innerHTML = `<div style="text-align:center; padding:28px; color:var(--text-muted);">
            <div class="spinner" style="margin:0 auto 0; display:block; border-top-color:var(--primary);"></div>${msg}
        </div>`;
        el.style.display = 'block';
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