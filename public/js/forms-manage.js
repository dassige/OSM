// public/js/forms-manage.js

let forms = [];
let currentForm = null;
let currentFields = [];
let originalFormState = null; // [NEW] Track baseline state

document.addEventListener('DOMContentLoaded', () => {
    fetch('/ui-config').then(r => r.json()).then(c => {
        if (c.loginTitle) {
            document.title = "Forms Manager - " + c.loginTitle;
            document.getElementById('pageHeader').innerText = "Forms Manager";
        }
        if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
        if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
    });

    fetch('/api/user-session').then(r => r.json()).then(user => {
        const role = user.role || 'guest';
        if (role !== 'admin' && role !== 'superadmin') {
            alert("Access Denied."); window.location.href = '/';
        } else {
            loadForms();
        }
    }).catch(() => window.location.href = '/login.html');

    initMainEditor();

    // Initialize Sortable for drag-and-drop
    const canvas = document.getElementById('fieldsCanvas');
    new Sortable(canvas, {
        handle: '.drag-handle',
        animation: 150
    });
});

function initMainEditor() {
    tinymce.init({
        selector: '#formIntro',
        height: 150,
        menubar: false,
        plugins: 'link lists autolink image preview searchreplace visualblocks code fullscreen table help wordcount',
        toolbar: 'undo redo | styles | bold italic underline forecolor | alignleft aligncenter alignright | bullist numlist | link image | table | removeformat code',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; margin: 8px; } body.dark-mode { background: #333; color: #fff; }'
    });
}

function initFieldEditor(id) {
    tinymce.init({
        selector: '#' + id,
        height: 200,
        menubar: false,
        plugins: 'link lists autolink image preview searchreplace visualblocks code fullscreen table help wordcount',
        toolbar: 'undo redo | styles | bold italic underline forecolor | alignleft aligncenter alignright | bullist numlist | link image | table | removeformat code',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; margin: 8px; } body.dark-mode { background: #333; color: #fff; }'
    });
}

// --- [NEW] State Management Helpers ---

function getFormData() {
    const name = document.getElementById('formName').value;
    // Safe check for TinyMCE initialization
    const introEditor = tinymce.get('formIntro');
    const intro = introEditor ? introEditor.getContent() : "";
    
    // Status is NOT part of the dirty check for the editor panel (it's handled in the sidebar)
    // We strictly check Name, Intro, and Structure.

    const fieldCards = document.querySelectorAll('.field-card');
    const structure = Array.from(fieldCards).map(card => {
        const id = card.getAttribute('data-id');
        const type = card.getAttribute('data-type');

        // Get content
        const editorId = `editor_${id}`;
        const ed = tinymce.get(editorId);
        const description = ed ? ed.getContent() : "";

        // Get Options
        let options = [];
        let renderAs = 'radio';

        if (type === 'radio' || type === 'checkboxes') {
            const optInputs = card.querySelectorAll('.option-input');
            // Filter empty options to match save logic
            options = Array.from(optInputs).map(inp => inp.value).filter(v => v.trim() !== "");

            const renderSelect = card.querySelector('.field-render-as');
            if (renderSelect) renderAs = renderSelect.value;
        }

        const required = card.querySelector('.field-required-check').checked;

        return { id, type, description, required, options, renderAs };
    });

    return { name, intro, structure };
}

function isFormDirty() {
    if (!originalFormState) return false;
    const current = getFormData();
    return JSON.stringify(current) !== JSON.stringify(originalFormState);
}

async function checkDirty(actionName) {
    if (isFormDirty()) {
        const confirm = await confirmAction("Unsaved Changes", `You have unsaved changes in "${currentForm.name || 'New Form'}".\n\nDo you want to discard them?`);
        return confirm; // True = Discard & Proceed, False = Cancel & Stay
    }
    return true; // No changes, proceed
}

// --- API Interactions ---

async function loadForms() {
    try {
        const res = await fetch('/api/forms');
        if (!res.ok) throw new Error("Failed to load");
        forms = await res.json();
        renderFormList();
    } catch (e) { showToast(e.message, 'error'); }
}

async function saveForm() {
    // [UPDATED] Use helper to get data
    const data = getFormData();
    const status = currentForm ? currentForm.status : 0; // Preserve status

    const payload = { ...data, status };
    const method = currentForm && currentForm.id ? 'PUT' : 'POST';
    const url = currentForm && currentForm.id ? `/api/forms/${currentForm.id}` : '/api/forms';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to save");
        const result = await res.json();
        
        if (result.id) {
            currentForm = { ...payload, id: result.id };
        } else {
            currentForm = { ...currentForm, ...payload };
        }

        // [NEW] Update baseline state
        originalFormState = getFormData();
        
        showToast("Form saved successfully", "success");
        loadForms();
    } catch (e) { showToast(e.message, 'error'); }
}

async function updateStatus(id, enabled) {
    try {
        await fetch(`/api/forms/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: enabled ? 1 : 0 })
        });
        const f = forms.find(x => x.id === id);
        if (f) f.status = enabled ? 1 : 0;
        showToast(`Form ${enabled ? 'Enabled' : 'Disabled'}`, "success");
    } catch (e) { showToast("Failed to update status", "error"); loadForms(); }
}

async function deleteForm() {
    if (!currentForm || !currentForm.id) return;
    if (!await confirmAction("Delete Form", `Delete '${currentForm.name}'?`)) return;

    try {
        await fetch(`/api/forms/${currentForm.id}`, { method: 'DELETE' });
        showToast("Form deleted", "success");
        currentForm = null;
        originalFormState = null; // Clear state
        document.getElementById('builderPanel').style.display = 'none';
        document.getElementById('emptyPanel').style.display = 'flex';
        loadForms();
    } catch (e) { showToast(e.message, 'error'); }
}

function previewForm() {
    if (!currentForm || !currentForm.id) return showToast("Please save the form first.", "warning");
    window.open(`forms-view.html?id=${currentForm.public_id}&preview=true`, '_blank');
}

// --- UI Rendering ---

function renderFormList() {
    const list = document.getElementById('formList');
    list.innerHTML = '';

    forms.forEach(f => {
        const item = document.createElement('div');
        item.className = `form-item ${currentForm && currentForm.id === f.id ? 'active' : ''}`;

        const toggleHtml = `
            <label class="switch" onclick="event.stopPropagation();" title="Toggle On/Off">
                <input type="checkbox" ${f.status ? 'checked' : ''} onchange="updateStatus(${f.id}, this.checked)">
                <span class="slider"></span>
            </label>
        `;

        item.innerHTML = `
            <div class="form-info">
                <div class="form-name">${f.name}</div>
            </div>
            ${toggleHtml}
        `;
        // [UPDATED] Check dirty before switching
        item.onclick = () => selectForm(f.id);
        list.appendChild(item);
    });
}

// [UPDATED] Check dirty before creating new
async function createNewForm() {
    if (document.getElementById('builderPanel').style.display === 'flex') {
        if (!await checkDirty()) return;
    }
    loadEditor({ name: "New Form", status: 0, intro: "", structure: [] });
}

// [UPDATED] Check dirty before switching
async function selectForm(id) {
    if (currentForm && currentForm.id === id) return; // Clicked same form
    if (document.getElementById('builderPanel').style.display === 'flex') {
        if (!await checkDirty()) return;
    }

    try {
        const res = await fetch(`/api/forms/${id}`);
        loadEditor(await res.json());
    } catch (e) { console.error(e); }
}

function loadEditor(form) {
    currentForm = form;
    currentFields = form.structure || [];

    document.getElementById('emptyPanel').style.display = 'none';
    document.getElementById('builderPanel').style.display = 'flex';
    renderFormList();

    const nameInput = document.getElementById('formName');
    nameInput.value = form.name || "";
    // Trigger auto-resize
    nameInput.style.height = 'auto';
    nameInput.style.height = nameInput.scrollHeight + 'px';

    if (tinymce.get('formIntro')) tinymce.get('formIntro').setContent(form.intro || "");

    renderFields();

    // [NEW] Set Baseline State
    // We construct the state object manually from the loaded data to match the format of getFormData()
    // This avoids race conditions with TinyMCE/DOM not being ready yet.
    originalFormState = {
        name: form.name || "",
        intro: form.intro || "",
        // Deep copy structure to ensure we have a clean comparison object
        // Note: We might need to ensure 'renderAs' etc are present to match getFormData defaults
        structure: (form.structure || []).map(f => ({
            id: f.id,
            type: f.type,
            description: f.description || "",
            required: !!f.required,
            options: f.options || [],
            renderAs: f.renderAs || 'radio'
        }))
    };
}

function copyFormLink() {
    if (!currentForm.id) return showToast("Save form first", "warning");
    const url = `${window.location.origin}/forms-view.html?id=${currentForm.public_id}`;
    navigator.clipboard.writeText(url);
    showToast("Link copied!", "success");
}

function addField(type) {
    const newField = {
        id: 'fld_' + Date.now().toString(36),
        type: type,
        required: false,
        description: "",
        options: (type === 'radio' || type === 'checkboxes') ? ["Option 1"] : [],
        renderAs: 'radio'
    };
    currentFields.push(newField);
    renderFieldItem(newField, true);

    // Scroll to bottom
    setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100);
}

function cleanupFieldEditors() {
    const editors = tinymce.get().filter(ed => ed.id.startsWith('editor_'));
    editors.forEach(ed => ed.remove());
}

function renderFields() {
    cleanupFieldEditors();
    const canvas = document.getElementById('fieldsCanvas');
    canvas.innerHTML = '';
    currentFields.forEach(field => renderFieldItem(field));
}

function renderFieldItem(field) {
    const canvas = document.getElementById('fieldsCanvas');
    const div = document.createElement('div');
    div.className = 'field-card expanded';
    div.setAttribute('data-id', field.id);
    div.setAttribute('data-type', field.type);

    const requiredCheck = field.required ? 'checked' : '';

    let html = `
        <div class="field-header" onclick="toggleFieldCard(this)">
            <span class="drag-handle" title="Drag to reorder" onclick="event.stopPropagation()">☰</span>
            <span class="field-type-badge">${field.type}</span>
            
            <div class="header-controls" onclick="event.stopPropagation()" title="Toggle Mandatory">
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" class="field-required-check" ${requiredCheck}>
                    <span class="slider"></span>
                </label>
                <span style="font-size: 12px; font-weight: bold; color: var(--text-muted);">Mandatory</span>
            </div>

            <span style="flex:1;"></span>
            
            <button class="btn-icon delete" onclick="removeField(event, '${field.id}')" title="Delete Question" style="margin-right: 15px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #dc3545;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>

            <span class="arrow-icon" title="Toggle Collapse">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
        </div>
        <div class="field-body">
            <div class="form-group">
                <label>Question / Content (Rich Text)</label>
                <textarea id="editor_${field.id}" class="field-desc-input">${field.description || ''}</textarea>
            </div>
    `;

    if (field.type === 'radio' || field.type === 'checkboxes') {
        if (field.type === 'radio') {
            const selectedRadio = (!field.renderAs || field.renderAs === 'radio') ? 'selected' : '';
            const selectedDropdown = (field.renderAs === 'dropdown') ? 'selected' : '';

            html += `
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-size:13px; font-weight:bold; color:var(--text-muted); display:inline-block; margin-bottom:5px;">Display As:</label>
                    <select class="field-render-as" style="padding:6px; border-radius:4px; border:1px solid #ccc; font-size:14px; background:var(--input-bg); color:var(--text-main);">
                        <option value="radio" ${selectedRadio}>Radio Buttons</option>
                        <option value="dropdown" ${selectedDropdown}>Dropdown Menu</option>
                    </select>
                </div>
             `;
        }

        html += `<div class="form-group"><label>Options</label><div class="options-container">`;
        if (field.options) {
            field.options.forEach(opt => {
                html += generateOptionRow(opt);
            });
        }
        html += `</div><button type="button" class="btn-sm" style="margin-top:5px; background:#6c757d; color:white;" onclick="addOptionRow(this)">+ Add Option</button></div>`;
    }

    html += `</div>`;
    div.innerHTML = html;
    canvas.appendChild(div);

    setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

window.toggleAllFields = function () {
    const cards = document.querySelectorAll('.field-card');
    const anyCollapsed = Array.from(cards).some(c => !c.classList.contains('expanded'));
    cards.forEach(c => {
        if (anyCollapsed) c.classList.add('expanded');
        else c.classList.remove('expanded');
    });
}

window.toggleFieldCard = function (header) {
    header.parentElement.classList.toggle('expanded');
}

async function handleRemoveField(id) {
    if (await confirmAction("Remove Question", "Are you sure you want to delete this question?")) {
        if (tinymce.get(`editor_${id}`)) tinymce.get(`editor_${id}`).remove();
        currentFields = currentFields.filter(f => f.id !== id);
        const card = document.querySelector(`.field-card[data-id="${id}"]`);
        if (card) card.remove();
    }
}
window.removeField = function (e, id) { e.stopPropagation(); handleRemoveField(id); }

function generateOptionRow(value) {
    return `
        <div class="option-row">
            <input type="text" class="option-input" value="${value}" placeholder="Option label">
            <button class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545;" title="Remove Option">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        </div>
    `;
}

window.addOptionRow = function (btn) {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.innerHTML = generateOptionRow("");
    container.appendChild(div.firstElementChild);
}