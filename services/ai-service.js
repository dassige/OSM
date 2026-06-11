// services/ai-service.js
const { aiConfig } = require("../config");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

async function evaluateTextAnswer(question, reference, memberAnswer, maxPoints, configOverride = null) {
  // Use override if provided, otherwise fallback to global aiConfig
  const activeConfig = configOverride || aiConfig;

  if (!activeConfig.enabled && !configOverride) return { score: 0, justification: "AI disabled." };

  // H-14: Use multi-turn format to isolate static instructions (system role) from
  // user-controlled data (user role), preventing prompt injection via member answers.
  const systemInstruction =
    `You are a Technical Examiner for Fire and Emergency New Zealand. ` +
    `Grade volunteer firefighter written answers. ` +
    `Assign a score from 0 to the stated max based on technical accuracy, relevance, and completeness — ` +
    `ignore grammar errors and typos. ` +
    `Respond ONLY with a JSON object: {"score": number, "justification": "string"} ` +
    `where justification is at most 20 words.`;

  const userContent =
    `Question: ${question}\n` +
    `Reference/Rubric: ${reference}\n` +
    `Member's Answer: ${memberAnswer}\n` +
    `Max Points: ${maxPoints}`;

  try {
    let rawResponse;
    if (activeConfig.provider === "ollama") {
      const response = await axios.post(`${activeConfig.ollamaUrl}/api/chat`, {
        model: activeConfig.model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user",   content: userContent },
        ],
        stream: false,
        format: "json",
      });
      rawResponse = response.data.message?.content || response.data.response;
    } else {
      const genAI = new GoogleGenerativeAI(activeConfig.geminiKey);
      const model = genAI.getGenerativeModel({
        model: activeConfig.model,
        systemInstruction: systemInstruction,
      });
      const result = await model.generateContent(userContent);
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