'use strict';

const cron     = require('node-cron');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');

const db         = require('./db');
const config     = require('../config');
const kbStorage  = require('./knowledgebase-storage');
const logger     = require('./logger');
const { version } = require('../package.json');

let currentTask = null;

// ── Cron expression builder ──────────────────────────────────────────────────

function buildCronExpression(cfg) {
    const [hour, min] = (cfg.schedule_time || '02:00').split(':').map(Number);

    switch (cfg.schedule_type) {
        case 'weekly': {
            let days;
            try { days = JSON.parse(cfg.schedule_days || '[1]').join(','); }
            catch { days = '1'; }
            return `${min} ${hour} * * ${days}`;
        }
        case 'every_n_hours':
            return `0 */${cfg.interval_value || 6} * * *`;
        case 'every_n_days':
            return `${min} ${hour} */${cfg.interval_value || 3} * *`;
        case 'daily':
        default:
            return `${min} ${hour} * * *`;
    }
}

// ── Next-run estimator ───────────────────────────────────────────────────────

function computeNextRun(cfg) {
    const now = new Date();
    const [hours, minutes] = (cfg.schedule_time || '02:00').split(':').map(Number);

    if (cfg.schedule_type === 'daily') {
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setHours(hours, minutes);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next.toISOString();
    }

    if (cfg.schedule_type === 'weekly') {
        let days;
        try { days = JSON.parse(cfg.schedule_days || '[1]'); }
        catch { days = [1]; }
        // Check today first, then advance one day at a time
        for (let i = 0; i <= 7; i++) {
            const candidate = new Date(now);
            candidate.setDate(now.getDate() + i);
            candidate.setHours(hours, minutes, 0, 0);
            if (days.includes(candidate.getDay()) && candidate > now) {
                return candidate.toISOString();
            }
        }
        return null;
    }

    if (cfg.schedule_type === 'every_n_hours') {
        const n = cfg.interval_value || 6;
        const next = new Date(now);
        const nextHour = (Math.floor(now.getHours() / n) + 1) * n;
        next.setHours(nextHour, 0, 0, 0);
        return next.toISOString();
    }

    if (cfg.schedule_type === 'every_n_days') {
        const n = cfg.interval_value || 3;
        const next = new Date(now);
        next.setDate(next.getDate() + n);
        next.setHours(hours, minutes, 0, 0);
        return next.toISOString();
    }

    return null;
}

// ── Retention cleanup ────────────────────────────────────────────────────────

async function applyRetention(backupLocation, retentionType, retentionValue) {
    if (retentionType === 'none') return 0;
    try {
        const entries = fs.readdirSync(backupLocation)
            .filter(f => /^opready-(db|full)-backup-/.test(f))
            .map(f => {
                const full = path.join(backupLocation, f);
                return { name: f, mtime: fs.statSync(full).mtimeMs };
            })
            .sort((a, b) => a.mtime - b.mtime); // oldest first

        let removed = 0;

        if (retentionType === 'count') {
            const excess = entries.slice(0, Math.max(0, entries.length - retentionValue));
            for (const f of excess) {
                fs.unlinkSync(path.join(backupLocation, f.name));
                removed++;
            }
        } else if (retentionType === 'days') {
            const cutoff = Date.now() - retentionValue * 24 * 60 * 60 * 1000;
            for (const f of entries) {
                if (f.mtime < cutoff) {
                    fs.unlinkSync(path.join(backupLocation, f.name));
                    removed++;
                }
            }
        }
        return removed;
    } catch (e) {
        logger.warn('[ScheduledBackup] Retention cleanup error', { error: e.message });
        return 0;
    }
}

// ── Backup writer ────────────────────────────────────────────────────────────

async function writeBackup(cfg) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const loc   = cfg.backup_location;

    if (!loc) throw new Error('Backup location is not configured.');
    fs.mkdirSync(loc, { recursive: true });

    const dump = await db.generateSqlDump();

    if (cfg.backup_type === 'full') {
        const kbType = config.kbStorage?.type || 'local';
        const kbPath = config.kbStorage?.localPath;
        let kbFileCount = 0;
        let kbDocs      = [];
        if (kbType === 'local' && kbPath && fs.existsSync(kbPath)) {
            kbFileCount = fs.readdirSync(kbPath).filter(f =>
                fs.statSync(path.join(kbPath, f)).isFile()
            ).length;
        } else if (kbType === 's3' || kbType === 'gcs') {
            kbDocs      = await db.getKbDocuments();
            kbFileCount = kbDocs.length;
        }

        const manifest = {
            appVersion: version,
            date: new Date().toISOString(),
            backupType: 'full',
            storageType: kbType,
            kbFileCount,
        };

        const filename = `opready-full-backup-${stamp}.zip`;
        const filePath = path.join(loc, filename);

        // Buffer cloud-storage files before starting the archive so the async
        // fetches complete before we hand control to the synchronous archiver callback.
        const cloudEntries = [];
        for (const doc of kbDocs) {
            try {
                const stream = await kbStorage.getFileStream(doc.storage_type, doc.storage_path);
                const chunks = [];
                for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                cloudEntries.push({ name: `storage/knowledgebase/${path.basename(doc.storage_path)}`, data: Buffer.concat(chunks) });
            } catch (e) {
                logger.warn('[ScheduledBackup] Skipped KB file from cloud storage', { storagePath: doc.storage_path, error: e.message });
            }
        }

        await new Promise((resolve, reject) => {
            const output  = fs.createWriteStream(filePath);
            const archive = archiver('zip', { zlib: { level: 6 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
            archive.append(dump, { name: 'database.sql' });
            if (kbType === 'local' && kbPath && fs.existsSync(kbPath)) {
                archive.directory(kbPath, 'storage/knowledgebase');
            }
            for (const entry of cloudEntries) {
                archive.append(entry.data, { name: entry.name });
            }
            archive.finalize();
        });

        return { filename, fileSize: fs.statSync(filePath).size };
    }

    // db-only SQL dump
    const filename = `opready-db-backup-${stamp}.sql`;
    const filePath = path.join(loc, filename);
    fs.writeFileSync(filePath, dump, 'utf8');
    return { filename, fileSize: fs.statSync(filePath).size };
}

// ── Backup execution (called by cron and by "run now") ───────────────────────

async function executeScheduledBackup() {
    const runAt = new Date().toISOString();
    logger.info('[ScheduledBackup] Starting scheduled backup run...');

    let cfg;
    try {
        cfg = await db.getScheduledBackupConfig();
        if (!cfg || !cfg.enabled) {
            logger.info('[ScheduledBackup] Schedule is disabled — skipping.');
            return;
        }

        const { filename, fileSize } = await writeBackup(cfg);

        const retentionCleaned = await applyRetention(
            cfg.backup_location,
            cfg.retention_type,
            cfg.retention_value
        );

        await db.logScheduledBackupRun({ runAt, status: 'success', backupType: cfg.backup_type, filename, fileSize, retentionCleaned });
        await db.updateScheduledBackupRunTimes(runAt, computeNextRun(cfg));
        await db.logEvent('System', 'System', 'Scheduled Backup Completed', { filename, fileSize, backupType: cfg.backup_type, retentionCleaned });

        logger.info('[ScheduledBackup] Completed', { filename, fileSize, retentionCleaned });

    } catch (e) {
        logger.error('[ScheduledBackup] Failed', { error: e.message });
        try {
            await db.logScheduledBackupRun({ runAt, status: 'error', backupType: cfg?.backup_type || 'unknown', retentionCleaned: 0, errorMessage: e.message });
        } catch { /* logging failure is non-fatal */ }
        await db.logEvent('System', 'System', 'Scheduled Backup Failed', { error: e.message }).catch(() => {});
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function init() {
    if (!config.scheduledBackupSupported) {
        logger.info(`[ScheduledBackup] Disabled — ephemeral deployment type: ${config.deploymentType}`);
        return;
    }

    try {
        const cfg = await db.getScheduledBackupConfig();
        if (!cfg || !cfg.enabled) {
            logger.info('[ScheduledBackup] No active schedule configured.');
            return;
        }

        const cronExpr = buildCronExpression(cfg);
        if (!cron.validate(cronExpr)) {
            logger.error('[ScheduledBackup] Invalid cron expression', { cronExpr });
            return;
        }

        currentTask = cron.schedule(cronExpr, executeScheduledBackup, { scheduled: true });
        const nextRun = computeNextRun(cfg);
        await db.updateScheduledBackupNextRun(nextRun);
        logger.info('[ScheduledBackup] Scheduler started', { cronExpr, nextRun });

    } catch (e) {
        logger.error('[ScheduledBackup] Init failed', { error: e.message });
    }
}

async function restart() {
    if (currentTask) {
        currentTask.stop();
        currentTask = null;
    }
    await init();
}

function stop() {
    if (currentTask) {
        currentTask.stop();
        currentTask = null;
    }
}

module.exports = { init, restart, stop, executeScheduledBackup, computeNextRun, buildCronExpression };
