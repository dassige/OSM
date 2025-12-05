// services/whatsapp-service.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client;
let io;
let logEvent = null; 
let qrCodeUrl = null;
let status = 'DISCONNECTED'; 
let isClientReady = false;
let clientInfo = null;

function init(socketIo, logEventCallback) {
    io = socketIo;
    logEvent = logEventCallback;
}

// Helper to log system events safely
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
    systemLog('Client Starting', {});
    updateStatus('INITIALIZING');

    client = new Client({
        authStrategy: new LocalAuth({ clientId: "fenz-osm-client" }),
        puppeteer: {
            headless: true,
            // [UPDATED] Critical flags for Cloud Run/Docker stability
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // <--- PREVENTS CRASHES ON DOCKER/CLOUD RUN
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            // [UPDATED] Increase timeout to 60s for slow cold starts
            timeout: 60000 
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] QR Code received');
        systemLog('QR Code Generated', {}); 
        
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
        
        systemLog('Client Connected', clientInfo || {}); 
        
        updateStatus('READY');
        if (io) io.emit('wa-status-data', getStatus());
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Auth Failure', msg);
        systemLog('Auth Failure', { error: msg });
        updateStatus('DISCONNECTED');
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Client was logged out', reason);
        systemLog('Client Disconnected', { reason }); 
        resetState();
    });

    client.initialize();
}

async function logout() {
    if (client) {
        try {
            await client.logout();
            systemLog('Client Logged Out (Manual)', {});
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