const { getApiKeyByHash, touchApiKey, hashKey, logApiCall } = require('../services/db/api-keys');

// Keys whose values are replaced with '***' in stored params/body
const MASK_KEYS = /^(password|passwd|pass|secret|token|api[_-]?key|authorization|credential|pin|cvv)$/i;

function maskSensitive(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => maskSensitive(item));
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = MASK_KEYS.test(k) ? '***' : (v && typeof v === 'object' ? maskSensitive(v) : v);
    }
    return out;
}

function toLogJson(obj) {
    if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) return null;
    const json = JSON.stringify(maskSensitive(obj));
    // Truncate very large payloads (e.g. file uploads) rather than storing them wholesale
    return json.length > 2000 ? JSON.stringify({ _truncated: true, _originalSize: json.length }) : json;
}

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
      '/api/ready',
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
      '/surveys-results.html',
      '/knowledgebase-view.html'
    ];

    if (
      publicPaths.includes(req.path) ||
      req.path.startsWith('/socket.io/') ||
      req.path.startsWith('/resources/') ||
      req.path.startsWith('/demo/') ||
      req.path.startsWith('/api/live-forms/access/') ||
      req.path.startsWith('/api/live-forms/submit/') ||
      req.path.startsWith('/api/live-surveys/') ||
      req.path.startsWith('/api/knowledgebase/file/') ||
      req.path.startsWith('/api/knowledgebase/resolve/') ||
      req.path.startsWith('/api/knowledgebase/doc/') ||
      req.path.startsWith('/knowledgebase/')
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
        // Fire-and-forget — don't block the request on these writes
        touchApiKey(record.id).catch(() => {});
        const originIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '';
        const userAgent = req.headers['user-agent'] || '';
        res.on('finish', () => {
          logApiCall(record.id, record.name, record.key_prefix, req.method, req.originalUrl, originIp, userAgent, res.statusCode,
              toLogJson(req.query), toLogJson(req.body), toLogJson(req.params));
        });
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
