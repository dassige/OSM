
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const { getOIData } = require("../../services/scraper");
const { getActiveProxy } = require("../../services/proxy-manager");
const config = require("../../config");
const { hasRole } = require("../../middleware/auth");
const { validateMember } = require("../../middleware/validation");
const logger = require("../../services/logger");

router.get("/", hasRole("admin"), async (req, res) => {
  try {
    const { limit, offset, search, sortBy, sortDir } = req.query;
    if (limit !== undefined) {
      res.json(await db.getMembersPage({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10) || 0,
        search,
        sortBy,
        sortDir,
      }));
    } else {
      res.json(await db.getMembers());
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", hasRole("admin"), validateMember, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const id = await db.addMember(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Created', {
      memberId: id,
      memberName: req.body.name,
      email: req.body.email,
      notificationPreference: req.body.notificationPreference || 'email',
    });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", hasRole("admin"), validateMember, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.updateMember(req.params.id, req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Updated', {
      memberId: req.params.id,
      memberName: req.body.name,
      email: req.body.email,
      enabled: req.body.enabled,
      notificationPreference: req.body.notificationPreference,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const member = await db.getMemberById(req.params.id);
    await db.deleteMember(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Deleted', {
      memberId: req.params.id,
      memberName: member?.name,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Delete Member Error", error);
    res.status(500).json({
      error: "Could not delete member. They may have active survey records or other dependencies.",
    });
  }
});

router.post("/bulk-delete", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.bulkDeleteMembers(req.body.ids);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Members Bulk Deleted', {
      deletedCount: req.body.ids?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/discover", hasRole("admin"), async (req, res) => {
  try {
    const currentProxy = getActiveProxy();
    const rawData = await getOIData(config.url, 0, currentProxy);
    const existing = await db.getMembers();
    const existingNames = new Set(existing.map((m) => m.name));
    const newMembers = [...new Set(rawData.map((r) => r.name))].filter(
      (n) => !existingNames.has(n),
    );
    res.json(newMembers.sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/import", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.bulkAddMembers(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Members Imported', {
      importedCount: req.body?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
