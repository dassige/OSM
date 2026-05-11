// routes/api/api-keys.js
const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const { hasRole } = require('../../middleware/auth');

router.get('/', hasRole('admin'), async (req, res) => {
    res.json(await db.listApiKeys());
});

router.post('/', hasRole('admin'), async (req, res) => {
    const { name, role } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!['admin', 'simple'].includes(role)) return res.status(400).json({ error: 'Role must be admin or simple.' });

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    const { raw, prefix } = await db.createApiKey(name.trim(), role, actor);

    await db.logEvent(actor, 'API Keys', 'API Key Created', { name: name.trim(), prefix, role });
    res.json({ success: true, key: raw, prefix });
});

router.patch('/:id/toggle', hasRole('admin'), async (req, res) => {
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

router.delete('/:id', hasRole('admin'), async (req, res) => {
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
