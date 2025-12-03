// config.js
require('dotenv').config();
const packageJson = require('./package.json');
const nodemailer = require('nodemailer');

// --- AUTHENTICATION ---
const auth = {
    username: process.env.APP_USERNAME,
    password: process.env.APP_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET 
};

// --- UI CUSTOMIZATION --- 
const ui = {
    appBackground: process.env.UI_BACKGROUND_URL || "resources/background.png", 
    loginLogo: process.env.UI_LOGO_URL || "resources/logo.png",       
    loginTitle: process.env.UI_LOGIN_TITLE || "FENZ OSM Automation Manager",
    version: packageJson.version,
    deployDate: packageJson.versionDate
};

// --- APP SETTINGS ---
// [NEW] Timezone Support
const timezone = process.env.APP_TIMEZONE || 'Pacific/Auckland';
const locale = process.env.APP_LOCALE || 'en-NZ';

// --- DASHBOARD CONFIGURATION ---
const defaultBuId = '87FF646A-FCBC-49A1-9BAC-XXXXXXXXX';
const buId = process.env.OSM_BU_ID || defaultBuId;
const url = process.env.DASHBOARD_URL || `https://www.dashboardlive.nz/osm.php?bu={${buId.replace(/[{}]/g, '')}}`;

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