// public/js/data-source.js — Skills Data Source page (pdf-report plugin reports)
const U = window.BookingUtil;
let uiConfig = null;
let status = null;
let snapshots = [];
let table = null;
let chosenFile = null;

const locale = () => uiConfig?.locale || 'en-NZ';
const timezone = () => uiConfig?.timezone || 'Pacific/Auckland';
const isDemo = () => uiConfig?.appMode === 'demo';

const SOURCE_LABELS = { upload: 'Upload', gcs: 'Google Cloud Storage', local: 'Local file' };
const SYNC_BADGES = {
  imported: ['ok', 'Imported'],
  unchanged: ['neutral', 'No change'],
  skipped: ['neutral', 'Off'],
  missing: ['problem', 'Not found'],
  rejected: ['problem', 'Rejected'],
  error: ['problem', 'Error'],
};

const reportDate = (iso) => U.esc(U.formatDay(iso, locale(), { day: 'numeric', month: 'short', year: 'numeric' }));
const importedAt = (utc) => U.esc(U.formatDateTime(utc, locale(), timezone()));
const sourceLabel = (s) => U.esc(SOURCE_LABELS[s] || s);
const isCurrent = (snap) => status?.latest?.id === snap.id;

// ── Current report card ────────────────────────────────────────────────────

function renderCurrent() {
  const box = document.getElementById('currentReport');
  const latest = status.latest;

  const note = document.getElementById('pluginNote');
  if (status.activePlugin?.name !== 'pdf-report') {
    note.innerHTML = `The active extraction plugin is <strong>${U.esc(status.activePlugin?.name || 'unknown')}</strong>. Reports uploaded here are kept, but the app uses them only when the <strong>pdf-report</strong> plugin is active.`;
    note.style.display = 'block';
  } else {
    note.style.display = 'none';
  }

  let html = '<div class="ds-grid">';
  if (!latest) {
    html += `<span class="ds-label">Report</span><span>No report has been imported yet — upload one below.</span>`;
  } else {
    const age = status.ageDays === 0 ? 'today' : `${status.ageDays} day${status.ageDays === 1 ? '' : 's'} ago`;
    const stale = status.isStale
      ? `<span class="ds-badge stale" title="Older than ${status.staleWarnDays} days — a newer report is probably available">Out of date</span>`
      : '';
    const warnings = latest.warnings.length
      ? `<ul class="ds-warnings">${latest.warnings.map((w) => `<li>${U.esc(w)}</li>`).join('')}</ul>`
      : 'None';
    html += `
      <span class="ds-label">Report date</span>
      <span><strong>${reportDate(latest.report_created_date)}</strong> <span class="ds-muted">(${age})</span>${stale}</span>
      <span class="ds-label">Imported</span>
      <span>${importedAt(latest.created_at)} <span class="ds-muted">by ${U.esc(latest.created_by || 'Unknown')} — ${sourceLabel(latest.source)}${latest.file_name ? `, ${U.esc(latest.file_name)}` : ''}</span></span>
      <span class="ds-label">Contents</span>
      <span>${latest.record_count} skill entries for ${latest.member_count} members across ${latest.skill_count} skills</span>
      <span class="ds-label">Parser warnings</span>
      <span>${warnings}</span>`;
  }

  if (status.source !== 'upload') {
    const sync = status.lastSync;
    let check = '<span class="ds-muted">Not checked yet — the source is checked whenever skill data is refreshed.</span>';
    if (sync?.status) {
      const [cls, label] = SYNC_BADGES[sync.status] || ['neutral', sync.status];
      check = `<span class="ds-badge ${cls}" style="margin-left:0;">${U.esc(label)}</span> ${U.esc(sync.message || '')} <span class="ds-muted">(${importedAt(sync.at)})</span>`;
    }
    html += `
      <span class="ds-label">Automatic pickup</span>
      <span>${sourceLabel(status.source)}: <code>${U.esc(status.sourceLocation || '')}</code></span>
      <span class="ds-label">Last check</span>
      <span>${check}</span>`;
  } else {
    html += `<span class="ds-label">Automatic pickup</span><span class="ds-muted">Off — reports arrive by upload (from this page or the API).</span>`;
  }
  box.innerHTML = html + '</div>';

  const showSync = status.source !== 'upload';
  ['syncBtn', 'syncBtnMobile'].forEach((id) => {
    const btn = document.getElementById(id);
    btn.style.display = showSync ? '' : 'none';
    btn.disabled = isDemo();
    if (isDemo()) btn.title = 'Disabled in demo mode';
  });
  document.getElementById('uploadHint').textContent = `PDF only, up to ${status.maxSizeMb} MB.`;
  document.getElementById('retentionCount').textContent = status.retention;
}

// ── History table ──────────────────────────────────────────────────────────

function actions(snap) {
  const del = isDemo()
    ? '<button class="btn-sm btn-danger" disabled title="Disabled in demo mode">Delete</button>'
    : `<button class="btn-sm btn-danger" onclick="deleteSnapshot(${snap.id})" title="Permanently delete this report from the history">Delete</button>`;
  return `<button class="btn-sm btn-primary" onclick="downloadSnapshot(${snap.id})" title="Download the original PDF">Download</button>${del}`;
}

const COLUMNS = [
  { key: 'report_created_date', label: 'Report Date', sortable: true, tdStyle: 'white-space:nowrap;',
    render: (s) => `${reportDate(s.report_created_date)}${isCurrent(s) ? '<span class="ds-badge current" title="This report is the current data">Current</span>' : ''}` },
  { key: 'created_at', label: 'Imported', sortable: true,
    render: (s) => `${importedAt(s.created_at)}<div class="ds-muted">by ${U.esc(s.created_by || 'Unknown')}</div>` },
  { key: 'source', label: 'Source', sortable: true,
    render: (s) => `${sourceLabel(s.source)}${s.file_name ? `<div class="ds-muted" style="word-break:break-all;">${U.esc(s.file_name)}</div>` : ''}` },
  { key: 'record_count', label: 'Entries', sortable: true, tdStyle: 'text-align:center;' },
  { key: 'member_count', label: 'Members / Skills', mobileLabel: 'Members', sortable: true, tdStyle: 'text-align:center;',
    render: (s) => `${s.member_count} / ${s.skill_count}` },
  { key: 'actions', label: 'Actions', sortable: false, thStyle: 'text-align:center;',
    render: (s) => `<div class="ds-actions">${actions(s)}</div>` },
];

function renderCard(s) {
  return {
    title: reportDate(s.report_created_date),
    badge: isCurrent(s) ? '<span class="ds-badge current">Current</span>' : '',
    rows: [
      ['Imported', importedAt(s.created_at)],
      ['Source', sourceLabel(s.source)],
      ['File', U.esc(s.file_name || '—')],
      ['Entries', String(s.record_count)],
      ['Members / Skills', `${s.member_count} / ${s.skill_count}`],
      ['Imported by', U.esc(s.created_by || '—')],
    ],
    actions: actions(s),
  };
}

// ── Member name matching ───────────────────────────────────────────────────

let nameMatches = [];
let namesTable = null;
let allMembers = null;
let matchingName = null;

const MATCH_STATUS = {
  ambiguous: { order: 0, cls: 'stale', label: 'Needs review', tip: 'More than one member could be this person — choose one' },
  unmatched: { order: 1, cls: 'problem', label: 'Not found', tip: 'No member has this surname and first initial' },
  suggested: { order: 2, cls: 'neutral', label: 'Will match automatically', tip: 'Saved automatically the next time skill data refreshes' },
  auto: { order: 3, cls: 'ok', label: 'Matched automatically', tip: 'Matched by surname and first initial' },
  manual: { order: 4, cls: 'ok', label: 'Matched by admin', tip: 'Linked by an administrator' },
};
const needsAttention = (m) => m.status === 'ambiguous' || m.status === 'unmatched';

function matchBadge(m) {
  const s = MATCH_STATUS[m.status] || MATCH_STATUS.unmatched;
  return `<span class="ds-badge ${s.cls}" style="margin-left:0;" title="${s.tip}">${s.label}</span>`;
}

function matchedMember(m) {
  if (m.member) {
    const full = m.member.firstName && m.member.firstName.length > 1 ? ` <span class="ds-muted">(${U.esc(m.member.firstName)})</span>` : '';
    return `${U.esc(m.member.name)}${full}${m.member.enabled ? '' : ' <span class="ds-muted">— disabled</span>'}`;
  }
  if (m.candidates.length) return `<span class="ds-muted">Possible: ${m.candidates.map((c) => U.esc(c.name)).join('; ')}</span>`;
  return '<span class="ds-muted">—</span>';
}

function matchActions(m) {
  const disabled = isDemo() ? ' disabled title="Disabled in demo mode"' : '';
  const label = m.member ? 'Change' : 'Match';
  const tip = m.member ? 'Link this report name to a different member' : 'Choose the member this report name belongs to';
  let html = `<button class="btn-sm btn-primary" onclick="openMatchModal(${nameMatches.indexOf(m)})"${disabled || ` title="${tip}"`}>${label}</button>`;
  if (m.status === 'manual') {
    html += `<button class="btn-sm btn-danger" onclick="removeMatch(${m.aliasId})"${disabled || ' title="Remove this match — automatic matching applies again"'}>Unlink</button>`;
  }
  return html;
}

const NAME_COLUMNS = [
  { key: 'sourceName', label: 'Report Name', sortable: true, render: (m) => `<strong>${U.esc(m.sourceName)}</strong>` },
  { key: 'status', label: 'Status', sortable: true, sortValue: (m) => MATCH_STATUS[m.status]?.order ?? 9, render: matchBadge },
  { key: 'member', label: 'Member', sortable: true, sortValue: (m) => m.member?.name || '', render: matchedMember },
  { key: 'entryCount', label: 'Entries', sortable: true, tdStyle: 'text-align:center;' },
  { key: 'actions', label: 'Actions', sortable: false, thStyle: 'text-align:center;',
    render: (m) => `<div class="ds-actions">${matchActions(m)}</div>` },
];

function renderNameCard(m) {
  return {
    title: U.esc(m.sourceName),
    badge: matchBadge(m),
    rows: [['Member', matchedMember(m)], ['Entries', String(m.entryCount)]],
    actions: matchActions(m),
  };
}

function renderNames() {
  const card = document.getElementById('namesCard');
  card.style.display = status?.latest ? '' : 'none';
  if (!status?.latest) return;
  const attention = nameMatches.filter(needsAttention).length;
  const matched = nameMatches.filter((m) => m.member).length;
  document.getElementById('namesSummary').innerHTML =
    `${nameMatches.length} names in the current report — <strong>${matched} matched</strong>` +
    (attention
      ? `, <span class="ds-badge problem" style="margin-left:0;">${attention} need${attention === 1 ? 's' : ''} attention</span> <span class="ds-muted">Their skills are not counted until they are matched.</span>`
      : '. <span class="ds-badge ok" style="margin-left:0;">All matched</span>');
  namesTable.setRows(nameMatches);
}

async function loadMembers() {
  if (allMembers) return allMembers;
  const res = await fetch('/api/members');
  if (!res.ok) throw new Error('Failed to load members');
  allMembers = (await res.json()).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return allMembers;
}

async function openMatchModal(index) {
  if (isDemo()) return showToast('Disabled in Demo Mode', 'warning');
  const m = nameMatches[index];
  if (!m) return;
  try {
    const members = await loadMembers();
    matchingName = m;
    document.getElementById('matchSourceName').textContent = m.sourceName;
    const candidateIds = new Set(m.candidates.map((c) => c.id));
    const option = (mem) => `<option value="${mem.id}">${U.esc(mem.name)}${mem.enabled ? '' : ' (disabled)'}</option>`;
    const suggested = members.filter((mem) => candidateIds.has(mem.id));
    document.getElementById('matchMember').innerHTML =
      '<option value="">— Choose a member —</option>' +
      (suggested.length ? `<optgroup label="Possible matches">${suggested.map(option).join('')}</optgroup>` : '') +
      `<optgroup label="All members">${members.map(option).join('')}</optgroup>`;
    document.getElementById('matchMember').value = m.member ? String(m.member.id) : '';
    document.getElementById('matchModal').style.display = 'block';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function closeMatchModal() {
  document.getElementById('matchModal').style.display = 'none';
  matchingName = null;
}

async function saveMatch() {
  const memberId = Number(document.getElementById('matchMember').value);
  if (!matchingName) return;
  if (!memberId) return showToast('Choose a member first.', 'warning');
  const btn = document.getElementById('matchSaveBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/extraction/name-matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceName: matchingName.sourceName, memberId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not save the match');
    showToast(`${matchingName.sourceName} matched${body.firstNameStored ? ` — first name saved as ${body.firstNameStored}` : ''}.`, 'success');
    closeMatchModal();
    allMembers = null;
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function removeMatch(aliasId) {
  if (isDemo()) return showToast('Disabled in Demo Mode', 'warning');
  const m = nameMatches.find((x) => x.aliasId === aliasId);
  if (!m) return;
  const ok = await confirmAction('Unlink Name',
    `Remove the match between <strong>${U.esc(m.sourceName)}</strong> and <strong>${U.esc(m.member?.name || '')}</strong>? ` +
    'Automatic matching will apply to this name again.');
  if (!ok) return;
  try {
    const res = await fetch(`/api/extraction/name-matches/${aliasId}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not remove the match');
    showToast('Match removed', 'success');
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadAll() {
  try {
    const [statusRes, listRes, namesRes] = await Promise.all([
      fetch('/api/extraction/status'), fetch('/api/extraction/snapshots'), fetch('/api/extraction/name-matches'),
    ]);
    if (!statusRes.ok || !listRes.ok || !namesRes.ok) throw new Error('Failed to load the skills data source');
    status = await statusRes.json();
    snapshots = await listRes.json();
    nameMatches = await namesRes.json();
    renderCurrent();
    renderNames();
    table.setRows(snapshots);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Upload ─────────────────────────────────────────────────────────────────

function chooseFile(file) {
  const label = document.getElementById('reportFileLabel');
  const isPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (file && !isPdf) {
    showToast('Please choose a PDF file.', 'warning');
    file = null;
  }
  chosenFile = file || null;
  label.textContent = chosenFile ? chosenFile.name : 'No file chosen — or drop the PDF here';
  label.classList.toggle('has-file', !!chosenFile);
  document.getElementById('uploadBtn').disabled = !chosenFile || isDemo();
}

async function uploadReport(force = false) {
  if (isDemo()) return showToast('Uploads are disabled in Demo Mode', 'warning');
  if (!chosenFile) return;
  const btn = document.getElementById('uploadBtn');
  btn.disabled = true;
  try {
    const form = new FormData();
    form.append('file', chosenFile);
    if (force) form.append('force', 'true');
    const res = await fetch('/api/extraction/upload', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));

    if (res.status === 409 && !force) {
      const ok = await confirmAction('Older Report',
        `${U.esc(body.error || 'This report is older than the current one.')}<br><br>Import it anyway and make it the current data?`);
      if (ok) return uploadReport(true);
      return;
    }
    if (!res.ok) throw new Error(body.error || 'Upload failed');

    if (body.status === 'unchanged') {
      showToast('This report is identical to the current one — nothing changed.', 'info');
    } else {
      showToast(`Report from ${U.formatDay(body.reportCreatedDate, locale())} imported: ${body.recordCount} entries, ${body.memberCount} members.`, 'success');
      if (body.warnings?.length) showToast(`${body.warnings.length} parser warning(s) — see Current Report.`, 'warning');
    }
    document.getElementById('reportFile').value = '';
    chooseFile(null);
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = !chosenFile || isDemo();
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

async function checkSourceNow() {
  if (isDemo()) return showToast('Disabled in Demo Mode', 'warning');
  try {
    const res = await fetch('/api/extraction/sync', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Source check failed');
    const level = body.status === 'imported' ? 'success' : ['missing', 'rejected', 'error'].includes(body.status) ? 'error' : 'info';
    showToast(body.message || 'Source checked', level);
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function downloadSnapshot(id) {
  window.location.href = `/api/extraction/snapshots/${id}/file`;
}

async function deleteSnapshot(id) {
  if (isDemo()) return showToast('Deletion disabled in Demo Mode', 'warning');
  const snap = snapshots.find((s) => s.id === id);
  if (!snap) return;
  const current = isCurrent(snap);
  const ok = await confirmAction('Delete Report',
    `Permanently delete the report from <strong>${reportDate(snap.report_created_date)}</strong> (imported ${importedAt(snap.created_at)})?` +
    (current ? '<br><br>This is the <strong>current</strong> report — the previous report will become the current data.' : '') +
    ' This cannot be undone.');
  if (!ok) return;
  try {
    const res = await fetch(`/api/extraction/snapshots/${id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Deletion failed');
    showToast('Report deleted', 'success');
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const configReady = fetch('/ui-config')
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle('Skills Data Source', 'Skills Data Source');
      if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === 'demo') {
        document.getElementById('demoBanner').style.display = 'block';
        const choose = document.getElementById('chooseBtn');
        choose.disabled = true;
        choose.title = 'Disabled in demo mode';
        document.getElementById('uploadBtn').title = 'Disabled in demo mode';
      }
    })
    .catch(() => {});

  const input = document.getElementById('reportFile');
  input.addEventListener('change', () => chooseFile(input.files[0]));
  const drop = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    if (!isDemo()) drop.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
  }));
  drop.addEventListener('drop', (e) => {
    if (!isDemo() && e.dataTransfer?.files?.length) chooseFile(e.dataTransfer.files[0]);
  });

  fetch('/api/user-session')
    .then((r) => r.json())
    .then(async (user) => {
      const role = user.role || 'guest';
      if (role !== 'admin' && role !== 'superadmin') {
        showToast('Access Denied.', 'error');
        setTimeout(() => (window.location.href = '/'), 1500);
        return;
      }
      await configReady;
      table = new BookingTable({
        root: document.getElementById('historyTable'),
        idPrefix: 'ds',
        prefKey: 'dataSourceHistory',
        columns: COLUMNS,
        defaultSort: { col: 'created_at', dir: 'desc' },
        emptyMessage: 'No reports imported yet.',
        renderCard,
      });
      await table.init();
      namesTable = new BookingTable({
        root: document.getElementById('namesTable'),
        idPrefix: 'dsn',
        prefKey: 'dataSourceNames',
        columns: NAME_COLUMNS,
        defaultSort: { col: 'status', dir: 'asc' },
        emptyMessage: 'No names in the current report.',
        renderCard: renderNameCard,
      });
      await namesTable.init();
      loadAll();
    })
    .catch(() => (window.location.href = '/login.html'));
});
