const crypto = require('crypto');

function generateCsrfToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    return req.session.csrfToken;
}

// Enforce CSRF only on authenticated session mutations.
// Skipped when: safe method, API key auth, or no authenticated session user
// (covers login, public form/survey submissions, and forgot-password automatically).
function csrfProtection(req, res, next) {
    if (req.apiKeyUser) return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.session?.user) return next();

    const sessionToken = req.session.csrfToken;
    const requestToken = req.headers['x-csrf-token'];

    if (!sessionToken || !requestToken || sessionToken !== requestToken) {
        return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    }
    next();
}

module.exports = { generateCsrfToken, csrfProtection };
