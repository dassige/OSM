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