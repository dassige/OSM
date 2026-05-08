const { initDB } = require("./connection");

async function getPreferences() {
  const db = await initDB();
  const rows = await db.all("SELECT key, value FROM preferences");
  const prefs = {};
  rows.forEach((row) => {
    try { prefs[row.key] = JSON.parse(row.value); }
    catch (e) { prefs[row.key] = row.value; }
  });
  return prefs;
}

async function savePreference(key, value) {
  const db = await initDB();
  await db.run(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key, JSON.stringify(value),
  );
}

async function getAllUserPreferences(userId) {
  const db = await initDB();
  const rows = await db.all("SELECT key, value FROM user_preferences WHERE user_id = ?", userId);
  const prefs = {};
  rows.forEach((row) => {
    try { prefs[row.key] = JSON.parse(row.value); }
    catch (e) { prefs[row.key] = row.value; }
  });
  return prefs;
}

async function getUserPreference(userId, key) {
  const db = await initDB();
  const row = await db.get(
    "SELECT value FROM user_preferences WHERE user_id = ? AND key = ?",
    userId, key,
  );
  try { return row ? JSON.parse(row.value) : null; }
  catch (e) { return row ? row.value : null; }
}

async function saveUserPreference(userId, key, value) {
  const db = await initDB();
  await db.run(
    "INSERT INTO user_preferences (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    userId, key, JSON.stringify(value),
  );
}

module.exports = { getPreferences, savePreference, getAllUserPreferences, getUserPreference, saveUserPreference };
