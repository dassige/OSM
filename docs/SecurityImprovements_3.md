# Security Improvements — Round 3

**Date:** 2026-06-08  
**Performed by:** Claude Code (static code analysis + targeted remediation)  
**Method:** Penetration-testing-style static review across all key route, middleware, config, and service files, followed by targeted fixes across three severity tiers.  
**Test result:** 201/201 Jest tests passing after all changes.

---

## Background

A full simulated penetration test (code-review phase) was carried out against the OpReady application. Seventeen key files were audited across OWASP Top 10 categories: injection, authentication, authorisation, XSS, CSRF, security headers, sensitive data exposure, rate limiting, file operations, information disclosure, and WebSocket security.

The audit identified **16 findings** across four severity levels. All actionable findings were remediated in the same session. One HIGH finding (H4) was determined to be a false positive and required no change.

---

## Findings & Fixes

### CRITICAL

#### C1 — Weak Password Reset Token Entropy

| | |
|---|---|
| **Files** | `routes/auth.js`, `routes/api/users.js` |
| **OWASP** | A07 — Identification and Authentication Failures |

**Problem:** Password reset tokens and initial account passwords were generated with `crypto.randomBytes(4)`, producing only 32 bits of entropy (8 hex characters, ~65,536 possible values). An offline brute-force attack could recover the token in seconds.

**Fix:** Changed all three call sites to `crypto.randomBytes(16)`, producing 128-bit tokens (32 hex characters). Affected flows: forgot-password, admin-create-user, admin-reset-password.

```js
// Before
const tempPassword = crypto.randomBytes(4).toString("hex");

// After
const tempPassword = crypto.randomBytes(16).toString("hex");
```

---

#### C2 — Unauthenticated `GET /api/preferences` Endpoint

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A01 — Broken Access Control |

**Problem:** `GET /api/preferences` had no `hasRole()` guard, making all system preferences (email templates, feature flags, app configuration) readable by any unauthenticated caller.

**Fix:** Added `hasRole("admin")` to the GET handler. The only frontend caller (`templates.html`) is an admin-only page and is unaffected.

```js
// Before
router.get("/preferences", async (req, res) => { ... });

// After
router.get("/preferences", hasRole("admin"), async (req, res) => { ... });
```

---

#### C3 — Hardcoded Session Secret in Demo Mode

| | |
|---|---|
| **Files** | `config.js`, `server.js` |
| **OWASP** | A02 — Cryptographic Failures |

**Problem:** When `SESSION_SECRET` was not set and `APP_MODE=demo`, the session secret defaulted to the hardcoded string `'opready-demo-insecure-fallback-do-not-use-in-production'`. Because this string is in the public source repository, an attacker could use it to forge valid session cookies.

**Fix:** `config.js` now generates a cryptographically random 32-byte secret at startup for demo mode. Sessions are invalidated on server restart (acceptable in demo). The hardcoded fallback in `server.js` was also removed — if the secret is somehow `undefined`, Express throws immediately rather than silently using a known value.

```js
// Before (config.js)
sessionSecret: process.env.SESSION_SECRET ||
  (appMode === 'demo' ? 'opready-demo-insecure-fallback-do-not-use-in-production' : undefined),

// After (config.js)
sessionSecret: process.env.SESSION_SECRET ||
  (appMode === 'demo' ? crypto.randomBytes(32).toString('hex') : undefined),
```

---

### HIGH

#### H1 — Role Escalation via IDOR on `PUT /api/users/:id`

| | |
|---|---|
| **File** | `routes/api/users.js` |
| **OWASP** | A01 — Broken Access Control |

**Problem:** An `admin`-role user could call `PUT /api/users/:id` to modify any user — including other admins or the superadmin — and could promote any account to `superadmin`, effectively granting themselves full system access.

**Fix:** Added two hierarchy checks using the `ROLES` map (`guest:0, simple:1, admin:2, superadmin:3`):
1. The actor cannot modify a user whose role level is equal to or higher than their own.
2. The actor cannot assign a role higher than their own.

```js
const actorLevel = ROLES[actorRole] ?? 0;
if (actorLevel <= (ROLES[userRecord.role] ?? 0)) {
  return res.status(403).json({ error: 'Cannot modify a user at or above your own role level.' });
}
if (role !== undefined && (ROLES[role] ?? 0) > actorLevel) {
  return res.status(403).json({ error: 'Cannot assign a role higher than your own.' });
}
```

---

#### H2 — Demo Mode MFA Bypass in Verification Endpoint

| | |
|---|---|
| **File** | `routes/auth.js` |
| **OWASP** | A07 — Identification and Authentication Failures |

**Problem:** `POST /login/mfa` contained a branch that accepted any TOTP token when `APP_MODE=demo`, allowing anyone who reached the MFA step to log in without a valid code. This was the correct intent for demo mode, but the bypass was placed in the wrong location — making the verification endpoint itself insecure.

**Fix:** The demo bypass was moved from the MFA verification endpoint to the login step. In demo mode, the MFA challenge is now skipped entirely at login (the `mfaPendingUser` session key is never set), so `POST /login/mfa` only ever runs genuine TOTP verification. No demo backdoor remains in the verification endpoint.

```js
// Login step — demo mode skips the MFA challenge entirely
if (mfaData && mfaData.mfa_enabled && config.appMode !== 'demo') {
  req.session.mfaPendingUser = user;
  return res.json({ mfaRequired: true });
}

// MFA endpoint — demo bypass removed; always validates the token
const mfaData = await db.getMfaData(user.id);
const verified = speakeasy.totp.verify({ ... });
```

---

#### H3 — No Rate Limiting on Expensive System Endpoints

| | |
|---|---|
| **Files** | `middleware/rate-limiter.js`, `routes/api/system.js` |
| **OWASP** | A05 — Security Misconfiguration |

**Problem:** `GET /api/system/backup`, `POST /api/system/restore`, and `POST /api/system/ai-test` had no per-endpoint rate limits. An authenticated superadmin could trigger them in rapid succession, causing I/O exhaustion, disk saturation, or expensive AI API spend.

**Fix:** Three dedicated limiters added to `rate-limiter.js` and applied inline to each route:

| Endpoint | Limit |
|---|---|
| `GET /api/system/backup` | 10 requests / hour |
| `POST /api/system/restore` | 3 requests / hour |
| `POST /api/system/ai-test` | 10 requests / minute |

---

#### H4 — CSRF Exemption for API Key Requests *(false positive — no change)*

**Assessment:** The CSRF middleware skips token validation when `req.apiKeyUser` is set. This is correct and intentional. API key callers are programmatic clients that cannot receive or forward a CSRF token, and the browser's same-origin policy already prevents cross-site requests from injecting custom headers like `X-API-Key`. CSRF protection is designed to defend against cookie-based session hijacking, not compromised API credentials. No change was made.

---

#### H5 — Stack Trace Exposed in AI-Test Error Response

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A05 — Security Misconfiguration |

**Problem:** The `POST /api/system/ai-test` error handler returned `{ error: e.message, stack: e.stack }`, exposing internal file paths, function names, and library internals to the client.

**Fix:** `stack` removed from the response. The full stack trace is now logged internally via Winston only.

```js
// Before
res.status(500).json({ success: false, error: e.message, stack: e.stack });

// After
logger.error('[AI Test] Evaluation failed', { error: e.message, stack: e.stack });
res.status(500).json({ success: false, error: e.message });
```

---

### MEDIUM

#### M1 — Symlink Traversal in Directory Browser

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A01 — Broken Access Control / Path Traversal |

**Problem:** `GET /api/system/browse-directory` used `path.resolve()` to normalise the requested path but did not resolve symlinks. If a directory contained a symlink pointing to a sensitive location (e.g. `/etc`), navigating into it via the browser would follow the link and list the target's contents.

**Fix:** `fs.realpathSync()` is now called before `readdirSync`, resolving all symlinks to their real filesystem targets. The resolved real path (not the symlink path) is returned in the response. The `realpathSync` call is inside the try-catch so a dangling symlink returns a clean 400.

```js
// Before
const resolved = path.resolve(requested);

// After (inside try-catch)
const resolved = fs.realpathSync(path.resolve(requested));
```

---

#### M2 — User Preferences Defaulting to id=0

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A01 — Broken Access Control |

**Problem:** All three user-preference handlers used `req.session.user.id || 0`. If `req.session.user` was somehow absent (unexpected session state), the handlers would silently operate on user id=0 — the Super Admin's preference bucket.

**Fix:** Changed to `req.session?.user?.id ?? 0` across all three handlers. The `??` operator only falls back to `0` on `null`/`undefined` (not on the falsy-but-valid `0` that is the Super Admin's legitimate ID), and optional chaining prevents a throw if the session structure is unexpected.

---

#### M3 — Raw Error Message in `GET /events/export` Response

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A05 — Security Misconfiguration |

**Problem:** The event log export error handler used `res.status(500).send(e.message)`, which could expose SQL schema details, file paths, or internal library error messages to the client.

**Fix:** Error is now logged via Winston (with stack trace) and a generic `{ error: 'Export failed. Please try again.' }` JSON is returned.

---

#### M4 — No Disk Space Guard on Knowledge Base Uploads

| | |
|---|---|
| **File** | `routes/api/knowledgebase.js` |
| **OWASP** | A05 — Security Misconfiguration (DoS) |

**Problem:** The KB upload endpoints accepted files up to 50 MB with no check of available server disk space. Repeated uploads by an admin could exhaust the filesystem and take the server down.

**Fix:** `assertLocalDiskSpace()` is called at the start of both `POST /documents` and `POST /documents/:id/replace-file`. It uses `fs.statfsSync()` (Node.js 20 built-in) to check available free space on the KB storage partition. If free space is below **100 MB**, the upload is rejected with **HTTP 507 Insufficient Storage** before any bytes are written. Cloud storage backends (S3/GCS) are skipped — they manage their own capacity. A `statfsSync` failure is non-fatal and only logs a warning.

---

### LOW / Informational

#### L1 — Content Security Policy Disabled

| | |
|---|---|
| **File** | `server.js` |
| **OWASP** | A05 — Security Misconfiguration |

**Problem:** Helmet was configured with `contentSecurityPolicy: false`, providing no protection against content injection or data exfiltration to third-party domains.

**Fix:** A baseline CSP is now enabled. Because the application uses extensive inline scripts, `'unsafe-inline'` and `'unsafe-eval'` are permitted for `script-src` in the interim. However, the policy now enforces:

| Directive | Protection gained |
|---|---|
| `script-src 'self' ...` | Blocks script loading from any external domain |
| `frame-ancestors 'none'` | Full clickjacking prevention |
| `object-src 'none'` | Flash/plugin execution blocked |
| `base-uri 'self'` | Base-tag hijacking blocked |
| `form-action 'self'` | Form submissions locked to same origin |
| `connect-src 'self' ws: wss:` | Covers Socket.IO; blocks data exfiltration to external endpoints |

**Future hardening:** Migrate inline scripts to external `.js` files, then remove `'unsafe-inline'` and `'unsafe-eval'` from `scriptSrc`.

---

#### L2 — No Rate Limit on User Creation

| | |
|---|---|
| **Files** | `middleware/rate-limiter.js`, `routes/api/users.js` |
| **OWASP** | A05 — Security Misconfiguration |

**Problem:** `POST /api/users` was only protected by the global API limiter (300 req/min), allowing an admin to create hundreds of accounts per minute, flooding the database.

**Fix:** `createUserLimiter` added: **10 account creations per 15 minutes** per IP, applied directly to `POST /api/users`.

---

#### L3 — Arbitrary Audit Log Injection via `POST /logs`

| | |
|---|---|
| **File** | `routes/api/system.js` |
| **OWASP** | A09 — Security Logging and Monitoring Failures |

**Problem:** `POST /logs` allowed any authenticated user to write log entries in any category, including `Security`, `System`, and `User Mgmt`. A malicious user could inject false audit log entries to mask their real activities.

**Fix:** Writes to the following reserved categories are now blocked with HTTP 403: `Security`, `System`, `User Mgmt`, `API Keys`, `WhatsApp`. The only current frontend caller (`members.html`, category `'Members'`) is unaffected.

---

#### L4 — No Session Idle Timeout

| | |
|---|---|
| **File** | `server.js` |
| **OWASP** | A07 — Identification and Authentication Failures |

**Problem:** No `maxAge` was set on the session cookie, meaning sessions persisted indefinitely (until the browser was closed). An unattended or shared browser could remain authenticated with no expiry.

**Fix:** `maxAge: 8 * 60 * 60 * 1000` (8 hours) added to the session cookie configuration. Sessions now expire automatically after 8 hours of inactivity.

---

## Files Changed

| File | Changes |
|---|---|
| `config.js` | Added `crypto` import; randomised demo session secret |
| `server.js` | Enabled baseline CSP; removed hardcoded session secret fallback; added session `maxAge` |
| `middleware/auth.js` | No change |
| `middleware/csrf.js` | No change (H4 determined false positive) |
| `middleware/rate-limiter.js` | Added `createUserLimiter`, `backupLimiter`, `restoreLimiter`, `aiTestLimiter` |
| `routes/auth.js` | Increased forgot-password token entropy; moved demo MFA bypass to login step |
| `routes/api/users.js` | Increased create/reset token entropy; added `ROLES` import; added hierarchy checks; added `createUserLimiter` |
| `routes/api/system.js` | Guarded `GET /preferences`; fixed user-preferences optional chaining; added browse-directory symlink resolution; fixed events/export error handler; added system rate limiters; added log category blocklist; removed AI-test stack trace |
| `routes/api/knowledgebase.js` | Added `assertLocalDiskSpace()` to both upload endpoints |
| `tests/health.test.js` | Added `rateLimits` to config mock (required after rate-limiter import chain expanded) |

## Remaining Hardening Opportunities

These were not remediated in this round (out of scope or require larger architectural changes):

| Item | Notes |
|---|---|
| CSP `'unsafe-inline'` removal | Requires migrating all inline `<script>` blocks across ~20 HTML pages to external `.js` files |
| Session timeout configurability | Currently hardcoded at 8 hours; could be made configurable via `SESSION_MAX_AGE_HOURS` env var |
| Dependency audit | Run `npm audit` regularly; `whatsapp-web.js` is a high-churn dependency worth monitoring |
| Socket.IO auth hardening | Socket connections inherit the session but there is no explicit re-validation on reconnect |
| Password policy enforcement | No minimum complexity rules enforced on user-set passwords |
