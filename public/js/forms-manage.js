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
        plugins: 'link lists autolink',
        toolbar: 'bold italic underline | bullist numlist | link removeformat',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; } body.dark-mode { background: #333; color: #fff; }'
    });
}

function initFieldEditor(id) {
    tinymce.init({
        selector: '#' + id,
        height: 120, 
        menubar: false,
        plugins: 'link lists autolink image',
        toolbar: 'bold italic | bullist numlist | image link',
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
        if (type === 'radio' || type === 'checkboxes') {
            const optInputs = card.querySelectorAll('.option-input');
            options = Array.from(optInputs).map(inp => inp.value).filter(v => v.trim() !== "");
        }

        const required = card.querySelector('.field-required-check').checked;

        return { id, type, description, required, options };
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
        options: (type === 'radio' || type === 'checkboxes') ? ["Option 1"] : []
    };
    currentFields.push(newField);
    renderFieldItem(newField, true);
    
    // Scroll to bottom
    const main = document.querySelector('body'); // Changed to body scroll
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
    div.className = 'field-card expanded'; 
    div.setAttribute('data-id', field.id);
    div.setAttribute('data-type', field.type);

    let html = `
        <div class="field-header" onclick="this.parentElement.classList.toggle('expanded')">
            <span class="drag-handle">☰</span>
            <span class="field-type-badge">${field.type}</span>
            <span style="flex:1;"></span>
            <button class="btn-icon delete" onclick="removeField(event, '${field.id}')" title="Delete">×</button>
        </div>
        <div class="field-body">
            <div class="form-group">
                <label>Question / Content (Rich Text)</label>
                <textarea id="editor_${field.id}" class="field-desc-input">${field.description || ''}</textarea>
            </div>
            
            <div class="form-group">
                <label style="display:inline-flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" class="field-required-check" ${field.required ? 'checked' : ''} style="width:auto; margin-right:8px;"> 
                    Mandatory Answer
                </label>
            </div>
    `;

    if (field.type === 'radio' || field.type === 'checkboxes') {
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

    setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

async function handleRemoveField(id) {
    if(await confirmAction("Remove Question", "Are you sure you want to delete this question?")) {
        currentFields = currentFields.filter(f => f.id !== id);
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
            <button class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545;">&times;</button>
        </div>
    `;
}

window.addOptionRow = function(btn) {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.innerHTML = generateOptionRow("");
    container.appendChild(div.firstElementChild);
}