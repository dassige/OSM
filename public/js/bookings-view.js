// public/js/bookings-view.js — public booking page (/booking/<publicId>[?code=...])
(function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/booking\/([^/?#]+)/);
  const publicId = decodeURIComponent(pathMatch ? pathMatch[1] : params.get('id') || '');
  const accessCode = params.get('code') || '';
  const memberStorageKey = `booking_member_${publicId}`;

  let uiConfig = null;
  let data = null;         // last GET payload
  let memberId = null;     // selected member (general links)
  let selectedSlotId = null;
  let changing = false;    // member chose "Change" on an existing booking

  const locale = () => uiConfig?.locale || 'en-NZ';
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  // Slot dates/times are local wall-clock values for the event's location — format in UTC so they never shift.
  function formatDay(iso, long) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), long
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  function formatTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  }
  const slotLabel = (s) => `${formatDay(s.slot_date, true)}, ${formatTime(s.start_time)}–${formatTime(s.end_time)}`;

  function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } }

  function showError(message) {
    $('loading').style.display = 'none';
    $('content').style.display = 'none';
    $('errorBox').textContent = message;
    $('errorBox').style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const res = await fetch('/ui-config');
      if (res.ok) uiConfig = await res.json();
    } catch { /* defaults */ }

    const appName = uiConfig?.loginTitle || 'OpReady';
    $('brandName').textContent = appName;
    if (uiConfig?.appLogo) $('brandLogo').src = uiConfig.appLogo;
    $('brand').style.display = 'flex';
    if (uiConfig?.appBackground) document.body.style.backgroundImage = `url('${uiConfig.appBackground}')`;
    document.title = `Book a Slot - ${appName}`;

    if (!UUID_RE.test(publicId)) {
      return showError('This booking link is not valid. Please check you copied the whole link.');
    }
    if (accessCode && !UUID_RE.test(accessCode)) {
      return showError('This personal booking link is not valid. Please use the link you received.');
    }

    const saved = lsGet(memberStorageKey);
    if (!accessCode && saved && /^\d+$/.test(saved)) memberId = parseInt(saved, 10);
    load();
  });

  async function load() {
    const qs = new URLSearchParams();
    if (accessCode) qs.set('code', accessCode);
    else if (memberId) qs.set('memberId', String(memberId));
    let res;
    try {
      res = await fetch(`/api/live-bookings/${publicId}${qs.toString() ? `?${qs}` : ''}`);
    } catch {
      return showError('Unable to reach the booking service. Please check your connection and try again.');
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 400 && memberId && !accessCode) {
      // Remembered name is no longer on the list — forget it and start again
      memberId = null;
      lsSet(memberStorageKey, '');
      return load();
    }
    if (!res.ok) return showError(body.error || 'This booking page could not be loaded.');
    data = body;
    render();
  }

  function canChange() {
    return data.event.allow_cancel && !data.event.is_locked;
  }

  function render() {
    const ev = data.event;
    $('loading').style.display = 'none';
    $('errorBox').style.display = 'none';
    $('content').style.display = 'block';
    document.title = `${ev.name} - ${uiConfig?.loginTitle || 'OpReady'}`;

    $('evName').textContent = ev.name;
    const meta = [];
    if (ev.location) meta.push(`<span>📍 <strong>${esc(ev.location)}</strong></span>`);
    if (ev.contact_info) meta.push(`<span>Contact: <strong>${esc(ev.contact_info)}</strong></span>`);
    meta.push(`<span>${ev.slot_minutes}-minute appointments</span>`);
    $('evMeta').innerHTML = meta.join('');
    // Description is admin-authored rich text, sanitised on the server when saved
    $('evDescription').innerHTML = ev.description || '';
    $('evDescription').style.display = ev.description ? 'block' : 'none';

    const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
    $('tzNote').textContent = deviceTz && deviceTz !== ev.timezone
      ? `All times are local to the event (${ev.timezone}). Your device is set to ${deviceTz}.`
      : `All times are local time (${ev.timezone}).`;

    const notice = $('statusNotice');
    if (ev.is_locked) {
      notice.className = 'bv-notice warn';
      notice.innerHTML = '<strong>Bookings are closed.</strong> You can still see the schedule, but bookings can no longer be made or changed. Please contact the organiser if you need help.';
      notice.style.display = 'block';
    } else {
      notice.style.display = 'none';
    }

    renderIdentity();
    renderMyBooking();
    renderSlots();
    renderForm();
  }

  function renderIdentity() {
    const personal = data.event.access_type === 'personal';
    $('meCard').style.display = personal && data.me ? 'block' : 'none';
    if (personal && data.me) $('meName').textContent = data.me.displayName;

    $('whoCard').style.display = personal ? 'none' : 'block';
    if (personal) return;
    const select = $('whoSelect');
    select.innerHTML = `<option value="">— Select your name —</option>` + (data.roster || []).map((r) =>
      `<option value="${r.memberId}" ${r.memberId === memberId ? 'selected' : ''}>${esc(r.displayName)}${r.hasBooked ? ' (booked)' : ''}</option>`).join('');
    select.onchange = () => {
      memberId = select.value ? parseInt(select.value, 10) : null;
      lsSet(memberStorageKey, memberId ? String(memberId) : '');
      selectedSlotId = null;
      changing = false;
      load();
    };
  }

  function renderMyBooking() {
    const booking = data.me && data.me.booking;
    $('myBookingCard').style.display = booking ? 'block' : 'none';
    if (!booking) return;
    const slot = data.slots.find((s) => s.id === booking.slotId);
    $('myBookingWhen').textContent = slotLabel(booking);
    const started = slot && slot.is_past;
    const allowed = canChange() && !started;
    $('btnChange').style.display = allowed && !changing ? '' : 'none';
    $('btnCancel').style.display = allowed ? '' : 'none';
    let note = '';
    if (started) note = 'Your appointment has already started.';
    else if (data.event.is_locked) note = 'Bookings are closed — contact the organiser to make changes.';
    else if (!data.event.allow_cancel) note = 'To change or cancel this appointment, please contact the organiser.';
    else if (changing) note = 'Choose a new slot below, then confirm.';
    $('myBookingNote').textContent = note;
  }

  function slotState(s) {
    const mine = s.is_mine;
    if (mine) return { disabled: !changing, info: 'Your booking' };
    if (s.is_blocked) return { disabled: true, info: 'Unavailable' };
    if (s.is_past) return { disabled: true, info: 'Started' };
    if (s.available <= 0) return { disabled: true, info: 'Full' };
    return { disabled: false, info: s.capacity > 1 ? `${s.available} of ${s.capacity} places free` : 'Available' };
  }

  function renderSlots() {
    const ev = data.event;
    const personal = ev.access_type === 'personal';
    const hasBooking = !!(data.me && data.me.booking);
    const needName = !personal && !data.me;
    const bookable = !ev.is_locked && !needName && (!hasBooking || changing);

    $('slotsTitle').textContent = hasBooking && !changing ? 'Schedule' : 'Choose a slot';
    let hint = '';
    if (needName) hint = 'Select your name above to book a slot.';
    else if (bookable) hint = hasBooking ? 'Tap a new slot to move your booking.' : 'Tap a free slot to book it.';
    $('slotsHint').textContent = hint;
    $('slotsHint').style.display = hint ? 'block' : 'none';

    const days = [...new Set(data.slots.map((s) => s.slot_date))].sort();
    if (days.length === 0) {
      $('slotsList').innerHTML = '<p class="bv-note">No slots are available for this event.</p>';
      return;
    }
    $('slotsList').innerHTML = days.map((d) => {
      const slots = data.slots.filter((s) => s.slot_date === d);
      return `<div class="bv-day">
        <div class="bv-day-title">${esc(formatDay(d, true))}</div>
        <div class="bv-slots">${slots.map((s) => {
          const st = slotState(s);
          const disabled = !bookable || st.disabled;
          const names = s.booked_names && s.booked_names.length
            ? `<span class="bv-slot-names">${s.booked_names.map(esc).join(', ')}</span>` : '';
          const cls = ['bv-slot', s.is_mine ? 'mine' : '', st.disabled && !s.is_mine ? 'unavail' : '', s.id === selectedSlotId ? 'selected' : ''].join(' ');
          return `<button type="button" class="${cls}" data-slot="${s.id}" ${disabled ? 'disabled' : ''}
              title="${esc(`${formatTime(s.start_time)}–${formatTime(s.end_time)}: ${st.info}`)}">
              <span class="bv-slot-time">${esc(formatTime(s.start_time))}</span>
              <span class="bv-slot-info">${esc(st.info)}</span>${names}
            </button>`;
        }).join('')}</div>
      </div>`;
    }).join('');

    $('slotsList').querySelectorAll('.bv-slot:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => selectSlot(parseInt(btn.dataset.slot, 10)));
    });
  }

  function selectSlot(id) {
    selectedSlotId = id;
    renderSlots();
    renderForm();
    $('formCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderForm() {
    const slot = selectedSlotId && data.slots.find((s) => s.id === selectedSlotId);
    $('formCard').style.display = slot ? 'block' : 'none';
    if (!slot) return;
    const booking = data.me && data.me.booking;
    $('formTitle').textContent = booking ? 'Confirm your change' : 'Confirm your booking';
    $('btnBook').textContent = booking ? (slot.id === booking.slotId ? 'Update my details' : 'Move my booking') : 'Book this slot';
    $('formSlot').textContent = slotLabel(slot);

    // Keep anything already typed when the slot changes
    const typed = {};
    $('formFields').querySelectorAll('[data-field]').forEach((el) => { typed[el.dataset.field] = el.value; });
    const saved = (booking && booking.field_values) || {};
    $('formFields').innerHTML = (data.event.fields || []).map((f) => {
      const value = typed[f.id] ?? saved[f.id] ?? '';
      const id = `fld_${esc(f.id)}`;
      const req = f.required ? ' <span class="bv-req" title="Required">*</span>' : '';
      const input = f.type === 'textarea'
        ? `<textarea id="${id}" data-field="${esc(f.id)}" rows="3" maxlength="1000" ${f.required ? 'required' : ''} title="${esc(f.label)}">${esc(value)}</textarea>`
        : `<input id="${id}" data-field="${esc(f.id)}" type="${f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}"
             ${f.type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : f.type === 'email' ? 'autocomplete="email"' : ''}
             maxlength="${f.type === 'tel' ? 30 : f.type === 'email' ? 254 : 200}" value="${esc(value)}" ${f.required ? 'required' : ''} title="${esc(f.label)}">`;
      return `<div class="bv-field"><label for="${id}">${esc(f.label)}${req}</label>${input}</div>`;
    }).join('');
  }

  window.clearSelection = function () {
    selectedSlotId = null;
    if (changing) changing = false;
    renderMyBooking();
    renderSlots();
    renderForm();
  };

  window.startChange = function () {
    changing = true;
    renderMyBooking();
    renderSlots();
    // Pre-select the current slot so details can be updated without moving
    selectSlot(data.me.booking.slotId);
  };

  function identity() {
    return data.event.access_type === 'personal' ? { code: accessCode } : { memberId };
  }

  window.submitBooking = async function () {
    const fieldValues = {};
    let missing = null;
    $('formFields').querySelectorAll('[data-field]').forEach((el) => {
      fieldValues[el.dataset.field] = el.value.trim();
      if (el.required && !el.value.trim() && !missing) missing = el;
    });
    if (missing) {
      missing.focus();
      return showToast(`${missing.title} is required.`, 'warning');
    }
    const btn = $('btnBook');
    btn.disabled = true;
    try {
      const res = await fetch(`/api/live-bookings/${publicId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identity(), slotId: selectedSlotId, fieldValues }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || 'Booking failed. Please try again.', 'error');
        if (res.status === 409) { selectedSlotId = null; await load(); }
        return;
      }
      showToast(`Booked: ${slotLabel(body.booking)}`, 'success');
      selectedSlotId = null;
      changing = false;
      await load();
      $('myBookingCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      showToast('Unable to reach the booking service. Please try again.', 'error');
    } finally {
      btn.disabled = false;
    }
  };

  window.cancelMyBooking = async function () {
    const booking = data.me && data.me.booking;
    if (!booking) return;
    const ok = await confirmAction('Cancel Booking', `Cancel your appointment on <strong>${esc(slotLabel(booking))}</strong>? The slot will be released for someone else.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/live-bookings/${publicId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(body.error || 'Cancelling failed.', 'error');
      showToast('Your booking has been cancelled.', 'success');
      selectedSlotId = null;
      changing = false;
      load();
    } catch {
      showToast('Unable to reach the booking service. Please try again.', 'error');
    }
  };
})();
