function parseRankAndName(fullName) {
  const parts = (fullName || "").trim().split(" ");
  if (parts.length > 1 && /^[A-Za-z]{2,4}$/.test(parts[0])) {
    return { rank: parts[0], displayName: parts.slice(1).join(" ") };
  }
  return { rank: "-", displayName: fullName || "" };
}

let surveyGuid = null;
const urlParams = new URLSearchParams(window.location.search);
const liveSurveyId = urlParams.get("id");

let rawData = [];
let filteredData = [];
let sortCol = "member_name";
let sortDir = "asc";
let uiConfig = null;
let appBaseUrl = window.location.origin;

// Pagination state
let trackingPage = 1;
let trackingLimit = 25;

document.addEventListener("DOMContentLoaded", async () => {
  if (!liveSurveyId) {
    showToast("No survey ID provided.", "error");
    setTimeout(() => (window.location.href = "live-surveys.html"), 1500);
    return;
  }

  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle("Survey Tracking", "Surveys Tracker");
      if (c.appBackground)
        document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === "demo")
        document.getElementById("demoBanner").style.display = "block";
    });

  const scrollTopBtn = document.getElementById("scrollTopBtn");
  window.onscroll = () => {
    if (scrollTopBtn)
      scrollTopBtn.style.display = window.scrollY > 200 ? "flex" : "none";
  };
  window.scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    const userRes = await fetch("/api/user-session");
    const user = await userRes.json();
    const role = user.role || "guest";
    if (role !== "admin" && role !== "superadmin") {
      showToast("Access Denied.", "error");
      setTimeout(() => (window.location.href = "/"), 1500);
      return;
    }
  } catch {
    window.location.href = "/login.html";
    return;
  }

  // Load persisted preferences
  try {
    const prefRes = await fetch("/api/user-preferences");
    const prefs = await prefRes.json();

    if (prefs.surveyTrackingSort) {
      const parts = prefs.surveyTrackingSort.split(":");
      if (parts.length === 2) {
        sortCol = parts[0];
        sortDir = parts[1];
      }
    }

    if (prefs.trackingPageLimit) {
      const raw = prefs.trackingPageLimit;
      trackingLimit = raw === "all" ? 99999 : parseInt(raw);
      document.getElementById("rowsPerPage").value = raw;
      document.getElementById("rowsPerPageMobile").value = raw;
    }
  } catch (_) {}

  loadData();
});

async function loadData() {
  try {
    const res = await fetch(`/api/surveys/instances/${liveSurveyId}/tracking`);
    const result = await res.json();

    if (!res.ok)
      throw new Error(result.error || "Failed to fetch tracking data");

    document.getElementById("pageHeader").innerText =
      `Tracking: ${result.instanceName}`;
    if (uiConfig && uiConfig.loginTitle) {
      document.title = `Tracking - ${uiConfig.loginTitle}`;
    }

    rawData = result.tracking || [];
    surveyGuid = result.surveyGuid;

    applyFilters();
  } catch (e) {
    showToast(e.message, "error");
    document.getElementById("tableBody").innerHTML =
      `<tr><td colspan="4" class="text-center" style="color:var(--danger);">Error loading data.</td></tr>`;
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────

function applyFilters() {
  const nameFilter = document.getElementById("filterName").value.toLowerCase();
  const statusFilter = document.getElementById("filterStatus").value;

  filteredData = rawData.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (
      nameFilter &&
      !(item.member_name || "").toLowerCase().includes(nameFilter)
    )
      return false;
    return true;
  });

  updateFilterHighlights();
  sortFilteredData();
  trackingPage = 1;
  renderPage();
}

function resetFilters() {
  document.getElementById("filterName").value = "";
  document.getElementById("filterStatus").value = "all";
  applyFilters();
}

function updateFilterHighlights() {
  const filterIds = ["filterName", "filterStatus"];
  let activeCount = 0;
  filterIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isDefault = el.value === "" || el.value === "all";
    el.classList.toggle("filter-active", !isDefault);
    if (!isDefault) activeCount++;
  });
  const badge = document.getElementById("filterActiveCount");
  if (badge) {
    badge.textContent = activeCount > 0 ? activeCount : "";
    badge.style.display = activeCount > 0 ? "inline-block" : "none";
  }
}

// ── Accordion toggles ─────────────────────────────────────────────────────────

function toggleFilters() {
  const bar = document.getElementById("filterBar");
  const btn = document.getElementById("filterToggleBtn");
  const expanded = bar.classList.toggle("filter-expanded");
  btn.classList.toggle("expanded", expanded);
}

function toggleSortBar() {
  const bar = document.getElementById("tracking-sort-bar");
  const btn = document.getElementById("sortToggleBtn");
  const expanded = bar.classList.toggle("sort-expanded");
  btn.classList.toggle("expanded", expanded);
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function handleSort(col) {
  if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
  else {
    sortCol = col;
    sortDir = "asc";
  }

  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "surveyTrackingSort",
      value: `${sortCol}:${sortDir}`,
    }),
  }).catch(() => {});

  sortFilteredData();
  renderPage();
}

function sortFilteredData() {
  filteredData.sort((a, b) => {
    const parsedA = parseRankAndName(a.member_name);
    const parsedB = parseRankAndName(b.member_name);
    let valA, valB;

    if (sortCol === "rank") {
      valA = parsedA.rank.toLowerCase();
      valB = parsedB.rank.toLowerCase();
    } else if (sortCol === "member_name") {
      valA = parsedA.displayName.toLowerCase();
      valB = parsedB.displayName.toLowerCase();
    } else if (sortCol === "completed_at") {
      valA = a.completed_at || "0000";
      valB = b.completed_at || "0000";
    } else {
      valA = (a[sortCol] || "").toString().toLowerCase();
      valB = (b[sortCol] || "").toString().toLowerCase();
    }

    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function updateSortHeaders() {
  // Desktop sort-icon spans
  document.querySelectorAll("th.sortable .sort-icon").forEach((span) => {
    span.textContent = "⇅";
  });
  const desktopIcon = document.getElementById(`icon-${sortCol}`);
  if (desktopIcon) desktopIcon.textContent = sortDir === "asc" ? "▲" : "▼";

  // Desktop th classes
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === sortCol) {
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });

  // Mobile sort bar icons
  ["rank", "member_name", "status", "completed_at"].forEach((col) => {
    const el = document.getElementById(`mobile-icon-${col}`);
    if (el) el.textContent = col === sortCol ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────

function changeTrackingPage(delta) {
  const total = filteredData.length;
  const effectiveLimit = trackingLimit === 99999 ? total : trackingLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  const newPage = trackingPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    trackingPage = newPage;
    renderPage();
  }
}

function goToFirstPage() {
  if (trackingPage !== 1) {
    trackingPage = 1;
    renderPage();
  }
}

function goToLastPage() {
  const total = filteredData.length;
  const effectiveLimit = trackingLimit === 99999 ? total : trackingLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  if (trackingPage !== totalPages) {
    trackingPage = totalPages;
    renderPage();
  }
}

async function changeTrackingLimit(val) {
  trackingLimit = val === "all" ? 99999 : parseInt(val);
  trackingPage = 1;
  document.getElementById("rowsPerPage").value = val;
  document.getElementById("rowsPerPageMobile").value = val;
  renderPage();
  await fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "trackingPageLimit", value: val }),
  });
}

function updatePaginationUI(total, totalPages) {
  const show = total > 0;
  const pages = trackingLimit === 99999 ? 1 : totalPages;

  // Desktop
  document.getElementById("paginationControls").style.display = show
    ? "flex"
    : "none";
  if (show) {
    document.getElementById("pageInfo").textContent = `${trackingPage} of ${pages}`;
    document.getElementById("btnFirst").disabled = trackingPage <= 1;
    document.getElementById("btnPrev").disabled = trackingPage <= 1;
    document.getElementById("btnNext").disabled = trackingPage >= pages;
    document.getElementById("btnLast").disabled = trackingPage >= pages;
  }

  // Mobile
  document.getElementById("paginationControlsMobile").style.display = show
    ? "flex"
    : "none";
  if (show) {
    document.getElementById("pageInfoMobile").textContent = `${trackingPage} of ${pages}`;
    document.getElementById("btnFirstMobile").disabled = trackingPage <= 1;
    document.getElementById("btnPrevMobile").disabled = trackingPage <= 1;
    document.getElementById("btnNextMobile").disabled = trackingPage >= pages;
    document.getElementById("btnLastMobile").disabled = trackingPage >= pages;
    document.getElementById("rowsPerPageMobile").value =
      document.getElementById("rowsPerPage").value;
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderPage() {
  updateSortHeaders();
  renderTable();
  renderCards();
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  const total = filteredData.length;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No tracking records match your filter.</td></tr>`;
    updatePaginationUI(0, 0);
    return;
  }

  const effectiveLimit = trackingLimit === 99999 ? total : trackingLimit;
  const totalPages = Math.ceil(total / effectiveLimit);
  if (trackingPage > totalPages) trackingPage = 1;

  const start = (trackingPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);
  const pageData = filteredData.slice(start, end);

  pageData.forEach((item) => {
    const { dateStr, statusBadge, url, remindBtnHtml } = buildRowParts(item);
    const { rank, displayName } = parseRankAndName(item.member_name);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Rank" class="text-center">${formatRankCell(rank)}</td>
      <td style="font-weight:500;">
        ${displayName}
        <div style="font-size:12px; color:var(--text-muted); font-weight:normal;">${item.email || "No email provided"}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${dateStr}</td>
      <td>
        <div style="display:flex; justify-content:flex-end; gap:8px; align-items:center;">
          <button onclick="copyToClipboard('${url}')" class="btn-icon"
            title="Copy survey link to clipboard">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          ${remindBtnHtml}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updatePaginationUI(total, totalPages);
}

function renderCards() {
  const container = document.getElementById("cardContainer");
  if (!container) return;
  container.innerHTML = "";

  const total = filteredData.length;

  if (total === 0) {
    container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No tracking records match your filter.</p>`;
    updatePaginationUI(0, 0);
    return;
  }

  const effectiveLimit = trackingLimit === 99999 ? total : trackingLimit;
  const totalPages = Math.ceil(total / effectiveLimit);
  const start = (trackingPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);
  const pageData = filteredData.slice(start, end);

  pageData.forEach((item) => {
    const { dateStr, statusBadge, url } = buildRowParts(item);
    const { rank, displayName } = parseRankAndName(item.member_name);
    const rankHtml = (rank && rank !== "-") ? `<div class="card-rank">${formatRankCell(rank)}</div>` : "";

    const card = document.createElement("div");
    card.className = "table-card";
    card.innerHTML = `
      <div class="card-header">
        ${rankHtml}
        <span class="card-title">${displayName}</span>
        ${statusBadge}
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">Email:</span>
          <span style="font-size:0.9em;">${item.email || "No email provided"}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Completed:</span>
          <span>${dateStr}</span>
        </div>
      </div>
      <div class="card-actions">
        <button onclick="copyToClipboard('${url}')" class="btn-primary btn-sm"
          title="Copy survey link to clipboard">Copy Link</button>
        ${item.status === "sent"
          ? `<button onclick="remindMember(${item.tracking_id})" class="btn-success btn-sm"
               title="Resend email reminder to this member">Remind</button>`
          : ""}
      </div>
    `;
    container.appendChild(card);
  });

  updatePaginationUI(total, totalPages);
}

// Shared helper — builds the date string, status badge, url, and remind button HTML for a row
function buildRowParts(item) {
  const locale =
    uiConfig?.locale || uiConfig?.appLocale || navigator.language || "en-NZ";
  const tz =
    uiConfig?.timezone ||
    uiConfig?.appTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  let safeDateStr = item.completed_at;
  if (safeDateStr && !safeDateStr.includes("Z")) {
    safeDateStr = safeDateStr.replace(" ", "T") + "Z";
  }

  const dateStr = safeDateStr
    ? new Date(safeDateStr).toLocaleString(locale, { timeZone: tz })
    : "-";

  const statusBadge =
    item.status === "submitted"
      ? `<span class="status-badge status-submitted">Submitted</span>`
      : `<span class="status-badge status-pending">Pending</span>`;

  const url = `${appBaseUrl}/surveys-view.html?id=${surveyGuid}&code=${item.access_code}`;

  const remindBtnHtml =
    item.status === "sent"
      ? `<button onclick="remindMember(${item.tracking_id})" class="btn-icon"
           title="Resend email reminder to this member">
           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2">
             <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
             <polyline points="22,6 12,13 2,6"></polyline>
           </svg>
         </button>`
      : "";

  return { dateStr, statusBadge, url, remindBtnHtml };
}

// ── Actions ───────────────────────────────────────────────────────────────────

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Survey link copied to clipboard!", "success"))
    .catch(() => showToast("Failed to copy link.", "error"));
}

async function remindMember(trackingId) {
  if (uiConfig?.appMode === "demo")
    return showToast("Emails disabled in Demo Mode", "warning");
  const item = rawData.find((i) => i.tracking_id == trackingId);
  const name = item?.member_name || "member";
  try {
    showGlobalSpinner("Sending reminder email...");
    updateGlobalSpinnerMessage("Sending reminder email...", name);
    const res = await fetch(
      `/api/surveys/instances/${liveSurveyId}/remind/${trackingId}`,
      { method: "POST" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send reminder");
    showToast(data.message, "success");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    hideGlobalSpinner();
  }
}

async function remindAllPending() {
  if (uiConfig?.appMode === "demo")
    return showToast("Emails disabled in Demo Mode", "warning");

  const pending = rawData.filter((i) => i.status === "sent");
  if (pending.length === 0)
    return showToast("There are no pending members to remind.", "warning");

  if (
    !(await confirmAction(
      "Remind All Pending",
      `Send a reminder email to all ${pending.length} pending members?`
    ))
  )
    return;

  let successCount = 0;
  let failCount = 0;

  showGlobalSpinner(`Sending reminders... 0%`);

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    updateGlobalSpinnerMessage(
      `Sending reminders... ${i + 1} of ${pending.length}`,
      `Sending to: ${item.member_name}`
    );
    await new Promise(r => requestAnimationFrame(r));
    try {
      const res = await fetch(
        `/api/surveys/instances/${liveSurveyId}/remind/${item.tracking_id}`,
        { method: "POST" }
      );
      if (res.ok) successCount++;
      else failCount++;
    } catch (_) {
      failCount++;
    }
  }

  hideGlobalSpinner();

  if (failCount === 0)
    showToast(`Reminders sent to ${successCount} member${successCount !== 1 ? "s" : ""}.`, "success");
  else
    showToast(`Sent: ${successCount}, failed: ${failCount}.`, "warning");

  loadData();
}
