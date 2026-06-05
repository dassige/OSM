'use strict';

const cron   = require('node-cron');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const db     = require('./db');
const config = require('../config');
const logger = require('./logger');

// Cron tasks keyed by server ID
const tasks = new Map();

// ── Cron expression builder ───────────────────────────────────────────────────

function buildCronExpression(srv) {
    const [hour, min] = (srv.schedule_time || '02:00').split(':').map(Number);
    switch (srv.schedule_type) {
        case 'weekly': {
            let days;
            try { days = JSON.parse(srv.schedule_days || '[1]').join(','); } catch { days = '1'; }
            return `${min} ${hour} * * ${days}`;
        }
        case 'every_n_hours': return `0 */${srv.interval_value || 6} * * *`;
        case 'every_n_days':  return `${min} ${hour} */${srv.interval_value || 3} * *`;
        default:              return `${min} ${hour} * * *`;
    }
}

function computeNextRun(srv) {
    const now = new Date();
    const [hours, minutes] = (srv.schedule_time || '02:00').split(':').map(Number);
    if (srv.schedule_type === 'daily') {
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setHours(hours, minutes);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next.toISOString();
    }
    if (srv.schedule_type === 'weekly') {
        let days;
        try { days = JSON.parse(srv.schedule_days || '[1]'); } catch { days = [1]; }
        for (let i = 0; i <= 7; i++) {
            const candidate = new Date(now);
            candidate.setDate(now.getDate() + i);
            candidate.setHours(hours, minutes, 0, 0);
            if (days.includes(candidate.getDay()) && candidate > now) return candidate.toISOString();
        }
        return null;
    }
    if (srv.schedule_type === 'every_n_hours') {
        const n = srv.interval_value || 6;
        const next = new Date(now);
        next.setHours((Math.floor(now.getHours() / n) + 1) * n, 0, 0, 0);
        return next.toISOString();
    }
    if (srv.schedule_type === 'every_n_days') {
        const n = srv.interval_value || 3;
        const next = new Date(now);
        next.setDate(next.getDate() + n);
        next.setHours(hours, minutes, 0, 0);
        return next.toISOString();
    }
    return null;
}

// ── Retention cleanup ─────────────────────────────────────────────────────────

async function applyRetention(location, retentionType, retentionValue) {
    if (retentionType === 'none') return 0;
    try {
        const entries = fs.readdirSync(location)
            .filter(f => /^remote-/.test(f))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(location, f)).mtimeMs }))
            .sort((a, b) => a.mtime - b.mtime);
        let removed = 0;
        if (retentionType === 'count') {
            for (const f of entries.slice(0, Math.max(0, entries.length - retentionValue))) {
                fs.unlinkSync(path.join(location, f.name));
                removed++;
            }
        } else if (retentionType === 'days') {
            const cutoff = Date.now() - retentionValue * 86400000;
            for (const f of entries) {
                if (f.mtime < cutoff) { fs.unlinkSync(path.join(location, f.name)); removed++; }
            }
        }
        return removed;
    } catch (e) {
        logger.warn('[RemoteBackup] Retention cleanup error', { error: e.message });
        return 0;
    }
}

// ── Stream backup to caller (for browser download proxy) ─────────────────────
// Returns the raw axios response so the caller can pipe response.data → res.

async function getBackupStream(srv, backupType) {
    const base = (srv.url || '').replace(/\/$/, '');
    return axios.get(`${base}/api/system/backup?type=${backupType}`, {
        headers:      { 'X-API-Key': srv.api_key },
        responseType: 'stream',
        timeout:      15 * 60 * 1000, // 15 min — allows ephemeral cold-start + transfer
    });
}

// ── Connection test ───────────────────────────────────────────────────────────

async function testConnection(url, apiKey) {
    const base = (url || '').replace(/\/$/, '');
    const res  = await axios.get(`${base}/api/health`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 90 * 1000, // 90 s — covers ephemeral cold-start delay
    });
    return { ok: true, version: res.data?.version, uptime: res.data?.uptime };
}

// ── Pull backup from a remote server ─────────────────────────────────────────

async function pullBackup(srv, triggeredBy = 'scheduler') {
    const runAt     = new Date().toISOString();
    const backupType = srv.backup_type || 'db';
    const stamp     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName  = (srv.name || 'server').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext       = backupType === 'full' ? 'zip' : 'sql';
    const filename  = `remote-${safeName}-${backupType}-${stamp}.${ext}`;

    const savePath = (srv.backup_location || '').trim() ||
        path.join('/app/backups/remote', safeName);
    fs.mkdirSync(savePath, { recursive: true });
    const filePath = path.join(savePath, filename);

    const base = (srv.url || '').replace(/\/$/, '');
    logger.info(`[RemoteBackup] Pulling ${backupType} backup from "${srv.name}"...`);

    const response = await axios.get(`${base}/api/system/backup?type=${backupType}`, {
        headers:      { 'X-API-Key': srv.api_key },
        responseType: 'stream',
        timeout:      15 * 60 * 1000, // 15 min — covers cold-start + backup generation + transfer
    });

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
    });

    const fileSize          = fs.statSync(filePath).size;
    const retentionCleaned  = await applyRetention(savePath, srv.retention_type, srv.retention_value);
    const nextRunAt         = computeNextRun(srv);

    await db.logRemoteBackupRun({ serverId: srv.id, runAt, triggeredBy, status: 'success', backupType, filename, fileSize });
    await db.updateRemoteBackupRunTimes(srv.id, runAt, nextRunAt, 'success');
    await db.logEvent('System', 'System', 'Remote Backup Pulled', {
        serverName: srv.name, filename, fileSize, backupType, retentionCleaned,
    });

    logger.info(`[RemoteBackup] Saved ${filename} (${fileSize} bytes), cleaned ${retentionCleaned}`);
    return { filename, fileSize };
}

// ── Per-server scheduler ──────────────────────────────────────────────────────

async function executeRemoteBackup(serverId) {
    const runAt = new Date().toISOString();
    let srv;
    try {
        srv = await db.getRemoteBackupServer(serverId);
        if (!srv || !srv.schedule_enabled) return;
        await pullBackup(srv, 'scheduler');
    } catch (e) {
        logger.error(`[RemoteBackup] Scheduled pull failed for server ${serverId}`, { error: e.message });
        try {
            await db.logRemoteBackupRun({
                serverId, runAt, triggeredBy: 'scheduler', status: 'error',
                backupType: srv?.backup_type || 'unknown', errorMessage: e.message,
            });
            await db.updateRemoteBackupRunTimes(serverId, runAt, null, 'error');
        } catch { /* log failure is non-fatal */ }
        await db.logEvent('System', 'System', 'Remote Backup Failed', {
            serverId, serverName: srv?.name, error: e.message,
        }).catch(() => {});
    }
}

function startServerSchedule(srv) {
    stopServerSchedule(srv.id);
    const cronExpr = buildCronExpression(srv);
    if (!cron.validate(cronExpr)) {
        logger.error(`[RemoteBackup] Invalid cron for server ${srv.id}`, { cronExpr });
        return;
    }
    tasks.set(srv.id, cron.schedule(cronExpr, () => executeRemoteBackup(srv.id), { scheduled: true }));
    logger.info(`[RemoteBackup] Schedule started for "${srv.name}"`, { cronExpr });
}

function stopServerSchedule(serverId) {
    if (tasks.has(serverId)) {
        tasks.get(serverId).stop();
        tasks.delete(serverId);
    }
}

async function restartServerSchedule(serverId) {
    const srv = await db.getRemoteBackupServer(serverId);
    if (!srv) { stopServerSchedule(serverId); return; }
    if (srv.schedule_enabled && config.scheduledBackupSupported) {
        startServerSchedule(srv);
        await db.updateRemoteBackupNextRun(serverId, computeNextRun(srv));
    } else {
        stopServerSchedule(serverId);
    }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function init() {
    if (!config.scheduledBackupSupported) {
        logger.info('[RemoteBackup] Disabled — ephemeral deployment.');
        return;
    }
    try {
        const servers = await db.listRemoteBackupServers();
        let started = 0;
        for (const srv of servers) {
            if (srv.schedule_enabled) {
                startServerSchedule(srv);
                await db.updateRemoteBackupNextRun(srv.id, computeNextRun(srv));
                started++;
            }
        }
        logger.info(`[RemoteBackup] Initialised — ${started} scheduled server(s).`);
    } catch (e) {
        logger.error('[RemoteBackup] Init failed', { error: e.message });
    }
}

module.exports = {
    init, pullBackup, getBackupStream, testConnection, executeRemoteBackup,
    startServerSchedule, stopServerSchedule, restartServerSchedule, computeNextRun,
};
