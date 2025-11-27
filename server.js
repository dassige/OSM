const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// Configuration
const resources = require('./config.js');

// Services
const { getOIData } = require('./services/scraper');
const { processMemberSkills } = require('./services/member-manager');
const { sendNotification } = require('./services/mailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Web client connected');

    // Helper to send logs to both server console and client terminal
    const logger = (msg) => {
        process.stdout.write(msg + '\n');
        socket.emit('terminal-output', msg + '\n');
    };

    // --- VIEW EXPIRING SKILLS ---
    socket.on('view-expiring-skills', async (days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Fetching View Data (Threshold: ${daysThreshold} days)...`);

        try {
            // 1. Scrape
            const rawData = await getOIData(resources.url, logger);
            
            // 2. Process
            const processedMembers = processMemberSkills(
                resources.members, 
                rawData, 
                resources.skillsConfig, 
                daysThreshold
            );

            // 3. Format for Frontend
            const results = processedMembers.map(m => ({
                name: m.name,
                skills: m.expiringSkills.map(s => ({
                    skill: s.skill,
                    dueDate: s.dueDate,
                    hasUrl: !!s.url,
                    isCritical: !!s.isCritical
                })),
                emailEligible: m.expiringSkills.length > 0 // Simplified logic
            }));

            // 4. Send Data
            socket.emit('expiring-skills-data', results);
            socket.emit('script-complete', 0); // Success

        } catch (error) {
            logger(`Error: ${error.message}`);
            socket.emit('script-complete', 1); // Failure
        }
    });

    // --- SEND EMAILS (SELECTED) ---
    socket.on('run-send-selected', async (selectedNames, days) => {
        const daysThreshold = parseInt(days) || 30;
        logger(`> Starting Email Process (Threshold: ${daysThreshold} days)...`);
        
        // Emit progress start
        socket.emit('progress-update', { type: 'progress-start', total: selectedNames.length });

        try {
            // 1. Scrape
            const rawData = await getOIData(resources.url, logger);
            
            // 2. Process
            const processedMembers = processMemberSkills(
                resources.members, 
                rawData, 
                resources.skillsConfig, 
                daysThreshold
            );

            // 3. Filter for Selected Users
            const targets = processedMembers.filter(m => selectedNames.includes(m.name));
            
            let current = 0;
            for (const member of targets) {
                logger(`> Processing ${member.name}...`);
                
                // 4. Send Email
                if (member.expiringSkills.length > 0) {
                    await sendNotification(
                        member, 
                        resources.emailInfo, 
                        resources.transporter, 
                        false, // Set to true to test without sending
                        logger
                    );
                } else {
                    logger(`  No expiring skills for ${member.name}. Skipping.`);
                }

                // 5. Update Progress
                current++;
                socket.emit('progress-update', { 
                    type: 'progress-tick', 
                    current: current, 
                    total: targets.length, 
                    member: member.name 
                });

                // Rate limiting (optional but recommended)
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            logger(`> All operations completed.`);
            socket.emit('script-complete', 0);

        } catch (error) {
            logger(`FATAL ERROR: ${error.message}`);
            socket.emit('script-complete', 1);
        }
    });
    
    // --- LEGACY TEST MODE (Optional) ---
    socket.on('start-script', async (isTestMode) => {
        // You could implement a 'Run All' feature here reusing the logic above
        // checking `isTestMode` in the sendNotification call.
        logger("> 'Run All' logic is deprecated in this refactor. Please use 'View' or 'Send Selected'.");
        socket.emit('script-complete', 0);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});