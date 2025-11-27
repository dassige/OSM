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

    // --- STANDARD START SCRIPT ---
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

    // --- NEW: VIEW EXPIRING SKILLS ---
    socket.on('view-expiring-skills', () => {
        console.log('Fetching expiring skills (View Mode)...');
        
        // Spawn independent process for viewing so it doesn't conflict with main runner variables
        const viewChild = spawn('node', ['main.js', 'view']);
        let outputBuffer = '';

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

    socket.on('stop-script', () => {
        if (child) {
            console.log('Killing script process...');
            child.kill();
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});