let rawData = [];
let filteredData = [];
let sortCol = "published_at";
let sortDir = "desc";
let uiConfig = null;

let currentPage = 1;
let itemsPerPage = 25;

document.addEventListener("DOMContentLoaded", () => {
  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle("Published Surveys", "Published Surveys");
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
        showToast("Access Denied.", "error");
        setTimeout(() => (window.location.href = "/"), 1500);
      } else {
        fetch("/api/user-preferences")
          .then((r) => r.json())
          .then((prefs) => {
            if (prefs.liveSurveySortMode) {
              const parts = prefs.liveSurveySortMode.split("_dir_");
              if (parts.length === 2) {
                sortCol = parts[0];
                sortDir = parts[1];
              }
            }
            if (prefs.liveSurveyItemsPerPage) {
              const savedLimit = prefs.liveSurveyItemsPerPage;
              const selectEl = document.getElementById("rowsPerPage");
              const selectMobile = document.getElementById("rowsPerPageMobile");
              if (selectEl) selectEl.value = savedLimit;
              if (selectMobile) selectMobile.value = savedLimit;
              if (savedLimit !== "all") itemsPerPage = parseInt(savedLimit, 10);
            }
            loadData();
          })
          .catch(() => loadData());
      }
    })
    .catch(() => (window.location.href = "/login.html"));

  const scrollTopBtn = document.getElementById("scrollTopBtn");
  window.onscroll = () => {
    if (scrollTopBtn)
      scrollTopBtn.style.display = window.scrollY > 200 ? "flex" : "none";
  };
  window.scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadData();
  });
});

async function loadData() {
  try {
    const res = await fetch("/api/surveys/instances");
    if (!res.ok) throw new Error("Failed to fetch surveys");
    rawData = await res.json();
    applyFilters();
  } catch (e) {
    showToast(e.message, "error");
    document.getElementById("tableBody").innerHTML =
      `<tr><td colspan="5" class="text-center" style="color:var(--danger);">Error loading data.</td></tr>`;
  }
}

function applyFilters() {
  currentPage = 1;

  const nameFilter = document.getElementById("filterName").value.toLowerCase();
  const statusFilter = document.getElementById("filterStatus").value;
  const dateFrom = document.getElementById("filterDateFrom").value;
  const dateTo = document.getElementById("filterDateTo").value;

  filteredData = rawData.filter((item) => {
    if (statusFilter === "active" && item.is_archived === 1) return false;
    if (statusFilter === "archived" && item.is_archived === 0) return false;
    if (nameFilter && !(item.name || "").toLowerCase().includes(nameFilter))
      return false;
    const itemDate = new Date(item.published_at).toISOString().split("T")[0];
    if (dateFrom && itemDate < dateFrom) return false;
    if (dateTo && itemDate > dateTo) return false;
    return true;
  });

  sortFilteredData();
  if (typeof updateFilterHighlights === "function") updateFilterHighlights();
  renderTable();
}

function resetFilters() {
  document.getElementById("filterName").value = "";
  document.getElementById("filterStatus").value = "active";
  document.getElementById("filterDateFrom").value = "";
  document.getElementById("filterDateTo").value = "";
  applyFilters();
}

function setSort(col) {
  if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
  else { sortCol = col; sortDir = "asc"; }
  _saveSortPref();
  sortFilteredData();
  renderTable();
}

function handleMobileSort(col) {
  if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
  else { sortCol = col; sortDir = "asc"; }
  _saveSortPref();
  sortFilteredData();
  renderTable();
}

function _saveSortPref() {
  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "liveSurveySortMode", value: `${sortCol}_dir_${sortDir}` }),
  }).catch(() => {});
}

function sortFilteredData() {
  filteredData.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (sortCol === "name") {
      valA = (valA || "").toLowerCase();
      valB = (valB || "").toLowerCase();
    }
    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  currentPage = Math.max(1, Math.min(currentPage + delta, totalPages));
  renderTable();
}

window.goToFirstPage = function () {
  if (currentPage !== 1) { currentPage = 1; renderTable(); }
};

window.goToLastPage = function () {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  if (currentPage !== totalPages) { currentPage = totalPages; renderTable(); }
};

function changeRowsPerPage() {
  changeLimit(document.getElementById("rowsPerPage").value);
}

function changeLimit(val) {
  const selectEl = document.getElementById("rowsPerPage");
  const selectMobile = document.getElementById("rowsPerPageMobile");
  if (selectEl) selectEl.value = val;
  if (selectMobile) selectMobile.value = val;
  itemsPerPage = val === "all" ? (filteredData.length > 0 ? filteredData.length : 1) : parseInt(val, 10);
  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "liveSurveyItemsPerPage", value: val }),
  }).catch(() => {});
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  // Update sortable column header classes and icons
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    const span = th.querySelector(".sort-icon");
    if (span) span.textContent = "⇅";
    if (th.dataset.sort === sortCol) {
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
      if (span) span.textContent = sortDir === "asc" ? "▲" : "▼";
    }
  });

  // Update mobile sort bar icons
  ["published_at", "name", "is_archived"].forEach((col) => {
    const span = document.getElementById(`msort-${col}`);
    if (span) span.textContent = col === sortCol ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    const btn = document.getElementById(`sortBtn-${col}`);
    if (btn) btn.classList.toggle("active", col === sortCol);
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
  const showStart = filteredData.length > 0 ? startIndex + 1 : 0;

  document.getElementById("pageInfo").innerText = `${showStart}-${endIndex} of ${filteredData.length}`;
  document.getElementById("btnFirst").disabled = currentPage === 1;
  document.getElementById("btnPrev").disabled = currentPage === 1;
  document.getElementById("btnNext").disabled = currentPage === totalPages;
  document.getElementById("btnLast").disabled = currentPage === totalPages;

  const paginatedItems = filteredData.slice(startIndex, startIndex + itemsPerPage);

  if (paginatedItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No surveys found matching filters.</td></tr>`;
    renderCards();
    return;
  }

  const locale = uiConfig?.locale || navigator.language || "en-NZ";
  const tz = uiConfig?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  paginatedItems.forEach((item) => {
    const sent = item.total_sent || 0;
    const submitted = item.total_submitted || 0;
    const pct = sent > 0 ? Math.round((submitted / sent) * 100) : 0;

    let safeDateStr = item.published_at;
    if (safeDateStr && !safeDateStr.includes("Z"))
      safeDateStr = safeDateStr.replace(" ", "T") + "Z";
    const dateStr = new Date(safeDateStr).toLocaleDateString(locale, { timeZone: tz });

    const anonymityIcon =
      item.is_anonymous === 0
        ? `<span title="Non-Anonymous: Responses linked to identities" style="margin-right:8px; cursor:help; color:var(--danger);">🆔</span>`
        : `<span title="Anonymous: Private responses" style="margin-right:8px; cursor:help; opacity:0.6;">🔒</span>`;
    const statusBadge = item.is_archived
      ? `<span class="status-badge status-archived">Archived</span>`
      : `<span class="status-badge status-active">Active</span>`;

    let actionsHtml = `
      <button onclick="window.location.href='surveys-results.html?id=${item.id}'" class="btn-sm btn-primary" title="View survey results">Results</button>
      <button onclick="window.location.href='surveys-tracking.html?id=${item.id}'" class="btn-sm btn-informative" title="View member tracking">Tracking</button>`;
    if (item.is_archived) {
      actionsHtml += `
      <button onclick="toggleArchive(${item.id}, false)" class="btn-sm btn-success" title="Unarchive this survey">Unarchive</button>
      <button onclick="deleteInstance(${item.id})" class="btn-sm btn-danger" title="Permanently delete this survey">Delete</button>`;
    } else {
      actionsHtml += `
      <button onclick="toggleArchive(${item.id}, true)" class="btn-sm btn-secondary" title="Archive this survey">Archive</button>`;
    }

    const tr = document.createElement("tr");
    if (item.is_archived) tr.style.opacity = "0.7";
    tr.innerHTML = `
      <td style="white-space:nowrap;">${dateStr}</td>
      <td style="font-weight:bold;">
        <div style="display:flex; align-items:center;">${anonymityIcon}<span>${item.name}</span></div>
      </td>
      <td>${statusBadge}</td>
      <td>
        <div class="progress-cell">
          <span style="font-size:13px; min-width:45px;">${submitted} / ${sent}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <span style="font-size:12px; color:var(--text-muted); min-width:35px; text-align:right;">${pct}%</span>
        </div>
      </td>
      <td class="text-center ws-nowrap">${actionsHtml}</td>`;
    tbody.appendChild(tr);
  });

  renderCards();
}

function renderCards() {
  const container = document.getElementById("cardContainer");
  if (!container) return;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredData.slice(startIndex, startIndex + itemsPerPage);

  container.innerHTML = "";

  if (paginatedItems.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No surveys found matching filters.</p>`;
    syncMobilePagination(false);
    return;
  }

  const locale = uiConfig?.locale || navigator.language || "en-NZ";
  const tz = uiConfig?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  paginatedItems.forEach((item) => {
    const sent = item.total_sent || 0;
    const submitted = item.total_submitted || 0;
    const pct = sent > 0 ? Math.round((submitted / sent) * 100) : 0;

    let safeDateStr = item.published_at;
    if (safeDateStr && !safeDateStr.includes("Z"))
      safeDateStr = safeDateStr.replace(" ", "T") + "Z";
    const dateStr = new Date(safeDateStr).toLocaleDateString(locale, { timeZone: tz });

    const statusBadge = item.is_archived
      ? `<span class="status-badge status-archived">Archived</span>`
      : `<span class="status-badge status-active">Active</span>`;
    const anonymityLabel = item.is_anonymous === 0 ? "Non-Anonymous 🆔" : "Anonymous 🔒";

    let cardActions = `
      <button onclick="window.location.href='surveys-results.html?id=${item.id}'" class="btn-sm btn-primary" title="View survey results">Results</button>
      <button onclick="window.location.href='surveys-tracking.html?id=${item.id}'" class="btn-sm btn-informative" title="View member tracking">Tracking</button>`;
    if (item.is_archived) {
      cardActions += `
      <button onclick="toggleArchive(${item.id}, false)" class="btn-sm btn-success" title="Unarchive this survey">Unarchive</button>
      <button onclick="deleteInstance(${item.id})" class="btn-sm btn-danger" title="Permanently delete this survey">Delete</button>`;
    } else {
      cardActions += `
      <button onclick="toggleArchive(${item.id}, true)" class="btn-sm btn-secondary" title="Archive this survey">Archive</button>`;
    }

    const card = document.createElement("div");
    card.className = "table-card";
    if (item.is_archived) card.style.opacity = "0.7";
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${item.name}</span>
        ${statusBadge}
      </div>
      <div class="card-body">
        <div class="card-row"><span class="card-label">Published:</span><span>${dateStr}</span></div>
        <div class="card-row"><span class="card-label">Anonymity:</span><span>${anonymityLabel}</span></div>
        <div class="card-row"><span class="card-label">Responses:</span><span>${submitted} / ${sent} (${pct}%)</span></div>
      </div>
      <div class="card-actions">${cardActions}</div>`;
    container.appendChild(card);
  });

  syncMobilePagination(true);
}

function syncMobilePagination(show) {
  const ctrl = document.getElementById("paginationControlsMobile");
  if (!ctrl) return;
  ctrl.style.display = show ? "flex" : "none";
  if (!show) return;

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
  const showStart = filteredData.length > 0 ? startIndex + 1 : 0;

  const pageInfoMobile = document.getElementById("pageInfoMobile");
  if (pageInfoMobile) pageInfoMobile.textContent = `${showStart}-${endIndex} of ${filteredData.length}`;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.disabled = val; };
  set("btnFirstMobile", currentPage <= 1);
  set("btnPrevMobile", currentPage <= 1);
  set("btnNextMobile", currentPage >= totalPages);
  set("btnLastMobile", currentPage >= totalPages);

  const rowsPerPageMobile = document.getElementById("rowsPerPageMobile");
  if (rowsPerPageMobile) rowsPerPageMobile.value = document.getElementById("rowsPerPage").value;
}

// --- Archive / Delete ---

async function toggleArchive(id, archive) {
  if (uiConfig?.appMode === "demo")
    return showToast("Archiving disabled in Demo Mode", "warning");
  try {
    const res = await fetch(`/api/surveys/instances/${id}/archive`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: archive }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    showToast(`Survey instance ${archive ? "archived" : "unarchived"}.`, "success");
    loadData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteInstance(id) {
  if (uiConfig?.appMode === "demo")
    return showToast("Deletion disabled in Demo Mode", "warning");
  if (!(await confirmAction("Delete Instance",
    "WARNING: This permanently deletes this survey instance and all its answers. Cannot be undone.")))
    return;
  try {
    const res = await fetch(`/api/surveys/instances/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Deletion failed");
    showToast("Survey instance deleted.", "success");
    loadData();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// --- Bulk Actions ---

function downloadFilteredJson() {
  if (filteredData.length === 0) return showToast("No data to download.", "warning");
  const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `live_surveys_export_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function purgeFiltered() {
  if (uiConfig?.appMode === "demo")
    return showToast("Purge disabled in Demo Mode", "warning");
  if (filteredData.length === 0)
    return showToast("No surveys match the current filter.", "warning");

  const msg = `WARNING: You are about to PERMANENTLY DELETE ${filteredData.length} survey instances and ALL associated tracking/response data.<br><br>Type <strong>PURGE</strong> below to confirm.`;
  if (!(await promptAction("Purge Surveys", msg, "PURGE")))
    return showToast("Purge cancelled.", "info");

  let successCount = 0;
  let failCount = 0;

  if (typeof window.showGlobalSpinner === "function")
    showGlobalSpinner(`Purging ${filteredData.length} surveys...`);

  for (const item of filteredData) {
    try {
      const res = await fetch(`/api/surveys/instances/${item.id}`, { method: "DELETE" });
      if (res.ok) successCount++;
      else failCount++;
    } catch (e) {
      failCount++;
    }
  }

  if (typeof window.hideGlobalSpinner === "function") hideGlobalSpinner();

  if (failCount === 0)
    showToast(`Successfully purged ${successCount} surveys.`, "success");
  else
    showToast(`Purged ${successCount} surveys, but ${failCount} failed.`, "warning");

  loadData();
}
