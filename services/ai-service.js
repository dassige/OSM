// services/ai-service.js
const { aiConfig } = require("../config");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

async function evaluateWithGemini(prompt) {
  const genAI = new GoogleGenerativeAI(aiConfig.geminiKey);
  const model = genAI.getGenerativeModel({ model: aiConfig.model });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function evaluateWithOllama(prompt) {
  const response = await axios.post(`${aiConfig.ollamaUrl}/api/generate`, {
    model: aiConfig.model,
    prompt: prompt,
    stream: false,
    format: "json", // Ensures Ollama returns valid JSON
  });
  return response.data.response;
}

async function evaluateTextAnswer(question, reference, memberAnswer, maxPoints) {
  if (!aiConfig.enabled) return { score: 0, justification: "AI disabled." };

  const prompt = `
    Role: Technical Examiner for Fire and Emergency New Zealand.
    Task: Grade a volunteer firefighter's written answer.
    
    Question: "${question}"
    Reference/Rubric: "${reference}"
    Member's Answer: "${memberAnswer}"
    Max Points: ${maxPoints}

    Instructions:
    1. Compare the Member's Answer to the Reference.
    2. Assign a Raw Score (0 to ${maxPoints}) based on technical accuracy.
    3. Provide a concise justification (max 20 words).
    4. Return ONLY a JSON object: {"score": number, "justification": "string"}
  `;

  try {
    let rawResponse;
    if (aiConfig.provider === "ollama") {
      rawResponse = await evaluateWithOllama(prompt);
    } else {
      rawResponse = await evaluateWithGemini(prompt);
    }

    // Standardize parsing (handling potential markdown blocks from AI)
    const jsonStr = rawResponse.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[AI Service - ${aiConfig.provider}] Error:`, e.message);
    return { score: 0, justification: "AI evaluation failed." };
  }
}

module.exports = { evaluateTextAnswer };