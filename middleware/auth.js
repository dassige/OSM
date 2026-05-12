const { getApiKeyByHash, touchApiKey, hashKey } = require('../services/db/api-keys');

const ROLES = { guest: 0, simple: 1, admin: 2, superadmin: 3 };

const hasRole = (requiredRole) => (req, res, next) => {
  const user = req.apiKeyUser || req.session?.user;
  const userRoleStr = user?.role || 'guest';
  const userLevel = ROLES[userRoleStr] !== undefined ? ROLES[userRoleStr] : 0;
  const requiredLevel = ROLES[requiredRole];

  if (userLevel >= requiredLevel) next();
  else res.status(403).json({ error: `Forbidden: Requires ${requiredRole} access.` });
};

const globalAuthGuard = async (req, res, next) => {
  try {
    const publicPaths = [
      '/login.html',
      '/login',
      '/forgot-password',
      '/styles.css',
      '/ui-config',
      '/login/mfa',
      '/api/health',
      '/api/demo-credentials',
      '/forms-view.html',
      '/theme.js',
      '/help.js',
      '/toast.js',
      '/public/js/toast.js',
      '/public/theme.js',
      '/surveys-manage.html',
      '/surveys-view.html',
      '/live-surveys.html',
      '/surveys-tracking.html',
      '/surveys-results.html'
    ];

    if (
      publicPaths.includes(req.path) ||
      req.path.startsWith('/socket.io/') ||
      req.path.startsWith('/resources/') ||
      req.path.startsWith('/demo/') ||
      req.path.startsWith('/api/live-forms/access/') ||
      req.path.startsWith('/api/live-forms/submit/') ||
      req.path.startsWith('/api/live-surveys/')
    ) {
      return next();
    }

    // API key authentication — only applies to /api/* routes
    const rawKey = req.headers['x-api-key'];
    if (rawKey && req.path.startsWith('/api/')) {
      const record = await getApiKeyByHash(hashKey(rawKey));
      if (record && record.active) {
        req.apiKeyUser = {
          id: record.id,
          name: record.name,
          role: record.role,
          isAdmin: ROLES[record.role] >= ROLES.admin,
          isApiKey: true
        };
        // Fire-and-forget — don't block the request on this write
        touchApiKey(record.id).catch(() => {});
        return next();
      }
      return res.status(401).json({ error: 'Invalid or inactive API key.' });
    }

    if (req.session && req.session.loggedIn) return next();

    if (req.path.startsWith('/api/'))
      return res.status(401).json({ error: 'Unauthorized' });

    return res.redirect('/login.html');
  } catch (err) {
    next(err);
  }
};

module.exports = { hasRole, ROLES, globalAuthGuard };
