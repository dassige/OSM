// public/js/live-quiz.js

let sessionTable;
let currentSessions = [];
let sessionsPage = 1;
let sessionsLimit = 25;
let isDemo = false;
let currentDetailSessionId = null;
let currentPlayers = [];
let playerSort = { column: 'name', order: 'asc' };
let playersPage = 1;
let playersLimit = 25;
let uiConfig = {};

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function formatDate(dateStr, withTime) {
  if (!dateStr) return '';
  // SQLite's CURRENT_TIMESTAMP stores UTC as "YYYY-MM-DD HH:MM:SS" with no
  // timezone marker — without a 'Z', Date() parses it as local time instead of UTC.
  let safeDateStr = dateStr;
  if (!safeDateStr.includes('Z')) safeDateStr = safeDateStr.replace(' ', 'T') + 'Z';
  const locale = uiConfig.locale || navigator.language || 'en-NZ';
  const timeZone = uiConfig.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return withTime
    ? new Date(safeDateStr).toLocaleString(locale, { timeZone })
    : new Date(safeDateStr).toLocaleDateString(locale, { timeZone });
}

async function initPage() {
  try {
    const uiRes = await fetch('/ui-config');
    uiConfig = await uiRes.json();
    initPageTitle('Live Quiz', 'Live Quiz');
    if (uiConfig.appBackground) document.body.style.backgroundImage = `url('${uiConfig.appBackground}')`;
    if (uiConfig.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
    isDemo = uiConfig.appMode === 'demo';
  } catch (e) {}

  let sessionsLimitRaw = '25';
  try {
    const limRes = await fetch('/api/user-preferences/liveQuizPageLimit');
    const limData = await limRes.json();
    if (limData.value) {
      sessionsLimitRaw = limData.value;
      sessionsLimit = limData.value === 'all' ? 99999 : parseInt(limData.value);
    }
  } catch (e) {}
  document.getElementById('sessionsRowsPerPage').value = sessionsLimitRaw;
  document.getElementById('sessionsRowsPerPageMobile').value = sessionsLimitRaw;

  let initialSort = { column: 'created_at', order: 'desc' };
  try {
    const prefRes = await fetch('/api/user-preferences');
    if (prefRes.ok) {
      const prefs = await prefRes.json();
      if (prefs.liveQuizSort) initialSort = prefs.liveQuizSort;
      if (prefs.liveQuizPlayersSort) {
        const [col, dir] = String(prefs.liveQuizPlayersSort).split(':');
        if (col && dir) playerSort = { column: col, order: dir };
      }
    }
  } catch (e) {}

  let playersLimitRaw = '25';
  try {
    const limRes = await fetch('/api/user-preferences/liveQuizPlayersPageLimit');
    const limData = await limRes.json();
    if (limData.value) {
      playersLimitRaw = limData.value;
      playersLimit = limData.value === 'all' ? 99999 : parseInt(limData.value);
    }
  } catch (e) {}
  document.getElementById('playersRowsPerPage').value = playersLimitRaw;
  document.getElementById('playersRowsPerPageMobile').value = playersLimitRaw;

  sessionTable = new TableController({
    tbodyId: 'sessionsTableBody',
    emptyMessage: 'No quiz sessions started yet.',
    initialSort,
    onSortChange: (newSort) => {
      fetch('/api/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'liveQuizSort', value: newSort }),
      });
    },
    sortFunction: (a, b, sortState) => {
      let valA, valB;
      if (sortState.column === 'is_archived') {
        valA = a.is_archived ? 1 : 0;
        valB = b.is_archived ? 1 : 0;
      } else if (sortState.column === 'created_at') {
        valA = a.created_at; valB = b.created_at;
      } else {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      }
      if (valA < valB) return sortState.order === 'asc' ? -1 : 1;
      if (valA > valB) return sortState.order === 'asc' ? 1 : -1;
      return 0;
    },
    onRenderComplete: () => applySessionsPagination(),
    renderRow: (s, index) => renderSessionRow(s, index),
  });

  await loadSessions();
}

async function loadSessions() {
  try {
    const res = await fetch('/api/live-quiz/sessions');
    if (!res.ok) throw new Error('Failed to load');
    currentSessions = await res.json();
    sessionsPage = 1;
    sessionTable.setData(currentSessions);
  } catch (e) {
    showToast('Failed to load quiz sessions', 'error');
  }
}

function toggleSortBar() {
  const bar = document.getElementById('sl-sort-bar');
  const btn = document.getElementById('sortToggleBtn');
  const expanded = bar.classList.toggle('sort-expanded');
  btn.classList.toggle('expanded', expanded);
}
function handleSort(column) { sessionTable.handleSort(column); }

function progressHtml(s) {
  const total = s.total_sent || 0;
  const submitted = s.total_submitted || 0;
  return `${submitted} of ${total} submitted`;
}

function renderSessionRow(s, index) {
  const tr = document.createElement('tr');
  const startedDate = formatDate(s.created_at, false);
  tr.innerHTML = `
    <td data-label="Started">${startedDate}</td>
    <td data-label="Session"><strong>${esc(s.name)}</strong><br><span style="font-size:0.82em; color:var(--text-muted);">${esc(s.game_name)}</span></td>
    <td data-label="Status" class="text-center"><span class="status-badge ${s.is_archived ? 'status-archived' : 'status-active'}">${s.is_archived ? 'Archived' : 'Active'}</span></td>
    <td data-label="Progress" class="text-center">${progressHtml(s)}</td>
    <td data-label="Actions" class="text-center ws-nowrap">
      <button class="btn-sm btn-informative" onclick="openSessionDetail(${s.id})" title="View player results">Results</button>
      <button class="btn-sm btn-secondary" onclick="toggleArchive(${s.id}, ${!s.is_archived})" title="${s.is_archived ? 'Restore this session to active' : 'Archive this session'}">${s.is_archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn-icon delete" onclick="deleteSession(${s.id})" title="Permanently delete this session">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </td>
  `;
  return tr;
}

function applySessionsPagination() {
  const allData = sessionTable.data;
  const total = allData.length;
  const effectiveLimit = sessionsLimit === 99999 ? total : sessionsLimit;
  if (total === 0) { updateSessionsPaginationUI(0, 0, 0); renderSessionCards([], 0); return; }

  const totalPages = Math.ceil(total / effectiveLimit);
  if (sessionsPage > totalPages) sessionsPage = 1;
  const start = (sessionsPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);

  const tbody = document.getElementById('sessionsTableBody');
  tbody.innerHTML = '';
  allData.slice(start, end).forEach((s, i) => tbody.appendChild(sessionTable.renderRow(s, start + i)));

  renderSessionCards(allData.slice(start, end), start);
  updateSessionsPaginationUI(total, start + 1, end);
}

function renderSessionCards(data, startIndex) {
  const container = document.getElementById('sessionsCardContainer');
  container.innerHTML = '';
  if (data.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No quiz sessions started yet.</p>';
    return;
  }
  data.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${esc(s.name)}</span>
        <span class="status-badge ${s.is_archived ? 'status-archived' : 'status-active'}">${s.is_archived ? 'Archived' : 'Active'}</span>
      </div>
      <div class="card-body">
        <div class="card-row"><span class="card-label">Game:</span><span>${esc(s.game_name)}</span></div>
        <div class="card-row"><span class="card-label">Progress:</span><span>${progressHtml(s)}</span></div>
      </div>
      <div class="card-actions">
        <button class="btn-informative btn-sm" onclick="openSessionDetail(${s.id})" title="View player results">Results</button>
        <button class="btn-secondary btn-sm" onclick="toggleArchive(${s.id}, ${!s.is_archived})" title="Toggle archive">${s.is_archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn-danger btn-sm" onclick="deleteSession(${s.id})" title="Permanently delete this session">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function updateSessionsPaginationUI(total, start, end) {
  const effectiveLimit = sessionsLimit === 99999 ? total : sessionsLimit;
  const totalPages = sessionsLimit === 99999 ? 1 : Math.ceil(total / (effectiveLimit || 1));
  const show = total > 0;
  document.getElementById('sessionsPaginationControls').style.display = show ? 'flex' : 'none';
  document.getElementById('sessionsPageInfo').textContent = `${sessionsPage} of ${totalPages}`;
  document.getElementById('sessionsBtnFirst').disabled = sessionsPage <= 1;
  document.getElementById('sessionsBtnPrev').disabled = sessionsPage <= 1;
  document.getElementById('sessionsBtnNext').disabled = sessionsPage >= totalPages;
  document.getElementById('sessionsBtnLast').disabled = sessionsPage >= totalPages;

  document.getElementById('sessionsPaginationControlsMobile').style.display = show ? 'flex' : 'none';
  document.getElementById('sessionsPageInfoMobile').textContent = `${sessionsPage} of ${totalPages}`;
  document.getElementById('sessionsBtnFirstMobile').disabled = sessionsPage <= 1;
  document.getElementById('sessionsBtnPrevMobile').disabled = sessionsPage <= 1;
  document.getElementById('sessionsBtnNextMobile').disabled = sessionsPage >= totalPages;
  document.getElementById('sessionsBtnLastMobile').disabled = sessionsPage >= totalPages;
}

function goToFirstPage() { if (sessionsPage !== 1) { sessionsPage = 1; applySessionsPagination(); } }
function goToLastPage() {
  const total = sessionTable.data.length;
  const effectiveLimit = sessionsLimit === 99999 ? total : sessionsLimit;
  const totalPages = sessionsLimit === 99999 ? 1 : Math.ceil(total / (effectiveLimit || 1));
  if (sessionsPage !== totalPages) { sessionsPage = totalPages; applySessionsPagination(); }
}
async function changeLimit(newLimit) {
  sessionsLimit = newLimit === 'all' ? 99999 : parseInt(newLimit);
  sessionsPage = 1;
  document.getElementById('sessionsRowsPerPage').value = newLimit;
  document.getElementById('sessionsRowsPerPageMobile').value = newLimit;
  applySessionsPagination();
  await fetch('/api/user-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'liveQuizPageLimit', value: newLimit }),
  });
}
function changePage(delta) {
  const total = sessionTable.data.length;
  const effectiveLimit = sessionsLimit === 99999 ? total : sessionsLimit;
  const totalPages = sessionsLimit === 99999 ? 1 : Math.ceil(total / (effectiveLimit || 1));
  const newPage = sessionsPage + delta;
  if (newPage >= 1 && newPage <= totalPages) { sessionsPage = newPage; applySessionsPagination(); }
}

async function toggleArchive(id, newState) {
  if (isDemo) return showToast('Disabled in demo mode.', 'warning');
  try {
    const res = await fetch(`/api/live-quiz/sessions/${id}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: newState }),
    });
    if (!res.ok) throw new Error('Failed to update.');
    await loadSessions();
    showToast(newState ? 'Session archived' : 'Session restored to active', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteSession(id) {
  if (isDemo) return showToast('Disabled in demo mode.', 'warning');
  const s = currentSessions.find((x) => x.id === id);
  const name = s ? s.name : 'this session';
  if (await confirmAction('Delete Quiz Session', `Delete session '<strong>${esc(name)}</strong>' and all player results? This cannot be undone.`)) {
    try {
      const res = await fetch(`/api/live-quiz/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed.');
      await loadSessions();
      showToast('Session deleted', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
}

// --- Session detail / results view ---

async function openSessionDetail(id) {
  currentDetailSessionId = id;
  playersPage = 1;
  const loaded = await loadSessionDetail(id);
  if (!loaded) return;

  document.getElementById('sessionListView').style.display = 'none';
  document.getElementById('sessionDetailView').style.display = 'block';
  renderPlayersPage();
}

async function loadSessionDetail(id) {
  try {
    const res = await fetch(`/api/live-quiz/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to load session.');
    const data = await res.json();
    currentPlayers = data.players || [];

    document.getElementById('detailSessionName').textContent = data.name;
    const submitted = currentPlayers.filter((p) => p.status === 'submitted').length;
    document.getElementById('detailSummary').textContent = `${submitted} of ${currentPlayers.length} submitted`;
    return true;
  } catch (e) {
    showToast(e.message, 'error');
    return false;
  }
}

async function refreshSessionDetail() {
  const btn = document.getElementById('btnRefreshPlayers');
  btn.disabled = true;
  const loaded = await loadSessionDetail(currentDetailSessionId);
  if (loaded) {
    renderPlayersPage();
    showToast('Player list refreshed', 'success');
  }
  btn.disabled = false;
}

function backToSessionList() {
  document.getElementById('sessionDetailView').style.display = 'none';
  document.getElementById('sessionListView').style.display = 'block';
  loadSessions();
}

function togglePlayersSortBar() {
  const bar = document.getElementById('players-sort-bar');
  const btn = document.getElementById('playersSortToggleBtn');
  const expanded = bar.classList.toggle('sort-expanded');
  btn.classList.toggle('expanded', expanded);
}

function handlePlayerSort(column) {
  if (playerSort.column === column) playerSort.order = playerSort.order === 'asc' ? 'desc' : 'asc';
  else { playerSort.column = column; playerSort.order = 'asc'; }
  fetch('/api/user-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'liveQuizPlayersSort', value: `${playerSort.column}:${playerSort.order}` }),
  }).catch(() => {});
  playersPage = 1;
  renderPlayersPage();
}

function sortedPlayers() {
  return [...currentPlayers].sort((a, b) => {
    let valA, valB;
    if (playerSort.column === 'status') { valA = a.status; valB = b.status; }
    else if (playerSort.column === 'score') {
      valA = a.status === 'submitted' ? a.achieved_score : -1;
      valB = b.status === 'submitted' ? b.achieved_score : -1;
    } else { valA = (a.member_name || '').toLowerCase(); valB = (b.member_name || '').toLowerCase(); }
    if (valA < valB) return playerSort.order === 'asc' ? -1 : 1;
    if (valA > valB) return playerSort.order === 'asc' ? 1 : -1;
    return 0;
  });
}

function updatePlayerSortHeaders() {
  document.querySelectorAll('#playersTable th.sortable').forEach((th) => {
    const icon = th.querySelector('.sort-icon');
    const col = th.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (col === playerSort.column) { if (icon) icon.textContent = playerSort.order === 'asc' ? '▲' : '▼'; }
    else { if (icon) icon.textContent = '⇅'; }
  });
  ['name', 'status', 'score'].forEach((col) => {
    const el = document.getElementById(`mobile-picon-${col}`);
    if (el) el.textContent = col === playerSort.column ? (playerSort.order === 'asc' ? ' ▲' : ' ▼') : '';
  });
}

function renderPlayersPage() {
  updatePlayerSortHeaders();
  const sorted = sortedPlayers();
  const total = sorted.length;
  const effectiveLimit = playersLimit === 99999 ? (total || 1) : playersLimit;
  const totalPages = total === 0 ? 0 : Math.ceil(total / effectiveLimit);
  if (playersPage > totalPages) playersPage = totalPages || 1;
  const start = (playersPage - 1) * effectiveLimit;
  const end = Math.min(start + effectiveLimit, total);
  const pageData = sorted.slice(start, end);

  renderPlayersTableBody(pageData);
  renderPlayersCards(pageData);
  updatePlayersPaginationUI(total, totalPages);
}

function playerRowMarkup(p) {
  const scoreText = p.status === 'submitted' ? `${p.achieved_score} / ${p.max_score}` : '—';
  const submittedText = p.submitted_at ? formatDate(p.submitted_at, true) : '—';
  const canResend = p.status === 'sent' && p.email && !isDemo;
  const canView = p.status === 'submitted';
  return { scoreText, submittedText, canResend, canView };
}

function viewSubmission(playerId) {
  window.open(`quiz-play.html?reviewId=${playerId}`, '_blank');
}

function renderPlayersTableBody(pageData) {
  const tbody = document.getElementById('playersTableBody');
  tbody.innerHTML = '';
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No players invited.</td></tr>';
    return;
  }
  pageData.forEach((p) => {
    const { scoreText, submittedText, canResend, canView } = playerRowMarkup(p);
    const viewBtn = canView
      ? `<button class="btn-icon" onclick="viewSubmission(${p.id})" title="View submitted quiz"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>`
      : '';
    const resendBtn = canResend
      ? `<button class="btn-icon" onclick="resendInvite(${p.id})" title="Resend the invitation email"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z" opacity="0"></path><polyline points="22 6 12 13 2 6"></polyline><path d="M2 6h20v12H2z"></path></svg></button>`
      : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Member">${esc(p.member_name)}</td>
      <td data-label="Status" class="text-center player-status-${p.status}">${p.status === 'submitted' ? 'Submitted' : 'Sent'}</td>
      <td data-label="Score" class="text-center">${scoreText}</td>
      <td data-label="Submitted At" class="text-center">${submittedText}</td>
      <td data-label="Actions" class="text-center">${viewBtn}${resendBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPlayersCards(pageData) {
  const container = document.getElementById('playersCardContainer');
  container.innerHTML = '';
  if (pageData.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No players invited.</p>';
    return;
  }
  pageData.forEach((p) => {
    const { scoreText, submittedText, canResend, canView } = playerRowMarkup(p);
    const card = document.createElement('div');
    card.className = 'table-card';
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${esc(p.member_name)}</span>
        <span class="player-status-${p.status}">${p.status === 'submitted' ? 'Submitted' : 'Sent'}</span>
      </div>
      <div class="card-body">
        <div class="card-row"><span class="card-label">Score:</span><span>${scoreText}</span></div>
        <div class="card-row"><span class="card-label">Submitted:</span><span>${submittedText}</span></div>
      </div>
      ${(canView || canResend) ? `<div class="card-actions">
        ${canView ? `<button class="btn-informative btn-sm" onclick="viewSubmission(${p.id})" title="View submitted quiz">View</button>` : ''}
        ${canResend ? `<button class="btn-primary btn-sm" onclick="resendInvite(${p.id})" title="Resend the invitation email">Resend</button>` : ''}
      </div>` : ''}
    `;
    container.appendChild(card);
  });
}

function updatePlayersPaginationUI(total, totalPages) {
  const show = total > 0;
  const pages = playersLimit === 99999 ? 1 : totalPages;

  document.getElementById('playersPaginationControls').style.display = show ? 'flex' : 'none';
  document.getElementById('playersPageInfo').textContent = `${playersPage} of ${pages || 1}`;
  document.getElementById('playersBtnFirst').disabled = playersPage <= 1;
  document.getElementById('playersBtnPrev').disabled = playersPage <= 1;
  document.getElementById('playersBtnNext').disabled = playersPage >= pages;
  document.getElementById('playersBtnLast').disabled = playersPage >= pages;

  document.getElementById('playersPaginationControlsMobile').style.display = show ? 'flex' : 'none';
  document.getElementById('playersPageInfoMobile').textContent = `${playersPage} of ${pages || 1}`;
  document.getElementById('playersBtnFirstMobile').disabled = playersPage <= 1;
  document.getElementById('playersBtnPrevMobile').disabled = playersPage <= 1;
  document.getElementById('playersBtnNextMobile').disabled = playersPage >= pages;
  document.getElementById('playersBtnLastMobile').disabled = playersPage >= pages;
}

function goToFirstPlayersPage() { if (playersPage !== 1) { playersPage = 1; renderPlayersPage(); } }
function goToLastPlayersPage() {
  const total = currentPlayers.length;
  const effectiveLimit = playersLimit === 99999 ? total : playersLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  if (playersPage !== totalPages) { playersPage = totalPages; renderPlayersPage(); }
}
function changePlayersPage(delta) {
  const total = currentPlayers.length;
  const effectiveLimit = playersLimit === 99999 ? total : playersLimit;
  const totalPages = effectiveLimit > 0 ? Math.ceil(total / effectiveLimit) : 1;
  const newPage = playersPage + delta;
  if (newPage >= 1 && newPage <= totalPages) { playersPage = newPage; renderPlayersPage(); }
}
async function changePlayersLimit(newLimit) {
  playersLimit = newLimit === 'all' ? 99999 : parseInt(newLimit);
  playersPage = 1;
  document.getElementById('playersRowsPerPage').value = newLimit;
  document.getElementById('playersRowsPerPageMobile').value = newLimit;
  renderPlayersPage();
  await fetch('/api/user-preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'liveQuizPlayersPageLimit', value: newLimit }),
  });
}

async function resendInvite(playerId) {
  if (isDemo) return showToast('Disabled in demo mode.', 'warning');
  try {
    const res = await fetch(`/api/live-quiz/sessions/${currentDetailSessionId}/players/${playerId}/send`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to resend.');
    showToast('Invitation resent', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const scrollTopBtn = document.getElementById('scrollTopBtn');
window.onscroll = function () {
  if (scrollTopBtn) scrollTopBtn.style.display = (window.scrollY > 200) ? 'flex' : 'none';
};
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

initPage();
