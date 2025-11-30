const socket = io();
const sendEmailsBtn = document.getElementById('sendEmailsBtn');
const viewBtn = document.getElementById('viewBtn');
const terminal = document.getElementById('terminal');
const statusSpan = document.getElementById('status');
const tableContainer = document.getElementById('tableContainer');
const skillsTableBody = document.querySelector('#skillsTable tbody');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const daysInput = document.getElementById('daysInput');
const hideNoSkillsCheckbox = document.getElementById('hideNoSkillsCheckbox');
const hideNoUrlSkillsCheckbox = document.getElementById('hideNoUrlSkillsCheckbox');

const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const showConsoleCheckbox = document.getElementById('showConsoleCheckbox');
const consoleHeader = document.getElementById('consoleHeader');


let currentOsmData = [];

// --- Sorting State ---
let currentSort = {
    column: 'name',
    order: 'asc'
};

const ICON_ASC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const ICON_DESC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_NONE = '';

//  Logout Logic
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        window.location.href = '/logout';
    });
}
// Handle Authentication Errors
socket.on("connect_error", (err) => {
    if (err.message === "unauthorized") {
        window.location.href = "/login.html";
    }
});

// --- Helper Functions ---

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
    } else if (code === null) {
        statusSpan.innerText = 'Stopped by User';
        statusSpan.style.color = 'red';
        terminal.textContent += `\n> Process terminated by user`;
    } else {
        statusSpan.innerText = 'Failed';
        statusSpan.style.color = 'red';
        terminal.textContent += `\n> Process exited with error code ${code}`;
    }
    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 3000);
}

function updateUIState() {
    const allCheckboxes = document.querySelectorAll('.email-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.email-checkbox:checked');

    if (checkedCheckboxes.length > 0) {
        sendEmailsBtn.disabled = false;
    } else {
        sendEmailsBtn.disabled = true;
    }

    if (allCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = true;
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = false;
    } else if (checkedCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.disabled = false;
    }
}

function buildSkillHtml(skillObj) {
    let html = skillObj.skill;
    if (skillObj.isCritical) html = `<b>${html}</b>`;
    if (skillObj.hasUrl) html += ` <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; color: #007bff; margin-left: 4px;" title="Direct Form Link Available"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    return html;
}

// --- Sorting Logic ---

function handleSort(column) {
    // Only support 'name' sorting
    if (column !== 'name') return;

    if (currentSort.column === column) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.order = 'asc';
    }

    // [NEW] Persist the preference
    socket.emit('update-preference', { key: 'sortSkills', value: currentSort });

    applySort();
}

function applySort() {
    // Sort only by Name
    currentOsmData.sort((a, b) => {
        const valA = (a.name || '').toLowerCase();
        const valB = (b.name || '').toLowerCase();

        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    updateHeaderIcons();
    renderTable();
}

function updateHeaderIcons() {
    const iconSpan = document.getElementById('icon-name');
    if (iconSpan) {
        iconSpan.innerHTML = currentSort.order === 'asc' ? ICON_ASC : ICON_DESC;
        iconSpan.classList.add('active');
    }
}
function toggleConsole(isVisible) {
    const style = isVisible ? 'block' : 'none';
    if (terminal) terminal.style.display = style;
    if (consoleHeader) consoleHeader.style.display = style;
}
// --- Data Fetching Logic ---
function fetchData() {
    const days = parseInt(daysInput.value) || 30;
    viewBtn.disabled = true;
    viewBtn.textContent = "Loading Data...";
    terminal.textContent += `> Fetching View Data (Threshold: ${days} days)... please wait.\n`;
    socket.emit('view-expiring-skills', days);
}

// --- Render Table Logic ---
function renderTable() {
    skillsTableBody.innerHTML = '';
    const hideNoSkills = hideNoSkillsCheckbox.checked;
    const hideNoUrl = hideNoUrlSkillsCheckbox.checked;

    currentOsmData.forEach((member, index) => {
        let visibleSkills = member.skills;
        if (hideNoUrl) visibleSkills = visibleSkills.filter(s => s.hasUrl);
        const hasVisibleSkills = visibleSkills.length > 0;

        if (hideNoSkills && !hasVisibleSkills) return;

        const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
        const tr = document.createElement('tr');
        tr.className = rowClass;
        if (!hasVisibleSkills) tr.classList.add('no-skills-row');

        const nameTd = document.createElement('td');
        nameTd.textContent = member.name;
        nameTd.className = 'member-cell';
        tr.appendChild(nameTd);

        const skillTd = document.createElement('td');
        const dateTd = document.createElement('td');

        if (hasVisibleSkills) {
            skillTd.innerHTML = buildSkillHtml(visibleSkills[0]);
            skillTd.className = 'skill-cell';
            dateTd.textContent = visibleSkills[0].dueDate;
            dateTd.className = 'date-cell';
        } else {
            skillTd.textContent = "NO expiring skills" + (hideNoUrl && member.skills.length > 0 ? " (Hidden by filter)" : "");
            skillTd.className = 'no-skill';
            dateTd.textContent = "";
        }
        tr.appendChild(skillTd);
        tr.appendChild(dateTd);

        const emailTd = document.createElement('td');
        emailTd.className = 'member-cell';
        if (member.emailEligible && hasVisibleSkills) {
            const label = document.createElement('label');
            label.className = 'email-label';
            label.innerHTML = `<input type="checkbox" class="email-checkbox" data-name="${member.name}" checked> Send email`;
            emailTd.appendChild(label);
        }
        tr.appendChild(emailTd);

        skillsTableBody.appendChild(tr);

        for (let i = 1; i < visibleSkills.length; i++) {
            const subTr = document.createElement('tr');
            subTr.className = rowClass;
            const emptyNameTd = document.createElement('td');
            emptyNameTd.className = 'merged-cell';
            subTr.appendChild(emptyNameTd);
            const subSkillTd = document.createElement('td');
            subSkillTd.innerHTML = buildSkillHtml(visibleSkills[i]);
            subSkillTd.className = 'skill-cell';
            const subDateTd = document.createElement('td');
            subDateTd.textContent = visibleSkills[i].dueDate;
            subDateTd.className = 'date-cell';
            subTr.appendChild(subSkillTd);
            subTr.appendChild(subDateTd);
            const emptyEmailTd = document.createElement('td');
            emptyEmailTd.className = 'merged-cell';
            subTr.appendChild(emptyEmailTd);
            skillsTableBody.appendChild(subTr);
        }
    });

    const newCheckboxes = document.querySelectorAll('.email-checkbox');
    newCheckboxes.forEach(cb => cb.addEventListener('change', updateUIState));
    updateUIState();
}

// --- DB Persistence Listeners ---

daysInput.addEventListener('change', (e) => {
    socket.emit('update-preference', { key: 'daysToExpiry', value: parseInt(e.target.value) });
});

hideNoSkillsCheckbox.addEventListener('change', (e) => {
    socket.emit('update-preference', { key: 'hideNoSkills', value: e.target.checked });
    renderTable();
});

hideNoUrlSkillsCheckbox.addEventListener('change', (e) => {
    socket.emit('update-preference', { key: 'hideNoUrl', value: e.target.checked });
    renderTable();
});

// Load Preferences on Connect
socket.on('connect', () => {
    socket.emit('get-preferences');
});

socket.on('preferences-data', (prefs) => {
    // ... existing preferences ...
    if (prefs.daysToExpiry !== undefined) daysInput.value = prefs.daysToExpiry;
    if (prefs.hideNoSkills !== undefined) hideNoSkillsCheckbox.checked = prefs.hideNoSkills;
    if (prefs.hideNoUrl !== undefined) hideNoUrlSkillsCheckbox.checked = prefs.hideNoUrl;

    // --- NEW: Restore Console Visibility ---
    if (prefs.showConsole !== undefined) {
        showConsoleCheckbox.checked = prefs.showConsole;
        toggleConsole(prefs.showConsole);
    } else {
        // Default is hidden (false)
        showConsoleCheckbox.checked = false;
        toggleConsole(false);
    }

    if (prefs.sortSkills) {
        currentSort = prefs.sortSkills;
    }

    fetchData();
});

// --- Standard Event Listeners ---

selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll('.email-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    updateUIState();
});

sendEmailsBtn.addEventListener('click', () => {
    const checkedBoxes = document.querySelectorAll('.email-checkbox:checked');
    const selectedNames = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-name'));
    const days = parseInt(daysInput.value) || 30;

    if (selectedNames.length === 0) {
        alert("No members selected for email.");
        return;
    }

    if (confirm(`Are you sure you want to send emails to ${selectedNames.length} member(s)?\n(Expiry threshold: ${days} days)`)) {
        setRunningState();
        socket.emit('run-send-selected', selectedNames, days);
    }
});
showConsoleCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    toggleConsole(isChecked);
    socket.emit('update-preference', { key: 'showConsole', value: isChecked });
});
viewBtn.addEventListener('click', () => {
    fetchData();
});

socket.on('terminal-output', (data) => {
    terminal.textContent += data;
    terminal.scrollTop = terminal.scrollHeight;
});

socket.on('script-complete', (code) => {
    setIdleState(code);
});

socket.on('progress-update', (data) => {
    if (data.type === 'progress-start') {
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
    } else if (data.type === 'progress-tick') {
        const percentage = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        progressBar.style.width = percentage + '%';
        progressBar.textContent = `${percentage}% - Sent to ${data.member}`;
    }
});

socket.on('expiring-skills-data', (data) => {
    viewBtn.disabled = false;
    viewBtn.textContent = "Reload Expiring Skills";
    terminal.textContent += '> Data fetched successfully.\n';

    currentOsmData = data;

    tableContainer.style.display = 'block';

    // Apply sort immediately (which calls renderTable)
    applySort();

    // alternative behavior
    //tableContainer.scrollIntoView({ behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- UI Configuration ---
fetch('/ui-config')
    .then(response => response.json())
    .then(config => {
        if (config.appBackground) {
            document.body.style.backgroundImage = `url('${config.appBackground}')`;
        }
        // Add these lines:
        if (config.version) {
            const el = document.getElementById('disp-version');
            if (el) el.textContent = config.version;
        }
        if (config.deployDate) {
            const el = document.getElementById('disp-date');
            if (el) el.textContent = config.deployDate;
        }
    })
    .catch(err => console.error("Failed to load UI config:", err));