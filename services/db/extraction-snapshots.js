// services/db/extraction-snapshots.js
// Skills report snapshots (pdf-report plugin) — one row per accepted PDF report.
// "Latest" always means the highest id, i.e. the most recently accepted report.

const { initDB } = require('./connection');

// Columns safe to return in lists — excludes the PDF bytes and parsed records.
const SUMMARY_COLUMNS = `id, plugin, source, source_ref, file_name, file_hash, file_size,
    report_created_date, record_count, member_count, skill_count, warnings, created_by, created_at`;

function toSummary(row) {
    if (!row) return null;
    let warnings = [];
    try { warnings = JSON.parse(row.warnings || '[]'); } catch { warnings = []; }
    return { ...row, warnings };
}

async function createExtractionSnapshot(s) {
    const db = await initDB();
    const result = await db.run(
        `INSERT INTO extraction_snapshots
            (plugin, source, source_ref, file_name, file_hash, file_size, file_data,
             report_created_date, record_count, member_count, skill_count, warnings, records, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            s.plugin, s.source, s.sourceRef || null, s.fileName || null, s.fileHash, s.fileSize,
            s.fileData.toString('base64'), s.reportCreatedDate, s.recordCount, s.memberCount, s.skillCount,
            JSON.stringify(s.warnings || []), JSON.stringify(s.records), s.createdBy || null,
        ],
    );
    return result.lastID;
}

async function listExtractionSnapshots() {
    const db = await initDB();
    const rows = await db.all(`SELECT ${SUMMARY_COLUMNS} FROM extraction_snapshots ORDER BY id DESC`);
    return rows.map(toSummary);
}

async function getExtractionSnapshotById(id) {
    const db = await initDB();
    return toSummary(await db.get(`SELECT ${SUMMARY_COLUMNS} FROM extraction_snapshots WHERE id = ?`, [id]));
}

async function getLatestExtractionSnapshot() {
    const db = await initDB();
    return toSummary(await db.get(`SELECT ${SUMMARY_COLUMNS} FROM extraction_snapshots ORDER BY id DESC LIMIT 1`));
}

async function getLatestExtractionSnapshotBySource(source) {
    const db = await initDB();
    return toSummary(await db.get(
        `SELECT ${SUMMARY_COLUMNS} FROM extraction_snapshots WHERE source = ? ORDER BY id DESC LIMIT 1`,
        [source],
    ));
}

/** Latest snapshot summary plus its parsed records, or null when none exists. */
async function getLatestExtractionRecords() {
    const db = await initDB();
    const row = await db.get(`SELECT ${SUMMARY_COLUMNS}, records FROM extraction_snapshots ORDER BY id DESC LIMIT 1`);
    if (!row) return null;
    const { records, ...summary } = row;
    return { snapshot: toSummary(summary), records: JSON.parse(records) };
}

/** Original PDF of a snapshot as { fileName, buffer }, or null. */
async function getExtractionSnapshotFile(id) {
    const db = await initDB();
    const row = await db.get('SELECT file_name, file_data FROM extraction_snapshots WHERE id = ?', [id]);
    if (!row) return null;
    return { fileName: row.file_name, buffer: Buffer.from(row.file_data, 'base64') };
}

async function deleteExtractionSnapshot(id) {
    const db = await initDB();
    const result = await db.run('DELETE FROM extraction_snapshots WHERE id = ?', [id]);
    return result.changes;
}

/** Keep only the newest `keep` snapshots. Returns the number deleted. */
async function pruneExtractionSnapshots(keep) {
    const db = await initDB();
    const result = await db.run(
        `DELETE FROM extraction_snapshots
         WHERE id NOT IN (SELECT id FROM extraction_snapshots ORDER BY id DESC LIMIT ?)`,
        [keep],
    );
    return result.changes;
}

module.exports = {
    createExtractionSnapshot,
    listExtractionSnapshots,
    getExtractionSnapshotById,
    getLatestExtractionSnapshot,
    getLatestExtractionSnapshotBySource,
    getLatestExtractionRecords,
    getExtractionSnapshotFile,
    deleteExtractionSnapshot,
    pruneExtractionSnapshots,
};
