// services/whatsapp-service.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const logger = require('./logger');

let client;
let io;
let logEvent = null;
let qrCodeUrl = null;
let status = 'DISCONNECTED';
let isClientReady = false;
let clientInfo = null;

let intentionalLogout = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
const RECONNECT_DELAYS_MS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1min, 5min

const MAX_QUEUE_SIZE = 100;
const MAX_MESSAGE_RETRIES = 3;
let messageQueue = []; // [{ mobile, text, retries, addedAt }]

function init(socketIo, logEventCallback) {
    io = socketIo;
    logEvent = logEventCallback;
}

async function systemLog(title, payload = {}) {
    if (logEvent) {
        try {
            await logEvent('System', 'WhatsApp', title, payload);
        } catch (e) {
            logger.error("[WhatsApp] Logging failed", { error: e.message });
        }
    }
}

function startClient() {
    if (status !== 'DISCONNECTED') return;

    logger.info('[WhatsApp] Starting client...');
    systemLog('Client Starting', {});
    updateStatus('INITIALIZING');

    client = new Client({
        authStrategy: new LocalAuth({ clientId: "opready-client" }),
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/chromium-browser',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            timeout: 60000
        }
    });

    client.on('qr', (qr) => {
        logger.info('[WhatsApp] QR Code received');
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) {
                qrCodeUrl = url;
                updateStatus('QR_READY');
                io.emit('wa-qr', url);
            }
        });
    });

    client.on('ready', () => {
        logger.info('[WhatsApp] Client is ready!');
        isClientReady = true;
        qrCodeUrl = null;
        reconnectAttempts = 0;
        clearReconnectTimer();

        if (client && client.info) {
            clientInfo = {
                number: client.info.wid.user,
                name: client.info.pushname
            };
        }

        systemLog('Client Connected', clientInfo || {});
        updateStatus('READY');
        if (io) io.emit('wa-status-data', getStatus());

        flushMessageQueue();
    });

    client.on('auth_failure', msg => {
        logger.error('[WhatsApp] Auth Failure', { details: msg });
        systemLog('Auth Failure', { error: msg });
        updateStatus('DISCONNECTED');
    });

    client.on('disconnected', (reason) => {
        logger.info('[WhatsApp] Client disconnected', { reason });
        systemLog('Client Disconnected', { reason });
        resetState(false);

        if (!intentionalLogout) {
            scheduleReconnect();
        }
    });

    client.initialize();
}

function scheduleReconnect() {
    const delayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempts++;

    logger.info(`[WhatsApp] Scheduling reconnect attempt #${reconnectAttempts} in ${delayMs / 1000}s`);
    systemLog('Reconnect Scheduled', { attempt: reconnectAttempts, delayMs });
    updateStatus('RECONNECTING');

    reconnectTimer = setTimeout(() => {
        logger.info(`[WhatsApp] Reconnect attempt #${reconnectAttempts}`);
        startClient();
    }, delayMs);
}

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

async function logout() {
    intentionalLogout = true;
    clearReconnectTimer();

    if (client) {
        try {
            await client.logout();
            systemLog('Client Logged Out (Manual)', {});
        } catch (e) {
            logger.warn('[WhatsApp] Logout error', { error: e.message });
        }
        try {
            await client.destroy();
        } catch (e) {}
    }
    resetState(true);
}

// preserveQueue: keep queued messages across reconnect cycles
function resetState(clearQueue = false) {
    client = null;
    isClientReady = false;
    qrCodeUrl = null;
    clientInfo = null;

    if (clearQueue) {
        messageQueue = [];
        reconnectAttempts = 0;
        intentionalLogout = false;
    }

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
        info: clientInfo,
        queueSize: messageQueue.length,
        reconnectAttempts
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
    if (!isClientReady) {
        if (messageQueue.length >= MAX_QUEUE_SIZE) {
            throw new Error("WhatsApp client not ready and message queue is full.");
        }
        logger.warn('[WhatsApp] Client not ready — queuing message', { mobile });
        messageQueue.push({ mobile, text, retries: 0, addedAt: new Date().toISOString() });
        return false; // queued, not sent
    }

    const chatId = formatPhone(mobile);
    await client.sendMessage(chatId, text);
    return true;
}

async function flushMessageQueue() {
    if (messageQueue.length === 0) return;

    logger.info(`[WhatsApp] Flushing ${messageQueue.length} queued message(s)`);
    const toFlush = [...messageQueue];
    messageQueue = [];

    for (const item of toFlush) {
        if (!isClientReady) {
            // Client dropped again during flush — re-queue remaining
            messageQueue.unshift(item);
            break;
        }
        try {
            const chatId = formatPhone(item.mobile);
            await client.sendMessage(chatId, item.text);
            logger.info('[WhatsApp] Queued message sent', { mobile: item.mobile });
        } catch (e) {
            logger.error('[WhatsApp] Failed to send queued message', { mobile: item.mobile, error: e.message });
            item.retries++;
            if (item.retries < MAX_MESSAGE_RETRIES) {
                messageQueue.push(item); // re-queue for next reconnect
            } else {
                logger.warn('[WhatsApp] Dropping message after max retries', { mobile: item.mobile });
                systemLog('Message Dropped (Max Retries)', { mobile: item.mobile, retries: item.retries });
            }
        }
    }
}

module.exports = {
    init,
    startClient,
    logout,
    getStatus,
    sendMessage,
    isReady: () => isClientReady
};
