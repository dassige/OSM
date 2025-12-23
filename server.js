// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const helmet = require("helmet");

// --- Services & Config ---
const config = require("./config.js");
const db = require("./services/db");
const { findWorkingNZProxy } = require("./services/proxy-manager");
const { getOIData } = require("./services/scraper");
const { processMemberSkills } = require("./services/member-manager");
const {
  sendNotification,
  sendPasswordReset,
  sendNewAccountNotification,
  sendAccountDeletionNotification, 
  sendSecurityAlert
} = require("./services/mailer");
const whatsappService = require("./services/whatsapp-service");
const reportService = require("./services/report-service");
const formsService = require("./services/forms-service");
const statisticsService = require("./services/statistics-service");

const puppeteer = require("puppeteer-core");
const { validateForm, validateBulkData } = require("./middleware/validation");

// =============================================================================
//  INITIALIZATION & MIDDLEWARE
// =============================================================================

const app = express();
const server = http.createServer(app);
const upload = multer({ dest: "uploads/" });

// Initialize Socket.IO
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
});

const sessionMiddleware = session({
  secret: config.auth?.sessionSecret || "fallback_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
});

app.use(sessionMiddleware);
app.use(express.json());

// Apply Helmet with customized CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'", // Required for legacy inline page logic
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https://storage.googleapis.com"],
        "connect-src": ["'self'", "ws://localhost:3000", "http://localhost:3000"],
        "upgrade-insecure-requests": null, // [FIX] Stops auto-redirect to HTTPS
      },
    },
    hsts: false, // [FIX] Disables HSTS for local development
    nosniff: true, // [SECURITY] Prevents MIME type sniffing
  })
);
// Initialize DB & Proxy
db.initDB().catch((err) => console.error("DB Init Error:", err));

whatsappService.init(io, db.logEvent);
if (config.enableWhatsApp) {
  whatsappService.startClient();
}

let currentProxy = null;
async function initializeProxy() {
  if (config.proxyMode === "fixed") currentProxy = config.fixedProxyUrl;
  else if (config.proxyMode === "dynamic")
    currentProxy = await findWorkingNZProxy(console.log);
  else currentProxy = null;
}
initializeProxy();

// --- GLOBAL ROUTE GUARD ---
app.use((req, res, next) => {
  const publicPaths = [
    "/login.html",
    "/login", // [FIX] Allow the POST /login endpoint
    "/forgot-password",
    "/styles.css",
    "/ui-config",
    "/api/demo-credentials",
    "/forms-view.html",
    "/theme.js", // [FIX] Allow security-related frontend scripts
    "/help.js", // [FIX] Allow help script
    "/toast.js", // [FIX] Allow notification script
    "/public/js/toast.js",
    "/public/theme.js",
  ];

  // If the path is public, let it through
  if (
    publicPaths.includes(req.path) ||
    req.path.startsWith("/socket.io/") ||
    req.path.startsWith("/resources/") ||
    req.path.startsWith("/demo/") ||
    req.path.startsWith("/api/live-forms/access/") ||
    req.path.startsWith("/api/live-forms/submit/")
  ) {
    return next();
  }

  // Check if session exists
  if (req.session && req.session.loggedIn) return next();

  // Deny API requests with 401, redirect others to login
  if (req.path.startsWith("/api/"))
    return res.status(401).json({ error: "Unauthorized" });

  return res.redirect("/login.html");
});
app.get("/ui-config", (req, res) =>
  res.json({ ...config.ui, appMode: config.appMode })
);

// --- PAGE ACCESS CONTROL ---
app.get("/system-tools.html", (req, res, next) => {
  if (req.session?.user?.role === "superadmin") next();
  else res.redirect("/");
});
app.get("/users.html", (req, res, next) => {
  const r = req.session?.user?.role;
  if (r === "admin" || r === "superadmin") next();
  else res.redirect("/");
});
app.get("/event-log.html", (req, res, next) => {
  const r = req.session?.user?.role;
  if (r === "admin" || r === "superadmin") next();
  else res.redirect("/");
});
app.get("/third-parties.html", (req, res, next) => {
  const r = req.session?.user?.role;
  if (r === "admin" || r === "superadmin") next();
  else res.redirect("/");
});
app.get("/templates.html", (req, res, next) => {
  const r = req.session?.user?.role;
  if (r === "admin" || r === "superadmin") next();
  else res.redirect("/");
});
app.get("/live-forms.html", (req, res, next) => {
  const r = req.session?.user?.role;
  if (r === "admin" || r === "superadmin") next();
  else res.redirect("/");
});

// =============================================================================
//  AUTH & ROLE MIDDLEWARE
// =============================================================================

const ROLES = { guest: 0, simple: 1, admin: 2, superadmin: 3 };

const hasRole = (requiredRole) => (req, res, next) => {
  const userRoleStr = req.session?.user?.role || "guest";
  const userLevel = ROLES[userRoleStr] !== undefined ? ROLES[userRoleStr] : 0;
  const requiredLevel = ROLES[requiredRole];
  if (userLevel >= requiredLevel) next();
  else
    res
      .status(403)
      .json({ error: `Forbidden: Requires ${requiredRole} access.` });
};

app.get("/statistics.html", hasRole("simple"), (req, res, next) => next());

// =============================================================================
//  API ROUTES - AUTHENTICATION
// =============================================================================

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // 1. Check Superuser Credentials (from .env) FIRST
  if (username === config.auth.username && password === config.auth.password) {
    req.session.loggedIn = true;
    req.session.user = {
      id: 0,
      name: "Super Admin",
      email: username,
      role: "superadmin",
      isAdmin: true,
      isEnvUser: true,
    };
    return res.status(200).send({ success: true });
  }

  // 2. Database User Authentication
  try {
    const userRecord = await db.getUserByEmail(username);

    if (userRecord) {
      if (userRecord.enabled === 0)
        return res
          .status(403)
          .json({ error: "Account disabled. Contact administrator." });
      if (userRecord.blocked === 1)
        return res
          .status(403)
          .json({ error: "Account blocked due to multiple failed attempts." });
    }

    const user = await db.authenticateUser(username, password);
    if (user) {
      await db.resetLoginAttempts(user.id);
      req.session.loggedIn = true;
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.role === "admin" || user.role === "superadmin",
      };
      return res.status(200).send({ success: true });
    } else if (userRecord) {
      // Wrong password: increment attempts
      const stats = await db.incrementLoginAttempts(username);
      if (stats && stats.login_attempts >= config.auth.maxLoginAttempts) {
        await db.blockUser(userRecord.id);
        // Security Alert Email
        await sendSecurityAlert(
          {
            email: username,
            attempts: stats.login_attempts,
            ip,
          },
          config.transporter,
          config.ui.loginTitle,
          config.auth.superuserEmail
        );

        return res
          .status(403)
          .json({ error: "Maximum attempts reached. Account is now blocked." });
      }
    }
  } catch (e) {
    console.error("Login Error:", e);
  }

  return res.status(401).send({ error: "Invalid credentials" });
});
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (email === config.auth.username)
    return res
      .status(400)
      .json({ error: "Cannot reset Super Admin password via email." });
  try {
    const user = await db.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found." });
    const tempPassword = crypto.randomBytes(4).toString("hex");
    await db.adminResetPassword(user.id, tempPassword);
    // Get template pref if exists
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_reset_password
      ? JSON.parse(prefs.tpl_reset_password)
      : null;
    await sendPasswordReset(
      email,
      tempPassword,
      config.transporter,
      config.ui.loginTitle,
      tpl
    );
    await db.logEvent(
      "System",
      "Security",
      `Password reset requested for ${email}`,
      {}
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

app.get("/logout", async (req, res) => {
  try {
    if (req.session && req.session.user && req.session.user.id) {
      const prefs = await db.getAllUserPreferences(req.session.user.id);
      if (prefs.wa_auto_disconnect === "true") {
        await whatsappService.logout();
      }
    }
  } catch (e) {
    console.error("Logout cleanup error:", e);
  }
  req.session.destroy();
  res.redirect("/login.html");
});

app.get("/api/user-session", (req, res) => {
  if (req.session && req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Not logged in" });
});

// =============================================================================
//  API ROUTES - USER MANAGEMENT & PROFILE
// =============================================================================

app.get("/api/users", hasRole("admin"), async (req, res) => {
  res.json(await db.getUsers());
});
app.post("/api/users", hasRole("admin"), async (req, res) => {
  try {
    const tempPassword = crypto.randomBytes(4).toString("hex");
    const id = await db.addUser(
      req.body.email,
      req.body.name,
      tempPassword,
      req.body.role
    );
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_new_user ? JSON.parse(prefs.tpl_new_user) : null;
    await sendNewAccountNotification(
      req.body.email,
      req.body.name,
      tempPassword,
      config.transporter,
      config.ui.loginTitle,
      tpl
    );
    await db.logEvent(
      req.session.user.name,
      "User Mgmt",
      `Created user: ${req.body.email}`,
      {}
    );
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.put("/api/users/:id", hasRole("admin"), async (req, res) => {
  try {
    // Destructure all five fields from the frontend payload
    const { name, email, role, enabled, blocked } = req.body;
    
    await db.updateUser(
      req.params.id,
      name,
      email,
      role,
      enabled,
      blocked
    );

    await db.logEvent(
      req.session.user.name,
      "User Mgmt",
      `Updated user status: ${email}`,
      { enabled, blocked }
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/users/:id", hasRole("admin"), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user) {
      await db.deleteUser(req.params.id);
      const prefs = await db.getPreferences();
      const tpl = prefs.tpl_delete_user
        ? JSON.parse(prefs.tpl_delete_user)
        : null;
      await sendAccountDeletionNotification(
        user.email,
        user.name,
        config.transporter,
        config.ui.loginTitle,
        tpl
      );
      await db.logEvent(
        req.session.user.name,
        "User Mgmt",
        `Deleted user: ${user.email}`,
        {}
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/users/:id/reset", hasRole("admin"), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const tempPassword = crypto.randomBytes(4).toString("hex");
    await db.adminResetPassword(req.params.id, tempPassword);
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_reset_password
      ? JSON.parse(prefs.tpl_reset_password)
      : null;
    await sendPasswordReset(
      user.email,
      tempPassword,
      config.transporter,
      config.ui.loginTitle,
      tpl
    );
    await db.logEvent(
      req.session.user.name,
      "User Mgmt",
      `Reset password for: ${user.email}`,
      {}
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put("/api/profile", async (req, res) => {
  try {
    await db.updateUserProfile(
      req.session.user.id,
      req.body.name,
      req.body.password
    );
    req.session.user.name = req.body.name;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
//  API ROUTES - MEMBERS & SKILLS
// =============================================================================

app.get("/api/members", hasRole("admin"), async (req, res) =>
  res.json(await db.getMembers())
);
app.put("/api/members/:id", hasRole("admin"), async (req, res) => {
  await db.updateMember(req.params.id, req.body);
  res.json({ success: true });
});
app.post("/api/members", hasRole("admin"), async (req, res) => {
  res.json({ id: await db.addMember(req.body) });
});
app.delete("/api/members/:id", hasRole("admin"), async (req, res) => {
  await db.deleteMember(req.params.id);
  res.json({ success: true });
});
app.post("/api/members/bulk-delete", hasRole("admin"), async (req, res) => {
  await db.bulkDeleteMembers(req.body.ids);
  res.json({ success: true });
});
app.get("/api/members/discover", hasRole("admin"), async (req, res) => {
  try {
    const rawData = await getOIData(config.url, 0, currentProxy);
    const existing = await db.getMembers();
    const existingNames = new Set(existing.map((m) => m.name));
    const newMembers = [...new Set(rawData.map((r) => r.name))].filter(
      (n) => !existingNames.has(n)
    );
    res.json(newMembers.sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/members/import", hasRole("admin"), async (req, res) => {
  await db.bulkAddMembers(req.body);
  res.json({ success: true });
});

app.get("/api/skills", hasRole("admin"), async (req, res) =>
  res.json(await db.getSkills())
);
app.put("/api/skills/:id", hasRole("admin"), async (req, res) => {
  await db.updateSkill(req.params.id, req.body);
  res.json({ success: true });
});
app.post("/api/skills", hasRole("admin"), async (req, res) => {
  res.json({ id: await db.addSkill(req.body) });
});
app.delete("/api/skills/:id", hasRole("admin"), async (req, res) => {
  await db.deleteSkill(req.params.id);
  res.json({ success: true });
});
app.post("/api/skills/bulk-delete", hasRole("admin"), async (req, res) => {
  await db.bulkDeleteSkills(req.body.ids);
  res.json({ success: true });
});
app.get("/api/skills/discover", hasRole("admin"), async (req, res) => {
  try {
    const rawData = await getOIData(config.url, 0, currentProxy);
    const existing = await db.getSkills();
    const existingNames = new Set(existing.map((s) => s.name));
    const newSkills = [...new Set(rawData.map((r) => r.skill))].filter(
      (n) => !existingNames.has(n)
    );
    res.json(newSkills.sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/skills/import", hasRole("admin"), async (req, res) => {
  await db.bulkAddSkills(req.body);
  res.json({ success: true });
});

// =============================================================================
//  API ROUTES - SYSTEM
// =============================================================================

app.get("/api/preferences", async (req, res) => {
  res.json(await db.getPreferences());
});
app.post("/api/preferences", hasRole("admin"), async (req, res) => {
  await db.savePreference(req.body.key, req.body.value);
  res.json({ success: true });
});
//
app.get("/api/user-preferences", async (req, res) => {
  res.json(await db.getAllUserPreferences(req.session.user.id || 0));
});

app.get("/api/user-preferences/:key", async (req, res) => {
  res.json({
    value: await db.getUserPreference(req.session.user.id || 0, req.params.key),
  });
});

app.post("/api/user-preferences", async (req, res) => {
  await db.saveUserPreference(
    req.session.user.id || 0,
    req.body.key,
    req.body.value
  );
  res.json({ success: true });
});

app.get("/api/events", hasRole("admin"), async (req, res) => {
  res.json(await db.getEventLogs(req.query));
});
app.get("/api/events/meta", hasRole("admin"), async (req, res) => {
  res.json(await db.getEventLogMetadata());
});
app.get("/api/events/export", hasRole("admin"), async (req, res) => {
  try {
    const data = await db.getEventLogsExport(req.query);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="event_log.json"'
    );
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(data, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});
app.delete("/api/events/all", hasRole("superadmin"), async (req, res) => {
  await db.purgeEventLog();
  res.json({ success: true });
});
app.post("/api/events/prune", hasRole("superadmin"), async (req, res) => {
  await db.pruneEventLog(parseInt(req.body.days) || 90);
  res.json({ success: true });
});
app.post("/api/logs", async (req, res) => {
  const user = req.session?.user?.name || "System";
  await db.logEvent(user, req.body.type, req.body.title, req.body.payload);
  res.json({ success: true });
});

app.get("/api/system/backup", hasRole("superadmin"), (req, res) => {
  const dbPath = db.getDbPath();
  res.download(dbPath, "fenz.db");
});
app.post(
  "/api/system/restore",
  hasRole("superadmin"),
  upload.single("databaseFile"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    try {
      await db.verifyAndReplaceDb(req.file.path);
      await db.logEvent(
        req.session.user.name,
        "System",
        "Database Restored",
        {}
      );
      res.json({ message: "Database restored successfully." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  }
);
app.get("/api/demo-credentials", (req, res) => {
  if (config.appMode !== "demo")
    return res.status(403).json({ error: "Not in demo mode" });
  res.json({ username: config.auth.username, password: config.auth.password });
});

// Training Planner API
app.get("/api/training-sessions", async (req, res) => {
  if (req.query.view === "future") {
    res.json(await db.getAllFutureTrainingSessions());
  } else {
    res.json(await db.getTrainingSessions(req.query.start, req.query.end));
  }
});
app.post("/api/training-sessions", hasRole("admin"), async (req, res) => {
  res.json({
    id: await db.addTrainingSession(req.body.date, req.body.skillName),
  });
});
app.delete("/api/training-sessions/:id", hasRole("admin"), async (req, res) => {
  await db.deleteTrainingSession(req.params.id);
  res.json({ success: true });
});

// Reporting API
app.get("/api/reports/data/:type", async (req, res) => {
  try {
    const type = req.params.type;
    const proxyUrl = currentProxy;
    if (type === "by-member")
      res.json(
        await reportService.getGroupedByMember(req.session.user.id, proxyUrl)
      );
    else if (type === "by-skill")
      res.json(
        await reportService.getGroupedBySkill(req.session.user.id, proxyUrl)
      );
    else if (type === "planned-sessions")
      res.json(
        await reportService.getPlannedSessions(req.session.user.id, proxyUrl)
      );
    else res.status(400).json({ error: "Unknown report type" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/reports/pdf", async (req, res) => {
  try {
    // [FIXED] Added executablePath to find Chromium in Alpine/Linux environments
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
// =============================================================================
// API ROUTES - FORMS MANAGEMENT
// =============================================================================

app.get("/api/forms", hasRole("admin"), async (req, res) => {
  try {
    res.json(await formsService.getAllForms());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/forms/export/all", hasRole("admin"), async (req, res) => {
  try {
    const forms = await formsService.getAllFormsFull();
    const filename = `all_forms_export_${
      new Date().toISOString().split("T")[0]
    }.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(forms, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});
app.post(
  "/api/forms/import/all",
  hasRole("admin"),
  upload.single("formsFile"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    try {
      const fileContent = fs.readFileSync(req.file.path, "utf8");
      const data = JSON.parse(fileContent);

      // [NEW] Validate the parsed data array
      const { error, value } = validateBulkData(data);
      if (error) {
        return res.status(400).json({
          error: "Import Failed: Schema Mismatch",
          details: error.details.map((d) => d.message),
        });
      }

      await formsService.importBulkForms(value);
      fs.unlinkSync(req.file.path);
      await db.logEvent(
        req.session.user.name,
        "Forms",
        `Bulk Imported ${value.length} forms`,
        {}
      );
      res.json({ success: true, count: value.length });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res.status(500).json({ error: "Import failed: " + e.message });
    }
  }
);
app.get("/api/forms/:id", async (req, res) => {
  if (!req.session.loggedIn)
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const form = await formsService.getFormById(req.params.id);
    if (!form) return res.status(404).json({ error: "Form not found" });
    res.json(form);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update Create Form Route
app.post("/api/forms", hasRole("admin"), validateForm, async (req, res) => {
  try {
    const { name, status, intro, structure } = req.body;
    const id = await formsService.createForm(name, status, intro, structure);
    const newForm = await formsService.getFormById(id);

    await db.logEvent(req.session.user.name, "Forms", `Created form: ${name}`, {
      id,
    });
    res.json(newForm);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update Update Form Route
app.put("/api/forms/:id", hasRole("admin"), validateForm, async (req, res) => {
  try {
    await formsService.updateForm(req.params.id, req.body);
    await db.logEvent(
      req.session.user.name,
      "Forms",
      `Updated form ID: ${req.params.id}`,
      {}
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/forms/:id", hasRole("admin"), async (req, res) => {
  try {
    await formsService.deleteForm(req.params.id);
    await db.logEvent(
      req.session.user.name,
      "Forms",
      `Deleted form ID: ${req.params.id}`,
      {}
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/forms/:id/export", hasRole("admin"), async (req, res) => {
  try {
    const form = await formsService.getFormById(req.params.id);
    if (!form) return res.status(404).send("Form not found");
    const filename = `form_export_${form.id}_${form.name
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    const exportData = {
      name: form.name,
      intro: form.intro,
      status: form.status,
      structure: form.structure,
    };
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});
app.post(
  "/api/forms/import",
  hasRole("admin"),
  upload.single("formFile"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    try {
      const fileContent = fs.readFileSync(req.file.path, "utf8");
      const data = JSON.parse(fileContent);
      if (!data.name || !Array.isArray(data.structure)) {
        throw new Error("Invalid form structure file.");
      }
      const id = await formsService.createForm(
        data.name,
        data.status,
        data.intro,
        data.structure
      );
      fs.unlinkSync(req.file.path);
      await db.logEvent(
        req.session.user.name,
        "Forms",
        `Imported form: ${data.name}`,
        { id }
      );
      res.json({ success: true, id });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res.status(500).json({ error: "Import failed: " + e.message });
    }
  }
);
app.get("/api/forms/public/:publicId", async (req, res) => {
  try {
    const form = await formsService.getFormByPublicId(req.params.publicId);
    if (!form) return res.status(404).json({ error: "Form not found" });
    res.json({
      name: form.name,
      intro: form.intro,
      status: form.status,
      structure: form.structure,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/forms/:id/usage", hasRole("admin"), async (req, res) => {
  try {
    const usage = await formsService.getFormUsage(req.params.id);
    res.json({ count: usage.length, skills: usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =============================================================================
// API ROUTES - LIVE FORMS
// =============================================================================

app.get("/api/live-forms", hasRole("admin"), async (req, res) => {
  try {
    const filters = {
      memberId: req.query.memberId,
      skillId: req.query.skillId,
      status: req.query.status,
      sentStart: req.query.sentStart,
      sentEnd: req.query.sentEnd,
      subStart: req.query.subStart,
      subEnd: req.query.subEnd,
      tries: req.query.tries,
    };

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    const result = await formsService.getLiveForms(filters, { limit, offset });

    // Return { records: [], total: 100, page: 1, limit: 25 }
    res.json({ ...result, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// [NEW] Export JSON endpoint
app.get("/api/live-forms/export", hasRole("admin"), async (req, res) => {
  try {
    const filters = {
      memberId: req.query.memberId,
      skillId: req.query.skillId,
      status: req.query.status,
      sentStart: req.query.sentStart,
      sentEnd: req.query.sentEnd,
      subStart: req.query.subStart,
      subEnd: req.query.subEnd,
      tries: req.query.tries,
    };

    // No pagination for export
    const result = await formsService.getLiveForms(filters, null);

    const filename = `live_forms_export_${
      new Date().toISOString().split("T")[0]
    }.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(result.records, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// [NEW] Purge endpoint
app.delete("/api/live-forms/all", hasRole("superadmin"), async (req, res) => {
  try {
    // Allow filters in query or body
    const filters = {
      memberId: req.query.memberId || req.body.memberId,
      skillId: req.query.skillId || req.body.skillId,
      status: req.query.status || req.body.status,
      sentStart: req.query.sentStart || req.body.sentStart,
      sentEnd: req.query.sentEnd || req.body.sentEnd,
      subStart: req.query.subStart || req.body.subStart,
      subEnd: req.query.subEnd || req.body.subEnd,
      tries: req.query.tries || req.body.tries,
    };

    const count = await formsService.purgeLiveForms(filters);
    await db.logEvent(
      req.session.user.name,
      "Live Forms",
      `Purged ${count} records`,
      { filters }
    );

    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/live-forms/:id", hasRole("admin"), async (req, res) => {
  try {
    await formsService.updateLiveFormStatus(req.params.id, req.body.status);
    await db.logEvent(
      req.session.user.name,
      "Live Forms",
      `Updated status ID: ${req.params.id}`,
      { status: req.body.status }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/live-forms/:id", hasRole("admin"), async (req, res) => {
  try {
    await formsService.deleteLiveForm(req.params.id);
    await db.logEvent(
      req.session.user.name,
      "Live Forms",
      `Deleted record ID: ${req.params.id}`,
      {}
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// --- PUBLIC LIVE FORM ACCESS ---

app.get("/api/live-forms/access/:code", async (req, res) => {
  try {
    const result = await formsService.getLiveFormByCode(req.params.code);

    if (!result) {
      // [SECURITY] If code doesn't exist, return 404.
      return res.status(404).json({ error: "Form link invalid or expired." });
    }

    // [SECURITY] Check Status
    if (result.form_status === "submitted") {
      return res.status(403).json({
        error: "This form has been already submitted",
        status: "submitted",
      });
    }
    if (result.form_status === "disabled") {
      return res
        .status(403)
        .json({ error: "This form has been disabled", status: "disabled" });
    }

    // Only return data if 'sent'
    res.json({
      status: "sent",
      name: result.form_name,
      intro: result.intro,
      structure: result.structure,
      member: result.member_name,
      skill: result.skill_name,
      tries: result.tries || 1, // [NEW] Added attempt count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/live-forms/submit/:code", async (req, res) => {
  try {
    // 1. Verify status is still open (prevent double submission race condition)
    const form = await formsService.getLiveFormByCode(req.params.code);
    if (!form) return res.status(404).json({ error: "Invalid form" });
    if (form.form_status !== "sent")
      return res.status(403).json({ error: "Form is no longer open" });

    // 2. Submit Data
    await formsService.submitLiveForm(req.params.code, req.body);

    // 3. Log System Event
    await db.logEvent(
      "System",
      "Live Forms",
      `Form Submitted by ${form.member_name}`,
      {
        skill: form.skill_name,
        code: req.params.code,
      }
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/live-forms/review/:id", hasRole("admin"), async (req, res) => {
  try {
    const result = await formsService.getLiveFormSubmission(req.params.id);

    if (!result) return res.status(404).json({ error: "Record not found" });

    res.json({
      // CRITICAL FIX: Pass ID and Status to frontend
      id: result.id,
      form_status: result.form_status,
      tries: result.tries,

      // Form Data
      name: result.form_name,
      intro: result.intro,
      structure: result.structure,

      // Context & Contact Info (for notifications)
      member: result.member_name,
      member_email: result.member_email,
      member_mobile: result.member_mobile,
      member_prefs: result.member_prefs,
      skill: result.skill_name,

      // Submission Data
      submittedData: result.form_submitted_data,
      submittedAt: result.form_submitted_datetime,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper to convert HTML to Text with formatting preservation
function convertHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n") // Convert <br> to newline
    .replace(/<\/p>/gi, "\n\n") // Convert </p> to double newline
    .replace(/<\/div>/gi, "\n") // Convert </div> to newline
    .replace(/<[^>]*>/g, "") // Strip remaining tags
    .trim(); // Trim whitespace
}

// --- ACCEPT SUBMISSION ---
app.post("/api/live-forms/accept/:id", hasRole("admin"), async (req, res) => {
  try {
    const { notifyEmail, notifyWa, customComment } = req.body;
    const id = req.params.id;
    const isDemo = config.appMode === "demo"; // [NEW] Demo detection

    // 1. Update Internal Database State
    await formsService.updateLiveFormStatus(id, "accepted");

    const form = await formsService.getLiveFormSubmission(id);
    const member = {
      name: form.member_name,
      email: form.member_email,
      mobile: form.member_mobile,
    };

    // 2. Load and Process Templates
    const prefs = await db.getPreferences();
    let tplEmail = {
      from: null,
      subject: "Skill Verification Approved",
      body: null,
    };
    let tplWa = { body: null };

    if (prefs.tpl_accepted) {
      try {
        const parsed = JSON.parse(prefs.tpl_accepted);
        if (parsed.email) {
          if (parsed.email.from) tplEmail.from = parsed.email.from;
          if (parsed.email.subject) tplEmail.subject = parsed.email.subject;
          if (parsed.email.body) tplEmail.body = parsed.email.body;
        }
        if (parsed.whatsapp && parsed.whatsapp.body) {
          tplWa.body = parsed.whatsapp.body;
        }
      } catch (e) {
        console.error("Template parse error", e);
      }
    }

    const newLink = ""; // Accept flow has no retry link

    const applyVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, member.name)
        .replace(/{{email}}/g, member.email)
        .replace(/{{skill}}/g, form.skill_name)
        .replace(/{{appname}}/g, config.ui.loginTitle)
        .replace(/{{url}}/g, newLink)
        .replace(/{{custom_comment}}/g, customComment || "");
    };

    // 3. Conditional Email Transmission
    if (notifyEmail && member.email) {
      const from = tplEmail.from
        ? applyVars(tplEmail.from)
        : config.ui.loginTitle + " <noreply@fenz.osm>";
      const subject = applyVars(tplEmail.subject);
      const htmlBody = tplEmail.body
        ? applyVars(tplEmail.body)
        : `<p>Hello ${member.name}, your submission for "${form.skill_name}" has been APPROVED.</p>`;
      const textBody = convertHtmlToText(htmlBody);

      if (!isDemo) {
        // [NEW] Skip actual SMTP in Demo
        await config.transporter.sendMail({
          from,
          to: member.email,
          subject,
          text: textBody,
          html: htmlBody,
        });
      } else {
        console.log(`[DEMO] Simulated Accept Email to: ${member.email}`);
      }
    }

    // 4. Conditional WhatsApp Transmission
    if (notifyWa && member.mobile && config.enableWhatsApp) {
      let message = tplWa.body
        ? applyVars(tplWa.body)
        : `Hello ${member.name}, your submission for "${form.skill_name}" has been APPROVED.`;

      if (!isDemo) {
        // [NEW] Skip actual WA in Demo
        await whatsappService.sendMessage(member.mobile, message);
      } else {
        console.log(`[DEMO] Simulated Accept WhatsApp to: ${member.mobile}`);
      }
    }

    // 5. Log System Event
    await db.logEvent(
      req.session.user.name,
      "Live Forms",
      isDemo
        ? `Accepted submission #${id} (SIMULATED)`
        : `Accepted submission #${id}`,
      { member: member.name }
    );

    res.json({ success: true, demo: isDemo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- REJECT SUBMISSION ---
app.post("/api/live-forms/reject/:id", hasRole("admin"), async (req, res) => {
  try {
    const { notifyEmail, notifyWa, customComment, generateNew } = req.body;
    const id = req.params.id;
    const isDemo = config.appMode === "demo"; // [NEW] Demo detection

    // 1. Update Internal Database State
    await formsService.updateLiveFormStatus(id, "rejected");

    const form = await formsService.getLiveFormSubmission(id);
    const member = {
      name: form.member_name,
      email: form.member_email,
      mobile: form.member_mobile,
    };

    // 2. Generate New Attempt Workflow (Always runs in Demo to test workflow)
    let newLink = "";
    if (generateNew) {
      const newCode = await formsService.createRetryLiveForm(id);
      const baseUrl = req.protocol + "://" + req.get("host");
      newLink = `${baseUrl}/forms-view.html?code=${newCode}`;
    }

    // 3. Load and Process Templates
    const prefs = await db.getPreferences();
    let tplEmail = {
      from: null,
      subject: "Skill Verification Returned",
      bodyRetry: null,
      bodySimple: null,
    };
    let tplWa = { bodyRetry: null, bodySimple: null };

    if (prefs.tpl_rejected) {
      try {
        const parsed = JSON.parse(prefs.tpl_rejected);
        if (parsed.email) {
          if (parsed.email.from) tplEmail.from = parsed.email.from;
          if (parsed.email.subject) tplEmail.subject = parsed.email.subject;
          if (parsed.email.bodyRetry)
            tplEmail.bodyRetry = parsed.email.bodyRetry;
          if (parsed.email.bodySimple)
            tplEmail.bodySimple = parsed.email.bodySimple;
        }
        if (parsed.whatsapp) {
          if (parsed.whatsapp.bodyRetry)
            tplWa.bodyRetry = parsed.whatsapp.bodyRetry;
          if (parsed.whatsapp.bodySimple)
            tplWa.bodySimple = parsed.whatsapp.bodySimple;
        }
      } catch (e) {
        console.error("Template parse error", e);
      }
    }

    const applyVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, member.name)
        .replace(/{{email}}/g, member.email)
        .replace(/{{skill}}/g, form.skill_name)
        .replace(/{{appname}}/g, config.ui.loginTitle)
        .replace(/{{url}}/g, newLink || "")
        .replace(/{{custom_comment}}/g, customComment || "");
    };

    // 4. Conditional Email Transmission
    if (notifyEmail && member.email) {
      const from = tplEmail.from
        ? applyVars(tplEmail.from)
        : config.ui.loginTitle + " <noreply@fenz.osm>";
      const subject = applyVars(tplEmail.subject);
      const rawBody = generateNew ? tplEmail.bodyRetry : tplEmail.bodySimple;
      let htmlBody = rawBody
        ? applyVars(rawBody)
        : `<p>Hello ${member.name}, your submission for "${form.skill_name}" was NOT accepted.</p>`;
      let textBody = convertHtmlToText(htmlBody);

      if (!isDemo) {
        // [NEW] Skip actual SMTP in Demo
        await config.transporter.sendMail({
          from,
          to: member.email,
          subject,
          text: textBody,
          html: htmlBody,
        });
      } else {
        console.log(`[DEMO] Simulated Reject Email to: ${member.email}`);
      }
    }

    // 5. Conditional WhatsApp Transmission
    if (notifyWa && member.mobile && config.enableWhatsApp) {
      const rawBody = generateNew ? tplWa.bodyRetry : tplWa.bodySimple;
      let message = rawBody
        ? applyVars(rawBody)
        : `Hello ${member.name}, your submission for "${form.skill_name}" was NOT accepted.`;

      if (!isDemo) {
        // [NEW] Skip actual WA in Demo
        await whatsappService.sendMessage(member.mobile, message);
      } else {
        console.log(`[DEMO] Simulated Reject WhatsApp to: ${member.mobile}`);
      }
    }

    // 6. Log System Event
    await db.logEvent(
      req.session.user.name,
      "Live Forms",
      isDemo
        ? `Rejected submission #${id} (SIMULATED)`
        : `Rejected submission #${id}`,
      { member: member.name, retry: generateNew }
    );

    res.json({ success: true, demo: isDemo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =============================================================================
// API ROUTES - STATISTICS
// =============================================================================
app.get("/api/statistics/data/:key", hasRole("simple"), async (req, res) => {
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
//==============================================================================
//  SERVE STATIC FILES
app.use(express.static("public"));

// =============================================================================
//  SOCKET.IO EVENTS
// =============================================================================

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
      socket.emit(
        "preferences-data",
        await db.getAllUserPreferences(socket.request.session.user.id || 0)
      );
    } catch (e) {}
  });
  socket.on("update-preference", async ({ key, value }) => {
    if (userLevel < ROLES.simple)
      return logger("Unauthorized: Guest cannot save preferences.");
    try {
      await db.saveUserPreference(
        socket.request.session.user.id || 0,
        key,
        value
      );
    } catch (e) {}
  });
  socket.on("wa-get-status", () => {
    if (userLevel >= ROLES.simple) {
      socket.emit("wa-status-data", whatsappService.getStatus());
    }
  });
  socket.on("wa-control", (action) => {
    if (userLevel < ROLES.admin) return;
    if (action === "start") whatsappService.startClient();
    if (action === "stop") whatsappService.logout();
  });
  socket.on("wa-send-test", async (data) => {
    if (userLevel < ROLES.admin) return;
    const currentUser =
      socket.request.session.user.name || socket.request.session.user;
    try {
      logger(`[WhatsApp] Sending test message to ${data.mobile}...`);
      await whatsappService.sendMessage(data.mobile, data.message);
      await db.logEvent(currentUser, "WhatsApp", "Test Message Sent", {
        mobile: data.mobile,
        messageSnippet: data.message.substring(0, 20),
      });
      socket.emit("wa-test-result", {
        success: true,
        message: "Test message sent successfully.",
      });
    } catch (err) {
      logger(`[WhatsApp] Test failed: ${err.message}`);
      await db.logEvent(currentUser, "WhatsApp", "Test Message Failed", {
        mobile: data.mobile,
        error: err.message,
      });
      socket.emit("wa-test-result", { success: false, error: err.message });
    }
  });
  socket.on("view-expiring-skills", async (days, forceRefresh) => {
    const protocol =
      socket.handshake.headers["x-forwarded-proto"] ||
      (socket.request.connection.encrypted ? "https" : "http");
    const host = socket.handshake.headers.host;
    const dynamicBaseUrl = `${protocol}://${host}`;
    try {
      const daysThreshold = parseInt(days) || 30;
      const interval = forceRefresh ? 0 : config.scrapingInterval;

      logger(
        `> Fetching View Data (Threshold: ${daysThreshold} days${
          forceRefresh ? ", Force Refresh" : ", Cached OK"
        })...`
      );

      const dbMembers = await db.getMembers();
      const dbSkills = await db.getSkills();
      const rawData = await getOIData(
        config.url,
        interval,
        currentProxy,
        logger
      );
      const trainingMap = await getTrainingMap();

      // Fetch statuses using the environment variable threshold
      const liveForms = await formsService.getAllActiveStatuses(
        config.acceptedFormVisibilityDays
      );
      const liveFormsMap = {};
      liveForms.forEach((r) => {
        liveFormsMap[`${r.member_id}_${r.skill_id}`] = r.form_status;
      });

      // [UPDATED] Pass liveFormsMap
      const processedMembers = processMemberSkills(
        dbMembers,
        rawData,
        dbSkills,
        daysThreshold,
        trainingMap,
        liveFormsMap,
        dynamicBaseUrl
      );

      const results = processedMembers.map((m) => ({
        id: m.id, // [NEW] Pass Member ID
        name: m.name,
        email: m.email,
        mobile: m.mobile,
        notificationPreference: m.notificationPreference,
        skills: m.expiringSkills.map((s) => ({
          skillId: s.skillId, // [NEW] Pass Skill ID
          skill: s.skill,
          dueDate: s.dueDate,
          hasUrl: !!s.url,
          isCritical: !!s.isCritical,
          liveFormStatus: s.liveFormStatus,
        })),
        emailEligible: m.expiringSkills.length > 0,
      }));

      socket.emit("expiring-skills-data", results);
      socket.emit("script-complete", 0);
    } catch (e) {
      logger(e.message);
      socket.emit("script-complete", 1);
    }
  });
  socket.on("run-process-queue", async (targets, days) => {
    if (userLevel < ROLES.simple) {
      socket.emit("terminal-output", "Error: Unauthorized.\n");
      return;
    }
    await handleQueueProcessing(socket, targets, parseInt(days) || 30, logger);
  });
});

async function handleQueueProcessing(socket, targets, days, logger) {
  const protocol =
    socket.handshake.headers["x-forwarded-proto"] ||
    (socket.request.connection.encrypted ? "https" : "http");
  const host = socket.handshake.headers.host;
  const dynamicBaseUrl = `${protocol}://${host}`;
  const isDemo = config.appMode === "demo";
  const currentUser = socket.request.session.user.name || "System";
  logger(`\n[DEBUG] --- Notification Process Started by ${currentUser} ---`);
  try {
    const dbMembers = await db.getMembers();
    const dbSkills = await db.getSkills();
    const rawData = await getOIData(
      config.url,
      config.scrapingInterval,
      null,
      logger
    );
    const prefs = await db.getPreferences();
    const membersToProcess = dbMembers.filter((m) =>
      targets.some((t) => t.name === m.name && m.enabled)
    );
    const trainingMap = await getTrainingMap();
    const processedMembers = processMemberSkills(
      membersToProcess,
      rawData,
      dbSkills,
      days,
      trainingMap,
      {}, // empty liveFormsMap for this context
      dynamicBaseUrl
    );
    let totalSent = 0;

    for (const member of processedMembers) {
      const targetInfo = targets.find((t) => t.name === member.name);
      if (!targetInfo || (!targetInfo.sendEmail && !targetInfo.sendWa))
        continue;
      if (!member.expiringSkills || member.expiringSkills.length === 0)
        continue;
      logger(`> Processing: ${member.name}`);

      for (const skill of member.expiringSkills) {
        const skillConfig = dbSkills.find((s) => s.name === skill.skill);
        if (
          skillConfig &&
          skillConfig.url_type === "internal" &&
          skillConfig.url
        ) {
          try {
            // 1. Check if already submitted
            const isSubmitted = await formsService.checkSubmittedStatus(
              member.id,
              skillConfig.id
            );

            if (isSubmitted) {
              skill.isSubmitted = true; // Flag for Mailer/WhatsApp
              skill.url = null; // Ensure no link is rendered
              logger(
                `  - Skipped Live Form for "${skill.skill}" (Status: Submitted/Pending Review)`
              );
            } else {
              // 2. Standard Flow: Ensure Open Form
              const accessCode = await formsService.ensureLiveForm(
                member.id,
                skillConfig.id,
                skill.dueDate,
                skillConfig.url
              );
              const separator = skill.url.includes("?") ? "&" : "?";
              skill.url = `${skill.url}${separator}code=${accessCode}`;
              logger(`  - Live Form ready for "${skill.skill}"`);
            }
          } catch (e) {
            logger(
              `  ! Error creating live form for ${skill.skill}: ${e.message}`
            );
          }
        }
      }

      if (targetInfo.sendEmail && member.email) {
        try {
          // Mailer service already handles simulation if 4th param is true
          await sendNotification(
            member,
            prefs,
            config.transporter,
            isDemo,
            logger,
            config.ui.loginTitle
          );

          if (isDemo) {
            logger(
              `  [DEMO] Email simulated for ${member.name}. Skipping SMTP transmission.`
            );
          } else {
            await db.logEmailAction(member, "SENT", "Email notification sent");
          }
        } catch (e) {
          logger(`  X Email Failed: ${e.message}`);
          await db.logEmailAction(member, "FAILED", e.message);
        }
      }
      if (targetInfo.sendWa && member.mobile && config.enableWhatsApp) {
        try {
          const waTemplate = {
            intro: prefs.waIntro,
            row: prefs.waRow,
            rowNoUrl: prefs.waRowNoUrl,
            filterOnlyWithUrl: prefs.waOnlyWithUrl,
          };
          let msg = (waTemplate.intro || "")
            .replace("{{name}}", member.name)
            .replace("{{appname}}", config.ui.loginTitle);
          let hasSkills = false;

          member.expiringSkills.forEach((s) => {
            // [UPDATED] WhatsApp Logic
            if (waTemplate.filterOnlyWithUrl && !s.url && !s.isSubmitted)
              return;

            hasSkills = true;
            let row = "";

            if (s.isSubmitted) {
              // Custom text for submitted status
              row = `- *${s.skill}*: Form submitted and awaiting review.`;
            } else {
              // Standard Templates
              const tpl = s.url
                ? waTemplate.row || "- {{skill}} {{url}}"
                : waTemplate.rowNoUrl || "- {{skill}}";
              row = tpl
                .replace("{{skill}}", s.skill)
                .replace("{{date}}", s.dueDate)
                .replace("{{url}}", s.url || "")
                .replace("{{critical}}", s.isCritical ? "!" : "");
            }

            msg += `\n${row}`;
          });
          if (hasSkills) {
            if (isDemo) {
              logger(
                `  [DEMO] WhatsApp simulated for ${member.mobile}. Skipping transmission.`
              );
            } else {
              await whatsappService.sendMessage(member.mobile, msg);
              logger(`  - WhatsApp sent to ${member.mobile}`);
            }
            await db.logEvent(
              currentUser,
              "WhatsApp",
              isDemo ? "Notification Simulated" : "Notification Sent",
              { member: member.name }
            );
          }
        } catch (e) {
          logger(`  X WhatsApp Failed: ${e.message}`);
        }
      }
      totalSent++;
      if (socket.connected)
        socket.emit("progress-update", {
          type: "progress-tick",
          current: totalSent,
          total: targets.length,
          member: member.name,
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

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`> App Mode: ${(config.appMode || "PRODUCTION").toUpperCase()}`);
});
