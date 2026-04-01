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
    res.json({
      id: await db.addTrainingSession(req.body.date, req.body.skillName),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    await db.deleteTrainingSession(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;