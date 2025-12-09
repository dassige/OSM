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
    const publicPaths = ['/login.html', '/login', '/forgot-password', '/styles.css', '/ui-config', '/api/demo-credentials'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/socket.io/') || req.path.startsWith('/resources/') || req.path.startsWith('/demo/')) return next();
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

app.get('/api/demo-credentials', (req, res) => {
    if (config.appMode !== 'demo') {
        return res.status(403).json({ error: "Feature only available in DEMO mode." });
    }
    res.json({
        username: config.auth.username,
        password: config.auth.password
    });
});

app.get('/api/users', hasRole('admin'), async (req, res) => {
    try { res.json(await db.getUsers()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', hasRole('admin'), async (req, res) => {
    try {
        const { email, name, role } = req.body;
        if (!email || !name) return res.status(400).json({ error: "Missing fields" });

        const validRole = ['guest', 'simple', 'admin'].includes(role) ? role : 'simple';
        const generatedPassword = crypto.randomBytes(6).toString('hex');
        await db.addUser(email, name, generatedPassword, validRole);

        const prefs = await db.getPreferences();
        const template = safeParse(prefs.tpl_new_user);
        try {
            await sendNewAccountNotification(email, name, generatedPassword, config.transporter, config.ui.loginTitle, template);
        } catch (mailError) { console.error("Mail Error:", mailError); }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Created user ${email}`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', hasRole('admin'), async (req, res) => {
    try {
        const { name, email, role } = req.body;
        if (!name || !email || !role) return res.status(400).json({ error: "Missing fields" });
        const validRole = ['guest', 'simple', 'admin'].includes(role) ? role : 'simple';

        await db.updateUser(req.params.id, name, email, validRole);
        await db.logEvent(req.session.user.name, 'User Mgmt', `Updated user ${email}`, { id: req.params.id, name, email, role: validRole });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', hasRole('admin'), async (req, res) => {
    try {
        const userToDelete = await db.getUserById(req.params.id);
        if (!userToDelete) return res.status(404).json({ error: "User not found" });

        await db.deleteUser(req.params.id);
        const prefs = await db.getPreferences();
        const template = safeParse(prefs.tpl_delete_user);
        try {
            await sendAccountDeletionNotification(userToDelete.email, userToDelete.name, config.transporter, config.ui.loginTitle, template);
        } catch (e) { }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Deleted user ${userToDelete.email}`, { email: userToDelete.email });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/:id/reset', hasRole('admin'), async (req, res) => {
    try {
        const user = await db.getUserById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const tempPassword = crypto.randomBytes(6).toString('hex');
        await db.adminResetPassword(req.params.id, tempPassword);

        const prefs = await db.getPreferences();
        const template = safeParse(prefs.tpl_reset_password);
        try {
            await sendPasswordReset(user.email, tempPassword, config.transporter, config.ui.loginTitle, template);
        } catch (e) { }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Reset password for ${user.email}`, { email: user.email });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/profile', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (req.session.user.isEnvUser) return res.status(403).json({ error: "Super Admin from .env cannot change profile via web." });

        await db.updateUserProfile(req.session.user.id, name, password || null);
        req.session.user.name = name;
        await db.logEvent(req.session.user.name, 'Profile', `Updated own profile`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// 5. API ROUTES - MEMBERS
// =============================================================================

app.get('/api/members', async (req, res) => {
    try { res.json(await db.getMembers()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members', hasRole('admin'), async (req, res) => {
    try { const id = await db.addMember(req.body); await db.logEvent(req.session.user.name, 'Members', `Added ${req.body.name}`, req.body); res.json({ success: true, id }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members/import', hasRole('admin'), async (req, res) => {
    try { await db.bulkAddMembers(req.body); await db.logEvent(req.session.user.name, 'Members', `Imported ${req.body.length} members`, { count: req.body.length }); res.json({ success: true, count: req.body.length }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/members/:id', hasRole('admin'), async (req, res) => {
    try { await db.updateMember(req.params.id, req.body); await db.logEvent(req.session.user.name, 'Members', `Edited ${req.body.name}`, req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/members/:id', hasRole('admin'), async (req, res) => {
    try { await db.deleteMember(req.params.id); await db.logEvent(req.session.user.name, 'Members', `Deleted member ${req.params.id}`, { id: req.params.id }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members/bulk-delete', hasRole('admin'), async (req, res) => {
    try { await db.bulkDeleteMembers(req.body.ids); await db.logEvent(req.session.user.name, 'Members', `Deleted ${req.body.ids.length} members`, { ids: req.body.ids }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/members/discover', hasRole('admin'), async (req, res) => {
    try {
        const existing = new Set((await db.getMembers()).map(m => m.name));
        const raw = await getOIData(config.url, 0, currentProxy, console.log);
        const found = Array.from(new Set(raw.filter(r => r.name && !existing.has(r.name)).map(r => r.name))).sort();
        res.json(found);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// 6. API ROUTES - SKILLS
// =============================================================================

app.get('/api/skills', async (req, res) => {
    try { res.json(await db.getSkills()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills', hasRole('admin'), async (req, res) => {
    try { const id = await db.addSkill(req.body); await db.logEvent(req.session.user.name, 'Skills', `Added ${req.body.name}`, req.body); res.json({ success: true, id }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills/import', hasRole('admin'), async (req, res) => {
    try { await db.bulkAddSkills(req.body); await db.logEvent(req.session.user.name, 'Skills', `Imported ${req.body.length} skills`, { count: req.body.length }); res.json({ success: true, count: req.body.length }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/skills/:id', hasRole('admin'), async (req, res) => {
    try { await db.updateSkill(req.params.id, req.body); await db.logEvent(req.session.user.name, 'Skills', `Edited ${req.body.name}`, req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/skills/:id', hasRole('admin'), async (req, res) => {
    try { await db.deleteSkill(req.params.id); await db.logEvent(req.session.user.name, 'Skills', `Deleted skill ${req.params.id}`, { id: req.params.id }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills/bulk-delete', hasRole('admin'), async (req, res) => {
    try { await db.bulkDeleteSkills(req.body.ids); await db.logEvent(req.session.user.name, 'Skills', `Deleted ${req.body.ids.length} skills`, { ids: req.body.ids }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/skills/discover', hasRole('admin'), async (req, res) => {
    try {
        const existing = new Set((await db.getSkills()).map(s => s.name));
        const raw = await getOIData(config.url, 0, currentProxy, console.log);
        const found = Array.from(new Set(raw.filter(r => r.skill && !existing.has(r.skill)).map(r => r.skill))).sort();
        res.json(found);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// 7. API ROUTES - SYSTEM, PREFERENCES & LOGS
// =============================================================================

// System Tools
app.get('/api/system/backup', hasRole('superadmin'), async (req, res) => {
    const dbPath = db.getDbPath();
    const date = new Date().toISOString().split('T')[0];
    const filename = `fenz-osm-backup-v${require('./package.json').version}-${date}.db`;
    await db.logEvent(req.session.user.name, 'System', 'Database Backup Downloaded', { filename });
    res.download(dbPath, filename);
});

app.post('/api/system/restore', hasRole('superadmin'), upload.single('databaseFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    try {
        await db.verifyAndReplaceDb(req.file.path);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        await db.logEvent(req.session.user.name, 'System', 'Database Restored', {});
        res.json({ success: true, message: "Restored successfully." });
    } catch (e) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: e.message });
    }
});

// Logs
app.post('/api/logs', hasRole('simple'), async (req, res) => {
    try {
        await db.logEvent(req.session.user.name || req.session.user, req.body.type, req.body.title, req.body.payload);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/events', hasRole('admin'), async (req, res) => {
    try {
        const filters = {
            user: req.query.user || null, types: req.query.types ? req.query.types.split(',') : [],
            startDate: req.query.startDate, endDate: req.query.endDate,
            page: req.query.page, limit: req.query.limit
        };
        res.json(await db.getEventLogs(filters));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/events/meta', hasRole('admin'), async (req, res) => {
    try { res.json(await db.getEventLogMetadata()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/events/export', hasRole('admin'), async (req, res) => {
    try {
        const logs = await db.getEventLogsExport(req.query);
        const filename = `event_log_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(logs, null, 2));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/events/all', hasRole('superadmin'), async (req, res) => {
    try { await db.purgeEventLog(); await db.logEvent(req.session.user.name, 'System', 'Event Log Purged', {}); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/events/prune', hasRole('superadmin'), async (req, res) => {
    try {
        await db.pruneEventLog(parseInt(req.body.days));
        await db.logEvent(req.session.user.name, 'System', `Pruned events > ${req.body.days} days`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Preferences
app.get('/api/preferences', async (req, res) => { try { res.json(await db.getPreferences()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/preferences', hasRole('admin'), async (req, res) => { try { await db.savePreference(req.body.key, req.body.value); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/user-preferences', async (req, res) => { try { res.json(await db.getAllUserPreferences(req.session.user.id || 0)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/user-preferences', async (req, res) => { try { await db.saveUserPreference(req.session.user.id || 0, req.body.key, req.body.value); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });


// =============================================================================
// API ROUTES - TRAINING PLANNER
// =============================================================================

app.get('/api/training-sessions', hasRole('simple'), async (req, res) => {
    try {
        const { start, end } = req.query;
        // Basic ISO date validation could go here
        const sessions = await db.getTrainingSessions(start, end);
        res.json(sessions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/training-sessions', hasRole('simple'), async (req, res) => {
    try {
        const { date, skillName } = req.body;
        if (!date || !skillName) return res.status(400).json({ error: "Missing date or skill" });

        const id = await db.addTrainingSession(date, skillName);
        await db.logEvent(req.session.user.name, 'Training', `Scheduled ${skillName}`, { date });
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/training-sessions/:id', hasRole('simple'), async (req, res) => {
    try {
        await db.deleteTrainingSession(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Static
app.use(express.static('public'));

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
                // [UPDATED] Pass preference
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

// Helper for variable replacement in strings
function applyTemplate(template, vars) {
    let text = template || "";
    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        text = text.replace(regex, value || '');
    }
    return text;
}

// [UPDATED] Queue Processing Function
async function handleQueueProcessing(socket, targets, days, logger) {
    const currentUser = socket.request.session.user.name || socket.request.session.user;
    logger(`> Starting Notification Process for ${targets.length} members...`);
    socket.emit('progress-update', { type: 'progress-start', total: targets.length });

    try {
        // Load Data
        const dbMembers = await db.getMembers();
        const dbSkills = await db.getSkills();
        const prefs = await db.getPreferences();
        const trainingMap = await getTrainingMap();
        // Email Config
        const templateConfig = {
            from: prefs.emailFrom, subject: prefs.emailSubject, intro: prefs.emailIntro,
            rowHtml: prefs.emailRow, rowHtmlNoUrl: prefs.emailRowNoUrl, filterOnlyWithUrl: prefs.emailOnlyWithUrl
        };

        // [NEW] WhatsApp Config Defaults
        const waDefaults = {
            intro: "*Expiring Skills Notification*\n\nHello {{name}}, you have skills expiring in OSM:\n",
            row: "- *{{skill}}*\n  Expires: {{date}}\n  Link: {{url}}",
            rowNoUrl: "- *{{skill}}*\n  Expires: {{date}}"
        };
        const waIntroTpl = prefs.waIntro || waDefaults.intro;
        const waRowTpl = prefs.waRow || waDefaults.row;
        const waRowNoUrlTpl = prefs.waRowNoUrl || waDefaults.rowNoUrl;
        const waOnlyWithUrl = (prefs.waOnlyWithUrl === 'true' || prefs.waOnlyWithUrl === true);

        const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
        const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, days, trainingMap);
        let current = 0;

        for (const target of targets) {
            const member = processedMembers.find(m => m.name === target.name);

            if (!member) {
                logger(`   [Skipped] ${target.name} - Data not found in scrape results.`);
                continue;
            }

            if (member.expiringSkills.length > 0) {
                // 1. SEND EMAIL
                if (target.sendEmail) {
                    try {
                        const result = await sendNotification(member, templateConfig, config.transporter, false, logger, config.ui.loginTitle);
                        if (result) {
                            await db.logEmailAction(member, 'EMAIL_SENT', `${member.expiringSkills.length} skills`);
                            await db.logEvent(currentUser, 'Email', `Sent to ${member.name}`, { recipient: member.name, count: member.expiringSkills.length });
                        }
                    } catch (err) {
                        await db.logEmailAction(member, 'EMAIL_FAILED', err.message);
                    }
                }

                // 2. SEND WHATSAPP
                if (target.sendWa && config.enableWhatsApp) {
                    try {
                        // Filter Logic
                        let waSkills = member.expiringSkills;
                        if (waOnlyWithUrl) {
                            waSkills = waSkills.filter(s => !!s.url);
                        }

                        if (waSkills.length > 0) {
                            // Construct message
                            const memberVars = {
                                name: member.name.split(',')[1] || member.name,
                                appname: config.ui.loginTitle
                            };

                            let waText = applyTemplate(waIntroTpl, memberVars);

                            waSkills.forEach(s => {
                                //  Perform variable replacement on the URL
                                let finalUrl = s.url || "";
                                if (finalUrl) {
                                    finalUrl = finalUrl
                                        .replace(/{{member-name}}/g, encodeURIComponent(member.name))
                                        .replace(/{{member-email}}/g, encodeURIComponent(member.email));
                                }

                                const skillVars = {
                                    skill: s.skill,
                                    date: s.dueDate,
                                    url: finalUrl || "N/A",
                                    critical: s.isCritical ? "(CRITICAL)" : "",
                                    'next-planned-dates': s.nextPlannedDates || "None"
                                };
                                // Select template based on URL existence
                                const rowTpl = s.url ? waRowTpl : waRowNoUrlTpl;
                                waText += "\n" + applyTemplate(rowTpl, skillVars);
                            });
                            waText += `\n\nPlease complete these ASAP.`;

                            await whatsappService.sendMessage(member.mobile, waText);
                            logger(`   [WhatsApp] Message sent to ${member.name} (${member.mobile})`);
                            await db.logEmailAction(member, 'WA_SENT', 'WhatsApp Sent');
                            await db.logEvent(currentUser, 'WhatsApp', `Sent to ${member.name}`, { mobile: member.mobile });
                        } else {
                            logger(`   [Skipped WA] ${member.name} - No skills matched filter (Has URL Only).`);
                        }
                    } catch (err) {
                        logger(`   [WhatsApp ERROR] ${member.name}: ${err.message}`);
                        await db.logEmailAction(member, 'WA_FAILED', err.message);
                    }
                }
            } else {
                logger(`   [Skipped] ${member.name} - No relevant expiring skills found.`);
            }

            current++;
            socket.emit('progress-update', { type: 'progress-tick', current: current, total: targets.length, member: member.name });
            // Pause between members to be polite
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        logger(`> Process completed.`);
        socket.emit('script-complete', 0);

    } catch (error) {
        logger(`FATAL ERROR: ${error.message}`);
        socket.emit('script-complete', 1);
    }
}
// Helper: Get Training Map
async function getTrainingMap() {
    const sessions = await db.getAllFutureTrainingSessions();
    const map = {};
    sessions.forEach(s => {
        if (!map[s.skill_name]) map[s.skill_name] = [];
        // Format date nicely (optional) or keep ISO
        map[s.skill_name].push(s.date);
    });
    return map;
}
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`> App Mode: ${(config.appMode || 'PRODUCTION').toUpperCase()}`);
});