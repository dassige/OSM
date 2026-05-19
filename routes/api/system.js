// routes/api/system.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");

const db = require("../../services/db");
const config = require("../../config");
const aiService = require("../../services/ai-service");
const whatsappService = require("../../services/whatsapp-service");
const { hasRole } = require("../../middleware/auth");
const { version } = require("../../package.json");

const upload = multer({ dest: "uploads/" });



router.get("/health", async (req, res) => {
  try {
    const database = await db.initDB();
    await database.get("SELECT 1");
    res.json({ status: "ok", version, uptime: Math.floor(process.uptime()), db: "ok" });
  } catch (e) {
    res.status(503).json({ status: "error", version, uptime: Math.floor(process.uptime()), db: "unreachable", error: e.message });
  }
});

router.get("/ready", async (req, res) => {
  try {
    const database = await db.initDB();
    await database.get("SELECT 1");
    const waStatus = config.enableWhatsApp ? whatsappService.getStatus() : null;
    const waReady = !config.enableWhatsApp || waStatus?.status === "ready";
    res.status(waReady ? 200 : 503).json({
      status: waReady ? "ready" : "starting",
      db: "ok",
      whatsapp: waStatus
        ? { status: waStatus.status, queueSize: waStatus.queueSize }
        : "disabled",
    });
  } catch (e) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

router.get("/preferences", async (req, res) => {
  res.json(await db.getPreferences());
});

router.post("/preferences", hasRole("admin"), async (req, res) => {
  await db.savePreference(req.body.key, req.body.value);
  res.json({ success: true });
});

router.get("/user-preferences", async (req, res) => {
  res.json(await db.getAllUserPreferences(req.session.user.id || 0));
});

router.get("/user-preferences/:key", async (req, res) => {
  res.json({
    value: await db.getUserPreference(req.session.user.id || 0, req.params.key),
  });
});

router.post("/user-preferences", async (req, res) => {
  await db.saveUserPreference(
    req.session.user.id || 0,
    req.body.key,
    req.body.value
  );
  res.json({ success: true });
});

router.get("/events", hasRole("admin"), async (req, res) => {
  res.json(await db.getEventLogs(req.query));
});

router.get("/events/meta", hasRole("admin"), async (req, res) => {
  res.json(await db.getEventLogMetadata());
});

router.get("/events/export", hasRole("admin"), async (req, res) => {
  try {
    const data = await db.getEventLogsExport(req.query);
    res.setHeader("Content-Disposition", 'attachment; filename="event_log.json"');
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(data, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

router.delete("/events/all", hasRole("superadmin"), async (req, res) => {
  await db.purgeEventLog();
  const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  await db.logEvent(actor, "System", "Event Log Purged", {
    action: "Full Wipe",
    reason: "Administrative reset",
  });
  res.json({ success: true });
});

router.post("/events/prune", hasRole("superadmin"), async (req, res) => {
  await db.pruneEventLog(parseInt(req.body.days) || 90);
  const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  await db.logEvent(actor, "System", "Event Log Pruned", {
    olderThanDays: parseInt(req.body.days) || 90,
    action: "Partial Deletion",
  });
  res.json({ success: true });
});

router.post("/logs", async (req, res) => {
  const user = req.session?.user?.name || "System";
  await db.logEvent(user, req.body.type, req.body.title, req.body.payload);
  res.json({ success: true });
});

router.get("/system/ollama-models", hasRole("superadmin"), async (req, res) => {
  const baseUrl = req.query.baseUrl || config.aiConfig.ollamaUrl;
  try {
    const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
    res.json(response.data.models || []);
  } catch (e) {
    res.status(500).json({ error: "Could not reach Ollama: " + e.message });
  }
});

router.post("/system/ai-test", hasRole("superadmin"), async (req, res) => {
  const { question, reference, answer, maxPoints, configOverride } = req.body;

  if (configOverride.provider === "gemini" && configOverride.geminiKey === "USE_SERVER_DEFAULT") {
    configOverride.geminiKey = config.aiConfig.geminiKey;
  }

  try {
    const start = Date.now();
    const evaluation = await aiService.evaluateTextAnswer(
      question,
      reference,
      answer,
      maxPoints,
      configOverride
    );
    const duration = Date.now() - start;

    res.json({
      success: true,
      ...evaluation,
      metadata: { duration: `${duration}ms` },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message, stack: e.stack });
  }
});

router.get("/system/backup", hasRole("superadmin"), async (req, res) => {
  try {
    const dump = await db.generateSqlDump();
    const filename = `fenz_backup_${new Date().toISOString().split('T')[0]}.sql`;
    
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "text/plain");
    res.send(dump);

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "System", "SQL Dump Exported", { filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/system/restore", hasRole("superadmin"), upload.single("databaseFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  
  try {
    const sqlContent = fs.readFileSync(req.file.path, "utf8");
    await db.restoreFromSqlDump(sqlContent);
    
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "System", "Database Restored via SQL", {
      sourceFile: req.file.originalname
    });
    
    res.json({ message: "Database reconstructed successfully from SQL script." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

router.get("/demo-credentials", (req, res) => {
  if (config.appMode !== "demo")
    return res.status(403).json({ error: "Not in demo mode" });
  res.json({ username: config.auth.username, password: config.auth.password });
});

module.exports = router;