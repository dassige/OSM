const crypto = require("crypto");
const { initDB } = require("./connection");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return { salt, hash: derivedKey.toString("hex") };
}

function verifyPassword(password, storedHash, storedSalt) {
  const derivedKey = crypto.scryptSync(password, storedSalt, 64);
  return storedHash === derivedKey.toString("hex");
}

async function authenticateUser(email, password) {
  const db = await initDB();
  const user = await db.get("SELECT * FROM users WHERE email = ?", email);
  if (!user) return null;
  if (verifyPassword(password, user.hash, user.salt)) {
    return { id: user.id, name: user.name, email: user.email, role: user.role || "simple" };
  }
  return null;
}

async function resetLoginAttempts(userId) {
  const db = await initDB();
  await db.run("UPDATE users SET login_attempts = 0 WHERE id = ?", userId);
}

async function incrementLoginAttempts(email) {
  const db = await initDB();
  await db.run("UPDATE users SET login_attempts = login_attempts + 1 WHERE email = ?", email);
  return await db.get("SELECT id, login_attempts FROM users WHERE email = ?", email);
}

async function blockUser(userId) {
  const db = await initDB();
  await db.run("UPDATE users SET blocked = 1 WHERE id = ?", userId);
}

async function getUsers() {
  const db = await initDB();
  return await db.all(
    "SELECT id, email, name, role, enabled, blocked, login_attempts FROM users ORDER BY name ASC",
  );
}

async function getUserById(id) {
  const db = await initDB();
  return await db.get(
    "SELECT id, email, name, role, enabled, blocked, login_attempts FROM users WHERE id = ?",
    id,
  );
}

async function getUserByEmail(email) {
  const db = await initDB();
  return await db.get(
    "SELECT id, email, name, role, enabled, blocked, login_attempts FROM users WHERE email = ?",
    email,
  );
}

async function addUser(email, name, password, role = "simple") {
  const db = await initDB();
  const { salt, hash } = hashPassword(password);
  try {
    const result = await db.run(
      "INSERT INTO users (email, name, hash, salt, role, enabled, blocked, login_attempts) VALUES (?, ?, ?, ?, ?, 1, 0, 0)",
      email, name, hash, salt, role,
    );
    return result.lastID;
  } catch (e) {
    if (e.message.includes("UNIQUE constraint")) throw new Error("Email already exists");
    throw e;
  }
}

async function updateUser(id, name, email, role, enabled, blocked) {
  const db = await initDB();
  try {
    await db.run(
      `UPDATE users SET name = ?, email = ?, role = ?, enabled = ?, blocked = ? WHERE id = ?`,
      name, email, role, enabled ? 1 : 0, blocked ? 1 : 0, id,
    );
    if (!blocked) await resetLoginAttempts(id);
    return true;
  } catch (e) {
    if (e.message.includes("UNIQUE constraint")) throw new Error("Email already exists");
    throw e;
  }
}

async function updateUserProfile(id, name, newPassword = null) {
  const db = await initDB();
  if (newPassword) {
    const { salt, hash } = hashPassword(newPassword);
    await db.run("UPDATE users SET name = ?, hash = ?, salt = ? WHERE id = ?", name, hash, salt, id);
  } else {
    await db.run("UPDATE users SET name = ? WHERE id = ?", name, id);
  }
}

async function adminResetPassword(id, newPassword) {
  const db = await initDB();
  const { salt, hash } = hashPassword(newPassword);
  await db.run("UPDATE users SET hash = ?, salt = ? WHERE id = ?", hash, salt, id);
}

async function deleteUser(id) {
  const db = await initDB();
  await db.run("DELETE FROM users WHERE id = ?", id);
}

async function setMfaSecret(userId, secret) {
  const db = await initDB();
  await db.run("UPDATE users SET mfa_secret = ? WHERE id = ?", secret, userId);
}

async function setMfaStatus(userId, enabled) {
  const db = await initDB();
  await db.run("UPDATE users SET mfa_enabled = ? WHERE id = ?", enabled ? 1 : 0, userId);
}

async function getMfaData(userId) {
  const db = await initDB();
  return await db.get("SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?", userId);
}

async function verifyUserPassword(userId, password) {
  const db = await initDB();
  const user = await db.get("SELECT hash, salt FROM users WHERE id = ?", userId);
  if (!user) return false;
  return verifyPassword(password, user.hash, user.salt);
}

module.exports = {
  authenticateUser,
  resetLoginAttempts,
  incrementLoginAttempts,
  blockUser,
  getUsers,
  getUserById,
  getUserByEmail,
  addUser,
  updateUser,
  updateUserProfile,
  adminResetPassword,
  deleteUser,
  setMfaSecret,
  setMfaStatus,
  getMfaData,
  verifyUserPassword,
};
