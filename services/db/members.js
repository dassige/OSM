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
      `INSERT INTO members
         (name, email, mobile, messengerId, enabled, notificationPreference,
          rank, first_name, last_name, member_osm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      member.name, member.email || '', member.mobile || '', member.messengerId || null,
      member.enabled !== false ? 1 : 0,
      member.notificationPreference || 'email',
      member.rank         || null,
      member.first_name   || null,
      member.last_name    || null,
      member.member_osm_id || null,
    )
  ).lastID;
}

async function bulkAddMembers(members) {
  const db = await initDB();
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare(
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
  });
}

async function updateMember(id, member) {
  const db = await initDB();
  // ETL fields are only written when explicitly present in the body.
  // Partial PUTs (e.g. enable-toggle) won't carry these fields, so they are
  // preserved as-is in the database rather than being overwritten with null.
  const etlCols = [];
  const etlVals = [];
  if ('rank'          in member) { etlCols.push('rank = ?');          etlVals.push(member.rank          || null); }
  if ('first_name'    in member) { etlCols.push('first_name = ?');    etlVals.push(member.first_name    || null); }
  if ('last_name'     in member) { etlCols.push('last_name = ?');     etlVals.push(member.last_name     || null); }
  if ('member_osm_id' in member) { etlCols.push('member_osm_id = ?'); etlVals.push(member.member_osm_id || null); }
  const etlClause = etlCols.length ? ', ' + etlCols.join(', ') : '';

  await db.run(
    `UPDATE members SET name = ?, email = ?, mobile = ?, messengerId = ?, enabled = ?, notificationPreference = ?${etlClause} WHERE id = ?`,
    member.name, member.email, member.mobile, member.messengerId,
    member.enabled ? 1 : 0,
    member.notificationPreference || 'email',
    ...etlVals,
    id,
  );
}

async function getMemberById(id) {
  const db = await initDB();
  return db.get("SELECT * FROM members WHERE id = ?", id);
}

async function deleteMember(id) {
  const db = await initDB();
  await db.run("DELETE FROM members WHERE id = ?", id);
}

async function bulkDeleteMembers(ids) {
  const db = await initDB();
  if (!ids || ids.length === 0) return;
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare("DELETE FROM members WHERE id = ?");
    for (const id of ids) {
      await stmt.run(id);
    }
    await stmt.finalize();
  });
}

const MEMBER_SORT_COLS = new Set(['name', 'email', 'mobile', 'enabled', 'notificationPreference']);

async function getMembersPage({ limit, offset = 0, search, sortBy = 'name', sortDir = 'asc' }) {
  const db = await initDB();
  const col = MEMBER_SORT_COLS.has(sortBy) ? sortBy : 'name';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  const whereClause = search ? 'WHERE name LIKE ?' : '';
  const filterParams = search ? [`%${search}%`] : [];

  const { n: total } = await db.get(`SELECT COUNT(*) as n FROM members ${whereClause}`, ...filterParams);
  const rows = await db.all(
    `SELECT * FROM members ${whereClause} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
    ...filterParams, Number(limit), Number(offset),
  );
  return {
    items: rows.map((m) => ({ ...m, enabled: m.enabled !== 0 })),
    total,
    limit: Number(limit),
    offset: Number(offset),
  };
}

async function updateMemberEtlFields(id, { rank, firstName, lastName, memberOsmId }) {
  const db = await initDB();
  await db.run(
    'UPDATE members SET rank = ?, first_name = ?, last_name = ?, member_osm_id = ? WHERE id = ?',
    rank || null, firstName || null, lastName || null, memberOsmId || null, id,
  );
}

// Bulk-insert members that came from the OSM extraction — includes ETL fields.
async function bulkAddMembersWithEtl(members) {
  const db = await initDB();
  await db.transaction(async (tx) => {
    const stmt = await tx.prepare(
      `INSERT INTO members
         (name, email, mobile, messengerId, enabled, notificationPreference,
          rank, first_name, last_name, member_osm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of members) {
      await stmt.run(
        m.name, '', '', null, 1, 'email',
        m.rank || null, m.firstName || null, m.lastName || null, m.memberOsmId || null,
      );
    }
    await stmt.finalize();
  });
}

module.exports = { getMembers, getMembersPage, getMemberById, addMember, bulkAddMembers, updateMember, deleteMember, bulkDeleteMembers, updateMemberEtlFields, bulkAddMembersWithEtl };
