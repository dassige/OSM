// public/training-planner.js

const socket = io();

// Global State
let appTimezone = 'Pacific/Auckland'; // Default, will be overwritten by config
let currentStartDate = null;          // Will be set after config loads
let trainingDayIndex = null;
let skillMembersMap = {};
let currentView = 'calendar';
let listPage = 1;
let listLimit = 10;
let cachedFutureSessions = []; // Store data for local pagination
// --- VIEW SWITCHING ---

window.switchView = function (view) {
    currentView = view;

    const calendarContainer = document.getElementById('calendarViewContainer');
    const listContainer = document.getElementById('listViewContainer');

    const btnCal = document.getElementById('btnViewCalendar');
    const btnList = document.getElementById('btnViewList');

    if (view === 'calendar') {
        calendarContainer.style.display = 'flex';
        listContainer.style.display = 'none';

        // Update Buttons
        btnCal.style.background = 'var(--primary)';
        btnCal.style.color = 'white';
        btnList.style.background = 'transparent';
        btnList.style.color = 'var(--text-main)';

        // Refresh Calendar
        renderCalendar();
        loadSessions();
    } else {
        calendarContainer.style.display = 'none';
        listContainer.style.display = 'block';

        // Update Buttons
        btnList.style.background = 'var(--primary)';
        btnList.style.color = 'white';
        btnCal.style.background = 'transparent';
        btnCal.style.color = 'var(--text-main)';

        // Load List Data
        loadFutureSessionsList();
    }
};

// --- LIST VIEW LOGIC ---

async function loadFutureSessionsList() {
    const container = document.getElementById('listContent');
    container.textContent = '<div class="spinner"></div>';
    document.getElementById('listPagination').style.display = 'none';

    try {
        const res = await fetch('/api/training-sessions?view=future');
        const sessions = await res.json();

        cachedFutureSessions = sessions; // Save for pagination
        listPage = 1; // Reset to first page on reload
        renderFutureList();

    } catch (e) {
        container.textContent = `<p style="color:red;">Error loading sessions: ${e.message}</p>`;
    }
}

function renderFutureList() {
    const container = document.getElementById('listContent');

    if (cachedFutureSessions.length === 0) {
        container.textContent = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No future training sessions found.</p>';
        document.getElementById('listPagination').style.display = 'none';
        return;
    }

    // 1. Group by Date
    const grouped = {};
    cachedFutureSessions.forEach(s => {
        if (!grouped[s.date]) grouped[s.date] = [];
        grouped[s.date].push(s);
    });

    const uniqueDates = Object.keys(grouped).sort();
    const totalDays = uniqueDates.length;

    // 2. Paginate
    const totalPages = Math.ceil(totalDays / listLimit);
    if (listPage > totalPages) listPage = totalPages;
    if (listPage < 1) listPage = 1;

    const startIndex = (listPage - 1) * listLimit;
    const endIndex = Math.min(startIndex + listLimit, totalDays);
    const visibleDates = uniqueDates.slice(startIndex, endIndex);

    // 3. Render HTML
    let html = '';

    visibleDates.forEach(dateStr => {
        const dateObj = new Date(dateStr);
        const prettyDate = dateObj.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

        const items = grouped[dateStr].map(s => {
            const safeName = s.skill_name.replace(/'/g, "\\'");

            // [NEW] Calculate Member Count
            // Use the global skillMembersMap to find how many people have this skill expiring
            const count = (skillMembersMap[s.skill_name] || []).length;

            return `
                <div style="background:var(--bg-body); border:1px solid var(--border-color); padding:8px 12px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:500;">${s.skill_name}</span>
                    
                    <button class="btn-sm" onclick="showMemberPopup('${safeName}'); event.stopPropagation();" style="background:var(--info); font-size:12px; padding:2px 8px;">
                        View Members: ${count}
                    </button>
                </div>
            `;
        }).join('');

        html += `
            <div onclick="jumpToDate('${dateStr}')" 
                 style="cursor:pointer; border:1px solid var(--primary); border-left-width: 5px; background:var(--bg-card); margin-bottom:15px; border-radius:4px; overflow:hidden; transition: transform 0.2s;"
                 onmouseover="this.style.transform='translateX(5px)'" 
                 onmouseout="this.style.transform='translateX(0)'"
                 title="Click to view in Calendar">
                
                <div style="background:var(--bg-hover); padding:10px 15px; font-weight:bold; color:var(--primary); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">
                    <span>${prettyDate}</span>
                    <span style="font-size:0.8em; color:var(--text-muted);">Go to Week &rarr;</span>
                </div>
                <div style="padding:10px;">
                    ${items}
                </div>
            </div>
        `;
    });

    container.textContent = html;

    // 4. Update Pagination Controls
    const paginationEl = document.getElementById('listPagination');
    if (totalDays > listLimit) {
        paginationEl.style.display = 'flex';
        document.getElementById('listPageInfo').textContent = `Showing days ${startIndex + 1}-${endIndex} of ${totalDays}`;
        document.getElementById('btnListPrev').disabled = (listPage <= 1);
        document.getElementById('btnListNext').disabled = (listPage >= totalPages);
    } else {
        paginationEl.style.display = 'none';
    }
}

// --- [NEW] PAGINATION ACTIONS ---

window.changeListLimit = function (val) {
    listLimit = parseInt(val);
    listPage = 1; // Reset to start
    renderFutureList();
    // Save preference
    socket.emit('update-preference', { key: 'trainingListLimit', value: listLimit });
};

window.changeListPage = function (delta) {
    listPage += delta;
    renderFutureList();
    // Scroll to top of list container for better UX
    const container = document.getElementById('listViewContainer');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
// --- NAVIGATION LOGIC ---

window.jumpToDate = function (dateStr) {
    const targetDate = new Date(dateStr);

    // 1. Align the calendar start date to the Monday of that week
    currentStartDate = alignToMonday(targetDate);

    // 2. Switch back to calendar view
    switchView('calendar');

    // 3. Scroll to top to ensure the calendar is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Optional: Highlight the specific day after render
    setTimeout(() => {
        const dayEl = document.getElementById(`day-${dateStr}`);
        if (dayEl) {
            dayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash effect
            dayEl.style.transition = "background-color 0.5s";
            const originalBg = dayEl.style.backgroundColor;
            dayEl.style.backgroundColor = "#fff3cd"; // Flash yellow
            setTimeout(() => { dayEl.style.backgroundColor = originalBg; }, 1500);
        }
    }, 500); // Wait for API load/render
};
// Helper: Get "Today" shifted to the App's Timezone
// This creates a Date object that "looks" like the target timezone time
// even if the browser is in a different timezone.
function getZonedToday() {
    const now = new Date();
    // Get the date string in the target timezone
    const zonedString = now.toLocaleString('en-US', { timeZone: appTimezone });
    const zonedDate = new Date(zonedString);

    // Reset time to midnight to avoid offset issues during math
    zonedDate.setHours(0, 0, 0, 0);
    return zonedDate;
}

// Helper: Align a date to the previous Monday
function alignToMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day == 0 ? -6 : 1);
    d.setDate(diff);
    return d;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    // 1. Load Configuration First
    fetch('/ui-config')
        .then(r => r.json())
        .then(c => {
            // Apply Config
            if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
            if (c.timezone) appTimezone = c.timezone;
            if (c.trainingDayIndex !== undefined) trainingDayIndex = c.trainingDayIndex;

            // [NEW] Update Training Day Label
            if (c.trainingDayName) {
                const labelEl = document.getElementById('filterDayLabel');
                if (labelEl) {
                    // Capitalize and ensure plural (e.g. "Monday" -> "Mondays")
                    const dayRaw = c.trainingDayName.charAt(0).toUpperCase() + c.trainingDayName.slice(1).toLowerCase();
                    const dayPlural = dayRaw.endsWith('s') ? dayRaw : dayRaw + 's';

                    labelEl.textContent = `Show only ${dayPlural}<br><span style="font-weight:normal; font-size:0.85em; color:var(--text-muted);">(training day)</span>`;
                }
            }            // Initialize Date Logic using the correct Timezone
            currentStartDate = alignToMonday(getZonedToday());

            // Initial Render
            renderCalendar();

            // Load Data
            if (socket.connected) {
                socket.emit('get-preferences');
                loadSessions();
                loadExpiringSkills();
            }
        })
        .catch(e => console.error("UI Config Error:", e));
});

socket.on('connect', () => {
    // Only fetch if config has already loaded (currentStartDate exists)
    // Otherwise the fetch callback above will handle it
    if (currentStartDate) {
        socket.emit('get-preferences');
        loadSessions();
    }
});

// --- NAVIGATION & ACTIONS ---

function goToToday() {
    currentStartDate = alignToMonday(getZonedToday());
    renderCalendar();
    loadSessions();
}

function changeWeek(offset) {
    currentStartDate.setDate(currentStartDate.getDate() + (offset * 7));
    renderCalendar();
    loadSessions();
}

// --- SYNCHRONIZATION ---

socket.on('preferences-data', (prefs) => {
    if (prefs.daysToExpiry !== undefined) {
        const input = document.getElementById('expiryDays');
        if (input.value != prefs.daysToExpiry) {
            input.value = prefs.daysToExpiry;
        }
        loadExpiringSkills();
    }

    if (prefs.filterTrainingDay !== undefined) {
        const checkbox = document.getElementById('filterTrainingDay');
        const newState = (prefs.filterTrainingDay === true || prefs.filterTrainingDay === 'true');
        if (checkbox.checked !== newState) {
            checkbox.checked = newState;
            applyDayFilter();
        } else {
            applyDayFilter();
        }
    }
    if (prefs.trainingListLimit) {
        const val = parseInt(prefs.trainingListLimit);
        if (!isNaN(val) && listLimit !== val) {
            listLimit = val;
            const select = document.getElementById('listLimitSelect');
            if (select) select.value = val;
            // Re-render if we are in list view and have data
            if (currentView === 'list' && cachedFutureSessions.length > 0) {
                renderFutureList();
            }
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

// --- SKILLS LIST LOGIC ---

function loadExpiringSkills() {
    const list = document.getElementById('skillList');
    list.textContent = '<div class="spinner"></div>';
    const days = document.getElementById('expiryDays').value;
    socket.emit('view-expiring-skills', days, false);
}

socket.on('expiring-skills-data', (data) => {
    const list = document.getElementById('skillList');
    list.textContent = '';
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

    if (skillNames.length === 0) {
        list.textContent = '<p style="color:var(--text-muted); font-style:italic; padding:10px;">No in-person skills expiring in this timeframe.</p>';
        return;
    }

    skillNames.forEach(name => {
        const count = skillMembersMap[name].length;
        const div = document.createElement('div');
        div.className = 'source-item';
        div.draggable = true;

        div.textContent = `
            <div class="source-name">${name}</div>
            <div class="source-count" title="View ${count} members" 
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
    const listEl = document.getElementById('memberList');
    const titleEl = document.getElementById('memberModalTitle');
    const modal = document.getElementById('memberModal');

    titleEl.textContent = skillName;
    listEl.textContent = '';

    if (members.length === 0) {
        listEl.textContent = '<li style="color:var(--text-muted);">No members found.</li>';
    } else {
        members.sort().forEach(member => {
            const li = document.createElement('li');
            li.textContent = member;
            listEl.appendChild(li);
        });
    }
    modal.style.display = 'block';
}

// --- CALENDAR RENDER LOGIC ---

function renderCalendar() {
    if (!currentStartDate) return;
    const grid = document.getElementById('calendarGrid');
    grid.textContent = '';
    const options = { month: 'short', day: 'numeric' };
    const labelStart = new Date(currentStartDate);
    const labelEnd = new Date(currentStartDate);
    labelEnd.setDate(labelEnd.getDate() + 6);
    document.getElementById('currentWeekLabel').textContent = `${labelStart.toLocaleDateString('en-NZ', options)} - ${labelEnd.toLocaleDateString('en-NZ', options)}`;
    const zonedToday = getZonedToday();
    const todayStr = `${zonedToday.getFullYear()}-${String(zonedToday.getMonth() + 1).padStart(2, '0')}-${String(zonedToday.getDate()).padStart(2, '0')}`;

    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(currentStartDate);
        loopDate.setDate(loopDate.getDate() + i);
        const y = loopDate.getFullYear();
        const m = String(loopDate.getMonth() + 1).padStart(2, '0');
        const d = String(loopDate.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${d}`;
        const dayIndex = loopDate.getDay();
        const col = document.createElement('div');
        col.className = 'day-column';
        if (trainingDayIndex !== null && dayIndex === trainingDayIndex) col.classList.add('training-day');
        if (loopDate < zonedToday) col.classList.add('past-day');

        const header = document.createElement('div');
        header.className = 'day-header';
        if (isoDate === todayStr) header.classList.add('today');
        const dayName = loopDate.toLocaleDateString('en-NZ', { weekday: 'short' });
        const dayNum = loopDate.getDate();
        header.textContent = `${dayName} ${dayNum}`;

        const content = document.createElement('div');
        content.className = 'day-content';
        content.id = `day-${isoDate}`;
        content.setAttribute('data-date', isoDate);
        content.setAttribute('data-day-index', dayIndex);

        if (loopDate >= zonedToday) {
            content.addEventListener('dragover', (e) => { e.preventDefault(); content.classList.add('drag-over'); });
            content.addEventListener('dragleave', () => { content.classList.remove('drag-over'); });
            content.addEventListener('drop', async (e) => { e.preventDefault(); content.classList.remove('drag-over'); const skillName = e.dataTransfer.getData('text/plain'); if (skillName) await saveSession(isoDate, skillName); });
        }
        col.appendChild(header); col.appendChild(content); grid.appendChild(col);
    }
    applyDayFilter();
}
function applyDayFilter() {
    const isFiltered = document.getElementById('filterTrainingDay').checked;
    const columns = document.querySelectorAll('.day-column');

    columns.forEach(col => {
        const contentDiv = col.querySelector('.day-content');

        const dayIndex = parseInt(contentDiv.getAttribute('data-day-index'));
        const isTrainingDay = (trainingDayIndex !== null && dayIndex === trainingDayIndex);
        const hasSessions = contentDiv.children.length > 0;

        // Visibility
        if (!isFiltered || isTrainingDay || hasSessions) {
            col.classList.remove('hidden-day');
        } else {
            col.classList.add('hidden-day');
        }

        // Flex Weighting
        if (hasSessions) {
            col.classList.add('has-sessions');
        } else {
            col.classList.remove('has-sessions');
        }
    });
}

// --- DATA & API ---
// --- DATA & API ---
async function loadSessions() {
    if (!currentStartDate) return;
    const start = new Date(currentStartDate);
    const end = new Date(currentStartDate);
    end.setDate(end.getDate() + 6);
    const formatDate = (date) => { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; };
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    try {
        const res = await fetch(`/api/training-sessions?start=${startStr}&end=${endStr}`);
        const sessions = await res.json();
        document.querySelectorAll('.day-content').forEach(el => el.textContent = '');
        sessions.forEach(sess => {
            const container = document.getElementById(`day-${sess.date}`);
            if (container) {
                const card = document.createElement('div');
                card.className = 'session-card';
                const safeName = sess.skill_name.replace(/'/g, "\\'");
                // [UPDATED] Pass extra info to deleteSession
                card.textContent = `
                    <span class="session-delete" onclick="deleteSession(${sess.id}, '${safeName}', '${sess.date}'); event.stopPropagation();" title="Remove Session">&times;</span>
                    <div style="cursor:pointer;" onclick="showMemberPopup('${safeName}')" title="View expiring members">
                        <strong>${sess.skill_name}</strong>
                    </div>
                `;
                container.appendChild(card);
            }
        });
        applyDayFilter();
    } catch (e) { if (window.showToast) window.showToast("Failed to load schedule", "error"); }
}

async function saveSession(date, skillName) {
    try {
        const res = await fetch('/api/training-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, skillName }) });
        if (res.ok) { await loadSessions(); if (window.showToast) window.showToast("Training scheduled", "success"); }
    } catch (e) { if (window.showToast) window.showToast("Error saving training", "error"); }
}

// [UPDATED] Delete Session with Context
async function deleteSession(id, skillName, date) {
    if (!await confirmAction('Remove Session', `Remove '${skillName}' on ${date}?`)) return;
    try {
        await fetch(`/api/training-sessions/${id}`, { method: 'DELETE' });
        await loadSessions();
    } catch (e) {
        if (window.showToast) window.showToast("Error removing session", "error");
    }
}
//-- SCROLL UTILS ---
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.onscroll = function () {
    if (scrollTopBtn) {
        scrollTopBtn.style.display = (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) ? "flex" : "none";
    }
};
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}