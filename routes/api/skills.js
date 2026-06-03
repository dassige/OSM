
const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const extractionEngine = require('../../services/extraction-engine');
const { getActiveProxy } = require('../../services/proxy-manager');
const config = require('../../config');
const { hasRole } = require('../../middleware/auth');
const { validateSkill } = require('../../middleware/validation');
const logger = require('../../services/logger');

// Returns true when SQLite throws a FOREIGN KEY constraint violation
function isForeignKeyError(err) {
  return err && err.message && err.message.toLowerCase().includes('foreign key');
}

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
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
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
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
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
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
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
    logger.error('Delete Skill Error', e);
    if (isForeignKeyError(e)) {
      return res.status(409).json({
        error: 'Cannot delete this skill — it is linked to existing live form records. Delete those forms first, or disable the skill instead.',
      });
    }
    res.status(500).json({ error: 'Could not delete skill.' });
  }
});

router.post('/bulk-delete', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.bulkDeleteSkills(req.body.ids);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skills Bulk Deleted', {
      deletedCount: req.body.ids?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    logger.error('Bulk Delete Skills Error', e);
    if (isForeignKeyError(e)) {
      return res.status(409).json({
        error: 'One or more skills could not be deleted — they are linked to existing live form records. Delete those forms first, or disable the skills instead.',
      });
    }
    res.status(500).json({ error: 'Could not delete skills.' });
  }
});

router.get('/discover', hasRole('admin'), async (req, res) => {
  try {
    const rawData = await extractionEngine.extractData({ forceRefresh: true, proxyUrl: getActiveProxy() });
    const existing = await db.getSkills();

    // Build lookup maps — prefer skill_osm_id match, fall back to name
    const byOsmId = new Map(existing.filter((s) => s.skill_osm_id).map((s) => [s.skill_osm_id, s]));
    const byName  = new Map(existing.map((s) => [s.name, s]));

    // Deduplicate extracted records by skillOsmId (one entry per unique skill)
    const seen = new Set();
    const uniqueExtracted = [];
    for (const r of rawData) {
      if (typeof r.skill !== 'string' || !r.skill.trim()) continue;
      if (seen.has(r.skillOsmId)) continue;
      seen.add(r.skillOsmId);
      uniqueExtracted.push(r);
    }

    const newSkills     = [];
    const changedSkills = [];

    for (const r of uniqueExtracted) {
      const dbRow = byOsmId.get(r.skillOsmId) || byName.get(r.skill);

      if (!dbRow) {
        newSkills.push({ skill: r.skill, skillOsmId: r.skillOsmId, skillCategory: r.skillCategory || null });
      } else {
        const categoryChanged = (r.skillCategory || null) !== (dbRow.skill_category || null);
        const osmIdChanged    = r.skillOsmId !== (dbRow.skill_osm_id || null);
        if (categoryChanged || osmIdChanged) {
          changedSkills.push({
            dbId: dbRow.id, skill: r.skill,
            skillOsmId: r.skillOsmId, skillCategory: r.skillCategory || null,
            currentSkillCategory: dbRow.skill_category || null,
          });
        }
      }
    }

    res.json({ new: newSkills, changed: changedSkills });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sync', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const { add = [], update = [] } = req.body;
    if (add.length > 0) await db.bulkAddSkillsWithEtl(add);
    for (const s of update) {
      await db.updateSkillEtlFields(s.dbId, { skillOsmId: s.skillOsmId, skillCategory: s.skillCategory });
    }
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Skill', 'Skills Synced from OSM', { addedCount: add.length, updatedCount: update.length });
    logger.info('[Skills] OSM sync complete', { added: add.length, updated: update.length, actor });
    res.json({ success: true, added: add.length, updated: update.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
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
