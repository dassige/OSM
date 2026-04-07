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
            z-index: 10001; 
            left: 0; 
            top: 0;
            width: 100%; 
            height: 100%; 
            background-color: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
        }
        #customConfirmModal .modal-content {
            background-color: var(--bg-card, #fff); 
            color: var(--text-main, #333);
            margin: 15% auto; 
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
        modal.style.display = 'block';

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
// public/utils.js - Add the following logic

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
                    <p><strong>Deploy Date:</strong> ${config.deployDate}</p>
                </div>
                <div class="modal-credits">
                    <p style="text-align: center; font-weight: bold; margin-bottom: 10px;">Credits</p>
                    <ul style="padding-left: 20px; line-height: 1.6;">
                        <li><strong>Developer:</strong> Gerardo Dassi</li>
                        <li><strong>Stack:</strong> Node.js, SQLite, Litestream</li>
                        <li><strong>Icons:</strong> Feather Icons</li>
                    </ul>
                </div>
                <div class="modal-actions-center">
                    <button onclick="closeModal('globalAboutModal')" class="btn-secondary">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
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