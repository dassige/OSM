// public/js/forms-manage.js

let forms = [];
let currentForm = null;
let currentFields = [];
let originalFormState = null;
let formSortMode = "name_asc";

function toggleFormSort() {
  const btn = document.getElementById("btnSortForms");
  switch (formSortMode) {
    case "name_asc":
      formSortMode = "name_desc";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
      btn.title = "Sort by Name (Z-A)";
      break;
    case "name_desc":
      formSortMode = "status_active";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
      btn.title = "Sort by Status (Active First)";
      break;
    case "status_active":
      formSortMode = "status_disabled";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
      btn.title = "Sort by Status (Disabled First)";
      break;
    default:
      formSortMode = "name_asc";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18H3M21 6H3M17 12H3"/></svg>`;
      btn.title = "Sort by Name (A-Z)";
      break;
  }
  renderFormList();
}
document.addEventListener("DOMContentLoaded", () => {
  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      if (c.loginTitle) {
        document.title = "Forms Manager - " + c.loginTitle;
        document.getElementById("pageHeader").innerText = "Forms Manager";
      }
      if (c.appBackground)
        document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === "demo")
        document.getElementById("demoBanner").style.display = "block";
    });

  fetch("/api/user-session")
    .then((r) => r.json())
    .then((user) => {
      const role = user.role || "guest";
      if (role !== "admin" && role !== "superadmin") {
        alert("Access Denied.");
        window.location.href = "/";
      } else {
        loadForms();
      }
    })
    .catch(() => (window.location.href = "/login.html"));

  initMainEditor();

  const canvas = document.getElementById("fieldsCanvas");
  new Sortable(canvas, {
    handle: ".drag-handle",
    animation: 150,
  });
});

function initMainEditor() {
  tinymce.init({
    selector: "#formIntro",
    height: 150,
    menubar: false,
    plugins:
      "link lists autolink image preview searchreplace visualblocks code fullscreen table help wordcount",
    toolbar:
      "undo redo | styles | bold italic underline forecolor | alignleft aligncenter alignright | bullist numlist | link image | table | removeformat code",
    content_style:
      "body { font-family:Helvetica,Arial,sans-serif; font-size:14px; margin: 8px; } body.dark-mode { background: #333; color: #fff; }",
  });
}

function initFieldEditor(id) {
  tinymce.init({
    selector: "#" + id,
    height: 200,
    menubar: false,
    plugins:
      "link lists autolink image preview searchreplace visualblocks code fullscreen table help wordcount",
    toolbar:
      "undo redo | styles | bold italic underline forecolor | alignleft aligncenter alignright | bullist numlist | link image | table | removeformat code",
    content_style:
      "body { font-family:Helvetica,Arial,sans-serif; font-size:14px; margin: 8px; } body.dark-mode { background: #333; color: #fff; }",
  });
}

function getFormData() {
  const name = document.getElementById("formName").value;
  const introEditor = tinymce.get("formIntro");
  // Normalize intro: TinyMCE can sometimes return an empty string or a single break
  const intro = introEditor ? introEditor.getContent() : "";

  const structure = Array.from(document.querySelectorAll(".field-card")).map(
    (card) => {
      const id = card.getAttribute("data-id");
      const type = card.getAttribute("data-type");
      const editor = tinymce.get(`editor_${id}`);
      const description = editor ? editor.getContent() : "";
      const required = !!card.querySelector(".field-required-check").checked;

      let options = [];
      let renderAs = "radio";
      let correctAnswer = null;

      if (type === "radio" || type === "checkboxes") {
        const rows = card.querySelectorAll(".option-row");
        // Filter out empty labels to match load state
        options = Array.from(rows)
          .map((r) => r.querySelector(".option-input").value)
          .filter((v) => v.trim() !== "");

        const sel = card.querySelector(".field-render-as");
        if (sel) renderAs = sel.value;

        if (type === "radio") {
          const selected = Array.from(rows).find(
            (r) => r.querySelector(".correct-mark-radio")?.checked
          );
          correctAnswer = selected
            ? selected.querySelector(".option-input").value
            : null;
        } else {
          correctAnswer = Array.from(rows)
            .filter((r) => r.querySelector(".correct-mark-cb")?.checked)
            .map((r) => r.querySelector(".option-input").value);
        }
      } else if (type === "boolean") {
        const sel = card.querySelector(".field-render-as");
        if (sel) renderAs = sel.value;
        const selected = card.querySelector(".bool-correct:checked");
        correctAnswer = selected ? selected.value : null;
      } else if (type === "text_multi") {
        // Normalize empty reference answer to empty string
        correctAnswer =
          card.querySelector(".reference-answer-input")?.value || "";
      }

      // IMPORTANT: The key order here must match originalFormState in loadEditor exactly
      return {
        id,
        type,
        description,
        required,
        options,
        renderAs,
        correctAnswer,
      };
    }
  );

  return { name, intro, structure };
}

function isFormDirty() {
  if (!originalFormState) return false;
  const current = getFormData();
  return JSON.stringify(current) !== JSON.stringify(originalFormState);
}

async function checkDirty(actionName) {
  if (isFormDirty()) {
    const confirm = await confirmAction(
      "Unsaved Changes",
      `You have unsaved changes in "${
        currentForm.name || "New Form"
      }".\n\nDo you want to discard them?`
    );
    return confirm;
  }
  return true;
}

// --- API Interactions ---

async function loadForms() {
  try {
    const res = await fetch("/api/forms");
    if (!res.ok) throw new Error("Failed to load");
    forms = await res.json();
    renderFormList();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function saveForm() {
  const data = getFormData();
  const status = currentForm ? currentForm.status : 0;

  const payload = { ...data, status };
  const method = currentForm && currentForm.id ? "PUT" : "POST";
  const url =
    currentForm && currentForm.id
      ? `/api/forms/${currentForm.id}`
      : "/api/forms";

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save");
    const result = await res.json();
    if (result.id) {
      // [FIX] Include public_id from server result
      currentForm = { ...payload, id: result.id, public_id: result.public_id };
    } else {
      currentForm = { ...currentForm, ...payload };
    }
    originalFormState = getFormData();

    showToast("Form saved successfully", "success");
    loadForms();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function updateStatus(id, enabled) {
  try {
    await fetch(`/api/forms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: enabled ? 1 : 0 }),
    });
    const f = forms.find((x) => x.id === id);
    if (f) f.status = enabled ? 1 : 0;
    if (currentForm && currentForm.id === id) {
        currentForm.status = enabled ? 1 : 0;
    }
    showToast(`Form ${enabled ? "Enabled" : "Disabled"}`, "success");
  } catch (e) {
    showToast("Failed to update status", "error");
    loadForms();
  }
}

async function deleteForm() {
  if (!currentForm || !currentForm.id) return;

  try {
    // 1. Check if form is used by any skills
    const usageRes = await fetch(`/api/forms/${currentForm.id}/usage`);
    const usageData = await usageRes.json();

    let message = `Are you sure you want to delete the form '${currentForm.name}'?`;
    let title = "Delete Form";

    if (usageData.count > 0) {
      title = "Form In Use!";
      const skillList = usageData.skills.join(", ");
      message = `⚠️ WARNING: This form is currently used by the following skills: \n\n[ ${skillList} ]\n\nDeleting this form will remove the link from all these skills. Do you want to proceed?`;
    }

    // 2. Show the custom modal (confirmAction uses the custom UI from utils.js)
    if (!(await confirmAction(title, message))) return;

    // 3. Proceed with deletion
    const delRes = await fetch(`/api/forms/${currentForm.id}`, {
      method: "DELETE",
    });
    if (!delRes.ok) throw new Error("Deletion failed");

    showToast("Form deleted and skill references removed", "success");

    // Reset UI
    currentForm = null;
    originalFormState = null;
    document.getElementById("builderPanel").style.display = "none";
    document.getElementById("emptyPanel").style.display = "flex";
    loadForms();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function previewForm() {
  if (isFormDirty()) {
    const doSave = await confirmAction(
      "Unsaved Changes",
      "You have unsaved changes.\n\nSave now to see them in the preview?"
    );
    if (doSave) {
      await saveForm();
      if (isFormDirty()) return;
    } else {
      return;
    }
  }

  if (!currentForm || !currentForm.id) {
    return showToast("Please save the form first.", "warning");
  }

  window.open(
    `forms-view.html?id=${currentForm.public_id}&preview=true`,
    "_blank"
  );
}

// --- Import/Export Logic ---

// Single Form Export
async function exportSingleForm() {
  // If saved form, use API
  if (currentForm && currentForm.id) {
    window.location.href = `/api/forms/${currentForm.id}/export`;
  } else {
    // If unsaved/new, generate JSON locally
    const data = getFormData();
    const filename = `form_export_${data.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// Single Form Import
function importSingleForm(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.name || !Array.isArray(data.structure))
        throw new Error("Invalid form format");

      // Populate editor
      loadEditor({
        ...currentForm, // Keep ID if exists (overwrite fields)
        name: data.name,
        intro: data.intro || "",
        status: data.status || 0,
        structure: data.structure,
      });
      showToast("Form imported into editor. Click Save to persist.", "success");
    } catch (err) {
      showToast("Import failed: " + err.message, "error");
    }
  };
  reader.readAsText(file);
  input.value = ""; // Reset
}

// Bulk Export
function exportAllForms() {
  window.location.href = "/api/forms/export/all";
}

// Bulk Import
async function importAllForms(input) {
  const file = input.files[0];
  if (!file) return;

  // --- [CONFIRMATION MODAL] ---
  if (
    !(await confirmAction(
      "Bulk Import",
      "WARNING: This will DELETE ALL existing forms and replace them with the imported file.\n\nAre you sure?"
    ))
  ) {
    input.value = ""; // Clear input if user cancels
    return;
  }

  const formData = new FormData();
  formData.append("formsFile", file);

  try {
    const res = await fetch("/api/forms/import/all", {
      method: "POST",
      body: formData,
    });
    const result = await res.json();

    if (res.ok) {
      showToast(`Successfully imported ${result.count} forms.`, "success");
      // Reset view
      currentForm = null;
      document.getElementById("builderPanel").style.display = "none";
      document.getElementById("emptyPanel").style.display = "flex";
      loadForms();
    } else {
      throw new Error(result.error);
    }
  } catch (e) {
    showToast("Bulk import failed: " + e.message, "error");
  }
  input.value = "";
}

// --- UI Rendering ---

function renderFormList() {
  const list = document.getElementById("formList");
  list.innerHTML = "";

  const sortedForms = [...forms].sort((a, b) => {
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    const statusA = a.status;
    const statusB = b.status;

    switch (formSortMode) {
      case "name_asc":
        return nameA.localeCompare(nameB);
      case "name_desc":
        return nameB.localeCompare(nameA);
      case "status_active":
        if (statusA !== statusB) return statusB - statusA;
        return nameA.localeCompare(nameB);
      case "status_disabled":
        if (statusA !== statusB) return statusA - statusB;
        return nameA.localeCompare(nameB);
      default:
        return 0;
    }
  });

  sortedForms.forEach((f) => {
    const item = document.createElement("div");
    item.className = `form-item ${
      currentForm && currentForm.id === f.id ? "active" : ""
    }`;

    const toggleHtml = `
            <label class="switch" onclick="event.stopPropagation();" title="Toggle On/Off">
                <input type="checkbox" ${
                  f.status ? "checked" : ""
                } onchange="updateStatus(${f.id}, this.checked)">
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

async function createNewForm() {
  if (document.getElementById("builderPanel").style.display === "flex") {
    if (!(await checkDirty())) return;
  }
  loadEditor({ name: "New Form", status: 0, intro: "", structure: [] });
}

async function selectForm(id) {
  if (currentForm && currentForm.id === id) return;
  if (document.getElementById("builderPanel").style.display === "flex") {
    if (!(await checkDirty())) return;
  }

  try {
    const res = await fetch(`/api/forms/${id}`);
    loadEditor(await res.json());
  } catch (e) {
    console.error(e);
  }
}

function loadEditor(form) {
  currentForm = form;
  currentFields = form.structure || [];

  document.getElementById("emptyPanel").style.display = "none";
  document.getElementById("builderPanel").style.display = "flex";
  renderFormList();

  // Populate UI
  const nameInput = document.getElementById("formName");
  nameInput.value = form.name || "";
  if (tinymce.get("formIntro"))
    tinymce.get("formIntro").setContent(form.intro || "");

  renderFields();

  // Setup initial state for dirty checking
  originalFormState = {
    name: form.name || "",
    intro: form.intro || "",
    structure: (form.structure || []).map((f) => ({
      id: f.id,
      type: f.type,
      description: f.description || "",
      required: !!f.required,
      options: f.options || [],
      renderAs: f.renderAs || "radio",
      // Normalize correctAnswer to null if undefined to match collector
      correctAnswer: f.correctAnswer !== undefined ? f.correctAnswer : null,
    })),
  };
}

function addField(type) {
  const newField = {
    id: "fld_" + Date.now().toString(36),
    type: type,
    required: false,
    description: "",
    options: type === "radio" || type === "checkboxes" ? ["Option 1"] : [],
    renderAs: "radio",
  };
  currentFields.push(newField);
  renderFieldItem(newField, true);

  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, 100);
}

function cleanupFieldEditors() {
  const editors = tinymce.get().filter((ed) => ed.id.startsWith("editor_"));
  editors.forEach((ed) => ed.remove());
}

function renderFields() {
  cleanupFieldEditors();
  const canvas = document.getElementById("fieldsCanvas");
  canvas.innerHTML = "";
  currentFields.forEach((field) => renderFieldItem(field));
}

function renderFieldItem(field) {
  const canvas = document.getElementById("fieldsCanvas");
  const div = document.createElement("div");
  div.className = "field-card expanded";
  div.setAttribute("data-id", field.id);
  div.setAttribute("data-type", field.type);

  const isReq = field.required ? "checked" : "";

  let html = `
        <div class="field-header" onclick="toggleFieldCard(this)">
            <span class="drag-handle">☰</span>
            <span class="field-type-badge">${field.type}</span>
            <div class="header-controls" onclick="event.stopPropagation()">
                <label class="switch" style="margin-bottom:0 !important;"><input type="checkbox" class="field-required-check" ${isReq}><span class="slider"></span></label>
                <span style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-left:8px;">Required</span>
            </div>
            <span style="flex:1;"></span>
            <button type="button" class="btn-icon delete" onclick="removeField(event, '${
              field.id
            }')" title="Delete Question" style="margin-right:15px; color:#dc3545;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
            </button>
            <span class="arrow-icon">▼</span>
        </div>
        <div class="field-body" style="padding: 25px;">
            <div class="form-group">
                <label>Question Text</label>
                <textarea id="editor_${field.id}">${
    field.description || ""
  }</textarea>
            </div>`;

  if (field.type === "radio" || field.type === "checkboxes") {
    if (field.type === "radio") {
      const selectedRadio =
        !field.renderAs || field.renderAs === "radio" ? "selected" : "";
      const selectedDropdown = field.renderAs === "dropdown" ? "selected" : "";
      html += `
                <div class="form-group">
                    <label style="color:var(--text-muted); font-size:13px;">Display Style:</label>
                    <select class="field-render-as" style="padding:8px; border-radius:4px; border:1px solid #ccc; background:var(--input-bg); color:var(--text-main); width:200px;">
                        <option value="radio" ${selectedRadio}>Radio Buttons</option>
                        <option value="dropdown" ${selectedDropdown}>Dropdown Menu</option>
                    </select>
                </div>`;
    }

    const correctAnswers = Array.isArray(field.correctAnswer)
      ? field.correctAnswer
      : [field.correctAnswer];

    html += `
            <div class="form-group">
                <label>Options (Select correct answer mark)</label>
                <div class="options-container">`;
    if (field.options && field.options.length > 0) {
      field.options.forEach((opt) => {
        const isCorrect = correctAnswers.includes(opt);
        html += generateOptionRow(field.type, field.id, opt, isCorrect);
      });
    } else {
      html += generateOptionRow(field.type, field.id, "Option 1", false);
    }
    html += `
                </div>
                <button type="button" class="btn-sm" style="margin-top:15px; background-color:#6c757d;" onclick="addOptionRow(this)">+ Add Option</button>
            </div>`;
  } else if (field.type === "boolean") {
    const selectedRadio =
      !field.renderAs || field.renderAs === "radio" ? "selected" : "";
    const selectedDropdown = field.renderAs === "dropdown" ? "selected" : "";

    const yesCheck = field.correctAnswer === "Yes" ? "checked" : "";
    const noCheck = field.correctAnswer === "No" ? "checked" : "";
    html += `
            <div class="form-group">
                <label style="color:var(--text-muted); font-size:13px;">Display Style:</label>
                <select class="field-render-as" style="padding:8px; border-radius:4px; border:1px solid #ccc; background:var(--input-bg); color:var(--text-main); width:200px;">
                    <option value="radio" ${selectedRadio}>Radio Buttons</option>
                    <option value="dropdown" ${selectedDropdown}>Dropdown Menu</option>
                </select>
            </div>
            <div class="form-group">
                <label>Correct Answer:</label>
                <div class="bool-correct-wrapper">
                    <label style="font-weight:normal; margin-bottom:0 !important; cursor:pointer;"><input type="radio" name="bool_correct_${field.id}" class="bool-correct" value="Yes" ${yesCheck}> Yes</label>
                    <label style="font-weight:normal; margin-bottom:0 !important; cursor:pointer;"><input type="radio" name="bool_correct_${field.id}" class="bool-correct" value="No" ${noCheck}> No</label>
                </div>
            </div>`;
  } else if (field.type === "text_multi") {
    html += `
            <div class="form-group">
                <label>Expected/Reference Answer (Admin Use)</label>
                <textarea class="reference-answer-input" rows="3" style="width:100%; box-sizing:border-box; padding:12px; border-radius:4px; border:1px solid #ccc;" placeholder="Provide reference text for evaluation...">${
                  field.correctAnswer || ""
                }</textarea>
            </div>`;
  }

  html += `</div>`;
  div.innerHTML = html;
  canvas.appendChild(div);
  setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

window.toggleAllFields = function () {
  const cards = document.querySelectorAll(".field-card");
  const btnIcon = document.getElementById("iconToggleAll");

  // Logic: If any card is collapsed, expand everything.
  // Otherwise (if all are expanded), collapse everything.
  const anyCollapsed = Array.from(cards).some(
    (c) => !c.classList.contains("expanded")
  );

  cards.forEach((c) => {
    if (anyCollapsed) {
      c.classList.add("expanded");
    } else {
      c.classList.remove("expanded");
    }
  });

  // Update the global toggle icon direction
  if (btnIcon) {
    // Point Up (Expanded) if anyCollapsed was true (meaning we just expanded all)
    // Point Down (Collapsed) if anyCollapsed was false (meaning we just collapsed all)
    btnIcon.style.transform = anyCollapsed ? "rotate(180deg)" : "rotate(0deg)";
  }
};
window.toggleFieldCard = function (header) {
  header.parentElement.classList.toggle("expanded");
};

async function handleRemoveField(id) {
  if (
    await confirmAction(
      "Remove Question",
      "Are you sure you want to delete this question?"
    )
  ) {
    if (tinymce.get(`editor_${id}`)) tinymce.get(`editor_${id}`).remove();
    currentFields = currentFields.filter((f) => f.id !== id);
    const card = document.querySelector(`.field-card[data-id="${id}"]`);
    if (card) card.remove();
  }
}
window.removeField = function (e, id) {
  e.stopPropagation();
  handleRemoveField(id);
};

function generateOptionRow(type, fieldId, value = "", isCorrect = false) {
  const markerType = type === "radio" ? "radio" : "checkbox";
  const markerClass =
    type === "radio" ? "correct-mark-radio" : "correct-mark-cb";
  const checked = isCorrect ? "checked" : "";

  // Use fieldId in the name so radio groups are scoped to their specific question
  const groupName = `correct_marker_${fieldId}`;

  const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path></svg>`;

  return `
        <div class="option-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <input type="${markerType}" name="${groupName}" class="${markerClass}" ${checked} title="Mark as Correct" style="width:18px; height:18px; cursor:pointer; flex-shrink:0;">
            <input type="text" class="option-input" value="${value}" placeholder="Option label" style="flex:1; padding:8px; border:1px solid var(--border-color); border-radius:4px;">
            <button type="button" class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545; flex-shrink:0;" title="Remove Option">
                ${deleteIcon}
            </button>
        </div>
    `;
}

window.addOptionRow = function (btn) {
  const card = btn.closest(".field-card");
  const type = card.getAttribute("data-type");
  const fieldId = card.getAttribute("data-id");
  const container = card.querySelector(".options-container");

  const div = document.createElement("div");
  div.innerHTML = generateOptionRow(type, fieldId, "");
  container.appendChild(div.firstElementChild);
};
