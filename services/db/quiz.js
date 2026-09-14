const { initDB } = require("./connection");

function parseGame(g) {
  if (!g) return g;
  let questions = [];
  try {
    questions = JSON.parse(g.questions || "[]");
  } catch (e) {
    questions = [];
  }
  return {
    ...g,
    enabled: g.enabled !== 0,
    questions,
    questionCount: questions.length,
  };
}

async function getQuizGames() {
  const db = await initDB();
  const rows = await db.all("SELECT * FROM quiz_games ORDER BY name ASC");
  return rows.map(parseGame);
}

async function getQuizGameById(id) {
  const db = await initDB();
  const row = await db.get("SELECT * FROM quiz_games WHERE id = ?", id);
  return parseGame(row);
}

async function createQuizGame(game) {
  const db = await initDB();
  const result = await db.run(
    `INSERT INTO quiz_games (name, description, game_type, enabled, questions)
     VALUES (?, ?, ?, ?, ?)`,
    game.name,
    game.description || "",
    game.game_type || "score",
    game.enabled !== false ? 1 : 0,
    JSON.stringify(game.questions || []),
  );
  return result.lastID;
}

async function updateQuizGame(id, game) {
  const db = await initDB();
  await db.run(
    `UPDATE quiz_games SET name = ?, description = ?, game_type = ?, enabled = ?, questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    game.name,
    game.description || "",
    game.game_type || "score",
    game.enabled !== false ? 1 : 0,
    JSON.stringify(game.questions || []),
    id,
  );
}

async function deleteQuizGame(id) {
  const db = await initDB();
  await db.run("DELETE FROM quiz_games WHERE id = ?", id);
}

module.exports = { getQuizGames, getQuizGameById, createQuizGame, updateQuizGame, deleteQuizGame };
