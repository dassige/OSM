/**
 * kb-link-picker.js
 * Shared modal for inserting Knowledge Base document links into TinyMCE editors.
 *
 * Exposes:
 *   window.openKbLinkPicker(callback)  — opens the picker; calls callback({ id, title }) on Insert
 *   window.closeKbPicker()             — closes without selection
 *   window.kbPickerInsert()            — called by the Insert button; confirms the highlighted row
 */
(function () {
    'use strict';

    let injected        = false;
    let pendingCallback = null;
    let cachedDocs      = null;
    let highlighted     = null; // { id, title }

    // ── Modal injection ───────────────────────────────────────────────────────

    function injectModal() {
        if (injected) return;
        injected = true;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
<div id="kbPickerModal" class="modal" style="display:none;"
    onclick="if(event.target===this) closeKbPicker()">
    <div class="modal-content" style="max-width:min(580px,95vw); width:100%; display:flex; flex-direction:column; max-height:85vh;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <h3 style="margin:0;">Insert Knowledge Base Link</h3>
            <button class="btn-secondary btn-sm" onclick="closeKbPicker()" title="Close without inserting">&#10005;</button>
        </div>
        <input type="text" id="kbPickerSearch"
            placeholder="Search by title, description or category…"
            title="Filter the document list"
            style="width:100%; padding:8px 10px; border:1px solid var(--border-color); border-radius:6px;
                   background:var(--input-bg); color:var(--text-main); font-size:0.9rem; margin-bottom:10px; box-sizing:border-box;">
        <div id="kbPickerList"
            style="flex:1; overflow-y:auto; min-height:120px; max-height:400px; display:flex; flex-direction:column; gap:6px;">
            <p style="color:var(--text-muted); text-align:center; margin:auto 0;">Loading…</p>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color);">
            <button class="btn-secondary" onclick="closeKbPicker()" title="Cancel without inserting">Cancel</button>
            <button class="btn-success" id="kbPickerInsertBtn" onclick="kbPickerInsert()"
                disabled title="Select a document above, then click Insert"
                style="min-width:90px;">Insert</button>
        </div>
    </div>
</div>`;
        document.body.appendChild(wrapper);

        document.getElementById('kbPickerSearch')
            .addEventListener('input', function () {
                highlighted = null;
                updateInsertBtn();
                renderList(filter(this.value));
            });
    }

    // ── Data ──────────────────────────────────────────────────────────────────

    async function loadDocs() {
        if (cachedDocs) return cachedDocs;
        const res = await fetch('/api/knowledgebase/documents');
        if (!res.ok) throw new Error('Could not load documents.');
        cachedDocs = (await res.json()).filter(d => d.is_active);
        return cachedDocs;
    }

    function filter(q) {
        if (!cachedDocs) return [];
        if (!q.trim()) return cachedDocs;
        const lq = q.toLowerCase();
        return cachedDocs.filter(d =>
            (d.title || '').toLowerCase().includes(lq) ||
            (d.description || '').toLowerCase().includes(lq) ||
            (d.category_name || '').toLowerCase().includes(lq)
        );
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    const TYPE_BG = { pdf:'#dc3545', doc:'#2b579a', docx:'#2b579a', xls:'#217346', xlsx:'#217346', rtf:'#6c757d' };

    function badge(filename) {
        const ext = (filename || '').split('.').pop().toLowerCase();
        const bg  = TYPE_BG[ext] || '#6c757d';
        return `<span style="display:inline-block;font-size:0.65em;font-weight:700;background:${bg};color:#fff;
                             border-radius:4px;padding:1px 5px;vertical-align:middle;flex-shrink:0;">${ext.toUpperCase()}</span>`;
    }

    function renderList(docs) {
        const list = document.getElementById('kbPickerList');
        if (!docs.length) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;margin:auto 0;">No documents found.</p>';
            return;
        }
        // Store id and title in data-* attributes — never in inline onclick strings,
        // which would break when the title contains quotes or other special characters.
        list.innerHTML = docs.map(d => `
            <div data-kb-row-id="${d.id}" data-kb-title="${esc(d.title)}"
                style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;cursor:pointer;
                       border:1px solid var(--border-color);border-radius:6px;transition:background 0.12s, border-color 0.12s;"
                title="Click to select, double-click to insert immediately">
                ${badge(d.original_filename)}
                <div style="min-width:0;">
                    <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.title)}</div>
                    ${d.category_name ? `<div style="font-size:0.78em;color:var(--text-muted);">${esc(d.category_name)}</div>` : ''}
                </div>
            </div>`).join('');

        // Wire clicks via event delegation — runs once after every renderList call
        list.onclick = function (e) {
            const row = e.target.closest('[data-kb-row-id]');
            if (!row) return;
            selectRow(row);
        };
        list.ondblclick = function (e) {
            const row = e.target.closest('[data-kb-row-id]');
            if (!row) return;
            selectRow(row);
            window.kbPickerInsert();
        };
    }

    function selectRow(row) {
        // Clear previous highlight
        const list = document.getElementById('kbPickerList');
        list.querySelectorAll('[data-kb-row-id]').forEach(r => {
            r.style.background  = '';
            r.style.borderColor = 'var(--border-color)';
        });
        // Highlight the clicked row
        row.style.background  = 'var(--primary-light, #e0f0ff)';
        row.style.borderColor = 'var(--primary, #007bff)';

        highlighted = {
            id:    parseInt(row.dataset.kbRowId, 10),
            title: row.dataset.kbTitle,
        };
        updateInsertBtn();
    }

    function updateInsertBtn() {
        const btn = document.getElementById('kbPickerInsertBtn');
        if (!btn) return;
        btn.disabled = !highlighted;
        btn.title = highlighted
            ? `Insert link to "${highlighted.title}"`
            : 'Select a document above, then click Insert';
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Public API ────────────────────────────────────────────────────────────

    window.openKbLinkPicker = async function (callback) {
        injectModal();
        pendingCallback = callback;
        highlighted     = null;

        const modal  = document.getElementById('kbPickerModal');
        const search = document.getElementById('kbPickerSearch');
        const list   = document.getElementById('kbPickerList');

        search.value = '';
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;margin:auto 0;">Loading…</p>';
        updateInsertBtn();
        modal.style.display = 'block';
        search.focus();

        try {
            await loadDocs();
            renderList(cachedDocs);
        } catch (err) {
            list.innerHTML = `<p style="color:#dc3545;text-align:center;margin:auto 0;">${esc(err.message)}</p>`;
        }
    };

    // Clears the document cache so the next openKbLinkPicker call fetches fresh data.
    // Call this after rotating a single document's slug so the picker reflects the change.
    window.clearKbPickerCache = function () { cachedDocs = null; };

    window.closeKbPicker = function () {
        const modal = document.getElementById('kbPickerModal');
        if (modal) modal.style.display = 'none';
        pendingCallback = null;
        highlighted     = null;
    };

    // Confirms selection — called by Insert button or row double-click
    window.kbPickerInsert = function () {
        if (!highlighted) return;
        if (typeof pendingCallback === 'function') pendingCallback(highlighted);
        window.closeKbPicker();
    };
})();
