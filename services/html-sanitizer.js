'use strict';

const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Single shared DOMPurify instance (server-side, jsdom-backed) — same pattern already
// used in routes/api/reports.js for the PDF-export sanitizer.
const _domPurify = createDOMPurify(new JSDOM('').window);

// DOMPurify's default profile drops `target` (it's not in the default ALLOWED_ATTR),
// which silently breaks TinyMCE-authored "open in new tab" links. Restore it, but force
// rel="noopener noreferrer" on any target="_blank" link so the new tab can't reach back
// into this page via window.opener (reverse tabnabbing) — the standard DOMPurify recipe.
_domPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

/**
 * Sanitizes TinyMCE-authored rich text (form/survey intro and question description
 * fields) before it is persisted, so every consumer — forms-view.html, surveys-view.html,
 * any future report or export — reads already-safe HTML. Fixes H-04/H-05 (N-XSS-1,
 * N-XSS-3, N-XSS-4): these fields are rendered via innerHTML on public, unauthenticated
 * pages, so they must never carry script-executing markup.
 *
 * @param {string} html
 * @returns {string}
 */
function sanitizeRichText(html) {
    if (html === undefined || html === null) return html;
    return _domPurify.sanitize(String(html), { ADD_ATTR: ['target'] });
}

/**
 * Sanitizes every question's `description` field in a form/survey `structure` array
 * in place (returns a new array; does not mutate the input).
 *
 * @param {Array<object>} structure
 * @returns {Array<object>}
 */
function sanitizeQuestionStructure(structure) {
    if (!Array.isArray(structure)) return structure;
    return structure.map(q => (
        q && typeof q === 'object' && q.description !== undefined
            ? { ...q, description: sanitizeRichText(q.description) }
            : q
    ));
}

module.exports = { sanitizeRichText, sanitizeQuestionStructure };
