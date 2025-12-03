const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

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
    sendAccountDeletionNotification // <--- Added import
} = require('./services/mailer');const db = require('./services/db');

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

// --- AUTHENTICATION ROUTES ---

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // 1. Check Superadmin (from .env)
    if (username === config.auth.username && password === config.auth.password) {
        req.session.loggedIn = true;
        req.session.user = {
            name: 'Super Admin',
            email: username,
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
                isAdmin: false
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

    // Block Super Admin reset (env based)
    if (email === config.auth.username) {
        return res.status(400).json({ error: "Cannot reset Super Admin password via email." });
    }

    try {
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const tempPassword = crypto.randomBytes(4).toString('hex');
        await db.adminResetPassword(user.id, tempPassword);
        await sendPasswordReset(email, tempPassword, config.transporter);

        await db.logEvent('System', 'Security', `Password reset requested for ${email}`, {});
        res.json({ success: true });

    } catch (e) {
        console.error("Forgot PW Error:", e);
        res.status(500).json({ error: "Failed to reset password." });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Helper for Frontend Session Info
app.get('/api/user-session', (req, res) => {
    if (req.session && req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// Middleware: Require Super Admin
const requireAdmin = (req, res, next) => {
    if (req.session?.user?.isAdmin) {
        next();
    } else {
        res.status(403).json({ error: "Forbidden: Super Admin access required" });
    }
};

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

app.get('/ui-config', (req, res) => {
    res.json(config.ui || {});
});

// --- API: USER MANAGEMENT (Admin Only) ---

app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        const users = await db.getUsers();
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAdmin, async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email || !name) return res.status(400).json({ error: "Missing fields" });

        // Generate Secure Random Password (12 characters hex)
        const generatedPassword = crypto.randomBytes(6).toString('hex');

        // Create User in DB (hashes the password)
        await db.addUser(email, name, generatedPassword);

        // Send Email with Plaintext Password & App Title
        try {
            // Pass config.ui.loginTitle as the appName argument
            await sendNewAccountNotification(email, name, generatedPassword, config.transporter, config.ui.loginTitle);
        } catch (mailError) {
            console.error("Failed to send welcome email:", mailError);
        }

        await db.logEvent(req.session.user.name, 'User Mgmt', `Created user ${email} (Password emailed)`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. Fetch user details BEFORE deletion
        const userToDelete = await db.getUserById(id);
        
        if (!userToDelete) {
            return res.status(404).json({ error: "User not found" });
        }

        // 2. Delete the user
        await db.deleteUser(id);
        
        // 3. Send Deletion Email
        try {
            await sendAccountDeletionNotification(
                userToDelete.email, 
                userToDelete.name, 
                config.transporter, 
                config.ui.loginTitle
            );
        } catch (mailError) {
            console.error("Failed to send deletion email:", mailError);
            // We don't fail the request, just log it
        }

        // 4. Log Event
        const userEmail = userToDelete.email;
        await db.logEvent(
            req.session.user.name, 
            'User Mgmt', 
            `Deleted user ${userEmail} (Notification sent)`, 
            { email: userEmail, id: id }
        );
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/:id/reset', requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;

        // 1. Fetch user to get email
        const user = await db.getUserById(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 2. Generate Random Password
        const tempPassword = crypto.randomBytes(6).toString('hex');

        // 3. Reset in DB
        await db.adminResetPassword(id, tempPassword);

        // 4. Email the user
        try {
            await sendPasswordReset(user.email, tempPassword, config.transporter, config.ui.loginTitle);
        } catch (mailError) {
            console.error("Failed to send reset email:", mailError);
            return res.status(500).json({ error: "Password reset, but failed to send email. Check logs." });
        }

        // 5. Log Event
        await db.logEvent(req.session.user.name, 'User Mgmt', `Reset password for ${user.email} (Password emailed)`, { email: user.email, id: id });
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: PROFILE (Self Service) ---

app.put('/api/profile', async (req, res) => {
    try {
        const { name, password } = req.body;
        const currentUser = req.session.user;

        if (currentUser.isEnvUser) {
            return res.status(403).json({ error: "Super Admin from .env cannot change profile via web." });
        }

        await db.updateUserProfile(currentUser.id, name, password || null);
        req.session.user.name = name; // Update session

        await db.logEvent(currentUser.name, 'Profile', `Updated own profile`, {});
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: LOGGING (Filtered) ---

app.post('/api/logs', async (req, res) => {
    try {
        const { type, title, payload } = req.body;
        const username = req.session.user.name || req.session.user;
        await db.logEvent(username, type, title, payload);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events', async (req, res) => {
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

app.get('/api/events/meta', async (req, res) => {
    try {
        const meta = await db.getEventLogMetadata();
        res.json(meta);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: USER PREFERENCES ---
app.get('/api/user-preferences', async (req, res) => {
    try {
        const userId = req.session.user.id || 0;
        const prefs = await db.getAllUserPreferences(userId);
        res.json(prefs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/user-preferences/:key', async (req, res) => {
    try {
        // Use id 0 for Super Admin, otherwise user.id
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

// --- API: GLOBAL PREFERENCES ---
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
        const username = req.session.user.name || req.session.user;
        const id = await db.addMember(req.body);
        await db.logEvent(username, 'Members', `Added ${req.body.name}`, req.body);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/import', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        const members = req.body;
        if (!Array.isArray(members)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddMembers(members);
        await db.logEvent(username, 'Members', `Imported ${members.length} members`, { count: members.length });
        res.json({ success: true, count: members.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/bulk-delete', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteMembers(ids);
        await db.logEvent(username, 'Members', `Deleted ${ids.length} members`, { ids });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        await db.updateMember(req.params.id, req.body);
        await db.logEvent(username, 'Members', `Edited ${req.body.name}`, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        await db.deleteMember(req.params.id);
        await db.logEvent(username, 'Members', `Deleted member ID ${req.params.id}`, { id: req.params.id });
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
        const username = req.session.user.name || req.session.user;
        const id = await db.addSkill(req.body);
        await db.logEvent(username, 'Skills', `Added ${req.body.name}`, req.body);
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/import', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        const skills = req.body;
        if (!Array.isArray(skills)) return res.status(400).json({ error: "Expected array" });
        await db.bulkAddSkills(skills);
        await db.logEvent(username, 'Skills', `Imported ${skills.length} skills`, { count: skills.length });
        res.json({ success: true, count: skills.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/skills/bulk-delete', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        const { ids } = req.body;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid input" });
        await db.bulkDeleteSkills(ids);
        await db.logEvent(username, 'Skills', `Deleted ${ids.length} skills`, { ids });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/skills/:id', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        await db.updateSkill(req.params.id, req.body);
        await db.logEvent(username, 'Skills', `Edited ${req.body.name}`, req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/skills/:id', async (req, res) => {
    try {
        const username = req.session.user.name || req.session.user;
        await db.deleteSkill(req.params.id);
        await db.logEvent(username, 'Skills', `Deleted skill ID ${req.params.id}`, { id: req.params.id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SYSTEM TOOLS ---
app.get('/api/system/backup', requireAdmin, async (req, res) => {
    // Removed the manual session check since requireAdmin handles it
    const dbPath = db.getDbPath();
    // ... [Rest of the function remains the same] ...
    const date = new Date().toISOString().split('T')[0];
    const domain = req.get('host').replace(/[:\/]/g, '-');
    const packageJson = require('./package.json');
    const filename = `fenz-osm-backup-v${packageJson.version}-${date}-${domain}.db`;

    const username = req.session.user.name || req.session.user;
    await db.logEvent(username, 'System', 'Database Backup Downloaded', { filename });

    res.download(dbPath, filename, (err) => {
        if (err) {
            console.error("Backup download error:", err);
            if (!res.headersSent) res.status(500).send("Could not download database.");
        }
    });
});

app.post('/api/system/restore', requireAdmin, upload.single('databaseFile'), async (req, res) => {
    // Removed the manual session check since requireAdmin handles it
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const tempPath = req.file.path;
    // ... [Rest of the function remains the same] ...
    try {
        await db.verifyAndReplaceDb(tempPath);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        
        const username = req.session.user.name || req.session.user;
        await db.logEvent(username, 'System', 'Database Restored', { originalname: req.file.originalname });
        
        res.json({ success: true, message: "Database restored successfully. System reloaded." });
    } catch (e) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(500).json({ error: e.message });
    }
});
//  Page Restriction Middleware
app.get('/system-tools.html', (req, res, next) => {
    if (req.session && req.session.user && req.session.user.isAdmin) {
        next(); // Allow access, pass to static handler
    } else {
        res.redirect('/'); // Redirect unauthorized users to dashboard
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
            // Fetch User Preferences instead of Global
            const userId = socket.request.session.user.id || 0;
            const prefs = await db.getAllUserPreferences(userId);
            socket.emit('preferences-data', prefs);
        } catch (e) { logger(e.message); }
    });
    socket.on('update-preference', async ({ key, value }) => {
        try {
            // Save to User Preferences
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
        const currentUser = socket.request.session.user.name || socket.request.session.user;

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
                        const result = await sendNotification(member, templateConfig, config.transporter, false, logger);

                        await db.logEmailAction(member, 'SENT', `${member.expiringSkills.length} skills`);

                        // UPDATED: Include body in log
                        await db.logEvent(currentUser, 'Email', `Sent to ${member.name} at ${member.email}`, {
                            recipient: member.name,
                            email: member.email,
                            skillsCount: member.expiringSkills.length,
                            emailBody: result ? result.html : 'No content'
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