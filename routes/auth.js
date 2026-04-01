// routes/auth.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const speakeasy = require("speakeasy");

const db = require("../services/db");
const config = require("../config");
const { sendPasswordReset } = require("../services/mailer");
const whatsappService = require("../services/whatsapp-service");

// Helper to finalize session and log event
async function finalizeLogin(req, res, user, authType) {
  await db.resetLoginAttempts(user.id);
  req.session.loggedIn = true;
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: user.role === "admin" || user.role === "superadmin",
  };

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  await db.logEvent(user.name, "Security", "Successful Login", {
    userEmail: user.email,
    authType: authType,
    role: user.role,
    sourceIP: ip,
  });

  res.json({ success: true });
}

// --- CORE AUTHENTICATION ---

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // 1. Superuser Check
  if (username === config.auth.username && password === config.auth.password) {
    req.session.loggedIn = true;
    req.session.user = {
      id: 0, name: "Super Admin", email: username, role: "superadmin", isAdmin: true, isEnvUser: true,
    };
    await db.logEvent("Super Admin", "Security", "Successful Login", { userEmail: username, authType: "environment", sourceIP: ip });
    return res.json({ success: true });
  }

  // 2. Database User Check
  try {
    const userRecord = await db.getUserByEmail(username);
    if (userRecord) {
      if (userRecord.enabled === 0) return res.status(403).json({ error: "Account disabled." });
      if (userRecord.blocked === 1) return res.status(403).json({ error: "Account blocked." });
    }

    const user = await db.authenticateUser(username, password);

    if (user) {
      const mfaData = await db.getMfaData(user.id);
      if (mfaData && mfaData.mfa_enabled) {
        req.session.mfaPendingUser = user; 
        return res.json({ mfaRequired: true });
      }
      return await finalizeLogin(req, res, user, "database");
    } else if (userRecord) {
        await db.incrementLoginAttempts(username);
        return res.status(401).json({ error: "Invalid credentials" });
    } else {
        return res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (e) {
    console.error("Login Error:", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/login/mfa", async (req, res) => {
  if (!req.session.mfaPendingUser) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  const { token } = req.body;
  const user = req.session.mfaPendingUser;

  // Demo Mode Bypass
  if (config.appMode === 'demo') {
      delete req.session.mfaPendingUser;
      return await finalizeLogin(req, res, user, "demo-mfa"); 
  }

  const mfaData = await db.getMfaData(user.id);
  const verified = speakeasy.totp.verify({
    secret: mfaData.mfa_secret,
    encoding: "base32",
    token: token,
    window: 1
  });

  if (verified) {
    delete req.session.mfaPendingUser;
    return await finalizeLogin(req, res, user, "database-mfa");
  } else {
    return res.status(401).json({ error: "Invalid Code" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (email === config.auth.username)
    return res.status(400).json({ error: "Cannot reset Super Admin password via email." });
  
  try {
    const user = await db.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found." });
    
    const tempPassword = crypto.randomBytes(4).toString("hex");
    await db.adminResetPassword(user.id, tempPassword);
    
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_reset_password ? JSON.parse(prefs.tpl_reset_password) : null;
    
    await sendPasswordReset(email, tempPassword, config.transporter, config.ui.loginTitle, tpl);
    
    await db.logEvent("System", "Security", "Password Reset Initiated", {
      targetAccount: email,
      requestedByIP: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

router.get("/logout", async (req, res) => {
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

// --- SESSION CHECK (API) ---

router.get("/api/user-session", (req, res) => {
  if (req.session && req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Not logged in" });
});

module.exports = router;