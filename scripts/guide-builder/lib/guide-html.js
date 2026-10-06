/**
 * Shared HTML building blocks and branding for generated OpReady PDF guides.
 * Colours match the app's own mobile top-banner teal (styles.css) rather
 * than the themeable --primary CSS variable, since a printed guide has no
 * runtime theme to inherit and should read as "OpReady" regardless of any
 * one installation's configured accent colour.
 */

const fs = require('fs');
const path = require('path');

const TEAL = '#0d8a9e';
const TEAL_LIGHT = '#17a2b8';
const INK = '#222222';
const MUTED = '#666666';
const BORDER = '#dee2e6';
const PAPER = '#ffffff';
const PANEL = '#f7fafb';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function imageDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

/** A screenshot figure. `mobile: true` renders it narrower and centred, framed like a phone. */
function figure({ file, caption, mobile }) {
  const src = imageDataUri(file);
  const frameClass = mobile ? 'shot-frame shot-frame-mobile' : 'shot-frame shot-frame-desktop';
  return `
    <figure class="shot">
      <div class="${frameClass}"><img src="${src}" alt="${esc(caption || '')}"></div>
      ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
    </figure>`;
}

/**
 * A data table. Cell values are inserted as HTML (escape untrusted text with esc()).
 * `widths` are optional CSS widths per column, e.g. ['12%', '30%', ...].
 */
function table({ headers, rows, widths = [], className = '' }) {
  const colgroup = widths.length ? `<colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup>` : '';
  return `
    <table class="doc-table ${className}">
      ${colgroup}
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

/**
 * `blocks` are extra HTML fragments (tables, lists, sub-headings) placed after
 * the paragraphs and before the figures.
 */
function section({ kicker, heading, paragraphs = [], blocks = [], figures = [], tips = [], pageBreakBefore = true }) {
  const paraHtml = paragraphs.map((p) => `<p>${p}</p>`).join('\n') + blocks.join('\n');
  const figHtml = figures.map((f) => figure(f)).join('\n');
  const tipsHtml = tips.length
    ? `<div class="tip-box"><strong>Good to know</strong><ul>${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>`
    : '';
  return `
    <section class="guide-section"${pageBreakBefore ? ' style="page-break-before: always;"' : ''}>
      ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}
      <h2>${esc(heading)}</h2>
      ${paraHtml}
      ${figHtml}
      ${tipsHtml}
    </section>`;
}

function partDivider({ label, title, blurb }) {
  return `
    <section class="part-divider" style="page-break-before: always;">
      <div class="part-label">${esc(label)}</div>
      <h1>${esc(title)}</h1>
      <p>${blurb}</p>
    </section>`;
}

function coverPage({ title, subtitle, appVersion, generatedDate }) {
  return `
    <section class="cover-page">
      <div class="cover-brand">OpReady</div>
      <h1>${esc(title)}</h1>
      <p class="cover-subtitle">${esc(subtitle)}</p>
      <div class="cover-meta">
        <div>Application version ${esc(appVersion)}</div>
        <div>Generated ${esc(generatedDate)}</div>
      </div>
    </section>`;
}

function tableOfContents(entries) {
  return `
    <section class="toc-page" style="page-break-before: always;">
      <h2>Contents</h2>
      <ol class="toc-list">
        ${entries.map((e) => `<li><span>${esc(e)}</span></li>`).join('')}
      </ol>
    </section>`;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: ${INK}; background: ${PAPER}; font-size: 12.5px; line-height: 1.55; }
  h1 { color: ${TEAL}; margin: 0 0 8px 0; }
  h2 { color: ${TEAL}; margin: 0 0 10px 0; font-size: 1.6em; border-bottom: 2px solid ${BORDER}; padding-bottom: 8px; }
  p { margin: 0 0 10px 0; }
  strong { color: ${INK}; }

  .cover-page { min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .cover-brand { font-size: 1.4em; font-weight: 700; letter-spacing: 0.08em; color: ${TEAL_LIGHT}; text-transform: uppercase; margin-bottom: 30px; }
  .cover-page h1 { font-size: 2.4em; max-width: 640px; }
  .cover-subtitle { color: ${MUTED}; font-size: 1.2em; max-width: 560px; margin-top: 10px; }
  .cover-meta { margin-top: 60px; color: ${MUTED}; font-size: 0.95em; }
  .cover-meta div { margin-bottom: 4px; }

  .toc-list { list-style: none; counter-reset: toc; padding: 0; margin: 0; }
  .toc-list li { counter-increment: toc; padding: 10px 0; border-bottom: 1px dashed ${BORDER}; font-size: 1.05em; }
  .toc-list li::before { content: counter(toc) '.  '; color: ${TEAL}; font-weight: 700; }

  .part-divider { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .part-label { color: ${TEAL_LIGHT}; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; margin-bottom: 16px; }
  .part-divider h1 { font-size: 2.1em; }
  .part-divider p { max-width: 520px; color: ${MUTED}; font-size: 1.1em; }

  .kicker { color: ${TEAL_LIGHT}; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.78em; font-weight: 700; margin-bottom: 4px; }

  .tip-box { background: ${PANEL}; border-left: 4px solid ${TEAL_LIGHT}; border-radius: 4px; padding: 10px 16px; margin-top: 14px; }
  .tip-box strong { color: ${TEAL}; display: block; margin-bottom: 4px; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.04em; }
  .tip-box ul { margin: 4px 0 0 0; padding-left: 18px; }
  .tip-box li { margin-bottom: 4px; }

  figure.shot { margin: 16px 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
  figure.shot figcaption { color: ${MUTED}; font-size: 0.85em; margin-top: 8px; font-style: italic; }
  /* No box-shadow: in print it spills onto the previous page when a figure moves to a new page. */
  .shot-frame { display: inline-block; border: 1px solid ${BORDER}; border-radius: 8px; overflow: hidden; }
  .shot-frame-desktop { max-width: 92%; }
  .shot-frame-desktop img { display: block; width: 100%; height: auto; }
  .shot-frame-mobile { max-width: 260px; border-radius: 22px; border-width: 6px; border-color: #1b1b1b; }
  .shot-frame-mobile img { display: block; width: 100%; height: auto; }

  h3 { color: ${TEAL}; font-size: 1.15em; margin: 16px 0 6px 0; }
  ul.doc-list { margin: 0 0 10px 0; padding-left: 20px; }
  ul.doc-list li { margin-bottom: 4px; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 0.92em; background: ${PANEL}; padding: 1px 4px; border-radius: 3px; }
  pre.doc-code { font-family: Consolas, 'Courier New', monospace; font-size: 0.9em; background: #263238; color: #eceff1; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }

  table.doc-table { width: 100%; border-collapse: collapse; margin: 8px 0 14px 0; font-size: 0.92em; }
  table.doc-table th { background: ${TEAL}; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  table.doc-table td { border: 1px solid ${BORDER}; padding: 6px 8px; vertical-align: top; }
  table.doc-table tbody tr:nth-child(even) td { background: ${PANEL}; }
  table.doc-table tr { page-break-inside: avoid; }
  table.doc-table thead { display: table-header-group; }
  table.doc-table td.result { min-width: 70px; }
`;

function wrapDocument(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${BASE_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

module.exports = {
  TEAL, TEAL_LIGHT, INK, MUTED, BORDER,
  esc, figure, table, section, partDivider, coverPage, tableOfContents, wrapDocument,
};
