const getTime = () => new Date().toLocaleTimeString();

// Helper to strip HTML tags for the plain text version
function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, '');
}

async function sendNotification(member, templateConfig, transporter, isTestMode, logger = console.log) {
    if (!member.expiringSkills || member.expiringSkills.length === 0) {
        return;
    }

    const from = templateConfig.from || '"FENZ OSM Manager" <noreply@fenz.osm>';
    const subject = templateConfig.subject || 'FENZ OSM: Expiring Skills Notification';
    const intro = templateConfig.intro || '<p>Hello, you have expiring Skills due in OSM.</p>';
    const rowTemplate = templateConfig.rowHtml || '<li><strong>{{skill}}</strong> expires on {{date}}</li>';

    // 1. Build List Items
    let rowsHtml = '';
    let plainTextList = '';

    member.expiringSkills.forEach(skill => {
        const fullUrl = `${skill.url}${encodeURIComponent(member.name)}`;
        const criticalLabel = skill.isCritical ? '(CRITICAL)' : '';
        
        let row = rowTemplate
            .replace(/{{skill}}/g, skill.skill)
            .replace(/{{date}}/g, skill.dueDate)
            .replace(/{{critical}}/g, criticalLabel)
            .replace(/{{url}}/g, fullUrl);
        
        rowsHtml += row;
        plainTextList += `- ${skill.skill} (${skill.dueDate})\n`;
    });

    // 2. Build Final Body
    // CHANGE: Removed <p> wrappers around ${intro} because intro now contains its own block tags
    const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #d32f2f;">${subject}</h2>
            ${intro}
            <ul>
                ${rowsHtml}
            </ul>
            <p style="font-size: 12px; color: #888;">This is an automated notification from FENZ OSM Manager.</p>
        </div>
    `;

    // CHANGE: Strip HTML from intro for the plain text version
    const messageText = `${stripHtml(intro)}\n\n${plainTextList}\n\nLog in to dashboard to complete these.`;

    if (isTestMode) {
        logger(`[${getTime()}] [TEST MODE] Simulating email to: ${member.email}`);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: from,
            to: member.email,
            subject: subject,
            text: messageText,
            html: messageHtml,
        });
        logger(`[${getTime()}] [SMTP] Email sent to ${member.name} (ID: ${info.messageId})`);
    } catch (error) {
        logger(`[${getTime()}] [SMTP ERROR] Failed to send to ${member.name}: ${error.message}`);
        throw error;
    }
}

module.exports = { sendNotification };