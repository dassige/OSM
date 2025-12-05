const socket = io();

// =============================================================================
// 1. GLOBAL STATE & CONFIG
// =============================================================================
let currentOsmData = [];
let currentSort = { column: 'name', order: 'asc' };

// Icons
const ICON_ASC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const ICON_DESC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

// Elements
const sendEmailsBtn = document.getElementById('sendEmailsBtn');
const viewBtn = document.getElementById('viewBtn');
const terminal = document.getElementById('terminal');
const statusSpan = document.getElementById('status');
const tableContainer = document.getElementById('tableContainer');
const skillsTableBody = document.querySelector('#skillsTable tbody');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const daysInput = document.getElementById('daysInput');
const btnHideNoSkills = document.getElementById('btnHideNoSkills');
const btnHideNoUrl = document.getElementById('btnHideNoUrl');
const btnExpiredOnly = document.getElementById('btnExpiredOnly');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const showConsoleCheckbox = document.getElementById('showConsoleCheckbox');
const consoleHeader = document.getElementById('consoleHeader');

// =============================================================================
// 2. INITIALIZATION
// =============================================================================

function init() {
    // Auth Check
    socket.on("connect_error", (err) => {
        if (err.message === "unauthorized") window.location.href = "/login.html";
    });

    // Load Prefs
    socket.on('connect', () => {
        socket.emit('get-preferences');
    });

    // Load UI Config
    fetch('/ui-config')
        .then(response => response.json())
        .then(config => {
            if (config.loginTitle) {
                document.getElementById('pageTitle').innerText = config.loginTitle;
                document.getElementById('mainHeader').innerText = config.loginTitle;
            }
            if (config.appBackground) document.body.style.backgroundImage = `url('${config.appBackground}')`;
            if (config.version) document.getElementById('disp-version').textContent = config.version;
            if (config.deployDate) document.getElementById('disp-date').textContent = config.deployDate;

            // [NEW] Show Demo Banner
            if (config.appMode === 'demo') {
                document.getElementById('demoBanner').style.display = 'block';
                // Adjust top buttons to not overlap content if needed, 
                // though z-index in CSS handles the layering.
            }
        })
        .catch(err => console.error("Failed to load UI config:", err));

    // Handle Role UI
    fetch('/api/user-session').then(r => r.json()).then(user => {
        document.body.setAttribute('data-user-role', user.role || 'guest');
        updateRoleUI(user.role || 'guest');
    });
}

// =============================================================================
// 3. UI HELPERS
// =============================================================================

function setRunningState() {
    sendEmailsBtn.disabled = true;
    viewBtn.disabled = true;
    selectAllCheckbox.disabled = true;
    terminal.textContent = '> Starting Email Process...\n';
    statusSpan.innerText = 'Sending Emails...';
    statusSpan.style.color = '#e67e22';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = 'Starting...';
}

function setIdleState(code) {
    const isTableVisible = tableContainer.style.display !== 'none';
    sendEmailsBtn.disabled = !isTableVisible || document.querySelectorAll('.email-checkbox:checked').length === 0;
    selectAllCheckbox.disabled = !isTableVisible;
    viewBtn.disabled = false;

    if (code === 0) {
        statusSpan.innerText = 'Completed Successfully';
        statusSpan.style.color = 'green';
        terminal.textContent += `\n> Process exited with code ${code}`;
        progressBar.style.width = '100%';
        progressBar.textContent = 'Completed';
    } else {
        statusSpan.innerText = 'Failed';
        statusSpan.style.color = 'red';
        terminal.textContent += `\n> Process exited with error code ${code}`;
    }
    setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
}

function updateUIState() {
    const role = document.body.getAttribute('data-user-role');
    if (role === 'guest') {
        // Ensure logic doesn't re-enable things for guests
        if (sendEmailsBtn) sendEmailsBtn.style.display = 'none';
        return;
    }

    const allCheckboxes = document.querySelectorAll('.email-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.email-checkbox:checked');

    sendEmailsBtn.disabled = checkedCheckboxes.length === 0;

    if (allCheckboxes.length === 0) {
        selectAllCheckbox.checked = false; selectAllCheckbox.disabled = true;
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
        selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; selectAllCheckbox.disabled = false;
    } else if (checkedCheckboxes.length === 0) {
        selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; selectAllCheckbox.disabled = false;
    } else {
        selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; selectAllCheckbox.disabled = false;
    }
}
function updateRoleUI(role) {
    // 1. Console Log Restrictions (Guest OR Simple)
    if (role === 'guest' || role === 'simple') {
        if (showConsoleCheckbox) {
            // Hide the container div surrounding the checkbox label
            const container = showConsoleCheckbox.closest('div');
            if (container) container.style.display = 'none';
        }
        // Force hide the terminal area regardless of preference
        if (terminal) terminal.style.display = 'none';
        if (consoleHeader) consoleHeader.style.display = 'none';
    }

    // 2. Guest-Specific Restrictions
    if (role === 'guest') {
        // Hide Send Email Button
        if (sendEmailsBtn) {
            sendEmailsBtn.style.display = 'none';
        }

        // Hide Select All Checkbox in Header
        if (selectAllCheckbox) {
            const label = selectAllCheckbox.closest('label');
            if (label) label.style.display = 'none';
        }

        // Hide row actions via CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .send-single, 
            .email-checkbox { display: none !important; }
        `;
        document.head.appendChild(style);

        // Ensure Reload button is enabled
        if (viewBtn) {
            viewBtn.disabled = false;
            viewBtn.style.display = 'inline-block';
        }
    }
}

function toggleConsole(isVisible) {
    const role = document.body.getAttribute('data-user-role');
    if (role === 'guest' || role === 'simple') return; // Guests and Simple users never see console

    const style = isVisible ? 'block' : 'none';
    if (terminal) terminal.style.display = style;
    if (consoleHeader) consoleHeader.style.display = style;
}
// =============================================================================
// 4. DATA & SORTING
// =============================================================================

function fetchData(forceRefresh = false) {
    const days = parseInt(daysInput.value) || 30;
    viewBtn.disabled = true;
    viewBtn.textContent = "Loading Data...";

    const modeText = forceRefresh ? " (Force Refresh)" : "";
    terminal.textContent += `> Fetching View Data (Threshold: ${days} days)${modeText}... please wait.\n`;

    // Emit with flag
    socket.emit('view-expiring-skills', days, forceRefresh);
}

function handleSort(column) {
    if (column !== 'name') return;
    currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    socket.emit('update-preference', { key: 'sortSkills', value: currentSort });
    applySort();
}

function applySort() {
    currentOsmData.sort((a, b) => {
        const valA = (a.name || '').toLowerCase();
        const valB = (b.name || '').toLowerCase();
        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });
    const iconSpan = document.getElementById('icon-name');
    if (iconSpan) {
        iconSpan.innerHTML = currentSort.order === 'asc' ? ICON_ASC : ICON_DESC;
        iconSpan.classList.add('active');
    }
    renderTable();
}

function renderTable() {
    skillsTableBody.innerHTML = '';
    const hideNoSkills = btnHideNoSkills.classList.contains('active');
    const hideNoUrl = btnHideNoUrl.classList.contains('active');
    const expiredOnly = btnExpiredOnly.classList.contains('active');

    currentOsmData.forEach((member, index) => {
        let visibleSkills = member.skills;
        if (hideNoUrl) visibleSkills = visibleSkills.filter(s => s.hasUrl);
        if (expiredOnly) visibleSkills = visibleSkills.filter(s => isDateInPast(s.dueDate));

        const hasVisibleSkills = visibleSkills.length > 0;
        if (hideNoSkills && !hasVisibleSkills) return;

        const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
        const tr = document.createElement('tr');
        tr.className = rowClass;
        if (!hasVisibleSkills) tr.classList.add('no-skills-row');

        const nameTd = document.createElement('td');
        nameTd.textContent = member.name; nameTd.className = 'member-cell';
        tr.appendChild(nameTd);

        const skillTd = document.createElement('td');
        const dateTd = document.createElement('td');

        if (hasVisibleSkills) {
            skillTd.innerHTML = buildSkillHtml(visibleSkills[0]);
            skillTd.className = 'skill-cell';
            dateTd.textContent = visibleSkills[0].dueDate;
            dateTd.className = 'date-cell';
            if (isDateInPast(visibleSkills[0].dueDate)) {
                dateTd.style.backgroundColor = '#dc3545'; dateTd.style.color = 'white'; dateTd.style.fontWeight = 'bold';
            }
        } else {
            let msg = "NO expiring skills";
            if (hideNoUrl && member.skills.length > 0) msg = " (Hidden by 'Has Form' filter)";
            else if (expiredOnly && member.skills.length > 0) msg = " (Hidden by 'Expired Only' filter)";
            skillTd.textContent = msg; skillTd.className = 'no-skill'; dateTd.textContent = "";
        }
        tr.appendChild(skillTd); tr.appendChild(dateTd);

        const emailTd = document.createElement('td');
        emailTd.className = 'member-cell';
        if (member.emailEligible && hasVisibleSkills) {
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex'; controlsDiv.style.alignItems = 'center'; controlsDiv.style.justifyContent = 'space-between';
            const label = document.createElement('label');
            label.className = 'email-label'; label.style.marginRight = '8px';
            label.innerHTML = `<input type="checkbox" class="email-checkbox" data-name="${member.name}" checked> Select`;
            const singleBtn = document.createElement('button');
            singleBtn.className = 'btn-round send-single';
            singleBtn.title = `Send email to ${member.name} only`;
            singleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
            controlsDiv.appendChild(label); controlsDiv.appendChild(singleBtn); emailTd.appendChild(controlsDiv);
        }
        tr.appendChild(emailTd);
        skillsTableBody.appendChild(tr);

        for (let i = 1; i < visibleSkills.length; i++) {
            const subTr = document.createElement('tr'); subTr.className = rowClass;
            const emptyNameTd = document.createElement('td'); emptyNameTd.className = 'merged-cell'; subTr.appendChild(emptyNameTd);
            const subSkillTd = document.createElement('td'); subSkillTd.innerHTML = buildSkillHtml(visibleSkills[i]); subSkillTd.className = 'skill-cell';
            const subDateTd = document.createElement('td'); subDateTd.textContent = visibleSkills[i].dueDate; subDateTd.className = 'date-cell';
            if (isDateInPast(visibleSkills[i].dueDate)) { subDateTd.style.backgroundColor = '#dc3545'; subDateTd.style.color = 'white'; subDateTd.style.fontWeight = 'bold'; }
            subTr.appendChild(subSkillTd); subTr.appendChild(subDateTd);
            const emptyEmailTd = document.createElement('td'); emptyEmailTd.className = 'merged-cell'; subTr.appendChild(emptyEmailTd);
            skillsTableBody.appendChild(subTr);
        }
    });

    document.querySelectorAll('.email-checkbox').forEach(cb => cb.addEventListener('change', updateUIState));
    updateUIState();
}

// =============================================================================
// 5. EVENT LISTENERS & ACTIONS
// =============================================================================

selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.email-checkbox').forEach(cb => cb.checked = e.target.checked);
    updateUIState();
});

viewBtn.addEventListener('click', () => fetchData(true));

sendEmailsBtn.addEventListener('click', () => {
    const checkedBoxes = document.querySelectorAll('.email-checkbox:checked');
    const selectedNames = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-name'));
    const days = parseInt(daysInput.value) || 30;
    if (selectedNames.length === 0) return alert("No members selected for email.");
    if (confirm(`Send emails to ${selectedNames.length} member(s)?`)) {
        setRunningState();
        socket.emit('run-send-selected', selectedNames, days);
    }
});

function sendSingleEmail(memberName) {
    const days = parseInt(daysInput.value) || 30;
    if (confirm(`Send immediate email reminder to ${memberName}?`)) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setRunningState();
        socket.emit('run-send-single', memberName, days);
    }
}

// Pref listeners
daysInput.addEventListener('change', (e) => socket.emit('update-preference', { key: 'daysToExpiry', value: parseInt(e.target.value) }));
showConsoleCheckbox.addEventListener('change', (e) => { toggleConsole(e.target.checked); socket.emit('update-preference', { key: 'showConsole', value: e.target.checked }); });

function setupChipToggle(btnId, prefKey) {
    document.getElementById(btnId).addEventListener('click', function () {
        this.classList.toggle('active');
        socket.emit('update-preference', { key: prefKey, value: this.classList.contains('active') });
        renderTable();
    });
}
setupChipToggle('btnHideNoSkills', 'hideNoSkills');
setupChipToggle('btnHideNoUrl', 'hideNoUrl');
setupChipToggle('btnExpiredOnly', 'expiredOnly');

// Socket Events
socket.on('preferences-data', (prefs) => {
    if (prefs.daysToExpiry !== undefined) daysInput.value = prefs.daysToExpiry;
    if (prefs.hideNoSkills) btnHideNoSkills.classList.add('active');
    if (prefs.hideNoUrl) btnHideNoUrl.classList.add('active');
    if (prefs.expiredOnly) btnExpiredOnly.classList.add('active');

    // Only show console if user is NOT a guest or simple
    const role = document.body.getAttribute('data-user-role');
    if (role !== 'guest' && role !== 'simple' && prefs.showConsole !== undefined) {
        showConsoleCheckbox.checked = prefs.showConsole;
        toggleConsole(prefs.showConsole);
    } else {
        showConsoleCheckbox.checked = false;
        toggleConsole(false);
    }

    if (prefs.sortSkills) currentSort = prefs.sortSkills;
    fetchData(false);
});

socket.on('terminal-output', (data) => { terminal.textContent += data; terminal.scrollTop = terminal.scrollHeight; });
socket.on('script-complete', (code) => setIdleState(code));
socket.on('progress-update', (data) => {
    if (data.type === 'progress-start') { progressBar.style.width = '0%'; progressBar.textContent = '0%'; }
    else if (data.type === 'progress-tick') {
        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        progressBar.style.width = pct + '%'; progressBar.textContent = `${pct}% - Sent to ${data.member}`;
    }
});
socket.on('expiring-skills-data', (data) => {
    viewBtn.disabled = false; viewBtn.textContent = "Reload Expiring Skills";
    terminal.textContent += '> Data fetched successfully.\n';
    currentOsmData = data;
    tableContainer.style.display = 'block';
    applySort();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Helper: Utils
function buildSkillHtml(skillObj) {
    let html = skillObj.skill;
    if (skillObj.isCritical) html = `<b>${html}</b>`;
    if (skillObj.hasUrl) html += ` <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; color: #007bff; margin-left: 4px;" title="Direct Form Link Available"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    return html;
}

function isDateInPast(dateStr) {
    if (!dateStr) return false;
    if (dateStr.toLowerCase().includes('expired')) return true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
        const d = new Date((parseInt(dmy[3]) < 100 ? parseInt(dmy[3]) + 2000 : parseInt(dmy[3])), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
        return !isNaN(d.getTime()) && d < today;
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < today;
}

// Start
init();