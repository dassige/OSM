// public/js/bookings-manage.js — Booking Templates manager (configure + publish)

// --- Mobile two-screen navigation (shared pattern with Forms/Surveys/Quiz managers) ---
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

let templates = [];
let currentTemplate = null;
let originalState = null;
let templateSortMode = 'name_asc';
let uiConfig = null;
let allActiveMembers = [];
let lastPublished = null;
let previewTimer = null;

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'tel', label: 'Phone number' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Long text' },
];

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

const isDemo = () => uiConfig?.appMode === 'demo';
const locale = () => uiConfig?.locale || 'en-NZ';
const timezone = () => uiConfig?.timezone || 'Pacific/Auckland';

// --- Local date/time formatting (slot dates/times are brigade wall-clock values) ---

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale(), {
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  });
}

// Today's date (YYYY-MM-DD) in the brigade timezone, for past-date warnings.
function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Mirrors services/booking-service.js generateSlots(): whole slots inside each window,
// recalculated from scratch on every change. A date/start time is only ever produced
// once, so overlapping windows or a repeated date can't duplicate slots (they are still
// flagged as problems in the day labels).
function generateSlots(schedule, slotMinutes) {
  const slots = [];
  const seen = new Set();
  if (!(slotMinutes >= 5)) return slots;
  schedule.forEach((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date || '')) return;
    day.windows.forEach((w) => {
      const end = toMinutes(w.end);
      for (let t = toMinutes(w.start); t + slotMinutes <= end; t += slotMinutes) {
        const key = `${day.date} ${toHHMM(t)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({ date: day.date, start: toHHMM(t), end: toHHMM(t + slotMinutes) });
      }
    });
  });
  return slots.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

// ── Custom Time Picker (copied from backup-restore.html, plus an optional onChange) ──

function createTimePicker(container, initial, onChange) {
  const STEP = 5;
  let h = 9, m = 0, isOpen = false;
  const fmt = (n) => String(n).padStart(2, '0');

  (function parse(val) {
    const p = (val || '09:00').split(':');
    h = Math.min(23, Math.max(0, parseInt(p[0]) || 0));
    m = Math.min(55, Math.max(0, Math.round((parseInt(p[1]) || 0) / STEP) * STEP));
  })(initial);

  const UP = '&#9650;';
  const DN = '&#9660;';

  container.innerHTML = `
    <button type="button" class="time-picker-display" title="Click to select time">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      <span class="tp-display-val">${fmt(h)}:${fmt(m)}</span>
    </button>
    <div class="time-picker-dropdown" style="display:none;">
      <div class="time-picker-cols">
        <div class="time-picker-col">
          <button type="button" class="time-picker-chevron tp-h-up" title="Increase hour">${UP}</button>
          <span class="time-picker-num tp-h-num">${fmt(h)}</span>
          <button type="button" class="time-picker-chevron tp-h-dn" title="Decrease hour">${DN}</button>
          <span class="time-picker-label">Hour</span>
        </div>
        <span class="time-picker-sep">:</span>
        <div class="time-picker-col">
          <button type="button" class="time-picker-chevron tp-m-up" title="Increase minute">${UP}</button>
          <span class="time-picker-num tp-m-num">${fmt(m)}</span>
          <button type="button" class="time-picker-chevron tp-m-dn" title="Decrease minute">${DN}</button>
          <span class="time-picker-label">Min (${STEP}-step)</span>
        </div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn-secondary btn-sm tp-cancel" style="padding:6px 14px;" title="Cancel — revert to previous time">Cancel</button>
        <button type="button" class="btn-success btn-sm tp-apply" style="padding:6px 14px;" title="Apply the selected time">Apply</button>
      </div>
    </div>`;

  const trigger = container.querySelector('.time-picker-display');
  const dropdown = container.querySelector('.time-picker-dropdown');
  const dispVal = container.querySelector('.tp-display-val');
  const hNum = container.querySelector('.tp-h-num');
  const mNum = container.querySelector('.tp-m-num');
  let tempH = h, tempM = m;

  function refresh() { hNum.textContent = fmt(tempH); mNum.textContent = fmt(tempM); }
  function open() {
    document.querySelectorAll('.time-picker-dropdown').forEach((d) => { if (d !== dropdown) d.style.display = 'none'; });
    document.querySelectorAll('.time-picker-display.tp-open').forEach((b) => { if (b !== trigger) b.classList.remove('tp-open'); });
    tempH = h; tempM = m;
    refresh();
    dropdown.style.display = 'block';
    trigger.classList.add('tp-open');
    isOpen = true;
  }
  function close() {
    dropdown.style.display = 'none';
    trigger.classList.remove('tp-open');
    isOpen = false;
  }
  function apply() {
    h = tempH; m = tempM;
    dispVal.textContent = `${fmt(h)}:${fmt(m)}`;
    close();
    if (onChange) onChange(`${fmt(h)}:${fmt(m)}`);
  }

  trigger.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? close() : open(); });
  dropdown.addEventListener('click', (e) => e.stopPropagation());
  container.querySelector('.tp-h-up').addEventListener('click', () => { tempH = (tempH + 1) % 24; refresh(); });
  container.querySelector('.tp-h-dn').addEventListener('click', () => { tempH = (tempH - 1 + 24) % 24; refresh(); });
  container.querySelector('.tp-m-up').addEventListener('click', () => { tempM = (tempM + STEP) % 60; refresh(); });
  container.querySelector('.tp-m-dn').addEventListener('click', () => { tempM = (tempM - STEP + 60) % 60; refresh(); });
  container.querySelector('.tp-cancel').addEventListener('click', close);
  container.querySelector('.tp-apply').addEventListener('click', apply);
  document.addEventListener('click', () => { if (isOpen) close(); });

  return { getValue: () => `${fmt(h)}:${fmt(m)}` };
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  fetch('/ui-config')
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle('Booking Templates', 'Booking Templates');
      if (c.appBackground) document.body.style.backgroundImage = `url('${c.appBackground}')`;
      if (c.appMode === 'demo') {
        document.getElementById('demoBanner').style.display = 'block';
        const del = document.getElementById('btnDeleteTemplate');
        del.disabled = true;
        del.title = 'Disabled in demo mode';
      }
      document.getElementById('bkTimezoneHint').textContent = `Times are local (${timezone()})`;
    });

  fetch('/api/user-session')
    .then((r) => r.json())
    .then((user) => {
      const role = user.role || 'guest';
      if (role !== 'admin' && role !== 'superadmin') {
        if (window.showToast) showToast('Access Denied.', 'error');
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        loadTemplates();
      }
    })
    .catch(() => (window.location.href = '/login.html'));

  const dark = document.body.classList.contains('dark-mode');
  tinymce.init({
    selector: '#bkDescription',
    height: 180,
    menubar: false,
    plugins: 'link lists autolink',
    toolbar: 'undo redo | bold italic underline | bullist numlist | link | removeformat',
    skin: dark ? 'oxide-dark' : 'oxide',
    content_css: dark ? 'dark' : 'default',
    content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; margin: 8px; }',
    convert_urls: false,
  });

  // Any edit inside the editor refreshes the live slot preview
  const panel = document.getElementById('builderPanel');
  panel.addEventListener('input', schedulePreview);
  panel.addEventListener('change', schedulePreview);
});

// --- Editor data ---

function getDescription() {
  const ed = window.tinymce && tinymce.get('bkDescription');
  return ed ? ed.getContent() : document.getElementById('bkDescription').value;
}

function setDescription(html) {
  const ed = window.tinymce && tinymce.get('bkDescription');
  if (ed) ed.setContent(html || '');
  else document.getElementById('bkDescription').value = html || '';
}

function readSchedule() {
  return Array.from(document.querySelectorAll('#daysList .bk-day')).map((dayEl) => ({
    date: dayEl.querySelector('.bk-day-date').value,
    windows: Array.from(dayEl.querySelectorAll('.bk-window')).map((w) => ({
      start: w.querySelector('.bk-tp-start')._tp.getValue(),
      end: w.querySelector('.bk-tp-end')._tp.getValue(),
    })),
  }));
}

function readFields() {
  return Array.from(document.querySelectorAll('#fieldsList .bk-field-row')).map((row) => ({
    id: row.dataset.id,
    label: row.querySelector('.bk-field-label').value.trim(),
    type: row.querySelector('.bk-field-type').value,
    required: row.querySelector('.bk-field-required').checked,
  }));
}

function getTemplateData() {
  return {
    name: document.getElementById('bkName').value.trim(),
    description: getDescription(),
    location: document.getElementById('bkLocation').value.trim(),
    contact_info: document.getElementById('bkContact').value.trim(),
    slot_minutes: parseInt(document.getElementById('bkSlotMinutes').value, 10),
    slot_capacity: parseInt(document.getElementById('bkSlotCapacity').value, 10),
    schedule: readSchedule(),
    fields: readFields(),
    access_type: document.querySelector('input[name="bkAccessType"]:checked').value,
    show_booked_names: document.getElementById('bkShowNames').checked,
    allow_cancel: document.getElementById('bkAllowCancel').checked,
    max_bookings: parseInt(document.getElementById('bkMaxBookings').value, 10),
  };
}

function isDirty() {
  if (!originalState) return false;
  return JSON.stringify(getTemplateData()) !== JSON.stringify(originalState);
}

async function checkDirty() {
  if (isDirty()) {
    return confirmAction('Unsaved Changes', `You have unsaved changes in "${esc(currentTemplate?.name || 'New Template')}".<br><br>Do you want to discard them?`);
  }
  return true;
}

// --- Schedule editor ---

function addDay(day) {
  const data = day || { date: '', windows: [{ start: '09:00', end: '12:00' }] };
  const dayEl = document.createElement('div');
  dayEl.className = 'bk-day';
  dayEl.innerHTML = `
    <div class="bk-day-head">
      <input type="date" class="bk-day-date" title="Date of this day of appointments">
      <span class="bk-day-label"></span>
      <button type="button" class="btn-sm btn-danger" onclick="removeDay(this)" title="Remove this day from the schedule">Remove day</button>
    </div>
    <div class="bk-windows"></div>
    <button type="button" class="btn-sm btn-success" style="margin-top:8px;" onclick="addWindow(this.closest('.bk-day'))" title="Add another time window to this day">+ Add time window</button>`;
  document.getElementById('daysList').appendChild(dayEl);
  const dateInput = dayEl.querySelector('.bk-day-date');
  dateInput.value = data.date || '';
  if (window.DatePicker) DatePicker.attachAll();
  (data.windows || []).forEach((w) => addWindow(dayEl, w));
  if (!day) schedulePreview();
}

function removeDay(btn) {
  btn.closest('.bk-day').remove();
  schedulePreview();
}

// A new window starts where the day's latest window ends and lasts as long as that
// window (e.g. 09:00–12:00 → 12:00–15:00), so adding windows never duplicates slots.
function nextWindowFor(dayEl) {
  const windows = Array.from(dayEl.querySelectorAll('.bk-window')).map((w) => ({
    start: toMinutes(w.querySelector('.bk-tp-start')._tp.getValue()),
    end: toMinutes(w.querySelector('.bk-tp-end')._tp.getValue()),
  }));
  if (windows.length === 0) return { start: '09:00', end: '12:00' };
  const last = windows.reduce((a, b) => (b.end > a.end ? b : a));
  const latest = 23 * 60 + 55;
  const start = Math.min(last.end, latest - 5);
  const length = Math.max(last.end - last.start, 5);
  return { start: toHHMM(start), end: toHHMM(Math.min(start + length, latest)) };
}

function addWindow(dayEl, win) {
  const w = win || nextWindowFor(dayEl);
  const row = document.createElement('div');
  row.className = 'bk-window';
  row.innerHTML = `
    <div class="time-picker-wrap bk-tp-start"></div>
    <span class="bk-to">to</span>
    <div class="time-picker-wrap bk-tp-end"></div>
    <button type="button" class="btn-danger btn-sm bk-icon-btn" onclick="removeWindow(this)" title="Remove this time window">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>`;
  dayEl.querySelector('.bk-windows').appendChild(row);
  const startWrap = row.querySelector('.bk-tp-start');
  const endWrap = row.querySelector('.bk-tp-end');
  startWrap._tp = createTimePicker(startWrap, w.start, schedulePreview);
  endWrap._tp = createTimePicker(endWrap, w.end, schedulePreview);
  if (!win) schedulePreview();
}

function removeWindow(btn) {
  btn.closest('.bk-window').remove();
  schedulePreview();
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderSlotPreview, 120);
}

function renderSlotPreview() {
  const data = getTemplateData();
  const today = todayLocal();
  const problems = [];
  const seen = new Set();

  document.querySelectorAll('#daysList .bk-day').forEach((dayEl, i) => {
    const day = data.schedule[i];
    const label = dayEl.querySelector('.bk-day-label');
    const notes = [];
    if (!day.date) notes.push('Pick a date');
    else {
      if (seen.has(day.date)) notes.push('Duplicate date');
      seen.add(day.date);
      if (day.date < today) notes.push('Date is in the past');
    }
    if (day.windows.length === 0) notes.push('Add a time window');
    const sorted = [...day.windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    sorted.forEach((w, j) => {
      if (toMinutes(w.start) >= toMinutes(w.end)) notes.push(`Window ${formatTime(w.start)}–${formatTime(w.end)} ends before it starts`);
      if (j > 0 && toMinutes(w.start) < toMinutes(sorted[j - 1].end)) notes.push('Time windows overlap');
    });
    label.innerHTML = `${day.date ? esc(formatDay(day.date)) : ''}${notes.length ? ` <span class="bk-day-warn">${esc(notes.join(' · '))}</span>` : ''}`;
    problems.push(...notes);
  });

  const slots = generateSlots(data.schedule, data.slot_minutes);
  const capacity = Number.isInteger(data.slot_capacity) && data.slot_capacity > 0 ? data.slot_capacity : 0;
  const days = [...new Set(slots.map((s) => s.date))].sort();
  const summary = document.getElementById('slotPreviewSummary');
  summary.textContent = slots.length === 0
    ? 'No slots yet — add a day with a time window.'
    : `${slots.length} slot${slots.length === 1 ? '' : 's'} across ${days.length} day${days.length === 1 ? '' : 's'} — ${slots.length * capacity} place${slots.length * capacity === 1 ? '' : 's'} in total`;
  summary.style.color = problems.length ? 'var(--danger)' : 'var(--text-main)';

  document.getElementById('slotPreview').innerHTML = days.map((d) => `
    <div class="bk-preview-day">
      <div class="bk-preview-day-title">${esc(formatDay(d))}</div>
      ${slots.filter((s) => s.date === d).map((s) => `<span class="bk-chip">${esc(formatTime(s.start))}</span>`).join('')}
    </div>`).join('');
}

// --- Fields editor ---

function addField(field) {
  const f = field || { id: `f_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, label: '', type: 'text', required: false };
  const row = document.createElement('div');
  row.className = 'bk-field-row';
  row.dataset.id = f.id;
  row.innerHTML = `
    <input type="text" class="bk-field-label" maxlength="100" placeholder="Question, e.g. Mobile phone" title="Question shown to members when they book">
    <select class="bk-field-type" title="Type of answer expected">
      ${FIELD_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
    </select>
    <label class="bk-inline-check" title="Members must answer this question to book">
      <input type="checkbox" class="bk-field-required"> Required
    </label>
    <button type="button" class="btn-danger btn-sm bk-icon-btn" onclick="this.closest('.bk-field-row').remove()" title="Remove this question">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>`;
  row.querySelector('.bk-field-label').value = f.label || '';
  row.querySelector('.bk-field-type').value = f.type || 'text';
  row.querySelector('.bk-field-required').checked = !!f.required;
  document.getElementById('fieldsList').appendChild(row);
  if (!field) row.querySelector('.bk-field-label').focus();
}

// --- API interactions ---

async function loadTemplates() {
  try {
    const res = await fetch('/api/bookings/templates');
    if (!res.ok) throw new Error('Failed to load booking templates');
    templates = await res.json();
    renderTemplateList();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveTemplate() {
  const data = getTemplateData();
  if (!data.name) return showToast('Event name is required.', 'error');
  if (data.fields.some((f) => !f.label)) return showToast('Every field needs a question label.', 'error');
  if (!(data.max_bookings >= 1 && data.max_bookings <= 20)) return showToast('Bookings per member must be between 1 and 20.', 'error');

  const isNew = !(currentTemplate && currentTemplate.id);
  try {
    const res = await fetch(isNew ? '/api/bookings/templates' : `/api/bookings/templates/${currentTemplate.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Unknown error');
    if (isNew) currentTemplate.id = body.id;
    currentTemplate = { ...currentTemplate, ...data };
    originalState = getTemplateData();
    showToast('Booking template saved', 'success');
    await loadTemplates();
    return true;
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    return false;
  }
}

async function duplicateTemplate() {
  if (!currentTemplate || !currentTemplate.id) return showToast('Please save the template first.', 'warning');
  if (isDirty()) return showToast('Please save your changes before duplicating.', 'warning');
  try {
    const res = await fetch(`/api/bookings/templates/${currentTemplate.id}/duplicate`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Duplicate failed');
    await loadTemplates();
    originalState = null;
    await selectTemplate(body.id, true);
    showToast('Copy created — add the new dates and save.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteTemplate() {
  if (!currentTemplate) return;
  if (isDemo()) return showToast('Deletion disabled in Demo Mode', 'warning');
  if (!currentTemplate.id) {
    // Never saved — just discard the draft
    resetEditor();
    return;
  }
  const ok = await confirmAction('Delete Booking Template',
    `Delete the template '<strong>${esc(currentTemplate.name)}</strong>'?<br><br>Events already published from it are kept.`);
  if (!ok) return;
  try {
    const res = await fetch(`/api/bookings/templates/${currentTemplate.id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Deletion failed');
    showToast('Booking template deleted', 'success');
    resetEditor();
    loadTemplates();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function resetEditor() {
  currentTemplate = null;
  originalState = null;
  document.getElementById('builderPanel').style.display = 'none';
  document.getElementById('emptyPanel').style.display = 'flex';
  closeMobileEditor();
  renderTemplateList();
}

// --- Sidebar list ---

function toggleTemplateSort() {
  const btn = document.getElementById('btnSortTemplates');
  templateSortMode = templateSortMode === 'name_asc' ? 'name_desc' : 'name_asc';
  btn.title = templateSortMode === 'name_asc' ? 'Sort by Name (A-Z)' : 'Sort by Name (Z-A)';
  btn.innerHTML = templateSortMode === 'name_asc'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18H3M21 6H3M17 12H3"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h12M3 6h18M7 12h14"/></svg>';
  renderTemplateList();
}

function renderTemplateList() {
  const list = document.getElementById('templateList');
  const sorted = [...templates].sort((a, b) => {
    const cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    return templateSortMode === 'name_asc' ? cmp : -cmp;
  });
  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:20px;"><p>No booking templates yet.</p></div>';
    return;
  }
  list.innerHTML = '';
  sorted.forEach((t) => {
    const days = (t.schedule || []).length;
    const item = document.createElement('div');
    item.className = `form-item ${currentTemplate && currentTemplate.id === t.id ? 'active' : ''}`;
    item.title = `Edit ${t.name}`;
    item.innerHTML = `
      <div class="form-info">
        <div class="form-name">${esc(t.name)}</div>
        <span class="access-badge ${t.access_type === 'general' ? 'general' : 'personal'}">${t.access_type === 'general' ? 'General link' : 'Personal links'}</span>
        <span class="bk-list-meta">${days} day${days === 1 ? '' : 's'} · ${t.slot_count} slot${t.slot_count === 1 ? '' : 's'}</span>
      </div>`;
    item.onclick = () => selectTemplate(t.id);
    list.appendChild(item);
  });
}

async function createNewTemplate() {
  if (document.getElementById('builderPanel').style.display === 'flex' && !(await checkDirty())) return;
  loadEditor({
    name: 'New Booking Event',
    description: '',
    location: '',
    contact_info: '',
    slot_minutes: 15,
    slot_capacity: 1,
    schedule: [{ date: '', windows: [{ start: '09:00', end: '12:00' }] }],
    fields: [{ id: 'phone', label: 'Mobile phone', type: 'tel', required: true }],
    access_type: 'personal',
    show_booked_names: false,
    allow_cancel: true,
    max_bookings: 1,
  });
}

async function selectTemplate(id, force) {
  if (!force && currentTemplate && currentTemplate.id === id) return openMobileEditor();
  if (!force && document.getElementById('builderPanel').style.display === 'flex' && !(await checkDirty())) return;
  try {
    const res = await fetch(`/api/bookings/templates/${id}`);
    if (!res.ok) throw new Error('Failed to load template');
    loadEditor(await res.json());
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function loadEditor(t) {
  currentTemplate = t;
  document.getElementById('emptyPanel').style.display = 'none';
  document.getElementById('builderPanel').style.display = 'flex';

  const nameInput = document.getElementById('bkName');
  nameInput.value = t.name || '';
  nameInput.style.height = '';
  nameInput.style.height = nameInput.scrollHeight + 'px';
  setDescription(t.description);
  document.getElementById('bkLocation').value = t.location || '';
  document.getElementById('bkContact').value = t.contact_info || '';
  document.getElementById('bkSlotMinutes').value = t.slot_minutes || 15;
  document.getElementById('bkSlotCapacity').value = t.slot_capacity || 1;
  document.querySelector(`input[name="bkAccessType"][value="${t.access_type === 'general' ? 'general' : 'personal'}"]`).checked = true;
  document.getElementById('bkShowNames').checked = !!t.show_booked_names;
  document.getElementById('bkAllowCancel').checked = t.allow_cancel !== false;
  document.getElementById('bkMaxBookings').value = t.max_bookings || 1;

  document.getElementById('daysList').innerHTML = '';
  (t.schedule || []).forEach((d) => addDay(d));
  document.getElementById('fieldsList').innerHTML = '';
  (t.fields || []).forEach((f) => addField(f));

  // New (unsaved) templates start dirty so leaving them prompts a discard confirmation
  originalState = t.id ? getTemplateData() : { ...getTemplateData(), _unsaved: true };
  renderSlotPreview();
  renderTemplateList();
  openMobileEditor();
}

// --- Publishing ---

async function loadActiveMembers() {
  if (allActiveMembers.length) return;
  const res = await fetch('/api/members');
  if (!res.ok) throw new Error('Failed to load members');
  const members = await res.json();
  allActiveMembers = members.filter((m) => m.enabled === true).sort((a, b) => {
    const pA = window.getRankPriority ? window.getRankPriority(a.rank || a.name) : 99;
    const pB = window.getRankPriority ? window.getRankPriority(b.rank || b.name) : 99;
    if (pA !== pB) return pA - pB;
    return (a.last_name || a.name || '').localeCompare(b.last_name || b.name || '', undefined, { sensitivity: 'base' });
  });
}

async function openPublishModal() {
  if (!currentTemplate || !currentTemplate.id) return showToast('Please save the template first.', 'warning');
  if (isDirty()) return showToast('Please save your changes before publishing.', 'warning');

  const data = getTemplateData();
  const slots = generateSlots(data.schedule, data.slot_minutes);
  if (slots.length === 0) return showToast('Add at least one day with a time window before publishing.', 'warning');

  try {
    await loadActiveMembers();
  } catch (e) {
    return showToast(e.message, 'error');
  }

  document.getElementById('pubName').value = data.name;
  const days = new Set(slots.map((s) => s.date)).size;
  const pastDays = [...new Set(slots.map((s) => s.date))].filter((d) => d < todayLocal()).length;
  document.getElementById('pubSlotSummary').innerHTML =
    `${slots.length} slots across ${days} day${days === 1 ? '' : 's'}, ${slots.length * data.slot_capacity} places in total.` +
    (pastDays ? ` <span style="color:var(--danger); font-weight:600;">${pastDays} day${pastDays === 1 ? ' is' : 's are'} in the past.</span>` : '');
  document.querySelector(`input[name="pubAccessType"][value="${data.access_type}"]`).checked = true;
  document.getElementById('pubShowNames').checked = data.show_booked_names;
  document.getElementById('pubAllowCancel').checked = data.allow_cancel;
  document.getElementById('pubMaxBookings').value = data.max_bookings || 1;
  document.getElementById('pubNotifyEmail').checked = true;
  document.getElementById('pubNotifyWhatsapp').checked = false;
  document.getElementById('pubDemoNote').style.display = isDemo() ? 'block' : 'none';
  document.getElementById('pubActiveCount').textContent = `(${allActiveMembers.length})`;
  document.querySelector('input[name="pubTarget"][value="all"]').checked = true;

  const container = document.getElementById('pubSelectionContainer');
  container.innerHTML = '';
  allActiveMembers.forEach((m) => {
    const displayName = window.formatMemberName ? window.formatMemberName(m.rank, m.last_name, m.first_name, m.name) : m.name;
    const contact = [m.email ? '' : 'no email', m.mobile ? '' : 'no mobile'].filter(Boolean).join(', ');
    const li = document.createElement('label');
    li.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px; cursor:pointer; border-bottom:1px solid var(--border-color);';
    li.title = `Invite ${displayName}`;
    li.innerHTML = `<input type="checkbox" class="pub-member-checkbox" value="${m.id}" checked>
      <span style="font-weight:500;">${esc(displayName)}</span>
      ${contact ? `<span style="font-size:0.8em; color:var(--text-muted);">(${esc(contact)})</span>` : ''}`;
    container.appendChild(li);
  });
  togglePublishSelection();

  const btn = document.getElementById('btnConfirmPublish');
  btn.disabled = false;
  btn.innerText = 'Publish';
  openModal('publishModal');
}

function togglePublishSelection() {
  const isSelection = document.querySelector('input[name="pubTarget"][value="selection"]').checked;
  document.getElementById('pubSelectionContainer').style.display = isSelection ? 'block' : 'none';
}

async function confirmPublish() {
  const isSelection = document.querySelector('input[name="pubTarget"][value="selection"]').checked;
  const memberIds = isSelection
    ? Array.from(document.querySelectorAll('.pub-member-checkbox:checked')).map((cb) => parseInt(cb.value, 10))
    : allActiveMembers.map((m) => m.id);
  if (memberIds.length === 0) return showToast('Please select at least one member.', 'warning');

  const name = document.getElementById('pubName').value.trim();
  if (!name) return showToast('Event name is required.', 'error');
  const accessType = document.querySelector('input[name="pubAccessType"]:checked').value;
  const maxBookings = parseInt(document.getElementById('pubMaxBookings').value, 10);
  if (!(maxBookings >= 1 && maxBookings <= 20)) return showToast('Bookings per member must be between 1 and 20.', 'error');
  const notify = {
    email: document.getElementById('pubNotifyEmail').checked,
    whatsapp: document.getElementById('pubNotifyWhatsapp').checked,
  };

  const ok = await confirmAction('Publish Booking Event',
    `Publish '<strong>${esc(name)}</strong>' to <strong>${memberIds.length}</strong> member${memberIds.length === 1 ? '' : 's'}` +
    `${notify.email || notify.whatsapp ? ' and send them the booking link' : ''}?`);
  if (!ok) return;

  const btn = document.getElementById('btnConfirmPublish');
  btn.disabled = true;
  btn.innerText = 'Publishing...';
  showGlobalSpinner('Publishing booking event...');
  try {
    const res = await fetch(`/api/bookings/templates/${currentTemplate.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        access_type: accessType,
        show_booked_names: document.getElementById('pubShowNames').checked,
        allow_cancel: document.getElementById('pubAllowCancel').checked,
        max_bookings: maxBookings,
        memberIds,
        notify,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Publish failed');
    closeModal('publishModal');
    showPublishResult(body, memberIds.length, accessType);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    hideGlobalSpinner();
    btn.disabled = false;
    btn.innerText = 'Publish';
  }
}

function showPublishResult(result, invited, accessType) {
  lastPublished = result;
  const n = result.notifications || {};
  const parts = [`Invited ${invited} member${invited === 1 ? '' : 's'}.`];
  if (n.simulated) parts.push('Demo mode: notifications were simulated.');
  const sent = [];
  if (n.emailSent) sent.push(`${n.emailSent} email${n.emailSent === 1 ? '' : 's'}`);
  if (n.whatsappSent) sent.push(`${n.whatsappSent} WhatsApp message${n.whatsappSent === 1 ? '' : 's'}`);
  if (n.whatsappQueued) sent.push(`${n.whatsappQueued} WhatsApp message${n.whatsappQueued === 1 ? '' : 's'} queued`);
  if (sent.length) parts.push(`${n.simulated ? 'Would have sent' : 'Sent'}: ${sent.join(', ')}.`);
  if (n.skipped) parts.push(`${n.skipped} member${n.skipped === 1 ? ' was' : 's were'} not notified (no matching channel or contact details).`);
  if (n.failed) parts.push(`${n.failed} notification${n.failed === 1 ? '' : 's'} failed — check the event log.`);
  document.getElementById('pubResultText').textContent = parts.join(' ');

  const general = accessType === 'general' && result.link;
  document.getElementById('pubResultLink').style.display = general ? 'block' : 'none';
  document.getElementById('pubResultPersonal').style.display = general ? 'none' : 'block';
  if (general) document.getElementById('pubResultLinkInput').value = result.link;
  openModal('publishResultModal');
}

async function copyPublishedLink() {
  const input = document.getElementById('pubResultLinkInput');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  showToast('Booking link copied', 'success');
}

function openPublishedDashboard() {
  if (lastPublished) window.location.href = `bookings-dashboard.html?id=${lastPublished.id}`;
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
