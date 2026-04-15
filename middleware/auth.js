// middleware/auth.js
const ROLES = { guest: 0, simple: 1, admin: 2, superadmin: 3 };

const hasRole = (requiredRole) => (req, res, next) => {
  const userRoleStr = req.session?.user?.role || "guest";
  const userLevel = ROLES[userRoleStr] !== undefined ? ROLES[userRoleStr] : 0;
  const requiredLevel = ROLES[requiredRole];
  
  if (userLevel >= requiredLevel) next();
  else res.status(403).json({ error: `Forbidden: Requires ${requiredRole} access.` });
};

// NEW: Extracted Global Guard
const globalAuthGuard = (req, res, next) => {
  const publicPaths = [
    "/login.html",
    "/login", 
    "/forgot-password",
    "/styles.css",
    "/ui-config",
    "/login/mfa",
    "/api/demo-credentials",
    "/forms-view.html",
    "/theme.js", 
    "/help.js", 
    "/toast.js", 
    "/public/js/toast.js",
    "/public/theme.js",
    "/surveys-manage.html",
    "/surveys-view.html",
    "/live-surveys.html",
    "/surveys-tracking.html"

  ];

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

  if (req.session && req.session.loggedIn) return next();

  if (req.path.startsWith("/api/"))
    return res.status(401).json({ error: "Unauthorized" });

  return res.redirect("/login.html");
};

module.exports = { hasRole, ROLES, globalAuthGuard };