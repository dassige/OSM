const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const mfaLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many MFA attempts. Please try again in 5 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset requests. Please try again in 30 minutes.' },
});

// Public member-facing endpoints (live-forms, live-surveys) are excluded —
// they can have legitimate bursts when many members submit simultaneously.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
        req.path.startsWith('/api/live-forms/access/') ||
        req.path.startsWith('/api/live-forms/submit/') ||
        req.path.startsWith('/api/live-surveys/'),
    message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, mfaLimiter, forgotPasswordLimiter, apiLimiter };
