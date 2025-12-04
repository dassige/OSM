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

// =============================================================================
// 1. INITIALIZATION & MIDDLEWARE
// =============================================================================

const app = express();
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

// [FIX] Initialize Socket.IO instance here
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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

app.get('/api/user-session', (req, res) => {
    if (req.session && req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: "Not logged in" });
});

// --- GLOBAL ROUTE GUARD ---
app.use((req, res, next) => {
    const publicPaths = ['/login.html', '/login', '/forgot-password', '/styles.css', '/ui-config'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/socket.io/') || req.path.startsWith('/resources/')) return next();
    if (req.session && req.session.loggedIn) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: "Unauthorized" });
    return res.redirect('/login.html');
});

app.get('/ui-config', (req, res) => res.json(config.ui || {}));

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

// =============================================================================
// 4. API ROUTES - USER MANAGEMENT & PROFILE
// =============================================================================

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

socket.on('view-expiring-skills', async (days, forceRefresh = false) => {
        const daysThreshold = parseInt(days) || 30;
        
        // Logic: If forced, interval is 0. Otherwise use config default (usually 60 mins).
        const interval = forceRefresh ? 0 : (config.scrapingInterval || 60);

        logger(`> Fetching View Data (Threshold: ${daysThreshold} days${forceRefresh ? ', Force Refresh' : ', Cached OK'})...`);
        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            
            // Pass the calculated interval
            const rawData = await getOIData(config.url, interval, currentProxy, logger);
            
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
        await handleEmailSending(socket, selectedNames, parseInt(days) || 30, logger, false);
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

async function handleEmailSending(socket, targetNames, days, logger, isSingle) {
    const currentUser = socket.request.session.user.name || socket.request.session.user;
    logger(`> Starting Email Process (${isSingle ? 'Single' : 'Batch'})...`);
    socket.emit('progress-update', { type: 'progress-start', total: targetNames.length });

    try {
        const dbMembers = await db.getMembers();
        const dbSkills = await db.getSkills();
        const prefs = await db.getPreferences();
        const templateConfig = {
            from: prefs.emailFrom, subject: prefs.emailSubject, intro: prefs.emailIntro,
            rowHtml: prefs.emailRow, rowHtmlNoUrl: prefs.emailRowNoUrl, filterOnlyWithUrl: prefs.emailOnlyWithUrl
        };
        const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
        const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, days);
        const targets = processedMembers.filter(m => targetNames.includes(m.name));

        let current = 0;
        for (const member of targets) {
            if (member.expiringSkills.length > 0) {
                try {
                    const result = await sendNotification(member, templateConfig, config.transporter, false, logger, config.ui.loginTitle);
                    if (result) {
                        await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills`);
                        await db.logEvent(currentUser, 'Email', `Sent to ${member.name}`, { recipient: member.name, email: member.email, skillsCount: member.expiringSkills.length, mode: isSingle ? 'Single' : 'Batch' });
                    } else {
                        logger(`   [Skipped] ${member.name} - No skills remaining after filters.`);
                    }
                } catch (err) { await db.logEmailAction(member, 'FAILED', err.message); throw err; }
            }
            current++;
            socket.emit('progress-update', { type: 'progress-tick', current: current, total: targets.length, member: member.name });
            if (!isSingle) await new Promise(resolve => setTimeout(resolve, 2000));
        }
        logger(`> All operations completed.`);
        socket.emit('script-complete', 0);
    } catch (error) { logger(`FATAL ERROR: ${error.message}`); socket.emit('script-complete', 1); }
}

const PORT = 3000;
server.listen(PORT, () => { console.log(`Server running at http://localhost:${PORT}`); });