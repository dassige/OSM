// routes/views.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const { RANKS } = require("../services/rank-config");
/**
 * Middleware to handle HTML page role checks.
 * Redirects unauthorized users to the dashboard instead of sending a JSON error.
 */
const requirePageAccess = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.session?.user?.role;
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.redirect("/");
    }
  };
};

const adminAndSuper = ["admin", "superadmin"];
const allAuthenticated = ["simple", "admin", "superadmin"];


router.get("/ui-config", (req, res) => {
  res.json({
    ...config.ui,
    appMode: config.appMode,
    locale: config.locale,
    timezone: config.timezone,
    defaultMinScore: config.defaultMinScore,
    defaultMinScoreType: config.defaultMinScoreType,
    defaultMaxTries: config.defaultMaxTries,
    aiEnabled: config.aiConfig.enabled,
    ranks: RANKS,
  });
});

router.get("/system-tools.html", requirePageAccess(["superadmin"]));
router.get("/users.html", requirePageAccess(adminAndSuper));
router.get("/event-log.html", requirePageAccess(adminAndSuper));
router.get("/third-parties.html", requirePageAccess(adminAndSuper));
router.get("/templates.html", requirePageAccess(adminAndSuper));
router.get("/live-forms.html", requirePageAccess(adminAndSuper));
router.get("/live-surveys.html", requirePageAccess(adminAndSuper));
router.get("/statistics.html", requirePageAccess(allAuthenticated));

// Note: You can easily add protections for /members.html, /skills.html, and /forms-manage.html here if needed.

module.exports = router;