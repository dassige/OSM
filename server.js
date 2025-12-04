// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Helper to safely parse JSON prefs
function safeParse(jsonString) {
    try { return JSON.parse(jsonString); } catch (e) { return null; }
}
// Configuration
const config = require('./config.js');
const { findWorkingNZProxy } = require('./services/proxy-manager');

// Services
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const {
    sendNotification,
    sendPasswordReset,
    sendNewAccountNotification,
    sendAccountDeletionNotification
} = require('./services/mailer'); const db = require('./services/db');

const app = express();
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

// Configure Session Middleware
const sessionMiddleware = session({
    secret: config.auth?.sessionSecret || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if running behind HTTPS proxy
});

app.use(sessionMiddleware);
app.use(express.json());

// Initialize Socket.IO
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

// Socket.IO Auth Middleware
io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.loggedIn) {
        next();
    } else {
        next(new Error("unauthorized"));
    }
});

// Initialize DB
db.initDB().catch(err => console.error("DB Init Error:", err));

// --- ROLE MIDDLEWARE ---
const ROLES = {
    guest: 0,
    simple: 1,
    admin: 2,
    superadmin: 3
};

const hasRole = (requiredRole) => (req, res, next) => {
    const userRoleStr = req.session?.user?.role || 'guest';
    const userLevel = ROLES[userRoleStr] !== undefined ? ROLES[userRoleStr] : 0;
    const requiredLevel = ROLES[requiredRole];

    if (userLevel >= requiredLevel) {
        next();
    } else {
        res.status(403).json({ error: `Forbidden: Requires ${requiredRole} access.` });
    }
};

// --- AUTHENTICATION ROUTES ---

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // 1. Check Superadmin (from .env)
    if (username === config.auth.username && password === config.auth.password) {
        req.session.loggedIn = true;
        req.session.user = {
            name: 'Super Admin',
            email: username,
            role: 'superadmin',
            isAdmin: true,
            isEnvUser: true
        };
        return res.status(200).send({ success: true });
    }

    // 2. Check Database Users
    try {
        const user = await db.authenticateUser(username, password);
        if (user) {
            req.session.loggedIn = true;
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isAdmin: user.role === 'admin'
            };
            return res.status(200).send({ success: true });
        }
    } catch (e) {
        console.error("Login DB error:", e);
    }

    return res.status(401).send({ error: "Invalid credentials" });
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (email === config.auth.username) {
        return res.status(400).json({ error: "Cannot reset Super Admin password via email." });
    }
    try {
        const user = await db.getUserByEmail(email);
        if (!user) return res.status(404).json({ error: "User not found." });

        const tempPassword = crypto.randomBytes(4).toString('hex');
        await db.adminResetPassword(user.id, tempPassword);
        await sendPasswordReset(email, tempPassword, config.transporter);

        await db.logEvent('System', 'Security', `Password reset requested for ${email}`, {});
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to reset password." });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

app.get('/api/user-session', (req, res) => {
    if (req.session && req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// Protect Routes Middleware
app.use((req, res, next) => {
    const publicPaths = ['/login.html', '/login', '/forgot-password', '/styles.css', '/ui-config'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/socket.io/') || req.path.startsWith('/resources/')) {
        return next();
    }
    if (req.session && req.session.loggedIn) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect('/login.html');
});

app.get('/ui-config', (req, res) => res.json(config.ui || {}));

// --- PAGE PROTECTION (Static HTML) ---
// Must come BEFORE express.static to intercept the file request

app.get('/system-tools.html', (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'superadmin') next();
    else res.redirect('/');
});

app.get('/users.html', (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'admin' || role === 'superadmin') next();
    else res.redirect('/');
});

// [NEW] Protect Event Log Page
app.get('/event-log.html', (req, res, next) => {
    const role = req.session?.user?.role;
    // Simple and Guest cannot see this page
    if (role === 'admin' || role === 'superadmin') next();
    else res.redirect('/');
});

// --- API: USER MANAGEMENT ---

app.get('/api/users', hasRole('admin'), async (req, res) => {
    try {
        const users = await db.getUsers();
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
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
        const id = req.params.id;
        const { name, email, role } = req.body;
        if (!name || !email || !role) return res.status(400).json({ error: "Missing fields" });

        const validRoles = ['guest', 'simple', 'admin'];
        const roleToSave = validRoles.includes(role) ? role : 'simple';

        await db.updateUser(id, name, email, roleToSave);
        await db.logEvent(req.session.user.name, 'User Mgmt', `Updated user ${email}`, { id, name, email, role: roleToSave });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', hasRole('admin'), async (req, res) => {
    try {
        const id = req.params.id;
        const userToDelete = await db.getUserById(id);
        if (!userToDelete) return res.status(404).json({ error: "User not found" });

        await db.deleteUser(id);
        const prefs = await db.getPreferences();
        const template = safeParse(prefs.tpl_delete_user);
        try {
            await sendAccountDeletionNotification(userToDelete.email, userToDelete.name, config.transporter, config.ui.loginTitle, template);
        } catch (mailError) { console.error("Mail Error:", mailError); }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Deleted user ${userToDelete.email}`, { email: userToDelete.email, id: id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/:id/reset', hasRole('admin'), async (req, res) => {
    try {
        const id = req.params.id;
        const user = await db.getUserById(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const tempPassword = crypto.randomBytes(6).toString('hex');
        await db.adminResetPassword(id, tempPassword);
        const prefs = await db.getPreferences();
        const template = safeParse(prefs.tpl_reset_password);
        try {
            await sendPasswordReset(user.email, tempPassword, config.transporter, config.ui.loginTitle, template);
        } catch (mailError) { console.error("Mail Error:", mailError); }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Reset password for ${user.email}`, { email: user.email });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: PROFILE ---
app.put('/api/profile', async (req, res) => {
    try {
        const { name, password } = req.body;
        const currentUser = req.session.user;
        if (currentUser.isEnvUser) return res.status(403).json({ error: "Super Admin from .env cannot change profile via web." });

        await db.updateUserProfile(currentUser.id, name, password || null);
        req.session.user.name = name;
        await db.logEvent(currentUser.name, 'Profile', `Updated own profile`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: LOGGING ---
app.post('/api/logs', hasRole('simple'), async (req, res) => {
    try {
        const { type, title, payload } = req.body;
        const username = req.session.user.name || req.session.user;
        await db.logEvent(username, type, title, payload);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [UPDATED] Restrict Event Log Data
app.get('/api/events', hasRole('admin'), async (req, res) => {
    try {
        const filters = {
            user: req.query.user || null,
            types: req.query.types ? req.query.types.split(',') : [],
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null,
            page: req.query.page || 1,
            limit: req.query.limit || 50
        };
        const result = await db.getEventLogs(filters);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [UPDATED] Restrict Event Metadata
app.get('/api/events/meta', hasRole('admin'), async (req, res) => {
    try {
        const meta = await db.getEventLogMetadata();
        res.json(meta);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events/export', hasRole('admin'), async (req, res) => {
    try {
        const filters = { /* ... similar params ... */ };
        // Simplified for brevity, same logic as above
        const logs = await db.getEventLogsExport(req.query);
        const filename = `event_log_export_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(logs, null, 2));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/events/all', hasRole('superadmin'), async (req, res) => {
    try {
        await db.purgeEventLog();
        await db.logEvent(req.session.user.name, 'System', 'Event Log Purged', {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/events/prune', hasRole('superadmin'), async (req, res) => {
    try {
        const days = parseInt(req.body.days);
        if (isNaN(days) || days < 0) return res.status(400).json({ error: "Invalid days value" });
        await db.pruneEventLog(days);
        await db.logEvent(req.session.user.name, 'System', `Pruned events older than ${days} days`, { days });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: PREFERENCES ---
app.get('/api/user-preferences', async (req, res) => {
    try {
        const userId = req.session.user.id || 0;
        const prefs = await db.getAllUserPreferences(userId);
        res.json(prefs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/user-preferences/:key', async (req, res) => {
    try {
        const userId = req.session.user.id || 0;
        const value = await db.getUserPreference(userId, req.params.key);
        res.json({ value });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/user-preferences', async (req, res) => {
    try {
        const { key, value } = req.body;
        const userId = req.session.user.id || 0;
        await db.saveUserPreference(userId, key, value);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/preferences', async (req, res) => {
    try {
        const prefs = await db.getPreferences();
        res.json(prefs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/preferences', hasRole('admin'), async (req, res) => {
    try {
        const { key, value } = req.body;
        await db.savePreference(key, value);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: MEMBERS (Protected) ---
app.get('/api/members', async (req, res) => {
    try { const members = await db.getMembers(); res.json(members); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members', hasRole('admin'), async (req, res) => {
    try { const id = await db.addMember(req.body); await db.logEvent(req.session.user.name, 'Members', `Added ${req.body.name}`, req.body); res.json({ success: true, id }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members/import', hasRole('admin'), async (req, res) => {
    try { await db.bulkAddMembers(req.body); await db.logEvent(req.session.user.name, 'Members', `Imported ${req.body.length} members`, { count: req.body.length }); res.json({ success: true, count: req.body.length }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/members/bulk-delete', hasRole('admin'), async (req, res) => {
    try { await db.bulkDeleteMembers(req.body.ids); await db.logEvent(req.session.user.name, 'Members', `Deleted ${req.body.ids.length} members`, { ids: req.body.ids }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/members/:id', hasRole('admin'), async (req, res) => {
    try { await db.updateMember(req.params.id, req.body); await db.logEvent(req.session.user.name, 'Members', `Edited ${req.body.name}`, req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/members/:id', hasRole('admin'), async (req, res) => {
    try { await db.deleteMember(req.params.id); await db.logEvent(req.session.user.name, 'Members', `Deleted member ID ${req.params.id}`, { id: req.params.id }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SKILLS (Protected) ---
app.get('/api/skills', async (req, res) => {
    try { const skills = await db.getSkills(); res.json(skills); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills', hasRole('admin'), async (req, res) => {
    try { const id = await db.addSkill(req.body); await db.logEvent(req.session.user.name, 'Skills', `Added ${req.body.name}`, req.body); res.json({ success: true, id }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills/import', hasRole('admin'), async (req, res) => {
    try { await db.bulkAddSkills(req.body); await db.logEvent(req.session.user.name, 'Skills', `Imported ${req.body.length} skills`, { count: req.body.length }); res.json({ success: true, count: req.body.length }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/skills/bulk-delete', hasRole('admin'), async (req, res) => {
    try { await db.bulkDeleteSkills(req.body.ids); await db.logEvent(req.session.user.name, 'Skills', `Deleted ${req.body.ids.length} skills`, { ids: req.body.ids }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/skills/:id', hasRole('admin'), async (req, res) => {
    try { await db.updateSkill(req.params.id, req.body); await db.logEvent(req.session.user.name, 'Skills', `Edited ${req.body.name}`, req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/skills/:id', hasRole('admin'), async (req, res) => {
    try { await db.deleteSkill(req.params.id); await db.logEvent(req.session.user.name, 'Skills', `Deleted skill ID ${req.params.id}`, { id: req.params.id }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: DISCOVERY ---
app.get('/api/skills/discover', hasRole('admin'), async (req, res) => {
    try {
        const existingSkills = await db.getSkills();
        const existingNames = new Set(existingSkills.map(s => s.name));
        const rawData = await getOIData(config.url, 0, currentProxy, console.log);
        const foundSkills = new Set();
        rawData.forEach(record => { if (record.skill && !existingNames.has(record.skill)) foundSkills.add(record.skill); });
        res.json(Array.from(foundSkills).sort());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/members/discover', hasRole('admin'), async (req, res) => {
    try {
        const existingMembers = await db.getMembers();
        const existingNames = new Set(existingMembers.map(m => m.name));
        const rawData = await getOIData(config.url, 0, currentProxy, console.log);
        const foundMembers = new Set();
        rawData.forEach(record => { if (record.name && !existingNames.has(record.name)) foundMembers.add(record.name); });
        res.json(Array.from(foundMembers).sort());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SYSTEM TOOLS ---
app.get('/api/system/backup', hasRole('superadmin'), async (req, res) => {
    const dbPath = db.getDbPath();
    const date = new Date().toISOString().split('T')[0];
    const domain = req.get('host').replace(/[:\/]/g, '-');
    const packageJson = require('./package.json');
    const filename = `fenz-osm-backup-v${packageJson.version}-${date}-${domain}.db`;
    await db.logEvent(req.session.user.name, 'System', 'Database Backup Downloaded', { filename });
    res.download(dbPath, filename, (err) => { if (err && !res.headersSent) res.status(500).send("Error"); });
});

app.post('/api/system/restore', hasRole('superadmin'), upload.single('databaseFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const tempPath = req.file.path;
    try {
        await db.verifyAndReplaceDb(tempPath);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        await db.logEvent(req.session.user.name, 'System', 'Database Restored', { originalname: req.file.originalname });
        res.json({ success: true, message: "Database restored successfully." });
    } catch (e) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(500).json({ error: e.message });
    }
});

// Static Files
app.use(express.static('public'));

// --- PROXY ---
let currentProxy = null;
async function initializeProxy() {
    if (config.proxyMode === 'fixed') currentProxy = config.fixedProxyUrl;
    else if (config.proxyMode === 'dynamic') currentProxy = await findWorkingNZProxy(console.log);
    else currentProxy = null;
}
initializeProxy();

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    const logger = (msg) => { process.stdout.write(msg + '\n'); socket.emit('terminal-output', msg + '\n'); };
    const userRole = socket.request.session.user?.role || 'guest';
    const userLevel = ROLES[userRole] || 0;

    socket.on('get-preferences', async () => {
        try {
            const userId = socket.request.session.user.id || 0;
            const prefs = await db.getAllUserPreferences(userId);
            socket.emit('preferences-data', prefs);
        } catch (e) { logger(e.message); }
    });

    socket.on('update-preference', async ({ key, value }) => {
        if (userLevel < ROLES.simple) return logger("Unauthorized: Guest cannot save preferences.");
        try {
            const userId = socket.request.session.user.id || 0;
            await db.saveUserPreference(userId, key, value);
        } catch (e) { logger(e.message); }
    });

    socket.on('view-expiring-skills', async (days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Fetching View Data (Threshold: ${daysThreshold} days)...`);
        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
            const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold);
            const results = processedMembers.map(m => ({
                name: m.name,
                skills: m.expiringSkills.map(s => ({
                    skill: s.skill, dueDate: s.dueDate, hasUrl: !!s.url, isCritical: !!s.isCritical
                })),
                emailEligible: m.expiringSkills.length > 0
            }));
            socket.emit('expiring-skills-data', results);
            socket.emit('script-complete', 0);
        } catch (error) { logger(`Error: ${error.message}`); socket.emit('script-complete', 1); }
    });

    socket.on('run-send-selected', async (selectedNames, days) => {
        if (userLevel < ROLES.simple) {
            socket.emit('terminal-output', 'Error: Guests cannot send emails.\n');
            socket.emit('script-complete', 1);
            return;
        }
        const daysThreshold = parseInt(days) || 30;
        const currentUser = socket.request.session.user.name || socket.request.session.user;
        logger(`> Starting Email Process (User: ${currentUser})...`);
        socket.emit('progress-update', { type: 'progress-start', total: selectedNames.length });

        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const prefs = await db.getPreferences();
            const templateConfig = {
                from: prefs.emailFrom, subject: prefs.emailSubject, intro: prefs.emailIntro,
                rowHtml: prefs.emailRow, rowHtmlNoUrl: prefs.emailRowNoUrl, filterOnlyWithUrl: prefs.emailOnlyWithUrl
            };
            const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
            const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold);
            const targets = processedMembers.filter(m => selectedNames.includes(m.name));

            let current = 0;
            for (const member of targets) {
                if (member.expiringSkills.length > 0) {
                    try {
                        const result = await sendNotification(member, templateConfig, config.transporter, false, logger, config.ui.loginTitle);
                        if (result) {
                            await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills`);
                            await db.logEvent(currentUser, 'Email', `Sent to ${member.name} at ${member.email}`, {
                                recipient: member.name, email: member.email, skillsCount: member.expiringSkills.length, emailBody: result.html
                            });
                        } else {
                            logger(`   [Skipped] ${member.name} - No skills remaining after filters.`);
                        }
                    } catch (err) { await db.logEmailAction(member, 'FAILED', err.message); throw err; }
                }
                current++;
                socket.emit('progress-update', { type: 'progress-tick', current: current, total: targets.length, member: member.name });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            logger(`> All operations completed.`);
            socket.emit('script-complete', 0);
        } catch (error) { logger(`FATAL ERROR: ${error.message}`); socket.emit('script-complete', 1); }
    });

    socket.on('run-send-single', async (memberName, days) => {
        if (userLevel < ROLES.simple) {
            socket.emit('terminal-output', 'Error: Guests cannot send emails.\n');
            socket.emit('script-complete', 1);
            return;
        }
        const daysThreshold = parseInt(days) || 30;
        const currentUser = socket.request.session.user.name || socket.request.session.user;
        logger(`> Sending Single Email to ${memberName}...`);
        socket.emit('progress-update', { type: 'progress-start', total: 1 });

        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const prefs = await db.getPreferences();
            const templateConfig = {
                from: prefs.emailFrom, subject: prefs.emailSubject, intro: prefs.emailIntro,
                rowHtml: prefs.emailRow, rowHtmlNoUrl: prefs.emailRowNoUrl, filterOnlyWithUrl: prefs.emailOnlyWithUrl
            };
            const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
            const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold);
            const member = processedMembers.find(m => m.name === memberName);

            if (member && member.expiringSkills.length > 0) {
                try {
                    const result = await sendNotification(member, templateConfig, config.transporter, false, logger, config.ui.loginTitle);
                    if (result) {
                        await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills (Manual Single)`);
                        await db.logEvent(currentUser, 'Email', `Sent SINGLE email to ${member.name}`, {
                            recipient: member.name, skillsCount: member.expiringSkills.length, mode: 'Single'
                        });
                        logger(`> Email sent successfully to ${member.name}.`);
                    } else { logger(`> Skipped: No actionable skills found for ${member.name}.`); }
                } catch (err) { await db.logEmailAction(member, 'FAILED', err.message); logger(`> Failed: ${err.message}`); }
            } else { logger(`> Error: Member not found or no expiring skills.`); }
            socket.emit('progress-update', { type: 'progress-tick', current: 1, total: 1, member: memberName });
            socket.emit('script-complete', 0);
        } catch (error) { logger(`FATAL ERROR: ${error.message}`); socket.emit('script-complete', 1); }
    });
});

const PORT = 3000;
server.listen(PORT, () => { console.log(`Server running at http://localhost:${PORT}`); });