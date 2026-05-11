// tests/forms-service.test.js
jest.mock('../services/db', () => ({
    initDB: jest.fn().mockResolvedValue({})
}));
jest.mock('../services/ai-service', () => ({
    evaluateTextAnswer: jest.fn()
}));
jest.mock('../config', () => ({
    aiConfig: { enabled: false }
}));

const { calculateFormScore } = require('../services/forms-service');

describe('calculateFormScore', () => {

    describe('Radio / Boolean questions', () => {
        it('awards full points for a correct radio answer', async () => {
            const structure = [{ id: 'q1', type: 'radio', points: '2', correctAnswer: 'yes' }];
            const result = await calculateFormScore(structure, { q1: 'yes' }, true);
            expect(result.achieved).toBe(2);
            expect(result.maximum).toBe(2);
        });

        it('awards zero points for a wrong radio answer', async () => {
            const structure = [{ id: 'q1', type: 'radio', points: '2', correctAnswer: 'yes' }];
            const result = await calculateFormScore(structure, { q1: 'no' }, true);
            expect(result.achieved).toBe(0);
            expect(result.maximum).toBe(2);
        });

        it('awards full points for a correct boolean answer', async () => {
            const structure = [{ id: 'q1', type: 'boolean', points: '1', correctAnswer: 'true' }];
            const result = await calculateFormScore(structure, { q1: 'true' }, true);
            expect(result.achieved).toBe(1);
            expect(result.maximum).toBe(1);
        });

        it('awards zero points when no answer is submitted', async () => {
            const structure = [{ id: 'q1', type: 'radio', points: '3', correctAnswer: 'A' }];
            const result = await calculateFormScore(structure, {}, true);
            expect(result.achieved).toBe(0);
            expect(result.maximum).toBe(3);
        });
    });

    describe('Checkboxes questions', () => {
        it('awards full points when all correct options are selected', async () => {
            const structure = [{
                id: 'q1', type: 'checkboxes', points: '3',
                correctAnswer: ['A', 'B', 'C']
            }];
            const result = await calculateFormScore(structure, { 'q1[]': ['A', 'B', 'C'] }, true);
            expect(result.achieved).toBe(3);
            expect(result.maximum).toBe(3);
        });

        it('deducts one share per wrong selection (pro-rata)', async () => {
            // 3 options, 3 pts → 1 pt each. Select 2 correct + 1 wrong → (2×1) − (1×1) = 1
            const structure = [{
                id: 'q1', type: 'checkboxes', points: '3',
                correctAnswer: ['A', 'B', 'C']
            }];
            const result = await calculateFormScore(structure, { 'q1[]': ['A', 'B', 'D'] }, true);
            expect(result.achieved).toBe(1);
            expect(result.maximum).toBe(3);
        });

        it('clamps score to 0 and never goes negative', async () => {
            const structure = [{
                id: 'q1', type: 'checkboxes', points: '2',
                correctAnswer: ['A', 'B']
            }];
            const result = await calculateFormScore(structure, { 'q1[]': ['X', 'Y', 'Z'] }, true);
            expect(result.achieved).toBe(0);
            expect(result.maximum).toBe(2);
        });
    });

    describe('Text multi questions', () => {
        it('gives 0 score and marks for manual review when AI is skipped', async () => {
            const structure = [{
                id: 'q1', type: 'text_multi', points: '5',
                correctAnswer: 'Expected answer', description: 'Explain this'
            }];
            const result = await calculateFormScore(structure, { q1: 'my answer' }, true);
            expect(result.achieved).toBe(0);
            expect(result.maximum).toBe(5);
            expect(result.feedback.q1.reason).toMatch(/manual review/i);
        });
    });

    describe('Mixed field sets', () => {
        it('correctly totals achieved and maximum across multiple question types', async () => {
            const structure = [
                { id: 'q1', type: 'radio',   points: '2', correctAnswer: 'yes' },
                { id: 'q2', type: 'boolean',  points: '1', correctAnswer: 'true' },
                { id: 'q3', type: 'radio',   points: '2', correctAnswer: 'B' },
            ];
            // q1 correct (+2), q2 correct (+1), q3 wrong (+0) → achieved=3, maximum=5
            const result = await calculateFormScore(
                structure,
                { q1: 'yes', q2: 'true', q3: 'A' },
                true
            );
            expect(result.achieved).toBe(3);
            expect(result.maximum).toBe(5);
        });

        it('returns zero achieved and correct maximum when all answers are wrong', async () => {
            const structure = [
                { id: 'q1', type: 'radio', points: '3', correctAnswer: 'yes' },
                { id: 'q2', type: 'radio', points: '2', correctAnswer: 'B' },
            ];
            const result = await calculateFormScore(
                structure,
                { q1: 'no', q2: 'A' },
                true
            );
            expect(result.achieved).toBe(0);
            expect(result.maximum).toBe(5);
        });
    });
});
