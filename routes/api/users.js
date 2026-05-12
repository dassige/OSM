// routes/api/users.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const db = require("../../services/db");
const config = require("../../config");
const { hasRole } = require("../../middleware/auth");
const {
  sendNewAccountNotification,
  sendAccountDeletionNotification,
  sendPasswordReset,
} = require("../../services/mailer");

router.get("/", hasRole("admin"), async (req, res) => {
  res.json(await db.getUsers());
});

router.post("/", hasRole("admin"), async (req, res) => {
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
    
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "User Mgmt", "Created User Account", {
      newUserEmail: req.body.email,
      newUserName: req.body.name,
      assignedRole: req.body.role,
    });
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", hasRole("admin"), async (req, res) => {
  try {
    const { name, email, role, enabled, blocked } = req.body;
    
    const userRecord = await db.getUserById(req.params.id);
    if (!userRecord) {
        return res.status(404).json({ error: "User not found" });
    }

    await db.updateUser(req.params.id, name, email, role, enabled, blocked);

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    if (userRecord.blocked === 1 && !blocked) {
      await db.logEvent(actor, "Security", "User Account Unblocked", {
        targetAccount: email,
        actionTakenBy: (req.apiKeyUser || req.session?.user)?.email || 'Unknown',
      });
    } else {
      await db.logEvent(actor, "User Mgmt", "Updated User Profile/Status", {
        targetEmail: email,
        targetName: name,
        newRole: role,
        statusChange: { enabled, blocked },
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user) {
      await db.deleteUser(req.params.id);
      const prefs = await db.getPreferences();
      const tpl = prefs.tpl_delete_user ? JSON.parse(prefs.tpl_delete_user) : null;
      
      await sendAccountDeletionNotification(
        user.email,
        user.name,
        config.transporter,
        config.ui.loginTitle,
        tpl
      );
      
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
      await db.logEvent(actor, "User Mgmt", "Deleted User Account", {
        deletedUserEmail: user.email,
        deletedUserName: user.name,
        deletedUserRole: user.role,
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/reset", hasRole("admin"), async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    const tempPassword = crypto.randomBytes(4).toString("hex");
    await db.adminResetPassword(req.params.id, tempPassword);
    
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_reset_password ? JSON.parse(prefs.tpl_reset_password) : null;
    
    await sendPasswordReset(
      user.email,
      tempPassword,
      config.transporter,
      config.ui.loginTitle,
      tpl
    );
    
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "User Mgmt", "Administrative Password Reset", {
      targetEmail: user.email,
      targetName: user.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;