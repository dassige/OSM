// services/messenger-service.js
const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

async function sendMessage(messengerId, text) {
    if (!PAGE_ACCESS_TOKEN) {
        throw new Error("MESSENGER_PAGE_ACCESS_TOKEN is not defined in .env");
    }

    if (!messengerId) {
        throw new Error("No Messenger ID (PSID) provided.");
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: messengerId },
                message: { text: text },
                messaging_type: "MESSAGE_TAG",
                tag: "ACCOUNT_UPDATE" // Allows sending outside the 24h window for notifications
            }
        );
        return response.data;
    } catch (error) {
        const errMsg = error.response && error.response.data 
            ? JSON.stringify(error.response.data.error) 
            : error.message;
        throw new Error(`Messenger API Error: ${errMsg}`);
    }
}

module.exports = { sendMessage };