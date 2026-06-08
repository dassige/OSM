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

// Applies to all authenticated /api/* routes
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

// Separate, tighter limit for unauthenticated public submission endpoints
const publicSubmitLimiter = rateLimit({
    windowMs: rateLimits.publicSubmit.windowMin * 60 * 1000,
    max: rateLimits.publicSubmit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many submission attempts. Please try again later.' },
});

// Tighter limit for user-creation to prevent account flooding by a rogue admin
const createUserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many user creation requests. Please wait before creating more accounts.' },
});

// System operation limiters — fixed limits; these endpoints are superadmin-only
// and must not be called at high volume under any legitimate use case.
const backupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many backup requests. Please wait before trying again.' },
});

const restoreLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many restore attempts. Please wait before trying again.' },
});

const aiTestLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI test requests. Please slow down.' },
});

module.exports = { loginLimiter, mfaLimiter, forgotPasswordLimiter, apiLimiter, publicSubmitLimiter, createUserLimiter, backupLimiter, restoreLimiter, aiTestLimiter };
