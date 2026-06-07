// public/datepicker.js
// Self-contained custom date picker — replaces native type="date" inputs with a
// styled popup calendar that matches OpReady CSS variables (light + dark mode).
//
// Usage: include this script on any page that has <input type="date"> elements.
// It auto-attaches on DOMContentLoaded and exposes window.DatePicker.attachAll()
// for dynamic insertion cases.
//
// Contract with existing page JS:
//   • The original <input type="date"> is changed to type="hidden" (guaranteed zero
//     visual presence — no CSS can override this). Its .id, .value, and .name stay.
//   • Programmatic .value = '' or .value = 'YYYY-MM-DD' assignments are detected
//     via a property setter override and sync the visible display automatically.
//   • A native "change" event (bubbles: true) is dispatched on the hidden input
//     when the user picks or clears a date, triggering onchange handlers.

(function () {
    'use strict';

    // ── Inject CSS ─────────────────────────────────────────────────────────────
    var styleEl = document.createElement('style');
    styleEl.textContent = [
        // Use flex (block-level) not inline-flex — avoids baseline/alignment quirks inside filter bars
        '.dp-wrapper{position:relative;display:flex;align-items:stretch;}',
        '.form-group .dp-wrapper{width:100%;}',
        // Reset styles.css .filter-date rules (padding/border/height) that leak onto the wrapper div
        'input[data-dp-attached]{display:none!important;}',
        '.dp-wrapper.filter-date{width:155px;padding:0;border:none;border-radius:0;background:none;height:38px;}',

        // Visible text field (read-only)
        '.dp-display{flex:1;min-width:0;padding:8px 10px;',
        '  border:1px solid var(--border-color,#dee2e6);border-right:none;',
        '  border-radius:4px 0 0 4px;background-color:var(--input-bg,#fff);',
        '  color:var(--text-main,#333);font-size:0.9em;font-family:inherit;',
        '  cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
        '  height:38px;box-sizing:border-box;caret-color:transparent;outline:none;}',
        '.dp-display.dp-placeholder{color:var(--text-muted,#999);}',
        '.dp-wrapper:focus-within .dp-display{border-color:var(--primary,#007bff);}',

        // Calendar icon button
        '.dp-cal-btn{flex-shrink:0;padding:0 9px;',
        '  border:1px solid var(--border-color,#dee2e6);border-left:none;',
        '  border-radius:0 4px 4px 0;background-color:var(--bg-hover,#f8f9fa);',
        '  color:var(--text-muted,#888);cursor:pointer;height:38px;',
        '  display:flex;align-items:center;justify-content:center;',
        '  transition:background-color .15s,color .15s;}',
        '.dp-cal-btn:hover{background-color:var(--border-color,#dee2e6);color:var(--primary,#007bff);}',
        '.dp-wrapper:focus-within .dp-cal-btn{border-color:var(--primary,#007bff);}',

        // Popup container — z-index must exceed mobile hamburger (#osm-open-btn: 99999)
        '.dp-popup{display:none;position:fixed;z-index:100001;',
        '  background-color:var(--bg-card,#fff);border:1px solid var(--border-color,#dee2e6);',
        '  border-radius:8px;box-shadow:0 4px 24px var(--shadow,rgba(0,0,0,.15));',
        '  width:280px;overflow:hidden;}',
        '.dp-popup.dp-open{display:block;animation:dpSlideIn .12s ease-out;}',
        '@keyframes dpSlideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}',

        // Popup header
        '.dp-hd{display:flex;align-items:center;padding:10px 10px 8px;',
        '  border-bottom:1px solid var(--border-color,#dee2e6);gap:4px;}',
        '.dp-nav{background:none;border:1px solid transparent;border-radius:4px;cursor:pointer;',
        '  width:28px;height:28px;display:flex;align-items:center;justify-content:center;',
        '  color:var(--text-muted,#666);font-size:18px;line-height:1;padding:0;flex-shrink:0;',
        '  transition:background-color .1s;}',
        '.dp-nav:hover{background-color:var(--bg-hover,#f8f9fa);border-color:var(--border-color,#dee2e6);color:var(--text-main,#333);}',
        '.dp-my-btn{flex:1;background:none;border:1px solid transparent;border-radius:4px;cursor:pointer;',
        '  padding:4px 8px;font-weight:600;font-size:.92em;color:var(--text-main,#333);',
        '  text-align:center;height:28px;display:flex;align-items:center;justify-content:center;',
        '  transition:background-color .1s;}',
        '.dp-my-btn:hover{background-color:var(--bg-hover,#f8f9fa);border-color:var(--border-color,#dee2e6);}',
        '.dp-clr{background:none;border:1px solid transparent;border-radius:4px;cursor:pointer;',
        '  width:24px;height:24px;display:flex;align-items:center;justify-content:center;',
        '  color:var(--text-muted,#999);font-size:12px;padding:0;flex-shrink:0;',
        '  transition:background-color .1s,color .1s,border-color .1s;}',
        '.dp-clr:hover{background-color:var(--danger,#dc3545);border-color:var(--danger,#dc3545);color:#fff;}',

        // Calendar grid
        '.dp-grid{padding:8px 10px 4px;}',
        '.dp-wds{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:4px;}',
        '.dp-wd{text-align:center;font-size:.72em;font-weight:700;color:var(--text-muted,#888);',
        '  padding:3px 0;text-transform:uppercase;letter-spacing:.03em;}',
        '.dp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}',
        '.dp-d{text-align:center;border-radius:4px;cursor:pointer;font-size:.85em;',
        '  height:30px;display:flex;align-items:center;justify-content:center;',
        '  border:1px solid transparent;color:var(--text-main,#333);transition:background-color .08s;}',
        '.dp-d:hover:not(.dp-d-sel):not(.dp-d-other){background-color:var(--bg-hover,#f0f2f5);border-color:var(--border-color,#dee2e6);}',
        '.dp-d-other{color:var(--text-muted,#ccc);opacity:.4;}',
        '.dp-d-today:not(.dp-d-sel){border-color:var(--info,#17a2b8)!important;color:var(--info,#17a2b8);font-weight:700;}',
        '.dp-d-sel{background-color:var(--primary,#007bff);color:#fff!important;',
        '  border-color:var(--primary,#007bff)!important;font-weight:700;}',

        // Footer (Today button)
        '.dp-ft{border-top:1px solid var(--border-color,#dee2e6);padding:6px 10px;display:flex;justify-content:center;}',
        '.dp-today-btn{background:none;border:1px solid var(--border-color,#dee2e6);border-radius:4px;',
        '  cursor:pointer;padding:5px 16px;font-size:.82em;color:var(--text-muted,#666);',
        '  transition:background-color .1s,color .1s,border-color .1s;}',
        '.dp-today-btn:hover{background-color:var(--info,#17a2b8);border-color:var(--info,#17a2b8);color:#fff;}',

        // Year/month picker overlay
        '.dp-ym{display:none;padding:10px;}',
        '.dp-ym.dp-ym-open{display:block;}',
        '.dp-yn{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}',
        '.dp-yr{font-weight:700;font-size:.95em;color:var(--text-main,#333);}',
        '.dp-mg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:10px;}',
        '.dp-mo{text-align:center;padding:8px 4px;border-radius:4px;cursor:pointer;font-size:.83em;',
        '  border:1px solid transparent;color:var(--text-main,#333);transition:background-color .1s;}',
        '.dp-mo:hover{background-color:var(--bg-hover,#f8f9fa);border-color:var(--border-color,#dee2e6);}',
        '.dp-mo-sel{background-color:var(--primary,#007bff)!important;color:#fff!important;border-color:var(--primary,#007bff)!important;}',
        '.dp-back-btn{width:100%;padding:6px;text-align:center;cursor:pointer;font-size:.82em;',
        '  border:1px solid var(--border-color,#dee2e6);border-radius:4px;background:none;',
        '  color:var(--text-muted,#666);transition:background-color .1s;}',
        '.dp-back-btn:hover{background-color:var(--bg-hover,#f8f9fa);}'
    ].join('');
    document.head.appendChild(styleEl);

    // ── Constants ──────────────────────────────────────────────────────────────
    var MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    var WD = ['Mo','Tu','We','Th','Fr','Sa','Su'];

    // Prototype descriptor saved once for the value setter override
    var _valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    // Only one popup is open at a time
    var _openInst = null;

    // Close on any scroll or resize while a picker is open
    document.addEventListener('scroll', function () { if (_openInst) _openInst.close(); }, true);
    window.addEventListener('resize',   function () { if (_openInst) _openInst.close(); });

    // ── Helpers ────────────────────────────────────────────────────────────────

    function parseISO(s) {
        if (!s) return null;
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
    }

    function toISO(y, mo, d) {
        return y + '-' + pad2(mo + 1) + '-' + pad2(d);
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function fmtDisplay(iso) {
        var p = parseISO(iso);
        return p ? pad2(p.d) + '/' + pad2(p.mo + 1) + '/' + p.y : '';
    }

    function navBtn(text, title) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'dp-nav';
        b.textContent = text; b.title = title;
        return b;
    }

    // ── DatePicker instance ────────────────────────────────────────────────────

    function DP(input) {
        var self = this;
        self.input = input;
        self._val  = input.value || '';

        var today = new Date();
        self.vy  = today.getFullYear();
        self.vmo = today.getMonth();
        self.ymOpen = false;
        self.ymY    = self.vy;

        // Start the calendar view at the existing value's month if any
        var p = parseISO(self._val);
        if (p) { self.vy = p.y; self.vmo = p.mo; }

        self._buildWrapper();
        self._buildPopup();
        self._hookValueProp();
        self._insertDOM();
    }

    // ── Build the visible wrapper (display input + calendar icon button) ───────

    DP.prototype._buildWrapper = function () {
        var self = this;
        var inp  = self.input;

        self.wrap = document.createElement('div');
        self.wrap.className = 'dp-wrapper';

        // Carry over width-related classes so CSS rules still apply to the wrapper
        inp.classList.forEach(function (c) {
            if (/filter-date|date-input/.test(c)) self.wrap.classList.add(c);
        });
        if (inp.style.width) self.wrap.style.width = inp.style.width;

        // Read-only text display
        self.disp = document.createElement('input');
        self.disp.type      = 'text';
        self.disp.readOnly  = true;
        self.disp.className = 'dp-display' + (self._val ? '' : ' dp-placeholder');
        self.disp.value     = self._val ? fmtDisplay(self._val) : '';
        self.disp.placeholder = 'DD/MM/YYYY';
        self.disp.title    = inp.title || 'Select a date';
        self.disp.tabIndex = inp.tabIndex != null && inp.tabIndex !== -1 ? inp.tabIndex : 0;

        // Calendar icon button
        self.calBtn = document.createElement('button');
        self.calBtn.type      = 'button';
        self.calBtn.className = 'dp-cal-btn';
        self.calBtn.title     = 'Open date picker';
        self.calBtn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"' +
            ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
            '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
            '<line x1="3" y1="10" x2="21" y2="10"/></svg>';

        self.wrap.appendChild(self.disp);
        self.wrap.appendChild(self.calBtn);

        function toggle(e) { e.stopPropagation(); self.toggle(); }
        self.disp.addEventListener('click', toggle);
        self.calBtn.addEventListener('click', toggle);
        self.disp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.toggle(); }
            else if (e.key === 'Escape') self.close();
        });
    };

    // ── Build the floating popup (calendar + year-month picker) ───────────────

    DP.prototype._buildPopup = function () {
        var self = this;

        self.popup = document.createElement('div');
        self.popup.className = 'dp-popup';

        // Stop clicks inside the popup from bubbling to the document close-handler
        self.popup.addEventListener('click', function (e) { e.stopPropagation(); });
        self.popup.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { self.close(); self.disp.focus(); }
        });

        // ── Calendar view ────────────────────────────────────────────────────
        self.calView = document.createElement('div');

        // Header
        var hd = document.createElement('div');
        hd.className = 'dp-hd';
        self.prevBtn = navBtn('‹', 'Previous month');
        self.myBtn   = document.createElement('button');
        self.myBtn.type = 'button'; self.myBtn.className = 'dp-my-btn';
        self.myBtn.title = 'Select month and year';
        self.nextBtn = navBtn('›', 'Next month');
        self.clrBtn  = document.createElement('button');
        self.clrBtn.type = 'button'; self.clrBtn.className = 'dp-clr';
        self.clrBtn.innerHTML = '&#10005;'; self.clrBtn.title = 'Clear date';
        hd.appendChild(self.prevBtn); hd.appendChild(self.myBtn);
        hd.appendChild(self.nextBtn); hd.appendChild(self.clrBtn);

        // Grid: weekday labels + day cells
        var grid = document.createElement('div');
        grid.className = 'dp-grid';
        var wdsRow = document.createElement('div');
        wdsRow.className = 'dp-wds';
        WD.forEach(function (w) {
            var el = document.createElement('div');
            el.className = 'dp-wd'; el.textContent = w;
            wdsRow.appendChild(el);
        });
        self.daysEl = document.createElement('div');
        self.daysEl.className = 'dp-days';
        grid.appendChild(wdsRow);
        grid.appendChild(self.daysEl);

        // Footer: Today shortcut
        var ft = document.createElement('div');
        ft.className = 'dp-ft';
        self.todayBtn = document.createElement('button');
        self.todayBtn.type = 'button'; self.todayBtn.className = 'dp-today-btn';
        self.todayBtn.textContent = 'Today'; self.todayBtn.title = "Select today's date";
        ft.appendChild(self.todayBtn);

        self.calView.appendChild(hd);
        self.calView.appendChild(grid);
        self.calView.appendChild(ft);

        // ── Year/month picker ────────────────────────────────────────────────
        self.ymView = document.createElement('div');
        self.ymView.className = 'dp-ym';

        var yn = document.createElement('div');
        yn.className = 'dp-yn';
        self.ymPrev  = navBtn('‹', 'Previous year');
        self.ymYrEl  = document.createElement('span');
        self.ymYrEl.className = 'dp-yr';
        self.ymNext  = navBtn('›', 'Next year');
        yn.appendChild(self.ymPrev); yn.appendChild(self.ymYrEl); yn.appendChild(self.ymNext);

        self.moGrid = document.createElement('div');
        self.moGrid.className = 'dp-mg';

        var backBtn = document.createElement('button');
        backBtn.type = 'button'; backBtn.className = 'dp-back-btn';
        backBtn.textContent = '← Back'; backBtn.title = 'Back to calendar';

        self.ymView.appendChild(yn);
        self.ymView.appendChild(self.moGrid);
        self.ymView.appendChild(backBtn);

        self.popup.appendChild(self.calView);
        self.popup.appendChild(self.ymView);

        // ── Wire navigation events ───────────────────────────────────────────
        self.prevBtn.addEventListener('click', function (e) { e.stopPropagation(); self._nav(-1); });
        self.nextBtn.addEventListener('click', function (e) { e.stopPropagation(); self._nav(1);  });
        self.clrBtn.addEventListener('click',  function (e) { e.stopPropagation(); self._clear(); });
        self.myBtn.addEventListener('click',   function (e) { e.stopPropagation(); self._openYM(); });
        self.todayBtn.addEventListener('click',function (e) { e.stopPropagation(); self._pickToday(); });
        self.ymPrev.addEventListener('click',  function (e) { e.stopPropagation(); self.ymY--; self._renderYM(); });
        self.ymNext.addEventListener('click',  function (e) { e.stopPropagation(); self.ymY++; self._renderYM(); });
        backBtn.addEventListener('click',      function (e) { e.stopPropagation(); self._closeYM(); });
    };

    // ── Insert into DOM ────────────────────────────────────────────────────────

    DP.prototype._insertDOM = function () {
        this.input.type = 'hidden'; // input[type="hidden"] is always invisible per HTML spec
        this.input.parentNode.insertBefore(this.wrap, this.input);
        document.body.appendChild(this.popup);
    };

    // ── Override .value on the hidden input so external resets sync the display ─

    DP.prototype._hookValueProp = function () {
        var self = this;
        Object.defineProperty(self.input, 'value', {
            get: function () { return _valueDesc.get.call(this); },
            set: function (v) {
                _valueDesc.set.call(this, v);
                self._syncDisplay(v || '');
            },
            configurable: true
        });
    };

    DP.prototype._syncDisplay = function (v) {
        this._val = v || '';
        if (v && parseISO(v)) {
            this.disp.value = fmtDisplay(v);
            this.disp.classList.remove('dp-placeholder');
            var p = parseISO(v);
            this.vy = p.y; this.vmo = p.mo;
        } else {
            this.disp.value = '';
            this.disp.classList.add('dp-placeholder');
        }
    };

    // ── Render calendar days ───────────────────────────────────────────────────

    DP.prototype._renderCal = function () {
        var self   = this;
        var today  = new Date();
        var todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

        self.myBtn.textContent = MONTHS[self.vmo] + ' ' + self.vy;
        self.daysEl.innerHTML = '';

        // ISO week starts Monday: Sunday (0) maps to slot 6
        var firstDow = new Date(self.vy, self.vmo, 1).getDay();
        var offset   = (firstDow + 6) % 7;
        var dIM      = new Date(self.vy, self.vmo + 1, 0).getDate();
        var dPM      = new Date(self.vy, self.vmo, 0).getDate();

        for (var i = 0; i < 42; i++) {
            var d, mo, y, other = false;
            if (i < offset) {
                d = dPM - offset + i + 1;
                mo = self.vmo - 1; y = self.vy;
                if (mo < 0) { mo = 11; y--; }
                other = true;
            } else if (i - offset >= dIM) {
                d = i - offset - dIM + 1;
                mo = self.vmo + 1; y = self.vy;
                if (mo > 11) { mo = 0; y++; }
                other = true;
            } else {
                d = i - offset + 1; mo = self.vmo; y = self.vy;
            }

            var iso = toISO(y, mo, d);
            var el  = document.createElement('div');
            el.className = 'dp-d';
            if (other)            el.classList.add('dp-d-other');
            if (iso === todayISO) el.classList.add('dp-d-today');
            if (iso === self._val) el.classList.add('dp-d-sel');
            el.textContent = d;

            el.addEventListener('click', (function (v) {
                return function () { self._pick(v); };
            })(iso));

            self.daysEl.appendChild(el);
        }
    };

    // ── Render year/month picker ───────────────────────────────────────────────

    DP.prototype._renderYM = function () {
        var self = this;
        self.ymYrEl.textContent = self.ymY;
        self.moGrid.innerHTML = '';
        for (var m = 0; m < 12; m++) {
            var el = document.createElement('div');
            el.className = 'dp-mo' +
                (m === self.vmo && self.ymY === self.vy ? ' dp-mo-sel' : '');
            el.textContent = MONTHS[m].slice(0, 3);
            el.addEventListener('click', (function (mo) {
                return function () {
                    self.vmo = mo; self.vy = self.ymY;
                    self._closeYM(); self._renderCal();
                };
            })(m));
            self.moGrid.appendChild(el);
        }
    };

    DP.prototype._openYM = function () {
        this.ymOpen = true; this.ymY = this.vy;
        this.calView.style.display = 'none';
        this.ymView.classList.add('dp-ym-open');
        this._renderYM();
    };

    DP.prototype._closeYM = function () {
        this.ymOpen = false;
        this.calView.style.display = '';
        this.ymView.classList.remove('dp-ym-open');
    };

    // ── Actions ────────────────────────────────────────────────────────────────

    DP.prototype._nav = function (dir) {
        this.vmo += dir;
        if (this.vmo > 11) { this.vmo = 0;  this.vy++; }
        if (this.vmo < 0)  { this.vmo = 11; this.vy--; }
        this._renderCal();
    };

    DP.prototype._pick = function (iso) {
        this._val = iso;
        // Use prototype setter directly to avoid feedback loop with _hookValueProp
        _valueDesc.set.call(this.input, iso);
        this.disp.value = fmtDisplay(iso);
        this.disp.classList.remove('dp-placeholder');
        var p = parseISO(iso);
        if (p) { this.vy = p.y; this.vmo = p.mo; }
        this.close();
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    DP.prototype._clear = function () {
        this._val = '';
        _valueDesc.set.call(this.input, '');
        this.disp.value = '';
        this.disp.classList.add('dp-placeholder');
        this.close();
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    DP.prototype._pickToday = function () {
        var t = new Date();
        this._pick(toISO(t.getFullYear(), t.getMonth(), t.getDate()));
    };

    // ── Open / close / position ────────────────────────────────────────────────

    DP.prototype.open = function () {
        if (_openInst && _openInst !== this) _openInst.close();
        _openInst = this;

        // Reset to calendar view
        this.ymOpen = false;
        this.calView.style.display = '';
        this.ymView.classList.remove('dp-ym-open');

        this._renderCal();
        this.popup.classList.add('dp-open');
        this._position();
    };

    DP.prototype.close = function () {
        this.popup.classList.remove('dp-open');
        if (_openInst === this) _openInst = null;
    };

    DP.prototype.toggle = function () {
        this.popup.classList.contains('dp-open') ? this.close() : this.open();
    };

    DP.prototype._position = function () {
        var r  = this.wrap.getBoundingClientRect();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        // Responsive width: full 280 px on desktop, narrow on small phones
        var pw = Math.min(280, vw - 16);
        this.popup.style.width = pw + 'px';

        var ph = this.popup.offsetHeight || 330;
        var left = r.left;
        var top  = r.bottom + 2;

        // Prefer opening below; flip upward if too close to viewport bottom
        if (top + ph > vh - 8) top = r.top - ph - 2;
        // Clamp both axes so popup never escapes the viewport
        top  = Math.max(8, Math.min(top, vh - ph - 8));
        if (left + pw > vw - 8) left = vw - pw - 8;
        if (left < 8) left = 8;

        this.popup.style.left = Math.round(left) + 'px';
        this.popup.style.top  = Math.round(top)  + 'px';
    };

    // ── Auto-attach ────────────────────────────────────────────────────────────

    function attachAll() {
        document.querySelectorAll('input[type="date"]:not([data-dp-attached])').forEach(function (inp) {
            inp.setAttribute('data-dp-attached', '1');
            new DP(inp);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachAll);
    } else {
        attachAll();
    }

    // Public API for manual re-scanning (e.g. after dynamic DOM insertion)
    window.DatePicker = { attachAll: attachAll };

})();
