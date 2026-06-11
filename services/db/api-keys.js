const crypto = require('crypto');
const { initDB } = require('./connection');

// H-16: Use HMAC-SHA256 keyed on a server secret so that a stolen database alone
// is insufficient to verify or brute-force API keys. Secret is loaded lazily to
// avoid circular-dependency issues at module load time.
let _hmacSecret = null;
function getHmacSecret() {
    if (!_hmacSecret) _hmacSecret = require('../../config').auth.apiKeyHashSecret;
    return _hmacSecret;
}

function hashKey(rawKey) {
    return crypto.createHmac('sha256', getHmacSecret()).update(rawKey).digest('hex');
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
        `SELECT id, name, key_prefix, role, active FROM api_keys WHERE key_hash = ?`,
        hash
    );
}

async function touchApiKey(id) {
    const db = await initDB();
    await db.run(
        `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`, id
    );
}

async function getApiKeyById(id) {
    const db = await initDB();
    return db.get(
        `SELECT id, name, key_prefix, role, created_by, active FROM api_keys WHERE id = ?`, id
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

// ── API Call Log ──────────────────────────────────────────────────────────────

async function logApiCall(apiKeyId, keyName, keyPrefix, method, endpoint, originIp, userAgent, statusCode, queryParams, requestBody, pathParams, geoLocation) {
    try {
        const db = await initDB();
        await db.run(
            `INSERT INTO api_call_log (api_key_id, key_name, key_prefix, method, endpoint, origin_ip, user_agent, status_code, query_params, request_body, path_params, geo_location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            apiKeyId, keyName, keyPrefix, method, endpoint, originIp, userAgent, statusCode,
            queryParams || null, requestBody || null, pathParams || null,
            geoLocation ? JSON.stringify(geoLocation) : null
        );
    } catch (_) {
        // Never let logging failures affect request handling
    }
}

async function listApiCallLog({ page = 1, limit = 50, keyId, method, endpoint, startDate, endDate, sort = 'logged_at', sortDir = 'desc' } = {}) {
    const ALLOWED_SORT = new Set(['logged_at', 'key_name', 'method', 'endpoint', 'origin_ip', 'status_code']);
    const sortCol   = ALLOWED_SORT.has(sort) ? sort : 'logged_at';
    const sortOrder = sortDir === 'asc' ? 'ASC' : 'DESC';

    const db = await initDB();
    const conditions = [];
    const params = [];

    if (keyId) { conditions.push('api_key_id = ?'); params.push(keyId); }
    if (method) { conditions.push('method = ?'); params.push(method.toUpperCase()); }
    if (endpoint) { conditions.push('endpoint LIKE ?'); params.push(`%${endpoint}%`); }
    if (startDate) { conditions.push("logged_at >= ?"); params.push(startDate); }
    if (endDate) { conditions.push("logged_at <= ?"); params.push(endDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [rows, countRow] = await Promise.all([
        db.all(
            `SELECT id, api_key_id, key_name, key_prefix, method, endpoint, origin_ip, geo_location, user_agent, status_code, query_params, request_body, path_params, logged_at
             FROM api_call_log ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        ),
        db.get(`SELECT COUNT(*) AS total FROM api_call_log ${where}`, params)
    ]);

    return { rows, total: countRow?.total || 0 };
}

async function exportApiCallLog({ keyId, method, endpoint, startDate, endDate, sort = 'logged_at', sortDir = 'desc' } = {}) {
    const ALLOWED_SORT = new Set(['logged_at', 'key_name', 'method', 'endpoint', 'origin_ip', 'status_code']);
    const sortCol   = ALLOWED_SORT.has(sort) ? sort : 'logged_at';
    const sortOrder = sortDir === 'asc' ? 'ASC' : 'DESC';

    const db = await initDB();
    const conditions = [];
    const params = [];

    if (keyId)     { conditions.push('api_key_id = ?');  params.push(keyId); }
    if (method)    { conditions.push('method = ?');       params.push(method.toUpperCase()); }
    if (endpoint)  { conditions.push('endpoint LIKE ?');  params.push(`%${endpoint}%`); }
    if (startDate) { conditions.push('logged_at >= ?');   params.push(startDate); }
    if (endDate)   { conditions.push('logged_at <= ?');   params.push(endDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return db.all(
        `SELECT id, api_key_id, key_name, key_prefix, method, endpoint, origin_ip, geo_location, user_agent, status_code, query_params, request_body, path_params, logged_at
         FROM api_call_log ${where} ORDER BY ${sortCol} ${sortOrder}`,
        params
    );
}

async function purgeApiCallLog(olderThanDays) {
    const db = await initDB();
    const result = await db.run(
        `DELETE FROM api_call_log WHERE logged_at < datetime('now', '-' || ? || ' days')`,
        olderThanDays
    );
    return result.changes || 0;
}

module.exports = {
    listApiKeys,
    getApiKeyById,
    createApiKey,
    getApiKeyByHash,
    touchApiKey,
    toggleApiKey,
    deleteApiKey,
    hashKey,
    logApiCall,
    listApiCallLog,
    exportApiCallLog,
    purgeApiCallLog,
};
