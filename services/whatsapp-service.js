// services/whatsapp-service.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let io;
let logEvent = null; // [NEW] Reference to DB Logger
let qrCodeUrl = null;
let status = 'DISCONNECTED'; 
let isClientReady = false;
let clientInfo = null;

// [UPDATED] Init now accepts a logger callback
function init(socketIo, logEventCallback) {
    io = socketIo;
    logEvent = logEventCallback;
}

// [NEW] Helper to log system events safely
async function systemLog(title, payload = {}) {
    if (logEvent) {
        try {
            await logEvent('System', 'WhatsApp', title, payload);
        } catch (e) {
            console.error("[WhatsApp] Logging failed:", e.message);
        }
    }
}

function startClient() {
    if (status !== 'DISCONNECTED') return;

    console.log('[WhatsApp] Starting client...');
    systemLog('Client Starting', {}); // [NEW]
    updateStatus('INITIALIZING');

    client = new Client({
        authStrategy: new LocalAuth({ clientId: "fenz-osm-client" }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] QR Code received');
        systemLog('QR Code Generated', {}); // [NEW]
        
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
        
        if (client && client.info) {
            clientInfo = {
                number: client.info.wid.user,
                name: client.info.pushname
            };
        }
        
        systemLog('Client Connected', clientInfo || {}); // [NEW]
        
        updateStatus('READY');
        if (io) io.emit('wa-status-data', getStatus());
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Auth Failure', msg);
        systemLog('Auth Failure', { error: msg }); // [NEW]
        updateStatus('DISCONNECTED');
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Client was logged out', reason);
        systemLog('Client Disconnected', { reason }); // [NEW]
        resetState();
    });

    client.initialize();
}

async function logout() {
    if (client) {
        try {
            await client.logout();
            systemLog('Client Logged Out (Manual)', {}); // [NEW]
        } catch (e) {
            console.log('[WhatsApp] Logout error:', e.message);
        }
        try {
            await client.destroy();
        } catch (e) {}
    }
    resetState();
}

function resetState() {
    client = null;
    isClientReady = false;
    qrCodeUrl = null;
    clientInfo = null;
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
        info: clientInfo
    };
}

function formatPhone(mobile) {
    if (!mobile) return null;
    let cleaned = mobile.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
        cleaned = '64' + cleaned.substring(1);
    } else if (!cleaned.startsWith('64')) {
        cleaned = '64' + cleaned;
    }
    return `${cleaned}@c.us`;
}

async function sendMessage(mobile, text) {
    if (!isClientReady) throw new Error("WhatsApp client not ready.");
    const chatId = formatPhone(mobile);
    await client.sendMessage(chatId, text);
    return true;
}

module.exports = { init, startClient, logout, getStatus, sendMessage, isReady: () => isClientReady };