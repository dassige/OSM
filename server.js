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
    
    // Store the child process reference within the socket scope
    let child = null;

    socket.on('start-script', () => {
        if (child) return; // Prevent multiple clicks from spawning multiple processes

        console.log('Spawning script process...');
        
        // Spawn the node process directly
        child = spawn('node', ['main.js']);

        // Capture standard output (console.log)
        child.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(output);
            socket.emit('terminal-output', output);
        });

        // Capture error output (console.error)
        child.stderr.on('data', (data) => {
            const output = data.toString();
            process.stderr.write(output);
            socket.emit('terminal-output', output);
        });

        // Handle process exit
        child.on('close', (code) => {
            socket.emit('script-complete', code);
            child = null; // Clean up reference
        });
    });

    socket.on('stop-script', () => {
        if (child) {
            console.log('Killing script process...');
            child.kill(); // Sends SIGTERM
            // The 'close' event above will trigger, notifying the client
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});