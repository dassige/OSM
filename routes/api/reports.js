
const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer-core");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const logger = require("../../services/logger");

const reportService = require("../../services/report-service");
const { getActiveProxy } = require("../../services/proxy-manager");
const { hasRole } = require("../../middleware/auth");

// Create a single DOMPurify instance using a jsdom window (server-side sanitizer)
const _domPurify = createDOMPurify(new JSDOM("").window);

router.get("/data/:type", hasRole("admin"), async (req, res) => {
  try {
    const type = req.params.type;
    const proxyUrl = getActiveProxy();
    const userId = (req.apiKeyUser || req.session?.user)?.id;

    // M-05: Clamp days to prevent full-history dump via large values.
    const days = req.query.days
      ? Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 3650)
      : undefined;

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
    else if (type === "survey-participation")
      res.json(await reportService.getSurveyParticipation());
    else if (type === "survey-response-log")
      res.json(await reportService.getSurveyResponseLog(days));
    else
      res.status(400).json({ error: "Unknown report type" });
  } catch (e) {
    logger.error("Report Error", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/pdf", hasRole("admin"), async (req, res) => {
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

    const safeHtml = _domPurify.sanitize(req.body.html || "", { WHOLE_DOCUMENT: true, FORCE_BODY: false });
    await page.setContent(safeHtml, { waitUntil: "networkidle0" });

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
    logger.error("[PDF Export Error]", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;