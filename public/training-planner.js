// public/training-planner.js

const socket = io();

// ── Global State ──────────────────────────────────────────────────────────────
let appTimezone      = 'Pacific/Auckland';
let isDemo           = false;
let currentStartDate = null;
let trainingDayIndex = null;
let skillMembersMap  = {};
let currentView      = 'calendar';
let listPage         = 1;
let listLimit        = 25;
let cachedFutureSessions = [];
let sessionsCache        = {};  // ISO date → array of session objects (for mobile)
let selectedMobileDay    = null; // ISO date string of the selected day on mobile

// ── VIEW SWITCHING ────────────────────────────────────────────────────────────

window.switchView = function (view) {
    currentView = view;

    const calendarContainer = document.getElementById('calendarViewContainer');
    const listContainer     = document.getElementById('listViewContainer');
    const btnCal  = document.getElementById('btnViewCalendar');
    const btnList = document.getElementById('btnViewList');

    btnCal.classList.toggle('view-tab-active',  view === 'calendar');
    btnList.classList.toggle('view-tab-active', view === 'list');

    if (view === 'calendar') {
        calendarContainer.style.display = 'flex';
        listContainer.style.display     = 'none';
        renderCalendar();
        loadSessions();
    } else {
        calendarContainer.style.display = 'none';
        listContainer.style.display     = 'block';
        loadFutureSessionsList();
    }
};

// ── LIST VIEW — DESKTOP ───────────────────────────────────────────────────────

async function loadFutureSessionsList() {
    const container = document.getElementById('listContent');
    container.innerHTML = '<div class="spinner"></div>';
    document.getElementById('listPagination').style.display       = 'none';
    document.getElementById('listPaginationMobile').style.display = 'none';

    try {
        const res      = await fetch('/api/training-sessions?view=future');
        const sessions = await res.json();
        cachedFutureSessions = sessions;
        listPage = 1;
        renderFutureList();
    } catch (e) {
        container.innerHTML = `<p style="color:red;">Error loading sessions: ${e.message}</p>`;
    }
}

function renderFutureList() {
    const container = document.getElementById('listContent');

    if (cachedFutureSessions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No future training sessions found.</p>';
        document.getElementById('listPagination').style.display       = 'none';
        document.getElementById('listPaginationMobile').style.display = 'none';
        document.getElementById('cardContainerList').innerHTML        = '';
        return;
    }

    // Group by date
    const grouped = {};
    cachedFutureSessions.forEach(s => {
        if (!grouped[s.date]) grouped[s.date] = [];
        grouped[s.date].push(s);
    });

    const uniqueDates = Object.keys(grouped).sort();
    const totalDays   = uniqueDates.length;
    const totalPages  = Math.ceil(totalDays / (listLimit === 99999 ? totalDays || 1 : listLimit));

    if (listPage > totalPages) listPage = totalPages;
    if (listPage < 1)          listPage = 1;

    const startIndex   = (listPage - 1) * (listLimit === 99999 ? totalDays : listLimit);
    const endIndex     = Math.min(startIndex + (listLimit === 99999 ? totalDays : listLimit), totalDays);
    const visibleDates = uniqueDates.slice(startIndex, endIndex);

    // Render desktop list
    let html = '';
    visibleDates.forEach(dateStr => {
        const dateObj    = new Date(dateStr);
        const prettyDate = dateObj.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

        const items = grouped[dateStr].map(s => {
            const safeName = s.skill_name.replace(/'/g, "\\'");
            const count    = (skillMembersMap[s.skill_name] || []).length;
            return `
                <div style="background:var(--bg-body); border:1px solid var(--border-color); padding:8px 12px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:500;">${s.skill_name}</span>
                    <button class="btn-sm btn-informative" onclick="showMemberPopup('${safeName}'); event.stopPropagation();"
                        title="View members whose skill expires in this period" style="font-size:12px; padding:2px 8px;">
                        View Members: ${count}
                    </button>
                </div>
            `;
        }).join('');

        html += `
            <div onclick="jumpToDate('${dateStr}')"
                 style="cursor:pointer; border:1px solid var(--primary); border-left-width:5px; background:var(--bg-card); margin-bottom:15px; border-radius:4px; overflow:hidden; transition:transform 0.2s;"
                 onmouseover="this.style.transform='translateX(5px)'"
                 onmouseout="this.style.transform='translateX(0)'"
                 title="Click to view this week in the Calendar">
                <div style="background:var(--bg-hover); padding:10px 15px; font-weight:bold; color:var(--primary); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">
                    <span>${prettyDate}</span>
                    <span style="font-size:0.8em; color:var(--text-muted);">Go to Week &rarr;</span>
                </div>
                <div style="padding:10px;">${items}</div>
            </div>
        `;
    });
    container.innerHTML = html;

    // Update desktop pagination
    const paginationEl = document.getElementById('listPagination');
    paginationEl.style.display = 'flex';
    document.getElementById('listPageInfo').textContent    = `${listPage} of ${totalPages}`;
    document.getElementById('btnListFirst').disabled = (listPage <= 1);
    document.getElementById('btnListPrev').disabled  = (listPage <= 1);
    document.getElementById('btnListNext').disabled  = (listPage >= totalPages);
    document.getElementById('btnListLast').disabled  = (listPage >= totalPages);

    // Sync both selects to the current limit
    const rawLimit = listLimit === 99999 ? 'all' : String(listLimit);
    const desktopSel = document.getElementById('listLimitSelect');
    if (desktopSel && desktopSel.value !== rawLimit) desktopSel.value = rawLimit;

    // Render mobile cards
    renderFutureListCards(grouped, visibleDates, listPage, totalPages);
}

// ── LIST VIEW — MOBILE CARDS ──────────────────────────────────────────────────

function renderFutureListCards(grouped, visibleDates, page, totalPages) {
    const container    = document.getElementById('cardContainerList');
    const mobilePageEl = document.getElementById('listPaginationMobile');

    if (!visibleDates || visibleDates.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No future training sessions found.</p>';
        mobilePageEl.style.display = 'none';
        return;
    }

    let html = '';
    visibleDates.forEach(dateStr => {
        const dateObj    = new Date(dateStr);
        const prettyDate = dateObj.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const sessions   = grouped[dateStr] || [];

        const rows = sessions.map(s => {
            const safeName = s.skill_name.replace(/'/g, "\\'");
            const count    = (skillMembersMap[s.skill_name] || []).length;
            return `
                <div class="card-row">
                    <span class="card-label">Skill:</span>
                    <span>${s.skill_name}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Members:</span>
                    <span>
                        <button class="btn-sm btn-informative" onclick="showMemberPopup('${safeName}')"
                            title="View members whose skill expires in this period" style="font-size:12px; padding:2px 8px;">
                            View: ${count}
                        </button>
                    </span>
                </div>
            `;
        }).join('<hr style="border:none; border-top:1px dashed var(--border-color); margin:4px 0;">');

        html += `
            <div class="table-card">
                <div class="card-header">
                    <span class="card-title">${prettyDate}</span>
                </div>
                <div class="card-body">${rows}</div>
                <div class="card-actions">
                    <button class="btn-sm btn-primary" onclick="jumpToDate('${dateStr}')"
                        title="Jump to this week in the Calendar view">
                        Go to Calendar Week
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;

    // Update mobile pagination
    mobilePageEl.style.display = 'flex';
    document.getElementById('listPageInfoMobile').textContent    = `${page} of ${totalPages}`;
    document.getElementById('btnListFirstMobile').disabled = (page <= 1);
    document.getElementById('btnListPrevMobile').disabled  = (page <= 1);
    document.getElementById('btnListNextMobile').disabled  = (page >= totalPages);
    document.getElementById('btnListLastMobile').disabled  = (page >= totalPages);

    const rawLimit   = listLimit === 99999 ? 'all' : String(listLimit);
    const mobileSel  = document.getElementById('listLimitSelectMobile');
    if (mobileSel && mobileSel.value !== rawLimit) mobileSel.value = rawLimit;
}

// ── LIST VIEW — PAGINATION ACTIONS ───────────────────────────────────────────

window.changeListLimit = function (val) {
    listLimit = val === 'all' ? 99999 : parseInt(val);
    listPage  = 1;
    renderFutureList();
    socket.emit('update-preference', { key: 'trainingListLimit', value: val });
};

window.changeListPage = function (delta) {
    listPage += delta;
    renderFutureList();
    document.getElementById('listViewContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.goToListFirstPage = function () {
    if (listPage !== 1) {
        listPage = 1;
        renderFutureList();
        document.getElementById('listViewContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.goToListLastPage = function () {
    const totalDays   = cachedFutureSessions.length;
    const effective   = listLimit === 99999 ? totalDays : listLimit;
    const totalPages  = Math.ceil(totalDays / (effective || 1)) || 1;
    if (listPage !== totalPages) {
        listPage = totalPages;
        renderFutureList();
        document.getElementById('listViewContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// ── CALENDAR NAVIGATION ───────────────────────────────────────────────────────

window.jumpToDate = function (dateStr) {
    currentStartDate = alignToMonday(new Date(dateStr));
    switchView('calendar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
        const dayEl = document.getElementById(`day-${dateStr}`);
        if (dayEl) {
            dayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            dayEl.style.transition = 'background-color 0.5s';
            const orig = dayEl.style.backgroundColor;
            dayEl.style.backgroundColor = '#fff3cd';
            setTimeout(() => { dayEl.style.backgroundColor = orig; }, 1500);
        }
    }, 500);
};

// ── DATE HELPERS ──────────────────────────────────────────────────────────────

function getZonedToday() {
    const now         = new Date();
    const zonedString = now.toLocaleString('en-US', { timeZone: appTimezone });
    const zonedDate   = new Date(zonedString);
    zonedDate.setHours(0, 0, 0, 0);
    return zonedDate;
}

function alignToMonday(date) {
    const d    = new Date(date);
    const day  = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
}

function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ── INITIALISATION ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    fetch('/ui-config')
        .then(r => r.json())
        .then(c => {
            if (c.appBackground)  document.body.style.backgroundImage = `url('${c.appBackground}')`;
            if (c.timezone)       appTimezone       = c.timezone;
            if (c.trainingDayIndex !== undefined) trainingDayIndex = c.trainingDayIndex;

            if (c.trainingDayName) {
                const labelEl = document.getElementById('filterDayLabel');
                if (labelEl) {
                    const dayRaw    = c.trainingDayName.charAt(0).toUpperCase() + c.trainingDayName.slice(1).toLowerCase();
                    const dayPlural = dayRaw.endsWith('s') ? dayRaw : dayRaw + 's';
                    labelEl.innerHTML = `Show only ${dayPlural}<br><span style="font-weight:normal; font-size:0.85em; color:var(--text-muted);">(training day)</span>`;
                }
            }

            const today       = getZonedToday();
            currentStartDate  = alignToMonday(today);
            selectedMobileDay = toIsoDate(today);

            renderCalendar();
            renderMobileDayPicker();

            if (socket.connected) {
                socket.emit('get-preferences');
                loadSessions();
                loadExpiringSkills();
            }
        })
        .catch(e => console.error('UI Config Error:', e));
});

socket.on('disconnect', () => {
    const banner = document.getElementById('socketBanner');
    if (banner) banner.style.display = 'block';
});

socket.on('connect', () => {
    const banner = document.getElementById('socketBanner');
    if (banner) banner.style.display = 'none';
    if (currentStartDate) {
        socket.emit('get-preferences');
        loadSessions();
        loadExpiringSkills();
    }
});

// ── NAVIGATION ACTIONS ────────────────────────────────────────────────────────

function goToToday() {
    const today      = getZonedToday();
    currentStartDate = alignToMonday(today);
    selectedMobileDay = toIsoDate(today);
    renderCalendar();
    renderMobileDayPicker();
    loadSessions();
}

function changeWeek(offset) {
    currentStartDate.setDate(currentStartDate.getDate() + (offset * 7));
    renderCalendar();
    renderMobileDayPicker();
    loadSessions();
}

// ── SOCKET PREFERENCES ───────────────────────────────────────────────────────

socket.on('preferences-data', (prefs) => {
    if (prefs.daysToExpiry !== undefined) {
        const input = document.getElementById('expiryDays');
        if (input.value != prefs.daysToExpiry) input.value = prefs.daysToExpiry;
        loadExpiringSkills();
    }

    if (prefs.filterTrainingDay !== undefined) {
        const checkbox = document.getElementById('filterTrainingDay');
        const newState = (prefs.filterTrainingDay === true || prefs.filterTrainingDay === 'true');
        if (checkbox.checked !== newState) {
            checkbox.checked = newState;
        }
        applyDayFilter();
    }

    if (prefs.trainingListLimit !== undefined) {
        const raw = String(prefs.trainingListLimit);
        const val = raw === 'all' ? 99999 : parseInt(raw);
        if (!isNaN(val)) {
            listLimit = val;
            const desktopSel = document.getElementById('listLimitSelect');
            const mobileSel  = document.getElementById('listLimitSelectMobile');
            if (desktopSel) desktopSel.value = raw;
            if (mobileSel)  mobileSel.value  = raw;
            if (currentView === 'list' && cachedFutureSessions.length > 0) renderFutureList();
        }
    }
});

function toggleDayFilter(isChecked) {
    socket.emit('update-preference', { key: 'filterTrainingDay', value: isChecked });
    applyDayFilter();
}

function updateExpiryPreference(val) {
    const days = parseInt(val);
    if (days > 0) {
        socket.emit('update-preference', { key: 'daysToExpiry', value: days });
        loadExpiringSkills();
    }
}

// ── EXPIRING SKILLS LIST ──────────────────────────────────────────────────────

function loadExpiringSkills() {
    const list    = document.getElementById('skillList');
    list.innerHTML = '<div class="spinner"></div>';
    const days     = document.getElementById('expiryDays').value;
    socket.emit('view-expiring-skills', days, false);
}

socket.on('expiring-skills-data', (data) => {
    const list = document.getElementById('skillList');
    list.innerHTML = '';
    skillMembersMap = {};

    data.forEach(member => {
        member.skills.forEach(skill => {
            if (!skill.hasUrl) {
                if (!skillMembersMap[skill.skill]) skillMembersMap[skill.skill] = [];
                skillMembersMap[skill.skill].push(member.name);
            }
        });
    });

    const skillNames = Object.keys(skillMembersMap).sort();

    // Update mobile accordion badge
    const badge = document.getElementById('skillsCountBadge');
    if (badge) {
        if (skillNames.length > 0) {
            badge.textContent  = skillNames.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (skillNames.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); font-style:italic; padding:10px;">No in-person skills expiring in this timeframe.</p>';
        return;
    }

    skillNames.forEach(name => {
        const count = skillMembersMap[name].length;
        const div   = document.createElement('div');
        div.className  = 'source-item';
        div.draggable  = true;
        div.innerHTML  = `
            <div class="source-name">${name}</div>
            <div class="source-count" title="View ${count} members expiring for this skill"
                  onclick="showMemberPopup('${name.replace(/'/g, "\\'")}')">
                ${count}
            </div>
        `;
        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', name);
            e.dataTransfer.effectAllowed = 'copy';
        });
        list.appendChild(div);
    });
});

function showMemberPopup(skillName) {
    const members = skillMembersMap[skillName] || [];
    const listEl  = document.getElementById('memberList');
    const titleEl = document.getElementById('memberModalTitle');
    const modal   = document.getElementById('memberModal');

    titleEl.textContent = skillName;
    listEl.innerHTML    = '';

    if (members.length === 0) {
        listEl.innerHTML = '<li style="color:var(--text-muted);">No members found.</li>';
    } else {
        members.sort().forEach(member => {
            const li = document.createElement('li');
            li.textContent = member;
            listEl.appendChild(li);
        });
    }
    modal.style.display = 'block';
}

// ── MOBILE: SKILLS PANEL ACCORDION ───────────────────────────────────────────

window.toggleSkillsPanel = function () {
    const panel = document.getElementById('skillsPanelContent');
    const btn   = document.getElementById('skillsToggleBtn');
    const expanded = panel.classList.toggle('skills-expanded');
    btn.classList.toggle('expanded', expanded);
};

// ── MOBILE: DAY PICKER ────────────────────────────────────────────────────────

function renderMobileDayPicker() {
    const picker = document.getElementById('mobileDayPicker');
    if (!picker || !currentStartDate) return;
    picker.innerHTML = '';

    const zonedToday = getZonedToday();
    const todayStr   = toIsoDate(zonedToday);
    const isFiltered = document.getElementById('filterTrainingDay').checked;

    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(currentStartDate);
        loopDate.setDate(loopDate.getDate() + i);

        const isoDate    = toIsoDate(loopDate);
        const dayIndex   = loopDate.getDay();
        const dayName    = loopDate.toLocaleDateString('en-NZ', { weekday: 'short' });
        const dayNum     = loopDate.getDate();
        const isTraining = trainingDayIndex !== null && dayIndex === trainingDayIndex;
        const hasSessions = !!(sessionsCache[isoDate] && sessionsCache[isoDate].length > 0);

        const chip = document.createElement('div');
        chip.className    = 'mobile-day-chip';
        chip.dataset.date = isoDate;
        chip.title        = loopDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' });
        chip.innerHTML    = `<div class="chip-name">${dayName}</div><div class="chip-num">${dayNum}</div>`;

        if (isoDate === selectedMobileDay)  chip.classList.add('chip-selected');
        if (loopDate < zonedToday)          chip.classList.add('chip-past');
        if (isTraining)                     chip.classList.add('chip-training');
        if (isoDate === todayStr)           chip.classList.add('chip-today');
        if (hasSessions)                    chip.classList.add('chip-has-sessions');
        if (isFiltered && !isTraining && !hasSessions) chip.classList.add('chip-filtered-out');

        chip.addEventListener('click', () => selectMobileDay(isoDate));
        picker.appendChild(chip);
    }
}

window.selectMobileDay = function (isoDate) {
    selectedMobileDay = isoDate;

    // Update chip highlights
    document.querySelectorAll('.mobile-day-chip').forEach(c => {
        c.classList.toggle('chip-selected', c.dataset.date === isoDate);
    });

    renderMobileSelectedDay();
};

function renderMobileSelectedDay() {
    const panel = document.getElementById('mobileSelectedDayPanel');
    if (!panel || !selectedMobileDay) return;

    const dateObj    = new Date(selectedMobileDay);
    const prettyDate = dateObj.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const sessions    = sessionsCache[selectedMobileDay] || [];
    const zonedToday  = getZonedToday();
    const isPast      = dateObj < zonedToday;

    let sessionsHtml = '';
    if (sessions.length === 0) {
        sessionsHtml = `<div class="mobile-day-empty">No sessions scheduled.</div>`;
    } else {
        sessions.forEach(sess => {
            const safeName = sess.skill_name.replace(/'/g, "\\'");
            sessionsHtml += `
                <div class="mobile-session-chip">
                    ${sess.skill_name}
                    <span class="mobile-session-delete"
                        onclick="deleteSession(${sess.id}, '${safeName}', '${sess.date}')"
                        title="Remove this training session">&times;</span>
                </div>
            `;
        });
    }

    const scheduleBtn = !isPast
        ? `<button class="btn-success btn-sm" onclick="openScheduleSkillModal()"
                title="Schedule an expiring skill on this day" style="margin-top:10px; width:100%;">
                + Schedule Skill
            </button>`
        : '';

    panel.innerHTML = `
        <div class="msd-date-label">${prettyDate}</div>
        ${sessionsHtml}
        ${scheduleBtn}
    `;
}

// ── MOBILE: SCHEDULE SKILL MODAL ─────────────────────────────────────────────

window.openScheduleSkillModal = function () {
    const modal    = document.getElementById('scheduleSkillModal');
    const titleEl  = document.getElementById('scheduleSkillModalTitle');
    const listEl   = document.getElementById('scheduleSkillList');

    const dateObj    = new Date(selectedMobileDay);
    const prettyDate = dateObj.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
    titleEl.textContent = `Schedule for ${prettyDate}`;

    const skillNames = Object.keys(skillMembersMap).sort();
    if (skillNames.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-muted);">No expiring skills available.</p>';
    } else {
        listEl.innerHTML = skillNames.map(name => {
            const count    = (skillMembersMap[name] || []).length;
            const safeName = name.replace(/'/g, "\\'");
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color);">
                    <span style="font-size:13px; font-weight:500;">${name}
                        <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${count} member${count !== 1 ? 's' : ''})</span>
                    </span>
                    <button class="btn-sm btn-success" onclick="scheduleSkillMobile('${safeName}')"
                        title="Schedule ${name} on the selected day">
                        Schedule
                    </button>
                </div>
            `;
        }).join('');
    }

    modal.style.display = 'block';
};

window.scheduleSkillMobile = async function (skillName) {
    document.getElementById('scheduleSkillModal').style.display = 'none';
    await saveSession(selectedMobileDay, skillName);
};

// ── CALENDAR RENDER (DESKTOP GRID) ────────────────────────────────────────────

function renderCalendar() {
    if (!currentStartDate) return;
    const grid   = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const options    = { month: 'short', day: 'numeric' };
    const labelStart = new Date(currentStartDate);
    const labelEnd   = new Date(currentStartDate);
    labelEnd.setDate(labelEnd.getDate() + 6);
    document.getElementById('currentWeekLabel').textContent =
        `${labelStart.toLocaleDateString('en-NZ', options)} – ${labelEnd.toLocaleDateString('en-NZ', options)}`;

    const zonedToday = getZonedToday();
    const todayStr   = toIsoDate(zonedToday);

    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(currentStartDate);
        loopDate.setDate(loopDate.getDate() + i);

        const isoDate  = toIsoDate(loopDate);
        const dayIndex = loopDate.getDay();

        const col = document.createElement('div');
        col.className = 'day-column';
        if (trainingDayIndex !== null && dayIndex === trainingDayIndex) col.classList.add('training-day');
        if (loopDate < zonedToday) col.classList.add('past-day');

        const header = document.createElement('div');
        header.className = 'day-header';
        if (isoDate === todayStr) header.classList.add('today');
        header.textContent = `${loopDate.toLocaleDateString('en-NZ', { weekday: 'short' })} ${loopDate.getDate()}`;

        const content = document.createElement('div');
        content.className = 'day-content';
        content.id        = `day-${isoDate}`;
        content.setAttribute('data-date',      isoDate);
        content.setAttribute('data-day-index', dayIndex);

        if (loopDate >= zonedToday) {
            content.addEventListener('dragover',  (e) => { e.preventDefault(); content.classList.add('drag-over'); });
            content.addEventListener('dragleave', ()  => { content.classList.remove('drag-over'); });
            content.addEventListener('drop',      async (e) => {
                e.preventDefault();
                content.classList.remove('drag-over');
                const skillName = e.dataTransfer.getData('text/plain');
                if (skillName) await saveSession(isoDate, skillName);
            });
        }

        col.appendChild(header);
        col.appendChild(content);
        grid.appendChild(col);
    }
    applyDayFilter();
}

function applyDayFilter() {
    const isFiltered = document.getElementById('filterTrainingDay').checked;

    // Desktop grid columns
    document.querySelectorAll('.day-column').forEach(col => {
        const contentDiv  = col.querySelector('.day-content');
        const dayIndex    = parseInt(contentDiv.getAttribute('data-day-index'));
        const isTraining  = (trainingDayIndex !== null && dayIndex === trainingDayIndex);
        const hasSessions = contentDiv.children.length > 0;

        col.classList.toggle('hidden-day',   isFiltered && !isTraining && !hasSessions);
        col.classList.toggle('has-sessions', hasSessions);
    });

    // Mobile day-picker chips
    renderMobileDayPicker();
}

// ── DATA & API ────────────────────────────────────────────────────────────────

async function loadSessions() {
    if (!currentStartDate) return;

    const start     = new Date(currentStartDate);
    const end       = new Date(currentStartDate);
    end.setDate(end.getDate() + 6);
    const startStr  = toIsoDate(start);
    const endStr    = toIsoDate(end);

    try {
        const res      = await fetch(`/api/training-sessions?start=${startStr}&end=${endStr}`);
        const sessions = await res.json();

        // Reset desktop day content + sessions cache for this week
        document.querySelectorAll('.day-content').forEach(el => el.innerHTML = '');
        sessionsCache = {};

        sessions.forEach(sess => {
            // Populate desktop grid
            const container = document.getElementById(`day-${sess.date}`);
            if (container) {
                const card     = document.createElement('div');
                card.className = 'session-card';
                const safeName = sess.skill_name.replace(/'/g, "\\'");
                card.innerHTML = `
                    <span class="session-delete"
                        onclick="deleteSession(${sess.id}, '${safeName}', '${sess.date}'); event.stopPropagation();"
                        title="Remove this training session">&times;</span>
                    <div style="cursor:pointer;" onclick="showMemberPopup('${safeName}')" title="View expiring members for this skill">
                        <strong>${sess.skill_name}</strong>
                    </div>
                `;
                container.appendChild(card);
            }

            // Populate mobile sessions cache
            if (!sessionsCache[sess.date]) sessionsCache[sess.date] = [];
            sessionsCache[sess.date].push(sess);
        });

        applyDayFilter();        // also re-renders mobile chips with filter + session state
        renderMobileSelectedDay();
    } catch (e) {
        if (window.showToast) window.showToast('Failed to load schedule', 'error');
    }
}

async function saveSession(date, skillName) {
    if (isDemo) { if (window.showToast) window.showToast('Disabled in demo mode.', 'warning'); return; }
    try {
        const res = await fetch('/api/training-sessions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ date, skillName }),
        });
        if (res.ok) {
            await loadSessions();
            if (window.showToast) window.showToast('Training scheduled', 'success');
        }
    } catch (e) {
        if (window.showToast) window.showToast('Error saving training', 'error');
    }
}

async function deleteSession(id, skillName, date) {
    if (isDemo) { if (window.showToast) window.showToast('Disabled in demo mode.', 'warning'); return; }
    if (!await confirmAction('Remove Session', `Remove '${skillName}' on ${date}?`)) return;
    try {
        await fetch(`/api/training-sessions/${id}`, { method: 'DELETE' });
        await loadSessions();
    } catch (e) {
        if (window.showToast) window.showToast('Error removing session', 'error');
    }
}

// ── SCROLL UTILS ──────────────────────────────────────────────────────────────

const scrollTopBtn = document.getElementById('scrollTopBtn');
window.onscroll = function () {
    if (scrollTopBtn) {
        scrollTopBtn.style.display =
            (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) ? 'flex' : 'none';
    }
};

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
