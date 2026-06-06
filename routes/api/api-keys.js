// routes/api/api-keys.js
const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const config = require('../../config');
const { hasRole } = require('../../middleware/auth');

router.get('/', hasRole('admin'), async (req, res) => {
    res.json(await db.listApiKeys());
});

router.post('/', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    const { name, role } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!['superadmin', 'admin', 'simple', 'guest'].includes(role)) return res.status(400).json({ error: 'Role must be one of: superadmin, admin, simple, guest.' });

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    const { raw, prefix } = await db.createApiKey(name.trim(), role, actor);

    await db.logEvent(actor, 'API Keys', 'API Key Created', { name: name.trim(), prefix, role });
    res.json({ success: true, key: raw, prefix });
});

router.patch('/:id/toggle', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const key = await db.getApiKeyById(Number(req.params.id));
        await db.toggleApiKey(Number(req.params.id));
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'API Keys', 'API Key Toggled', {
            keyId: req.params.id,
            keyName: key?.name,
            keyPrefix: key?.key_prefix,
            newState: key?.active ? 'disabled' : 'enabled',
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── API Call Log — must be declared before /:id to avoid misrouting ───────────

router.get('/call-log', hasRole('admin'), async (req, res) => {
    try {
        const page     = Math.max(1, parseInt(req.query.page)  || 1);
        const limit    = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
        const keyId    = req.query.keyId    ? Number(req.query.keyId) : undefined;
        const method   = req.query.method   || undefined;
        const endpoint = req.query.endpoint || undefined;
        const startDate = req.query.startDate || undefined;
        const endDate   = req.query.endDate   || undefined;
        const sort      = req.query.sort    || 'logged_at';
        const sortDir   = req.query.sortDir || 'desc';

        const result = await db.listApiCallLog({ page, limit, keyId, method, endpoint, startDate, endDate, sort, sortDir });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/call-log/export', hasRole('admin'), async (req, res) => {
    try {
        const keyId     = req.query.keyId    ? Number(req.query.keyId) : undefined;
        const method    = req.query.method   || undefined;
        const endpoint  = req.query.endpoint || undefined;
        const startDate = req.query.startDate || undefined;
        const endDate   = req.query.endDate   || undefined;
        const sort      = req.query.sort    || 'logged_at';
        const sortDir   = req.query.sortDir || 'desc';

        const records = await db.exportApiCallLog({ keyId, method, endpoint, startDate, endDate, sort, sortDir });
        const today = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="api-call-log-${today}.json"`);
        res.json({ exportedAt: new Date().toISOString(), count: records.length, records });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/call-log', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const days = Math.max(1, parseInt(req.query.days) || 30);
        const deleted = await db.purgeApiCallLog(days);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'API Keys', 'API Call Log Purged', { olderThanDays: days, deletedCount: deleted });
        res.json({ success: true, deletedCount: deleted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const key = await db.getApiKeyById(Number(req.params.id));
        await db.deleteApiKey(Number(req.params.id));
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'API Keys', 'API Key Deleted', {
            keyId: req.params.id,
            keyName: key?.name,
            keyPrefix: key?.key_prefix,
            role: key?.role,
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
