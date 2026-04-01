// routes/api/statistics.js
const express = require("express");
const router = express.Router();

const statisticsService = require("../../services/statistics-service");
const { hasRole } = require("../../middleware/auth");

router.get("/data/:key", hasRole("simple"), async (req, res) => {
  try {
    if (req.params.key === "compliance-overview") {
      const data = await statisticsService.getComplianceOverview(
        req.session.user.id
      );
      res.json(data);
    } else {
      res.status(400).json({ error: "Unknown statistic type" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;