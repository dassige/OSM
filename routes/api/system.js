// routes/api/system.js
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const fs       = require("fs");
const path     = require("path");
const archiver = require("archiver");
const unzipper = require("unzipper");
const axios    = require("axios");

const db = require("../../services/db");
const config = require("../../config");
const kbStorage = require("../../services/knowledgebase-storage");
const aiService = require("../../services/ai-service");
const whatsappService = require("../../services/whatsapp-service");
const { hasRole } = require("../../middleware/auth");
const { generateCsrfToken } = require("../../middleware/csrf");
const { backupLimiter, restoreLimiter, aiTestLimiter } = require("../../middleware/rate-limiter");
const { version } = require("../../package.json");
const logger = require("../../services/logger");

const upload = multer({ dest: "uploads/", limits: { fileSize: 500 * 1024 * 1024 } });



router.get("/csrf-token", (req, res) => {
  res.json({ token: generateCsrfToken(req) });
});

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

router.get("/preferences", hasRole("admin"), async (req, res) => {
  res.json(await db.getPreferences());
});

router.post("/preferences", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  await db.savePreference(req.body.key, req.body.value);
  res.json({ success: true });
});

router.get("/user-preferences", async (req, res) => {
  res.json(await db.getAllUserPreferences(req.session?.user?.id ?? 0));
});

router.get("/user-preferences/:key", async (req, res) => {
  res.json({
    value: await db.getUserPreference(req.session?.user?.id ?? 0, req.params.key),
  });
});

router.post("/user-preferences", async (req, res) => {
  await db.saveUserPreference(
    req.session?.user?.id ?? 0,
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
    logger.error('[Events] Export failed', { error: e.message, stack: e.stack });
    res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

router.delete("/events/all", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  await db.purgeEventLog();
  const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  await db.logEvent(actor, "System", "Event Log Purged", {
    action: "Full Wipe",
    reason: "Administrative reset",
  });
  res.json({ success: true });
});

router.post("/events/prune", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  await db.pruneEventLog(parseInt(req.body.days) || 90);
  const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  await db.logEvent(actor, "System", "Event Log Pruned", {
    olderThanDays: parseInt(req.body.days) || 90,
    action: "Partial Deletion",
  });
  res.json({ success: true });
});

// Categories reserved for server-side code only — clients cannot forge entries in these
const RESTRICTED_LOG_CATEGORIES = new Set(['Security', 'System', 'User Mgmt', 'API Keys', 'WhatsApp']);

router.post("/logs", async (req, res) => {
  if (RESTRICTED_LOG_CATEGORIES.has(req.body.type)) {
    return res.status(403).json({ error: 'Log category is restricted to server-side operations.' });
  }
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

router.post("/system/ai-test", hasRole("superadmin"), aiTestLimiter, async (req, res) => {
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
    logger.error('[AI Test] Evaluation failed', { error: e.message, stack: e.stack });
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Backup ────────────────────────────────────────────────────────────────────
// ?type=db   (default) → SQL dump only
// ?type=full           → ZIP: manifest.json + database.sql + storage/knowledgebase/*
router.get("/system/backup", hasRole("superadmin"), backupLimiter, async (req, res) => {
  const actor     = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  const backupType = req.query.type === 'full' ? 'full' : 'db';
  const stamp      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  try {
    if (backupType === 'db') {
      // ── DB-only: SQL dump ──────────────────────────────────────────────
      const dump     = await db.generateSqlDump();
      const filename = `opready-db-backup-${stamp}.sql`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(dump);
      await db.logEvent(actor, "System", "SQL Dump Exported", { filename, type: 'db' });

    } else {
      // ── Full backup: ZIP with DB + local KB storage ────────────────────
      const kbType  = config.kbStorage?.type || 'local';
      const kbPath  = config.kbStorage?.localPath;
      const filename = `opready-full-backup-${stamp}.zip`;

      const dump = await db.generateSqlDump();

      // Collect KB file count and (for cloud storage) all doc records
      let kbFileCount = 0;
      let kbDocs      = [];
      if (kbType === 'local' && kbPath && fs.existsSync(kbPath)) {
        kbFileCount = fs.readdirSync(kbPath).filter(f =>
          fs.statSync(path.join(kbPath, f)).isFile()
        ).length;
      } else if (kbType === 's3' || kbType === 'gcs') {
        kbDocs      = await db.getKbDocuments();
        kbFileCount = kbDocs.length;
      }

      const manifest = {
        appVersion:  version,
        date:        new Date().toISOString(),
        backupType:  'full',
        storageType: kbType,
        kbFileCount,
      };

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/zip");

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', err => { logger.error('[Backup] ZIP error', { error: err.message }); });
      archive.pipe(res);

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.append(dump, { name: 'database.sql' });

      if (kbType === 'local' && kbPath && fs.existsSync(kbPath)) {
        archive.directory(kbPath, 'storage/knowledgebase');
      } else if (kbType === 's3' || kbType === 'gcs') {
        for (const doc of kbDocs) {
          try {
            const stream = await kbStorage.getFileStream(doc.storage_type, doc.storage_path);
            const chunks = [];
            for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            archive.append(Buffer.concat(chunks), { name: `storage/knowledgebase/${path.basename(doc.storage_path)}` });
          } catch (e) {
            logger.warn('[Backup] Skipped KB file from cloud storage', { storagePath: doc.storage_path, error: e.message });
          }
        }
      }

      await archive.finalize();
      await db.logEvent(actor, "System", "Full Backup Exported", { filename, kbFileCount, storageType: kbType });
    }
  } catch (e) {
    logger.error('[Backup] Failed', { error: e.message });
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Restore ───────────────────────────────────────────────────────────────────
// Accepts: .sql (DB-only restore) or .zip (full restore — DB + KB files)
router.post("/system/restore", hasRole("superadmin"), restoreLimiter, upload.single("databaseFile"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  if (!req.file)                return res.status(400).json({ error: "No file uploaded." });

  const actor    = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
  const ext      = path.extname(req.file.originalname).toLowerCase();
  const isZip    = ext === '.zip' || req.file.mimetype === 'application/zip';

  try {
    if (!isZip) {
      // ── SQL-only restore (existing behaviour) ──────────────────────────
      if (ext !== '.sql') throw new Error('Unsupported file type. Upload a .sql or .zip backup file.');
      const sqlContent = fs.readFileSync(req.file.path, 'utf8');
      await db.restoreFromSqlDump(sqlContent);
      await db.logEvent(actor, "System", "Database Restored via SQL", { sourceFile: req.file.originalname });
      req.session?.destroy?.(() => {});
      return res.json({ message: "Database reconstructed successfully. Please log in again." });
    }

    // ── Full ZIP restore ───────────────────────────────────────────────
    const directory  = await unzipper.Open.file(req.file.path);
    const manifestEntry = directory.files.find(f => f.path === 'manifest.json');
    const sqlEntry      = directory.files.find(f => f.path === 'database.sql');

    if (!sqlEntry) throw new Error('Invalid backup file: database.sql not found in ZIP.');

    // Parse manifest (optional — older zips may not have it)
    let manifest = {};
    if (manifestEntry) {
      try { manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8')); }
      catch { /* ignore malformed manifest */ }
    }

    // Restore database
    const sqlContent = (await sqlEntry.buffer()).toString('utf8');
    await db.restoreFromSqlDump(sqlContent);

    // Restore local KB files (only when our storage is also local)
    const kbType  = config.kbStorage?.type || 'local';
    const kbPath  = config.kbStorage?.localPath;
    let   kbRestored = 0;

    if (kbType === 'local' && kbPath) {
      fs.mkdirSync(kbPath, { recursive: true });
      const kbFiles = directory.files.filter(f =>
        f.path.startsWith('storage/knowledgebase/') && f.type === 'File'
      );
      for (const entry of kbFiles) {
        const dest = path.join(kbPath, path.basename(entry.path));
        await new Promise((resolve, reject) => {
          entry.stream()
            .pipe(fs.createWriteStream(dest))
            .on('finish', resolve)
            .on('error', reject);
        });
        kbRestored++;
      }
    }

    await db.logEvent(actor, "System", "Full Backup Restored", {
      sourceFile:     req.file.originalname,
      backupVersion:  manifest.appVersion,
      backupDate:     manifest.date,
      kbFilesRestored: kbRestored,
    });

    req.session?.destroy?.(() => {});

    const kbNote = kbType !== 'local' && (manifest.kbFileCount > 0)
      ? ` Knowledge Base documents were not restored (cloud storage — manage via your provider).`
      : kbRestored > 0
        ? ` ${kbRestored} Knowledge Base document${kbRestored !== 1 ? 's' : ''} restored.`
        : '';

    res.json({ message: `Database reconstructed successfully.${kbNote} Please log in again.` });

  } catch (e) {
    logger.error('[Restore] Failed', { error: e.message });
    res.status(500).json({ error: e.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

// ── Directory Browser (for backup location picker) ───────────────────────────
router.get("/system/browse-directory", hasRole("superadmin"), (req, res) => {
  const requested = req.query.path || path.sep;
  try {
    // realpathSync resolves symlinks so callers cannot traverse into symlink targets
    const resolved = fs.realpathSync(path.resolve(requested));
    const entries  = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => { try { return e.isDirectory(); } catch { return false; } })
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const parent = path.dirname(resolved);
    res.json({
      path:    resolved,
      parent:  resolved !== parent ? parent : null,
      entries: dirs,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/demo-credentials", (req, res) => {
  if (config.appMode !== "demo")
    return res.status(403).json({ error: "Not in demo mode" });
  res.json({ username: config.auth.username, password: config.auth.password });
});

// ── Scheduled Backup ──────────────────────────────────────────────────────────

router.get("/system/scheduled-backup", hasRole("superadmin"), async (req, res) => {
  try {
    const schedConfig = await db.getScheduledBackupConfig();
    const history     = await db.getScheduledBackupHistory(20);
    res.json({ config: schedConfig, history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/system/scheduled-backup", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  if (!config.scheduledBackupSupported) return res.status(403).json({ error: 'Scheduled backups are not supported on this deployment type.' });
  try {
    await db.saveScheduledBackupConfig(req.body);
    const scheduledBackupService = require('../../services/scheduled-backup-service');
    await scheduledBackupService.restart();
    if (req.body.enabled) {
      const nextRunAt = scheduledBackupService.computeNextRun({
        schedule_type:  req.body.scheduleType,
        schedule_time:  req.body.scheduleTime,
        schedule_days:  req.body.scheduleDays,
        interval_value: req.body.intervalValue,
      });
      await db.updateScheduledBackupNextRun(nextRunAt);
    }
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'System',
      req.body.enabled ? 'Scheduled Backup Configured' : 'Scheduled Backup Disabled',
      {
        enabled:        !!req.body.enabled,
        scheduleType:   req.body.scheduleType,
        backupType:     req.body.backupType,
        retentionType:  req.body.retentionType,
        retentionValue: req.body.retentionValue,
      }
    );
    res.json({ success: true });
  } catch (e) {
    logger.error('[ScheduledBackup] Save config failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.post("/system/scheduled-backup/run-now", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  if (!config.scheduledBackupSupported) return res.status(403).json({ error: 'Not supported on this deployment type.' });
  try {
    const scheduledBackupService = require('../../services/scheduled-backup-service');
    await scheduledBackupService.executeScheduledBackup();
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'System', 'Scheduled Backup Run Manually', {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/system/scheduled-backup/history", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.clearScheduledBackupHistory();
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'System', 'Scheduled Backup History Cleared', {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;