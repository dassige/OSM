require('dotenv').config(); // Load environment variables

const nodemailer = require('nodemailer');

// --- AUTHENTICATION ---
const auth = {
    username: process.env.APP_USERNAME ,
    password: process.env.APP_PASSWORD ,
    sessionSecret: process.env.SESSION_SECRET 
};

// --- UI CUSTOMIZATION --- 
const ui = {
    // Points to public/resources/background_logo.png
    loginBackground: "resources/background_logo.png", 
    // Points to public/resources/logo.png
    loginLogo: "resources/logo.png",       
    loginTitle: "FENZ OSM Automation Manager" 
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

const emailInfo = {
      from: process.env.EMAIL_FROM || '"FENZ OSM Manager" <sender@yourdomain.com>',
      subject: "FENZ OSM: Expiring Skills Notification",
      text: "Hello, you have expiring Skills due in OSM. Please complete these ASAP.\r\n" 
    };

module.exports = {
    auth,
    ui,
    url,
    scrapingInterval,
    transporter,
    emailInfo
};