// services/whatsapp-service.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let io;
let qrCodeUrl = null;
let status = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, READY
let isClientReady = false;
let clientInfo = null; // [NEW] Store connected account info

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
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] QR Code received');
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
        
        // [NEW] Capture Account Info
        if (client.info) {
            clientInfo = {
                number: client.info.wid.user,
                name: client.info.pushname
            };
        }
        
        updateStatus('READY');
        // Force emit full status data including the new clientInfo
        if (io) io.emit('wa-status-data', getStatus());
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Auth Failure', msg);
        updateStatus('DISCONNECTED');
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Client was logged out', reason);
        resetState();
    });

    client.initialize();
}

async function logout() {
    if (client) {
        try { await client.logout(); } catch (e) {}
        try { await client.destroy(); } catch (e) {}
    }
    resetState();
}

function resetState() {
    client = null;
    isClientReady = false;
    qrCodeUrl = null;
    clientInfo = null; // [NEW] Clear info
    updateStatus('DISCONNECTED');
}

function updateStatus(newStatus) {
    status = newStatus;
    if (io) io.emit('wa-status', status);
}

function getStatus() {
    return { 
        status, 
        qr: qrCodeUrl,
        info: clientInfo // [NEW] Send info to frontend
    };
}

function formatPhone(mobile) {
    if (!mobile) return null;
    let cleaned = mobile.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '64' + cleaned.substring(1);
    else if (!cleaned.startsWith('64')) cleaned = '64' + cleaned;
    return `${cleaned}@c.us`;
}

async function sendMessage(mobile, text) {
    if (!isClientReady) throw new Error("WhatsApp client not ready.");
    const chatId = formatPhone(mobile);
    await client.sendMessage(chatId, text);
    return true;
}

module.exports = { init, startClient, logout, getStatus, sendMessage, isReady: () => isClientReady };