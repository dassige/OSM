let submissionCode = null;
let reviewData = null;
let currentAction = null;

// Defaults
let appLocale = "en-NZ";
let appTimezone = "Pacific/Auckland";

function updateCommentVisibility() {
  const emailChecked = document.getElementById("revEmailCb").checked;
  const waChecked = document.getElementById("revWaCb").checked;
  const commentSection = document.getElementById("commentSection");
  const btn = document.getElementById("btnConfirmReview");

  // Toggle comment box
  if (commentSection) {
    commentSection.style.display = emailChecked || waChecked ? "block" : "none";
  }

  // [NEW] Update Button Text based on notification status
  const hasNotification = emailChecked || waChecked;
  if (currentAction === "accept") {
    btn.textContent = hasNotification ? "Accept & Notify" : "Accept";
  } else if (currentAction === "reject") {
    btn.textContent = hasNotification ? "Reject & Notify" : "Reject";
  }
}

document
  .getElementById("revEmailCb")
  .addEventListener("change", updateCommentVisibility);
document
  .getElementById("revWaCb")
  .addEventListener("change", updateCommentVisibility);

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch Config for Locale/Timezone
  try {
    const configRes = await fetch("/ui-config");
    if (configRes.ok) {
      const config = await configRes.json();
      if (config.locale) appLocale = config.locale;
      if (config.timezone) appTimezone = config.timezone;
    }
  } catch (e) {
    console.warn("Failed to load UI config, using defaults:", e);
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const publicId = params.get("id");
  const reviewId = params.get("reviewId");
  const isPreview = params.get("preview") === "true";
  // [NEW] Show FABs only in admin-adjacent modes
  if (isPreview || reviewId) {
    document.getElementById("adminFab").style.display = "flex";
  }
  if (isPreview)
    document.getElementById("previewBanner").style.display = "block";

  if (reviewId) {
    // --- REVIEW MODE (Admin Only) ---
    document.body.classList.add("review-mode");
    try {
      const res = await fetch(`/api/live-forms/review/${reviewId}`);
      if (res.status === 403 || res.status === 401)
        throw new Error("Unauthorized: Admin access required.");
      if (!res.ok) throw new Error("Could not load submission.");

      const data = await res.json();
      reviewData = data;

      // Format Date
      const formattedDate = new Date(data.submittedAt).toLocaleString(
        appLocale,
        {
          timeZone: appTimezone,
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

      // Inject Review UI
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText =
        "background:#17a2b8; color:white; padding:15px; border-radius:6px; margin-bottom:20px; font-size:1em; text-align:center; font-weight:bold;";
      infoDiv.textContent = `REVIEW MODE &bull; Submitted on ${formattedDate}`;
      document
        .querySelector(".form-header")
        .insertBefore(infoDiv, document.getElementById("formName"));

      const contextDiv = document.createElement("div");
      contextDiv.style.cssText =
        "background:var(--bg-hover); padding:10px; border-radius:4px; margin-bottom:15px; border:1px solid var(--border-color); color:var(--text-main);";

      let statusColor = "#6c757d";
      const st = (data.form_status || "").toLowerCase();
      if (st === "accepted") statusColor = "#28a745";
      else if (st === "rejected") statusColor = "#dc3545";
      else if (st === "submitted") statusColor = "#007bff";

      contextDiv.textContent = `
                        <strong>Member:</strong> ${data.member} &nbsp;|&nbsp; 
                        <strong>Skill:</strong> ${data.skill} &nbsp;|&nbsp; 
                        <strong>Attempt:</strong> ${
                          data.tries || 1
                        } &nbsp;|&nbsp; 
                        <strong>Status:</strong> <span style="color:${statusColor}; font-weight:bold;">${st.toUpperCase()}</span>
                    `;
      document
        .querySelector(".form-header")
        .insertBefore(contextDiv, document.getElementById("formName"));

      if (data.form_status === "submitted") {
        document.getElementById("reviewActions").style.display = "block";
        document.body.style.paddingTop = "0";
      }

      renderForm(data);
      fillForm(data.submittedData);
      disableForm();
    } catch (e) {
      showError(e.message);
    }
  } else if (code) {
    // --- LIVE MODE (Public) ---
    submissionCode = code;
    try {
      const res = await fetch(`/api/live-forms/access/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load form.");

      // [NEW] Inject Information Box for the Member
      const contextDiv = document.createElement("div");
      contextDiv.style.cssText =
        "background:var(--bg-hover); padding:12px 15px; border-radius:6px; margin-bottom:20px; border:1px solid var(--border-color); color:var(--text-main); font-size:0.95em;";
      contextDiv.textContent = `
                            <strong>Member:</strong> ${
                              data.member
                            } &nbsp;|&nbsp; 
                            <strong>Skill:</strong> ${data.skill} &nbsp;|&nbsp; 
                            <strong>Attempt:</strong> ${data.tries || 1}
                        `;
      // Insert at the top of the form header
      document
        .querySelector(".form-header")
        .insertBefore(contextDiv, document.getElementById("formName"));

      renderForm(data);
    } catch (e) {
      showError(e.message);
    }
  } else if (publicId) {
    // --- PREVIEW MODE ---
    try {
      const res = await fetch(`/api/forms/public/${publicId}`);
      if (!res.ok) throw new Error("Form not found.");
      const form = await res.json();
      renderForm(form);
    } catch (e) {
      showError(e.message);
    }
  } else {
    showError("No form specified.");
  }
});

function renderForm(form) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("formContent").style.display = "block";
  document.getElementById("formName").innerText = form.name;
  document.getElementById("formIntro").textContent = form.intro;
  document.title = form.name + " - FENZ OSM";

  const container = document.getElementById("questionsContainer");
  container.textContent = ""; // Clear existing

  (form.structure || []).forEach((field) => {
    const div = document.createElement("div");
    div.className = "question-card";
    let labelHtml = `<div class="question-text">${field.description}</div>`;
    if (field.required)
      labelHtml += `<div style="text-align:right; margin-bottom:5px;"><span style="color:#dc3545; font-size:11px; font-weight:bold; background:#ffe6e6; padding:2px 6px; border-radius:4px;">* Required</span></div>`;

    let inputHtml = "";
    const fieldName = field.id;

    switch (field.type) {
      case "text_multi":
        // Added 'box-sizing: border-box;' to prevent right-edge clipping
        inputHtml = `<textarea name="${fieldName}" rows="4" 
            style="width:100%; box-sizing: border-box; padding:12px; border-radius:4px; border:1px solid #ccc; font-family:inherit;" 
            ${field.required ? "required" : ""} 
            placeholder="Type your answer here..."></textarea>`;
        break;
      case "radio":
        if (field.renderAs === "dropdown") {
          inputHtml += `<select name="${fieldName}" style="width:100%; padding:10px; border-radius:4px; border:1px solid #ccc; font-size:16px; background:white;" ${
            field.required ? "required" : ""
          }><option value="" disabled selected>-- Select an Option --</option>`;
          if (field.options)
            field.options.forEach(
              (opt) => (inputHtml += `<option value="${opt}">${opt}</option>`)
            );
          inputHtml += `</select>`;
        } else {
          if (field.options)
            field.options.forEach(
              (opt) =>
                (inputHtml += `<label class="option-label"><input type="radio" name="${fieldName}" value="${opt}" ${
                  field.required ? "required" : ""
                }> ${opt}</label>`)
            );
        }
        break;
      case "checkboxes":
        if (field.options)
          field.options.forEach(
            (opt) =>
              (inputHtml += `<label class="option-label"><input type="checkbox" name="${fieldName}[]" value="${opt}"> ${opt}</label>`)
          );
        break;
      case "boolean":
        if (field.renderAs === "dropdown") {
          // Render as a searchable/standard dropdown menu
          inputHtml = `<select name="${fieldName}" style="width:100%; padding:10px; border-radius:4px; border:1px solid #ccc; font-size:16px; background:white;" ${
            field.required ? "required" : ""
          }>
                <option value="" disabled selected>-- Select an Option --</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
            </select>`;
        } else {
          // Standard Radio Button group logic
          inputHtml = `
                <label class="option-label">
                    <input type="radio" name="${fieldName}" value="Yes" ${
            field.required ? "required" : ""
          }> Yes
                </label>
                <label class="option-label">
                    <input type="radio" name="${fieldName}" value="No"> No
                </label>`;
        }
        break;
    }
    div.textContent = labelHtml + inputHtml;
    container.appendChild(div);
  });
}

function fillForm(submittedData) {
  if (!reviewData || !submittedData) return;

  reviewData.structure.forEach((field) => {
    const submitted = submittedData[field.id] || submittedData[field.id + "[]"];
    const correct = field.correctAnswer;
    const elements = document.querySelectorAll(
      `[name="${field.id}"], [name="${field.id}[]"]`
    );

    // Check if the question was left unanswered
    const isUnanswered =
      submitted === undefined ||
      submitted === null ||
      submitted === "" ||
      (Array.isArray(submitted) && submitted.length === 0);

    if (field.type === "radio" || field.type === "boolean") {
      if (field.renderAs === "dropdown") {
        const selectEl = elements[0];
        if (selectEl) {
          if (isUnanswered) {
            selectEl.classList.add("review-unanswered");
          } else {
            selectEl.value = submitted;
            if (submitted === correct) {
              selectEl.style.backgroundColor = "#d4edda";
              selectEl.style.borderColor = "#28a745";
            } else {
              selectEl.style.backgroundColor = "#f8d7da";
              selectEl.style.borderColor = "#dc3545";
              const refBox = document.createElement("div");
              refBox.className = "reference-box";
              refBox.textContent = `<strong>Correct Answer:</strong><br>${correct}`;
              selectEl.parentNode.appendChild(refBox);
            }
          }
        }
      } else {
        elements.forEach((el) => {
          const label = el.closest(".option-label");
          if (!label) return;

          if (isUnanswered) {
            label.classList.add("review-unanswered");
          } else if (el.value === submitted) {
            el.checked = true;
            label.classList.add(
              submitted === correct ? "review-correct" : "review-wrong"
            );
          }

          // Show expected border even if unanswered
          if (el.value === correct && submitted !== correct) {
            label.classList.add("expected-border");
          }
        });
      }
    } else if (field.type === "checkboxes") {
      const subArr = Array.isArray(submitted)
        ? submitted
        : submitted
        ? [submitted]
        : [];
      const corrArr = Array.isArray(correct) ? correct : [];

      elements.forEach((el) => {
        const label = el.closest(".option-label");
        if (!label) return;

        if (isUnanswered) {
          label.classList.add("review-unanswered");
        } else {
          const isSelected = subArr.includes(el.value);
          const isCorrect = corrArr.includes(el.value);

          if (isSelected) {
            el.checked = true;
            label.classList.add(isCorrect ? "review-correct" : "review-wrong");
          }
        }

        // Show expected border for correct answers the member missed
        if (corrArr.includes(el.value) && !subArr.includes(el.value)) {
          label.classList.add("expected-border");
        }
      });
    } else if (field.type === "text_multi") {
      const ta = document.querySelector(`textarea[name="${field.id}"]`);
      if (ta) {
        if (isUnanswered) {
          ta.classList.add("review-unanswered");
          ta.placeholder = "(No answer provided)";
        } else {
          ta.value = submitted;
        }

        const refBox = document.createElement("div");
        refBox.className = "reference-box";
        refBox.textContent = `<strong>Admin Reference Answer:</strong><br>${
          field.correctAnswer || "No reference provided."
        }`;
        ta.parentNode.appendChild(refBox);
      }
    }
  });
}

function disableForm() {
  const form = document.getElementById("submissionForm");
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.style.display = "none";
  form
    .querySelectorAll("input, textarea, select")
    .forEach((el) => (el.disabled = true));
}

function showError(msg) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("formContent").style.display = "none";
  document.getElementById("errorState").style.display = "block";
  document.getElementById("errorMsg").innerText = msg;
}

document
  .getElementById("submissionForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submissionCode === null) {
      if (window.showToast)
        showToast("Form Validated! (Preview Mode)", "success");
      return;
    }
    const formData = new FormData(e.target);
    const data = {};
    for (let [key, value] of formData.entries()) {
      if (data[key]) {
        if (!Array.isArray(data[key])) data[key] = [data[key]];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    const btn = e.target.querySelector(".btn-submit");
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Submitting...";

    if (submissionCode) {
      try {
        const res = await fetch(`/api/live-forms/submit/${submissionCode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          document.getElementById("formContent").textContent = `
                            <div style="text-align:center; padding:40px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <h2 style="color:#28a745; margin-top:20px;">Thank You!</h2>
                                <p style="color:#555; margin-bottom:20px;">Your skill verification has been submitted successfully.</p>
                                <button onclick="window.close()" style="padding:10px 20px; border:none; background:#6c757d; color:white; border-radius:4px; cursor:pointer;">Close Window</button>
                            </div>
                        `;
        } else {
          const err = await res.json();
          throw new Error(err.error || "Submission failed");
        }
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerText = originalText;
      }
    } else {
      if (window.showToast)
        showToast("Form Validated! (Preview Mode)", "success");
      setTimeout(() => {
        window.close();
      }, 1500);
    }
  });

// --- REVIEW MODAL LOGIC (OPEN/SUBMIT) ---
function openReviewModal(action) {
  currentAction = action;
  const btn = document.getElementById("btnConfirmReview");
  const modal = document.getElementById("reviewModal");

  // Populate Member/Skill Info
  document.getElementById("revMember").textContent = reviewData.member;
  document.getElementById("revSkill").textContent = reviewData.skill;
  document.getElementById("revDate").textContent = new Date(
    reviewData.submittedAt
  ).toLocaleDateString(appLocale);
  document.getElementById("revTries").textContent = reviewData.tries || "1";

  // Clear previous comment
  document.getElementById("revCustomComment").value = "";

  if (action === "accept") {
    document.getElementById("reviewModalTitle").textContent =
      "Accept Submission";
    document.getElementById("rejectOptions").style.display = "none";
    btn.style.backgroundColor = "#28a745";
    btn.textContent = "Accept & Notify";
  } else {
    document.getElementById("reviewModalTitle").textContent =
      "Reject Submission";
    document.getElementById("rejectOptions").style.display = "block";
    btn.style.backgroundColor = "#dc3545";
    btn.textContent = "Reject & Notify";
  }

  const prefs = (reviewData.member_prefs || "").split(",");

  // Set Email state
  const emailCb = document.getElementById("revEmailCb");
  if (reviewData.member_email) {
    emailCb.disabled = false;
    emailCb.checked = prefs.includes("email");
  } else {
    emailCb.disabled = true;
    emailCb.checked = false;
  }

  // Set WA state
  const waCb = document.getElementById("revWaCb");
  if (reviewData.member_mobile) {
    waCb.disabled = false;
    waCb.checked = prefs.includes("whatsapp");
  } else {
    waCb.disabled = true;
    waCb.checked = false;
  }

  // [CRITICAL FIX] Call the visibility update manually because
  // setting .checked via code doesn't fire the 'change' event
  updateCommentVisibility();

  modal.style.display = "block";
}
async function submitReviewAction() {
  if (!reviewData.id || !currentAction) return;

  const btn = document.getElementById("btnConfirmReview");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Processing...";

  const payload = {
    notifyEmail: document.getElementById("revEmailCb").checked,
    notifyWa: document.getElementById("revWaCb").checked,
    customComment: document.getElementById("revCustomComment").value, // [NEW] Added to payload
    generateNew:
      currentAction === "reject"
        ? document.getElementById("revGenerateNew").checked
        : false,
  };

  try {
    const res = await fetch(
      `/api/live-forms/${currentAction}/${reviewData.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      showToast("Action completed successfully", "success");
      document.getElementById("reviewModal").style.display = "none";
      document.getElementById("reviewActions").style.display = "none";
      setTimeout(() => window.close(), 1500);
    } else {
      const err = await res.json();
      throw new Error(err.error || "Action failed");
    }
  } catch (e) {
    showToast(e.message, "error");
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function exportToPdf() {
  const btn = document.getElementById("btnExportPdf");
  const originalContent = btn.textContent;

  btn.disabled = true;
  btn.textContent =
    '<div class="spinner" style="width:14px; height:14px; border-width:2px;"></div>';

  // Clone form content to avoid disrupting the live view
  const content = document.getElementById("formContent").textContent;
  const formTitle = document.getElementById("formName").innerText;

  // Use global CSS variables for PDF consistency
  const fullHtml = `
        <html>
        <head>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .form-header { border-bottom: 2px solid #333; margin-bottom: 20px; }
                .question-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; page-break-inside: avoid; }
                .reference-box { background: #f0f7ff; border-left: 4px solid #007bff; padding: 10px; margin-top: 10px; font-size: 0.9em; }
                /* Replicate Review Highlighting */
                .review-correct { background-color: #d4edda; }
                .review-wrong { background-color: #f8d7da; }
            </style>
        </head>
        <body>${content}</body>
        </html>
    `;

  try {
    const res = await fetch("/api/reports/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: fullHtml }),
    });

    if (!res.ok) throw new Error("PDF generation failed");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OSM-Verification-${formTitle.replace(/\s+/g, "-")}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    if (window.showToast) showToast("PDF generated successfully", "success");
  } catch (e) {
    if (window.showToast) showToast(e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalContent;
  }
}
