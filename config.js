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
    loginBackground: "", 
    loginLogo: "https://lh3.googleusercontent.com/sitesv/AAzXCkeKaUnyvXFGV95AG-3YMqRTQmovqwkJukjC79i4EHRCIOF3SWlkyKFIENJ2mWAWpNhCIHbDMGKpGvhAQs3GtIFbg1Mt-X-4IbEQIj00ykoV5WrRbqQa9ai5gDeBXDkyEUTdQgy3SH6JMkPJYimEXuZNcayvKoLHwWKjKDeO6apybOMQ8zTvgPJdZBOIk-piSc4OxXCChr2iVnoCZ9AFNCSXBOqtdsyH172W6z4=w1280",       
    loginTitle: "DVFB OSM Automation Manager" 
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