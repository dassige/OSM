const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

// Configuration
const config = require('./config.js');
const { findWorkingNZProxy } = require('./services/proxy-manager');

// Services
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const { sendNotification } = require('./services/mailer');
const db = require('./services/db');

const app = express();
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

// Configure Session Middleware
const sessionMiddleware = session({
    secret: config.auth?.sessionSecret || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
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

// --- HTTP ROUTES ---

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === config.auth.username && password === config.auth.password) {
        req.session.loggedIn = true;
        req.session.user = username;
        return res.status(200).send({ success: true });
    }
    return res.status(401).send({ error: "Invalid credentials" });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Protect Routes Middleware
app.use((req, res, next) => {
    const publicPaths = ['/login.html', '/login', '/styles.css', '/ui-config'];
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

app.get('/ui-config', (req, res) => {
    res.json(config.ui || {});
});

// --- API: LOGGING ---

// Client-side event reporter
app.post('/api/logs', async (req, res) => {
    try {
        const { type, title, payload } = req.body;
        await db.logEvent(req.session.user, type, title, payload);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fetch logs
app.get('/api/events', async (req, res) => {
    try {
        const logs = await db.getEventLogs(100); 
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: PREFERENCES ---
app.get('/api/preferences', async (req, res) => {
    try {
        const prefs = await db.getPreferences();
        res.json(prefs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/preferences', async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: "Key is required" });
        await db.savePreference(key, value);
        // Note: Email template editing events are logged via client-side fetch to /api/logs
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: MEMBERS ---
app.get('/api/members', async (req, res) => {
    try {
        const members = await db.getMembers();
        res.json(members);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
    try {
        const id = await db.addMember(req.body);
        await db.logEvent(req.session.user, 'Members', `Added ${req.body.name}`, req.body);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/import', async (req, res) => {
    try {
        const members = req.body;
        if (!Array.isArray(members)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddMembers(members);
        await db.logEvent(req.session.user, 'Members', `Imported ${members.length} members`, { count: members.length });
        res.json({ success: true, count: members.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteMembers(ids);
        await db.logEvent(req.session.user, 'Members', `Deleted ${ids.length} members`, { ids });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        await db.updateMember(req.params.id, req.body);
        await db.logEvent(req.session.user, 'Members', `Edited ${req.body.name}`, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
    try {
        await db.deleteMember(req.params.id);
        await db.logEvent(req.session.user, 'Members', `Deleted member ID ${req.params.id}`, { id: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SKILLS ---
app.get('/api/skills', async (req, res) => {
    try {
        const skills = await db.getSkills();
        res.json(skills);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills', async (req, res) => {
    try {
        const id = await db.addSkill(req.body);
        await db.logEvent(req.session.user, 'Skills', `Added ${req.body.name}`, req.body);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/import', async (req, res) => {
    try {
        const skills = req.body;
        if (!Array.isArray(skills)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddSkills(skills);
        await db.logEvent(req.session.user, 'Skills', `Imported ${skills.length} skills`, { count: skills.length });
        res.json({ success: true, count: skills.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteSkills(ids);
        await db.logEvent(req.session.user, 'Skills', `Deleted ${ids.length} skills`, { ids });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/skills/:id', async (req, res) => {
    try {
        await db.updateSkill(req.params.id, req.body);
        await db.logEvent(req.session.user, 'Skills', `Edited ${req.body.name}`, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/skills/:id', async (req, res) => {
    try {
        await db.deleteSkill(req.params.id);
        await db.logEvent(req.session.user, 'Skills', `Deleted skill ID ${req.params.id}`, { id: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SYSTEM TOOLS ---
app.get('/api/system/backup', async (req, res) => {
    if (!req.session || !req.session.loggedIn) return res.status(401).send("Unauthorized");

    const dbPath = db.getDbPath();
    const date = new Date().toISOString().split('T')[0];
    const domain = req.get('host').replace(/[:\/]/g, '-');
    const packageJson = require('./package.json');
    const filename = `fenz-osm-backup-v${packageJson.version}-${date}-${domain}.db`;

    await db.logEvent(req.session.user, 'System', 'Database Backup Downloaded', { filename });

    res.download(dbPath, filename, (err) => {
        if (err) {
            console.error("Backup download error:", err);
            if (!res.headersSent) res.status(500).send("Could not download database.");
        }
    });
});

app.post('/api/system/restore', upload.single('databaseFile'), async (req, res) => {
    if (!req.session || !req.session.loggedIn) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const tempPath = req.file.path;
    try {
        await db.verifyAndReplaceDb(tempPath);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        
        await db.logEvent(req.session.user, 'System', 'Database Restored', { originalname: req.file.originalname });
        
        res.json({ success: true, message: "Database restored successfully. System reloaded." });
    } catch (e) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(500).json({ error: e.message });
    }
});

app.use(express.static('public'));

// --- PROXY ---
let currentProxy = null;
async function initializeProxy() {
    console.log('[ProxySystem] Initializing...');
    if (config.proxyMode === 'fixed') {
        currentProxy = config.fixedProxyUrl;
        console.log(`[ProxySystem] Fixed Proxy: ${currentProxy}`);
    } else if (config.proxyMode === 'dynamic') {
        const proxy = await findWorkingNZProxy(console.log);
        currentProxy = proxy;
        console.log(`[ProxySystem] Dynamic Proxy: ${currentProxy}`);
    } else {
        currentProxy = null;
    }
}
initializeProxy();

// --- SOCKET.IO ---

io.on('connection', (socket) => {
    const logger = (msg) => {
        process.stdout.write(msg + '\n');
        socket.emit('terminal-output', msg + '\n');
    };

    socket.on('get-preferences', async () => {
        try {
            const prefs = await db.getPreferences();
            socket.emit('preferences-data', prefs);
        } catch (e) { logger(e.message); }
    });

    socket.on('update-preference', async ({ key, value }) => {
        try { await db.savePreference(key, value); } catch (e) { logger(e.message); }
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
                    skill: s.skill,
                    dueDate: s.dueDate,
                    hasUrl: !!s.url,
                    isCritical: !!s.isCritical
                })),
                emailEligible: m.expiringSkills.length > 0
            }));
            socket.emit('expiring-skills-data', results);
            socket.emit('script-complete', 0);
        } catch (error) {
            logger(`Error: ${error.message}`);
            socket.emit('script-complete', 1);
        }
    });

    socket.on('run-send-selected', async (selectedNames, days) => {
        const daysThreshold = parseInt(days) || 30;
        const currentUser = socket.request.session.user;
        
        logger(`> Starting Email Process (User: ${currentUser})...`);
        socket.emit('progress-update', { type: 'progress-start', total: selectedNames.length });

        try {
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const prefs = await db.getPreferences();
            
            const templateConfig = {
                from: prefs.emailFrom,
                subject: prefs.emailSubject,
                intro: prefs.emailIntro,
                rowHtml: prefs.emailRow
            };

            const rawData = await getOIData(config.url, config.scrapingInterval || 0, currentProxy, logger);
            const processedMembers = processMemberSkills(dbMembers, rawData, dbSkills, daysThreshold);
            const targets = processedMembers.filter(m => selectedNames.includes(m.name));

            let current = 0;
            for (const member of targets) {
                if (member.expiringSkills.length > 0) {
                    try {
                        await sendNotification(member, templateConfig, config.transporter, false, logger);
                        
                        await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills`);
                        
                        // UPDATED: Log formatted email event
                        await db.logEvent(currentUser, 'Email', `Sent to ${member.name} at ${member.email}`, { 
                            recipient: member.name, 
                            email: member.email,
                            skillsCount: member.expiringSkills.length
                        });
                        
                    } catch (err) {
                        await db.logEmailAction(member, 'FAILED', err.message);
                        throw err;
                    }
                }
                current++;
                socket.emit('progress-update', { type: 'progress-tick', current: current, total: targets.length, member: member.name });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            logger(`> All operations completed.`);
            socket.emit('script-complete', 0);
        } catch (error) {
            logger(`FATAL ERROR: ${error.message}`);
            socket.emit('script-complete', 1);
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
