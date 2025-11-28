const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');

// Configuration
const config = require('./config.js'); 

// Services
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const { sendNotification } = require('./services/mailer');
const db = require('./services/db');

const app = express();
const server = http.createServer(app);

// Configure Session Middleware
const sessionMiddleware = session({
    secret: config.auth?.sessionSecret || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
});

app.use(sessionMiddleware);
app.use(express.json()); 

// Initialize Socket.IO with Session awareness
const io = new Server(server);
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

// Login Endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === config.auth.username && password === config.auth.password) {
        req.session.loggedIn = true;
        req.session.user = username;
        return res.status(200).send({ success: true });
    }
    return res.status(401).send({ error: "Invalid credentials" });
});

// Logout Endpoint
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Protect Routes Middleware
app.use((req, res, next) => {
    const publicPaths = ['/login.html', '/login', '/styles.css', '/ui-config'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/socket.io/')) {
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
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/import', async (req, res) => {
    try {
        const members = req.body; 
        if (!Array.isArray(members)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddMembers(members);
        res.json({ success: true, count: members.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteMembers(ids);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        await db.updateMember(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
    try {
        await db.deleteMember(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SKILLS (NEW) ---
app.get('/api/skills', async (req, res) => {
    try {
        const skills = await db.getSkills();
        res.json(skills);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills', async (req, res) => {
    try {
        const id = await db.addSkill(req.body);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/import', async (req, res) => {
    try {
        const skills = req.body;
        if (!Array.isArray(skills)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddSkills(skills);
        res.json({ success: true, count: skills.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteSkills(ids);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/skills/:id', async (req, res) => {
    try {
        await db.updateSkill(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/skills/:id', async (req, res) => {
    try {
        await db.deleteSkill(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static('public'));

// --- SOCKET.IO EVENTS ---

io.on('connection', (socket) => {
    console.log(`Web client connected (User: ${socket.request.session.user})`);

    const logger = (msg) => {
        process.stdout.write(msg + '\n');
        socket.emit('terminal-output', msg + '\n');
    };

    socket.on('get-preferences', async () => {
        try {
            const prefs = await db.getPreferences();
            socket.emit('preferences-data', prefs);
        } catch (e) { logger(`Error fetching preferences: ${e.message}`); }
    });

    socket.on('update-preference', async ({ key, value }) => {
        try { await db.savePreference(key, value); } catch (e) { logger(`Error saving preference: ${e.message}`); }
    });

    socket.on('view-expiring-skills', async (days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Fetching View Data (Threshold: ${daysThreshold} days)...`);

        try {
            // [UPDATED] Fetch from DB
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();

            if (dbMembers.length === 0) logger(`> Warning: No members in database.`);
            if (dbSkills.length === 0) logger(`> Warning: No skills configured in database.`);

            const rawData = await getOIData(config.url, logger);
            
            // Pass dbSkills instead of config.skillsConfig
            const processedMembers = processMemberSkills(
                dbMembers, 
                rawData, 
                dbSkills, 
                daysThreshold
            );

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
        logger(`> Starting Email Process (Threshold: ${daysThreshold} days)...`);
        
        socket.emit('progress-update', { type: 'progress-start', total: selectedNames.length });

        try {
            // [UPDATED] Fetch from DB
            const dbMembers = await db.getMembers();
            const dbSkills = await db.getSkills();
            const rawData = await getOIData(config.url, logger);
            
            const processedMembers = processMemberSkills(
                dbMembers, 
                rawData, 
                dbSkills, 
                daysThreshold
            );

            const targets = processedMembers.filter(m => selectedNames.includes(m.name));
            
            let current = 0;
            for (const member of targets) {
                logger(`> Processing ${member.name}...`);
                if (member.expiringSkills.length > 0) {
                    try {
                        await sendNotification(
                            member, 
                            config.emailInfo, 
                            config.transporter, 
                            false, 
                            logger
                        );
                        await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills`);
                    } catch (err) {
                        await db.logEmailAction(member, 'FAILED', err.message);
                        throw err; 
                    }
                } else {
                    logger(`  No expiring skills for ${member.name}. Skipping.`);
                }
                current++;
                socket.emit('progress-update', { 
                    type: 'progress-tick', 
                    current: current, 
                    total: targets.length, 
                    member: member.name 
                });
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