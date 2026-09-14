const { calculateQuizScore, calculateTimedQuizScore } = require('../services/quiz-scoring');

describe('calculateTimedQuizScore', () => {
    const questions = [
        { id: 'q1', type: 'radio', correctAnswer: 'A', timeLimitSeconds: 20 },
        { id: 'q2', type: 'radio', correctAnswer: 'B', timeLimitSeconds: 10 },
    ];

    it('awards full points for an instant correct answer', () => {
        const { achieved, maximum } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: 'A', timeTakenMs: 0 } },
        );
        expect(achieved).toBe(1000);
        expect(maximum).toBe(1000);
    });

    it('awards half points for a correct answer right at the deadline', () => {
        const { achieved } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: 'A', timeTakenMs: 20000 } },
        );
        expect(achieved).toBe(500);
    });

    it('awards a fraction between half and full for a mid-time correct answer', () => {
        const { achieved } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: 'A', timeTakenMs: 10000 } },
        );
        // 1000 * (1 - (10000/20000)*0.5) = 1000 * 0.75 = 750
        expect(achieved).toBe(750);
    });

    it('awards zero for a wrong answer regardless of speed', () => {
        const { achieved } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: 'B', timeTakenMs: 0 } },
        );
        expect(achieved).toBe(0);
    });

    it('awards zero for a timeout (no answer submitted)', () => {
        const { achieved } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: null, timeTakenMs: 20000 } },
        );
        expect(achieved).toBe(0);
    });

    it('clamps an over-the-limit reported time to the deadline (never goes negative)', () => {
        const { achieved } = calculateTimedQuizScore(
            [questions[0]],
            { q1: { answer: 'A', timeTakenMs: 999999 } },
        );
        expect(achieved).toBe(500);
    });

    it('sums scores across multiple questions using each question own time limit', () => {
        const { achieved, maximum } = calculateTimedQuizScore(questions, {
            q1: { answer: 'A', timeTakenMs: 0 },      // 1000
            q2: { answer: 'B', timeTakenMs: 10000 },  // exactly at 10s limit -> 500
        });
        expect(achieved).toBe(1500);
        expect(maximum).toBe(2000);
    });

    it('returns zero achieved and correct maximum when nothing is answered', () => {
        const { achieved, maximum } = calculateTimedQuizScore(questions, {});
        expect(achieved).toBe(0);
        expect(maximum).toBe(2000);
    });
});

describe('calculateQuizScore (Score-based, unaffected by the Timed changes)', () => {
    it('still scores a simple radio question correctly', () => {
        const { achieved, maximum } = calculateQuizScore(
            [{ id: 'q1', type: 'radio', correctAnswer: 'A', points: 5 }],
            { q1: 'A' },
        );
        expect(achieved).toBe(5);
        expect(maximum).toBe(5);
    });
});
