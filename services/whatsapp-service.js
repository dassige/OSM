// services/whatsapp-service.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let io;
let qrCodeUrl = null;
let status = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, READY
let isClientReady = false;

function init(socketIo) {
    io = socketIo;
}

function startClient() {
    if (status !== 'DISCONNECTED') return;

    console.log('[WhatsApp] Starting client...');
    updateStatus('INITIALIZING');

    client = new Client({
        authStrategy: new LocalAuth({ clientId: "fenz-osm-client" }),
        puppeteer: {
            headless: true,
            // args are needed for running in Docker/Cloud environments
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] QR Code received');
        // Convert QR text to Data URI for frontend display
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) {
                qrCodeUrl = url;
                updateStatus('QR_READY');
                io.emit('wa-qr', url);
            }
        });
    });

    client.on('ready', () => {
        console.log('[WhatsApp] Client is ready!');
        isClientReady = true;
        qrCodeUrl = null;
        updateStatus('READY');
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Auth Failure', msg);
        updateStatus('DISCONNECTED');
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Client was logged out', reason);
        isClientReady = false;
        qrCodeUrl = null;
        status = 'DISCONNECTED';
        io.emit('wa-status', status);
    });

    client.initialize();
}

async function logout() {
    if (client) {
        try {
            await client.logout();
        } catch (e) {
            console.log('[WhatsApp] Logout error (might already be closed):', e.message);
        }
        try {
            await client.destroy();
        } catch (e) {}
    }
    client = null;
    isClientReady = false;
    qrCodeUrl = null;
    updateStatus('DISCONNECTED');
}

function updateStatus(newStatus) {
    status = newStatus;
    if (io) io.emit('wa-status', status);
}

function getStatus() {
    return { status, qr: qrCodeUrl };
}

// Formatting: NZ numbers (021...) to International (6421...)
function formatPhone(mobile) {
    if (!mobile) return null;
    let cleaned = mobile.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
        cleaned = '64' + cleaned.substring(1);
    } else if (!cleaned.startsWith('64')) {
        // Fallback: assume NZ if no country code
        cleaned = '64' + cleaned;
    }
    return `${cleaned}@c.us`;
}

async function sendMessage(mobile, text) {
    if (!isClientReady) throw new Error("WhatsApp client not ready.");
    const chatId = formatPhone(mobile);
    
    // Optional: Check if number is registered
    // const isRegistered = await client.isRegisteredUser(chatId);
    // if (!isRegistered) throw new Error("Number not registered on WhatsApp");

    await client.sendMessage(chatId, text);
    return true;
}

module.exports = { init, startClient, logout, getStatus, sendMessage, isReady: () => isClientReady };