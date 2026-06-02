// public/js/surveys-results.js
function parseRankAndName(fullName) {
  const parts = (fullName || "").trim().split(" ");
  if (parts.length > 1 && /^[A-Za-z]{2,4}$/.test(parts[0])) {
    return { rank: parts[0], displayName: parts.slice(1).join(" ") };
  }
  return { rank: "-", displayName: fullName || "" };
}

const urlParams = new URLSearchParams(window.location.search);
const liveSurveyId = urlParams.get("id");
let uiConfig = null;
let currentView = "summary"; // 'summary' | 'detailed'
let detailedSortCol = "date";
let detailedSortDir = "desc";
let surveyData = null;

// Detailed-view pagination state
let detailedPage = 1;
let detailedLimit = 25;

document.addEventListener("DOMContentLoaded", async () => {
  if (!liveSurveyId) {
    showToast("No Survey ID provided.", "error");
    return;
  }

  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle("Survey Results", "Survey Results");
      if (c.appBackground)
        document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === "demo")
        document.getElementById("demoBanner").style.display = "block";
    });

  // Restore saved preferences for detailed view
  try {
    const prefRes = await fetch("/api/user-preferences");
    const prefs = await prefRes.json();

    if (prefs.detailedResultsSort) {
      const parts = prefs.detailedResultsSort.split(":");
      if (parts.length === 2) {
        detailedSortCol = parts[0];
        detailedSortDir = parts[1];
      }
    }

    if (prefs.detailedResultsLimit) {
      const raw = prefs.detailedResultsLimit;
      detailedLimit = raw === "all" ? 99999 : parseInt(raw);
      document.getElementById("detailedRowsPerPage").value = raw;
      document.getElementById("detailedRowsPerPageMobile").value = raw;
    }
  } catch (_) {}

  await loadResults();
});

// ── View toggle ───────────────────────────────────────────────────────────────

function toggleResultsView() {
  const isDetailed = document.getElementById("resultsViewToggle").checked;
  switchView(isDetailed ? "detailed" : "summary");
}

function switchView(view) {
  currentView = view;

  document.getElementById("resultsContainer").style.display =
    view === "summary" ? "block" : "none";
  document.getElementById("detailedResultsContainer").style.display =
    view === "detailed" ? "block" : "none";

  const toggle = document.getElementById("resultsViewToggle");
  if (toggle) toggle.checked = view === "detailed";

  if (view === "detailed") {
    detailedPage = 1;
    renderDetailedView();
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadResults() {
  try {
    const res = await fetch(`/api/surveys/instances/${liveSurveyId}/results`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    surveyData = result;
    document.getElementById("surveyTitle").innerText = result.instanceName;
    document.getElementById("totalSubmissions").innerText =
      `${surveyData.responseCount}/${surveyData.stats.totalInvited}`;

    if (surveyData.is_anonymous === 0) {
      const container = document.getElementById("viewToggleContainer");
      if (container) container.style.display = "block";
    } else {
      const container = document.getElementById("viewToggleContainer");
      if (container) container.style.display = "none";
    }

    switchView("summary");
    renderResults();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ── Detailed view: table + cards + pagination ─────────────────────────────────

function renderDetailedView() {
  updateDetailedSortHeaders();
  renderDetailedTable();
  renderDetailedCards();
}

function sortDetailedTable(col) {
  if (detailedSortCol === col)
    detailedSortDir = detailedSortDir === "asc" ? "desc" : "asc";
  else {
    detailedSortCol = col;
    detailedSortDir = "asc";
  }
  detailedPage = 1;

  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "detailedResultsSort",
      value: `${detailedSortCol}:${detailedSortDir}`,
    }),
  }).catch(() => {});

  renderDetailedView();
}

function updateDetailedSortHeaders() {
  document.querySelectorAll("#detailedResponsesTable th.sortable .sort-icon").forEach((s) => {
    s.textContent = "⇅";
  });
  const active = document.getElementById(`icon-${detailedSortCol}`);
  if (active) active.textContent = detailedSortDir === "asc" ? "▲" : "▼";

  document.querySelectorAll("#detailedResponsesTable th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === detailedSortCol) {
      th.classList.add(detailedSortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function getSortedResponses() {
  return [...surveyData.responses].sort((a, b) => {
    let valA, valB;
    if (detailedSortCol === "rank") {
      valA = parseRankAndName(a.respondent?.name || a.member_name || "").rank.toLowerCase();
      valB = parseRankAndName(b.respondent?.name || b.member_name || "").rank.toLowerCase();
    } else if (detailedSortCol === "name") {
      valA = parseRankAndName(a.respondent?.name || a.member_name || "").displayName.toLowerCase();
      valB = parseRankAndName(b.respondent?.name || b.member_name || "").displayName.toLowerCase();
    } else {
      valA = a.submittedAt || "";
      valB = b.submittedAt || "";
    }
    if (valA < valB) return detailedSortDir === "asc" ? -1 : 1;
    if (valA > valB) return detailedSortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function renderDetailedTable() {
  const tbody = document.getElementById("detailedTableBody");
  tbody.innerHTML = "";

  const sorted = getSortedResponses();
  const total = sorted.length;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No responses found.</td></tr>`;
    updateDetailedPaginationUI(0, 0);
    return;
  }

  const effectiveLimit = detailedLimit === 99999 ? total : detailedLimit;
  const totalPages = Math.ceil(total / effectiveLimit);
  if (detailedPage > totalPages) detailedPage = 1;

  const start = (detailedPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);

  sorted.slice(start, end).forEach((r) => {
    const { rank, displayName } = parseRankAndName(r.respondent?.name || r.member_name || "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Rank" class="text-center">${formatRankCell(rank)}</td>
      <td><strong>${displayName || "N/A"}</strong></td>
      <td style="font-size:12px;">${new Date(r.submittedAt).toLocaleString((uiConfig && uiConfig.locale) || 'en-NZ', { timeZone: (uiConfig && uiConfig.timezone) || undefined })}</td>
      <td style="text-align:center;">
        <button onclick="viewSpecificResponse(${r.id})" class="btn-sm btn-informative"
          title="View this respondent's individual answers (opens in new tab)">
          View Answers
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round" style="vertical-align:middle; margin-left:3px;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateDetailedPaginationUI(total, totalPages);
}

function renderDetailedCards() {
  const container = document.getElementById("detailedCardContainer");
  if (!container) return;
  container.innerHTML = "";

  const sorted = getSortedResponses();
  const total = sorted.length;

  if (total === 0) {
    container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No responses found.</p>`;
    updateDetailedPaginationUI(0, 0);
    return;
  }

  const effectiveLimit = detailedLimit === 99999 ? total : detailedLimit;
  const totalPages = Math.ceil(total / effectiveLimit);
  const start = (detailedPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);

  sorted.slice(start, end).forEach((r) => {
    const { rank, displayName } = parseRankAndName(r.respondent?.name || r.member_name || "");
    const rankHtml = (rank && rank !== "-") ? `<div class="card-rank">${formatRankCell(rank)}</div>` : "";
    const card = document.createElement("div");
    card.className = "table-card";
    card.innerHTML = `
      <div class="card-header">
        ${rankHtml}
        <span class="card-title">${displayName || "N/A"}</span>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Submitted:</span>
          <span style="font-size:0.88em;">${new Date(r.submittedAt).toLocaleString((uiConfig && uiConfig.locale) || 'en-NZ', { timeZone: (uiConfig && uiConfig.timezone) || undefined })}</span>
        </div>
      </div>
      <div class="card-actions">
        <button onclick="viewSpecificResponse(${r.id})" class="btn-informative btn-sm"
          title="View this respondent's individual answers (opens in new tab)">
          View Answers ↗
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  updateDetailedPaginationUI(total, totalPages);
}

function updateDetailedPaginationUI(total, totalPages) {
  const show = total > 0;
  const pages = detailedLimit === 99999 ? 1 : totalPages;

  // Desktop
  document.getElementById("detailedPaginationControls").style.display = show ? "flex" : "none";
  if (show) {
    document.getElementById("detailedPageInfo").textContent = `${detailedPage} of ${pages}`;
    document.getElementById("detailedBtnFirst").disabled = detailedPage <= 1;
    document.getElementById("detailedBtnPrev").disabled = detailedPage <= 1;
    document.getElementById("detailedBtnNext").disabled = detailedPage >= pages;
    document.getElementById("detailedBtnLast").disabled = detailedPage >= pages;
  }

  // Mobile
  document.getElementById("detailedPaginationControlsMobile").style.display = show ? "flex" : "none";
  if (show) {
    document.getElementById("detailedPageInfoMobile").textContent = `${detailedPage} of ${pages}`;
    document.getElementById("detailedBtnFirstMobile").disabled = detailedPage <= 1;
    document.getElementById("detailedBtnPrevMobile").disabled = detailedPage <= 1;
    document.getElementById("detailedBtnNextMobile").disabled = detailedPage >= pages;
    document.getElementById("detailedBtnLastMobile").disabled = detailedPage >= pages;
    document.getElementById("detailedRowsPerPageMobile").value =
      document.getElementById("detailedRowsPerPage").value;
  }
}

function changeDetailedPage(delta) {
  const total = surveyData?.responses?.length || 0;
  const effectiveLimit = detailedLimit === 99999 ? total : detailedLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  const newPage = detailedPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    detailedPage = newPage;
    renderDetailedView();
  }
}

function goToDetailedFirstPage() {
  if (detailedPage !== 1) {
    detailedPage = 1;
    renderDetailedView();
  }
}

function goToDetailedLastPage() {
  const total = surveyData?.responses?.length || 0;
  const effectiveLimit = detailedLimit === 99999 ? total : detailedLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  if (detailedPage !== totalPages) {
    detailedPage = totalPages;
    renderDetailedView();
  }
}

async function changeDetailedLimit(val) {
  detailedLimit = val === "all" ? 99999 : parseInt(val);
  detailedPage = 1;
  document.getElementById("detailedRowsPerPage").value = val;
  document.getElementById("detailedRowsPerPageMobile").value = val;
  renderDetailedView();
  await fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "detailedResultsLimit", value: val }),
  });
}

// ── Summary view: per-question charts ────────────────────────────────────────

function renderResults() {
  const container = document.getElementById("resultsContainer");
  container.innerHTML = "";

  if (surveyData.responseCount === 0) {
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No responses have been submitted yet.</div>`;
    return;
  }

  surveyData.structure.forEach((question, index) => {
    const card = document.createElement("div");
    card.className = "result-card";

    let desc = (question.description || "").trim();
    desc = desc.replace(/^<p>/i, '<p style="margin-top: 0;">');

    let typeLabel = "Unknown";
    switch (question.type) {
      case "radio":      typeLabel = "Exclusive Choice"; break;
      case "checkboxes": typeLabel = "Multiple Choice";  break;
      case "boolean":    typeLabel = "Yes/No";           break;
      case "text_multi": typeLabel = "Free Text";        break;
      default:           typeLabel = question.type;
    }

    let html = `
      <div class="result-title" style="margin-bottom: 5px;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="min-width:20px; margin-top:1px;">${index + 1}.</span>
          <div style="flex:1;">${desc}</div>
        </div>
      </div>
      <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:15px;">
        Type: ${typeLabel}
      </div>
    `;

    if (question.type === "text_multi") {
      const answers = surveyData.responses
        .map((r) => r.answers[question.id])
        .filter((a) => a && a.trim() !== "");

      if (answers.length === 0) {
        html += `<div style="color:var(--text-muted); font-size:13px;">No written responses provided.</div>`;
      } else {
        answers.forEach((a) => {
          html += `<div class="text-response">${escapeHTML(a)}</div>`;
        });
      }
    } else if (
      question.type === "radio" ||
      question.type === "checkboxes" ||
      question.type === "boolean"
    ) {
      const counts = {};
      let options = question.options || [];
      if (question.type === "boolean") options = ["Yes", "No"];

      options.forEach((opt) => (counts[opt] = 0));

      surveyData.responses.forEach((r) => {
        const answer = r.answers[question.id];
        if (!answer) return;
        if (Array.isArray(answer)) {
          answer.forEach((val) => { if (counts[val] !== undefined) counts[val]++; });
        } else {
          if (counts[answer] !== undefined) counts[answer]++;
        }
      });

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
              <div class="bar-fill" style="width:${percent}%;"></div>
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

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[tag] || tag
  );
}

function viewSpecificResponse(responseId) {
  window.open(`surveys-view.html?responseId=${responseId}`, "_blank");
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportCSV() {
  if (!surveyData || !surveyData.responses.length) return;

  const isNamed = surveyData.instance.is_anonymous === 0;
  let csvContent = "data:text/csv;charset=utf-8,";

  const headers = isNamed
    ? ["Firefighter", "Rank", "Submitted"]
    : ["Submission ID", "Submitted"];
  surveyData.structure.forEach((q) => {
    let cleanDesc = (q.description || "").replace(/<[^>]*>?/gm, "").trim();
    headers.push(`"${cleanDesc.replace(/"/g, '""')}"`);
  });
  csvContent += headers.join(",") + "\n";

  surveyData.responses.forEach((r) => {
    let row = isNamed
      ? [
          `"${r.member_name}"`,
          `"${r.rank}"`,
          `"${new Date(r.submittedAt).toLocaleString((uiConfig && uiConfig.locale) || 'en-NZ', { timeZone: (uiConfig && uiConfig.timezone) || undefined })}"`,
        ]
      : [`"${r.id}"`, `"${new Date(r.submittedAt).toLocaleString((uiConfig && uiConfig.locale) || 'en-NZ', { timeZone: (uiConfig && uiConfig.timezone) || undefined })}"`];

    surveyData.structure.forEach((q) => {
      let ans = r.answers[q.id] || "";
      if (Array.isArray(ans)) ans = ans.join("; ");
      row.push(`"${String(ans).replace(/"/g, '""')}"`);
    });
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `Survey_Results_${surveyData.instanceName.replace(/[^a-z0-9]/gi, "_")}.csv`
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

  if (typeof html2pdf === "undefined") {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => generatePDF();
    document.head.appendChild(script);
  } else {
    generatePDF();
  }
}

function generatePDF() {
  const element = document.querySelector(".container");

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
      if (actionButtons) actionButtons.style.display = "flex";
      if (backBtn) backBtn.style.display = "flex";
      if (typeof window.hideGlobalSpinner === "function") hideGlobalSpinner();
    });
}

// ── Scroll to top ─────────────────────────────────────────────────────────────

const scrollTopBtn = document.getElementById("scrollTopBtn");

window.onscroll = function () {
  if (scrollTopBtn) {
    scrollTopBtn.style.display = window.scrollY > 200 ? "flex" : "none";
  }
};

window.scrollToTop = function () {
  window.scrollTo({ top: 0, behavior: "smooth" });
};
