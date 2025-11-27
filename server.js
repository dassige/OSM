const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// Configuration
const config = require('./config.js'); 

// Services
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const { sendNotification } = require('./services/mailer');
const db = require('./services/db'); // [NEW] Import DB Service

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// [NEW] Initialize DB before starting
db.initDB().catch(err => console.error("DB Init Error:", err));

io.on('connection', (socket) => {
    console.log('Web client connected');

    const logger = (msg) => {
        process.stdout.write(msg + '\n');
        socket.emit('terminal-output', msg + '\n');
    };

    // [NEW] Handle Preferences
    socket.on('get-preferences', async () => {
        try {
            const prefs = await db.getPreferences();
            socket.emit('preferences-data', prefs);
        } catch (e) {
            logger(`Error fetching preferences: ${e.message}`);
        }
    });

    socket.on('update-preference', async ({ key, value }) => {
        try {
            await db.savePreference(key, value);
            // logger(`Preference saved: ${key} = ${value}`); // Optional verbose logging
        } catch (e) {
            logger(`Error saving preference: ${e.message}`);
        }
    });

    // --- VIEW EXPIRING SKILLS ---
    socket.on('view-expiring-skills', async (days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Fetching View Data (Threshold: ${daysThreshold} days)...`);

        try {
            const rawData = await getOIData(config.url, logger);
            
            const processedMembers = processMemberSkills(
                config.members, 
                rawData, 
                config.skillsConfig, 
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

    // --- SEND EMAILS (SELECTED) ---
    socket.on('run-send-selected', async (selectedNames, days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Starting Email Process (Threshold: ${daysThreshold} days)...`);
        
        socket.emit('progress-update', { type: 'progress-start', total: selectedNames.length });

        try {
            const rawData = await getOIData(config.url, logger);
            
            const processedMembers = processMemberSkills(
                config.members, 
                rawData, 
                config.skillsConfig, 
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
                        // [NEW] Log to DB
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