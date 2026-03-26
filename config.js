
const packageJson = require("./package.json");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const isElectron = !!(process.versions && process.versions.electron);

// Helper for persistent storage paths
const getPersistentPath = (filename) => {
  if (isElectron) {
    const { app } = require('electron');
    // Store in %APPDATA%/fenz-osm-manager/
    return path.join(app.getPath('userData'), filename);
  }
  // Standard Web/Docker behavior
  return path.join(__dirname, filename);
};
let desktopSettings = {};
if (isElectron) {
    const settingsPath = getPersistentPath('settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            desktopSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (e) {
            console.error("Failed to parse settings.json", e);
        }
    }
} else {
    // Standard web mode still uses .env
    try { require("dotenv").config(); } catch (e) {}
}
// Helper to get config (Checks: Local File -> Environment -> Fallback)
const getConf = (key, fallback) => {
    if (desktopSettings[key] !== undefined) return desktopSettings[key];
    return process.env[key] || fallback;
};

// --- APP SETTINGS ---
const timezone = getConf("APP_TIMEZONE" ,"Pacific/Auckland");
const locale = getConf("APP_LOCALE", "en-NZ");

// --- APP MODE ---
const appMode = getConf("APP_MODE", "production");

// --- AUTHENTICATION ---
const auth = {
  sessionSecret: getConf("SESSION_SECRET"),
  maxLoginAttempts: parseInt(getConf("MAX_LOGIN_ATTEMPTS","5")) ,
  superuserEmail: getConf("SMTP_USER") // Alert recipient
};

if (appMode === "demo") {
  // Demo Mode: Use specific demo credentials (defaulting if not set)
  auth.username = getConf("DEMO_SUPERADMIN_USERNAME", "demo");
  auth.password = getConf("DEMO_SUPERADMIN_PASSWORD", "demo");
} else {
  // Production Mode: Use standard credentials
  auth.username = getConf("APP_USERNAME");
  auth.password = getConf("APP_PASSWORD");
}




// --- UI CUSTOMIZATION ---
const ui = {
  appBackground: getConf("UI_BACKGROUND_URL", "resources/background.png"),
  loginLogo: getConf("UI_LOGO_URL", "resources/logo.png"),
  loginTitle: getConf("UI_LOGIN_TITLE", "FENZ OSM Automation Manager"),
  version: packageJson.version,
  deployDate: packageJson.versionDate,
  trainingDayIndex: getDayIndex(getConf("TRAINING_DAY_OF_WEEK")),
  trainingDayName: getConf("TRAINING_DAY_OF_WEEK", "Monday"),
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
  const buId = getConf("OSM_BU_ID", defaultBuId);
  url =
    getConf("DASHBOARD_URL", `https://www.dashboardlive.nz/osm.php?bu={${buId.replace(/[{}]/g, "")}}`);
}

const scrapingInterval = parseInt(getConf("SCRAPING_INTERVAL", "60")) ;

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: getConf("SMTP_SERVICE", "gmail"),
  auth: {
    user: getConf("SMTP_USER"),
    pass: getConf("SMTP_PASS"),
  },
});

// --- PROXY CONFIGURATION ---
const proxyMode = getConf("PROXY_MODE", "none");
const fixedProxyUrl = getConf("PROXY_URL", null);
const dynamicProxySource = getConf("DYNAMIC_PROXY_SOURCE", null);

// --- WHATSAPP CONFIG ---
const enableWhatsApp = getConf("ENABLE_WHATSAPP", "false") === "true";


// GCloud Configuration for optional GCS scraping source
const gcsConfig = {
  bucketName: getConf("GCS_BUCKET_NAME", null),
  dataFilename: getConf("GCS_DATA_FILENAME", "osm_dashboard_export.html"),
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
  parseInt(getConf("ACCEPTED_FORM_VISIBILITY_DAYS", "30")) ;

// Forms scoring defaults
const defaultMinScore = parseFloat(getConf("DEFAULT_MIN_SCORE", "80"));
const defaultMinScoreType = getConf("DEFAULT_MIN_SCORE_TYPE", "percentage");
const defaultMaxTries = parseInt(getConf("DEFAULT_MAX_TRIES", "1"));

const aiConfig = {
  enabled: getConf("ENABLE_AI_EVALUATION", "false") === "true",
  provider: getConf("AI_PROVIDER", "gemini"),
  model: getConf("AI_MODEL", "gemini-1.5-pro"),
  geminiKey: getConf("GEMINI_API_KEY"),
  ollamaUrl: getConf("OLLAMA_BASE_URL", "http://localhost:11434"),
};

const dbPath = getConf("DB_PATH") || getPersistentPath(appMode === "demo" ? "demo.db" : "fenz.db");
const authPath = getPersistentPath('.wwebjs_auth'); 
const uploadsPath = getPersistentPath('uploads');
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
  dbPath,
  authPath,
  uploadsPath
};
