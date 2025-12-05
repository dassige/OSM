// config.js
require('dotenv').config();
const packageJson = require('./package.json');
const nodemailer = require('nodemailer');
const path = require('path');

// --- APP MODE ---
const appMode = process.env.APP_MODE || 'production';

// --- AUTHENTICATION ---
const auth = {
    sessionSecret: process.env.SESSION_SECRET 
};

if (appMode === 'demo') {
    // Demo Mode: Use specific demo credentials (defaulting if not set)
    auth.username = process.env.DEMO_SUPERADMIN_USERNAME || 'demo';
    auth.password = process.env.DEMO_SUPERADMIN_PASSWORD || 'demo';
} else {
    // Production Mode: Use standard credentials
    auth.username = process.env.APP_USERNAME;
    auth.password = process.env.APP_PASSWORD;
}

// --- UI CUSTOMIZATION --- 
const ui = {
    appBackground: process.env.UI_BACKGROUND_URL || "resources/background.png", 
    loginLogo: process.env.UI_LOGO_URL || "resources/logo.png",       
    loginTitle: process.env.UI_LOGIN_TITLE || "FENZ OSM Automation Manager",
    version: packageJson.version,
    deployDate: packageJson.versionDate
};

// --- APP SETTINGS ---
const timezone = process.env.APP_TIMEZONE || 'Pacific/Auckland';
const locale = process.env.APP_LOCALE || 'en-NZ';

// --- DASHBOARD CONFIGURATION ---
let url;
if (appMode === 'demo') {
    // In Demo mode, point to the local static HTML file
    url = path.join(__dirname, 'public/resources/demo_osm_dasboard.html');
} else {
    // In Production, build the live URL
    const defaultBuId = '87FF646A-FCBC-49A1-9BAC-XXXXXXXXX';
    const buId = process.env.OSM_BU_ID || defaultBuId;
    url = process.env.DASHBOARD_URL || `https://www.dashboardlive.nz/osm.php?bu={${buId.replace(/[{}]/g, '')}}`;
}

const scrapingInterval = parseInt(process.env.SCRAPING_INTERVAL) || 60;

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- PROXY CONFIGURATION ---
const proxyMode = process.env.PROXY_MODE || 'none';
const fixedProxyUrl = process.env.PROXY_URL || null;
const dynamicProxySource = process.env.DYNAMIC_PROXY_SOURCE || null;

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
    dynamicProxySource
};