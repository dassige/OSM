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
      `INSERT INTO skills (name, url, critical_skill, enabled, url_type, skill_osm_id, skill_category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      skill.name, skill.url || '',
      skill.critical_skill ? 1 : 0,
      skill.enabled !== false ? 1 : 0,
      skill.url_type  || 'external',
      skill.skill_osm_id  || null,
      skill.skill_category || null,
    )
  ).lastID;
}

async function bulkAddSkills(skills) {
  const db = await initDB();
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare(
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
  });
}

async function updateSkill(id, skill) {
  const db = await initDB();
  // ETL fields only written when explicitly present (same pattern as updateMember)
  const etlCols = [];
  const etlVals = [];
  if ('skill_osm_id'  in skill) { etlCols.push('skill_osm_id = ?');  etlVals.push(skill.skill_osm_id  || null); }
  if ('skill_category' in skill) { etlCols.push('skill_category = ?'); etlVals.push(skill.skill_category || null); }
  const etlClause = etlCols.length ? ', ' + etlCols.join(', ') : '';

  await db.run(
    `UPDATE skills SET name = ?, url = ?, critical_skill = ?, enabled = ?, url_type = ?${etlClause} WHERE id = ?`,
    skill.name, skill.url || '',
    skill.critical_skill ? 1 : 0,
    skill.enabled ? 1 : 0,
    skill.url_type || 'external',
    ...etlVals,
    id,
  );
}

async function getSkillById(id) {
  const db = await initDB();
  return db.get("SELECT * FROM skills WHERE id = ?", id);
}

async function deleteSkill(id) {
  const db = await initDB();
  await db.run("DELETE FROM skills WHERE id = ?", id);
}

async function bulkDeleteSkills(ids) {
  const db = await initDB();
  if (!ids || ids.length === 0) return;
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare("DELETE FROM skills WHERE id = ?");
    for (const id of ids) {
      await stmt.run(id);
    }
    await stmt.finalize();
  });
}

const SKILL_SORT_COLS = new Set(['name', 'url_type', 'enabled', 'critical_skill']);

async function getSkillsPage({ limit, offset = 0, search, sortBy = 'name', sortDir = 'asc' }) {
  const db = await initDB();
  const col = SKILL_SORT_COLS.has(sortBy) ? sortBy : 'name';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const whereClause = search ? 'WHERE name LIKE ?' : '';
  const filterParams = search ? [`%${search}%`] : [];

  const { n: total } = await db.get(`SELECT COUNT(*) as n FROM skills ${whereClause}`, ...filterParams);
  const rows = await db.all(
    `SELECT * FROM skills ${whereClause} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
    ...filterParams, Number(limit), Number(offset),
  );
  return {
    items: rows.map((s) => ({
      ...s,
      critical_skill: !!s.critical_skill,
      enabled: s.enabled !== 0,
      url_type: s.url_type || 'external',
    })),
    total,
    limit: Number(limit),
    offset: Number(offset),
  };
}

async function updateSkillEtlFields(id, { skillOsmId, skillCategory }) {
  const db = await initDB();
  await db.run(
    'UPDATE skills SET skill_osm_id = ?, skill_category = ? WHERE id = ?',
    skillOsmId || null, skillCategory || null, id,
  );
}

// Bulk-insert skills that came from the OSM extraction — includes ETL fields.
async function bulkAddSkillsWithEtl(skills) {
  const db = await initDB();
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare(
      `INSERT INTO skills
         (name, url, critical_skill, enabled, url_type, skill_osm_id, skill_category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of skills) {
      await stmt.run(
        s.skill, '', s.skill.trim().endsWith('(C)') ? 1 : 0, 1, 'external',
        s.skillOsmId || null, s.skillCategory || null,
      );
    }
    await stmt.finalize();
  });
}

module.exports = { getSkills, getSkillsPage, getSkillById, addSkill, bulkAddSkills, updateSkill, deleteSkill, bulkDeleteSkills, updateSkillEtlFields, bulkAddSkillsWithEtl };
