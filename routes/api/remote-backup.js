// routes/api/remote-backup.js
const express = require('express');
const router  = express.Router();

const db                  = require('../../services/db');
const config              = require('../../config');
const remoteBackupService = require('../../services/remote-backup-service');
const { hasRole }         = require('../../middleware/auth');
const logger              = require('../../services/logger');

const MAX_SERVERS = 5;

// ── List all remote servers ───────────────────────────────────────────────────
router.get('/', hasRole('superadmin'), async (req, res) => {
    try {
        const servers = await db.listRemoteBackupServers();
        // Never expose raw API keys
        res.json(servers.map(s => ({ ...s, api_key: undefined, api_key_set: true })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Add a server ──────────────────────────────────────────────────────────────
router.post('/', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const count = await db.countRemoteBackupServers();
        if (count >= MAX_SERVERS)
            return res.status(400).json({ error: `Maximum of ${MAX_SERVERS} remote servers allowed.` });

        const { name, url, apiKey, backupType, backupLocation } = req.body;
        if (!name || !url || !apiKey)
            return res.status(400).json({ error: 'Name, URL and API key are required.' });

        const id    = await db.createRemoteBackupServer({ name, url, apiKey, backupType, backupLocation });
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System', 'Remote Backup Server Added', { id, serverName: name, url });
        logger.info('[RemoteBackup] Server added', { id, name });
        res.json({ id });
    } catch (e) {
        if (e.message.includes('UNIQUE'))
            return res.status(400).json({ error: 'A server with that name already exists.' });
        res.status(500).json({ error: e.message });
    }
});

// ── Update a server ───────────────────────────────────────────────────────────
router.put('/:id', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const { name, url, apiKey, backupType, backupLocation } = req.body;
        if (!name || !url) return res.status(400).json({ error: 'Name and URL are required.' });
        await db.updateRemoteBackupServer(Number(req.params.id), { name, url, apiKey, backupType, backupLocation });
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System', 'Remote Backup Server Updated', { serverId: req.params.id, serverName: name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Delete a server ───────────────────────────────────────────────────────────
router.delete('/:id', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const srv = await db.getRemoteBackupServer(Number(req.params.id));
        remoteBackupService.stopServerSchedule(Number(req.params.id));
        await db.deleteRemoteBackupServer(Number(req.params.id));
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System', 'Remote Backup Server Deleted', { serverId: req.params.id, serverName: srv?.name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Test connection (saved server) ────────────────────────────────────────────
router.post('/:id/test', hasRole('superadmin'), async (req, res) => {
    try {
        const srv = await db.getRemoteBackupServer(Number(req.params.id));
        if (!srv) return res.status(404).json({ error: 'Server not found.' });
        const result = await remoteBackupService.testConnection(srv.url, srv.api_key);
        res.json(result);
    } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
    }
});

// ── Test connection with inline credentials (before saving) ───────────────────
router.post('/test-inline', hasRole('superadmin'), async (req, res) => {
    try {
        const { url, apiKey } = req.body;
        if (!url || !apiKey) return res.status(400).json({ error: 'URL and API key are required.' });
        const result = await remoteBackupService.testConnection(url, apiKey);
        res.json(result);
    } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
    }
});

// ── Run manual pull backup ────────────────────────────────────────────────────
router.post('/:id/run-now', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    if (!config.scheduledBackupSupported)
        return res.status(403).json({ error: 'Not supported on this deployment type.' });
    try {
        const srv = await db.getRemoteBackupServer(Number(req.params.id));
        if (!srv) return res.status(404).json({ error: 'Server not found.' });
        // Allow per-request backup type override
        const srvForRun = req.body.backupType
            ? { ...srv, backup_type: req.body.backupType }
            : srv;
        const { filename, fileSize } = await remoteBackupService.pullBackup(srvForRun, 'manual');
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System', 'Remote Backup Run Manually', { serverName: srv.name, filename, fileSize });
        res.json({ success: true, filename, fileSize });
    } catch (e) {
        logger.error('[RemoteBackup] Manual run failed', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── Download backup directly to browser (manual use — no disk write) ─────────
// Proxies GET /api/system/backup from the remote server straight to the client.
// The browser receives the Content-Disposition header and triggers Save-As.
router.get('/:id/download', hasRole('superadmin'), async (req, res) => {
    try {
        const srv = await db.getRemoteBackupServer(Number(req.params.id));
        if (!srv) return res.status(404).json({ error: 'Server not found.' });

        const backupType = req.query.type === 'full' ? 'full' : 'db';
        const remote = await remoteBackupService.getBackupStream(srv, backupType);

        // Forward the filename and content-type the remote server provided
        const cd = remote.headers['content-disposition'];
        const ct = remote.headers['content-type'];
        if (cd) res.setHeader('Content-Disposition', cd);
        if (ct) res.setHeader('Content-Type', ct);

        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        db.logEvent(actor, 'System', 'Remote Backup Downloaded to Browser', {
            serverName: srv.name, backupType,
        }).catch(() => {});

        remote.data.pipe(res);
        remote.data.on('error', (e) => {
            logger.error('[RemoteBackup] Download stream error', { error: e.message });
            if (!res.headersSent) res.status(500).end();
        });
    } catch (e) {
        logger.error('[RemoteBackup] Browser download failed', { error: e.message });
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// ── Save schedule for a server ────────────────────────────────────────────────
router.post('/:id/schedule', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    if (!config.scheduledBackupSupported)
        return res.status(403).json({ error: 'Not supported on this deployment type.' });
    try {
        await db.updateRemoteBackupSchedule(Number(req.params.id), req.body);
        await remoteBackupService.restartServerSchedule(Number(req.params.id));
        const srv   = await db.getRemoteBackupServer(Number(req.params.id));
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System',
            req.body.enabled ? 'Remote Backup Schedule Set' : 'Remote Backup Schedule Disabled',
            { serverId: req.params.id, serverName: srv?.name, scheduleType: req.body.scheduleType }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Backup history for a server ───────────────────────────────────────────────
router.get('/:id/history', hasRole('superadmin'), async (req, res) => {
    try {
        res.json(await db.getRemoteBackupHistory(Number(req.params.id), 20));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id/history', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        await db.clearRemoteBackupHistory(Number(req.params.id));
        const srv   = await db.getRemoteBackupServer(Number(req.params.id));
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'System', 'Remote Backup History Cleared', { serverId: req.params.id, serverName: srv?.name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
