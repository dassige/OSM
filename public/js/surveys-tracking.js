let surveyGuid = null;
const urlParams = new URLSearchParams(window.location.search);
const liveSurveyId = urlParams.get("id");

let rawData = [];
let filteredData = [];
let sortCol = "member_name";
let sortDir = "asc";
let uiConfig = null;
let appBaseUrl = window.location.origin;

document.addEventListener("DOMContentLoaded", () => {
  if (!liveSurveyId) {
    showToast("No survey ID provided.", "error");
    setTimeout(() => (window.location.href = "live-surveys.html"), 1500);
    return;
  }

  fetch("/ui-config")
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      if (c.loginTitle) {
        document.title = "Surveys Tracker - " + c.loginTitle;
        document.getElementById("pageHeader").innerText =
          "Surveys Tracker - " + c.loginTitle;
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
        showToast("Access Denied.", "error");
        setTimeout(() => (window.location.href = "/"), 1500);
      } else {
        fetch("/api/user-preferences")
          .then((r) => r.json())
          .then((prefs) => {
            if (prefs.surveyTrackingSortMode) {
              const parts = prefs.surveyTrackingSortMode.split("_dir_");
              if (parts.length === 2) {
                sortCol = parts[0];
                sortDir = parts[1];
              }
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
    surveyGuid = result.surveyGuid; // <-- Add this line!

    applyFilters();
  } catch (e) {
    showToast(e.message, "error");
    document.getElementById("tableBody").innerHTML =
      `<tr><td colspan="4" class="text-center" style="color:var(--danger);">Error loading data.</td></tr>`;
  }
}

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

  sortFilteredData();
  renderTable();
}

function resetFilters() {
  document.getElementById("filterName").value = "";
  document.getElementById("filterStatus").value = "all";
  applyFilters();
}

function setSort(col) {
  if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
  else {
    sortCol = col;
    sortDir = "asc";
  }

  fetch("/api/user-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "surveyTrackingSortMode",
      value: `${sortCol}_dir_${sortDir}`,
    }),
  }).catch(() => {});

  sortFilteredData();
  renderTable();
}

function sortFilteredData() {
  filteredData.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];

    // Handle null dates nicely
    if (sortCol === "completed_at") {
      valA = valA || "0000";
      valB = valB || "0000";
    } else {
      valA = (valA || "").toString().toLowerCase();
      valB = (valB || "").toString().toLowerCase();
    }

    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  document.querySelectorAll("th span").forEach((s) => (s.innerText = ""));
  const icon = sortDir === "asc" ? " ▲" : " ▼";
  const sortSpan = document.getElementById(`sort_${sortCol}`);
  if (sortSpan) sortSpan.innerText = icon;

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 30px; color:var(--text-muted);">No tracking records match your filter.</td></tr>`;
    return;
  }

  filteredData.forEach((item) => {
    const locale =
      uiConfig?.locale || uiConfig?.appLocale || navigator.language || "en-NZ";
    const tz =
      uiConfig?.timezone ||
      uiConfig?.appTimezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Safely parse SQLite's raw UTC string
    let safeDateStr = item.completed_at;
    if (safeDateStr && !safeDateStr.includes("Z")) {
      safeDateStr = safeDateStr.replace(" ", "T") + "Z";
    }

    // Apply timezone to toLocaleString so hours/minutes match the organization
    const dateStr = safeDateStr
      ? new Date(safeDateStr).toLocaleString(locale, { timeZone: tz })
      : "-";

    const statusBadge =
      item.status === "submitted"
        ? `<span class="status-badge status-submitted">Submitted</span>`
        : `<span class="status-badge status-pending">Pending</span>`;

    const url = `${appBaseUrl}/surveys-view.html?id=${surveyGuid}&code=${item.access_code}`;

    let remindBtnHtml = "";
    if (item.status === "pending") {
      remindBtnHtml = `
                <button onclick="remindMember(${item.tracking_id})" class="btn-sm" style="border-radius: 50%; width: 30px; height: 30px; padding: 0; display: inline-flex; justify-content: center; align-items: center; border: 1px solid var(--border-color); background: var(--bg-body); color: var(--text-main);" title="Resend email reminder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </button>
            `;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td style="font-weight:500;">
                ${item.member_name}
                <div style="font-size: 12px; color: var(--text-muted); font-weight: normal;">${item.email || "No email provided"}</div>
            </td>
            <td>${statusBadge}</td>
            <td>${dateStr}</td>
            <td style="text-align:right; display:flex; justify-content:flex-end; gap:8px; align-items:center;">
                <button onclick="copyToClipboard('${url}')" class="btn-sm" style="border-radius: 50%; width: 30px; height: 30px; padding: 0; display: inline-flex; justify-content: center; align-items: center; border: 1px solid var(--border-color); background: var(--bg-body); color: var(--text-main);" title="Copy survey link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                ${remindBtnHtml}
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("Survey link copied to clipboard!", "success");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      showToast("Failed to copy link.", "error");
    });
}

async function remindMember(trackingId) {
  if (uiConfig?.appMode === "demo")
    return showToast("Emails disabled in Demo Mode", "warning");
  try {
    const res = await fetch(
      `/api/surveys/instances/${liveSurveyId}/remind/${trackingId}`,
      { method: "POST" },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send reminder");
    showToast(data.message, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function remindAllPending() {
  if (uiConfig?.appMode === "demo")
    return showToast("Emails disabled in Demo Mode", "warning");

  const pendingCount = rawData.filter((i) => i.status === "pending").length;
  if (pendingCount === 0)
    return showToast("There are no pending members to remind.", "warning");

  // confirmAction requires utils.js, which is already linked in the HTML
  if (
    !(await confirmAction(
      "Remind All Pending",
      `Are you sure you want to trigger a reminder email to all ${pendingCount} pending members?`,
    ))
  )
    return;

  try {
    const res = await fetch(
      `/api/surveys/instances/${liveSurveyId}/remind-all`,
      { method: "POST" },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send bulk reminders");
    showToast(data.message, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}
