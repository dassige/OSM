// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// --- Services & Config ---
const config = require('./config.js');
const db = require('./services/db');
const { findWorkingNZProxy } = require('./services/proxy-manager');
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const {
    sendNotification,
    sendPasswordReset,
    sendNewAccountNotification,
    sendAccountDeletionNotification
} = require('./services/mailer');
// Import WhatsApp Service
const whatsappService = require('./services/whatsapp-service');
const puppeteer = require('puppeteer-core');
const reportService = require('./services/report-service');
const formsService = require('./services/forms-service');

// =============================================================================
// 1. INITIALIZATION & MIDDLEWARE
// =============================================================================

const app = express();
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

// Initialize Socket.IO instance here
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// Helper: Safely parse JSON
function safeParse(jsonString) {
    try { return JSON.parse(jsonString); } catch (e) { return null; }
}

// Session Setup
const sessionMiddleware = session({
    secret: config.auth?.sessionSecret || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if behind HTTPS proxy
});

app.use(sessionMiddleware);
app.use(express.json());

// Initialize DB & Proxy
db.initDB().catch(err => console.error("DB Init Error:", err));

// Initialize WhatsApp Service
whatsappService.init(io, db.logEvent);

if (config.enableWhatsApp) {
    whatsappService.startClient();
}
let currentProxy = null;
async function initializeProxy() {
    if (config.proxyMode === 'fixed') currentProxy = config.fixedProxyUrl;
    else if (config.proxyMode === 'dynamic') currentProxy = await findWorkingNZProxy(console.log);
    else currentProxy = null;
}
initializeProxy();

// =============================================================================
// 2. AUTH & ROLE MIDDLEWARE
// =============================================================================

const ROLES = { guest: 0, simple: 1, admin: 2, superadmin: 3 };

const hasRole = (requiredRole) => (req, res, next) => {
    const userRoleStr = req.session?.user?.role || 'guest';
    const userLevel = ROLES[userRoleStr] !== undefined ? ROLES[userRoleStr] : 0;
    const requiredLevel = ROLES[requiredRole];
    if (userLevel >= requiredLevel) next();
    else res.status(403).json({ error: `Forbidden: Requires ${requiredRole} access.` });
};

// =============================================================================
// 3. API ROUTES - AUTHENTICATION
// =============================================================================

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Check Superadmin (Env)
    if (username === config.auth.username && password === config.auth.password) {
        req.session.loggedIn = true;
        req.session.user = {
            name: 'Super Admin', email: username, role: 'superadmin', isAdmin: true, isEnvUser: true
        };
        return res.status(200).send({ success: true });
    }

    // Check DB Users
    try {
        const user = await db.authenticateUser(username, password);
        if (user) {
            req.session.loggedIn = true;
            req.session.user = {
                id: user.id, name: user.name, email: user.email, role: user.role, isAdmin: user.role === 'admin'
            };
            return res.status(200).send({ success: true });
        }
    } catch (e) { console.error("Login DB error:", e); }

    return res.status(401).send({ error: "Invalid credentials" });
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (email === config.auth.username) return res.status(400).json({ error: "Cannot reset Super Admin password via email." });

    try {
        const user = await db.getUserByEmail(email);
        if (!user) return res.status(404).json({ error: "User not found." });

        const tempPassword = crypto.randomBytes(4).toString('hex');
        await db.adminResetPassword(user.id, tempPassword);
        await sendPasswordReset(email, tempPassword, config.transporter);
        await db.logEvent('System', 'Security', `Password reset requested for ${email}`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Failed to reset password." }); }
});

// Logout with Auto-Disconnect Check
app.get('/logout', async (req, res) => {
    try {
        if (req.session && req.session.user && req.session.user.id) {
            const prefs = await db.getAllUserPreferences(req.session.user.id);
            if (prefs.wa_auto_disconnect === 'true') {
                console.log(`[Logout] Auto-disconnecting WhatsApp for user ${req.session.user.name}`);
                await whatsappService.logout();
            }
        }
    } catch (e) {
        console.error("Logout cleanup error:", e);
    }

    req.session.destroy();
    res.redirect('/login.html');
});

app.get('/api/user-session', (req, res) => {
    if (req.session && req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: "Not logged in" });
});

// --- GLOBAL ROUTE GUARD ---
app.use((req, res, next) => {
    const publicPaths = [
        '/login.html', '/login', '/forgot-password', '/styles.css', '/ui-config', '/api/demo-credentials',
        '/forms-view.html', // Public viewer page
        '/public/js/toast.js', '/public/theme.js' // Ensure dependencies are loaded
    ];

    if (publicPaths.includes(req.path) ||
        req.path.startsWith('/socket.io/') ||
        req.path.startsWith('/resources/') ||
        req.path.startsWith('/demo/') ||
        req.path.startsWith('/api/forms/public/') // Allow public API access
    ) return next();

    if (req.session && req.session.loggedIn) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: "Unauthorized" });
    return res.redirect('/login.html');
});

app.get('/ui-config', (req, res) => res.json({
    ...config.ui,
    appMode: config.appMode
}));

// --- PAGE ACCESS CONTROL ---
app.get('/system-tools.html', (req, res, next) => {
    if (req.session?.user?.role === 'superadmin') next(); else res.redirect('/');
});
app.get('/users.html', (req, res, next) => {
    const r = req.session?.user?.role;
    if (r === 'admin' || r === 'superadmin') next(); else res.redirect('/');
});
app.get('/event-log.html', (req, res, next) => {
    const r = req.session?.user?.role;
    if (r === 'admin' || r === 'superadmin') next(); else res.redirect('/');
});
app.get('/third-parties.html', (req, res, next) => {
    const r = req.session?.user?.role;
    if (r === 'admin' || r === 'superadmin') next(); else res.redirect('/');
});
app.get('/templates.html', (req, res, next) => {
    const r = req.session?.user?.role;
    if (r === 'admin' || r === 'superadmin') next(); else res.redirect('/');
});

// =============================================================================
// 4. API ROUTES - USER MANAGEMENT & PROFILE
// =============================================================================

// ... (User routes omitted for brevity, they are unchanged) ...
// ... (Copy existing user management routes here if re-uploading full file, otherwise assume existing)

// =============================================================================
// 5. API ROUTES - MEMBERS & SKILLS (Omitted for brevity, unchanged)
// =============================================================================

// ...

// =============================================================================
// 7. API ROUTES - SYSTEM (Omitted for brevity, unchanged)
// =============================================================================

// ...

// =============================================================================
// API ROUTES - FORMS MANAGEMENT
// =============================================================================

// List all forms (Lightweight payload)
app.get('/api/forms', hasRole('admin'), async (req, res) => {
    try {
        res.json(await formsService.getAllForms());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// [NEW] Export ALL Forms (Add this block)
app.get('/api/forms/export/all', hasRole('admin'), async (req, res) => {
    try {
        const forms = await formsService.getAllFormsFull();
        const filename = `all_forms_export_${new Date().toISOString().split('T')[0]}.json`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(forms, null, 2));
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// [NEW] Import ALL Forms (Bulk) (Add this block)
app.post('/api/forms/import/all', hasRole('admin'), upload.single('formsFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const data = JSON.parse(fileContent);

        // Basic Compatibility Check
        if (!Array.isArray(data)) {
            throw new Error("Invalid file format. Expected a JSON array of forms.");
        }
        // Check first item structure roughly
        if (data.length > 0 && (!data[0].name || !data[0].structure)) {
             throw new Error("Invalid form data structure in import file.");
        }

        await formsService.importBulkForms(data);
        fs.unlinkSync(req.file.path);

        await db.logEvent(req.session.user.name, 'Forms', `Bulk Imported ${data.length} forms`, {});
        res.json({ success: true, count: data.length });

    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: "Import failed: " + e.message });
    }
});

// Get single form details (Ensure this comes AFTER specific paths like /export/all)
app.get('/api/forms/:id', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: "Unauthorized" });
    try {
        const form = await formsService.getFormById(req.params.id);
        if (!form) return res.status(404).json({ error: "Form not found" });
        res.json(form);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Create new form
app.post('/api/forms', hasRole('admin'), async (req, res) => {
    try {
        const { name, status, intro, structure } = req.body;
        if (!name) return res.status(400).json({ error: "Form name is required" });

        const id = await formsService.createForm(name, status, intro, structure);
        await db.logEvent(req.session.user.name, 'Forms', `Created form: ${name}`, { id });
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update form
app.put('/api/forms/:id', hasRole('admin'), async (req, res) => {
    try {
        await formsService.updateForm(req.params.id, req.body);
        await db.logEvent(req.session.user.name, 'Forms', `Updated form ID: ${req.params.id}`, {});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete form
app.delete('/api/forms/:id', hasRole('admin'), async (req, res) => {
    try {
        await formsService.deleteForm(req.params.id);
        await db.logEvent(req.session.user.name, 'Forms', `Deleted form ID: ${req.params.id}`, {});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export Single Form
app.get('/api/forms/:id/export', hasRole('admin'), async (req, res) => {
    try {
        const form = await formsService.getFormById(req.params.id);
        if (!form) return res.status(404).send("Form not found");

        const filename = `form_export_${form.id}_${form.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');

        const exportData = {
            name: form.name,
            intro: form.intro,
            status: form.status,
            structure: form.structure
        };

        res.send(JSON.stringify(exportData, null, 2));
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Import Single Form (Create New from File)
// Note: This endpoint creates a NEW form. 
// For "Load into Editor", the frontend reads the file and populates the UI, then calls PUT/POST.
app.post('/api/forms/import', hasRole('admin'), upload.single('formFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.name || !Array.isArray(data.structure)) {
            throw new Error("Invalid form structure file.");
        }

        const id = await formsService.createForm(data.name, data.status, data.intro, data.structure);
        fs.unlinkSync(req.file.path);

        await db.logEvent(req.session.user.name, 'Forms', `Imported form: ${data.name}`, { id });
        res.json({ success: true, id });

    } catch (e) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: "Import failed: " + e.message });
    }
});

app.get('/api/forms/public/:publicId', async (req, res) => {
    try {
        const form = await formsService.getFormByPublicId(req.params.publicId);
        if (!form) return res.status(404).json({ error: "Form not found" });
        
        res.json({
            name: form.name,
            intro: form.intro,
            status: form.status,
            structure: form.structure
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Static
app.use(express.static('public'));

// ... (Socket.IO section unchanged) ...
// =============================================================================
// 8. SOCKET.IO EVENTS
// =============================================================================

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use((socket, next) => {
    if (socket.request.session && socket.request.session.loggedIn) next(); else next(new Error("unauthorized"));
});

io.on('connection', (socket) => {
    const logger = (msg) => { process.stdout.write(msg + '\n'); socket.emit('terminal-output', msg + '\n'); };
    const userRole = socket.request.session.user?.role || 'guest';
    const userLevel = ROLES[userRole] || 0;

    socket.on('get-preferences', async () => {
        try { socket.emit('preferences-data', await db.getAllUserPreferences(socket.request.session.user.id || 0)); } catch (e) { }
    });

    socket.on('update-preference', async ({ key, value }) => {
        if (userLevel < ROLES.simple) return logger("Unauthorized: Guest cannot save preferences.");
        try { await db.saveUserPreference(socket.request.session.user.id || 0, key, value); } catch (e) { }
    });

    //  WhatsApp Management Events
    socket.on('wa-get-status', () => {
        if (userLevel >= ROLES.simple) {
            socket.emit('wa-status-data', whatsappService.getStatus());
        }
    });

    socket.on('wa-control', (action) => {
        if (userLevel < ROLES.admin) return;
        if (action === 'start') whatsappService.startClient();
        if (action === 'stop') whatsappService.logout();
    });

    socket.on('wa-send-test', async (data) => {
        if (userLevel < ROLES.admin) return;
        const currentUser = socket.request.session.user.name || socket.request.session.user;
        try {
            logger(`[WhatsApp] Sending test message to ${data.mobile}...`);
            await whatsappService.sendMessage(data.mobile, data.message);

            await db.logEvent(currentUser, 'WhatsApp', 'Test Message Sent', { mobile: data.mobile, messageSnippet: data.message.substring(0, 20) });

            socket.emit('wa-test-result', { success: true, message: 'Test message sent successfully.' });
        } catch (err) {
            logger(`[WhatsApp] Test failed: ${err.message}`);
            await db.logEvent(currentUser, 'WhatsApp', 'Test Message Failed', { mobile: data.mobile, error: err.message });
            socket.emit('wa-test-result', { success: false, error: err.message });
        }
    });

    socket.on('view-expiring-skills', async (days, forceRefresh = false) => {
        const daysThreshold = parseInt(days) || 30;
        const interval = forceRefresh ? 0 : (config.scrapingInterval || 60);

        logger(`> Fetching View Data (Threshold: ${daysThreshold} days${forceRefresh ? ', Force Refresh' : ', Cached OK'})...`);
        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const rawData = await getOIData(config.url, interval, currentProxy, logger);

            const trainingMap = await getTrainingMap();
            const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold, trainingMap);
            const results = processedMembers.map(m => ({
                name: m.name,
                email: m.email,
                mobile: m.mobile,
                messengerId: m.messengerId,
                notificationPreference: m.notificationPreference,
                skills: m.expiringSkills.map(s => ({
                    skill: s.skill, dueDate: s.dueDate, hasUrl: !!s.url, isCritical: !!s.isCritical
                })),
                emailEligible: m.expiringSkills.length > 0
            }));
            socket.emit('expiring-skills-data', results);
            socket.emit('script-complete', 0);
        } catch (error) { logger(`Error: ${error.message}`); socket.emit('script-complete', 1); }
    });

    socket.on('run-process-queue', async (targets, days) => {
        if (userLevel < ROLES.simple) {
            socket.emit('terminal-output', 'Error: Guests cannot send notifications.\n');
            socket.emit('script-complete', 1);
            return;
        }
        await handleQueueProcessing(socket, targets, parseInt(days) || 30, logger);
    });
    socket.on('run-send-single', async (memberName, days) => {
        if (userLevel < ROLES.simple) {
            socket.emit('terminal-output', 'Error: Guests cannot send emails.\n');
            socket.emit('script-complete', 1);
            return;
        }
        await handleEmailSending(socket, [memberName], parseInt(days) || 30, logger, true);
    });
});

function applyTemplate(template, vars) {
    let text = template || "";
    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        text = text.replace(regex, value || '');
    }
    return text;
}

async function handleQueueProcessing(socket, targets, days, logger) {
    const currentUser = socket.request.session.user.name || socket.request.session.user;
    logger(`\n[DEBUG] --- Report Process Started ---`);
    logger(`[DEBUG] User: ${currentUser}`);
    
    // ... (This function logic remains the same as provided previously)
    // Placeholder to avoid repeating 300 lines of existing logic
    // Assume the rest of handleQueueProcessing is here...
}

// Helper: Get Training Map
async function getTrainingMap() {
    const sessions = await db.getAllFutureTrainingSessions();
    const map = {};
    sessions.forEach(s => {
        if (!map[s.skill_name]) map[s.skill_name] = [];
        map[s.skill_name].push(s.date);
    });
    return map;
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`> App Mode: ${(config.appMode || 'PRODUCTION').toUpperCase()}`);
});