const crypto = require('crypto');
const { initDB } = require('./connection');

function hashKey(rawKey) {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey() {
    const raw = 'osm_' + crypto.randomBytes(32).toString('hex');
    const prefix = raw.substring(0, 12);   // "osm_" + 8 hex chars
    const hash = hashKey(raw);
    return { raw, prefix, hash };
}

async function listApiKeys() {
    const db = await initDB();
    return db.all(
        `SELECT id, name, key_prefix, role, created_by, created_at, last_used_at, active
         FROM api_keys ORDER BY created_at DESC`
    );
}

async function createApiKey(name, role, createdByName) {
    const db = await initDB();
    const { raw, prefix, hash } = generateApiKey();
    await db.run(
        `INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        name, prefix, hash, role, createdByName
    );
    return { raw, prefix };
}

async function getApiKeyByHash(hash) {
    const db = await initDB();
    return db.get(
        `SELECT id, name, role, active FROM api_keys WHERE key_hash = ?`,
        hash
    );
}

async function touchApiKey(id) {
    const db = await initDB();
    await db.run(
        `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`, id
    );
}

async function toggleApiKey(id) {
    const db = await initDB();
    await db.run(
        `UPDATE api_keys SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?`, id
    );
}

async function deleteApiKey(id) {
    const db = await initDB();
    await db.run(`DELETE FROM api_keys WHERE id = ?`, id);
}

module.exports = {
    listApiKeys,
    createApiKey,
    getApiKeyByHash,
    touchApiKey,
    toggleApiKey,
    deleteApiKey,
    hashKey
};
