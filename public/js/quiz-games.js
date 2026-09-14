// public/js/quiz-games.js

// --- Mobile two-screen navigation (shared pattern with Forms/Surveys managers) ---
function openMobileEditor() {
  document.querySelector('.manager-container')?.classList.add('mobile-editor-open');
}
function closeMobileEditor() {
  document.querySelector('.manager-container')?.classList.remove('mobile-editor-open');
}
async function mobileBackToList() {
  if (!(await checkDirty())) return;
  closeMobileEditor();
}

let games = [];
let currentGame = null;
let currentQuestions = [];
let originalGameState = null;
let gameSortMode = 'name_asc';
let uiConfig = null;

// Fixed number/colour convention for the 4 timed-game answer slots (positional, not
// stored) — 1 Green, 2 Light Blue, 3 Red, 4 Yellow. Kept consistent from the builder
// through to the eventual Kahoot-style player buttons so each slot stays recognisable.
const TIMED_OPTION_COLORS = ['#43a047', '#2196f3', '#e53935', '#fbc02d'];

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function toggleGameSort() {
  const btn = document.getElementById('btnSortGames');
  switch (gameSortMode) {
    case 'name_asc':
      gameSortMode = 'name_desc';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`;
      btn.title = 'Sort by Name (Z-A)';
      break;
    case 'name_desc':
      gameSortMode = 'status_active';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
      btn.title = 'Sort by Status (Active First)';
      break;
    case 'status_active':
      gameSortMode = 'status_disabled';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
      btn.title = 'Sort by Status (Disabled First)';
      break;
    default:
      gameSortMode = 'name_asc';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18H3M21 6H3M17 12H3"/></svg>`;
      btn.title = 'Sort by Name (A-Z)';
      break;
  }
  renderGameList();
}

document.addEventListener('DOMContentLoaded', () => {
  fetch('/ui-config')
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle('Quiz Games', 'Quiz Games');
      if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
    });

  fetch('/api/user-session')
    .then((r) => r.json())
    .then((user) => {
      const role = user.role || 'guest';
      if (role !== 'admin' && role !== 'superadmin') {
        if (window.showToast) showToast('Access Denied.', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        loadGames();
      }
    })
    .catch(() => (window.location.href = '/login.html'));

  const canvas = document.getElementById('questionsCanvas');
  new Sortable(canvas, { handle: '.drag-handle', animation: 150 });
});

// --- Data extraction from the DOM (mirrors forms-manage.js getFormData) ---

function getGameData() {
  const name = document.getElementById('gameName').value;
  const description = document.getElementById('gameDescription').value;
  const game_type = document.getElementById('gameType').value;
  const enabled = document.getElementById('gameStatusToggle').checked;

  const questions = Array.from(document.querySelectorAll('.field-card')).map((card) => {
    const id = card.getAttribute('data-id');
    const type = card.getAttribute('data-type');
    const desc = card.querySelector('.q-desc')?.value || '';
    const requiredEl = card.querySelector('.field-required-check');
    const required = requiredEl ? requiredEl.checked : true;

    const pointsEl = card.querySelector('.field-points');
    const timeLimitEl = card.querySelector('.field-timelimit');

    let options = [];
    let renderAs = card.querySelector('.field-render-as')?.value || 'radio';
    let correctAnswer = null;

    if (type === 'radio' || type === 'checkboxes') {
      const rows = card.querySelectorAll('.option-row');
      options = Array.from(rows).map((r) => r.querySelector('.option-input').value);
      if (type === 'radio') {
        const selected = Array.from(rows).find((r) => r.querySelector('.correct-mark-radio')?.checked);
        correctAnswer = selected ? selected.querySelector('.option-input').value : null;
      } else {
        correctAnswer = Array.from(rows)
          .filter((r) => r.querySelector('.correct-mark-cb')?.checked)
          .map((r) => r.querySelector('.option-input').value);
      }
    } else if (type === 'boolean') {
      const selected = card.querySelector('.bool-correct:checked');
      correctAnswer = selected ? selected.value : null;
    } else if (type === 'text_multi') {
      correctAnswer = card.querySelector('.reference-answer-input')?.value || '';
    }

    const question = { id, type, description: desc, required, options, renderAs, correctAnswer };
    if (pointsEl) question.points = parseFloat(pointsEl.value) || 0;
    if (timeLimitEl) question.timeLimitSeconds = parseInt(timeLimitEl.value) || 20;
    return question;
  });

  return { name, description, game_type, enabled, questions };
}

function isGameDirty() {
  if (!originalGameState) return false;
  return JSON.stringify(getGameData()) !== JSON.stringify(originalGameState);
}

async function checkDirty() {
  if (isGameDirty()) {
    return confirmAction('Unsaved Changes', `You have unsaved changes in "${currentGame.name || 'New Game'}".\n\nDo you want to discard them?`);
  }
  return true;
}

// --- API interactions ---

async function loadGames() {
  try {
    const res = await fetch('/api/quiz/games');
    if (!res.ok) throw new Error('Failed to load');
    games = await res.json();
    renderGameList();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveGame() {
  if (uiConfig?.appMode === 'demo') return showToast('Saving is disabled in Demo Mode', 'warning');
  const data = getGameData();
  if (!data.name.trim()) return showToast('Game name is required.', 'error');

  const method = currentGame && currentGame.id ? 'PUT' : 'POST';
  const url = currentGame && currentGame.id ? `/api/quiz/games/${currentGame.id}` : '/api/quiz/games';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const responseData = await res.json();
    if (!res.ok) {
      const reason = responseData.details ? responseData.details.join(' | ') : responseData.error || 'Unknown error';
      throw new Error(reason);
    }
    if (method === 'POST' && responseData.id) currentGame.id = responseData.id;

    showToast('Quiz game saved successfully', 'success');
    originalGameState = getGameData();
    loadGames();
  } catch (e) {
    showToast('Save Failed: ' + e.message, 'error');
  }
}

async function updateEnabled(id) {
  if (uiConfig?.appMode === 'demo') {
    const toggle = document.getElementById('gameStatusToggle');
    if (toggle) toggle.checked = !toggle.checked;
    return showToast('Status changes disabled in Demo Mode', 'warning');
  }
  try {
    const res = await fetch(`/api/quiz/games/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Server rejected status update');
    await loadGames();
    if (currentGame && currentGame.id === id) {
      const g = games.find((x) => x.id === id);
      if (g) {
        currentGame.enabled = g.enabled;
        document.getElementById('gameStatusToggle').checked = g.enabled;
        if (originalGameState) originalGameState.enabled = g.enabled;
      }
    }
    showToast('Game updated', 'success');
  } catch (e) {
    showToast('Update Failed: ' + e.message, 'error');
    loadGames();
  }
}

async function previewGame() {
  if (isGameDirty()) {
    const doSave = await confirmAction('Unsaved Changes', 'You have unsaved changes.\n\nSave now to see them in the preview?');
    if (doSave) {
      await saveGame();
      if (isGameDirty()) return;
    } else {
      return;
    }
  }
  if (!currentGame || !currentGame.id) return showToast('Please save the game first.', 'warning');
  window.open(`quiz-preview.html?id=${currentGame.id}`, '_blank');
}

// --- Start Single (individual play, both game types) ---

let allActiveMembers = [];

async function openSessionModal() {
  if (isGameDirty()) return showToast('Please save your changes before starting a session.', 'warning');
  if (!currentGame || !currentGame.id) return showToast('Please save the game first.', 'warning');
  if (!currentGame.questions || currentGame.questions.length === 0) {
    return showToast('Add at least one question before starting a session.', 'warning');
  }

  document.getElementById('sessionModalTitle').innerText = `Start Single: ${currentGame.name}`;
  document.getElementById('sessionModalIntro').textContent = currentGame.game_type === 'timed'
    ? 'Starts an individual timed session from this game and sends each selected member their own access code by email. Members without an email can be given their code to type in on the spot. Each question is played against the clock, scored on speed and correctness.'
    : 'Starts a self-paced session from this game and sends each selected member their own access code by email. Members without an email can be given their code to type in on the spot.';
  document.getElementById('btnConfirmSession').disabled = false;
  document.getElementById('btnConfirmSession').innerText = 'Start & Send';
  document.querySelector('input[name="sessionTarget"][value="all"]').checked = true;
  toggleSessionSelection();
  openModal('sessionModal');

  if (allActiveMembers.length === 0) {
    try {
      const res = await fetch('/api/members');
      const members = await res.json();
      allActiveMembers = members.filter((m) => m.enabled === true);
      allActiveMembers.sort((a, b) => {
        const pA = window.getRankPriority ? window.getRankPriority(a.rank || a.name) : 99;
        const pB = window.getRankPriority ? window.getRankPriority(b.rank || b.name) : 99;
        if (pA !== pB) return pA - pB;
        const sA = (a.last_name || a.name || '').toLowerCase();
        const sB = (b.last_name || b.name || '').toLowerCase();
        return sA.localeCompare(sB);
      });
    } catch (e) {
      console.error('Failed to load members', e);
    }
  }

  const container = document.getElementById('sessionSelectionContainer');
  container.innerHTML = '';
  allActiveMembers.forEach((m) => {
    const displayName = window.formatMemberName ? window.formatMemberName(m.rank, m.last_name, m.first_name, m.name) : m.name;
    const rankSpan = m.rank ? `<span style="min-width:38px; font-size:0.78em; font-weight:700; color:var(--primary-purple,#4b0082); flex-shrink:0;">${esc(m.rank)}</span>` : '';
    const li = document.createElement('label');
    li.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px; cursor:pointer; border-bottom:1px solid rgba(0,0,0,0.05);';
    li.innerHTML = `<input type="checkbox" class="session-member-checkbox" value="${m.id}" checked title="Include ${esc(displayName)} in this session">${rankSpan}<span style="font-weight:500;">${esc(displayName)}</span>`;
    container.appendChild(li);
  });
}

function toggleSessionSelection() {
  const isSelection = document.querySelector('input[name="sessionTarget"][value="selection"]').checked;
  const container = document.getElementById('sessionSelectionContainer');
  container.style.display = isSelection ? 'block' : 'none';
  document.querySelectorAll('.session-member-checkbox').forEach((cb) => (cb.checked = !isSelection));
}

async function confirmStartSession() {
  if (uiConfig?.appMode === 'demo') return showToast('Starting a session is disabled in Demo Mode', 'warning');

  const isSelection = document.querySelector('input[name="sessionTarget"][value="selection"]').checked;
  const memberIds = [];
  if (isSelection) {
    document.querySelectorAll('.session-member-checkbox').forEach((cb) => { if (cb.checked) memberIds.push(parseInt(cb.value, 10)); });
    if (memberIds.length === 0) return showToast('Please select at least one member.', 'warning');
  } else {
    allActiveMembers.forEach((m) => memberIds.push(m.id));
  }

  const btn = document.getElementById('btnConfirmSession');
  btn.disabled = true;
  btn.innerText = 'Starting...';

  try {
    showGlobalSpinner('Starting quiz session...');
    const res = await fetch('/api/live-quiz/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: currentGame.id, memberIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start session.');

    closeModal('sessionModal');
    btn.disabled = false;
    btn.innerText = 'Start & Send';

    const withEmail = (data.players || []).filter((p) => p.email);
    if (withEmail.length === 0) {
      hideGlobalSpinner();
      showToast(`Session started with ${data.players.length} player(s). View codes in Live Quiz.`, 'success');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < withEmail.length; i++) {
      const p = withEmail[i];
      updateGlobalSpinnerMessage(`Sending invitations... ${i + 1} of ${withEmail.length}`, `Sending to: ${p.member_name}`);
      await new Promise((r) => requestAnimationFrame(r));
      try {
        const r = await fetch(`/api/live-quiz/sessions/${data.sessionId}/players/${p.id}/send`, { method: 'POST' });
        if (r.ok) successCount++;
        else failCount++;
      } catch (_) {
        failCount++;
      }
    }

    hideGlobalSpinner();
    if (failCount === 0) showToast(`Session started and ${successCount} invitation${successCount !== 1 ? 's' : ''} sent.`, 'success');
    else showToast(`Session started. Sent: ${successCount}, failed: ${failCount}.`, 'warning');
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.innerText = 'Start & Send';
    hideGlobalSpinner();
  }
}

// --- Start Teams (Phase 3 — team setup for both game types) ---

let teamColumnCount = 0;

async function openTeamSetupModal() {
  if (isGameDirty()) return showToast('Please save your changes before setting up teams.', 'warning');
  if (!currentGame || !currentGame.id) return showToast('Please save the game first.', 'warning');
  if (!currentGame.questions || currentGame.questions.length === 0) {
    return showToast('Add at least one question before setting up teams.', 'warning');
  }

  document.getElementById('teamSetupModalTitle').innerText = `Start Teams: ${currentGame.name}`;
  document.getElementById('teamSetupIntro').textContent = currentGame.game_type === 'timed'
    ? "Drag members from the unassigned pool into a team. Each team gets one access code — the captain's device plays the timed round against the clock, and the score is attributed to the team."
    : "Drag members from the unassigned pool into a team. Each team gets one access code — the whole team answers together on the captain's device, and the score is attributed to the team.";
  document.getElementById('teamSetupError').textContent = '';
  document.getElementById('teamColumnsContainer').innerHTML = '';
  teamColumnCount = 0;

  if (allActiveMembers.length === 0) {
    try {
      const res = await fetch('/api/members');
      const members = await res.json();
      allActiveMembers = members.filter((m) => m.enabled === true);
      allActiveMembers.sort((a, b) => {
        const pA = window.getRankPriority ? window.getRankPriority(a.rank || a.name) : 99;
        const pB = window.getRankPriority ? window.getRankPriority(b.rank || b.name) : 99;
        if (pA !== pB) return pA - pB;
        const sA = (a.last_name || a.name || '').toLowerCase();
        const sB = (b.last_name || b.name || '').toLowerCase();
        return sA.localeCompare(sB);
      });
    } catch (e) {
      console.error('Failed to load members', e);
    }
  }

  const pool = document.getElementById('teamPool');
  pool.innerHTML = '';
  allActiveMembers.forEach((m) => pool.appendChild(buildTeamMemberChip(m)));
  new Sortable(pool, { group: 'teamMembers', animation: 150, onEnd: updateTeamCounts });

  addTeamColumn('Team 1');
  addTeamColumn('Team 2');

  const sidebar = document.getElementById('osm-sidebar-container');
  document.getElementById('teamSetupModal').classList.toggle('sidebar-collapsed', !sidebar || sidebar.classList.contains('collapsed'));

  openModal('teamSetupModal');
}

function buildTeamMemberChip(m) {
  const displayName = window.formatMemberName ? window.formatMemberName(m.rank, m.last_name, m.first_name, m.name) : m.name;
  const chip = document.createElement('div');
  chip.className = 'team-member-chip';
  chip.dataset.memberId = m.id;
  chip.innerHTML = `<span>${esc(displayName)}</span>`;
  return chip;
}

function addTeamColumn(defaultName) {
  teamColumnCount++;
  const col = document.createElement('div');
  col.className = 'team-column';
  col.innerHTML = `
    <div class="team-column-header">
      <input type="text" class="team-name-input" value="${esc(defaultName || `Team ${teamColumnCount}`)}" title="Team name" placeholder="Team name">
      <span class="team-count-badge">0</span>
      <button class="btn-icon delete" onclick="removeTeamColumn(this)" title="Remove this team" style="flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="team-member-list" style="flex-grow:1; overflow-y:auto; padding:8px;"></div>
  `;
  document.getElementById('teamColumnsContainer').appendChild(col);
  const list = col.querySelector('.team-member-list');
  new Sortable(list, { group: 'teamMembers', animation: 150, onEnd: updateTeamCounts });
}

function removeTeamColumn(btn) {
  const col = btn.closest('.team-column');
  const pool = document.getElementById('teamPool');
  col.querySelectorAll('.team-member-chip').forEach((chip) => pool.appendChild(chip));
  col.remove();
  updateTeamCounts();
}

function updateTeamCounts() {
  document.querySelectorAll('#teamColumnsContainer .team-column').forEach((col) => {
    const count = col.querySelectorAll('.team-member-chip').length;
    col.querySelector('.team-count-badge').textContent = count;
  });
}

async function confirmTeamSetup() {
  if (uiConfig?.appMode === 'demo') return showToast('Setting up teams is disabled in Demo Mode', 'warning');

  const errorEl = document.getElementById('teamSetupError');
  errorEl.textContent = '';

  const columns = Array.from(document.querySelectorAll('#teamColumnsContainer .team-column'));
  if (columns.length < 2) {
    errorEl.textContent = 'At least 2 teams are required.';
    return;
  }

  const teams = columns.map((col) => ({
    name: col.querySelector('.team-name-input').value.trim(),
    memberIds: Array.from(col.querySelectorAll('.team-member-chip')).map((chip) => parseInt(chip.dataset.memberId, 10)),
  }));

  if (teams.some((t) => !t.name)) {
    errorEl.textContent = 'Every team needs a name.';
    return;
  }
  if (teams.some((t) => t.memberIds.length === 0)) {
    errorEl.textContent = 'Every team needs at least one member.';
    return;
  }

  const btn = document.getElementById('btnConfirmTeamSetup');
  btn.disabled = true;
  btn.innerText = 'Starting...';

  try {
    const res = await fetch('/api/live-quiz/team-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: currentGame.id, teams }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to setup teams.');

    closeModal('teamSetupModal');
    showToast(`Team session started with ${data.teams.length} teams — ready to play now. View codes in Live Quiz.`, 'success');
  } catch (e) {
    errorEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.innerText = 'Start Team Session';
  }
}

// --- Scoring simulator (score-based games only) ---

function testScoring() {
  const data = getGameData();
  const container = document.getElementById('testGameContainer');
  const banner = document.getElementById('testResultBanner');
  banner.style.display = 'none';
  container.innerHTML = '';

  if (data.questions.length === 0) return showToast('Add some questions first!', 'warning');

  data.questions.forEach((q, index) => {
    const div = document.createElement('div');
    div.style.marginBottom = '20px';
    div.style.paddingBottom = '15px';
    div.style.borderBottom = '1px solid #eee';

    let html = `<div style="font-weight:bold; margin-bottom:10px;">${index + 1}. ${esc(q.description)} <span style="color:#666; font-size:0.8em;">(${q.points} pts)</span></div>`;

    if (q.type === 'radio' || q.type === 'boolean') {
      const options = q.type === 'boolean' ? ['Yes', 'No'] : q.options;
      options.forEach((opt) => {
        html += `<label style="display:block; margin:5px 0; cursor:pointer;"><input type="radio" name="test_${q.id}" value="${esc(opt)}"> ${esc(opt)}</label>`;
      });
    } else if (q.type === 'checkboxes') {
      q.options.forEach((opt) => {
        html += `<label style="display:block; margin:5px 0; cursor:pointer;"><input type="checkbox" name="test_${q.id}" value="${esc(opt)}"> ${esc(opt)}</label>`;
      });
    } else {
      html += `<div style="font-style:italic; color:#999;">Paragraph questions are excluded from auto-scoring.</div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
  });

  openModal('testScoringModal');
}

function runQuizScoringSimulation() {
  const data = getGameData();
  let achieved = 0;
  let maximum = 0;

  data.questions.forEach((q) => {
    const weight = parseFloat(q.points) || 0;
    maximum += weight;

    const inputs = document.getElementsByName(`test_${q.id}`);
    const selected = Array.from(inputs).filter((i) => i.checked).map((i) => i.value);

    if (q.type === 'radio' || q.type === 'boolean') {
      if (selected[0] === q.correctAnswer) achieved += weight;
    } else if (q.type === 'checkboxes') {
      const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      if (correctArr.length === 0) return;
      const pointsPerOption = weight / correctArr.length;
      let qScore = 0;
      selected.forEach((val) => {
        if (correctArr.includes(val)) qScore += pointsPerOption;
        else qScore -= pointsPerOption;
      });
      achieved += Math.max(0, qScore);
    }
  });

  const banner = document.getElementById('testResultBanner');
  const scoreText = document.getElementById('testScoreText');
  const pct = maximum > 0 ? (achieved / maximum) * 100 : 0;

  banner.style.display = 'block';
  banner.style.background = 'var(--bg-card)';
  banner.style.border = '1px solid var(--border-color)';
  scoreText.textContent = `Score: ${achieved.toFixed(2)} / ${maximum.toFixed(2)} (${pct.toFixed(1)}%)`;
}

// --- Import / Export (single game) ---

function exportSingleGame() {
  if (currentGame && currentGame.id) {
    window.location.href = `/api/quiz/games/${currentGame.id}/export`;
  } else {
    const data = getGameData();
    const filename = `quiz_game_export_${(data.name || 'game').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function importSingleGame(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.name || !Array.isArray(data.questions)) throw new Error('Invalid quiz game format');

      loadEditor({
        ...currentGame,
        name: data.name,
        description: data.description || '',
        game_type: data.game_type || (currentGame ? currentGame.game_type : 'score'),
        questions: data.questions,
      });
      showToast('Quiz game imported into editor. Click Save to persist.', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function deleteGame() {
  if (!currentGame || !currentGame.id) return;
  if (uiConfig?.appMode === 'demo') return showToast('Deletion disabled in Demo Mode', 'warning');

  if (!(await confirmAction('Delete Quiz Game', `Delete quiz game '<strong>${esc(currentGame.name)}</strong>' and all its questions?`))) return;

  try {
    const res = await fetch(`/api/quiz/games/${currentGame.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');

    showToast('Quiz game deleted', 'success');
    currentGame = null;
    originalGameState = null;
    document.getElementById('builderPanel').style.display = 'none';
    document.getElementById('emptyPanel').style.display = 'flex';
    closeMobileEditor();
    loadGames();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// --- UI rendering: sidebar list ---

function renderGameList() {
  const list = document.getElementById('gameList');
  list.innerHTML = '';

  const sorted = [...games].sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    switch (gameSortMode) {
      case 'name_asc': return nameA.localeCompare(nameB);
      case 'name_desc': return nameB.localeCompare(nameA);
      case 'status_active':
        if (a.enabled !== b.enabled) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
        return nameA.localeCompare(nameB);
      case 'status_disabled':
        if (a.enabled !== b.enabled) return (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
        return nameA.localeCompare(nameB);
      default: return 0;
    }
  });

  sorted.forEach((g) => {
    const item = document.createElement('div');
    item.className = `form-item ${currentGame && currentGame.id === g.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="form-info">
        <div class="form-name">${esc(g.name)}</div>
        <span class="type-badge ${g.game_type}">${g.game_type === 'timed' ? 'Timed' : 'Score-based'}</span>
        <span style="font-size:0.8em; color:var(--text-muted); margin-left:6px;">${g.questionCount} question${g.questionCount === 1 ? '' : 's'}</span>
      </div>
      <label class="switch" onclick="event.stopPropagation();" title="Toggle enabled state for this game">
        <input type="checkbox" ${g.enabled ? 'checked' : ''} onchange="quickToggle(${g.id})">
        <span class="slider"></span>
      </label>
    `;
    item.onclick = () => selectGame(g.id);
    list.appendChild(item);
  });
}

async function quickToggle(id) {
  if (uiConfig?.appMode === 'demo') { showToast('Status changes disabled in Demo Mode', 'warning'); return renderGameList(); }
  try {
    const res = await fetch(`/api/quiz/games/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Server rejected status update');
    await loadGames();
  } catch (e) {
    showToast('Update Failed: ' + e.message, 'error');
    loadGames();
  }
}

async function createNewGame() {
  if (document.getElementById('builderPanel').style.display === 'flex') {
    if (!(await checkDirty())) return;
  }
  loadEditor({ name: 'New Quiz Game', description: '', game_type: 'score', enabled: true, questions: [] });
}

async function selectGame(id) {
  if (currentGame && currentGame.id === id) return;
  if (document.getElementById('builderPanel').style.display === 'flex') {
    if (!(await checkDirty())) return;
  }
  try {
    const res = await fetch(`/api/quiz/games/${id}`);
    if (!res.ok) throw new Error('Failed to load game');
    loadEditor(await res.json());
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function loadEditor(game) {
  currentGame = game;
  currentQuestions = game.questions || [];

  document.getElementById('emptyPanel').style.display = 'none';
  document.getElementById('builderPanel').style.display = 'flex';

  const nameInput = document.getElementById('gameName');
  nameInput.value = game.name || '';
  nameInput.style.height = '';
  nameInput.style.height = nameInput.scrollHeight + 'px';
  document.getElementById('gameDescription').value = game.description || '';
  document.getElementById('gameType').value = game.game_type || 'score';
  document.getElementById('gameStatusToggle').checked = !!game.enabled;

  applyGameTypeUI();
  renderQuestions();
  renderGameList();

  openMobileEditor();
  setTimeout(() => { originalGameState = getGameData(); }, 300);
}

// --- Game type switch (locked once questions exist) ---

function applyGameTypeUI() {
  const type = document.getElementById('gameType').value;
  const select = document.getElementById('gameType');
  select.disabled = currentQuestions.length > 0;
  select.title = currentQuestions.length > 0
    ? 'Remove all questions to change the game type'
    : 'Score mode: self-paced, points per question — basically a form. Timed mode: live, 4-choice, speed-scored.';

  document.getElementById('scoreToolbox').style.display = type === 'timed' ? 'none' : 'flex';
  document.getElementById('timedToolbox').style.display = type === 'timed' ? 'flex' : 'none';
  document.getElementById('summaryLabel').textContent = type === 'timed' ? 'Total Time' : 'Max Score Achievable';
  document.getElementById('summaryUnit').textContent = type === 'timed' ? 'Seconds' : 'Points';

  // Preview & Test simulate the score-weighting UI and aren't meaningful for
  // Timed games' 4-choice/time-limit format.
  document.getElementById('btnPreview').style.display = type === 'timed' ? 'none' : 'inline-block';
  document.getElementById('btnTest').style.display = type === 'timed' ? 'none' : 'inline-block';
  // Start Single and Start Teams are available for both game types. Score-based
  // games are self-paced (answer whenever, submit once). Timed games are always
  // played against the clock, one question at a time with a visible countdown,
  // scored on speed + correctness — whether solo or as one team on one device.
  document.getElementById('btnStartSession').style.display = 'inline-block';
  document.getElementById('btnSetupTeams').style.display = 'inline-block';
}

function onGameTypeChange() {
  applyGameTypeUI();
  updateSummary();
}

// --- Questions canvas ---

function cleanupQuestionsCanvas() {
  document.getElementById('questionsCanvas').innerHTML = '';
}

function renderQuestions() {
  cleanupQuestionsCanvas();
  currentQuestions.forEach((q) => renderQuestionItem(q));
  updateSummary();
}

function addQuestion(type) {
  const gameType = document.getElementById('gameType').value;
  const newQuestion = {
    id: 'fld_' + Date.now().toString(36),
    type: gameType === 'timed' ? 'radio' : type,
    description: '',
    required: true,
    options: (gameType === 'timed') ? ['', '', '', ''] : (type === 'radio' || type === 'checkboxes' ? ['Option 1'] : []),
    renderAs: 'radio',
    correctAnswer: null,
  };
  currentQuestions.push(newQuestion);
  renderQuestionItem(newQuestion);
  applyGameTypeUI();

  setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100);
  updateSummary();
}

function renderQuestionItem(q) {
  const canvas = document.getElementById('questionsCanvas');
  const div = document.createElement('div');
  div.className = 'field-card expanded';
  div.setAttribute('data-id', q.id);
  div.setAttribute('data-type', q.type);

  const isTimed = document.getElementById('gameType').value === 'timed';
  const typeLabels = { text_multi: 'Paragraph', radio: 'Single Choice', checkboxes: 'Checkboxes', boolean: 'Yes/No' };
  const badgeText = isTimed ? '4-Choice' : (typeLabels[q.type] || q.type);

  let headerControls = '';
  if (isTimed) {
    headerControls = `
      <span style="font-size:12px; font-weight:bold; color:var(--text-muted);">Time Limit (sec):</span>
      <input type="number" class="field-timelimit" value="${q.timeLimitSeconds || 20}" min="5" max="300" style="width:60px; padding:2px 5px; margin-left:5px;" title="Seconds allowed to answer this question">
    `;
  } else {
    const isReq = q.required !== false ? 'checked' : '';
    headerControls = `
      <label class="switch" style="margin-bottom:0 !important;" title="Whether this question must be answered"><input type="checkbox" class="field-required-check" ${isReq}><span class="slider"></span></label>
      <span style="font-size:12px; font-weight:bold; color:var(--text-muted); margin-left:8px;">Required</span>
      <span style="margin-left:20px; font-size:12px; font-weight:bold; color:var(--text-muted);">Points:</span>
      <input type="number" class="field-points" value="${q.points || 1}" min="0" style="width:50px; padding:2px 5px; margin-left:5px;" title="Points awarded for a correct answer">
    `;
  }

  let html = `
    <div class="field-header" onclick="toggleQuestionCard(this)">
      <span class="drag-handle" title="Drag to reorder">☰</span>
      <span class="field-type-badge">${esc(badgeText)}</span>
      <div class="header-controls" onclick="event.stopPropagation()">${headerControls}</div>
      <span style="flex:1;"></span>
      <button type="button" class="btn-icon delete" onclick="removeQuestion(event, '${q.id}')" title="Remove this question" style="margin-right:15px; color:#dc3545;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
      </button>
      <span class="arrow-icon">▼</span>
    </div>
    <div class="field-body" style="padding: 25px;">
      <div class="form-group">
        <label>Question Text</label>
        <textarea class="q-desc" rows="2" style="width:100%; box-sizing:border-box; padding:10px; border:1px solid var(--border-color); border-radius:4px; resize:vertical;" title="The question shown to players"></textarea>
      </div>`;

  if (q.type === 'radio' || q.type === 'checkboxes') {
    if (q.type === 'radio' && !isTimed) {
      const selRadio = !q.renderAs || q.renderAs === 'radio' ? 'selected' : '';
      const selDropdown = q.renderAs === 'dropdown' ? 'selected' : '';
      html += `
        <div class="form-group">
          <label style="color:var(--text-muted); font-size:13px;">Display Style:</label>
          <select class="field-render-as" style="padding:8px; border-radius:4px; border:1px solid #ccc; background:var(--input-bg); color:var(--text-main); width:200px;">
            <option value="radio" ${selRadio}>Radio Buttons</option>
            <option value="dropdown" ${selDropdown}>Dropdown Menu</option>
          </select>
        </div>`;
    }

    const correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
    html += `
      <div class="form-group">
        <label>Options ${isTimed ? '(4 fixed choices — mark the correct one)' : '(Select correct answer mark)'}</label>
        <div class="options-container">`;
    const opts = (q.options && q.options.length > 0) ? q.options : (isTimed ? ['', '', '', ''] : ['Option 1']);
    opts.forEach((opt, idx) => {
      html += generateOptionRow(q.type, q.id, correctAnswers.includes(opt), idx);
    });
    html += `</div>`;
    if (!isTimed) {
      html += `<button type="button" class="btn-sm" style="margin-top:15px; background-color:#6c757d;" onclick="addOptionRow(this)">+ Add Option</button>`;
    }
    html += `</div>`;
  } else if (q.type === 'boolean') {
    const selRadio = !q.renderAs || q.renderAs === 'radio' ? 'selected' : '';
    const selDropdown = q.renderAs === 'dropdown' ? 'selected' : '';
    html += `
      <div class="form-group">
        <label style="color:var(--text-muted); font-size:13px;">Display Style:</label>
        <select class="field-render-as" style="padding:8px; border-radius:4px; border:1px solid #ccc; background:var(--input-bg); color:var(--text-main); width:200px;">
          <option value="radio" ${selRadio}>Radio Buttons</option>
          <option value="dropdown" ${selDropdown}>Dropdown Menu</option>
        </select>
      </div>
      <div class="form-group">
        <label>Correct Answer:</label>
        <div class="bool-correct-wrapper">
          <label style="font-weight:normal; margin-bottom:0 !important; cursor:pointer;"><input type="radio" name="bool_correct_${q.id}" class="bool-correct" value="Yes" ${q.correctAnswer === 'Yes' ? 'checked' : ''}> Yes</label>
          <label style="font-weight:normal; margin-bottom:0 !important; cursor:pointer;"><input type="radio" name="bool_correct_${q.id}" class="bool-correct" value="No" ${q.correctAnswer === 'No' ? 'checked' : ''}> No</label>
        </div>
      </div>`;
  } else if (q.type === 'text_multi') {
    html += `
      <div class="form-group">
        <label>Expected/Reference Answer (Admin Use)</label>
        <textarea class="reference-answer-input" rows="3" style="width:100%; box-sizing:border-box; padding:12px; border-radius:4px; border:1px solid #ccc;" placeholder="Provide reference text for evaluation..."></textarea>
      </div>`;
  }

  html += `</div>`;
  div.innerHTML = html;
  canvas.appendChild(div);

  // Assign values via .value (not innerHTML) to avoid HTML-escaping concerns for user text
  div.querySelector('.q-desc').value = q.description || '';
  const refInput = div.querySelector('.reference-answer-input');
  if (refInput) refInput.value = q.correctAnswer || '';
  const optionInputs = div.querySelectorAll('.option-input');
  const optValues = (q.options && q.options.length > 0) ? q.options : (isTimed ? ['', '', '', ''] : ['Option 1']);
  optionInputs.forEach((inp, i) => { inp.value = optValues[i] || ''; });

  const pointsInput = div.querySelector('.field-points');
  if (pointsInput) pointsInput.addEventListener('input', updateSummary);
  const timeLimitInput = div.querySelector('.field-timelimit');
  if (timeLimitInput) timeLimitInput.addEventListener('input', updateSummary);
}

function generateOptionRow(type, questionId, isCorrect, index) {
  const markerType = type === 'radio' ? 'radio' : 'checkbox';
  const markerClass = type === 'radio' ? 'correct-mark-radio' : 'correct-mark-cb';
  const checked = isCorrect ? 'checked' : '';
  const groupName = `correct_marker_${questionId}`;
  const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  const isTimed = document.getElementById('gameType').value === 'timed';

  // Fixed number/colour badge for timed games — matches the eventual player button
  // for this slot, so the mapping is recognisable right from the builder.
  const badge = (isTimed && typeof index === 'number')
    ? `<span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:${TIMED_OPTION_COLORS[index]}; color:#fff; font-weight:700; font-size:0.85em; flex-shrink:0;" title="Player button ${index + 1}">${index + 1}</span>`
    : '';

  return `
    <div class="option-row">
      ${badge}
      <input type="${markerType}" name="${groupName}" class="${markerClass}" ${checked} title="Mark as correct" style="width:18px; height:18px; cursor:pointer; flex-shrink:0;">
      <input type="text" class="option-input" placeholder="Option label" title="Answer choice text" style="flex:1;">
      ${isTimed ? '' : `<button type="button" class="btn-icon delete" onclick="this.parentElement.remove()" style="color:#dc3545; flex-shrink:0;" title="Remove option">${deleteIcon}</button>`}
    </div>
  `;
}

window.addOptionRow = function (btn) {
  const card = btn.closest('.field-card');
  const type = card.getAttribute('data-type');
  const questionId = card.getAttribute('data-id');
  const container = card.querySelector('.options-container');

  const div = document.createElement('div');
  div.innerHTML = generateOptionRow(type, questionId, false);
  container.appendChild(div.firstElementChild);
};

window.toggleAllQuestions = function () {
  const cards = document.querySelectorAll('.field-card');
  const btnIcon = document.getElementById('iconToggleAll');
  const anyCollapsed = Array.from(cards).some((c) => !c.classList.contains('expanded'));
  cards.forEach((c) => c.classList.toggle('expanded', anyCollapsed));
  if (btnIcon) btnIcon.style.transform = anyCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
};
window.toggleQuestionCard = function (header) {
  header.parentElement.classList.toggle('expanded');
};

window.removeQuestion = function (e, id) {
  e.stopPropagation();
  handleRemoveQuestion(id);
};

async function handleRemoveQuestion(id) {
  if (await confirmAction('Remove Question', 'Are you sure you want to delete this question?')) {
    currentQuestions = currentQuestions.filter((q) => q.id !== id);
    const card = document.querySelector(`.field-card[data-id="${id}"]`);
    if (card) card.remove();
    applyGameTypeUI();
    updateSummary();
  }
}

// --- Summary readout (Max Score for score-mode, Total Time for timed-mode) ---

function updateSummary() {
  const isTimed = document.getElementById('gameType').value === 'timed';
  let total = 0;
  const selector = isTimed ? '.field-timelimit' : '.field-points';
  document.querySelectorAll(selector).forEach((input) => { total += parseFloat(input.value) || 0; });
  document.getElementById('summaryValue').textContent = total;
}
