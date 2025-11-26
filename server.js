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

    // Accept 'testMode' argument from client
    socket.on('start-script', (testMode) => {
        if (child) return;

        const args = ['main.js'];
        
        // Add the 'test' argument if requested
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