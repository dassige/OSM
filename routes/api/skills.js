
const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const { getOIData } = require('../../services/scraper');
const { getActiveProxy } = require('../../services/proxy-manager');
const config = require('../../config');
const { hasRole } = require('../../middleware/auth');

router.get('/', hasRole('admin'), async (req, res) => {
  res.json(await db.getSkills());
});

router.put('/:id', hasRole('admin'), async (req, res) => {
  await db.updateSkill(req.params.id, req.body);
  res.json({ success: true });
});

router.post('/', hasRole('admin'), async (req, res) => {
  res.json({ id: await db.addSkill(req.body) });
});

router.delete('/:id', hasRole('admin'), async (req, res) => {
  await db.deleteSkill(req.params.id);
  res.json({ success: true });
});

router.post('/bulk-delete', hasRole('admin'), async (req, res) => {
  await db.bulkDeleteSkills(req.body.ids);
  res.json({ success: true });
});

router.get('/discover', hasRole('admin'), async (req, res) => {
  try {
    const currentProxy = getActiveProxy();
    const rawData = await getOIData(config.url, 0, currentProxy);
    const existing = await db.getSkills();
    const existingNames = new Set(existing.map((s) => s.name));
    const newSkills = [...new Set(rawData.map((r) => r.skill))].filter(
      (n) => !existingNames.has(n),
    );
    res.json(newSkills.sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', hasRole('admin'), async (req, res) => {
  await db.bulkAddSkills(req.body);
  res.json({ success: true });
});

module.exports = router;