// public/training-planner.js

const socket = io();

// Global State
let appTimezone = 'Pacific/Auckland'; // Default, will be overwritten by config
let currentStartDate = null;          // Will be set after config loads
let trainingDayIndex = null;
let skillMembersMap = {};

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

                    labelEl.innerHTML = `Show only ${dayPlural}<br><span style="font-weight:normal; font-size:0.85em; color:var(--text-muted);">(training day)</span>`;
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
    list.innerHTML = '<div class="spinner"></div>';
    const days = document.getElementById('expiryDays').value;
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

    if (skillNames.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); font-style:italic; padding:10px;">No in-person skills expiring in this timeframe.</p>';
        return;
    }

    skillNames.forEach(name => {
        const count = skillMembersMap[name].length;
        const div = document.createElement('div');
        div.className = 'source-item';
        div.draggable = true;

        div.innerHTML = `
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
    listEl.innerHTML = '';

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

// --- CALENDAR RENDER LOGIC ---

function renderCalendar() {
    if (!currentStartDate) return;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const options = { month: 'short', day: 'numeric' };
    const labelStart = new Date(currentStartDate);
    const labelEnd = new Date(currentStartDate);
    labelEnd.setDate(labelEnd.getDate() + 6);

    document.getElementById('currentWeekLabel').textContent =
        `${labelStart.toLocaleDateString('en-NZ', options)} - ${labelEnd.toLocaleDateString('en-NZ', options)}`;

    // Determine "Today" based on the APP_TIMEZONE
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

        // 1. Highlight Training Day
        if (trainingDayIndex !== null && dayIndex === trainingDayIndex) {
            col.classList.add('training-day');
        }

        // 2. [NEW] Grey out Past Days
        // Since getZonedToday returns midnight, and loopDate is midnight, strict comparison works
        if (loopDate < zonedToday) {
            col.classList.add('past-day');
        }

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

        //  Drag & Drop Events
        // Only attach listeners if the date is NOT in the past
        if (loopDate >= zonedToday) {
            content.addEventListener('dragover', (e) => {
                e.preventDefault();
                content.classList.add('drag-over');
            });

            content.addEventListener('dragleave', () => {
                content.classList.remove('drag-over');
            });

            content.addEventListener('drop', async (e) => {
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

async function loadSessions() {
    if (!currentStartDate) return;

    const start = new Date(currentStartDate);
    const end = new Date(currentStartDate);
    end.setDate(end.getDate() + 6);

    // Format as YYYY-MM-DD using local math to preserve Zoned date
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const startStr = formatDate(start);
    const endStr = formatDate(end);

    try {
        const res = await fetch(`/api/training-sessions?start=${startStr}&end=${endStr}`);
        const sessions = await res.json();

        document.querySelectorAll('.day-content').forEach(el => el.innerHTML = '');

        sessions.forEach(sess => {
            const container = document.getElementById(`day-${sess.date}`);
            if (container) {
                const card = document.createElement('div');
                card.className = 'session-card';
                const safeName = sess.skill_name.replace(/'/g, "\\'");

                card.innerHTML = `
                    <span class="session-delete" onclick="deleteSession(${sess.id}); event.stopPropagation();" title="Remove Session">&times;</span>
                    <div style="cursor:pointer;" onclick="showMemberPopup('${safeName}')" title="View expiring members">
                        <strong>${sess.skill_name}</strong>
                    </div>
                `;
                container.appendChild(card);
            }
        });

        applyDayFilter();

    } catch (e) {
        if (window.showToast) window.showToast("Failed to load schedule", "error");
    }
}

async function saveSession(date, skillName) {
    try {
        const res = await fetch('/api/training-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, skillName })
        });
        if (res.ok) {
            await loadSessions();
            if (window.showToast) window.showToast("Training scheduled", "success");
        }
    } catch (e) {
        if (window.showToast) window.showToast("Error saving training", "error");
    }
}

async function deleteSession(id) {
    if (!confirm("Remove this training session?")) return;
    try {
        await fetch(`/api/training-sessions/${id}`, { method: 'DELETE' });
        await loadSessions();
    } catch (e) {
        if (window.showToast) window.showToast("Error removing session", "error");
    }
}

// --- SCROLL UTILS ---
const scrollTopBtn = document.getElementById("scrollTopBtn");
window.onscroll = function () {
    if (scrollTopBtn) {
        scrollTopBtn.style.display = (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) ? "flex" : "none";
    }
};
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}