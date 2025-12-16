// public/js/forms-manage.js

let forms = [];
let currentForm = null;
let currentFields = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. App Configuration & Theme
    fetch('/ui-config')
        .then(r => r.json())
        .then(c => {
            if (c.loginTitle) {
                document.title = "Forms Manager - " + c.loginTitle;
                document.getElementById('pageHeader').innerText = "Forms Manager";
            }
            if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
            if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
        });

    // 2. Role Check (Protect UI)
    fetch('/api/user-session')
        .then(r => r.json())
        .then(user => {
            const role = user.role || 'guest';
            // Only 'admin' or 'superadmin' can edit forms
            if (role !== 'admin' && role !== 'superadmin') {
                alert("Access Denied: You must be an Administrator to manage forms.");
                window.location.href = '/';
            } else {
                // 3. Load Data only if authorized
                loadForms();
            }
        })
        .catch(() => window.location.href = '/login.html');

    initTinyMCE();
    
    // Init SortableJS
    const canvas = document.getElementById('fieldsCanvas');
    new Sortable(canvas, {
        handle: '.drag-handle',
        animation: 150
    });
});

function initTinyMCE() {
    tinymce.init({
        selector: '.rich-editor',
        height: 150,
        menubar: false,
        plugins: 'link lists autolink',
        toolbar: 'bold italic underline | bullist numlist | link removeformat',
        content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; color: #333; } body.dark-mode { background: #333; color: #fff; }'
    });
}


// --- API Interactions ---

async function loadForms() {
    try {
        const res = await fetch('/api/forms');
        if (!res.ok) throw new Error("Failed to load forms");
        forms = await res.json();
        renderFormList();
    } catch (e) {
        console.error(e);
        if(window.showToast) showToast(e.message, 'error');
    }
}

async function saveForm() {
    if (!currentForm) return;

    // 1. Gather Data
    const name = document.getElementById('formName').value;
    const status = document.getElementById('formStatus').checked;
    const intro = tinymce.get('formIntro').getContent();

    // 2. Gather Fields from DOM to ensure order matches visual
    const fieldCards = document.querySelectorAll('.field-card');
    const structure = Array.from(fieldCards).map(card => {
        const id = card.getAttribute('data-id');
        // Find the data object in memory that matches this DOM ID
        const fieldData = currentFields.find(f => f.id === id);
        
        // Update mutable properties from inputs
        if(fieldData) {
            fieldData.label = card.querySelector('.field-label-input').value;
            
            // Required Toggle (if exists)
            const reqCheck = card.querySelector('.field-required-check');
            if(reqCheck) fieldData.required = reqCheck.checked;

            // Options (if exists)
            if(fieldData.options) {
                const optInputs = card.querySelectorAll('.option-input');
                fieldData.options = Array.from(optInputs).map(inp => inp.value).filter(v => v.trim() !== "");
            }
            
            // Description (TinyMCE) - Need to use ID to get content
            // Note: TinyMCE might be heavy for every field. 
            // For simplicity, we assume plain text description or a single shared editor instance in complex apps.
            // Here, we'll use a simple textarea for field description to save resources.
            const descInput = card.querySelector('.field-desc-input');
            if(descInput) fieldData.description = descInput.value;
        }
        return fieldData;
    }).filter(f => f); // remove nulls

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
        if(result.id) currentForm.id = result.id; // Handle new ID
        
        showToast("Form saved successfully", "success");
        loadForms(); // Refresh list
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteForm() {
    if(!currentForm || !currentForm.id) return;
    if(!await confirmAction("Delete Form", `Are you sure you want to delete '${currentForm.name}'?`)) return;

    try {
        await fetch(`/api/forms/${currentForm.id}`, { method: 'DELETE' });
        showToast("Form deleted", "success");
        currentForm = null;
        document.getElementById('builderPanel').style.display = 'none';
        document.getElementById('emptyPanel').style.display = 'flex';
        loadForms();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// --- UI Rendering ---

function renderFormList() {
    const list = document.getElementById('formList');
    list.innerHTML = '';
    
    forms.forEach(f => {
        const item = document.createElement('div');
        item.className = `form-item ${currentForm && currentForm.id === f.id ? 'active' : ''}`;
        
        const color = f.status ? '#28a745' : '#dc3545';
        
        item.innerHTML = `
            <div style="font-weight:bold;">${f.name}</div>
            <div style="font-size:12px; color:#666; margin-top:4px;">
                <span class="form-status-dot" style="background:${color}"></span>
                ${f.status ? 'Enabled' : 'Disabled'}
            </div>
        `;
        item.onclick = () => selectForm(f.id);
        list.appendChild(item);
    });
}

function createNewForm() {
    const newForm = { name: "New Form", status: 0, intro: "", structure: [] };
    loadEditor(newForm);
}

async function selectForm(id) {
    // Show loading?
    try {
        const res = await fetch(`/api/forms/${id}`);
        const fullForm = await res.json();
        loadEditor(fullForm);
    } catch (e) { console.error(e); }
}

function loadEditor(form) {
    currentForm = form;
    currentFields = form.structure || []; // Deep copy if needed, but simple assignment ok here
    
    // UI Toggle
    document.getElementById('emptyPanel').style.display = 'none';
    document.getElementById('builderPanel').style.display = 'flex';
    renderFormList(); // Re-render to update active state

    // Bind Data
    document.getElementById('formName').value = form.name || "";
    document.getElementById('formStatus').checked = !!form.status;
    updateStatusLabel(!!form.status);
    
    // TinyMCE Set Content
    if(tinymce.get('formIntro')) {
        tinymce.get('formIntro').setContent(form.intro || "");
    }

    renderFields();
}

document.getElementById('formStatus').addEventListener('change', (e) => updateStatusLabel(e.target.checked));

function updateStatusLabel(checked) {
    const lbl = document.getElementById('statusLabel');
    lbl.textContent = checked ? "Enabled" : "Disabled";
    lbl.style.color = checked ? "var(--success)" : "var(--text-muted)";
}

function copyFormLink() {
    if(!currentForm.id) {
        showToast("Save the form first.", "warning");
        return;
    }
    const url = `${window.location.origin}/forms-view.html?id=${currentForm.id}`;
    navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard!", "success");
}

// --- Field Builder Logic ---

function addField(type) {
    const id = 'fld_' + Date.now().toString(36);
    const newField = {
        id: id,
        type: type,
        label: "New Question",
        required: false,
        description: "",
        options: (type === 'radio' || type === 'checkboxes' || type === 'select') ? ["Option 1", "Option 2"] : []
    };
    
    if(type === 'html_block') {
        newField.label = "Information Block";
    }

    currentFields.push(newField);
    renderFieldItem(newField, true); // Append single item
    // Scroll to bottom
    const canvas = document.getElementById('fieldsCanvas');
    canvas.scrollTop = canvas.scrollHeight;
}

function renderFields() {
    const canvas = document.getElementById('fieldsCanvas');
    canvas.innerHTML = '';
    currentFields.forEach(field => renderFieldItem(field));
}

function renderFieldItem(field, append = false) {
    const canvas = document.getElementById('fieldsCanvas');
    const div = document.createElement('div');
    div.className = 'field-card expanded'; // Default expanded for editing
    div.setAttribute('data-id', field.id);

    // Header
    let html = `
        <div class="field-header" onclick="this.parentElement.classList.toggle('expanded')">
            <span class="drag-handle">☰</span>
            <span class="field-type-badge">${field.type}</span>
            <span style="flex:1; font-weight:bold; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${field.label}</span>
            <button class="btn-icon delete" onclick="removeField(event, '${field.id}')" title="Delete">×</button>
        </div>
        <div class="field-body">
            <div class="form-group">
                <label>Label / Question</label>
                <input type="text" class="field-label-input" value="${field.label || ''}" onkeyup="this.closest('.field-card').querySelector('.field-header span:nth-child(3)').innerText = this.value">
            </div>
            <div class="form-group">
                <label>Description / Help Text</label>
                <textarea class="field-desc-input" rows="2">${field.description || ''}</textarea>
            </div>
    `;

    // Type Specific Settings
    if(field.type !== 'html_block' && field.type !== 'boolean') {
        html += `
            <div class="form-group">
                <label style="display:inline-flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" class="field-required-check" ${field.required ? 'checked' : ''} style="width:auto; margin-right:8px;"> 
                    Mandatory Field
                </label>
            </div>
        `;
    }

    // Options Editor (Radio, Select, Checkboxes)
    if(field.options) {
        html += `<div class="form-group"><label>Options</label><div class="options-container">`;
        field.options.forEach(opt => {
            html += generateOptionRow(opt);
        });
        html += `</div><button type="button" class="btn-sm" style="margin-top:5px;" onclick="addOptionRow(this)">+ Add Option</button></div>`;
    }

    html += `</div>`; // Close Body
    div.innerHTML = html;

    if(append) canvas.appendChild(div);
    else canvas.appendChild(div);
}

function removeField(e, id) {
    e.stopPropagation(); // Prevent toggle
    if(!confirm("Delete this field?")) return;
    
    // Remove from array
    currentFields = currentFields.filter(f => f.id !== id);
    // Remove from DOM
    const card = document.querySelector(`.field-card[data-id="${id}"]`);
    if(card) card.remove();
}

function generateOptionRow(value) {
    return `
        <div class="option-row">
            <input type="text" class="option-input" value="${value}" placeholder="Option label">
            <button class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545;">&times;</button>
        </div>
    `;
}

// Exposed to global scope for the inline onclick handler
window.addOptionRow = function(btn) {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.innerHTML = generateOptionRow("");
    container.appendChild(div.firstElementChild);
}

// Expose delete function to global scope for inline onclick
window.removeField = removeField;