// routes/api/profile.js
const express = require("express");
const router = express.Router();
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const db = require("../../services/db");
const config = require("../../config");

// Update Own Profile
router.put("/", async (req, res) => {
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

// Generate Secret & QR Code for MFA
router.post("/mfa/setup", async (req, res) => {
  if (!req.session.user || !req.session.user.id) return res.status(401).json({ error: "Unauthorized" });
  
  const secret = speakeasy.generateSecret({ name: `FENZ OSM (${req.session.user.email})` });
  
  // Save secret but do NOT enable yet
  await db.setMfaSecret(req.session.user.id, secret.base32);
  
  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) return res.status(500).json({ error: "QR Generation failed" });
    res.json({ secret: secret.base32, qrCode: data_url });
  });
});

// Verify Setup & Enable MFA
router.post("/mfa/verify", async (req, res) => {
  const { token } = req.body;
  const userId = req.session.user.id;

  // --- DEMO MODE BYPASS ---
  if (config.appMode === "demo") {
    await db.setMfaStatus(userId, true);
    await db.logEvent(req.session.user.name, "Security", "MFA Enabled (Demo Simulation)", {});
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
    await db.logEvent(req.session.user.name, "Security", "MFA Enabled", {});
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid Code" });
  }
});

// Disable MFA
router.post("/mfa/disable", async (req, res) => {
  const userId = req.session.user.id;
  await db.setMfaStatus(userId, false);
  await db.setMfaSecret(userId, null);
  await db.logEvent(req.session.user.name, "Security", "MFA Disabled", {});
  res.json({ success: true });
});

// Get Current MFA Status
router.get("/mfa/status", async (req, res) => {
  const userId = req.session.user.id;
  const data = await db.getMfaData(userId);
  res.json({ enabled: !!(data && data.mfa_enabled) });
});

module.exports = router;