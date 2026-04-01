
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const { getOIData } = require("../../services/scraper");
const { getActiveProxy } = require("../../services/proxy-manager");
const config = require("../../config");
const { hasRole } = require("../../middleware/auth");

router.get("/", hasRole("admin"), async (req, res) => {
  res.json(await db.getMembers());
});

router.put("/:id", hasRole("admin"), async (req, res) => {
  await db.updateMember(req.params.id, req.body);
  res.json({ success: true });
});

router.post("/", hasRole("admin"), async (req, res) => {
  res.json({ id: await db.addMember(req.body) });
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  await db.deleteMember(req.params.id);
  res.json({ success: true });
});

router.post("/bulk-delete", hasRole("admin"), async (req, res) => {
  await db.bulkDeleteMembers(req.body.ids);
  res.json({ success: true });
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
  await db.bulkAddMembers(req.body);
  res.json({ success: true });
});

module.exports = router;