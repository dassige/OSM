// config.js
require("dotenv").config();
const packageJson = require("./package.json");
const nodemailer = require("nodemailer");
const path = require("path");

// --- APP SETTINGS ---
const timezone = process.env.APP_TIMEZONE || "Pacific/Auckland";
const locale = process.env.APP_LOCALE || "en-NZ";

// --- APP MODE ---
const appMode = process.env.APP_MODE || "production";

// --- AUTHENTICATION ---
const auth = {
  sessionSecret: process.env.SESSION_SECRET,
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  superuserEmail: process.env.SMTP_USER // Alert recipient
};

if (appMode === "demo") {
  // Demo Mode: Use specific demo credentials (defaulting if not set)
  auth.username = process.env.DEMO_SUPERADMIN_USERNAME || "demo";
  auth.password = process.env.DEMO_SUPERADMIN_PASSWORD || "demo";
} else {
  // Production Mode: Use standard credentials
  auth.username = process.env.APP_USERNAME;
  auth.password = process.env.APP_PASSWORD;
}

// --- UI CUSTOMIZATION ---
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

// --- DASHBOARD CONFIGURATION ---
let url;
if (appMode === "demo") {
  // In Demo mode, point to the local static HTML file
  url = path.join(__dirname, "public/demo/demo_osm_dasboard.html");
} else {
  // In Production, build the live URL
  const defaultBuId = "87FF646A-FCBC-49A1-9BAC-XXXXXXXXX";
  const buId = process.env.OSM_BU_ID || defaultBuId;
  url =
    process.env.DASHBOARD_URL ||
    `https://www.dashboardlive.nz/osm.php?bu={${buId.replace(/[{}]/g, "")}}`;
}

const scrapingInterval = parseInt(process.env.SCRAPING_INTERVAL) || 60;

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// --- PROXY CONFIGURATION ---
const proxyMode = process.env.PROXY_MODE || "none";
const fixedProxyUrl = process.env.PROXY_URL || null;
const dynamicProxySource = process.env.DYNAMIC_PROXY_SOURCE || null;

// --- WHATSAPP CONFIG ---
const enableWhatsApp = process.env.ENABLE_WHATSAPP === "true";


// GCloud Configuration for optional GCS scraping source
const gcsConfig = {
  bucketName: process.env.GCS_BUCKET_NAME || null,
  dataFilename: process.env.GCS_DATA_FILENAME || "osm_dashboard_export.html",
};

// Helper to convert day name to index (0=Sun, 1=Mon, etc.)
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
  return index === -1 ? null : index; // Return null if invalid/not set
}

// Add to the exported configuration object
const acceptedFormVisibilityDays =
  parseInt(process.env.ACCEPTED_FORM_VISIBILITY_DAYS) || 30;

// Forms scoring defaults
const defaultMinScore = parseFloat(process.env.DEFAULT_MIN_SCORE) || 80;
const defaultMinScoreType = process.env.DEFAULT_MIN_SCORE_TYPE || "percentage";
const defaultMaxTries = parseInt(process.env.DEFAULT_MAX_TRIES) || 1;

// --- RATE LIMITING ---
const rateLimits = {
  login:         { windowMin: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN)  || 15,  max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX)         || 10  },
  mfa:           { windowMin: parseInt(process.env.RATE_LIMIT_MFA_WINDOW_MIN)    || 5,   max: parseInt(process.env.RATE_LIMIT_MFA_MAX)           || 5   },
  forgotPassword:{ windowMin: parseInt(process.env.RATE_LIMIT_FORGOT_WINDOW_MIN) || 30,  max: parseInt(process.env.RATE_LIMIT_FORGOT_MAX)        || 3   },
  api:           { windowMin: parseInt(process.env.RATE_LIMIT_API_WINDOW_MIN)    || 1,   max: parseInt(process.env.RATE_LIMIT_API_MAX)           || 300 },
};

const aiConfig = {
  enabled: process.env.ENABLE_AI_EVALUATION === "true",
  provider: process.env.AI_PROVIDER || "gemini",
  model: process.env.AI_MODEL || "gemini-1.5-pro",
  geminiKey: process.env.GEMINI_API_KEY,
  ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
};

module.exports = {
  appMode, // Exported for use in other modules
  auth,
  ui,
  timezone,
  locale,
  url,
  scrapingInterval,
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
  rateLimits,
};
