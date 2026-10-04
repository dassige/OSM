// public/js/bookings-dashboard.js — dashboard for one published booking event
const U = window.BookingUtil;
const eventId = parseInt(new URLSearchParams(window.location.search).get('id'), 10) || null;

let uiConfig = null;
let ev = null;
let bookedTable = null;
let pendingTable = null;
let bookTarget = null;   // member_id being booked/moved in the modal
let remindTarget = null; // member_id for a single reminder, null = everyone not booked

const locale = () => uiConfig?.locale || 'en-NZ';
const timezone = () => uiConfig?.timezone || 'Pacific/Auckland';
const isDemo = () => uiConfig?.appMode === 'demo';
const isOpen = () => ev && !ev.is_archived && ev.is_enabled && !ev.is_locked;
const dayShort = (iso) => U.formatDay(iso, locale(), { weekday: 'short', day: 'numeric', month: 'short' });
const dayLong = (iso) => U.formatDay(iso, locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeRange = (r) => `${U.formatTime(r.start_time, locale())}–${U.formatTime(r.end_time, locale())}`;

document.addEventListener('DOMContentLoaded', () => {
  const configReady = fetch('/ui-config')
    .then((r) => r.json())
    .then((c) => {
      uiConfig = c;
      initPageTitle('Booking Event', 'Booking Event');
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
      bookedTable = new BookingTable({
        root: document.getElementById('bookedTable'),
        idPrefix: 'bkd',
        prefKey: 'bookingDashBooked',
        columns: bookedColumns([]),
        defaultSort: { col: 'slot', dir: 'asc' },
        emptyMessage: 'No bookings yet.',
        renderCard: bookedCard,
      });
      pendingTable = new BookingTable({
        root: document.getElementById('pendingTable'),
        idPrefix: 'bkp',
        prefKey: 'bookingDashPending',
        columns: pendingColumns(),
        defaultSort: { col: 'member', dir: 'asc' },
        emptyMessage: 'Everyone invited has booked.',
        renderCard: pendingCard,
      });
      await Promise.all([bookedTable.init(), pendingTable.init()]);
      if (!eventId) {
        document.getElementById('eventName').textContent = 'No booking event selected';
        document.getElementById('eventInfo').innerHTML = '<p class="bk-muted">Open an event from the <a href="live-bookings.html">Booking Events</a> list.</p>';
        setControlsDisabled(true);
        return;
      }
      loadEvent();
    })
    .catch(() => (window.location.href = '/login.html'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ev) loadEvent();
  });
});

async function loadEvent() {
  if (!eventId) return;
  try {
    const res = await fetch(`/api/bookings/events/${eventId}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to load the booking event');
    const firstLoad = !ev;
    ev = body;
    if (firstLoad) {
      initPageTitle('Booking Event', ev.name);
      bookedTable.setColumns(bookedColumns(ev.fields || []));
    }
    render();
  } catch (e) {
    showToast(e.message, 'error');
    if (!ev) {
      document.getElementById('eventName').textContent = 'Booking event not found';
      setControlsDisabled(true);
    }
  }
}

// --- Rendering ---

function infoRow(label, value) {
  return `<div class="bk-info-row"><span class="bk-info-label">${label}</span><span class="bk-info-value">${value}</span></div>`;
}

function render() {
  document.getElementById('topBadges').innerHTML =
    `${U.statusBadge(ev)} <span class="access-badge ${ev.access_type}">${ev.access_type === 'general' ? 'General link' : 'Personal links'}</span>`;
  document.getElementById('archivedNote').style.display = ev.is_archived ? 'block' : 'none';
  document.getElementById('eventName').textContent = ev.name;

  const days = [...new Set(ev.slots.map((s) => s.slot_date))].sort();
  const capacity = ev.slots.length ? ev.slots[0].capacity : 1;
  const today = U.todayLocal(timezone());
  const dayLines = days.map((d) => {
    const daySlots = ev.slots.filter((s) => s.slot_date === d);
    const span = `${U.formatTime(daySlots[0].start_time, locale())}–${U.formatTime(daySlots[daySlots.length - 1].end_time, locale())}`;
    return `${U.esc(dayLong(d))} <span class="bk-muted">${U.esc(span)}${d < today ? ' · past' : ''}</span>`;
  });

  let linkHtml;
  if (ev.access_type === 'general') {
    linkHtml = ev.is_archived
      ? '<span class="bk-muted">The link no longer works (archived).</span>'
      : `<div class="bk-link-box"><input type="text" readonly value="${U.esc(ev.link)}" title="Shared booking link — anyone with it can book">
           <button class="btn-sm btn-primary" onclick="U.copyText(ev.link)" title="Copy the shared booking link">Copy</button></div>`;
  } else {
    linkHtml = '<span class="bk-muted">Each member has a personal link — copy it from the member lists below.</span>';
  }

  document.getElementById('eventInfo').innerHTML = [
    infoRow('Dates', dayLines.join('<br>') || '—'),
    infoRow('Location', U.esc(ev.location) || '—'),
    infoRow('Contact', U.esc(ev.contact_info) || '—'),
    infoRow('Slots', `${ev.stats.slotCount} × ${ev.slot_minutes} min, ${capacity} place${capacity === 1 ? '' : 's'} each <span class="bk-muted">(times local to ${U.esc(timezone())})</span>`),
    infoRow('Member options', `Names on booked slots: <strong>${ev.show_booked_names ? 'shown' : 'hidden'}</strong><br>Change / cancel: <strong>${ev.allow_cancel ? 'allowed' : 'not allowed'}</strong>`),
    infoRow('Published', `${U.esc(U.formatDateTime(ev.published_at, locale(), timezone()))}${ev.published_by ? ` by ${U.esc(ev.published_by)}` : ''}`),
    ev.archived_at ? infoRow('Archived', U.esc(U.formatDateTime(ev.archived_at, locale(), timezone()))) : '',
    infoRow('Booking link', linkHtml),
  ].join('') + (ev.description ? `<div class="bk-description">${ev.description}</div>` : '');

  const s = ev.stats;
  document.getElementById('statInvited').textContent = s.invited;
  document.getElementById('statBooked').textContent = s.booked;
  document.getElementById('statNotBooked').textContent = s.notBooked;
  document.getElementById('statFree').textContent = Math.max(0, s.freePlaces);
  document.getElementById('progressFill').style.width = `${s.invited ? Math.round((s.booked / s.invited) * 100) : 0}%`;

  // Controls
  const locked = document.getElementById('toggleLocked');
  const enabled = document.getElementById('toggleEnabled');
  locked.checked = ev.is_locked;
  enabled.checked = ev.is_enabled;
  locked.disabled = enabled.disabled = ev.is_archived;
  const remind = document.getElementById('btnRemindAll');
  remind.disabled = !isOpen() || s.notBooked === 0;
  remind.title = !isOpen() ? 'Reminders can only be sent while the event is open' : s.notBooked === 0 ? 'Everyone has booked' : "Send a reminder to everyone who hasn't booked";
  const archive = document.getElementById('btnArchive');
  const del = document.getElementById('btnDelete');
  archive.style.display = ev.is_archived ? 'none' : '';
  del.style.display = ev.is_archived ? '' : 'none';
  [archive, del].forEach((b) => {
    b.disabled = isDemo();
    if (isDemo()) b.title = 'Disabled in demo mode';
  });

  // Tables
  const rosterByMember = Object.fromEntries(ev.roster.map((r) => [r.member_id, r]));
  document.getElementById('bookedTitle').textContent = `Booked (${ev.entries.length})`;
  bookedTable.setRows(ev.entries.map((e) => ({ ...e, invite: rosterByMember[e.member_id] || {} })));
  const pending = ev.roster.filter((r) => !r.entry_id);
  document.getElementById('pendingTitle').textContent = `Not booked yet (${pending.length})`;
  pendingTable.setRows(pending);

  document.getElementById('sheetPreview').innerHTML = buildSheet();
}

function setControlsDisabled(disabled) {
  ['toggleLocked', 'toggleEnabled', 'btnRemindAll', 'btnExportPdf', 'btnArchive', 'btnDelete'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

// --- Table definitions ---

function copyLinkButton(row) {
  const link = row.personal_link || row.invite?.personal_link;
  return link ? `<button class="btn-sm btn-primary" onclick="U.copyText('${U.esc(link)}')" title="Copy this member's personal booking link">Copy link</button>` : '';
}

function bookedActions(row) {
  if (ev.is_archived) return copyLinkButton(row);
  return `<button class="btn-sm btn-primary" onclick="openBookModal(${row.member_id})" title="Move this booking or edit the answers">Change</button>
    <button class="btn-sm btn-danger" onclick="cancelBooking(${row.member_id})" title="Cancel this member's booking">Cancel booking</button>
    ${copyLinkButton(row)}`;
}

function bookedColumns(fields) {
  return [
    { key: 'slot', label: 'Slot', sortable: true, tdStyle: 'white-space:nowrap;',
      sortValue: (r) => `${r.slot_date} ${r.start_time}`,
      render: (r) => `${U.esc(dayShort(r.slot_date))}<br><span class="bk-muted">${U.esc(timeRange(r))}</span>` },
    { key: 'member', label: 'Member', sortable: true, sortValue: (r) => r.display_name, render: (r) => `<strong>${U.esc(r.display_name)}</strong>` },
    ...fields.map((f) => ({
      key: `f:${f.id}`, label: U.esc(f.label), mobileLabel: U.esc(f.label), sortable: true,
      sortValue: (r) => r.field_values?.[f.id] || '',
      render: (r) => U.esc(r.field_values?.[f.id] || '') || '<span class="bk-muted">—</span>',
    })),
    { key: 'booked_at', label: 'Booked', sortable: true, tdStyle: 'white-space:nowrap;',
      sortValue: (r) => r.updated_at || r.booked_at,
      render: (r) => `${U.esc(U.formatDateTime(r.updated_at || r.booked_at, locale(), timezone()))}<br><span class="source-badge" title="${r.source === 'admin' ? 'Booked by an administrator' : 'Booked by the member'}">${r.source === 'admin' ? 'Admin' : 'Member'}</span>` },
    { key: 'actions', label: 'Actions', sortable: false, thStyle: 'text-align:center;', render: (r) => `<div class="bk-actions">${bookedActions(r)}</div>` },
  ];
}

function bookedCard(r) {
  return {
    title: U.esc(r.display_name),
    badge: `<span class="source-badge">${r.source === 'admin' ? 'Admin' : 'Member'}</span>`,
    rows: [
      ['Slot', `${U.esc(dayShort(r.slot_date))} ${U.esc(timeRange(r))}`],
      ...(ev?.fields || []).map((f) => [U.esc(f.label), U.esc(r.field_values?.[f.id] || '') || '—']),
      ['Booked', U.esc(U.formatDateTime(r.updated_at || r.booked_at, locale(), timezone()))],
    ],
    actions: bookedActions(r),
  };
}

function contactText(r) {
  const parts = [];
  if (r.email) parts.push('Email');
  if (r.mobile) parts.push('Mobile');
  return parts.length ? parts.join(' · ') : '<span style="color:var(--danger);">No contact details</span>';
}

function notifiedText(r) {
  if (!r.notified_at) return '<span class="bk-muted">Not notified</span>';
  return `${U.esc(U.formatDateTime(r.notified_at, locale(), timezone()))}<br><span class="bk-muted">${U.esc((r.notified_via || '').replace(',', ' + '))}</span>`;
}

function pendingActions(r) {
  if (ev.is_archived) return copyLinkButton(r);
  return `<button class="btn-sm btn-success" onclick="openBookModal(${r.member_id})" title="Book a slot on this member's behalf">Book</button>
    <button class="btn-sm btn-primary" onclick="openRemindModal(${r.member_id})" ${isOpen() ? 'title="Send this member a reminder"' : 'disabled title="Reminders can only be sent while the event is open"'}>Remind</button>
    ${copyLinkButton(r)}`;
}

function pendingColumns() {
  return [
    { key: 'member', label: 'Member', sortable: true, sortValue: (r) => r.display_name, render: (r) => `<strong>${U.esc(r.display_name)}</strong>` },
    { key: 'contact', label: 'Contact', sortable: true, sortValue: (r) => (r.email ? 2 : 0) + (r.mobile ? 1 : 0), render: contactText },
    { key: 'notified_at', label: 'Last notified', sortable: true, sortValue: (r) => r.notified_at || '', render: notifiedText },
    { key: 'actions', label: 'Actions', sortable: false, thStyle: 'text-align:center;', render: (r) => `<div class="bk-actions">${pendingActions(r)}</div>` },
  ];
}

function pendingCard(r) {
  return {
    title: U.esc(r.display_name),
    rows: [['Contact', contactText(r)], ['Last notified', notifiedText(r)]],
    actions: pendingActions(r),
  };
}

// --- Booking sheet (screen preview, print and PDF share one renderer) ---

function buildSheet() {
  const fields = ev.fields || [];
  const days = [...new Set(ev.slots.map((s) => s.slot_date))].sort();
  const entriesBySlot = {};
  ev.entries.forEach((e) => (entriesBySlot[e.slot_id] = entriesBySlot[e.slot_id] || []).push(e));
  const blank = `<td></td>`.repeat(fields.length);
  const pending = ev.roster.filter((r) => !r.entry_id).map((r) => r.display_name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  let html = `
    <div class="rpt-header">
      <h1>${U.esc(ev.name)}</h1>
      ${ev.location ? `<p><strong>Location:</strong> ${U.esc(ev.location)}</p>` : ''}
      ${ev.contact_info ? `<p><strong>Contact:</strong> ${U.esc(ev.contact_info)}</p>` : ''}
      <p><strong>Booked:</strong> ${ev.stats.booked} of ${ev.stats.invited} invited members &bull; Generated ${U.esc(U.formatDateTime(new Date().toISOString(), locale(), timezone()))}</p>
    </div>`;

  days.forEach((d) => {
    html += `<div class="rpt-group-header">${U.esc(dayLong(d))}</div>
      <table class="rpt-table"><thead><tr>
        <th style="width:150px;">Time</th><th>Member</th>${fields.map((f) => `<th>${U.esc(f.label)}</th>`).join('')}<th style="width:40px;" title="Tick when seen">&#10003;</th>
      </tr></thead><tbody>`;
    ev.slots.filter((s) => s.slot_date === d && !s.is_blocked).forEach((s) => {
      const booked = (entriesBySlot[s.id] || []).slice().sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
      booked.forEach((e, i) => {
        html += `<tr><td class="bk-time" style="white-space:nowrap;">${i === 0 ? U.esc(timeRange(s)) : ''}</td><td>${U.esc(e.display_name)}</td>${fields.map((f) => `<td>${U.esc(e.field_values?.[f.id] || '')}</td>`).join('')}<td></td></tr>`;
      });
      const free = s.capacity - booked.length;
      if (free > 0) {
        html += `<tr><td class="bk-time" style="white-space:nowrap;">${booked.length === 0 ? U.esc(timeRange(s)) : ''}</td><td class="bk-free">${free > 1 ? `${free} places free` : 'free'}</td>${blank}<td></td></tr>`;
      }
    });
    html += '</tbody></table>';
  });

  if (pending.length) {
    html += `<div class="rpt-group-header">Not booked (${pending.length})</div><p>${pending.map((n) => U.esc(n)).join(', ')}</p>`;
  }
  return html;
}

function printSheet() {
  if (!ev) return;
  document.getElementById('printArea').innerHTML = `<div class="bk-sheet-paper" style="border:none;">${buildSheet()}</div>`;
  window.print();
}

async function exportPdf() {
  if (!ev) return;
  const btn = document.getElementById('btnExportPdf');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating...';
  const fullHtml = `
    <html><head><style>
      body { font-family: sans-serif; font-size: 12px; color: #000; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      p { margin: 2px 0; }
      .rpt-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      .rpt-table th, .rpt-table td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
      .rpt-table th { background-color: #eee; font-weight: bold; }
      .rpt-table tr { page-break-inside: avoid; }
      .rpt-header { border-bottom: 2px solid #333; margin-bottom: 16px; padding-bottom: 10px; }
      .rpt-group-header { background-color: #343a40; color: white; padding: 5px 10px; font-weight: bold; margin-top: 15px; page-break-after: avoid; }
      .bk-free { color: #888; font-style: italic; }
    </style></head><body>${buildSheet()}</body></html>`;
  try {
    const res = await fetch('/api/reports/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHtml, title: ev.name }),
    });
    if (!res.ok) throw new Error('The server could not generate the PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Booking-sheet-${ev.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'event'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('PDF downloaded', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// --- Lifecycle controls ---

async function patchEvent(path, body, successMsg) {
  const res = await fetch(`/api/bookings/events/${eventId}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  showToast(successMsg, 'success');
}

async function setLocked(input) {
  const locked = input.checked;
  const ok = await confirmAction(locked ? 'Lock Bookings' : 'Unlock Bookings', locked
    ? 'Members will still see the event but can no longer book, change or cancel. Admins can still edit bookings here.'
    : 'Members will be able to book again.');
  if (!ok) { input.checked = !locked; return; }
  try {
    await patchEvent('lock', { locked }, locked ? 'Bookings locked' : 'Bookings unlocked');
  } catch (e) {
    showToast(e.message, 'error');
  }
  loadEvent();
}

async function setEnabled(input) {
  const enabled = input.checked;
  const ok = await confirmAction(enabled ? 'Enable Booking Link' : 'Disable Booking Link', enabled
    ? 'The booking link will work again.'
    : 'The booking link will show "currently unavailable" until you enable it again.');
  if (!ok) { input.checked = !enabled; return; }
  try {
    await patchEvent('enable', { enabled }, enabled ? 'Booking link enabled' : 'Booking link disabled');
  } catch (e) {
    showToast(e.message, 'error');
  }
  loadEvent();
}

async function archiveEvent() {
  if (isDemo()) return showToast('Archiving disabled in Demo Mode', 'warning');
  const ok = await confirmAction('Archive Booking Event',
    `Archive '<strong>${U.esc(ev.name)}</strong>'?<br><br>The booking link will stop working <strong>permanently</strong> and bookings can no longer be changed. This cannot be reversed. You can still print the booking sheet afterwards.`);
  if (!ok) return;
  try {
    const res = await fetch(`/api/bookings/events/${eventId}/archive`, { method: 'PUT' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Archive failed');
    showToast('Booking event archived', 'success');
    loadEvent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteEvent() {
  if (isDemo()) return showToast('Deletion disabled in Demo Mode', 'warning');
  const ok = await confirmAction('Delete Booking Event',
    `Permanently delete '<strong>${U.esc(ev.name)}</strong>' and all <strong>${ev.entries.length}</strong> booking${ev.entries.length === 1 ? '' : 's'}? This cannot be undone.`);
  if (!ok) return;
  try {
    const res = await fetch(`/api/bookings/events/${eventId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deletion failed');
    showToast('Booking event deleted', 'success');
    setTimeout(() => (window.location.href = 'live-bookings.html'), 800);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// --- Admin booking (book / move / edit answers) ---

function openBookModal(memberId) {
  const member = ev.roster.find((r) => r.member_id === memberId);
  if (!member) return;
  const entry = ev.entries.find((e) => e.member_id === memberId);
  bookTarget = memberId;
  document.getElementById('bookModalTitle').textContent = entry ? 'Change booking' : 'Book a slot';
  document.getElementById('bookModalIntro').textContent = entry
    ? `${member.display_name} is booked for ${dayShort(entry.slot_date)} ${timeRange(entry)}.`
    : `Book a slot on behalf of ${member.display_name}.`;

  const now = `${U.todayLocal(timezone())}`;
  const select = document.getElementById('bookSlot');
  const days = [...new Set(ev.slots.map((s) => s.slot_date))].sort();
  select.innerHTML = days.map((d) => `<optgroup label="${U.esc(dayLong(d))}">${ev.slots.filter((s) => s.slot_date === d && !s.is_blocked).map((s) => {
    const mine = entry && entry.slot_id === s.id;
    const free = s.capacity - s.booked_count;
    const full = free <= 0 && !mine;
    const notes = [mine ? 'current' : full ? 'full' : `${free} free`];
    if (d < now) notes.push('past');
    return `<option value="${s.id}" ${full ? 'disabled' : ''} ${mine ? 'selected' : ''}>${U.esc(timeRange(s))} · ${notes.join(' · ')}</option>`;
  }).join('')}</optgroup>`).join('');
  if (!entry) {
    const firstFree = select.querySelector('option:not([disabled])');
    if (firstFree) firstFree.selected = true;
  }

  const values = entry ? entry.field_values || {} : {};
  document.getElementById('bookFields').innerHTML = (ev.fields || []).map((f) => {
    const input = f.type === 'textarea'
      ? `<textarea id="bookField-${U.esc(f.id)}" rows="3" title="${U.esc(f.label)}">${U.esc(values[f.id] || '')}</textarea>`
      : `<input id="bookField-${U.esc(f.id)}" type="${f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}" value="${U.esc(values[f.id] || '')}" title="${U.esc(f.label)}">`;
    return `<div class="bk-modal-field"><label for="bookField-${U.esc(f.id)}">${U.esc(f.label)}</label>${input}</div>`;
  }).join('');

  openModal('bookModal');
}

async function saveAdminBooking() {
  const slotId = parseInt(document.getElementById('bookSlot').value, 10);
  if (!slotId) return showToast('Please choose a slot.', 'warning');
  const fieldValues = {};
  (ev.fields || []).forEach((f) => {
    const el = document.getElementById(`bookField-${f.id}`);
    if (el) fieldValues[f.id] = el.value.trim();
  });
  const btn = document.getElementById('btnSaveBooking');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/bookings/events/${eventId}/bookings/${bookTarget}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, fieldValues }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Booking failed');
    closeModal('bookModal');
    showToast('Booking saved', 'success');
    loadEvent();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function cancelBooking(memberId) {
  const entry = ev.entries.find((e) => e.member_id === memberId);
  if (!entry) return;
  const ok = await confirmAction('Cancel Booking',
    `Cancel the booking for <strong>${U.esc(entry.display_name)}</strong> on ${U.esc(dayShort(entry.slot_date))} ${U.esc(timeRange(entry))}? The slot becomes free again.`);
  if (!ok) return;
  try {
    const res = await fetch(`/api/bookings/events/${eventId}/bookings/${memberId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cancel failed');
    showToast('Booking cancelled', 'success');
    loadEvent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// --- Reminders ---

function openRemindModal(memberId) {
  if (!isOpen()) return showToast('Reminders can only be sent while the event is open.', 'warning');
  remindTarget = memberId || null;
  const pending = ev.roster.filter((r) => !r.entry_id);
  const member = memberId ? ev.roster.find((r) => r.member_id === memberId) : null;
  document.getElementById('remindIntro').innerHTML = member
    ? `Send <strong>${U.esc(member.display_name)}</strong> a reminder to book.`
    : `Send a reminder to the <strong>${pending.length}</strong> member${pending.length === 1 ? '' : 's'} who haven't booked yet.`;
  document.getElementById('remindEmail').checked = true;
  document.getElementById('remindWhatsapp').checked = true;
  document.getElementById('remindDemoNote').style.display = isDemo() ? 'block' : 'none';
  openModal('remindModal');
}

async function sendReminders() {
  const notify = {
    email: document.getElementById('remindEmail').checked,
    whatsapp: document.getElementById('remindWhatsapp').checked,
  };
  if (!notify.email && !notify.whatsapp) return showToast('Tick at least one channel.', 'warning');
  const btn = document.getElementById('btnSendRemind');
  btn.disabled = true;
  showGlobalSpinner('Sending reminders...');
  try {
    const res = await fetch(`/api/bookings/events/${eventId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remindTarget ? { memberId: remindTarget, notify } : { notify }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sending failed');
    closeModal('remindModal');
    const n = data.notifications || {};
    const parts = [];
    if (n.emailSent) parts.push(`${n.emailSent} email${n.emailSent === 1 ? '' : 's'}`);
    if (n.whatsappSent + n.whatsappQueued) parts.push(`${n.whatsappSent + n.whatsappQueued} WhatsApp`);
    const summary = parts.length ? parts.join(', ') : 'nothing — no matching channel or contact details';
    showToast(`${n.simulated ? 'Simulated' : 'Sent'}: ${summary}${n.failed ? ` (${n.failed} failed)` : ''}`, n.failed ? 'warning' : 'success');
    loadEvent();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    hideGlobalSpinner();
    btn.disabled = false;
  }
}
