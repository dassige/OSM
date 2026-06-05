const { initDB } = require('./connection');

async function listRemoteBackupServers() {
    const db = await initDB();
    return db.all('SELECT * FROM remote_backup_servers ORDER BY created_at ASC');
}

async function getRemoteBackupServer(id) {
    const db = await initDB();
    return db.get('SELECT * FROM remote_backup_servers WHERE id = ?', [id]);
}

async function countRemoteBackupServers() {
    const db = await initDB();
    const row = await db.get('SELECT COUNT(*) AS n FROM remote_backup_servers');
    return row?.n || 0;
}

async function createRemoteBackupServer(data) {
    const db = await initDB();
    const result = await db.run(
        `INSERT INTO remote_backup_servers (name, url, api_key, backup_type, backup_location)
         VALUES (?, ?, ?, ?, ?)`,
        [data.name, data.url, data.apiKey, data.backupType || 'db', data.backupLocation || '']
    );
    return result.lastID;
}

async function updateRemoteBackupServer(id, data) {
    const db = await initDB();
    if (data.apiKey) {
        await db.run(
            `UPDATE remote_backup_servers
             SET name = ?, url = ?, api_key = ?, backup_type = ?
             WHERE id = ?`,
            [data.name, data.url, data.apiKey, data.backupType || 'db', id]
        );
    } else {
        await db.run(
            `UPDATE remote_backup_servers
             SET name = ?, url = ?, backup_type = ?
             WHERE id = ?`,
            [data.name, data.url, data.backupType || 'db', id]
        );
    }
}

async function updateRemoteBackupSchedule(id, schedule) {
    const db = await initDB();
    await db.run(
        `UPDATE remote_backup_servers SET
            schedule_enabled = ?, schedule_type = ?, schedule_time = ?,
            schedule_days = ?, interval_value = ?, retention_type = ?, retention_value = ?,
            backup_location = ?, backup_type = ?
         WHERE id = ?`,
        [
            schedule.enabled ? 1 : 0,
            schedule.scheduleType    || 'daily',
            schedule.scheduleTime    || '02:00',
            schedule.scheduleDays    || '[1]',
            schedule.intervalValue   || 6,
            schedule.retentionType   || 'count',
            schedule.retentionValue  || 10,
            schedule.backupLocation  || '',
            schedule.backupType      || 'db',
            id,
        ]
    );
}

async function updateRemoteBackupRunTimes(id, lastRunAt, nextRunAt, status) {
    const db = await initDB();
    await db.run(
        'UPDATE remote_backup_servers SET last_run_at = ?, next_run_at = ?, last_run_status = ? WHERE id = ?',
        [lastRunAt, nextRunAt, status, id]
    );
}

async function updateRemoteBackupNextRun(id, nextRunAt) {
    const db = await initDB();
    await db.run('UPDATE remote_backup_servers SET next_run_at = ? WHERE id = ?', [nextRunAt, id]);
}

async function deleteRemoteBackupServer(id) {
    const db = await initDB();
    await db.run('DELETE FROM remote_backup_log WHERE server_id = ?', [id]);
    await db.run('DELETE FROM remote_backup_servers WHERE id = ?', [id]);
}

async function logRemoteBackupRun(entry) {
    const db = await initDB();
    await db.run(
        `INSERT INTO remote_backup_log
            (server_id, run_at, triggered_by, status, backup_type, filename, file_size, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            entry.serverId,
            entry.runAt,
            entry.triggeredBy   || 'scheduler',
            entry.status,
            entry.backupType,
            entry.filename      || null,
            entry.fileSize      || null,
            entry.errorMessage  || null,
        ]
    );
}

async function getRemoteBackupHistory(serverId, limit = 20) {
    const db = await initDB();
    return db.all(
        'SELECT * FROM remote_backup_log WHERE server_id = ? ORDER BY id DESC LIMIT ?',
        [serverId, limit]
    );
}

async function clearRemoteBackupHistory(serverId) {
    const db = await initDB();
    await db.run('DELETE FROM remote_backup_log WHERE server_id = ?', [serverId]);
}

module.exports = {
    listRemoteBackupServers,
    getRemoteBackupServer,
    countRemoteBackupServers,
    createRemoteBackupServer,
    updateRemoteBackupServer,
    updateRemoteBackupSchedule,
    updateRemoteBackupRunTimes,
    updateRemoteBackupNextRun,
    deleteRemoteBackupServer,
    logRemoteBackupRun,
    getRemoteBackupHistory,
    clearRemoteBackupHistory,
};
