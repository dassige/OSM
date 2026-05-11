// routes/api/training.js
const express = require("express");
const router = express.Router();

const db = require("../../services/db");
const { hasRole } = require("../../middleware/auth");

router.get("/", async (req, res) => {
  try {
    if (req.query.view === "future") {
      res.json(await db.getAllFutureTrainingSessions());
    } else {
      res.json(await db.getTrainingSessions(req.query.start, req.query.end));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", hasRole("admin"), async (req, res) => {
  try {
    const id = await db.addTrainingSession(req.body.date, req.body.skillName);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Training', 'Training Session Created', {
      sessionId: id,
      date: req.body.date,
      skillName: req.body.skillName,
    });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    const session = await db.getTrainingSessionById(req.params.id);
    await db.deleteTrainingSession(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Training', 'Training Session Deleted', {
      sessionId: req.params.id,
      date: session?.date,
      skillName: session?.skill_name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
