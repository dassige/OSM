const logger = require("./logger");

const DEFAULT_BU_ID = "87FF646A-FCBC-49A1-9BAC-XXXXXXXXX";

function validateEnv(config) {
  const errors = [];
  const warnings = [];

  const isProduction = config.appMode !== "demo";

  // --- Fatal: credentials required in production ---
  if (isProduction) {
    if (!process.env.APP_USERNAME)
      errors.push("APP_USERNAME is required in production mode");
    if (!process.env.APP_PASSWORD)
      errors.push("APP_PASSWORD is required in production mode");
  }

  // --- Fatal: proxy URL required when mode is fixed ---
  if (config.proxyMode === "fixed" && !process.env.PROXY_URL)
    errors.push("PROXY_URL is required when PROXY_MODE=fixed");

  // --- Fatal: Gemini key required when AI is enabled with Gemini provider ---
  if (
    config.aiConfig.enabled &&
    config.aiConfig.provider === "gemini" &&
    !config.aiConfig.geminiKey
  )
    errors.push(
      "GEMINI_API_KEY is required when ENABLE_AI_EVALUATION=true and AI_PROVIDER=gemini"
    );

  // --- SESSION_SECRET: fatal in production, warning in demo ---
  if (!process.env.SESSION_SECRET) {
    if (isProduction)
      errors.push(
        "SESSION_SECRET is required in production mode. Set a strong random string (32+ chars)."
      );
    else
      warnings.push(
        "SESSION_SECRET is not set — using an insecure fallback. Acceptable for demo only."
      );
  } else if (process.env.SESSION_SECRET.length < 32) {
    warnings.push(
      "SESSION_SECRET is shorter than 32 characters. Use a longer random string for security."
    );
  }

  // --- Fatal: insecure cookies in production ---
  // COOKIE_SECURE=false means session IDs travel in plaintext — hard block in production.
  // 'development' mode is explicitly allowed to use HTTP (local laptop with no TLS proxy).
  const isStrict = config.appMode !== "demo" && config.appMode !== "development";
  if (isStrict && process.env.COOKIE_SECURE === 'false')
    errors.push(
      "COOKIE_SECURE=false is not permitted in production. Session cookies must be sent over HTTPS. " +
      "Set COOKIE_SECURE=true (or remove the variable — it defaults to true) and ensure your deployment uses a TLS-terminating proxy. " +
      "For local development without TLS, set APP_MODE=development."
    );

  // --- Warn: SMTP credentials ---
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS)
    warnings.push(
      "SMTP_USER or SMTP_PASS is not set — email notifications will fail at send time."
    );

  // --- Warn: OSM BU ID placeholder still in place ---
  if (
    isProduction &&
    !process.env.DASHBOARD_URL &&
    (!process.env.OSM_BU_ID || process.env.OSM_BU_ID === DEFAULT_BU_ID)
  )
    warnings.push(
      "OSM_BU_ID is not set or is the default placeholder — OSM dashboard scraping will not work."
    );

  return { errors, warnings };
}

function runValidation(config) {
  const { errors, warnings } = validateEnv(config);

  warnings.forEach((w) => logger.warn(`[ENV] ${w}`));
  errors.forEach((e) => logger.error(`[ENV] ${e}`));

  if (errors.length > 0) {
    logger.error(
      `[ENV] Startup aborted: ${errors.length} configuration error(s) must be resolved.`
    );
    process.exit(1);
  }

  if (warnings.length === 0 && errors.length === 0)
    logger.info("[ENV] Environment configuration OK.");
}

module.exports = { runValidation };
