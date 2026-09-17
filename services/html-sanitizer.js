'use strict';

const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Single shared DOMPurify instance (server-side, jsdom-backed) — same pattern already
// used in routes/api/reports.js for the PDF-export sanitizer.
const _domPurify = createDOMPurify(new JSDOM('').window);

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
    return _domPurify.sanitize(String(html));
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
