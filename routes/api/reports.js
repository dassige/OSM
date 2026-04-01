
const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer-core");

const reportService = require("../../services/report-service");
const { getActiveProxy } = require("../../services/proxy-manager");

router.get("/data/:type", async (req, res) => {
  try {
    const type = req.params.type;
    const proxyUrl = getActiveProxy(); // Dynamically get the current proxy
    const userId = req.session.user.id;

    // Extract parameter if present
    const days = req.query.days ? parseInt(req.query.days) : undefined;

    if (type === "by-member")
      res.json(await reportService.getGroupedByMember(userId, proxyUrl, days));
    else if (type === "by-skill")
      res.json(await reportService.getGroupedBySkill(userId, proxyUrl, days));
    else if (type === "planned-sessions")
      res.json(await reportService.getPlannedSessions(userId, proxyUrl));
    else if (type === "critical-overdue")
      res.json(await reportService.getCriticalOverdue(userId, proxyUrl, days));
    else if (type === "compliance-matrix")
      res.json(await reportService.getComplianceMatrix(userId, proxyUrl, days));
    else if (type === "verification-history")
      res.json(await reportService.getVerificationHistory(days));
    else if (type === "training-attendance")
      res.json(await reportService.getTrainingAttendance(userId, proxyUrl));
    else 
      res.status(400).json({ error: "Unknown report type" });
  } catch (e) {
    console.error("Report Error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/pdf", async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    // Set the content from the request body
    await page.setContent(req.body.html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      title: req.body.title,
      margin: { top: "10mm", bottom: "10mm" },
    });

    await browser.close();

    res.contentType("application/pdf");
    res.send(pdf);
  } catch (e) {
    console.error("[PDF Export Error]", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;