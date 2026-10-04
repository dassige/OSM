// public/js/live-bookings.js — list of published booking events
const U = window.BookingUtil;
let uiConfig = null;
let rawData = [];
let table = null;

const locale = () => uiConfig?.locale || 'en-NZ';
const timezone = () => uiConfig?.timezone || 'Pacific/Auckland';
const isDemo = () => uiConfig?.appMode === 'demo';
const linkFor = (ev) => `${window.location.origin}/booking/${ev.public_id}`;

function toggleFilters() {
  const bar = document.getElementById('filterBar');
  const btn = document.getElementById('filterToggleBtn');
  btn.classList.toggle('expanded', bar.classList.toggle('filter-expanded'));
}

function updateFilterHighlights() {
  let count = 0;
  const checks = [
    ['filterName', (v) => v.trim() !== ''],
    ['filterStatus', (v) => v !== 'current'],
    ['filterAccess', (v) => v !== 'all'],
    ['filterDateFrom', (v) => !!v],
    ['filterDateTo', (v) => !!v],
  ];
  checks.forEach(([id, isActive]) => {
    const el = document.getElementById(id);
    const active = isActive(el.value || '');
    el.classList.toggle('filter-active', active);
    if (active) count++;
  });
  const badge = document.getElementById('filterActiveCount');
  badge.textContent = count || '';
  badge.style.display = count ? 'inline-block' : 'none';
}

function dateRange(ev) {
  if (!ev.first_date) return '—';
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const first = U.formatDay(ev.first_date, locale(), opts);
  const range = ev.last_date && ev.last_date !== ev.first_date ? `${first} – ${U.formatDay(ev.last_date, locale(), opts)}` : first;
  const ended = ev.last_date && ev.last_date < U.todayLocal(timezone());
  return `${U.esc(range)}${ended ? ' <span class="bk-muted">(ended)</span>' : ''}`;
}

function progress(ev) {
  const pct = ev.invited_count ? Math.round((ev.booked_count / ev.invited_count) * 100) : 0;
  return `<div class="progress-cell" title="${ev.booked_count} of ${ev.invited_count} invited members have booked">
      <span style="font-size:13px; min-width:45px;">${ev.booked_count} / ${ev.invited_count}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
    </div>`;
}

function actions(ev) {
  let html = `<button class="btn-sm btn-primary" onclick="openDashboard(${ev.id})" title="Open the dashboard for this event">Open</button>`;
  if (ev.access_type === 'general' && !ev.is_archived) {
    html += `<button class="btn-sm btn-primary" onclick="copyLink(${ev.id})" title="Copy the shared booking link">Copy link</button>`;
  }
  if (ev.is_archived) {
    html += `<button class="btn-sm btn-danger" onclick="deleteEvent(${ev.id})" ${isDemo() ? 'disabled title="Disabled in demo mode"' : 'title="Permanently delete this archived event and its bookings"'}>Delete</button>`;
  }
  return `<div class="bk-actions">${html}</div>`;
}

function nameCell(ev) {
  return `<strong>${U.esc(ev.name)}</strong><span class="access-badge ${ev.access_type}">${ev.access_type === 'general' ? 'General' : 'Personal'}</span>`;
}

const COLUMNS = [
  { key: 'published_at', label: 'Published', sortable: true, thStyle: 'width:120px;', tdStyle: 'white-space:nowrap;',
    render: (ev) => U.esc(new Date(ev.published_at.replace(' ', 'T') + 'Z').toLocaleDateString(locale(), { timeZone: timezone() })) },
  { key: 'name', label: 'Event', sortable: true, render: nameCell },
  { key: 'first_date', label: 'Dates', sortable: true, render: dateRange },
  { key: 'status', label: 'Status', sortable: true, thStyle: 'width:100px;', sortValue: (ev) => U.status(ev).order, render: (ev) => U.statusBadge(ev) },
  { key: 'booked_count', label: 'Booked', sortable: true, sortValue: (ev) => ev.booked_count, render: progress },
  { key: 'free_places', label: 'Free places', sortable: true, thStyle: 'width:100px;', tdStyle: 'text-align:center;',
    sortValue: (ev) => ev.total_capacity - ev.booked_count, render: (ev) => String(Math.max(0, ev.total_capacity - ev.booked_count)) },
  { key: 'actions', label: 'Actions', sortable: false, thStyle: 'width:230px; text-align:center;', render: actions },
];

function renderCard(ev) {
  return {
    title: U.esc(ev.name),
    badge: U.statusBadge(ev),
    rows: [
      ['Access', ev.access_type === 'general' ? 'General link' : 'Personal links'],
      ['Dates', dateRange(ev)],
      ['Booked', `${ev.booked_count} / ${ev.invited_count}`],
      ['Free places', String(Math.max(0, ev.total_capacity - ev.booked_count))],
      ['Published', U.esc(new Date(ev.published_at.replace(' ', 'T') + 'Z').toLocaleDateString(locale(), { timeZone: timezone() }))],
    ],
    actions: actions(ev).replace('<div class="bk-actions">', '').replace(/<\/div>$/, ''),
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const configReady = fetch('/ui-config')
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle('Booking Events', 'Booking Events');
      if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === 'demo') document.getElementById('demoBanner').style.display = 'block';
    })
    .catch(() => {});

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
        root: document.getElementById('eventsTable'),
        idPrefix: 'lb',
        prefKey: 'liveBookings',
        columns: COLUMNS,
        defaultSort: { col: 'published_at', dir: 'desc' },
        emptyMessage: 'No booking events match the filters.',
        renderCard,
        rowStyle: (ev) => (ev.is_archived ? 'opacity:0.7;' : ''),
      });
      await table.init();
      loadData();
    })
    .catch(() => (window.location.href = '/login.html'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && table) loadData();
  });
});

async function loadData() {
  try {
    const res = await fetch('/api/bookings/events');
    if (!res.ok) throw new Error('Failed to load booking events');
    rawData = await res.json();
    applyFilters();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function applyFilters() {
  if (!table) return;
  const name = document.getElementById('filterName').value.trim().toLowerCase();
  const status = document.getElementById('filterStatus').value;
  const access = document.getElementById('filterAccess').value;
  const from = document.getElementById('filterDateFrom').value;
  const to = document.getElementById('filterDateTo').value;

  const rows = rawData.filter((ev) => {
    const s = U.status(ev).key;
    if (status === 'current' && s === 'archived') return false;
    if (!['current', 'all'].includes(status) && s !== status) return false;
    if (access !== 'all' && ev.access_type !== access) return false;
    if (name && !(ev.name || '').toLowerCase().includes(name)) return false;
    // Event dates overlap the selected range
    if (from && (!ev.last_date || ev.last_date < from)) return false;
    if (to && (!ev.first_date || ev.first_date > to)) return false;
    return true;
  });
  updateFilterHighlights();
  table.setRows(rows);
}

function resetFilters() {
  document.getElementById('filterName').value = '';
  document.getElementById('filterStatus').value = 'current';
  document.getElementById('filterAccess').value = 'all';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  applyFilters();
}

function openDashboard(id) {
  window.location.href = `bookings-dashboard.html?id=${id}`;
}

function copyLink(id) {
  const ev = rawData.find((e) => e.id === id);
  if (ev) U.copyText(linkFor(ev));
}

async function deleteEvent(id) {
  if (isDemo()) return showToast('Deletion disabled in Demo Mode', 'warning');
  const ev = rawData.find((e) => e.id === id);
  if (!ev) return;
  const ok = await confirmAction('Delete Booking Event',
    `Permanently delete '<strong>${U.esc(ev.name)}</strong>' and all <strong>${ev.booked_count}</strong> booking${ev.booked_count === 1 ? '' : 's'}? This cannot be undone.`);
  if (!ok) return;
  try {
    const res = await fetch(`/api/bookings/events/${id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Deletion failed');
    showToast('Booking event deleted', 'success');
    loadData();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
