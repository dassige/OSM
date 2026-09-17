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

// Much more generous limit for the public Timed Quiz live-play endpoints —
// unlike a one-off form/survey submission, a live Timed quiz refetches state
// on every host action for every joined player, and a whole crew often plays
// from the same station IP, so the tight publicSubmit ceiling trips mid-game.
const liveQuizLimiter = rateLimit({
    windowMs: rateLimits.liveQuiz.windowMin * 60 * 1000,
    max: rateLimits.liveQuiz.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
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

// A single large-backup restore can legitimately mean dozens of chunk uploads
// (e.g. a 400MB backup at 20MB/chunk is 20 requests) — this only gates the
// chunk-receiving endpoint, not the restore itself (that's still restoreLimiter,
// applied at /system/restore/finalize).
const restoreChunkLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many chunk uploads. Please wait before trying again.' },
});

const aiTestLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI test requests. Please slow down.' },
});

module.exports = { loginLimiter, mfaLimiter, forgotPasswordLimiter, apiLimiter, publicSubmitLimiter, liveQuizLimiter, createUserLimiter, backupLimiter, restoreLimiter, restoreChunkLimiter, aiTestLimiter };
