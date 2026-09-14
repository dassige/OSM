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

module.exports = { calculateQuizScore };
