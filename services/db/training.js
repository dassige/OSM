const { initDB } = require("./connection");
const config = require("../../config");

async function getTrainingSessions(startDate, endDate) {
  const db = await initDB();
  return await db.all(
    "SELECT * FROM training_sessions WHERE date >= ? AND date <= ? ORDER BY date ASC",
    startDate, endDate,
  );
}

async function addTrainingSession(date, skillName) {
  const db = await initDB();
  return (await db.run("INSERT INTO training_sessions (date, skill_name) VALUES (?, ?)", date, skillName)).lastID;
}

async function deleteTrainingSession(id) {
  const db = await initDB();
  await db.run("DELETE FROM training_sessions WHERE id = ?", id);
}

async function logEmailAction(member, status, details = "") {
  const db = await initDB();
  await db.run(
    "INSERT INTO email_history (recipient_name, recipient_email, status, details) VALUES (?, ?, ?, ?)",
    member.name, member.email, status, details,
  );
}

async function getAllFutureTrainingSessions() {
  const db = await initDB();
  const nowString = new Date().toLocaleString("en-US", { timeZone: config.timezone });
  const today = new Date(nowString);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return await db.all(
    "SELECT * FROM training_sessions WHERE date >= ? ORDER BY date ASC",
    `${y}-${m}-${d}`,
  );
}

module.exports = { getTrainingSessions, addTrainingSession, deleteTrainingSession, logEmailAction, getAllFutureTrainingSessions };
