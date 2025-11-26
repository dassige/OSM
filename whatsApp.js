const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client; // Declare the client globally

// Function to initialize the WhatsApp client
const initializeWhatsAppClient = async () => {
    return new Promise((resolve, reject) => {
        client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            }
        });

        client.on('qr', (qr) => {
            // Generate and display QR code in the terminal
            qrcode.generate(qr, { small: true });
            console.log('Scan the QR code to authenticate...');
        });

        client.on('ready', () => {
            console.log('Client is ready!');
            resolve(client); // Resolve the promise when the client is ready
        });

        client.on('auth_failure', (message) => {
            console.error('Authentication failed:', message);
            reject(new Error('Authentication failed'));
        });

        client.on('disconnected', (reason) => {
            console.log('Client disconnected:', reason);
        });

        client.initialize();
    });
};

// Function to send a message
const sendMessage = async (phoneNumber, message) => {
    if (!client) {
        throw new Error('Client is not initialized. Call initializeWhatsAppClient() first.');
    }

    const chatId = `${phoneNumber}@c.us`;

    try {
        await client.sendMessage(chatId, message);
        console.log('Message sent successfully!');
    } catch (err) {
        console.error('Failed to send message:', err);
    }
};

module.exports = { initializeWhatsAppClient, sendMessage };