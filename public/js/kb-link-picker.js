/**
 * kb-link-picker.js
 * Shared modal for inserting Knowledge Base document links into TinyMCE editors.
 *
 * Exposes:
 *   window.openKbLinkPicker(callback)  — opens the picker; calls callback({ id, title, resolverToken }) on Insert
 *   window.closeKbPicker()             — closes without selection
 *   window.kbPickerInsert()            — called by the Insert button; confirms the highlighted row
 */
(function () {
    'use strict';

    let injected        = false;
    let pendingCallback = null;
    let cachedDocs      = null;
    let cachedCats      = null;
    let selectedCatId   = null; // null = All Documents
    let highlighted     = null; // { id, title }

    // ── Modal injection ───────────────────────────────────────────────────────

    function injectModal() {
        if (injected) return;
        injected = true;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
<style>
    .kb-picker-all-row, .kb-picker-cat-row {
        display: flex; align-items: center; gap: 6px; padding: 6px 6px;
        border-radius: 6px; cursor: pointer; font-size: 0.85rem; transition: background 0.12s;
    }
    .kb-picker-all-row { font-weight: 600; margin-bottom: 4px; }
    .kb-picker-all-row:hover, .kb-picker-cat-row:hover { background: var(--hover-bg, rgba(0,0,0,0.06)); }
    .kb-picker-all-row.selected, .kb-picker-cat-row.selected { background: var(--primary-light, #e0f0ff); color: var(--primary); }
    body.dark-mode .kb-picker-all-row.selected, body.dark-mode .kb-picker-cat-row.selected { background: rgba(23,162,184,0.2); color: var(--primary); }
    .kb-picker-tree, .kb-picker-tree ul { list-style: none; margin: 0; padding: 0; }
    .kb-picker-tree ul { padding-left: 16px; }
    .kb-picker-cat-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kb-picker-count {
        font-size: 0.75em; font-weight: 600; color: var(--text-muted);
        background: var(--hover-bg, rgba(0,0,0,0.07)); border-radius: 10px;
        padding: 1px 6px; margin-left: auto; flex-shrink: 0;
    }
    .kb-picker-toggle-btn {
        background: none; border: none; cursor: pointer; padding: 0 2px; line-height: 1;
        color: var(--text-muted); width: 14px; flex-shrink: 0; font-size: 0.7rem;
    }
    .kb-picker-toggle-btn svg { transition: transform 0.2s; }
    .kb-picker-toggle-btn.open svg { transform: rotate(90deg); }
    .kb-picker-toggle-btn.invisible { visibility: hidden; }
    @media (max-width: 640px) {
        #kbPickerBody { flex-direction: column; }
        #kbPickerTreePanel {
            width: 100% !important; max-height: 140px;
            border-right: none !important; border-bottom: 1px solid var(--border-color);
            padding-right: 0 !important; padding-bottom: 8px; margin-bottom: 8px;
        }
    }
</style>
<div id="kbPickerModal" class="modal" style="display:none;"
    onclick="if(event.target===this) closeKbPicker()">
    <div class="modal-content" style="max-width:min(760px,95vw); width:100%; display:flex; flex-direction:column; max-height:85vh;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <h3 style="margin:0;">Insert Knowledge Base Link</h3>
            <button class="btn-secondary btn-sm" onclick="closeKbPicker()" title="Close without inserting">&#10005;</button>
        </div>
        <div id="kbPickerBody" style="display:flex; gap:14px; flex:1; min-height:0;">
            <div id="kbPickerTreePanel"
                style="width:190px; min-width:150px; flex-shrink:0; overflow-y:auto;
                       border-right:1px solid var(--border-color); padding-right:10px;">
                <div class="kb-picker-all-row selected" id="kbPickerAllRow" onclick="kbPickerSelectCat(null)"
                    title="Show all documents regardless of folder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    All Documents
                    <span id="kbPickerAllCount" class="kb-picker-count"></span>
                </div>
                <ul class="kb-picker-tree" id="kbPickerTree"></ul>
            </div>
            <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
                <input type="text" id="kbPickerSearch"
                    placeholder="Search by title, description or category…"
                    title="Filter the document list"
                    style="width:100%; padding:8px 10px; border:1px solid var(--border-color); border-radius:6px;
                           background:var(--input-bg); color:var(--text-main); font-size:0.9rem; margin-bottom:10px; box-sizing:border-box;">
                <div id="kbPickerList"
                    style="flex:1; overflow-y:auto; min-height:120px; max-height:400px; display:flex; flex-direction:column; gap:6px;">
                    <p style="color:var(--text-muted); text-align:center; margin:auto 0;">Loading…</p>
                </div>
            </div>
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

    async function loadCats() {
        if (cachedCats) return cachedCats;
        const res = await fetch('/api/knowledgebase/categories');
        if (!res.ok) throw new Error('Could not load folders.');
        cachedCats = await res.json();
        return cachedCats;
    }

    function filter(q) {
        if (!cachedDocs) return [];
        let docs = cachedDocs;
        if (selectedCatId !== null) docs = docs.filter(d => d.category_id === selectedCatId);
        if (!q.trim()) return docs;
        const lq = q.toLowerCase();
        return docs.filter(d =>
            (d.title || '').toLowerCase().includes(lq) ||
            (d.description || '').toLowerCase().includes(lq) ||
            (d.category_name || '').toLowerCase().includes(lq)
        );
    }

    // ── Folder tree ───────────────────────────────────────────────────────────

    function buildCatChildren(cats, parentId) {
        return cats.filter(c => (c.parent_id || null) === parentId);
    }

    function renderTree() {
        const ul = document.getElementById('kbPickerTree');
        if (!ul) return;
        ul.innerHTML = '';
        const allCount = document.getElementById('kbPickerAllCount');
        if (allCount) allCount.textContent = (cachedDocs || []).length;
        document.getElementById('kbPickerAllRow').classList.toggle('selected', selectedCatId === null);
        buildCatChildren(cachedCats || [], null).forEach(cat => ul.appendChild(renderCatNode(cat)));
    }

    function renderCatNode(cat) {
        const children     = buildCatChildren(cachedCats || [], cat.id);
        const hasChildren  = children.length > 0;
        const docCount     = (cachedDocs || []).filter(d => d.category_id === cat.id).length;
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="kb-picker-cat-row${selectedCatId === cat.id ? ' selected' : ''}" id="kbPickerCatRow-${cat.id}"
                onclick="kbPickerSelectCat(${cat.id})">
                <button class="kb-picker-toggle-btn${hasChildren ? '' : ' invisible'}" id="kbPickerCatToggle-${cat.id}"
                    onclick="kbPickerToggleCat(event,${cat.id})" title="Expand or collapse sub-folders">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="kb-picker-cat-name" title="${esc(cat.name)}">${esc(cat.name)}</span>
                <span class="kb-picker-count">${docCount}</span>
            </div>`;
        if (hasChildren) {
            const childUl = document.createElement('ul');
            childUl.className = 'kb-picker-tree';
            childUl.id = `kbPickerCatChildren-${cat.id}`;
            childUl.style.display = 'none';
            children.forEach(ch => childUl.appendChild(renderCatNode(ch)));
            li.appendChild(childUl);
        }
        return li;
    }

    window.kbPickerToggleCat = function (e, id) {
        e.stopPropagation();
        const children = document.getElementById(`kbPickerCatChildren-${id}`);
        const btn      = document.getElementById(`kbPickerCatToggle-${id}`);
        if (!children) return;
        const open = children.style.display === 'none';
        children.style.display = open ? 'block' : 'none';
        btn.classList.toggle('open', open);
    };

    window.kbPickerSelectCat = function (id) {
        selectedCatId = id;
        highlighted = null;
        updateInsertBtn();
        document.getElementById('kbPickerAllRow').classList.toggle('selected', id === null);
        document.querySelectorAll('.kb-picker-cat-row').forEach(r => r.classList.remove('selected'));
        if (id !== null) {
            const row = document.getElementById(`kbPickerCatRow-${id}`);
            if (row) row.classList.add('selected');
        }
        renderList(filter(document.getElementById('kbPickerSearch').value));
    };

    // ── Rendering ─────────────────────────────────────────────────────────────

    const TYPE_BG = {
        pdf:'#dc3545', doc:'#2b579a', docx:'#2b579a', xls:'#217346', xlsx:'#217346', rtf:'#6c757d',
        txt:'#868e96', md:'#24292e', png:'#6f42c1', jpg:'#fd7e14', jpeg:'#fd7e14', bmp:'#20c997',
    };

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
            <div data-kb-row-id="${d.id}" data-kb-title="${esc(d.title)}" data-kb-resolver="${esc(d.resolver_token)}"
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
            id:            parseInt(row.dataset.kbRowId, 10),
            title:         row.dataset.kbTitle,
            resolverToken: row.dataset.kbResolver,
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
        selectedCatId   = null;

        const modal  = document.getElementById('kbPickerModal');
        const search = document.getElementById('kbPickerSearch');
        const list   = document.getElementById('kbPickerList');
        const tree   = document.getElementById('kbPickerTree');

        search.value = '';
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;margin:auto 0;">Loading…</p>';
        tree.innerHTML = '';
        updateInsertBtn();
        modal.style.display = 'block';
        search.focus();

        try {
            await Promise.all([loadDocs(), loadCats()]);
            renderTree();
            renderList(filter(''));
        } catch (err) {
            list.innerHTML = `<p style="color:#dc3545;text-align:center;margin:auto 0;">${esc(err.message)}</p>`;
        }
    };

    // Clears the document cache so the next openKbLinkPicker call fetches fresh data.
    // Call this after rotating a single document's slug so the picker reflects the change.
    window.clearKbPickerCache = function () { cachedDocs = null; cachedCats = null; };

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
