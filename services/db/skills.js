const { initDB } = require("./connection");

async function getSkills() {
  const db = await initDB();
  const skills = await db.all("SELECT * FROM skills ORDER BY name ASC");
  return skills.map((s) => ({
    ...s,
    critical_skill: !!s.critical_skill,
    enabled: s.enabled !== 0,
    url_type: s.url_type || "external",
  }));
}

async function addSkill(skill) {
  const db = await initDB();
  return (
    await db.run(
      "INSERT INTO skills (name, url, critical_skill, enabled, url_type) VALUES (?, ?, ?, ?, ?)",
      skill.name, skill.url,
      skill.critical_skill ? 1 : 0,
      skill.enabled !== false ? 1 : 0,
      skill.url_type || "external",
    )
  ).lastID;
}

async function bulkAddSkills(skills) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare(
      "INSERT INTO skills (name, url, critical_skill, enabled, url_type) VALUES (?, ?, ?, ?, ?)",
    );
    for (const skill of skills) {
      await stmt.run(
        skill.name, skill.url,
        skill.critical_skill ? 1 : 0,
        skill.enabled !== false ? 1 : 0,
        skill.url_type || "external",
      );
    }
    await stmt.finalize();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function updateSkill(id, skill) {
  const db = await initDB();
  await db.run(
    "UPDATE skills SET name = ?, url = ?, critical_skill = ?, enabled = ?, url_type = ? WHERE id = ?",
    skill.name, skill.url,
    skill.critical_skill ? 1 : 0,
    skill.enabled ? 1 : 0,
    skill.url_type || "external",
    id,
  );
}

async function deleteSkill(id) {
  const db = await initDB();
  await db.run("DELETE FROM skills WHERE id = ?", id);
}

async function bulkDeleteSkills(ids) {
  const db = await initDB();
  if (!ids || ids.length === 0) return;
  await db.exec("BEGIN TRANSACTION");
  try {
    const stmt = await db.prepare("DELETE FROM skills WHERE id = ?");
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

module.exports = { getSkills, addSkill, bulkAddSkills, updateSkill, deleteSkill, bulkDeleteSkills };
