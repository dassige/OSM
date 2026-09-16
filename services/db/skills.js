const { initDB } = require("./connection");

// Joined so callers get the linked KB document's title/slug/validity alongside each
// skill without a second round trip (kb_document_id alone isn't enough to build a link
// or render a title — see member-manager.js's expiry-notification enrichment).
const SKILLS_SELECT = `
  SELECT s.*, kb.title AS kb_document_title, kb.slug AS kb_document_slug,
         kb.is_active AS kb_document_active, kb.expires_at AS kb_document_expires_at
    FROM skills s
    LEFT JOIN knowledgebase_documents kb ON kb.id = s.kb_document_id
`;

async function getSkills() {
  const db = await initDB();
  const skills = await db.all(`${SKILLS_SELECT} ORDER BY s.name ASC`);
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
      `INSERT INTO skills (name, url, critical_skill, enabled, url_type, skill_osm_id, skill_category, kb_document_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      skill.name, skill.url || '',
      skill.critical_skill ? 1 : 0,
      skill.enabled !== false ? 1 : 0,
      skill.url_type  || 'external',
      skill.skill_osm_id  || null,
      skill.skill_category || null,
      skill.kb_document_id || null,
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
  // ETL fields only written when explicitly present (same pattern as updateMember)
  const etlCols = [];
  const etlVals = [];
  if ('skill_osm_id'  in skill) { etlCols.push('skill_osm_id = ?');  etlVals.push(skill.skill_osm_id  || null); }
  if ('skill_category' in skill) { etlCols.push('skill_category = ?'); etlVals.push(skill.skill_category || null); }
  const etlClause = etlCols.length ? ', ' + etlCols.join(', ') : '';

  await db.run(
    `UPDATE skills SET name = ?, url = ?, critical_skill = ?, enabled = ?, url_type = ?, kb_document_id = ?${etlClause} WHERE id = ?`,
    skill.name, skill.url || '',
    skill.critical_skill ? 1 : 0,
    skill.enabled ? 1 : 0,
    skill.url_type || 'external',
    skill.kb_document_id || null,
    ...etlVals,
    id,
  );
}

async function getSkillById(id) {
  const db = await initDB();
  return db.get(`${SKILLS_SELECT} WHERE s.id = ?`, id);
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

const SKILL_SORT_COLS = new Set(['name', 'url_type', 'enabled', 'critical_skill']);

async function getSkillsPage({ limit, offset = 0, search, sortBy = 'name', sortDir = 'asc' }) {
  const db = await initDB();
  const col = SKILL_SORT_COLS.has(sortBy) ? sortBy : 'name';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const whereClause = search ? 'WHERE s.name LIKE ?' : '';
  const filterParams = search ? [`%${search}%`] : [];

  const { n: total } = await db.get(`SELECT COUNT(*) as n FROM skills s ${whereClause}`, ...filterParams);
  const rows = await db.all(
    `${SKILLS_SELECT} ${whereClause} ORDER BY s.${col} ${dir} LIMIT ? OFFSET ?`,
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
  await db.exec('BEGIN TRANSACTION');
  try {
    const stmt = await db.prepare(
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
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getSkills, getSkillsPage, getSkillById, addSkill, bulkAddSkills, updateSkill, deleteSkill, bulkDeleteSkills, updateSkillEtlFields, bulkAddSkillsWithEtl };
