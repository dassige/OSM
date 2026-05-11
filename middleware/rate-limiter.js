const rateLimit = require('express-rate-limit');
const { rateLimits } = require('../config');

const loginLimiter = rateLimit({
    windowMs: rateLimits.login.windowMin * 60 * 1000,
    max: rateLimits.login.max,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: `Too many login attempts. Please try again in ${rateLimits.login.windowMin} minutes.` },
});

const mfaLimiter = rateLimit({
    windowMs: rateLimits.mfa.windowMin * 60 * 1000,
    max: rateLimits.mfa.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: `Too many MFA attempts. Please try again in ${rateLimits.mfa.windowMin} minutes.` },
});

const forgotPasswordLimiter = rateLimit({
    windowMs: rateLimits.forgotPassword.windowMin * 60 * 1000,
    max: rateLimits.forgotPassword.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: `Too many password reset requests. Please try again in ${rateLimits.forgotPassword.windowMin} minutes.` },
});

// Public member-facing endpoints (live-forms, live-surveys) are excluded —
// they can have legitimate bursts when many members submit simultaneously.
const apiLimiter = rateLimit({
    windowMs: rateLimits.api.windowMin * 60 * 1000,
    max: rateLimits.api.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
        req.path.startsWith('/api/live-forms/access/') ||
        req.path.startsWith('/api/live-forms/submit/') ||
        req.path.startsWith('/api/live-surveys/'),
    message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, mfaLimiter, forgotPasswordLimiter, apiLimiter };
