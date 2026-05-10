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

    const createdBy = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    const { raw, prefix } = await db.createApiKey(name.trim(), role, createdBy);

    await db.logEvent(createdBy, 'API Keys', 'API Key Created', { name: name.trim(), prefix, role });
    res.json({ success: true, key: raw, prefix });
});

router.patch('/:id/toggle', hasRole('admin'), async (req, res) => {
    await db.toggleApiKey(Number(req.params.id));
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'API Keys', 'API Key Toggled', { id: req.params.id });
    res.json({ success: true });
});

router.delete('/:id', hasRole('admin'), async (req, res) => {
    await db.deleteApiKey(Number(req.params.id));
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'API Keys', 'API Key Deleted', { id: req.params.id });
    res.json({ success: true });
});

module.exports = router;
