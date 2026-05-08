const { initDB } = require("./connection");

async function getMembers() {
  const db = await initDB();
  const members = await db.all("SELECT * FROM members ORDER BY name ASC");
  return members.map((m) => ({ ...m, enabled: m.enabled !== 0 }));
}

async function addMember(member) {
  const db = await initDB();
  return (
    await db.run(
      "INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)",
      member.name, member.email, member.mobile, member.messengerId,
      member.enabled !== false ? 1 : 0,
      member.notificationPreference || "email",
    )
  ).lastID;
}

async function bulkAddMembers(members) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare(
      "INSERT INTO members (name, email, mobile, messengerId, enabled, notificationPreference) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const member of members) {
      await stmt.run(
        member.name, member.email, member.mobile, member.messengerId,
        member.enabled !== false ? 1 : 0,
        member.notificationPreference || "email",
      );
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function updateMember(id, member) {
  const db = await initDB();
  await db.run(
    "UPDATE members SET name = ?, email = ?, mobile = ?, messengerId = ?, enabled = ?, notificationPreference = ? WHERE id = ?",
    member.name, member.email, member.mobile, member.messengerId,
    member.enabled ? 1 : 0,
    member.notificationPreference || "email",
    id,
  );
}

async function deleteMember(id) {
  const db = await initDB();
  await db.run("DELETE FROM members WHERE id = ?", id);
}

async function bulkDeleteMembers(ids) {
  const db = await initDB();
  if (!ids || ids.length === 0) return;
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare("DELETE FROM members WHERE id = ?");
    for (const id of ids) {
      await stmt.run(id);
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { getMembers, addMember, bulkAddMembers, updateMember, deleteMember, bulkDeleteMembers };
