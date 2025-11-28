const nodemailer = require('nodemailer');

// --- AUTHENTICATION ---
const auth = {
    username: "admin",
    password: "password123", // Change this!
    sessionSecret: "change_this_to_a_random_string" 
};
// --- UI CUSTOMIZATIONEW] --- 
const ui = {
    // Path relative to 'public' folder (e.g., '/my-background.jpg') or a full URL
    loginBackground: "", 
    // Path relative to 'public' folder or full URL. Leave empty to hide.
    loginLogo: "",       
    // Title text displayed on the login form
    loginTitle: "FENZ OSM Manager" 
};


// Dashboard URL with user code
const url = 'https://www.dashboardlive.nz/index.php?user=your-user-code';

// --- SCRAPER CONFIGURATION ---
// Cache validity in minutes. 0 = always scrape (no cache).
const scrapingInterval = 60;

// --- EMAIL CONFIGURATION ---
// Replace these details with your specific email provider's settings.
// For Gmail, you often need to use an "App Password" instead of your login password.

const transporter = nodemailer.createTransport({
    service: 'gmail', // Use 'gmail' or provide host/port for other SMTP services
    auth: {
        user: 'sender@yourdomain.com', // Sender email address
        pass: ''      // Sender email password or App Password
    }
});
const emailInfo = {
      from: '"FENZ OSM Manager" <sender@yourdomain.com>', // Sender address
      subject: "FENZ OSM: Expiring Skills Notification",
      text: "Hello, you have expiring Skills due in OSM. Please complete these ASAP.\r\n" //trailing text
    };

module.exports = {
    auth,
    ui,
    url,
    transporter,
    emailInfo
};