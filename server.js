const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const config = require("./config.js");
const db = require("./services/db");
const extractionEngine = require("./services/extraction-engine");
const { formatMemberName } = require("./services/rank-config");
const { processMemberSkills } = require("./services/member-manager");
const whatsappService = require("./services/whatsapp-service");
const formsService = require("./services/forms-service");
const { sendNotification } = require("./services/mailer");
const { findWorkingNZProxy, setActiveProxy, getActiveProxy } = require("./services/proxy-manager");
const { globalAuthGuard } = require("./middleware/auth");
const { runValidation } = require("./services/env-validator");
const scheduledBackupService = require("./services/scheduled-backup-service");
const remoteBackupService   = require("./services/remote-backup-service");
const { ROLES } = require("./middleware/auth");
const { apiLimiter } = require("./middleware/rate-limiter");
const { csrfProtection } = require("./middleware/csrf");
const logger = require("./services/logger");
const helmet = require("helmet");
const correlationId = require("./middleware/correlation-id");

const memberRoutes = require("./routes/api/members");
const skillRoutes = require("./routes/api/skills");
const formRoutes = require("./routes/api/forms");
const liveFormRoutes = require("./routes/api/live-forms");
const surveyRoutes = require("./routes/api/surveys");
const liveSurveyRoutes = require("./routes/api/live-surveys");
const reportRoutes = require("./routes/api/reports");
const userRoutes = require("./routes/api/users");
const profileRoutes = require("./routes/api/profile");
const systemRoutes = require("./routes/api/system");
const trainingRoutes = require("./routes/api/training");
const statisticsRoutes = require("./routes/api/statistics");
const docsRoutes = require("./routes/api/docs");
const apiKeyRoutes = require("./routes/api/api-keys");
const kbRoutes            = require("./routes/api/knowledgebase");
const remoteBackupRoutes  = require("./routes/api/remote-backup");
const authRoutes = require("./routes/auth");
const viewRoutes = require("./routes/views");

const app = express();
const server = http.createServer(app);
// Trust first proxy hop so rate limiting reads the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// Security headers — CSP and COEP disabled: extensive inline scripts in static HTML pages
// and PWA icon loading require a dedicated CSP audit before enabling.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(correlationId);

// Service worker must be served with no-cache and the correct SW-Allowed scope
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Web app manifest — built dynamically so app name reflects UI_LOGIN_TITLE config
app.get('/manifest.json', (req, res) => {
  const appName = config.ui?.loginTitle || 'OpReady';
  const manifest = {
    name: appName,
    short_name: appName,
    description: `${appName} — Operational Readiness Manager`,
    start_url: '/',
    display: 'standalone',
    background_color: '#17A2B8',
    theme_color: '#17A2B8',
    orientation: 'any',
    scope: '/',
    lang: 'en-NZ',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-72.png',          sizes: '72x72',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-96.png',          sizes: '96x96',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-128.png',         sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-144.png',         sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-152.png',         sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png',         sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-384.png',         sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png',         sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png',sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard',   url: '/',                 icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
      { name: 'Live Forms',  url: '/live-forms.html',  icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
      { name: 'Members',     url: '/members.html',     icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
    ],
  };
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(manifest);
});

app.use(express.static("public"));

const io = new Server(server, {
  // Same-origin deployment: origin: false. Set CORS_ORIGIN env var only when the
  // frontend is served from a separate domain (rare for this self-hosted app).
  cors: config.corsOrigin
    ? { origin: config.corsOrigin, methods: ["GET", "POST"], credentials: true }
    : { origin: false },
});


const sessionMiddleware = session({
  secret: config.auth?.sessionSecret || "demo-only-insecure-fallback",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: config.cookieSecure,
  },
  store: new SQLiteStore({
    db: "sessions.db",
    dir: path.dirname(db.getDbPath()),
  }),
});

app.use(sessionMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Guard must be registered before route mounts
app.use(globalAuthGuard);
app.use(csrfProtection);
app.use('/api', apiLimiter);

async function initializeProxy() {
  let proxyToUse = null;
  if (config.proxyMode === "fixed") proxyToUse = config.fixedProxyUrl;
  else if (config.proxyMode === "dynamic")
    proxyToUse = await findWorkingNZProxy(logger.info.bind(logger));
  
  setActiveProxy(proxyToUse); 

  await db.logEvent("System", "System", "Proxy Initialized", {
    mode: config.proxyMode,
    endpoint: proxyToUse ? "Configured" : "None/Direct",
  });
}

app.use("/", authRoutes);
app.use("/", viewRoutes); 

app.use("/api/members", memberRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/live-forms", liveFormRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/live-surveys", liveSurveyRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", systemRoutes);
app.use("/api/training-sessions", trainingRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/docs", docsRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/knowledgebase", kbRoutes);
app.use("/api/system/remote-backup", remoteBackupRoutes);



const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use((socket, next) => {
  if (socket.request.session && socket.request.session.loggedIn) next();
  else next(new Error("unauthorized"));
});

io.on("connection", (socket) => {
  const logger = (msg) => {
    process.stdout.write(msg + "\n");
    socket.emit("terminal-output", msg + "\n");
  };
  const userRole = socket.request.session.user?.role || "guest";
  const userLevel = ROLES[userRole] || 0;

  socket.on("get-preferences", async () => {
    try {
      socket.emit("preferences-data", await db.getAllUserPreferences(socket.request.session.user.id || 0));
    } catch (e) { logger.error("[Socket] get-preferences", e); }
  });

  socket.on("update-preference", async ({ key, value }) => {
    if (userLevel < ROLES.simple) return logger("Unauthorized: Guest cannot save preferences.");
    try {
      await db.saveUserPreference(socket.request.session.user.id || 0, key, value);
    } catch (e) { logger.error("[Socket] update-preference", e); }
  });

  socket.on("wa-get-status", () => {
    try {
      if (userLevel >= ROLES.simple) socket.emit("wa-status-data", whatsappService.getStatus());
    } catch (e) { logger.error("[Socket] wa-get-status", e); }
  });

  socket.on("wa-control", (action) => {
    if (userLevel < ROLES.admin) return;
    try {
      if (action === "start") whatsappService.startClient();
      if (action === "stop") whatsappService.logout();
    } catch (e) { logger.error("[Socket] wa-control", e); }
  });

  socket.on("wa-send-test", async (data) => {
    if (userLevel < ROLES.admin) return;
    const currentUser = socket.request.session.user.name || socket.request.session.user;
    try {
      logger(`[WhatsApp] Sending test message to ${data.mobile}...`);
      await whatsappService.sendMessage(data.mobile, data.message);
      await db.logEvent(currentUser, "WhatsApp", "Test Message Sent", {
        recipientMobile: data.mobile, messageLength: data.message.length, status: "Sent to Browser",
      });
      socket.emit("wa-test-result", { success: true, message: "Test message sent successfully." });
    } catch (err) {
      logger(`[WhatsApp] Test failed: ${err.message}`);
      await db.logEvent(currentUser, "WhatsApp", "Test Message Failed", { mobile: data.mobile, error: err.message });
      socket.emit("wa-test-result", { success: false, error: err.message });
    }
  });

  socket.on("view-expiring-skills", async (days, forceRefresh) => {
    const protocol = socket.handshake.headers["x-forwarded-proto"] || (socket.request.connection.encrypted ? "https" : "http");
    const host = socket.handshake.headers.host;
    const dynamicBaseUrl = `${protocol}://${host}`;
    try {
      const daysThreshold = parseInt(days) || 30;

      logger(`> Fetching View Data (Threshold: ${daysThreshold} days${forceRefresh ? ", Force Refresh" : ", Cached OK"})...`);

      const dbMembers = await db.getMembers();
      const dbSkills = await db.getSkills();
      const rawData = await extractionEngine.extractData({ forceRefresh, proxyUrl: getActiveProxy(), logFn: logger });
      const trainingMap = await getTrainingMap();
      const liveForms = await formsService.getAllActiveStatuses(config.acceptedFormVisibilityDays);
      const liveFormsMap = {};
      
      liveForms.forEach((r) => { liveFormsMap[`${r.member_id}_${r.skill_id}`] = r.form_status; });

      const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold, trainingMap, liveFormsMap, dynamicBaseUrl);

      const results = processedMembers.map((m) => ({
        id: m.id,
        name: m.name,
        rank:      m.rank       || null,
        lastName:  m.last_name  || null,
        firstName: m.first_name || null,
        email: m.email,
        mobile: m.mobile,
        notificationPreference: m.notificationPreference,
        skills: m.expiringSkills.map((s) => ({
          skillId: s.skillId,
          skill: s.skill,
          dueDate: s.dueDate,
          hasUrl: !!s.url,
          isCritical: !!s.isCritical,
          liveFormStatus: s.liveFormStatus,
        })),
        emailEligible: m.expiringSkills.length > 0,
      }));

      socket.emit("expiring-skills-data", results);
    } catch (e) {
      logger(`Error: ${e.message}`);
      socket.emit("expiring-skills-error", e.message);
    }
  });

  socket.on("run-process-queue", async (targets, days) => {
    if (userLevel < ROLES.simple) { socket.emit("terminal-output", "Error: Unauthorized.\n"); return; }
    await handleQueueProcessing(socket, targets, parseInt(days) || 30, logger);
  });
});

async function handleQueueProcessing(socket, targets, days, logger) {
  const protocol = socket.handshake.headers["x-forwarded-proto"] || (socket.request.connection.encrypted ? "https" : "http");
  const host = socket.handshake.headers.host;
  const dynamicBaseUrl = `${protocol}://${host}`;
  const isDemo = config.appMode === "demo";
  const currentUser = socket.request.session.user.name || "System";
  
  logger(`\n[DEBUG] --- Notification Process Started by ${currentUser} ---`);
  
  try {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    const rawData = await extractionEngine.extractData({ logFn: logger });
    const prefs = await db.getPreferences();
    const membersToProcess = dbMembers.filter((m) => targets.some((t) => t.name === m.name && m.enabled));
    const trainingMap = await getTrainingMap();
    const processedMembers = processMemberSkills(membersToProcess, rawData, dbSkills, days, trainingMap, {}, dynamicBaseUrl);
    
    let totalSent = 0;
    // Count of members that will actually receive a notification (have expiring skills + send flags)
    const totalToSend = processedMembers.filter((m) => {
      const t = targets.find((x) => x.name === m.name);
      return t && (t.sendEmail || t.sendWa) && m.expiringSkills && m.expiringSkills.length > 0;
    }).length;

    for (const member of processedMembers) {
      const targetInfo = targets.find((t) => t.name === member.name);
      if (!targetInfo || (!targetInfo.sendEmail && !targetInfo.sendWa)) continue;
      if (!member.expiringSkills || member.expiringSkills.length === 0) continue;

      const memberDisplayName = formatMemberName(member.rank, member.last_name, member.first_name, member.name);

      // Emit "processing" BEFORE sending so the spinner updates immediately and the user
      // sees each member's name before their notification is dispatched.
      if (socket.connected) socket.emit("progress-update", {
        type:    "progress-tick",
        current: totalSent,
        total:   totalToSend,
        member:  memberDisplayName,
        status:  "processing",
      });

      logger(`> Processing: ${member.name}`);

      for (const skill of member.expiringSkills) {
        const skillConfig = dbSkills.find((s) => s.name === skill.skill);
        if (skillConfig && skillConfig.url_type === "internal" && skillConfig.url) {
          try {
            const isSubmitted = await formsService.checkSubmittedStatus(member.id, skillConfig.id);
            if (isSubmitted) {
              skill.isSubmitted = true; 
              skill.url = null; 
              logger(`  - Skipped Live Form for "${skill.skill}" (Active record exists)`);
            } else {
              const accessCode = await formsService.ensureLiveForm(member.id, skillConfig.id, skill.dueDate, skillConfig.url);
              const separator = skill.url.includes("?") ? "&" : "?";
              skill.url = `${skill.url}${separator}code=${accessCode}`;
              logger(`  - Live Form ready for "${skill.skill}"`);
            }
          } catch (e) { logger(`  ! Error creating live form for ${skill.skill}: ${e.message}`); }
        }
      }

      if (targetInfo.sendEmail && member.email) {
        try {
          await sendNotification(member, prefs, config.transporter, isDemo, logger, config.ui.loginTitle);
          if (isDemo) logger(`  [DEMO] Email simulated for ${member.name}. Skipping SMTP transmission.`);
          else await db.logEmailAction(member, "SENT", "Email notification sent");
        } catch (e) {
          logger(`  X Email Failed: ${e.message}`);
          await db.logEmailAction(member, "FAILED", e.message);
        }
      }

      if (targetInfo.sendWa && member.mobile && config.enableWhatsApp) {
        try {
          const waTemplate = { intro: prefs.waIntro, row: prefs.waRow, rowNoUrl: prefs.waRowNoUrl, filterOnlyWithUrl: prefs.waOnlyWithUrl };
          // {{name}} renders the properly formatted name from structured fields, consistent with the UI
          let msg = (waTemplate.intro || "")
            .replace("{{name}}",    formatMemberName(member.rank, member.last_name, member.first_name, member.name))
            .replace("{{appname}}", config.ui.loginTitle);
          let hasSkills = false;

          member.expiringSkills.forEach((s) => {
            if (waTemplate.filterOnlyWithUrl && !s.url && !s.isSubmitted) return;
            hasSkills = true;
            let row = "";

            if (s.isSubmitted) {
              row = `- *${s.skill}*: Form submitted and awaiting review.`;
            } else {
              const tpl = s.url ? waTemplate.row || "- {{skill}} {{url}}" : waTemplate.rowNoUrl || "- {{skill}}";
              row = tpl.replace("{{skill}}", s.skill).replace("{{date}}", s.dueDate).replace("{{url}}", s.url || "").replace("{{critical}}", s.isCritical ? "!" : "");
            }
            msg += `\n${row}`;
          });

          if (hasSkills) {
            if (isDemo) logger(`  [DEMO] WhatsApp simulated for ${member.mobile}.`);
            else {
              await whatsappService.sendMessage(member.mobile, msg);
              logger(`  - WhatsApp sent to ${member.mobile}`);
            }
            await db.logEvent(currentUser, "WhatsApp", isDemo ? "Notification Simulated" : "Notification Sent", {
              memberName: formatMemberName(member.rank, member.last_name, member.first_name, member.name),
              mobile: member.mobile,
              skillCount: member.expiringSkills.length,
              skills: member.expiringSkills.map((s) => s.skill),
              isDemo,
            });
          }
        } catch (e) { logger(`  X WhatsApp Failed: ${e.message}`); }
      }
      totalSent++;
      // Emit "sent" AFTER the notification is dispatched so the % ticks forward correctly.
      if (socket.connected) socket.emit("progress-update", {
        type:    "progress-tick",
        current: totalSent,
        total:   totalToSend,
        member:  memberDisplayName,
        status:  "sent",
      });
    }
    logger(`\n> Finished. Processed ${totalSent} members.`);
    socket.emit("script-complete", 0);
  } catch (e) {
    logger(`CRITICAL ERROR: ${e.message}`);
    socket.emit("script-complete", 1);
  }
}

async function getTrainingMap() {
  const sessions = await db.getAllFutureTrainingSessions();
  const map = {};
  sessions.forEach((s) => {
    if (!map[s.skill_name]) map[s.skill_name] = [];
    map[s.skill_name].push(s.date);
  });
  return map;
}

async function shutdown(signal) {
  logger.info(`[System] ${signal} received — starting graceful shutdown`);
  server.close();
  io.close();
  if (config.enableWhatsApp) {
    try {
      await whatsappService.logout();
    } catch (e) {
      logger.warn('[System] WhatsApp logout error during shutdown', e);
    }
  }
  try {
    await db.closeDB();
  } catch (e) {
    logger.warn('[System] DB close error during shutdown', e);
  }
  process.exit(0);
}

if (require.main === module) {
  process.on('uncaughtException', (err) => {
    logger.error('[System] Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[System] Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });

  (async () => {
    try {
      runValidation(config);
      await db.initDB();

      whatsappService.init(io, db.logEvent);
      if (config.enableWhatsApp) {
        whatsappService.startClient();
      }

      await scheduledBackupService.init();
      await remoteBackupService.init();

      await initializeProxy();

      const PORT = process.env.PORT || config.port || 3000;
      server.listen(PORT, '0.0.0.0', () => {
        logger.info(`[System] Server listening on port ${PORT}`);
        logger.info(`App Mode: ${(config.appMode || "PRODUCTION").toUpperCase()}`);
      });

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    } catch (err) {
      logger.error("Critical Startup Error", { error: err.message, stack: err.stack });
    }
  })();
}

module.exports = app;