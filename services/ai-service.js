// services/ai-service.js
const { aiConfig } = require("../config");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

async function evaluateTextAnswer(question, reference, memberAnswer, maxPoints, configOverride = null) {
  // Use override if provided, otherwise fallback to global aiConfig
  const activeConfig = configOverride || aiConfig;

  if (!activeConfig.enabled && !configOverride) return { score: 0, justification: "AI disabled." };

  const prompt = `
    Role: Technical Examiner for Fire and Emergency New Zealand.
    Task: Grade a volunteer firefighter's written answer.
    
    Question: "${question}"
    Reference/Rubric: "${reference}"
    Member's Answer: "${memberAnswer}"
    Max Points: ${maxPoints}

    Instructions:
    1. Compare the Member's Answer to the Reference.
    2. Assign a Raw Score (0 to ${maxPoints}) based on technical accuracy, relevance, and completeness. Don't give much relevance to grammar errors or obvious typos.
    3. Provide a concise justification (max 20 words).
    4. Return ONLY a JSON object: {"score": number, "justification": "string"}
  `;

  try {
    let rawResponse;
    if (activeConfig.provider === "ollama") {
      const response = await axios.post(`${activeConfig.ollamaUrl}/api/generate`, {
        model: activeConfig.model,
        prompt: prompt,
        stream: false,
        format: "json",
      });
      rawResponse = response.data.response;
    } else {
      const genAI = new GoogleGenerativeAI(activeConfig.geminiKey);
      const model = genAI.getGenerativeModel({ model: activeConfig.model });
      const result = await model.generateContent(prompt);
      rawResponse = result.response.text();
    }

    // AI models sometimes wrap JSON in markdown code fences; strip them before parsing
    const jsonStr = rawResponse.replace(/```json|```/g, "").trim();
    return { 
        result: JSON.parse(jsonStr), 
        raw: rawResponse
    };
  } catch (e) {
    throw e; // Let the controller handle the error for logging
  }
}
module.exports = { evaluateTextAnswer };