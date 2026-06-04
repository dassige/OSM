require("dotenv").config();
const packageJson = require("./package.json");
const nodemailer = require("nodemailer");
const path = require("path");

const timezone = process.env.APP_TIMEZONE || "Pacific/Auckland";
const locale = process.env.APP_LOCALE || "en-NZ";

const appMode = process.env.APP_MODE || "production";

const auth = {
  // Demo fallback keeps the server running without a SESSION_SECRET; the
  // validator already warns when this branch is taken. Production requires a
  // real secret — the validator exits(1) before express-session is reached.
  sessionSecret: process.env.SESSION_SECRET ||
    (appMode === 'demo' ? 'opready-demo-insecure-fallback-do-not-use-in-production' : undefined),
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  superuserEmail: process.env.SMTP_USER // Alert recipient
};

if (appMode === "demo") {
  auth.username = process.env.DEMO_SUPERADMIN_USERNAME || "demo";
  auth.password = process.env.DEMO_SUPERADMIN_PASSWORD || "demo";
} else {
  auth.username = process.env.APP_USERNAME;
  auth.password = process.env.APP_PASSWORD;
}

const ui = {
  appBackground: process.env.UI_BACKGROUND_URL || "resources/background.png",
  loginLogo: process.env.UI_LOGO_URL || "resources/logo.png",
  loginTitle: process.env.UI_LOGIN_TITLE || "OpReady",
  version: packageJson.version,
  deployDate: packageJson.versionDate,
  trainingDayIndex: getDayIndex(process.env.TRAINING_DAY_OF_WEEK),
  trainingDayName: process.env.TRAINING_DAY_OF_WEEK || "Monday",
  timezone: timezone,
  locale: locale,
};

let url;
if (appMode === "demo") {
  url = path.join(__dirname, "public/demo/demo_osm_dasboard.html");
} else {
  const defaultBuId = "87FF646A-FCBC-49A1-9BAC-XXXXXXXXX";
  const buId = process.env.OSM_BU_ID || defaultBuId;
  url =
    process.env.DASHBOARD_URL ||
    `https://www.dashboardlive.nz/osm.php?bu={${buId.replace(/[{}]/g, "")}}`;
}

const scrapingInterval = parseInt(process.env.SCRAPING_INTERVAL) || 60;

// ETL plugin selection — determines which services/plugins/<name>.plugin.js is loaded.
// Available: html-scraper (default) | rest-api (stub, not yet implemented)
const extractionPlugin = process.env.EXTRACTION_PLUGIN || 'html-scraper';

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const proxyMode = process.env.PROXY_MODE || "none";
const fixedProxyUrl = process.env.PROXY_URL || null;
const dynamicProxySource = process.env.DYNAMIC_PROXY_SOURCE || null;

const enableWhatsApp = process.env.ENABLE_WHATSAPP === "true";


const gcsConfig = {
  bucketName: process.env.GCS_BUCKET_NAME || null,
  dataFilename: process.env.GCS_DATA_FILENAME || "osm_dashboard_export.html",
};

const kbStorage = {
  type:      process.env.KB_STORAGE_TYPE || 'local',
  localPath: process.env.KB_LOCAL_PATH   || path.join(__dirname, 'storage', 'knowledgebase'),
  s3: {
    bucket:          process.env.KB_S3_BUCKET            || '',
    region:          process.env.KB_S3_REGION            || 'us-east-1',
    accessKeyId:     process.env.KB_S3_ACCESS_KEY_ID     || '',
    secretAccessKey: process.env.KB_S3_SECRET_ACCESS_KEY || '',
    endpoint:        process.env.KB_S3_ENDPOINT          || '',
  },
  gcs: {
    bucket:      process.env.KB_GCS_BUCKET   || '',
    keyFilename: process.env.KB_GCS_KEY_FILE || '',
  },
};

function getDayIndex(dayName) {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const index = days.indexOf((dayName || "").toLowerCase().trim());
  return index === -1 ? null : index;
}

const acceptedFormVisibilityDays =
  parseInt(process.env.ACCEPTED_FORM_VISIBILITY_DAYS) || 30;

const defaultMinScore = parseFloat(process.env.DEFAULT_MIN_SCORE) || 80;
const defaultMinScoreType = process.env.DEFAULT_MIN_SCORE_TYPE || "percentage";
const defaultMaxTries = parseInt(process.env.DEFAULT_MAX_TRIES) || 1;

const rateLimits = {
  login:         { windowMin: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN)          || 15,  max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX)          || 10  },
  mfa:           { windowMin: parseInt(process.env.RATE_LIMIT_MFA_WINDOW_MIN)            || 5,   max: parseInt(process.env.RATE_LIMIT_MFA_MAX)            || 5   },
  forgotPassword:{ windowMin: parseInt(process.env.RATE_LIMIT_FORGOT_WINDOW_MIN)         || 30,  max: parseInt(process.env.RATE_LIMIT_FORGOT_MAX)         || 3   },
  api:           { windowMin: parseInt(process.env.RATE_LIMIT_API_WINDOW_MIN)            || 1,   max: parseInt(process.env.RATE_LIMIT_API_MAX)            || 300 },
  publicSubmit:  { windowMin: parseInt(process.env.RATE_LIMIT_PUBLIC_SUBMIT_WINDOW_MIN)  || 5,   max: parseInt(process.env.RATE_LIMIT_PUBLIC_SUBMIT_MAX)  || 30  },
};

// Default true so production (always behind HTTPS proxy) works out of the box.
// Set COOKIE_SECURE=false only for local HTTP development.
const cookieSecure = process.env.COOKIE_SECURE !== 'false';

// Restrict Socket.IO CORS to a specific origin when the frontend is served from
// a separate domain. Leave unset for the typical same-origin deployment.
const corsOrigin = process.env.CORS_ORIGIN || null;

const aiConfig = {
  enabled: process.env.ENABLE_AI_EVALUATION === "true",
  provider: process.env.AI_PROVIDER || "gemini",
  model: process.env.AI_MODEL || "gemini-1.5-pro",
  geminiKey: process.env.GEMINI_API_KEY,
  ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
};

module.exports = {
  appMode,
  auth,
  ui,
  timezone,
  locale,
  url,
  scrapingInterval,
  extractionPlugin,
  transporter,
  proxyMode,
  fixedProxyUrl,
  dynamicProxySource,
  enableWhatsApp,
  acceptedFormVisibilityDays,
  defaultMinScore,
  defaultMinScoreType,
  defaultMaxTries,
  aiConfig,
  gcsConfig,
  kbStorage,
  rateLimits,
  cookieSecure,
  corsOrigin,
};
