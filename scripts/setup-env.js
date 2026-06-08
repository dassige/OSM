#!/usr/bin/env node
/**
 * setup-env.js — OpReady Environment Setup Tool
 *
 * Parses .example.env into sections, launches a local web form on port 3088,
 * pre-fills values from .generated.env or .env (if present), and writes the
 * configured result to .generated.env on form submission.
 *
 * Usage:
 *   node scripts/setup-env.js
 *   npm run setup-env
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

/* ── Constants ──────────────────────────────────────────────────────────── */

const PORT         = 3088;
// When packaged as a standalone exe via @yao-pkg/pkg, __dirname points to the
// virtual bundle filesystem. Use the real exe location instead so the tool can
// find .example.env and write .generated.env next to the executable.
const ROOT         = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const EXAMPLE_ENV  = path.join(ROOT, '.example.env');
const GENERATED    = path.join(ROOT, '.generated.env');
const EXISTING_ENV = path.join(ROOT, '.env');

/* ── Known-options map ──────────────────────────────────────────────────── */
// Variables listed here render as <select> dropdowns instead of free-text inputs.
// Keep in sync with .example.env when new enum-style variables are added.

const OPTIONS = {
    APP_MODE:               ['production', 'demo'],
    EXTRACTION_PLUGIN:      ['html-scraper', 'rest-api'],
    NODE_ENV:               ['development', 'production'],
    LOG_LEVEL:              ['info', 'error', 'warn', 'debug'],
    PROXY_MODE:             ['none', 'fixed', 'dynamic'],
    AI_PROVIDER:            ['gemini', 'ollama'],
    DEFAULT_MIN_SCORE_TYPE: ['percentage', 'number'],
    TRAINING_DAY_OF_WEEK:   ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    COOKIE_SECURE:          ['false', 'true'],
    ENABLE_AI_EVALUATION:   ['false', 'true'],
    ENABLE_WHATSAPP:        ['false', 'true'],
    KB_STORAGE_TYPE:        ['local', 's3', 'gcs'],
    DEPLOYMENT_TYPE:        ['local', 'vm', 'cloud-run', 'app-runner', 'fargate'],
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isSecret(key) {
    return /PASSWORD|_SECRET$|_PASS$|_KEY$|_TOKEN$/.test(key);
}

function buildOptions(key, currentValue) {
    return OPTIONS[key].map(function(opt) {
        return '<option value="' + esc(opt) + '"' + (opt === currentValue ? ' selected' : '') + '>' + esc(opt) + '</option>';
    }).join('');
}

function isSep(line) {
    return /^# =+/.test(line);
}

/* ── Parser ─────────────────────────────────────────────────────────────── */

/**
 * Parse .example.env into an array of section objects.
 *
 * Each section: { title: string, variables: Array<{
 *   key: string, defaultValue: string, enabled: boolean, description: string
 * }> }
 *
 * Parsing rules:
 *  - Lines matching `# ====...` are section separators.
 *  - A comment line immediately following an opening separator is the section title.
 *  - Lines matching `# KEY=value` (uppercase key) are disabled variables.
 *  - Lines matching `KEY=value` (uppercase key) are enabled variables.
 *  - Other comment lines accumulate as the description of the next variable.
 *  - Blank lines reset the description accumulator.
 */
function parse(content) {
    const lines = content.split(/\r?\n/);
    const sections = [];
    let cur   = null;   // current section
    let desc  = [];     // description accumulator
    let state = 'normal'; // 'normal' | 'sep1' | 'titled'

    for (const raw of lines) {
        const line = raw.trimEnd();

        /* ── Separator ── */
        if (isSep(line)) {
            if (state === 'titled') {
                state = 'normal';
                desc  = [];
            } else {
                state = 'sep1';
                desc  = [];
            }
            continue;
        }

        /* ── Section title (comment immediately after opening separator) ── */
        if (state === 'sep1' && /^# /.test(line)) {
            cur   = { title: line.replace(/^# /, '').trim(), variables: [] };
            state = 'titled';
            sections.push(cur);
            continue;
        }

        /* ── Non-separator line breaks out of sep context ── */
        if (state !== 'normal') {
            state = 'normal';
            desc  = [];
        }

        /* ── Blank line ── */
        if (line === '') { desc = []; continue; }

        /* ── Disabled variable: # KEY=value ── */
        const dm = line.match(/^#\s*([A-Z][A-Z0-9_]*)=(.*)$/);
        if (dm) {
            if (!cur) { cur = { title: 'General', variables: [] }; sections.push(cur); }
            cur.variables.push({
                key:          dm[1],
                defaultValue: dm[2].trim(),
                enabled:      false,
                description:  desc.join('\n').trim(),
            });
            desc = [];
            continue;
        }

        /* ── Enabled variable: KEY=value ── */
        const vm = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (vm) {
            if (!cur) { cur = { title: 'General', variables: [] }; sections.push(cur); }
            cur.variables.push({
                key:          vm[1],
                defaultValue: vm[2].trim(),
                enabled:      true,
                description:  desc.join('\n').trim(),
            });
            desc = [];
            continue;
        }

        /* ── Comment line → accumulate description ── */
        if (/^#/.test(line)) {
            desc.push(line.replace(/^#\s?/, ''));
        }
    }

    return sections;
}

/* ── Load existing values ───────────────────────────────────────────────── */

function loadValues(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return {};
    const vals = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const dm = line.match(/^#\s*([A-Z][A-Z0-9_]*)=(.*)$/);
        if (dm) { vals[dm[1]] = { enabled: false, value: dm[2].trim() }; continue; }
        const vm = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (vm) { vals[vm[1]] = { enabled: true,  value: vm[2].trim() }; }
    }
    return vals;
}

/* ── HTML builder ───────────────────────────────────────────────────────── */

function buildHtml(sections, existing) {
    let body = '';

    for (const section of sections) {
        if (section.variables.length === 0) continue;

        body += '<div class="section">';
        body += '<div class="section-hdr">' + esc(section.title) + '</div>';

        for (const v of section.variables) {
            const cur     = existing[v.key];
            const enabled = cur ? cur.enabled : v.enabled;
            const value   = cur ? cur.value   : v.defaultValue;
            const secret  = isSecret(v.key);
            const rowCls  = enabled ? 'var-row' : 'var-row is-disabled';

            const dis  = enabled ? '' : ' disabled';
            const opts = OPTIONS[v.key];
            const inputHtml = opts
                ? '<select class="var-input" title="' + esc(v.key) + ' options"' + dis + '>' +
                    buildOptions(v.key, value) +
                  '</select>'
                : secret
                ? '<div class="input-wrap">' +
                    '<input class="var-input" type="password" value="' + esc(value) + '"' +
                    ' autocomplete="off" title="' + esc(v.key) + ' (sensitive field)"' + dis + '>' +
                    '<button type="button" class="show-hide" title="Show or hide value">Show</button>' +
                  '</div>'
                : '<input class="var-input" type="text" value="' + esc(value) + '"' +
                  ' title="' + esc(v.key) + ' value"' + dis + '>';

            const defaultHtml = v.defaultValue !== ''
                ? '<div class="var-default">Default: <code>' + esc(v.defaultValue) + '</code></div>'
                : '<div class="var-default var-default-empty">Default: <em>(empty)</em></div>';

            const descHtml = v.description
                ? '<div class="var-desc">' + esc(v.description) + '</div>'
                : '';

            body +=
                '<div class="' + rowCls + '" data-key="' + esc(v.key) + '">' +
                  '<label class="toggle-wrap" title="Enable or disable this variable">' +
                    '<input class="var-toggle" type="checkbox"' +
                    (enabled ? ' checked' : '') + '>' +
                    '<span class="toggle-box"></span>' +
                  '</label>' +
                  '<div class="var-name" title="' + esc(v.key) + '">' + esc(v.key) + '</div>' +
                  '<div class="var-field">' +
                    inputHtml +
                    defaultHtml +
                    descHtml +
                  '</div>' +
                '</div>';
        }

        body += '</div>';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpReady — Environment Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #f0f4f8; color: #1a202c; min-height: 100vh; }

  .page-hdr { background: #0d8a9e; color: #fff; padding: 16px 28px; position: sticky;
              top: 0; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
  .page-hdr h1 { font-size: 1.2rem; font-weight: 700; }
  .page-hdr p  { font-size: .8rem; opacity: .85; margin-top: 3px; }
  .page-hdr code { background: rgba(255,255,255,.2); padding: 0 4px; border-radius: 3px;
                   font-size: .78rem; }

  .container { max-width: 960px; margin: 0 auto; padding: 24px 16px 130px; }

  .section { background: #fff; border-radius: 8px; margin-bottom: 20px;
             box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
  .section-hdr { background: #1a202c; color: #fff; padding: 10px 20px;
                 font-size: .75rem; font-weight: 700; letter-spacing: .8px;
                 text-transform: uppercase; }

  .var-row { display: grid; grid-template-columns: 40px 220px 1fr;
             gap: 12px; align-items: start; padding: 12px 20px;
             border-bottom: 1px solid #edf2f7; transition: opacity .15s; }
  .var-row:last-child { border-bottom: none; }
  .var-row.is-disabled { opacity: .45; }

  .toggle-wrap { display: inline-flex; align-items: flex-start; justify-content: center;
                 padding-top: 6px; cursor: pointer; user-select: none; }
  .toggle-wrap input { display: none; }
  .toggle-box { width: 20px; height: 20px; flex-shrink: 0; border: 2px solid #a0aec0;
                border-radius: 4px; background: #fff; transition: .15s; position: relative; }
  .toggle-wrap input:checked + .toggle-box { background: #0d8a9e; border-color: #0d8a9e; }
  .toggle-wrap input:checked + .toggle-box::after {
    content: ""; display: block; position: absolute;
    left: 5px; top: 1px; width: 6px; height: 11px;
    border: 2px solid #fff; border-top: none; border-left: none; transform: rotate(45deg); }

  .var-name { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
              font-size: .8rem; font-weight: 600; color: #2d3748; word-break: break-all;
              padding-top: 7px; line-height: 1.35; }

  .var-field { display: flex; flex-direction: column; gap: 5px; }
  .input-wrap { display: flex; gap: 4px; }
  .var-input { width: 100%; padding: 6px 10px; border: 1px solid #cbd5e0; border-radius: 4px;
               font-family: "SFMono-Regular", Consolas, monospace; font-size: .8rem;
               background: #f7fafc; color: #2d3748; transition: border-color .15s; }
  .var-input:focus { outline: none; border-color: #0d8a9e; background: #fff; }
  .var-input[disabled] { cursor: not-allowed; opacity: .6; }
  select.var-input { cursor: pointer; }
  .input-wrap .var-input { flex: 1; }
  .show-hide { background: #edf2f7; border: 1px solid #cbd5e0; border-radius: 4px;
               padding: 0 10px; cursor: pointer; font-size: .75rem; font-weight: 600;
               color: #4a5568; white-space: nowrap; transition: background .12s; }
  .show-hide:hover { background: #e2e8f0; }

  .var-default { font-size: .72rem; color: #a0aec0; margin-top: 3px; }
  .var-default code { font-family: "SFMono-Regular", Consolas, monospace; color: #718096;
                      background: #edf2f7; padding: 1px 5px; border-radius: 3px;
                      word-break: break-all; }
  .var-default-empty em { color: #cbd5e0; font-style: normal; }
  .var-desc { font-size: .73rem; color: #718096; line-height: 1.5; white-space: pre-line;
              margin-top: 4px; }

  .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff;
            border-top: 2px solid #e2e8f0; padding: 14px 28px;
            display: flex; align-items: center; gap: 16px;
            box-shadow: 0 -2px 10px rgba(0,0,0,.08); z-index: 200; }
  .btn-gen { background: #0d8a9e; color: #fff; border: none; padding: 10px 28px;
             border-radius: 6px; font-size: .92rem; font-weight: 700; cursor: pointer;
             transition: background .15s; }
  .btn-gen:hover { background: #0b7a8c; }
  .footer-hint { font-size: .78rem; color: #a0aec0; font-family: monospace; flex: 1; }

  .btn-load { background: #4a5568; color: #fff; border: none; padding: 10px 20px;
              border-radius: 6px; font-size: .92rem; font-weight: 700; cursor: pointer;
              transition: background .15s; }
  .btn-load:hover { background: #2d3748; }
  .btn-save { background: #276749; color: #fff; border: none; padding: 10px 20px;
              border-radius: 6px; font-size: .92rem; font-weight: 700; cursor: pointer;
              transition: background .15s; }
  .btn-save:hover { background: #1a4a35; }

  .var-row.from-file { border-left: 3px solid #0d8a9e; background: rgba(13,138,158,.07); }

  #toast { display: none; position: fixed; top: 68px; right: 20px; max-width: 460px;
           padding: 12px 18px; border-radius: 6px; font-size: .85rem; font-weight: 500;
           z-index: 999; box-shadow: 0 4px 14px rgba(0,0,0,.15); white-space: pre-wrap;
           line-height: 1.55; }
  #toast.ok  { background: #276749; color: #fff; }
  #toast.err { background: #c53030; color: #fff; }

  @media (max-width: 640px) {
    .var-row { grid-template-columns: 36px 1fr; }
    .var-name { grid-column: 2; padding-top: 0; }
    .var-field { grid-column: 2; }
  }
</style>
</head>
<body>

<div class="page-hdr">
  <h1>OpReady — Environment Setup</h1>
  <p>Enable variables, set values, then click <strong>Generate .env File</strong>.
     Output: <code>.generated.env</code></p>
</div>

<div class="container">
${body}
</div>

<div class="footer">
  <input type="file" id="envFileInput" accept=".env,text/plain" style="display:none">
  <button class="btn-load" id="btnLoad" title="Load an existing .env file and highlight its values">Load .env</button>
  <button class="btn-gen" id="btnGenerate" title="Write all values to .generated.env">Generate .env File</button>
  <button class="btn-save" id="btnSave" style="display:none" title="Save values directly to .env (overwrites)">Save to .env</button>
  <span class="footer-hint" id="footerHint">→ .generated.env &nbsp;&bull;&nbsp; then: cp .generated.env .env</span>
</div>

<div id="toast"></div>

<script>
function toggleRow(cb) {
  var row = cb.closest(".var-row");
  row.classList.toggle("is-disabled", !cb.checked);
  var inp = row.querySelector(".var-input");
  if (inp) inp.disabled = !cb.checked;
}

function togglePwd(btn) {
  var inp = btn.previousElementSibling;
  inp.type = inp.type === "password" ? "text" : "password";
  btn.textContent = inp.type === "password" ? "Show" : "Hide";
}

function collectPayload() {
  var payload = {};
  document.querySelectorAll(".var-row[data-key]").forEach(function(row) {
    var key = row.dataset.key;
    var cb  = row.querySelector(".var-toggle");
    var inp = row.querySelector(".var-input");
    payload[key] = { enabled: cb ? cb.checked : true, value: inp ? inp.value : "" };
  });
  return payload;
}

async function generate() {
  try {
    var res  = await fetch("/generate", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload()) });
    var data = await res.json();
    if (data.ok) {
      toast("ok", "✓ .generated.env written successfully.\\n\\nNext: cp .generated.env .env");
    } else {
      toast("err", "✗ Error: " + data.error);
    }
  } catch (e) { toast("err", "✗ " + e.message); }
}

async function saveToEnv() {
  try {
    var res  = await fetch("/save-env", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload()) });
    var data = await res.json();
    if (data.ok) {
      toast("ok", "✓ .env written successfully.");
    } else {
      toast("err", "✗ Error: " + data.error);
    }
  } catch (e) { toast("err", "✗ " + e.message); }
}

// ── Load .env File (client-side FileReader — no server path needed) ──

function parseEnvContent(text) {
  var vals = {};
  text.split(/\\r?\\n/).forEach(function(line) {
    var dm = line.match(/^#\\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (dm) { vals[dm[1]] = { enabled: false, value: dm[2].trim() }; return; }
    var vm = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (vm) { vals[vm[1]] = { enabled: true,  value: vm[2].trim() }; }
  });
  return vals;
}

function applyLoadedValues(vals) {
  document.querySelectorAll(".var-row.from-file").forEach(function(r) {
    r.classList.remove("from-file");
  });
  Object.keys(vals).forEach(function(key) {
    var row = document.querySelector('.var-row[data-key="' + key + '"]');
    if (!row) return;
    var entry = vals[key];
    var cb  = row.querySelector(".var-toggle");
    var inp = row.querySelector(".var-input");
    if (cb) {
      cb.checked = entry.enabled;
      row.classList.toggle("is-disabled", !entry.enabled);
    }
    if (inp) {
      inp.disabled = !entry.enabled;
      if (inp.tagName === "SELECT") {
        inp.value = entry.value;
        if (inp.value !== entry.value) {
          var opt = document.createElement("option");
          opt.value = entry.value;
          opt.textContent = entry.value;
          inp.appendChild(opt);
          inp.value = entry.value;
        }
      } else {
        inp.value = entry.value;
      }
    }
    row.classList.add("from-file");
  });
}

function onFileSelected(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var vals  = parseEnvContent(ev.target.result);
    var count = Object.keys(vals).length;
    applyLoadedValues(vals);
    document.getElementById("btnSave").style.display = "inline-block";
    document.getElementById("footerHint").textContent =
      "Loaded: " + file.name + " (" + count + " vars highlighted)  •  Generate → .generated.env  •  Save → .env";
    toast("ok", "✓ Loaded " + count + " variables from " + file.name + "\\nHighlighted rows (teal border) have values from the file.");
  };
  reader.readAsText(file);
  e.target.value = "";
}

function toast(cls, msg) {
  var el = document.getElementById("toast");
  el.className = "toast " + cls;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(function() { el.style.display = "none"; }, 6000);
}

// Script is at end of <body> — DOM is fully built, wire up events here.
document.querySelectorAll(".var-toggle").forEach(function(cb) {
  cb.addEventListener("change", function() { toggleRow(this); });
});
document.querySelectorAll(".show-hide").forEach(function(btn) {
  btn.addEventListener("click", function() { togglePwd(this); });
});
document.getElementById("btnGenerate").addEventListener("click", generate);
document.getElementById("btnSave").addEventListener("click", saveToEnv);
document.getElementById("btnLoad").addEventListener("click", function() {
  document.getElementById("envFileInput").click();
});
document.getElementById("envFileInput").addEventListener("change", onFileSelected);
</script>
</body>
</html>`;
}

/* ── Generate .generated.env content ────────────────────────────────────── */

function generateContent(sections, values) {
    const SEP = '# ' + '='.repeat(77);
    const out = [
        SEP,
        '# OpReady — Environment Configuration',
        '# Generated by:  npm run setup-env  on ' + new Date().toISOString(),
        '# Activate with: cp .generated.env .env',
        SEP,
        '',
    ];

    for (const section of sections) {
        if (section.variables.length === 0) continue;
        out.push(SEP, '# ' + section.title, SEP, '');
        for (const v of section.variables) {
            const val = values[v.key] || { enabled: v.enabled, value: v.defaultValue };
            if (v.description) {
                for (const dline of v.description.split('\n')) {
                    if (dline.trim()) out.push('# ' + dline);
                }
            }
            out.push(val.enabled ? v.key + '=' + val.value : '# ' + v.key + '=' + val.value);
            out.push('');
        }
    }

    return out.join('\n');
}

/* ── HTTP server ────────────────────────────────────────────────────────── */

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end',  ()    => resolve(raw));
        req.on('error', reject);
    });
}

/* ── Startup ────────────────────────────────────────────────────────────── */

if (!fs.existsSync(EXAMPLE_ENV)) {
    console.error('[setup-env] ERROR: .example.env not found at ' + EXAMPLE_ENV);
    process.exit(1);
}

const sections = parse(fs.readFileSync(EXAMPLE_ENV, 'utf8'));
const existing = loadValues(
    fs.existsSync(GENERATED)    ? GENERATED    :
    fs.existsSync(EXISTING_ENV) ? EXISTING_ENV : ''
);
const source = fs.existsSync(GENERATED)    ? '.generated.env' :
               fs.existsSync(EXISTING_ENV) ? '.env'           : 'defaults';
const html = buildHtml(sections, existing);

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }

    if (req.method === 'POST' && req.url === '/generate') {
        try {
            const body    = await readBody(req);
            const values  = JSON.parse(body);
            const content = generateContent(sections, values);
            fs.writeFileSync(GENERATED, content, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: GENERATED }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/save-env') {
        try {
            const body    = await readBody(req);
            const values  = JSON.parse(body);
            const content = generateContent(sections, values);
            fs.writeFileSync(EXISTING_ENV, content, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: EXISTING_ENV }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

function openBrowser(url) {
    const cmd =
        process.platform === 'win32'  ? 'start ' + url :
        process.platform === 'darwin' ? 'open ' + url  : 'xdg-open ' + url;
    exec(cmd, err => {
        if (err) console.log('  Could not auto-open browser. Visit manually: ' + url);
    });
}

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error('[setup-env] Port ' + PORT + ' is already in use. Stop the existing process and retry.');
    } else {
        console.error('[setup-env] Server error:', err.message);
    }
    process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
    const url = 'http://localhost:' + PORT;
    const varCount = sections.reduce((n, s) => n + s.variables.length, 0);
    console.log('');
    console.log('  OpReady — Environment Setup Tool');
    console.log('  ─'.repeat(20));
    console.log('  URL      : ' + url);
    console.log('  Pre-fill : ' + source);
    console.log('  Variables: ' + varCount + ' across ' + sections.filter(s => s.variables.length).length + ' sections');
    console.log('  Output   : ' + GENERATED);
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
    openBrowser(url);
});
