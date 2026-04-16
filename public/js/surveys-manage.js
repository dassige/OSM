// public/js/surveys-manage.js

let surveys = [];
let currentSurvey = null;
let currentFields = [];
let originalSurveyState = null;
let surveySortMode = "name_asc";
let uiConfig = null;

function toggleSurveySort() {
  const btn = document.getElementById("btnSortSurveys");
  switch (surveySortMode) {
    case "name_asc":
      surveySortMode = "name_desc";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
      btn.title = "Sort by Name (Z-A)";
      break;
    case "name_desc":
      surveySortMode = "status_active";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
      btn.title = "Sort by Status (Active First)";
      break;
    case "status_active":
      surveySortMode = "status_disabled";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
      btn.title = "Sort by Status (Disabled First)";
      break;
    default:
      surveySortMode = "name_asc";
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18H3M21 6H3M17 12H3"/></svg>`;
      btn.title = "Sort by Name (A-Z)";
      break;
  }

// Attempt to persist the sort preference
  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
        key: "surveySortMode", 
        value: surveySortMode 
    }),
  }).catch((e) => console.log("Preference save bypassed", e));
  renderSurveyList();
}

document.addEventListener("DOMContentLoaded", () => {
  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      if (c.loginTitle) {
        document.title = "Surveys Manager - " + c.loginTitle;
        document.getElementById("pageHeader").innerText =
          "Surveys Manager - " + c.loginTitle;
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
        if (window.showToast) showToast("Access Denied.", "error");
        setTimeout(() => (window.location.href = "/"), 1500);
      } else {
        loadSurveys();
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
    selector: "#surveyIntro",
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

function getSurveyData() {
  const name = document.getElementById("surveyName").value;
  const status = document.getElementById("surveyStatusToggle").checked ? 1 : 0;
  const intro = tinymce.get("surveyIntro")
    ? tinymce.get("surveyIntro").getContent()
    : "";

  const structure = Array.from(document.querySelectorAll(".field-card")).map(
    (card) => {
      const id = card.getAttribute("data-id");
      const type = card.getAttribute("data-type");
      const description = tinymce.get(`editor_${id}`)
        ? tinymce.get(`editor_${id}`).getContent()
        : "";
      const required = !!card.querySelector(".field-required-check").checked;

      let options = [];
      let renderAs = card.querySelector(".field-render-as")?.value || "radio";

      if (type === "radio" || type === "checkboxes") {
        const rows = card.querySelectorAll(".option-row");
        options = Array.from(rows)
          .map((r) => r.querySelector(".option-input").value)
          .filter((v) => v.trim() !== "");
      }

      return { id, type, description, required, options, renderAs };
    },
  );

  return { name, status, intro, structure };
}

function isSurveyDirty() {
  if (!originalSurveyState) return false;
  const current = getSurveyData();
  return JSON.stringify(current) !== JSON.stringify(originalSurveyState);
}

async function checkDirty() {
  if (isSurveyDirty()) {
    const confirm = await confirmAction(
      "Unsaved Changes",
      `You have unsaved changes in "${currentSurvey.name || "New Survey"}".\n\nDo you want to discard them?`,
    );
    return confirm;
  }
  return true;
}

// --- API Interactions ---

async function loadSurveys() {
  try {
    const res = await fetch("/api/surveys");
    if (!res.ok) throw new Error("Failed to load");
    surveys = await res.json();
    renderSurveyList();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function saveSurvey() {
  const data = getSurveyData();
  const status = currentSurvey ? currentSurvey.status : 0;
  const payload = { ...data, status };
  const method = currentSurvey && currentSurvey.id ? "PUT" : "POST";
  const url =
    currentSurvey && currentSurvey.id
      ? `/api/surveys/${currentSurvey.id}`
      : "/api/surveys";

  if (uiConfig?.appMode === "demo") {
    return showToast("Saving is disabled in Demo Mode", "warning");
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Parse the response to get the newly created IDs
    const responseData = await res.json();

    if (!res.ok) {
      const reason = responseData.details
        ? responseData.details.join(" | ")
        : responseData.error || "Unknown error";
      throw new Error(reason);
    }

    // --- THE FIX ---
    // If it was a new creation, update our local state with the backend IDs
    // so subsequent saves trigger a PUT instead of a POST
    if (method === "POST" && responseData.id) {
      currentSurvey.id = responseData.id;
      if (responseData.publicId)
        currentSurvey.public_id = responseData.publicId;
    }

    showToast("Survey saved successfully", "success");
    originalSurveyState = getSurveyData();
    loadSurveys(); // Because currentSurvey.id is now set, it will highlight correctly in the list!
  } catch (e) {
    showToast("Save Failed: Check console for details", "error");
    console.error("[SurveysManager] Error saving survey:", e.message);
  }
}

async function updateStatus(id, enabled) {
  if (uiConfig?.appMode === "demo") {
    document.getElementById("surveyStatusToggle").checked = !enabled; // revert
    return showToast("Status changes disabled in Demo Mode", "warning");
  }
  const btnPublish = document.getElementById("btnPublish");
  if (btnPublish) btnPublish.disabled = !enabled;
  try {
    const res = await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: enabled ? 1 : 0 }),
    });

    if (!res.ok) throw new Error("Server rejected status update");

    const s = surveys.find((x) => x.id === id);
    if (s) s.status = enabled ? 1 : 0;

    if (currentSurvey && currentSurvey.id === id) {
      currentSurvey.status = enabled ? 1 : 0;
      document.getElementById("surveyStatusToggle").checked = enabled;
      if (originalSurveyState) originalSurveyState.status = enabled ? 1 : 0;
    }

    renderSurveyList();
    showToast(`Survey ${enabled ? "Enabled" : "Disabled"}`, "success");
  } catch (e) {
    showToast("Update Failed: " + e.message, "error");
    loadSurveys();
  }
}

async function deleteSurvey() {
  if (!currentSurvey || !currentSurvey.id) return;
  if (uiConfig?.appMode === "demo")
    return showToast("Deletion disabled in Demo Mode", "warning");

  try {
    if (
      !(await confirmAction(
        "Delete Survey",
        `Are you sure you want to delete '${currentSurvey.name}'? This action cannot be undone.`,
      ))
    )
      return;

    const delRes = await fetch(`/api/surveys/${currentSurvey.id}`, {
      method: "DELETE",
    });
    if (!delRes.ok) throw new Error("Deletion failed");

    showToast("Survey deleted", "success");

    currentSurvey = null;
    originalSurveyState = null;
    document.getElementById("builderPanel").style.display = "none";
    document.getElementById("emptyPanel").style.display = "flex";
    loadSurveys();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function previewSurvey() {
  if (isSurveyDirty()) {
    const doSave = await confirmAction(
      "Unsaved Changes",
      "You have unsaved changes.\n\nSave now to see them in the preview?",
    );
    if (doSave) {
      await saveSurvey();
      if (isSurveyDirty()) return;
    } else {
      return;
    }
  }

  if (!currentSurvey || !currentSurvey.id) {
    return showToast("Please save the survey first.", "warning");
  }

  window.open(
    `surveys-view.html?id=${currentSurvey.public_id}&preview=true`,
    "_blank",
  );
}

// --- Import/Export Logic ---

async function exportSingleSurvey() {
  if (currentSurvey && currentSurvey.id) {
    window.location.href = `/api/surveys/${currentSurvey.id}/export`;
  } else {
    const data = getSurveyData();
    const filename = `survey_export_${data.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
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

function importSingleSurvey(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.name || !Array.isArray(data.structure))
        throw new Error("Invalid format");

      loadEditor({
        ...currentSurvey,
        name: data.name,
        intro: data.intro || "",
        status: data.status || 0,
        structure: data.structure,
      });
      showToast(
        "Survey imported into editor. Click Save to persist.",
        "success",
      );
    } catch (err) {
      showToast("Import failed: " + err.message, "error");
    }
  };
  reader.readAsText(file);
  input.value = "";
}

function exportAllSurveys() {
  window.location.href = "/api/surveys/export/all";
}

async function importAllSurveys(input) {
  const file = input.files[0];
  if (!file) return;

  if (uiConfig?.appMode === "demo")
    return showToast("Bulk import disabled in Demo Mode", "warning");

  if (
    !(await confirmAction(
      "Bulk Import",
      "The imported survey templates will be added to the existing ones.\n\nAre you sure?",
    ))
  ) {
    input.value = "";
    return;
  }

  const formData = new FormData();
  formData.append("surveysFile", file);

  try {
    const res = await fetch("/api/surveys/import/all", {
      method: "POST",
      body: formData,
    });
    const result = await res.json();

    if (res.ok) {
      showToast(`Successfully imported ${result.count} surveys.`, "success");
      currentSurvey = null;
      document.getElementById("builderPanel").style.display = "none";
      document.getElementById("emptyPanel").style.display = "flex";
      loadSurveys();
    } else {
      throw new Error(result.error);
    }
  } catch (e) {
    showToast("Bulk import failed: " + e.message, "error");
  }
  input.value = "";
}

// --- UI Rendering ---

function renderSurveyList() {
  const list = document.getElementById("surveyList");
  list.innerHTML = "";

  const sortedSurveys = [...surveys].sort((a, b) => {
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    const statusA = a.status;
    const statusB = b.status;

    switch (surveySortMode) {
      case "name_asc":
        return nameA.localeCompare(nameB);
      case "name_desc":
        return nameB.localeCompare(nameA);
      case "status_active":
        return statusA !== statusB
          ? statusB - statusA
          : nameA.localeCompare(nameB);
      case "status_disabled":
        return statusA !== statusB
          ? statusA - statusB
          : nameA.localeCompare(nameB);
      default:
        return 0;
    }
  });

  sortedSurveys.forEach((s) => {
    const item = document.createElement("div");
    item.className = `form-item ${currentSurvey && currentSurvey.id === s.id ? "active" : ""}`;

    const toggleHtml = `
            <label class="switch" onclick="event.stopPropagation();" title="Toggle On/Off">
                <input type="checkbox" ${s.status ? "checked" : ""} onchange="updateStatus(${s.id}, this.checked)">
                <span class="slider"></span>
            </label>
        `;

    item.innerHTML = `
            <div class="form-info">
                <div class="form-name">${s.name}</div>
            </div>
            ${toggleHtml}
        `;
    item.onclick = () => selectSurvey(s.id);
    list.appendChild(item);
  });
}

async function createNewSurvey() {
  if (document.getElementById("builderPanel").style.display === "flex") {
    if (!(await checkDirty())) return;
  }
  loadEditor({
    name: "New Survey",
    status: 0,
    intro: "",
    structure: [],
  });
}

async function selectSurvey(id) {
  if (currentSurvey && currentSurvey.id === id) return;
  if (document.getElementById("builderPanel").style.display === "flex") {
    if (!(await checkDirty())) return;
  }

  try {
    const res = await fetch(`/api/surveys/${id}`);
    loadEditor(await res.json());
  } catch (e) {
    console.error(e);
  }
}

function loadEditor(survey) {
  currentSurvey = survey;
  currentFields = survey.structure || [];

  document.getElementById("emptyPanel").style.display = "none";
  document.getElementById("builderPanel").style.display = "flex";

  const nameInput = document.getElementById("surveyName");
  nameInput.value = survey.name || "";
  nameInput.style.height = "";
  nameInput.style.height = nameInput.scrollHeight + "px";

  document.getElementById("surveyStatusToggle").checked = !!survey.status;
  if (tinymce.get("surveyIntro"))
    tinymce.get("surveyIntro").setContent(survey.intro || "");

  // Enable Publish button only if survey is saved and Active (status === 1)
  const btnPublish = document.getElementById("btnPublish");
  if (btnPublish) {
    btnPublish.disabled = !survey.id || !survey.status;
  }

  renderFields();
  renderSurveyList();

  setTimeout(() => {
    originalSurveyState = getSurveyData();
  }, 500);
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

  setTimeout(
    () =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
    100,
  );
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
            <button type="button" class="btn-icon delete" onclick="removeField(event, '${field.id}')" title="Delete Question" style="margin-right:15px; color:#dc3545;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
            </button>
            <span class="arrow-icon">▼</span>
        </div>
       
        <div class="field-body" style="padding: 25px;">
            <div class="form-group">
                <label>Question Text</label>
                <textarea id="editor_${field.id}">${field.description || ""}</textarea>
            </div>`;

  if (
    field.type === "radio" ||
    field.type === "checkboxes" ||
    field.type === "boolean"
  ) {
    const selectedRadio =
      !field.renderAs || field.renderAs === "radio" ? "selected" : "";
    const selectedDropdown = field.renderAs === "dropdown" ? "selected" : "";
    if (field.type !== "checkboxes") {
      html += `
            <div class="form-group">
                <label style="color:var(--text-muted); font-size:13px;">Display Style:</label>
                <select class="field-render-as" style="padding:8px; border-radius:4px; border:1px solid #ccc; background:var(--input-bg); color:var(--text-main); width:200px;">
                    <option value="radio" ${selectedRadio}>Radio Buttons</option>
                    <option value="dropdown" ${selectedDropdown}>Dropdown Menu</option>
                </select>
            </div>`;
    }
    if (field.type !== "boolean") {
      html += `
                <div class="form-group">
                    <label>Options</label>
                    <div class="options-container">`;
      if (field.options && field.options.length > 0) {
        field.options.forEach((opt) => (html += generateOptionRow(opt)));
      } else {
        html += generateOptionRow("Option 1");
      }
      html += `
                    </div>
                    <button type="button" class="btn-sm" style="margin-top:15px; background-color:#6c757d;" onclick="addOptionRow(this)">+ Add Option</button>
                </div>`;
    }
  }

  html += `</div>`;
  div.innerHTML = html;
  canvas.appendChild(div);

  setTimeout(() => initFieldEditor(`editor_${field.id}`), 50);
}

window.toggleAllFields = function () {
  const cards = document.querySelectorAll(".field-card");
  const btnIcon = document.getElementById("iconToggleAll");
  const anyCollapsed = Array.from(cards).some(
    (c) => !c.classList.contains("expanded"),
  );

  cards.forEach((c) =>
    anyCollapsed ? c.classList.add("expanded") : c.classList.remove("expanded"),
  );
  if (btnIcon)
    btnIcon.style.transform = anyCollapsed ? "rotate(180deg)" : "rotate(0deg)";
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
  }
}

window.removeField = function (e, id) {
  e.stopPropagation();
  handleRemoveField(id);
};

function generateOptionRow(value = "") {
  const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path></svg>`;
  return `
        <div class="option-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <input type="text" class="option-input" value="${value}" placeholder="Option label" style="flex:1; padding:8px; border:1px solid var(--border-color); border-radius:4px;">
            <button type="button" class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545; flex-shrink:0;" title="Remove Option">
                ${deleteIcon}
            </button>
        </div>
    `;
}

window.addOptionRow = function (btn) {
  const container = btn.parentElement.querySelector(".options-container");
  const div = document.createElement("div");
  div.innerHTML = generateOptionRow("");
  container.appendChild(div.firstElementChild);
};

window.copyAiPrompt = function () {
  const promptElement = document.querySelector("#aiHelpModal .code-block");
  if (!promptElement) return;

  navigator.clipboard
    .writeText(promptElement.innerText)
    .then(() => {
      if (window.showToast) showToast("Prompt copied to clipboard!", "success");
    })
    .catch((err) => console.error("Failed to copy: ", err));
};

let allActiveMembers = [];

async function openPublishModal() {
  if (isSurveyDirty()) {
    return showToast("Please save your changes before publishing.", "warning");
  }
  if (!currentSurvey || !currentSurvey.status) {
    return showToast("Survey template must be Active to publish.", "warning");
  }

  document.getElementById("publishModalTitle").innerText =
    `Publish: ${currentSurvey.name}`;
  document.getElementById("btnConfirmPublish").disabled = false;
  document.getElementById("btnConfirmPublish").innerText = "Confirm & Send";

  document.querySelector('input[name="publishTarget"][value="all"]').checked =
    true;
  togglePublishSelection();

  openModal("publishModal");

  // Fetch and cache active members
  if (allActiveMembers.length === 0) {
    try {
      const res = await fetch("/api/members");
      const members = await res.json();

      // FIXED: Using the correct 'enabled' boolean property from your database
      allActiveMembers = members.filter((m) => m.enabled === true);

      // Sort alphabetically by their name string
      allActiveMembers.sort((a, b) =>
        (a.name || "").localeCompare(b.name || ""),
      );
    } catch (e) {
      console.error("Failed to load members", e);
    }
  }

  // Populate checkboxes
  const container = document.getElementById("publishSelectionContainer");
  container.innerHTML = "";

  // FIXED: Simplified the display name to match your database schema
  allActiveMembers.forEach((m) => {
    container.innerHTML += `
            <label style="display: flex; align-items: center; gap: 10px; padding: 6px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <input type="checkbox" class="member-checkbox" value="${m.id}" checked>
                <span style="font-weight:500;">${m.name}</span>
            </label>
        `;
  });
}
function togglePublishSelection() {
  const isSelection = document.querySelector(
    'input[name="publishTarget"][value="selection"]',
  ).checked;
  const container = document.getElementById("publishSelectionContainer");
  container.style.display = isSelection ? "block" : "none";

  // Automatically manage checkbox states based on radio toggle
  const checkboxes = document.querySelectorAll(".member-checkbox");
  checkboxes.forEach((cb) => (cb.checked = !isSelection));
}

async function confirmPublish() {
  if (uiConfig?.appMode === "demo")
    return showToast("Publishing disabled in Demo Mode", "warning");

  const isSelection = document.querySelector(
    'input[name="publishTarget"][value="selection"]',
  ).checked;
  const checkboxes = document.querySelectorAll(".member-checkbox");
  const memberIds = [];

  if (isSelection) {
    checkboxes.forEach((cb) => {
      if (cb.checked) memberIds.push(parseInt(cb.value, 10));
    });
    if (memberIds.length === 0)
      return showToast("Please select at least one member.", "warning");
  } else {
    allActiveMembers.forEach((m) => memberIds.push(m.id));
  }

  const btn = document.getElementById("btnConfirmPublish");
  btn.disabled = true;
  btn.innerText = "Publishing...";

  try {
    const res = await fetch(`/api/surveys/${currentSurvey.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to publish survey.");

    showToast(data.message, "success");
    closeModal("publishModal");
  } catch (e) {
    showToast(e.message, "error");
    btn.disabled = false;
    btn.innerText = "Confirm & Send";
  }
}
