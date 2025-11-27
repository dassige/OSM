const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Web client connected');
    
    let child = null;

    // --- STANDARD START SCRIPT (Kept for compatibility if needed, though mostly replaced by run-send-selected) ---
    socket.on('start-script', (testMode) => {
        if (child) return;

        const args = ['main.js'];
        if (testMode) {
            console.log('Spawning script in TEST mode...');
            args.push('test');
        } else {
            console.log('Spawning script in LIVE mode...');
        }
        
        child = spawn('node', args);

        child.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(output);
            socket.emit('terminal-output', output);
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            process.stderr.write(output);
            socket.emit('terminal-output', output);
        });

        child.on('close', (code) => {
            socket.emit('script-complete', code);
            child = null;
        });
    });

    // --- NEW: RUN SELECTED (SEND EMAILS) ---
socket.on('run-send-selected', (selectedNames, days) => { // Accept days param
        if (child) return;

        // Ensure we have a valid string for days, default to '30'
        const daysArg = days ? String(days) : '30';

        console.log(`Spawning script in SEND-SELECTED mode (Threshold: ${daysArg} days)...`);
        
        // Pass 'daysArg' as the 4th argument (index 3)
        const args = ['main.js', 'send-selected', JSON.stringify(selectedNames), daysArg];
        
        child = spawn('node', args);
        child.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(output);
            socket.emit('terminal-output', output);
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            process.stderr.write(output);
            socket.emit('terminal-output', output);
        });

        child.on('close', (code) => {
            socket.emit('script-complete', code);
            child = null;
        });
    });

    // --- VIEW EXPIRING SKILLS ---
    socket.on('view-expiring-skills', (days) => { // Accept days param
        const daysArg = days ? String(days) : '30';
        console.log(`Fetching expiring skills (View Mode, Threshold: ${daysArg})...`);
        
        // Pass 'daysArg' as the 3rd argument (index 2)
        const viewChild = spawn('node', ['main.js', 'view', daysArg]);        let outputBuffer = '';

        viewChild.stdout.on('data', (data) => {
            outputBuffer += data.toString();
        });

        viewChild.on('close', (code) => {
            try {
                // Extract JSON between delimiters
                const startMarker = '___JSON_START___';
                const endMarker = '___JSON_END___';
                
                const startIndex = outputBuffer.indexOf(startMarker);
                const endIndex = outputBuffer.indexOf(endMarker);

                if (startIndex !== -1 && endIndex !== -1) {
                    const jsonString = outputBuffer.substring(startIndex + startMarker.length, endIndex).trim();
                    const jsonData = JSON.parse(jsonString);
                    socket.emit('expiring-skills-data', jsonData);
                } else {
                    console.error('Failed to parse view data from script output');
                    socket.emit('terminal-output', 'Error: Could not retrieve data format from script.\n');
                }
            } catch (e) {
                console.error('JSON Parse error:', e);
            }
        });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});