let forms = [];
let currentForm = null;
let currentFields = [];
let originalFormState = null;
let formSortMode = "name_asc";
let uiConfig = null;

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
      uiConfig = c;
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
  // Get status from the new editor toggle
  const status = document.getElementById("formStatusToggle").checked ? 1 : 0;
  // NEW Automation Fields
  const min_score = document.getElementById("minScore").value;
  const min_score_type = document.getElementById("minScoreType").value;
  const max_tries = document.getElementById("maxTries").value;
  const intro = tinymce.get("formIntro")
    ? tinymce.get("formIntro").getContent()
    : "";

  const structure = Array.from(document.querySelectorAll(".field-card")).map(
    (card) => {
      const id = card.getAttribute("data-id");

      const type = card.getAttribute("data-type");
      const points = parseFloat(card.querySelector(".field-points").value) || 0; // NEW Points
      const description = tinymce.get(`editor_${id}`)
        ? tinymce.get(`editor_${id}`).getContent()
        : "";
      const required = !!card.querySelector(".field-required-check").checked;

      let options = [];
      let renderAs = card.querySelector(".field-render-as")?.value || "radio";
      let correctAnswer = null;

      if (type === "radio" || type === "checkboxes") {
        const rows = card.querySelectorAll(".option-row");
        options = Array.from(rows)
          .map((r) => r.querySelector(".option-input").value)
          .filter((v) => v.trim() !== "");
        if (type === "radio") {
          const selected = Array.from(rows).find(
            (r) => r.querySelector(".correct-mark-radio")?.checked,
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
        const selected = card.querySelector(".bool-correct:checked");
        correctAnswer = selected ? selected.value : null;
      } else if (type === "text_multi") {
        correctAnswer =
          card.querySelector(".reference-answer-input")?.value || "";
      }

      return {
        id,
        type,
        description,
        required,
        options,
        renderAs,
        correctAnswer,
        points,
      };
    },
  );

  return {
    name,
    status,
    intro,
    structure,
    min_score: parseFloat(document.getElementById("minScore").value) || 0,
    min_score_type: document.getElementById("minScoreType").value,
    max_tries: parseInt(document.getElementById("maxTries").value) || 1,
  };
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
      }".\n\nDo you want to discard them?`,
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
  // Final validation check
  const minScoreInput = document.getElementById("minScore");
  if (minScoreInput.style.borderColor === "var(--danger)") {
    showToast("Cannot save: Passing threshold is invalid.", "error");
    return;
  }
  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json();
      // Extract specific Joi validation reasons or fallback to general error
      const reason = errorData.details
        ? errorData.details.join(" | ")
        : errorData.error || "Unknown error";
      throw new Error(reason);
    }

    const result = await res.json();
    // ... (Success handling as per existing forms-manage.js) ...
    showToast("Form saved successfully", "success");
    // Reset the baseline so isFormDirty() returns false until further edits
    originalFormState = getFormData();

    loadForms();
  } catch (e) {
    // 1. Display reason to user
    showToast("Save Failed: Check console for details", "error");

    // 2. Add to browser console
    console.error("[FormsManager] Error saving form:", e.message);

    // 3. Add to System Event Log for auditing
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "Forms",
        title: "Form Save Failed",
        payload: { error: e.message, formName: data.name },
      }),
    });
  }
}

async function updateStatus(id, enabled) {
  try {
    const res = await fetch(`/api/forms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: enabled ? 1 : 0 }),
    });

    if (!res.ok) throw new Error("Server rejected status update");

    // Update Local Cache
    const f = forms.find((x) => x.id === id);
    if (f) f.status = enabled ? 1 : 0;

    // Sync Editor if this is the active form
    if (currentForm && currentForm.id === id) {
      currentForm.status = enabled ? 1 : 0;
      document.getElementById("formStatusToggle").checked = enabled;
      // Also update original state status so preview doesn't prompt for save
      // just because of a status toggle
      if (originalFormState) originalFormState.status = enabled ? 1 : 0;
    }

    renderFormList(); // Refresh sidebar visuals
    showToast(`Form ${enabled ? "Enabled" : "Disabled"}`, "success");
  } catch (e) {
    showToast("Update Failed: " + e.message, "error");
    loadForms(); // Revert UI
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
      "You have unsaved changes.\n\nSave now to see them in the preview?",
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
    "_blank",
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
      "WARNING: This will DELETE ALL existing forms and replace them with the imported file.\n\nAre you sure?",
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
  loadEditor({
    name: "New Form",
    status: 0,
    intro: "",
    structure: [],
    min_score: uiConfig.defaultMinScore,
    min_score_type: uiConfig.defaultMinScoreType,
    max_tries: uiConfig.defaultMaxTries,
  });
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
  document
    .getElementById("minScore")
    .addEventListener("input", validateThreshold);
  document
    .getElementById("minScoreType")
    .addEventListener("change", validateThreshold);
  // 1. Sync Toggles and Inputs
  const nameInput = document.getElementById("formName");
  nameInput.value = form.name || "";
  // NEW Automation Population
  document.getElementById("minScore").value = form.min_score || 0;
  document.getElementById("minScoreType").value =
    form.min_score_type || "percentage";
  document.getElementById("maxTries").value = form.max_tries || 1;
  nameInput.style.height = "";
  nameInput.style.height = nameInput.scrollHeight + "px";

  document.getElementById("formStatusToggle").checked = !!form.status;
  if (tinymce.get("formIntro"))
    tinymce.get("formIntro").setContent(form.intro || "");

  renderFields();
  renderFormList();

  setTimeout(() => {
    originalFormState = getFormData();
  }, 500);
  setTimeout(() => {
    updateMaxScore();
    validateThreshold();
  }, 100);
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
  updateMaxScore();
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
                <span style="margin-left:20px; font-size:12px; font-weight:bold; color:var(--text-muted);">Points:</span>
                <input type="number" class="field-points" value="${field.points || 1}" min="0" style="width:50px; padding:2px 5px; margin-left:5px;">
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

  const pointsInput = div.querySelector(".field-points");
  pointsInput.addEventListener("input", updateMaxScore);

  setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

window.toggleAllFields = function () {
  const cards = document.querySelectorAll(".field-card");
  const btnIcon = document.getElementById("iconToggleAll");

  // Logic: If any card is collapsed, expand everything.
  // Otherwise (if all are expanded), collapse everything.
  const anyCollapsed = Array.from(cards).some(
    (c) => !c.classList.contains("expanded"),
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
      "Are you sure you want to delete this question?",
    )
  ) {
    if (tinymce.get(`editor_${id}`)) tinymce.get(`editor_${id}`).remove();
    currentFields = currentFields.filter((f) => f.id !== id);
    const card = document.querySelector(`.field-card[data-id="${id}"]`);
    if (card) card.remove();
    updateMaxScore();
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
window.copyAiPrompt = function () {
  const promptElement = document.querySelector("#aiHelpModal .code-block");
  if (!promptElement) return;

  const text = promptElement.innerText;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (window.showToast) {
        showToast("Prompt copied to clipboard!", "success");
      }
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
    });
};
/**
 * Sums all 'field-points' inputs and updates the header display.
 */
function updateMaxScore() {
  let total = 0;
  document.querySelectorAll(".field-points").forEach((input) => {
    total += parseFloat(input.value) || 0;
  });

  const display = document.getElementById("maxScoreDisplay");
  if (display) {
    display.textContent = total;
  }
  validateThreshold(); // Trigger validation whenever total changes
}
/**
 * Validates if the set passing threshold is mathematically achievable.
 * Provides visual feedback via red borders and warning text.
 */
function validateThreshold() {
  const minScoreInput = document.getElementById("minScore");
  const minScore = parseFloat(minScoreInput.value) || 0;
  const type = document.getElementById("minScoreType").value;
  const maxPossible =
    parseFloat(document.getElementById("maxScoreDisplay").textContent) || 0;
  const warningEl = document.getElementById("thresholdWarning");

  let isInvalid = false;

  if (type === "percentage") {
    if (minScore > 100) {
      isInvalid = true;
      warningEl.textContent = "⚠️ Percentage cannot exceed 100%";
    }
  } else {
    // 'number' mode
    if (minScore > maxPossible) {
      isInvalid = true;
      warningEl.textContent = `⚠️ Score cannot exceed max points (${maxPossible})`;
    }
  }

  // UI Feedback
  if (isInvalid) {
    minScoreInput.style.borderColor = "var(--danger)";
    minScoreInput.style.backgroundColor = "#fff5f5";
    warningEl.style.display = "block";
  } else {
    minScoreInput.style.borderColor = ""; // Reset to default
    minScoreInput.style.backgroundColor = "";
    warningEl.style.display = "none";
  }
}
/**
 * Opens the Scoring Simulator using current (unsaved) editor data.
 */
function testScoring() {
  const data = getFormData(); // Capture everything currently in the editor
  const container = document.getElementById("testFormContainer");
  const banner = document.getElementById("testResultBanner");

  banner.style.display = "none";
  container.innerHTML = "";

  if (data.structure.length === 0) {
    return showToast("Add some questions first!", "warning");
  }

  // Render questions for simulation
  data.structure.forEach((field, index) => {
    const div = document.createElement("div");
    div.style.marginBottom = "20px";
    div.style.paddingBottom = "15px";
    div.style.borderBottom = "1px solid #eee";

    let html = `<div style="font-weight:bold; margin-bottom:10px;">${index + 1}. ${field.description} <span style="color:#666; font-size:0.8em;">(${field.points} pts)</span></div>`;

    if (field.type === "radio" || field.type === "boolean") {
      const options = field.type === "boolean" ? ["Yes", "No"] : field.options;
      options.forEach((opt) => {
        html += `<label style="display:block; margin:5px 0; cursor:pointer;"><input type="radio" name="test_${field.id}" value="${opt}"> ${opt}</label>`;
      });
    } else if (field.type === "checkboxes") {
      field.options.forEach((opt) => {
        html += `<label style="display:block; margin:5px 0; cursor:pointer;"><input type="checkbox" name="test_${field.id}" value="${opt}"> ${opt}</label>`;
      });
    } else {
      html += `<div style="font-style:italic; color:#999;">Text fields are excluded from auto-scoring.</div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
  });

  openModal("testScoringModal");
}

/**
 * Calculates the score of the simulated attempt and displays result.
 */
function runScoringSimulation() {
  const data = getFormData();
  let achieved = 0;
  let maximum = 0;

  data.structure.forEach((field) => {
    const weight = parseFloat(field.points) || 0;
    maximum += weight;

    const inputs = document.getElementsByName(`test_${field.id}`);
    const selected = Array.from(inputs)
      .filter((i) => i.checked)
      .map((i) => i.value);

    if (field.type === "radio" || field.type === "boolean") {
      if (selected[0] === field.correctAnswer) achieved += weight;
    } else if (field.type === "checkboxes") {
      const correctArr = Array.isArray(field.correctAnswer)
        ? field.correctAnswer
        : [];
      if (correctArr.length === 0) return;

      const pointsPerOption = weight / correctArr.length;
      let qScore = 0;

      selected.forEach((val) => {
        if (correctArr.includes(val))
          qScore += pointsPerOption; // Match
        else qScore -= pointsPerOption; // Penalty
      });
      achieved += Math.max(0, qScore);
    }
  });

  // Display Result
  const banner = document.getElementById("testResultBanner");
  const scoreText = document.getElementById("testScoreText");
  const statusText = document.getElementById("testStatusText");

  const pct = maximum > 0 ? (achieved / maximum) * 100 : 0;
  const threshold = parseFloat(data.min_score);
  const isPass =
    data.min_score_type === "percentage"
      ? pct >= threshold
      : achieved >= threshold;

  banner.style.display = "block";
  banner.style.background = isPass ? "#d4edda" : "#f8d7da";
  banner.style.color = isPass ? "#155724" : "#721c24";

  scoreText.textContent = `Score: ${achieved.toFixed(2)} / ${maximum.toFixed(2)} (${pct.toFixed(1)}%)`;
  statusText.textContent = isPass
    ? `✓ Status: PASSED (Threshold: ${threshold}${data.min_score_type === "percentage" ? "%" : " pts"})`
    : `✗ Status: FAILED (Threshold: ${threshold}${data.min_score_type === "percentage" ? "%" : " pts"})`;
}
