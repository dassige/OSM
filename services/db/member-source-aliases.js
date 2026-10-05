// services/db/member-source-aliases.js
// Links between a member's name as it appears in an extraction source
// (pdf-report: "Andrew Keith") and the member record.

const { initDB } = require('./connection');

const SELECT_WITH_MEMBER = `
    SELECT a.id, a.source_name, a.source_key, a.member_id, a.match_type, a.created_by, a.created_at,
           m.name AS member_name
    FROM member_source_aliases a
    JOIN members m ON m.id = a.member_id`;

async function getMemberSourceAliases() {
    const db = await initDB();
    return db.all(`${SELECT_WITH_MEMBER} ORDER BY a.source_name ASC`);
}

async function getMemberSourceAliasById(id) {
    const db = await initDB();
    return db.get(`${SELECT_WITH_MEMBER} WHERE a.id = ?`, [id]);
}

/**
 * Save an automatic match unless the name is already linked.
 * @returns {Promise<boolean>} true when a new link was created
 */
async function createAutoMemberSourceAlias({ sourceName, sourceKey, memberId }) {
    const db = await initDB();
    const result = await db.run(
        `INSERT INTO member_source_aliases (source_name, source_key, member_id, match_type, created_by)
         VALUES (?, ?, ?, 'auto', 'System')
         ON CONFLICT(source_key) DO NOTHING`,
        [sourceName, sourceKey, memberId],
    );
    return result.changes > 0;
}

/** Create or replace the link for a name with an admin's choice. Returns the alias id. */
async function saveManualMemberSourceAlias({ sourceName, sourceKey, memberId, createdBy }) {
    const db = await initDB();
    await db.run(
        `INSERT INTO member_source_aliases (source_name, source_key, member_id, match_type, created_by)
         VALUES (?, ?, ?, 'manual', ?)
         ON CONFLICT(source_key) DO UPDATE SET
             source_name = excluded.source_name, member_id = excluded.member_id,
             match_type = 'manual', created_by = excluded.created_by, created_at = CURRENT_TIMESTAMP`,
        [sourceName, sourceKey, memberId, createdBy || null],
    );
    const row = await db.get('SELECT id FROM member_source_aliases WHERE source_key = ?', [sourceKey]);
    return row.id;
}

async function deleteMemberSourceAlias(id) {
    const db = await initDB();
    const result = await db.run('DELETE FROM member_source_aliases WHERE id = ?', [id]);
    return result.changes;
}

module.exports = {
    getMemberSourceAliases,
    getMemberSourceAliasById,
    createAutoMemberSourceAlias,
    saveManualMemberSourceAlias,
    deleteMemberSourceAlias,
};
