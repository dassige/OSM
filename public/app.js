// public/app.js
const socket = io();

let currentOsmData = [];
let currentSort = { column: "name", order: "asc" };
let isWaReady = false;
let showCompletionToast = false;
let isJobRunning = false;
let isLoadingData = false;
let jobTimeoutId = null;

const ICON_ASC =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const ICON_DESC =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_NONE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>';

const sendEmailsBtn = document.getElementById("sendEmailsBtn");
const viewBtn = document.getElementById("viewBtn");

const tableContainer = document.getElementById("tableContainer");
const skillsTableBody = document.querySelector("#skillsTable tbody");
const daysInput = document.getElementById("daysInput");
const btnHideNoSkills = document.getElementById("btnHideNoSkills");
const btnHideNoUrl = document.getElementById("btnHideNoUrl");
const btnExpiredOnly = document.getElementById("btnExpiredOnly");
const btnHideWithUrl = document.getElementById("btnHideWithUrl");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");
const skillsCardView = document.getElementById("skillsCardView");

function init() {
  socket.on("connect_error", (err) => {
    if (err.message === "unauthorized") window.location.href = "/login.html";
  });

  socket.on("disconnect", () => {
    const banner = document.getElementById("socketBanner");
    if (banner) banner.style.display = "block";
    sendEmailsBtn.disabled = true;
    if (viewBtn) viewBtn.disabled = true;
  });

  socket.on("connect", () => {
    const banner = document.getElementById("socketBanner");
    if (banner) banner.style.display = "none";

    if (isJobRunning) {
      setIdleState(1);
      if (window.showToast) showToast("Reconnected. The operation was interrupted — please retry.", "warning");
    } else if (isLoadingData) {
      isLoadingData = false;
      if (viewBtn) { viewBtn.disabled = false; (viewBtn.querySelector('.btn-text') || viewBtn).textContent = "Reload Expiring Skills"; }
      const overlay = document.getElementById("loadingOverlay");
      if (overlay) overlay.style.display = "none";
      if (window.showToast) showToast("Reconnected. Please reload the data.", "info");
    }

    socket.emit("get-preferences");
    socket.emit("wa-get-status");
  });

  updateNotificationBadges();
  checkPendingReviews();

  fetch("/ui-config")
    .then((response) => response.json())
    .then((config) => {
      if (config.loginTitle) {
        document.getElementById("pageTitle").innerText = config.loginTitle;
        document.getElementById("mainHeader").innerText = config.loginTitle;
      }
      if (config.appBackground)
        document.body.style.backgroundImage = `url('${config.appBackground}')`;
      if (config.version)
        document.getElementById("disp-version").textContent = config.version;
      if (config.deployDate)
        document.getElementById("disp-date").textContent = config.deployDate;
      if (config.version && window.resolveReleaseUrl) {
        window.resolveReleaseUrl(config.version).then(function(url) {
            const link = document.getElementById('disp-release-link');
            if (link) window.applyReleaseLink(link, url, config.version);
        });
      }
      if (config.appMode === "demo") {
        document.getElementById("demoBanner").style.display = "block";
      }
    })
    .catch((err) => console.error("Failed to load UI config:", err));

  fetch("/api/user-session")
    .then((r) => r.json())
    .then((user) => {
      document.body.setAttribute("data-user-role", user.role || "guest");
      updateRoleUI(user.role || "guest");
    });
}
// Helper to parse "Rank" and "Display Name"
function parseRankAndName(fullName) {
  const parts = (fullName || "").trim().split(" ");
  if (parts.length > 1 && /^[A-Za-z]{2,4}$/.test(parts[0])) {
    return { rank: parts[0], displayName: parts.slice(1).join(" ") };
  }
  return { rank: "-", displayName: fullName || "" };
}
function setRunningState() {
  isJobRunning = true;
  jobTimeoutId = setTimeout(() => {
    if (isJobRunning) {
      setIdleState(1);
      if (window.showToast) showToast("Operation timed out — no response from server. Please retry.", "error");
    }
  }, 90000);

  sendEmailsBtn.disabled = true;
  viewBtn.disabled = true;
  document
    .querySelectorAll(".header-checkbox-label input")
    .forEach((cb) => (cb.disabled = true));
  document
    .querySelectorAll(".btn-round")
    .forEach((btn) => (btn.disabled = true));

  if (window.showToast) window.showToast("Starting process...", "info");
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "Starting...";
}

function setIdleState(code) {
  isJobRunning = false;
  if (jobTimeoutId) { clearTimeout(jobTimeoutId); jobTimeoutId = null; }
  const isTableVisible = tableContainer.style.display !== "none";
  document
    .querySelectorAll(".header-checkbox-label input")
    .forEach((cb) => (cb.disabled = !isTableVisible));
  document
    .querySelectorAll(".btn-round")
    .forEach((btn) => (btn.disabled = false));
  viewBtn.disabled = false;
  updateSendButtonState();

  if (code === 0) {
    if (showCompletionToast && window.showToast) {
      window.showToast("Completed Successfully", "success");
    }
    fetchData(false);
    progressBar.style.width = "100%";
    progressBar.textContent = "Completed";
  } else {
    if (window.showToast) window.showToast("Process Failed", "error");
  }
  showCompletionToast = false;
  setTimeout(() => {
    progressContainer.style.display = "none";
  }, 3000);
}

function updateSendButtonState() {
  const role = document.body.getAttribute("data-user-role");
  if (role === "guest") {
    if (sendEmailsBtn) sendEmailsBtn.style.display = "none";
    return;
  }
  const scope = window.innerWidth <= 768 ? "#skillsCardView" : "#skillsTable";
  const anyChecked = document.querySelectorAll(
    `${scope} .send-email-cb:checked, ${scope} .send-wa-cb:checked`
  ).length > 0;
  sendEmailsBtn.disabled = !anyChecked;
}

function updateRoleUI(role) {
  if (role === "guest") {
    if (sendEmailsBtn) sendEmailsBtn.style.display = "none";
    if (viewBtn) {
      viewBtn.disabled = false;
      viewBtn.style.display = "inline-block";
    }
  }
}

function fetchData(forceRefresh = false) {
  const days = parseInt(daysInput.value) || 30;

  if (viewBtn) {
    viewBtn.disabled = true;
    (viewBtn.querySelector('.btn-text') || viewBtn).textContent = "Loading...";
  }

  const overlay = document.getElementById("loadingOverlay");

  if (tableContainer) tableContainer.style.display = "none";
  if (overlay) overlay.style.display = "block";

  isLoadingData = true;
  socket.emit("view-expiring-skills", days, forceRefresh);
}

function renderSkeletons() {
  skillsTableBody.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td><div class="skeleton" style="width: 50%;"></div></td>
            <td><div class="skeleton" style="width: 80%;"></div></td>
            <td><div class="skeleton" style="width: 30%;"></div></td>
            <td><div class="skeleton" style="width: 60%;"></div></td>
        `;
    skillsTableBody.appendChild(tr);
  }
}

function handleSort(column) {
  if (column !== "name" && column !== "rank") return; // Dashboard only sorts by rank/name locally
  if (currentSort.column === column) {
    currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
  } else {
    currentSort.column = column;
    currentSort.order = "asc";
  }
  socket.emit("update-preference", { key: "sortSkills", value: currentSort });
  applySort();
}

function applySort() {
  currentOsmData.sort((a, b) => {
    const parsedA = parseRankAndName(a.name);
    const parsedB = parseRankAndName(b.name);

    let valA, valB;
    if (currentSort.column === "rank") {
      valA = parsedA.rank.toLowerCase();
      valB = parsedB.rank.toLowerCase();
    } else {
      valA = parsedA.displayName.toLowerCase();
      valB = parsedB.displayName.toLowerCase();
    }

    if (valA < valB) return currentSort.order === "asc" ? -1 : 1;
    if (valA > valB) return currentSort.order === "asc" ? 1 : -1;
    return 0;
  });

  // Reset and apply sort icons — desktop table headers + mobile sort bar
  ["rank", "name"].forEach((col) => {
    const iconSpan = document.getElementById(`icon-${col}`);
    if (iconSpan) { iconSpan.innerHTML = ICON_NONE; iconSpan.classList.remove("active"); }
    const mobileBtn = document.getElementById(`mobileSortBtn-${col}`);
    if (mobileBtn) mobileBtn.classList.remove("active");
    const mobileIcon = document.getElementById(`mobile-icon-${col}`);
    if (mobileIcon) mobileIcon.innerHTML = ICON_NONE;
  });

  const activeIconSpan = document.getElementById(`icon-${currentSort.column}`);
  if (activeIconSpan) {
    activeIconSpan.innerHTML = currentSort.order === "asc" ? ICON_ASC : ICON_DESC;
    activeIconSpan.classList.add("active");
  }
  const activeMobileBtn = document.getElementById(`mobileSortBtn-${currentSort.column}`);
  if (activeMobileBtn) activeMobileBtn.classList.add("active");
  const activeMobileIcon = document.getElementById(`mobile-icon-${currentSort.column}`);
  if (activeMobileIcon) activeMobileIcon.innerHTML = currentSort.order === "asc" ? ICON_ASC : ICON_DESC;

  renderTable();
}

function renderTable() {
  skillsTableBody.innerHTML = "";
  const hideNoSkills = btnHideNoSkills.classList.contains("active");
  const hideNoUrl = btnHideNoUrl.classList.contains("active");
  const expiredOnly = btnExpiredOnly.classList.contains("active");
  const hideWithUrl = btnHideWithUrl.classList.contains("active");

  let visibleCount = 0;

  currentOsmData.forEach((member, index) => {
    let visibleSkills = member.skills;
    if (hideNoUrl) visibleSkills = visibleSkills.filter((s) => s.hasUrl);
    if (expiredOnly)
      visibleSkills = visibleSkills.filter((s) => isDateInPast(s.dueDate));
    if (hideWithUrl) visibleSkills = visibleSkills.filter((s) => !s.hasUrl);

    const hasVisibleSkills = visibleSkills.length > 0;
    if (hideNoSkills && !hasVisibleSkills) return;

    visibleCount++;

    const rowClass = visibleCount % 2 === 1 ? "row-even" : "row-odd";

    // --- Member header row (rank + name + notification only) ---
    const tr = document.createElement("tr");
    tr.className = rowClass + " member-header-row";
    if (!hasVisibleSkills) tr.classList.add("no-skills-row");

    const { rank, displayName } = parseRankAndName(member.name);

    const rankTd = document.createElement("td");
    rankTd.className = "member-cell text-center";
    rankTd.setAttribute("data-label", "Member");
    rankTd.innerHTML = formatRankCell(rank);
    tr.appendChild(rankTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = displayName;
    nameTd.className = "member-cell";
    nameTd.setAttribute("data-label", "Name");
    tr.appendChild(nameTd);

    if (!hasVisibleSkills) {
      const noSkillTd = document.createElement("td");
      noSkillTd.colSpan = 2;
      let msg = "NO expiring skills";
      if (hideNoUrl && member.skills.length > 0)
        msg = "(Hidden by 'Has Form' filter)";
      else if (hideWithUrl && member.skills.length > 0)
        msg = "(Hidden by 'No Form' filter)";
      else if (expiredOnly && member.skills.length > 0)
        msg = "(Hidden by 'Expired Only' filter)";
      noSkillTd.textContent = msg;
      noSkillTd.className = "no-skill";
      tr.appendChild(noSkillTd);
    } else {
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 2;
      emptyTd.className = "merged-cell";
      tr.appendChild(emptyTd);
    }

    const prefs = (member.notificationPreference || "email").split(",");
    const defaultEmail = prefs.includes("email");
    const defaultWa = prefs.includes("whatsapp");

    const actionTd = document.createElement("td");
    actionTd.className = "member-cell";
    actionTd.setAttribute("data-label", "Notification");

    if (member.emailEligible && hasVisibleSkills) {
      const wrapper = document.createElement("div");
      wrapper.className = "action-wrapper";

      // Email Row
      const emailRow = document.createElement("div");
      emailRow.className = "action-row";

      const hasEmail = member.email && member.email.includes("@");
      const emailLabel = document.createElement("label");
      emailLabel.className = "email-label action-label";
      emailLabel.innerHTML = `<input type="checkbox" class="send-email-cb" data-name="${member.name}" ${hasEmail ? (defaultEmail ? "checked" : "") : "disabled"}> Email`;
      if (!hasEmail) emailLabel.style.opacity = "0.5";

      const btnEmail = document.createElement("button");
      btnEmail.className = "btn-round email";
      btnEmail.title = hasEmail ? "Send Email Immediately" : "No Email Address";
      btnEmail.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
      btnEmail.onclick = () => sendSingleAction(member.name, "email");

      if (!hasEmail) btnEmail.disabled = true;
      emailRow.appendChild(emailLabel);
      emailRow.appendChild(btnEmail);

      // WA Row
      const waRow = document.createElement("div");
      waRow.className = "action-row";

      const hasMobile = member.mobile && member.mobile.length > 5;
      const isWaDisabled = !hasMobile || !isWaReady;
      const waLabel = document.createElement("label");
      waLabel.className = "email-label action-label";
      const shouldCheckWa = defaultWa && !isWaDisabled;
      waLabel.innerHTML = `<input type="checkbox" class="send-wa-cb" data-name="${member.name}" ${isWaDisabled ? "disabled" : shouldCheckWa ? "checked" : ""}> WhatsApp`;
      if (isWaDisabled) waLabel.style.opacity = "0.5";

      const btnWa = document.createElement("button");
      btnWa.className = "btn-round";
      btnWa.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
      btnWa.onclick = () => sendSingleAction(member.name, "whatsapp");

      if (!hasMobile) {
        btnWa.disabled = true;
        btnWa.title = "No Mobile Number";
      } else if (!isWaReady) {
        btnWa.disabled = true;
        btnWa.classList.add("wa-not-ready");
        btnWa.title = "Whatsapp service not started";
      } else {
        btnWa.classList.add("wa-ready");
        btnWa.title = `Send WhatsApp to ${member.mobile}`;
        btnWa.disabled = false;
      }

      waRow.appendChild(waLabel);
      waRow.appendChild(btnWa);

      wrapper.appendChild(emailRow);
      wrapper.appendChild(waRow);
      actionTd.appendChild(wrapper);
    }
    tr.appendChild(actionTd);
    skillsTableBody.appendChild(tr);

    // --- One skill row per visible skill (all of them) ---
    visibleSkills.forEach((skill) => {
      const skillTr = document.createElement("tr");
      skillTr.className = rowClass + " skill-detail-row";

      const mergedNameTd = document.createElement("td");
      mergedNameTd.className = "merged-cell";
      mergedNameTd.colSpan = 2;
      skillTr.appendChild(mergedNameTd);

      const skillTd = document.createElement("td");
      skillTd.innerHTML = buildSkillHtml(skill, member.id);
      skillTd.className = "skill-cell";
      skillTd.setAttribute("data-label", "Skill");
      skillTr.appendChild(skillTd);

      const dateTd = document.createElement("td");
      dateTd.textContent = skill.dueDate;
      dateTd.className = "date-cell";
      dateTd.setAttribute("data-label", "Due Date");
      if (isDateInPast(skill.dueDate)) dateTd.classList.add("date-expired");
      skillTr.appendChild(dateTd);

      const emptyActionTd = document.createElement("td");
      emptyActionTd.className = "merged-cell";
      skillTr.appendChild(emptyActionTd);

      skillsTableBody.appendChild(skillTr);
    });
  });

  // Empty state handling
  if (visibleCount === 0) {
    skillsTableBody.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="5"> <div class="empty-state-content">
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <h3 style="color: var(--text-main);">All Caught Up!</h3>
                        <p>No expiring skills found matching your filters.</p>
                    </div>
                </td>
            </tr>
        `;
  }

  renderCardView();
  document
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb) => cb.addEventListener("change", updateSendButtonState));
  setupMasterCheckbox("selectAllEmail", ".send-email-cb");
  setupMasterCheckbox("selectAllWhatsapp", ".send-wa-cb");
  updateSendButtonState();
}
function renderCardView() {
  if (!skillsCardView) return;
  skillsCardView.innerHTML = "";
  const hideNoSkills = btnHideNoSkills.classList.contains("active");
  const hideNoUrl = btnHideNoUrl.classList.contains("active");
  const expiredOnly = btnExpiredOnly.classList.contains("active");
  const hideWithUrl = btnHideWithUrl.classList.contains("active");

  let visibleCount = 0;

  currentOsmData.forEach((member) => {
    let visibleSkills = member.skills;
    if (hideNoUrl) visibleSkills = visibleSkills.filter((s) => s.hasUrl);
    if (expiredOnly) visibleSkills = visibleSkills.filter((s) => isDateInPast(s.dueDate));
    if (hideWithUrl) visibleSkills = visibleSkills.filter((s) => !s.hasUrl);

    const hasVisibleSkills = visibleSkills.length > 0;
    if (hideNoSkills && !hasVisibleSkills) return;

    visibleCount++;
    const { rank, displayName } = parseRankAndName(member.name);

    const card = document.createElement("div");
    card.className = "member-card";

    // Header: rank + name
    const header = document.createElement("div");
    header.className = "member-card-header";

    const rankEl = document.createElement("span");
    rankEl.className = "member-card-rank";
    rankEl.innerHTML = formatRankCell(rank);
    header.appendChild(rankEl);

    const nameEl = document.createElement("span");
    nameEl.className = "member-card-name";
    nameEl.textContent = displayName;
    header.appendChild(nameEl);
    card.appendChild(header);

    // Skills list
    const skillsContainer = document.createElement("div");
    skillsContainer.className = "member-card-skills";

    if (!hasVisibleSkills) {
      const noSkillDiv = document.createElement("div");
      noSkillDiv.className = "member-card-no-skill";
      let msg = "NO expiring skills";
      if (hideNoUrl && member.skills.length > 0) msg = "(Hidden by 'Has Form' filter)";
      else if (hideWithUrl && member.skills.length > 0) msg = "(Hidden by 'No Form' filter)";
      else if (expiredOnly && member.skills.length > 0) msg = "(Hidden by 'Expired Only' filter)";
      noSkillDiv.textContent = msg;
      skillsContainer.appendChild(noSkillDiv);
    } else {
      visibleSkills.forEach((skill) => {
        const skillRow = document.createElement("div");
        skillRow.className = "member-card-skill";

        const skillNameSpan = document.createElement("span");
        skillNameSpan.className = "skill-name";
        skillNameSpan.innerHTML = buildSkillHtml(skill, member.id);
        skillRow.appendChild(skillNameSpan);

        const dateSpan = document.createElement("span");
        dateSpan.className = "skill-date";
        dateSpan.textContent = skill.dueDate;
        if (isDateInPast(skill.dueDate)) dateSpan.classList.add("date-expired");
        skillRow.appendChild(dateSpan);

        skillsContainer.appendChild(skillRow);
      });
    }
    card.appendChild(skillsContainer);

    // Notification actions (only for eligible members with visible skills)
    if (member.emailEligible && hasVisibleSkills) {
      const prefs = (member.notificationPreference || "email").split(",");
      const defaultEmail = prefs.includes("email");
      const defaultWa = prefs.includes("whatsapp");

      const notifDiv = document.createElement("div");
      notifDiv.className = "member-card-notification";

      const wrapper = document.createElement("div");
      wrapper.className = "action-wrapper";

      const emailRow = document.createElement("div");
      emailRow.className = "action-row";
      const hasEmail = member.email && member.email.includes("@");
      const emailLabel = document.createElement("label");
      emailLabel.className = "email-label action-label";
      emailLabel.innerHTML = `<input type="checkbox" class="send-email-cb" data-name="${member.name}" ${hasEmail ? (defaultEmail ? "checked" : "") : "disabled"}> Email`;
      if (!hasEmail) emailLabel.style.opacity = "0.5";
      const btnEmail = document.createElement("button");
      btnEmail.className = "btn-round email";
      btnEmail.title = hasEmail ? "Send Email Immediately" : "No Email Address";
      btnEmail.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
      btnEmail.onclick = () => sendSingleAction(member.name, "email");
      if (!hasEmail) btnEmail.disabled = true;
      emailRow.appendChild(emailLabel);
      emailRow.appendChild(btnEmail);

      const waRow = document.createElement("div");
      waRow.className = "action-row";
      const hasMobile = member.mobile && member.mobile.length > 5;
      const isWaDisabled = !hasMobile || !isWaReady;
      const waLabel = document.createElement("label");
      waLabel.className = "email-label action-label";
      const shouldCheckWa = defaultWa && !isWaDisabled;
      waLabel.innerHTML = `<input type="checkbox" class="send-wa-cb" data-name="${member.name}" ${isWaDisabled ? "disabled" : shouldCheckWa ? "checked" : ""}> WhatsApp`;
      if (isWaDisabled) waLabel.style.opacity = "0.5";
      const btnWa = document.createElement("button");
      btnWa.className = "btn-round";
      btnWa.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
      btnWa.onclick = () => sendSingleAction(member.name, "whatsapp");
      if (!hasMobile) {
        btnWa.disabled = true;
        btnWa.title = "No Mobile Number";
      } else if (!isWaReady) {
        btnWa.disabled = true;
        btnWa.classList.add("wa-not-ready");
        btnWa.title = "Whatsapp service not started";
      } else {
        btnWa.classList.add("wa-ready");
        btnWa.title = `Send WhatsApp to ${member.mobile}`;
        btnWa.disabled = false;
      }
      waRow.appendChild(waLabel);
      waRow.appendChild(btnWa);

      wrapper.appendChild(emailRow);
      wrapper.appendChild(waRow);
      notifDiv.appendChild(wrapper);
      card.appendChild(notifDiv);
    }

    skillsCardView.appendChild(card);
  });

  if (visibleCount === 0) {
    skillsCardView.innerHTML = `
      <div class="empty-state-content" style="padding: 40px 20px; text-align: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h3 style="color: var(--text-main);">All Caught Up!</h3>
        <p>No expiring skills found matching your filters.</p>
      </div>`;
  }
}

function setupMasterCheckbox(masterId, targetClass) {
  const master = document.getElementById(masterId);
  if (!master) return;
  const newMaster = master.cloneNode(true);
  master.parentNode.replaceChild(newMaster, master);
  newMaster.addEventListener("change", (e) => {
    document.querySelectorAll(targetClass).forEach((cb) => {
      if (!cb.disabled) cb.checked = e.target.checked;
    });
    updateSendButtonState();
  });
}

async function sendSingleAction(name, type) {
  const days = parseInt(daysInput.value) || 30;
  const label = type === "email" ? "Email" : "WhatsApp";

  if (
    await confirmAction(
      "Send Immediate Reminder",
      `Send immediate ${label} reminder to ${name}?`,
    )
  ) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setRunningState();

    const target = {
      name: name,
      sendEmail: type === "email",
      sendWa: type === "whatsapp",
    };

    socket.emit("run-process-queue", [target], days);
  }
}
if (viewBtn) {
  viewBtn.addEventListener("click", () => {
    showCompletionToast = true;
    fetchData(true);
  });
}

sendEmailsBtn.addEventListener("click", async () => {
  const targets = [];
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const memberMap = new Map();
    document.querySelectorAll("#skillsCardView .send-email-cb, #skillsCardView .send-wa-cb").forEach((cb) => {
      if (cb.disabled) return;
      const name = cb.getAttribute("data-name");
      if (!memberMap.has(name)) memberMap.set(name, { name, sendEmail: false, sendWa: false });
      if (cb.classList.contains("send-email-cb") && cb.checked) memberMap.get(name).sendEmail = true;
      if (cb.classList.contains("send-wa-cb") && cb.checked) memberMap.get(name).sendWa = true;
    });
    targets.push(...Array.from(memberMap.values()).filter((t) => t.sendEmail || t.sendWa));
  } else {
    document.querySelectorAll("#skillsTable tbody tr").forEach((row) => {
      const emailCb = row.querySelector(".send-email-cb");
      if (!emailCb) return;
      const name = emailCb.getAttribute("data-name");
      const sendEmail = emailCb.checked;
      const waCb = row.querySelector(".send-wa-cb");
      const sendWa = waCb ? waCb.checked : false;
      if (sendEmail || sendWa) targets.push({ name, sendEmail, sendWa });
    });
  }

  if (targets.length === 0) return showToast("No actions selected", "error");

  if (
    await confirmAction(
      "Bulk Notification",
      `Process ${targets.length} members?`,
    )
  ) {
    showCompletionToast = true;
    setRunningState();
    const days = parseInt(daysInput.value) || 30;
    socket.emit("run-process-queue", targets, days);
  }
});

daysInput.addEventListener("change", (e) =>
  socket.emit("update-preference", {
    key: "daysToExpiry",
    value: parseInt(e.target.value),
  }),
);

function setupChipToggle(btnId, prefKey) {
  document.getElementById(btnId).addEventListener("click", function () {
    this.classList.toggle("active");
    socket.emit("update-preference", {
      key: prefKey,
      value: this.classList.contains("active"),
    });
    renderTable();
  });
}
setupChipToggle("btnHideNoSkills", "hideNoSkills");
setupChipToggle("btnHideNoUrl", "hideNoUrl");
setupChipToggle("btnExpiredOnly", "expiredOnly");
setupChipToggle("btnHideWithUrl", "hideWithUrl");

socket.on("preferences-data", (prefs) => {
  if (prefs.daysToExpiry !== undefined) daysInput.value = prefs.daysToExpiry;
  if (prefs.hideNoSkills) btnHideNoSkills.classList.add("active");
  if (prefs.hideNoUrl) btnHideNoUrl.classList.add("active");
  if (prefs.hideWithUrl) btnHideWithUrl.classList.add("active");
  if (prefs.expiredOnly) btnExpiredOnly.classList.add("active");

  const role = document.body.getAttribute("data-user-role");

  if (prefs.sortSkills) currentSort = prefs.sortSkills;
  fetchData(false);
});

socket.on("wa-status-data", (data) => {
  isWaReady = data.status === "READY";
  if (currentOsmData.length > 0) renderTable();
});

socket.on("wa-status", (status) => {
  isWaReady = status === "READY";
  if (currentOsmData.length > 0) renderTable();
});

socket.on("script-complete", (code) => setIdleState(code));
socket.on("progress-update", (data) => {
  if (data.type === "progress-start") {
    progressBar.style.width = "0%";
    progressBar.textContent = "0%";
  } else if (data.type === "progress-tick") {
    const pct =
      data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
    progressBar.style.width = pct + "%";
    progressBar.textContent = `${pct}% - Processed ${data.member}`;
  }
});

socket.on("expiring-skills-data", (data) => {
  isLoadingData = false;
  if (viewBtn) {
    viewBtn.disabled = false;
    (viewBtn.querySelector('.btn-text') || viewBtn).textContent = "Reload Expiring Skills";
  }

  const tableContainer = document.getElementById("tableContainer");
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) overlay.style.display = "none";
  if (tableContainer) tableContainer.style.display = "block";

  currentOsmData = data;

  applySort();
  updateNotificationBadges();

  window.scrollTo({ top: 0, behavior: "smooth" });
});

function buildSkillHtml(skillObj, memberId) {
  let html = skillObj.skill;
  if (skillObj.isCritical) html = `<b>${html}</b>`;

  if (skillObj.hasUrl) {
    html += ` <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="icon-form-link" title="Direct Form Link Available"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
  }

  const canLink = memberId && skillObj.skillId;

  if (skillObj.liveFormStatus === "accepted") {
    const icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const wrapper = `<span class="status-circle accepted" title="Verification Accepted">${icon}</span>`;

    if (canLink) {
      html += ` <a href="live-forms.html?memberId=${memberId}&skillId=${skillObj.skillId}&status=accepted">${wrapper}</a>`;
    } else {
      html += ` ${wrapper}`;
    }
  } else if (skillObj.liveFormStatus === "submitted") {
    const icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const wrapper = `<span class="status-circle submitted" title="Form Submitted - Awaiting Review">${icon}</span>`;
    html += canLink
      ? ` <a href="live-forms.html?memberId=${memberId}&skillId=${skillObj.skillId}&status=submitted">${wrapper}</a>`
      : ` ${wrapper}`;
  } else if (skillObj.liveFormStatus === "sent") {
    const icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>`;
    const wrapper = `<span class="status-circle sent" title="Form Sent - Waiting for Member">${icon}</span>`;

    if (canLink) {
      html += ` <a href="live-forms.html?memberId=${memberId}&skillId=${skillObj.skillId}&status=sent" target="_self" style="text-decoration:none;">${wrapper}</a>`;
    } else {
      html += ` ${wrapper}`;
    }
  } else if (skillObj.liveFormStatus === "rejected") {
    const icon = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const wrapper = `<span class="status-circle rejected" title="Verification Rejected">${icon}</span>`;

    if (canLink) {
      html += ` <a href="live-forms.html?memberId=${memberId}&skillId=${skillObj.skillId}&status=rejected">${wrapper}</a>`;
    } else {
      html += ` ${wrapper}`;
    }
  }

  return html;
}

function isDateInPast(dateStr) {
  if (!dateStr) return false;
  if (dateStr.toLowerCase().includes("expired")) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const d = new Date(
      parseInt(dmy[3]) < 100 ? parseInt(dmy[3]) + 2000 : parseInt(dmy[3]),
      parseInt(dmy[2]) - 1,
      parseInt(dmy[1]),
    );
    return !isNaN(d.getTime()) && d < today;
  }
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d < today;
}

window.resetCheckboxesToDefaults = function () {
  if (!currentOsmData || currentOsmData.length === 0) return;
  const memberMap = new Map(currentOsmData.map((m) => [m.name, m]));
  document.querySelectorAll(".send-email-cb").forEach((cb) => {
    const name = cb.getAttribute("data-name");
    const member = memberMap.get(name);
    if (member && !cb.disabled) {
      const prefs = (member.notificationPreference || "email").split(",");
      cb.checked = prefs.includes("email");
    }
  });
  document.querySelectorAll(".send-wa-cb").forEach((cb) => {
    const name = cb.getAttribute("data-name");
    const member = memberMap.get(name);
    if (member && !cb.disabled) {
      const prefs = (member.notificationPreference || "email").split(",");
      cb.checked = prefs.includes("whatsapp");
    }
  });
  const masterEmail = document.getElementById("selectAllEmail");
  if (masterEmail) masterEmail.checked = false;
  const masterWa = document.getElementById("selectAllWhatsapp");
  if (masterWa) masterWa.checked = false;
  const mobEmail = document.getElementById("mobileSelectAllEmail");
  if (mobEmail) mobEmail.checked = false;
  const mobWa = document.getElementById("mobileSelectAllWhatsapp");
  if (mobWa) mobWa.checked = false;
  updateSendButtonState();
  if (window.showToast)
    window.showToast("Reset to default preferences", "success");
};

async function updateNotificationBadges() {
  try {
    const resSent = await fetch("/api/live-forms?status=sent&limit=1");
    const dataSent = await resSent.json();
    const countSent = dataSent.total || 0;

    const resAcc = await fetch("/api/live-forms?status=accepted&limit=1");
    const resRej = await fetch("/api/live-forms?status=rejected&limit=1");
    const dataAcc = await resAcc.json();
    const dataRej = await resRej.json();
    const countPending = (dataAcc.total || 0) + (dataRej.total || 0);

    const badgeSent = document.getElementById("badgeSent");
    const badgeSub = document.getElementById("badgeSubmitted");
    const btn = document.getElementById("liveFormsNotifBtn");

    if (countSent > 0) {
      badgeSent.textContent = countSent > 99 ? "99+" : countSent;
      badgeSent.style.display = "flex";
    } else {
      badgeSent.style.display = "none";
    }

    if (countPending > 0) {
      badgeSub.textContent = countPending > 99 ? "99+" : countPending;
      badgeSub.style.display = "flex";
      badgeSub.title = "Forms waiting for Archive/Resend action";
    } else {
      badgeSub.style.display = "none";
    }

    const sentText = `${countSent} form${countSent !== 1 ? "s" : ""} sent`;
    const pendingText = `${countPending} automated result${countPending !== 1 ? "s" : ""} waiting review`;
    btn.title = `${sentText}\n${pendingText}`;
  } catch (e) {
    console.error("Badge update failed", e);
  }
}

async function checkPendingReviews() {
  if (sessionStorage.getItem("hasShownReviewModal")) return;

  try {
    const prefRes = await fetch(
      "/api/user-preferences/show_pending_reviews_alert",
    );
    if (prefRes.ok) {
      const prefData = await prefRes.json();
      if (prefData.value === false) return;
    }
  } catch (e) {
    console.warn("Could not fetch user preferences, proceeding with default.");
  }

  try {
    const resAcc = await fetch("/api/live-forms?status=accepted&limit=1");
    const resRej = await fetch("/api/live-forms?status=rejected&limit=1");
    const count = (await resAcc.json()).total + (await resRej.json()).total;

    if (count > 0) {
      document.getElementById("pendingCountDisplay").textContent = count;
      document.getElementById("pendingReviewsModal").style.display = "block";
      sessionStorage.setItem("hasShownReviewModal", "true");
    }
  } catch (e) {
    console.error("Error checking pending reviews:", e);
  }
}

init();
