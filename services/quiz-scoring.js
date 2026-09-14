// services/quiz-scoring.js
// Mirrors forms-service.js's calculateFormScore — the schemas are identical by
// design — minus AI evaluation, since quiz Paragraph questions are not auto-scored
// (consistent with the Test simulator in quiz-games.js).

function calculateQuizScore(questions, submittedData) {
  let achieved = 0;
  let maximum = 0;

  for (const q of questions || []) {
    const weight = parseFloat(q.points) || 0;
    maximum += weight;

    const submitted = submittedData[q.id] || submittedData[`${q.id}[]`];
    if (!submitted) continue;

    if (q.type === "radio" || q.type === "boolean") {
      if (submitted === q.correctAnswer) achieved += weight;
    } else if (q.type === "checkboxes") {
      const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      const subArr = Array.isArray(submitted) ? submitted : [submitted];
      if (correctArr.length === 0) continue;

      const pointsPerOption = weight / correctArr.length;
      let questionScore = 0;
      subArr.forEach((val) => {
        if (correctArr.includes(val)) questionScore += pointsPerOption;
        else questionScore -= pointsPerOption;
      });
      achieved += Math.max(0, questionScore);
    }
    // text_multi is excluded from auto-scoring.
  }

  return { achieved, maximum };
}

// Timed games are always played against the clock — even solo or as one team on
// one device, there is no untimed/self-paced mode for this type. Each question is
// worth a fixed maximum; a correct answer earns a fraction of it based on how
// quickly it was given (answering instantly earns the full amount, answering right
// at the deadline earns half — the classic Kahoot-style decay), a wrong answer or a
// timeout earns nothing. `submittedData[q.id]` is `{ answer, timeTakenMs }`.
const TIMED_MAX_POINTS_PER_QUESTION = 1000;

function calculateTimedQuizScore(questions, submittedData) {
  let achieved = 0;
  let maximum = 0;

  for (const q of questions || []) {
    maximum += TIMED_MAX_POINTS_PER_QUESTION;

    const entry = submittedData[q.id];
    if (!entry || entry.answer === undefined || entry.answer === null) continue;
    if (entry.answer !== q.correctAnswer) continue;

    const limitMs = (parseFloat(q.timeLimitSeconds) || 20) * 1000;
    const takenMs = Math.max(0, Math.min(parseFloat(entry.timeTakenMs) || 0, limitMs));
    const fraction = 1 - (takenMs / limitMs) * 0.5;
    achieved += Math.round(TIMED_MAX_POINTS_PER_QUESTION * fraction);
  }

  return { achieved, maximum };
}

module.exports = { calculateQuizScore, calculateTimedQuizScore };
