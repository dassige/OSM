// public/app.js
const socket = io();

// ... (Keep existing GLOBAL STATE & CONFIG) ...
let currentOsmData = [];
let currentSort = { column: 'name', order: 'asc' };
let isWaReady = false;
let showCompletionToast = false;

const ICON_ASC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const ICON_DESC = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const sendEmailsBtn = document.getElementById('sendEmailsBtn');
const viewBtn = document.getElementById('viewBtn');
const terminal = document.getElementById('terminal');
const tableContainer = document.getElementById('tableContainer');
const skillsTableBody = document.querySelector('#skillsTable tbody');
const daysInput = document.getElementById('daysInput');
const btnHideNoSkills = document.getElementById('btnHideNoSkills');
const btnHideNoUrl = document.getElementById('btnHideNoUrl');
const btnExpiredOnly = document.getElementById('btnExpiredOnly');
const btnHideWithUrl = document.getElementById('btnHideWithUrl');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const showConsoleCheckbox = document.getElementById('showConsoleCheckbox');
const consoleHeader = document.getElementById('consoleHeader');

// ... (Keep existing INITIALIZATION) ...
function init() {
    socket.on("connect_error", (err) => {
        if (err.message === "unauthorized") window.location.href = "/login.html";
    });

    socket.on('connect', () => {
        socket.emit('get-preferences');
        socket.emit('wa-get-status');
    });

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
            if (config.appMode === 'demo') {
                document.getElementById('demoBanner').style.display = 'block';
            }
        })
        .catch(err => console.error("Failed to load UI config:", err));

    fetch('/api/user-session').then(r => r.json()).then(user => {
        document.body.setAttribute('data-user-role', user.role || 'guest');
        updateRoleUI(user.role || 'guest');
    });
}

// ... (Keep existing UI HELPERS) ...
function setRunningState() {
    sendEmailsBtn.disabled = true;
    viewBtn.disabled = true;
    document.querySelectorAll('.header-checkbox-label input').forEach(cb => cb.disabled = true);
    document.querySelectorAll('.btn-round').forEach(btn => btn.disabled = true);
    terminal.textContent = '> Starting Notification Process...\n';
    if (window.showToast) window.showToast('Starting process...', 'info');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = 'Starting...';
}

function setIdleState(code) {
    const isTableVisible = tableContainer.style.display !== 'none';
    document.querySelectorAll('.header-checkbox-label input').forEach(cb => cb.disabled = !isTableVisible);
    document.querySelectorAll('.btn-round').forEach(btn => btn.disabled = false);
    viewBtn.disabled = false;
    updateSendButtonState();

    if (code === 0) {
        if (showCompletionToast && window.showToast) {
            window.showToast('Completed Successfully', 'success');
        }
        terminal.textContent += `\n> Process exited with code ${code}`;
        progressBar.style.width = '100%';
        progressBar.textContent = 'Completed';
    } else {
        if (window.showToast) window.showToast('Process Failed', 'error');
        terminal.textContent += `\n> Process exited with error code ${code}`;
    }
    showCompletionToast = false;
    setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
}

function updateSendButtonState() {
    const role = document.body.getAttribute('data-user-role');
    if (role === 'guest') {
        if (sendEmailsBtn) sendEmailsBtn.style.display = 'none';
        return;
    }
    const anyChecked = document.querySelectorAll('.send-email-cb:checked, .send-wa-cb:checked').length > 0;
    sendEmailsBtn.disabled = !anyChecked;
}

function updateRoleUI(role) {
    if (role === 'guest' || role === 'simple') {
        if (showConsoleCheckbox) {
            const container = showConsoleCheckbox.closest('div');
            if (container) container.style.display = 'none';
        }
        if (terminal) terminal.style.display = 'none';
        if (consoleHeader) consoleHeader.style.display = 'none';
    }
    if (role === 'guest') {
        if (sendEmailsBtn) sendEmailsBtn.style.display = 'none';
        if (viewBtn) {
            viewBtn.disabled = false;
            viewBtn.style.display = 'inline-block';
        }
    }
}

function toggleConsole(isVisible) {
    const role = document.body.getAttribute('data-user-role');
    if (role === 'guest' || role === 'simple') return;
    const style = isVisible ? 'block' : 'none';
    if (terminal) terminal.style.display = style;
    if (consoleHeader) consoleHeader.style.display = style;
}

// ... (Keep existing DATA & SORTING & RENDER) ...
function fetchData(forceRefresh = false) {
    const days = parseInt(daysInput.value) || 30;
    viewBtn.disabled = true;
    viewBtn.textContent = "Loading Data...";
    const modeText = forceRefresh ? " (Force Refresh)" : "";
    terminal.textContent += `> Fetching View Data (Threshold: ${days} days)${modeText}... please wait.\n`;
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
    const hideWithUrl = btnHideWithUrl.classList.contains('active');

    currentOsmData.forEach((member, index) => {
        let visibleSkills = member.skills;
        if (hideNoUrl) visibleSkills = visibleSkills.filter(s => s.hasUrl);
        if (expiredOnly) visibleSkills = visibleSkills.filter(s => isDateInPast(s.dueDate));
        if (hideWithUrl) visibleSkills = visibleSkills.filter(s => !s.hasUrl);
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
            else if (hideWithUrl && member.skills.length > 0) msg = " (Hidden by 'No Form' filter)";
            else if (expiredOnly && member.skills.length > 0) msg = " (Hidden by 'Expired Only' filter)";
            skillTd.textContent = msg; skillTd.className = 'no-skill'; dateTd.textContent = "";
        }
        tr.appendChild(skillTd); tr.appendChild(dateTd);

        const prefs = (member.notificationPreference || 'email').split(',');
        const defaultEmail = prefs.includes('email');
        const defaultWa = prefs.includes('whatsapp');

        const actionTd = document.createElement('td');
        actionTd.className = 'member-cell';

        if (member.emailEligible && hasVisibleSkills) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.gap = '8px';

            const emailRow = document.createElement('div');
            emailRow.style.display = 'flex';
            emailRow.style.alignItems = 'center';
            emailRow.style.justifyContent = 'space-between';
            emailRow.style.gap = '10px';

            const hasEmail = member.email && member.email.includes('@');
            const emailLabel = document.createElement('label');
            emailLabel.className = 'email-label';
            emailLabel.style.marginBottom = '0';
            emailLabel.innerHTML = `<input type="checkbox" class="send-email-cb" data-name="${member.name}" ${hasEmail ? (defaultEmail ? 'checked' : '') : 'disabled'}> Email`;
            if (!hasEmail) emailLabel.style.opacity = "0.5";

            const btnEmail = document.createElement('button');
            btnEmail.className = 'btn-round';
            btnEmail.style.backgroundColor = '#6f42c1'; 
            btnEmail.style.flexShrink = '0';
            btnEmail.title = hasEmail ? "Send Email Immediately" : "No Email Address";
            btnEmail.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
            btnEmail.onclick = () => sendSingleAction(member.name, 'email');

            if (!hasEmail) {
                btnEmail.disabled = true;
                btnEmail.style.backgroundColor = '#ccc';
                btnEmail.style.opacity = '0.5';
                btnEmail.style.cursor = 'not-allowed';
            }
            emailRow.appendChild(emailLabel);
            emailRow.appendChild(btnEmail);

            const waRow = document.createElement('div');
            waRow.style.display = 'flex';
            waRow.style.alignItems = 'center';
            waRow.style.justifyContent = 'space-between';
            waRow.style.gap = '10px';

            const hasMobile = member.mobile && member.mobile.length > 5;
            const isWaDisabled = !hasMobile || !isWaReady;
            const waLabel = document.createElement('label');
            waLabel.className = 'email-label';
            waLabel.style.marginBottom = '0';
            const shouldCheckWa = defaultWa && !isWaDisabled;
            waLabel.innerHTML = `<input type="checkbox" class="send-wa-cb" data-name="${member.name}" ${isWaDisabled ? 'disabled' : (shouldCheckWa ? 'checked' : '')}> WhatsApp`;
            if (isWaDisabled) waLabel.style.opacity = "0.5";

            const btnWa = document.createElement('button');
            btnWa.className = 'btn-round';
            btnWa.style.flexShrink = '0';
            btnWa.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
            btnWa.onclick = () => sendSingleAction(member.name, 'whatsapp');

            if (!hasMobile) {
                btnWa.disabled = true;
                btnWa.style.backgroundColor = '#ccc';
                btnWa.style.opacity = '0.5';
                btnWa.style.cursor = 'not-allowed';
                btnWa.title = "No Mobile Number";
            } else if (!isWaReady) {
                btnWa.disabled = true;
                btnWa.style.backgroundColor = '#fd7e14';
                btnWa.style.opacity = '0.8';
                btnWa.style.cursor = 'not-allowed';
                btnWa.title = "Whatsapp service not started";
            } else {
                btnWa.style.backgroundColor = '#25D366';
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

        // Sub-rows
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

    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', updateSendButtonState));
    setupMasterCheckbox('selectAllEmail', '.send-email-cb');
    setupMasterCheckbox('selectAllWhatsapp', '.send-wa-cb');
    updateSendButtonState();
}


function setupMasterCheckbox(masterId, targetClass) {
    const master = document.getElementById(masterId);
    if (!master) return;
    const newMaster = master.cloneNode(true);
    master.parentNode.replaceChild(newMaster, master);
    newMaster.addEventListener('change', (e) => {
        document.querySelectorAll(targetClass).forEach(cb => {
            if (!cb.disabled) cb.checked = e.target.checked;
        });
        updateSendButtonState();
    });
}

// [UPDATED] Single Action Logic using confirmAction
async function sendSingleAction(name, type) {
    const days = parseInt(daysInput.value) || 30;
    const label = type === 'email' ? 'Email' : 'WhatsApp';

    // ASYNC CONFIRMATION
    if (await confirmAction('Send Immediate Reminder', `Send immediate ${label} reminder to ${name}?`)) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setRunningState();

        const target = {
            name: name,
            sendEmail: type === 'email',
            sendWa: type === 'whatsapp'
        };

        socket.emit('run-process-queue', [target], days);
    }
}

// =============================================================================
// 5. EVENT LISTENERS & ACTIONS
// =============================================================================

viewBtn.addEventListener('click', () => {
    showCompletionToast = true;
    fetchData(true);
});

// [UPDATED] Send Emails Handler
sendEmailsBtn.addEventListener('click', async () => {
    const targets = [];
    document.querySelectorAll('#skillsTable tbody tr').forEach(row => {
        const emailCb = row.querySelector('.send-email-cb');
        if (!emailCb) return;

        const name = emailCb.getAttribute('data-name');
        const sendEmail = emailCb.checked;
        const waCb = row.querySelector('.send-wa-cb');
        const sendWa = waCb ? waCb.checked : false;

        if (sendEmail || sendWa) {
            targets.push({ name, sendEmail, sendWa });
        }
    });

    if (targets.length === 0) return showToast('No actions selected', 'error');

    // ASYNC CONFIRMATION
    if (await confirmAction('Bulk Notification', `Process ${targets.length} members?`)) {
        showCompletionToast = true;
        setRunningState();
        const days = parseInt(daysInput.value) || 30;
        socket.emit('run-process-queue', targets, days);
    }
});

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
setupChipToggle('btnHideWithUrl', 'hideWithUrl');

socket.on('preferences-data', (prefs) => {
    if (prefs.daysToExpiry !== undefined) daysInput.value = prefs.daysToExpiry;
    if (prefs.hideNoSkills) btnHideNoSkills.classList.add('active');
    if (prefs.hideNoUrl) btnHideNoUrl.classList.add('active');
    if (prefs.hideWithUrl) btnHideWithUrl.classList.add('active');
    if (prefs.expiredOnly) btnExpiredOnly.classList.add('active');

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

socket.on('wa-status-data', (data) => {
    isWaReady = (data.status === 'READY');
    if (currentOsmData.length > 0) renderTable();
});

socket.on('wa-status', (status) => {
    isWaReady = (status === 'READY');
    if (currentOsmData.length > 0) renderTable();
});

socket.on('terminal-output', (data) => { terminal.textContent += data; terminal.scrollTop = terminal.scrollHeight; });
socket.on('script-complete', (code) => setIdleState(code));
socket.on('progress-update', (data) => {
    if (data.type === 'progress-start') { progressBar.style.width = '0%'; progressBar.textContent = '0%'; }
    else if (data.type === 'progress-tick') {
        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        progressBar.style.width = pct + '%'; progressBar.textContent = `${pct}% - Processed ${data.member}`;
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

window.resetCheckboxesToDefaults = function () {
    if (!currentOsmData || currentOsmData.length === 0) return;
    const memberMap = new Map(currentOsmData.map(m => [m.name, m]));
    document.querySelectorAll('.send-email-cb').forEach(cb => {
        const name = cb.getAttribute('data-name');
        const member = memberMap.get(name);
        if (member && !cb.disabled) {
            const prefs = (member.notificationPreference || 'email').split(',');
            cb.checked = prefs.includes('email');
        }
    });
    document.querySelectorAll('.send-wa-cb').forEach(cb => {
        const name = cb.getAttribute('data-name');
        const member = memberMap.get(name);
        if (member && !cb.disabled) {
            const prefs = (member.notificationPreference || 'email').split(',');
            cb.checked = prefs.includes('whatsapp');
        }
    });
    const masterEmail = document.getElementById('selectAllEmail');
    if (masterEmail) masterEmail.checked = false;
    const masterWa = document.getElementById('selectAllWhatsapp');
    if (masterWa) masterWa.checked = false;
    updateSendButtonState();
    if (window.showToast) window.showToast("Reset to default preferences", "success");
};

init();