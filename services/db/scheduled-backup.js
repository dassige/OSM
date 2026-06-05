const { initDB } = require('./connection');

async function getScheduledBackupConfig() {
    const db = await initDB();
    return db.get('SELECT * FROM scheduled_backup_config WHERE id = 1');
}

async function saveScheduledBackupConfig(cfg) {
    const db = await initDB();
    await db.run(
        `UPDATE scheduled_backup_config SET
            enabled         = ?,
            backup_type     = ?,
            schedule_type   = ?,
            schedule_time   = ?,
            schedule_days   = ?,
            interval_value  = ?,
            backup_location = ?,
            retention_type  = ?,
            retention_value = ?,
            updated_at      = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [
            cfg.enabled ? 1 : 0,
            cfg.backupType     || 'db',
            cfg.scheduleType   || 'daily',
            cfg.scheduleTime   || '02:00',
            cfg.scheduleDays   || '[1]',
            cfg.intervalValue  || 6,
            cfg.backupLocation || '',
            cfg.retentionType  || 'count',
            cfg.retentionValue || 10,
        ]
    );
}

async function updateScheduledBackupRunTimes(lastRunAt, nextRunAt) {
    const db = await initDB();
    await db.run(
        'UPDATE scheduled_backup_config SET last_run_at = ?, next_run_at = ? WHERE id = 1',
        [lastRunAt, nextRunAt]
    );
}

async function updateScheduledBackupNextRun(nextRunAt) {
    const db = await initDB();
    await db.run(
        'UPDATE scheduled_backup_config SET next_run_at = ? WHERE id = 1',
        [nextRunAt]
    );
}

async function logScheduledBackupRun(entry) {
    const db = await initDB();
    await db.run(
        `INSERT INTO scheduled_backup_log
            (run_at, status, backup_type, filename, file_size, retention_cleaned, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            entry.runAt,
            entry.status,
            entry.backupType,
            entry.filename       || null,
            entry.fileSize       || null,
            entry.retentionCleaned || 0,
            entry.errorMessage   || null,
        ]
    );
}

async function getScheduledBackupHistory(limit = 20) {
    const db = await initDB();
    return db.all(
        'SELECT * FROM scheduled_backup_log ORDER BY id DESC LIMIT ?',
        [limit]
    );
}

async function clearScheduledBackupHistory() {
    const db = await initDB();
    await db.run('DELETE FROM scheduled_backup_log');
}

module.exports = {
    getScheduledBackupConfig,
    saveScheduledBackupConfig,
    updateScheduledBackupRunTimes,
    updateScheduledBackupNextRun,
    logScheduledBackupRun,
    getScheduledBackupHistory,
    clearScheduledBackupHistory,
};
