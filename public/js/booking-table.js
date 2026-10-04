// public/js/booking-table.js — client-side table used by the Booking Events pages.
//
// Implements the app's Table Convention in one place for the three booking
// tables (live events list, dashboard "booked" and "not booked"):
//   • desktop <table> with sortable headers (▲ / ▼ / ⇅)
//   • footer pagination bar (Rows per page: 10/25/50/100/All, First/Prev/X of Y/Next/Last)
//   • mobile (≤ 768px) card list with the same pagination bar and a sort accordion
//   • rows-per-page ("<prefKey>Limit") and sort ("<prefKey>Sort" = "col:dir") persisted
//     to /api/user-preferences
//
// Usage:
//   const t = new BookingTable({
//     root: document.getElementById('x'), prefKey: 'liveBookings', idPrefix: 'lb',
//     columns: [{ key, label, sortable, sortValue(row), render(row), thStyle, tdStyle, mobileLabel }],
//     defaultSort: { col: 'name', dir: 'asc' },
//     renderCard(row) => ({ title, badge, rows: [[label, html]], actions }),
//     emptyMessage: 'No records.',
//   });
//   await t.init(); t.setRows(rows);
(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .bt-card-list { display: none; }
    @media (max-width: 768px) {
      .bt-table-wrapper { display: none; }
      .bt-card-list { display: block; }
      .bt-sort-bar:not(.sort-expanded) { display: none !important; }
    }`;
  document.head.appendChild(style);

  const ICON = {
    first: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline><line x1="6" y1="6" x2="6" y2="18"></line></svg>',
    prev: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    next: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    last: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline><line x1="18" y1="6" x2="18" y2="18"></line></svg>',
    chevron: '<svg class="filter-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
  };

  const LIMIT_OPTIONS = ['10', '25', '50', '100', 'all'];

  function compare(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined || a === '') return 1;   // blanks last
    if (b === null || b === undefined || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  }

  async function getPref(key) {
    try {
      const res = await fetch(`/api/user-preferences/${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.value != null ? String(data.value) : null;
    } catch {
      return null;
    }
  }

  function savePref(key, value) {
    fetch('/api/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    }).catch(() => {});
  }

  class BookingTable {
    constructor(cfg) {
      this.cfg = cfg;
      this.rows = [];
      this.page = 1;
      this.limitRaw = '25';
      this.sortCol = cfg.defaultSort.col;
      this.sortDir = cfg.defaultSort.dir;
      this.id = cfg.idPrefix;
    }

    get sortableColumns() {
      return this.cfg.columns.filter((c) => c.sortable);
    }

    get limit() {
      return this.limitRaw === 'all' ? 99999 : parseInt(this.limitRaw, 10) || 25;
    }

    async init() {
      const [limit, sort] = await Promise.all([getPref(`${this.cfg.prefKey}Limit`), getPref(`${this.cfg.prefKey}Sort`)]);
      if (limit && LIMIT_OPTIONS.includes(limit)) this.limitRaw = limit;
      if (sort && sort.includes(':')) {
        const [col, dir] = sort.split(':');
        if (this.cfg.columns.some((c) => c.key === col && c.sortable) && (dir === 'asc' || dir === 'desc')) {
          this.sortCol = col;
          this.sortDir = dir;
        }
      }
      this.build();
    }

    /** Replace the column set (e.g. dynamic booking fields) and rebuild the markup. */
    setColumns(columns) {
      this.cfg.columns = columns;
      if (!columns.some((c) => c.key === this.sortCol && c.sortable)) {
        this.sortCol = this.cfg.defaultSort.col;
        this.sortDir = this.cfg.defaultSort.dir;
      }
      this.build();
      this.render();
    }

    setRows(rows) {
      this.rows = rows.slice();
      const pages = this.totalPages();
      if (this.page > pages) this.page = pages;
      this.render();
    }

    totalPages() {
      return Math.max(1, Math.ceil(this.rows.length / this.limit));
    }

    paginationHtml(suffix) {
      const p = `${this.id}${suffix}`;
      return `
        <div class="pagination-container" id="${p}Pagination" style="display:none;">
          <div class="page-limit-selector">
            <label>Rows per page:</label>
            <select id="${p}RowsPerPage" data-bt="limit"
              style="padding:4px; border-radius:4px; border:1px solid var(--border-color); background-color: var(--input-bg); color: var(--text-main);"
              title="Number of rows to display per page">
              ${LIMIT_OPTIONS.map((o) => `<option value="${o}">${o === 'all' ? 'All' : o}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:0;">
            <button type="button" class="btn-page" data-bt="first" title="First page" style="margin:0 1px;">${ICON.first}</button>
            <button type="button" class="btn-page" data-bt="prev" title="Previous page" style="margin:0 1px;">${ICON.prev}</button>
            <button type="button" class="btn-page" data-bt="info" style="width:auto; min-width:52px; padding:0 8px; font-size:0.8em; cursor:default; pointer-events:none; white-space:nowrap; margin:0 1px;">1 of 1</button>
            <button type="button" class="btn-page" data-bt="next" title="Next page" style="margin:0 1px;">${ICON.next}</button>
            <button type="button" class="btn-page" data-bt="last" title="Last page" style="margin:0 1px;">${ICON.last}</button>
          </div>
        </div>`;
    }

    build() {
      const { root, columns } = this.cfg;
      const sortable = this.sortableColumns;
      root.innerHTML = `
        ${sortable.length ? `
        <div class="sort-section">
          <button type="button" class="sort-toggle-btn" data-bt="sort-toggle" title="Show or hide sort options">
            <span>Sort by</span>${ICON.chevron}
          </button>
          <div class="sort-bar-container bt-sort-bar">
            <span class="sort-bar-label">Sort:</span>
            ${sortable.map((c) => `<button type="button" class="sort-bar-btn" data-sort="${c.key}" title="Sort by ${c.mobileLabel || c.label}">${c.mobileLabel || c.label} <span class="bt-msort"></span></button>`).join('')}
          </div>
        </div>` : ''}
        <div class="table-wrapper bt-table-wrapper">
          <table style="width:100%;">
            <thead><tr>
              ${columns.map((c) => c.sortable
                ? `<th class="sortable" data-sort="${c.key}" style="${c.thStyle || ''}" title="Sort by ${c.label}"><div class="th-content">${c.label} <span class="sort-icon">⇅</span></div></th>`
                : `<th style="${c.thStyle || ''}">${c.label}</th>`).join('')}
            </tr></thead>
            <tbody></tbody>
          </table>
          ${this.paginationHtml('')}
        </div>
        <div class="card-list bt-card-list">
          <div class="bt-cards"></div>
          ${this.paginationHtml('Mobile')}
        </div>`;

      root.querySelectorAll('[data-sort]').forEach((el) => el.addEventListener('click', () => this.sortBy(el.dataset.sort)));
      const toggle = root.querySelector('[data-bt="sort-toggle"]');
      if (toggle) {
        toggle.addEventListener('click', () => {
          const bar = root.querySelector('.bt-sort-bar');
          toggle.classList.toggle('expanded', bar.classList.toggle('sort-expanded'));
        });
      }
      root.querySelectorAll('.pagination-container').forEach((pc) => {
        pc.querySelector('[data-bt="limit"]').addEventListener('change', (e) => this.changeLimit(e.target.value));
        pc.querySelector('[data-bt="first"]').addEventListener('click', () => this.goTo(1));
        pc.querySelector('[data-bt="prev"]').addEventListener('click', () => this.goTo(this.page - 1));
        pc.querySelector('[data-bt="next"]').addEventListener('click', () => this.goTo(this.page + 1));
        pc.querySelector('[data-bt="last"]').addEventListener('click', () => this.goTo(this.totalPages()));
      });
    }

    sortBy(col) {
      if (this.sortCol === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      else { this.sortCol = col; this.sortDir = 'asc'; }
      savePref(`${this.cfg.prefKey}Sort`, `${this.sortCol}:${this.sortDir}`);
      this.render();
    }

    changeLimit(value) {
      this.limitRaw = value;
      this.page = 1;
      savePref(`${this.cfg.prefKey}Limit`, value);
      this.render();
    }

    goTo(page) {
      const target = Math.min(Math.max(1, page), this.totalPages());
      if (target === this.page) return;
      this.page = target;
      this.render();
    }

    sortedRows() {
      const col = this.cfg.columns.find((c) => c.key === this.sortCol);
      if (!col) return this.rows.slice();
      const valueOf = col.sortValue || ((r) => r[col.key]);
      const dir = this.sortDir === 'asc' ? 1 : -1;
      return this.rows.slice().sort((a, b) => dir * compare(valueOf(a), valueOf(b)) || 0);
    }

    render() {
      const { root, columns } = this.cfg;
      if (!root.querySelector('tbody')) return;
      const sorted = this.sortedRows();
      const start = (this.page - 1) * this.limit;
      const pageRows = sorted.slice(start, start + this.limit);

      // Header + mobile sort indicators
      root.querySelectorAll('th.sortable').forEach((th) => {
        const active = th.dataset.sort === this.sortCol;
        th.classList.toggle('sort-asc', active && this.sortDir === 'asc');
        th.classList.toggle('sort-desc', active && this.sortDir === 'desc');
        th.querySelector('.sort-icon').textContent = active ? (this.sortDir === 'asc' ? '▲' : '▼') : '⇅';
      });
      root.querySelectorAll('.sort-bar-btn').forEach((btn) => {
        const active = btn.dataset.sort === this.sortCol;
        btn.classList.toggle('active', active);
        btn.querySelector('.bt-msort').textContent = active ? (this.sortDir === 'asc' ? '▲' : '▼') : '';
      });

      // Desktop rows
      const tbody = root.querySelector('tbody');
      tbody.innerHTML = '';
      if (pageRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center; padding:25px; color:var(--text-muted);">${this.cfg.emptyMessage}</td></tr>`;
      } else {
        pageRows.forEach((row) => {
          const tr = document.createElement('tr');
          if (this.cfg.rowStyle) tr.style.cssText = this.cfg.rowStyle(row) || '';
          tr.innerHTML = columns.map((c) => `<td style="${c.tdStyle || ''}">${c.render ? c.render(row) : (row[c.key] ?? '')}</td>`).join('');
          tbody.appendChild(tr);
        });
      }

      // Mobile cards
      const cards = root.querySelector('.bt-cards');
      if (pageRows.length === 0) {
        cards.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">${this.cfg.emptyMessage}</p>`;
      } else {
        cards.innerHTML = pageRows.map((row) => {
          const c = this.cfg.renderCard(row);
          return `
            <div class="table-card" style="${this.cfg.rowStyle ? this.cfg.rowStyle(row) || '' : ''}">
              <div class="card-header">
                <span class="card-title">${c.title}</span>
                ${c.badge || ''}
              </div>
              <div class="card-body">
                ${c.rows.map(([label, value]) => `<div class="card-row"><span class="card-label">${label}${/[?:!.]$/.test(label) ? '' : ':'}</span><span>${value}</span></div>`).join('')}
              </div>
              ${c.actions ? `<div class="card-actions">${c.actions}</div>` : ''}
            </div>`;
        }).join('');
      }

      // Both pagination bars share state
      const pages = this.totalPages();
      root.querySelectorAll('.pagination-container').forEach((pc) => {
        pc.style.display = this.rows.length > 0 ? 'flex' : 'none';
        pc.querySelector('[data-bt="limit"]').value = this.limitRaw;
        pc.querySelector('[data-bt="info"]').textContent = `${this.page} of ${pages}`;
        pc.querySelector('[data-bt="first"]').disabled = this.page <= 1;
        pc.querySelector('[data-bt="prev"]').disabled = this.page <= 1;
        pc.querySelector('[data-bt="next"]').disabled = this.page >= pages;
        pc.querySelector('[data-bt="last"]').disabled = this.page >= pages;
      });

      if (this.cfg.onRender) this.cfg.onRender();
    }
  }

  window.BookingTable = BookingTable;

  // ── Shared formatting helpers for the booking pages ───────────────────────
  // Slot dates/times are brigade wall-clock values: build them in UTC and format
  // with timeZone 'UTC' so they never shift. Audit timestamps are stored in UTC
  // ('YYYY-MM-DD HH:MM:SS') and are displayed in the configured app timezone.
  window.BookingUtil = {
    esc(s) {
      const d = document.createElement('div');
      d.textContent = String(s ?? '');
      return d.innerHTML;
    },
    formatDay(iso, locale, opts) {
      if (!iso) return '';
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale || 'en-NZ',
        { ...(opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), timeZone: 'UTC' });
    },
    formatTime(hhmm, locale) {
      if (!hhmm) return '';
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale || 'en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    },
    formatDateTime(utc, locale, timeZone) {
      if (!utc) return '';
      const iso = /Z|[+-]\d\d:?\d\d$/.test(utc) ? utc : utc.replace(' ', 'T') + 'Z';
      return new Date(iso).toLocaleString(locale || 'en-NZ', { timeZone: timeZone || undefined, dateStyle: 'medium', timeStyle: 'short' });
    },
    todayLocal(timeZone) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    },
    status(ev) {
      if (ev.is_archived) return { key: 'archived', label: 'Archived', order: 3 };
      if (!ev.is_enabled) return { key: 'disabled', label: 'Disabled', order: 2 };
      if (ev.is_locked) return { key: 'locked', label: 'Locked', order: 1 };
      return { key: 'open', label: 'Open', order: 0 };
    },
    statusBadge(ev) {
      const s = window.BookingUtil.status(ev);
      const tips = {
        open: 'Members can book, change and cancel',
        locked: 'Members can view but not change bookings',
        disabled: 'The booking link is switched off',
        archived: 'The booking link no longer works',
      };
      return `<span class="bk-status ${s.key}" title="${tips[s.key]}">${s.label}</span>`;
    },
    async copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (window.showToast) showToast('Link copied to the clipboard', 'success');
    },
  };
})();
