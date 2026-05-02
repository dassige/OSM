// public/js/surveys-results.js
const urlParams = new URLSearchParams(window.location.search);
const liveSurveyId = urlParams.get("id");
let currentView = "summary"; // 'summary' or 'detailed'
let detailedSortCol = "date";
let detailedSortDir = "desc";
let surveyData = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!liveSurveyId) {
    showToast("No Survey ID provided.", "error");
    return;
  }
  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      if (c.loginTitle) {
        document.title = "Survey Results - " + c.loginTitle;
        document.getElementById("pageHeader").innerText =
          "Survey Results - " + c.loginTitle;
      }
      if (c.appBackground)
        document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === "demo")
        document.getElementById("demoBanner").style.display = "block";
    });

  await loadResults();
});

/**
 * Main toggle handler called by the checkbox onchange event
 */
function toggleResultsView() {
  const isDetailed = document.getElementById("resultsViewToggle").checked;
  switchView(isDetailed ? "detailed" : "summary");
}

/**
 * Updated switchView to support the sliding toggle
 */
function switchView(view) {
  currentView = view;

  // Toggle container visibility
  document.getElementById("resultsContainer").style.display =
    view === "summary" ? "block" : "none";
  document.getElementById("detailedResultsContainer").style.display =
    view === "detailed" ? "block" : "none";

  // Ensure the checkbox state matches if this was called programmatically
  const toggle = document.getElementById("resultsViewToggle");
  if (toggle) {
    toggle.checked = view === "detailed";
  }

  if (view === "detailed") {
    renderDetailedTable();
  }
}

/**
 * Update loadResults to show the new component for non-anonymous surveys
 */
async function loadResults() {
  try {
    const res = await fetch(`/api/surveys/instances/${liveSurveyId}/results`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    surveyData = result;
    document.getElementById("surveyTitle").innerText = result.instanceName;
    document.getElementById("totalSubmissions").innerText =
      `${surveyData.responseCount}/${surveyData.stats.totalInvited}`;

    // Initialize Anonymity UI
    if (surveyData.is_anonymous === 0) {
      const container = document.getElementById("viewToggleContainer");
      if (container) container.style.display = "block";
      // Default to summary
      switchView("summary");
    } else {
      // Force summary for anonymous and hide toggle
      switchView("summary");
      const container = document.getElementById("viewToggleContainer");
      if (container) container.style.display = "none";
    }

    renderResults();
  } catch (e) {
    showToast(e.message, "error");
  }
}

function renderDetailedTable() {
  const tbody = document.getElementById("detailedTableBody");
  tbody.innerHTML = "";

  // Sort responses
  const sorted = [...surveyData.responses].sort((a, b) => {
    let valA, valB;
    if (detailedSortCol === "name") {
      valA = a.respondent.name || "";
      valB = b.respondent.name || "";
    } else if (detailedSortCol === "rank") {
      valA = a.rank || "";
      valB = b.rank || "";
    } else {
      valA = a.submittedAt;
      valB = b.submittedAt;
    }

    if (valA < valB) return detailedSortDir === "asc" ? -1 : 1;
    if (valA > valB) return detailedSortDir === "asc" ? 1 : -1;
    return 0;
  });

  sorted.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td><strong>${r.respondent.name || "N/A"}</strong></td>

            <td style="font-size:12px;">${new Date(r.submittedAt).toLocaleString()}</td>
            <td style="text-align:center;">
                <button onclick="viewSpecificResponse(${r.id})" class="btn-sm btn-primary">View Answers</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function sortDetailedTable(col) {
  if (detailedSortCol === col)
    detailedSortDir = detailedSortDir === "asc" ? "desc" : "asc";
  else {
    detailedSortCol = col;
    detailedSortDir = "asc";
  }

  // Save preference
  saveUserPreference(
    "survey_results_sort",
    `${detailedSortCol}_${detailedSortDir}`,
  );
  renderDetailedTable();
}

function renderResults() {
  const container = document.getElementById("resultsContainer");
  container.innerHTML = "";

  if (surveyData.responseCount === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No responses have been submitted yet.</div>`;
    return;
  }

  // Loop through every question in the survey structure
  surveyData.structure.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "result-card";

    let desc = (question.description || "").trim();

    // Nullify the top margin of the first paragraph so it aligns perfectly with the flex index number
    desc = desc.replace(/^<p>/i, '<p style="margin-top: 0;">');

    // Map internal DB types to user-friendly labels
    let typeLabel = "Unknown";
    switch (question.type) {
      case "radio":
        typeLabel = "Exclusive Choice";
        break;
      case "checkboxes":
        typeLabel = "Multiple Choice";
        break;
      case "boolean":
        typeLabel = "Yes/No";
        break;
      case "text_multi":
        typeLabel = "Free Text";
        break;
      default:
        typeLabel = question.type;
    }

    // Inject the mapped label right below the question description using a flexbox layout
    let html = `
        <div class="result-title" style="margin-bottom: 5px;">
            <div style="display:flex; align-items: flex-start; gap: 8px;">
                <span style="min-width: 20px; margin-top: 1px;">${index + 1}.</span>
                <div style="flex: 1;">${desc}</div>
            </div>
        </div>
        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 15px;">
            Type: ${typeLabel}
        </div>
    `;

    // TEXT / TEXTAREA
    if (question.type === "text_multi") {
      const answers = surveyData.responses
        .map((r) => r.answers[question.id])
        .filter((a) => a && a.trim() !== "");

      if (answers.length === 0) {
        html += `<div style="color: var(--text-muted); font-size: 13px;">No written responses provided.</div>`;
      } else {
        answers.forEach((a) => {
          html += `<div class="text-response">${escapeHTML(a)}</div>`;
        });
      }
    }
    // RADIO / Boolean / CHECKBOX (Multi-option)
    else if (
      question.type === "radio" ||
      question.type === "checkboxes" ||
      question.type === "boolean"
    ) {
      const counts = {};
      let options = question.options || [];
      if (question.type === "boolean") {
        options = ["Yes", "No"];
      }

      // Initialize counters
      options.forEach((opt) => (counts[opt] = 0));

      // Tally up the votes
      surveyData.responses.forEach((r) => {
        const answer = r.answers[question.id];
        if (!answer) return;

        if (Array.isArray(answer)) {
          // Checkboxes send arrays
          answer.forEach((val) => {
            if (counts[val] !== undefined) counts[val]++;
          });
        } else {
          // Radio/Dropdown send strings
          if (counts[answer] !== undefined) counts[answer]++;
        }
      });

      // Generate Bar Charts
      options.forEach((opt) => {
        const count = counts[opt];
        const percent =
          surveyData.responseCount > 0
            ? Math.round((count / surveyData.responseCount) * 100)
            : 0;

        html += `
                    <div class="bar-container">
                        <div class="bar-label">${escapeHTML(opt)} (${count})</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${percent}%;"></div>
                        </div>
                        <div class="bar-percent">${percent}%</div>
                    </div>
                `;
      });
    }

    card.innerHTML = html;
    container.appendChild(card);
  });
}
function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );
}
// --- EXPORT FUNCTIONALITY ---

function exportCSV() {
  if (!surveyData || !surveyData.responses.length) return;

  const isNamed = surveyData.instance.is_anonymous === 0;
  let csvContent = "data:text/csv;charset=utf-8,";

  // 1. Headers
  const headers = isNamed
    ? ["Firefighter", "Rank", "Submitted"]
    : ["Submission ID", "Submitted"];
  surveyData.structure.forEach((q) => {
    let cleanDesc = (q.description || "").replace(/<[^>]*>?/gm, "").trim();
    headers.push(`"${cleanDesc.replace(/"/g, '""')}"`);
  });
  csvContent += headers.join(",") + "\n";

  // 2. Rows
  surveyData.responses.forEach((r) => {
    let row = isNamed
      ? [
          `"${r.member_name}"`,
          `"${r.rank}"`,
          `"${new Date(r.submittedAt).toLocaleString()}"`,
        ]
      : [`"${r.id}"`, `"${new Date(r.submittedAt).toLocaleString()}"`];

    surveyData.structure.forEach((q) => {
      let ans = r.answers[q.id] || "";
      if (Array.isArray(ans)) ans = ans.join("; ");
      row.push(`"${String(ans).replace(/"/g, '""')}"`);
    });
    csvContent += row.join(",") + "\n";
  });

  // 3. Trigger Download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `Survey_Results_${surveyData.instanceName.replace(/[^a-z0-9]/gi, "_")}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportPDF() {
  if (!surveyData) return;

  if (typeof window.showGlobalSpinner === "function") {
    showGlobalSpinner("Generating PDF...");
  }

  // Dynamically load html2pdf if not already present in the DOM
  if (typeof html2pdf === "undefined") {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => {
      generatePDF();
    };
    document.head.appendChild(script);
  } else {
    generatePDF();
  }
}

function generatePDF() {
  const element = document.querySelector(".container");

  // Hide the action buttons and back button temporarily so they don't appear in the PDF
  const actionButtons = document.getElementById("exportActionButtons");
  const backBtn = document.querySelector(".back-dashboard-btn");
  if (actionButtons) actionButtons.style.display = "none";
  if (backBtn) backBtn.style.display = "none";

  const opt = {
    margin: 0.5,
    filename: `Survey_Results_${surveyData.instanceName.replace(/[^a-z0-9]/gi, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      // Restore the UI elements after PDF generation
      if (actionButtons) actionButtons.style.display = "flex";
      if (backBtn) backBtn.style.display = "flex";

      if (typeof window.hideGlobalSpinner === "function") {
        hideGlobalSpinner();
      }
    });
}
// --- SCROLL TO TOP LOGIC ---
const scrollTopBtn = document.getElementById("scrollTopBtn");

window.onscroll = function () {
  if (scrollTopBtn) {
    // Show the button after scrolling down 200px
    scrollTopBtn.style.display = window.scrollY > 200 ? "flex" : "none";
  }
};

window.scrollToTop = function () {
  window.scrollTo({ top: 0, behavior: "smooth" });
};
function viewSpecificResponse(responseId) {
    // Open in a new tab for audit purposes
    window.open(`surveys-view.html?responseId=${responseId}`, '_blank');
}