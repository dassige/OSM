const getTime = () => new Date().toLocaleTimeString();

async function sendNotification(member, emailInfo, transporter, isTestMode, logger = console.log) {
    if (!member.expiringSkills || member.expiringSkills.length === 0) {
        return;
    }

    // --- Construct Email Content ---
    let messageText = emailInfo.text;
    let messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #d32f2f;">Expiring Skills Notification</h2>
            <p>Hello, you have expiring Skills due in OSM. Please complete these ASAP:</p>
            <ul>
    `;

    member.expiringSkills.forEach(skill => {
        const fullUrl = `${skill.url}${encodeURIComponent(member.name)}`;
        
        // Plain text
        messageText += `\r\nSkill: '${skill.skill}' expires on ${skill.dueDate}`;
        messageText += `\r\nTo complete the OI Click here : ${fullUrl}`;
        
        // HTML
        messageHtml += `
            <li style="margin-bottom: 15px;">
                <strong>${skill.skill}</strong> ${skill.isCritical ? '(CRITICAL)' : ''}<br>
                <span style="color: #666;">Expires on: ${skill.dueDate}</span><br>
                <a href="${fullUrl}" style="color: #007bff; font-weight: bold; text-decoration: none;">Complete the form here</a>
            </li>
        `;
    });

    messageHtml += `
            </ul>
            <p style="font-size: 12px; color: #888;">This is an automated notification from FENZ OSM Manager.</p>
        </div>
    `;

    // --- Send Logic ---
    if (isTestMode) {
        logger(`[${getTime()}] [TEST MODE] Simulating email to: ${member.email}`);
        logger(`[${getTime()}] [TEST MODE] Content would contain ${member.expiringSkills.length} skills.`);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: emailInfo.from,
            to: member.email,
            subject: emailInfo.subject,
            text: messageText,
            html: messageHtml,
        });
        logger(`[${getTime()}] [SMTP] Email sent to ${member.name} (ID: ${info.messageId})`);
    } catch (error) {
        logger(`[${getTime()}] [SMTP ERROR] Failed to send to ${member.name}: ${error.message}`);
        throw error; // Re-throw to let the caller know it failed
    }
}

module.exports = { sendNotification };