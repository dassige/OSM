
const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const { getOIData } = require('../../services/scraper');
const { getActiveProxy } = require('../../services/proxy-manager');
const config = require('../../config');
const { hasRole } = require('../../middleware/auth');
const { validateSkill } = require('../../middleware/validation');
const logger = require('../../services/logger');

router.get('/', hasRole('admin'), async (req, res) => {
  try {
    const { limit, offset, search, sortBy, sortDir } = req.query;
    if (limit !== undefined) {
      res.json(await db.getSkillsPage({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10) || 0,
        search,
        sortBy,
        sortDir,
      }));
    } else {
      res.json(await db.getSkills());
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', hasRole('admin'), validateSkill, async (req, res) => {
  try {
    const id = await db.addSkill(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skill Created', {
      skillId: id,
      skillName: req.body.name,
      critical: !!req.body.critical_skill,
      urlType: req.body.url_type || 'external',
    });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', hasRole('admin'), validateSkill, async (req, res) => {
  try {
    await db.updateSkill(req.params.id, req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skill Updated', {
      skillId: req.params.id,
      skillName: req.body.name,
      enabled: req.body.enabled,
      critical: !!req.body.critical_skill,
      urlType: req.body.url_type,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', hasRole('admin'), async (req, res) => {
  try {
    const skill = await db.getSkillById(req.params.id);
    await db.deleteSkill(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skill Deleted', {
      skillId: req.params.id,
      skillName: skill?.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bulk-delete', hasRole('admin'), async (req, res) => {
  try {
    await db.bulkDeleteSkills(req.body.ids);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skills Bulk Deleted', {
      deletedCount: req.body.ids?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  try {
    await db.bulkAddSkills(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skills Imported', {
      importedCount: req.body?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
