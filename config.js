require('dotenv').config(); // Load environment variables
const packageJson = require('./package.json');

const nodemailer = require('nodemailer');

// --- AUTHENTICATION ---
const auth = {
    username: process.env.APP_USERNAME ,
    password: process.env.APP_PASSWORD ,
    sessionSecret: process.env.SESSION_SECRET 
};

// --- UI CUSTOMIZATION --- 
const ui = {
    // Default to the local file, but allow override via ENV
    appBackground: process.env.UI_BACKGROUND_URL || "resources/background.png", 
    loginLogo: process.env.UI_LOGO_URL || "resources/logo.png",       
    loginTitle: process.env.UI_LOGIN_TITLE || "FENZ OSM Automation Manager" ,
    version: packageJson.version,
    deployDate: packageJson.versionDate
};

// --- SCRAPER CONFIGURATION ---
const url = process.env.DASHBOARD_URL || 'https://www.dashboardlive.nz/index.php';
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
const proxyMode = process.env.PROXY_MODE || 'none'; // Default to 'none'
const fixedProxyUrl = process.env.PROXY_URL || null;
const dynamicProxySource = process.env.DYNAMIC_PROXY_SOURCE || null; // Optional override




const emailInfo = {
      from: '"FENZ OSM Manager" <sender@yourdomain.com>',
      subject: "FENZ OSM: Expiring Skills Notification",
      text: "Hello, you have expiring Skills due in OSM. Please complete these ASAP.\r\n" 
    };

module.exports = {
    auth,
    ui,
    url,
    scrapingInterval,
     transporter,
    emailInfo,
    proxyMode,
    fixedProxyUrl,
    dynamicProxySource
};