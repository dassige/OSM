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

    socket.on('start-script', () => {
        console.log('Spawning script process...');
        
        // Spawn the node process directly
        const child = spawn('node', ['main.js']);

        // Capture standard output (console.log)
        child.stdout.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(output); // Mirror to server console
            socket.emit('terminal-output', output);
        });

        // Capture error output (console.error)
        child.stderr.on('data', (data) => {
            const output = data.toString();
            process.stderr.write(output); // Mirror to server console
            socket.emit('terminal-output', output);
        });

        // Handle process exit
        child.on('close', (code) => {
            socket.emit('script-complete', code);
        });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});