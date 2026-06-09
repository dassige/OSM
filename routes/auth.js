// routes/auth.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const speakeasy = require("speakeasy");

const db = require("../services/db");
const config = require("../config");
const logger = require("../services/logger");
const { sendPasswordReset, sendPasswordResetLink } = require("../services/mailer");
const whatsappService = require("../services/whatsapp-service");
const { loginLimiter, mfaLimiter, forgotPasswordLimiter } = require("../middleware/rate-limiter");

// Shared by both password and MFA login paths to ensure identical session state
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

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (username === config.auth.username && password === config.auth.password) {
    req.session.loggedIn = true;
    req.session.user = {
      id: 0, name: "Super Admin", email: username, role: "superadmin", isAdmin: true, isEnvUser: true,
    };
    await db.logEvent("Super Admin", "Security", "Successful Login", { userEmail: username, authType: "environment", sourceIP: ip });
    return res.json({ success: true });
  }

  try {
    // Authenticate password first — wrong password always returns 401 regardless
    // of whether the account exists, is disabled, or is blocked (F23: prevents
    // account enumeration via distinct 403 responses for disabled/blocked accounts).
    const userRecord = await db.getUserByEmail(username);
    const user = await db.authenticateUser(username, password);

    if (user) {
      // Password is correct — now check account state
      if (userRecord) {
        if (userRecord.enabled === 0) return res.status(403).json({ error: "Account disabled." });
        if (userRecord.blocked === 1) return res.status(403).json({ error: "Account blocked." });
      }
      const mfaData = await db.getMfaData(user.id);
      // In demo mode MFA secrets are not provisioned, so the challenge is skipped at
      // the login step rather than bypassed inside the verification endpoint.
      if (mfaData && mfaData.mfa_enabled && config.appMode !== 'demo') {
        req.session.mfaPendingUser = user;
        return res.json({ mfaRequired: true });
      }
      return await finalizeLogin(req, res, user, "database");
    } else {
      if (userRecord) await db.incrementLoginAttempts(username);
      return res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (e) {
    logger.error("Login Error", { error: e.message, stack: e.stack });
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/login/mfa", mfaLimiter, async (req, res) => {
  if (!req.session.mfaPendingUser) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  const { token } = req.body;
  const user = req.session.mfaPendingUser;

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

// Uniform response text for both found and not-found cases (F8/F22 — prevents user enumeration)
const FORGOT_PASSWORD_RESPONSE = { message: "If that address is registered you will receive a reset link shortly." };

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (email === config.auth.username)
    return res.status(400).json({ error: "Cannot reset Super Admin password via email." });

  try {
    const user = await db.getUserByEmail(email);

    if (user) {
      // Generate a 32-byte random token; store only its SHA-256 hash (F19/F20)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

      await db.storePasswordResetToken(user.id, tokenHash, expiresAt);

      const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const resetLink = `${appBaseUrl}/reset-password.html?token=${rawToken}`;
      const prefs = await db.getPreferences();
      const tpl = prefs.tpl_forgot_password ? JSON.parse(prefs.tpl_forgot_password) : null;

      await sendPasswordResetLink(email, resetLink, config.transporter, config.ui.loginTitle, tpl);

      await db.logEvent("System", "Security", "Password Reset Initiated", {
        targetAccount: email,
        requestedByIP: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    // Always return the same response — never reveal whether the address was found (F8/F22)
    res.json(FORGOT_PASSWORD_RESPONSE);
  } catch (e) {
    logger.error("Forgot-password error", { error: e.message });
    res.json(FORGOT_PASSWORD_RESPONSE);
  }
});

router.post("/reset-password", forgotPasswordLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await db.getUserByResetToken(tokenHash);

    if (!user || !user.reset_token_expires || Date.now() > user.reset_token_expires) {
      return res.status(400).json({ error: "Reset link is invalid or has expired." });
    }

    await db.adminResetPassword(user.id, newPassword);
    await db.clearPasswordResetToken(user.id);

    await db.logEvent("System", "Security", "Password Reset Completed", {
      targetAccount: user.email,
      requestedByIP: req.ip,
    });

    res.json({ success: true });
  } catch (e) {
    logger.error("Reset-password error", { error: e.message });
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
    logger.error("Logout cleanup error", e);
  }
  req.session.destroy();
  res.redirect("/login.html");
});

router.get("/api/user-session", (req, res) => {
  if (req.session && req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Not logged in" });
});

module.exports = router;