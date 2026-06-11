// routes/api/profile.js
const express = require("express");
const router = express.Router();
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const db = require("../../services/db");
const config = require("../../config");
const { hasRole } = require("../../middleware/auth");
const { validatePassword } = require("../../services/password-policy");

router.put("/", hasRole('simple'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const userId = req.session.user.id;
    const oldName = req.session.user.name;
    const changedFields = [];
    if (req.body.name && req.body.name !== oldName) changedFields.push('name');
    if (req.body.password) {
      const { valid, error } = validatePassword(req.body.password);
      if (!valid) return res.status(400).json({ error });
      changedFields.push('password');
    }

    await db.updateUserProfile(userId, req.body.name, req.body.password);
    req.session.user.name = req.body.name;

    await db.logEvent(req.session.user.name, 'User Mgmt', 'Profile Updated', {
      userId,
      changedFields,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/mfa/setup", hasRole('simple'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  if (!req.session.user || !req.session.user.id) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword } = req.body;
  if (!currentPassword) return res.status(400).json({ error: "Current password is required to enable MFA." });

  const valid = await db.verifyUserPassword(req.session.user.id, currentPassword);
  if (!valid) return res.status(403).json({ error: "Incorrect password." });

  const secret = speakeasy.generateSecret({ name: `${config.ui.loginTitle} (${req.session.user.email})` });

  // Secret is stored but MFA stays inactive until the user proves their TOTP app is configured correctly
  await db.setMfaSecret(req.session.user.id, secret.base32);

  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) return res.status(500).json({ error: "QR Generation failed" });
    res.json({ secret: secret.base32, qrCode: data_url });
  });
});

router.post("/mfa/verify", hasRole('simple'), async (req, res) => {
  const { token } = req.body;
  const userId = req.session.user.id;
  const userName = req.session.user.name;

  // No real TOTP secret in demo mode, so verification is skipped
  if (config.appMode === "demo") {
    await db.setMfaStatus(userId, true);
    await db.logEvent(userName, "Security", "MFA Enabled (Demo Simulation)", { userId, userName });
    return res.json({ success: true });
  }

  const data = await db.getMfaData(userId);
  const verified = speakeasy.totp.verify({
    secret: data.mfa_secret,
    encoding: "base32",
    token: token
  });

  if (verified) {
    await db.setMfaStatus(userId, true);
    await db.logEvent(userName, "Security", "MFA Enabled", { userId, userName });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid Code" });
  }
});

router.post("/mfa/disable", hasRole('simple'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  const userId = req.session.user.id;
  const userName = req.session.user.name;

  const { totpToken } = req.body;
  if (!totpToken) return res.status(400).json({ error: "Authenticator code required to disable MFA." });

  const data = await db.getMfaData(userId);
  if (!data || !data.mfa_secret) return res.status(400).json({ error: "MFA is not configured." });

  const verified = speakeasy.totp.verify({
    secret: data.mfa_secret,
    encoding: "base32",
    token: totpToken,
    window: 1,
  });
  if (!verified) return res.status(403).json({ error: "Invalid code. MFA not disabled." });

  await db.setMfaStatus(userId, false);
  await db.setMfaSecret(userId, null);
  await db.logEvent(userName, "Security", "MFA Disabled", { userId, userName });
  res.json({ success: true });
});

router.get("/mfa/status", hasRole('simple'), async (req, res) => {
  const userId = req.session.user.id;
  const data = await db.getMfaData(userId);
  res.json({ enabled: !!(data && data.mfa_enabled) });
});

module.exports = router;
