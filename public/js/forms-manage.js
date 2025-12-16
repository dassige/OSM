// public/js/forms-manage.js

let forms = [];
let currentForm = null;
let currentFields = [];

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

// [UPDATED] Matches the field editor configuration
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
    if (!currentForm) return;

    const name = document.getElementById('formName').value;
    const intro = tinymce.get('formIntro').getContent();
    const status = currentForm.status; 

    // Gather Fields
    const fieldCards = document.querySelectorAll('.field-card');
    const structure = Array.from(fieldCards).map(card => {
        const id = card.getAttribute('data-id');
        const type = card.getAttribute('data-type');
        
        // Get content
        const editorId = `editor_${id}`;
        const description = tinymce.get(editorId) ? tinymce.get(editorId).getContent() : "";

        // Get Options
        let options = [];
        let renderAs = 'radio'; // Default

        if (type === 'radio' || type === 'checkboxes') {
            const optInputs = card.querySelectorAll('.option-input');
            options = Array.from(optInputs).map(inp => inp.value).filter(v => v.trim() !== "");
            
            // [UPDATED] Capture renderAs setting for radio buttons
            const renderSelect = card.querySelector('.field-render-as');
            if (renderSelect) {
                renderAs = renderSelect.value;
            }
        }

        const required = card.querySelector('.field-required-check').checked;

        return { id, type, description, required, options, renderAs };
    });

    const payload = { name, status, intro, structure };
    const method = currentForm.id ? 'PUT' : 'POST';
    const url = currentForm.id ? `/api/forms/${currentForm.id}` : '/api/forms';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to save");
        const result = await res.json();
        if(result.id) currentForm.id = result.id;
        
        showToast("Form saved successfully", "success");
        loadForms(); 
    } catch (e) { showToast(e.message, 'error'); }
}

async function updateStatus(id, enabled) {
    try {
        await fetch(`/api/forms/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: enabled ? 1 : 0 })
        });
        const f = forms.find(x => x.id === id);
        if(f) f.status = enabled ? 1 : 0;
        showToast(`Form ${enabled ? 'Enabled' : 'Disabled'}`, "success");
    } catch (e) { showToast("Failed to update status", "error"); loadForms(); }
}

async function deleteForm() {
    if(!currentForm || !currentForm.id) return;
    if(!await confirmAction("Delete Form", `Delete '${currentForm.name}'?`)) return;

    try {
        await fetch(`/api/forms/${currentForm.id}`, { method: 'DELETE' });
        showToast("Form deleted", "success");
        currentForm = null;
        document.getElementById('builderPanel').style.display = 'none';
        document.getElementById('emptyPanel').style.display = 'flex';
        loadForms();
    } catch (e) { showToast(e.message, 'error'); }
}

function previewForm() {
    if(!currentForm || !currentForm.id) return showToast("Please save the form first.", "warning");
    window.open(`forms-view.html?id=${currentForm.id}&preview=true`, '_blank');
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
        item.onclick = () => selectForm(f.id);
        list.appendChild(item);
    });
}

function createNewForm() {
    loadEditor({ name: "New Form", status: 0, intro: "", structure: [] });
}

async function selectForm(id) {
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
    
    if(tinymce.get('formIntro')) tinymce.get('formIntro').setContent(form.intro || "");

    renderFields();
}

function copyFormLink() {
    if(!currentForm.id) return showToast("Save form first", "warning");
    const url = `${window.location.origin}/forms-view.html?id=${currentForm.id}`;
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
    const main = document.querySelector('body'); 
    setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100);
}

function renderFields() {
    const canvas = document.getElementById('fieldsCanvas');
    canvas.innerHTML = '';
    currentFields.forEach(field => renderFieldItem(field));
}

function renderFieldItem(field) {
    const canvas = document.getElementById('fieldsCanvas');
    const div = document.createElement('div');
    // Default to expanded for new/loaded items
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
        // [UPDATED] Render Mode Selector for Radio only
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
        if(field.options) {
            field.options.forEach(opt => {
                html += generateOptionRow(opt);
            });
        }
        html += `</div><button type="button" class="btn-sm" style="margin-top:5px; background:#6c757d; color:white;" onclick="addOptionRow(this)">+ Add Option</button></div>`;
    }

    html += `</div>`;
    div.innerHTML = html;
    canvas.appendChild(div);

    // Initialize TinyMCE for the field description
    setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

// Helper to toggle collapse via onclick
window.toggleFieldCard = function(header) {
    header.parentElement.classList.toggle('expanded');
}

async function handleRemoveField(id) {
    if(await confirmAction("Remove Question", "Are you sure you want to delete this question?")) {
        currentFields = currentFields.filter(f => f.id !== id);
        // Remove TinyMCE instance first
        if(tinymce.get(`editor_${id}`)) tinymce.get(`editor_${id}`).remove();
        
        const card = document.querySelector(`.field-card[data-id="${id}"]`);
        if(card) card.remove();
    }
}
window.removeField = function(e, id) { e.stopPropagation(); handleRemoveField(id); }

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

window.addOptionRow = function(btn) {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.innerHTML = generateOptionRow("");
    container.appendChild(div.firstElementChild);
}