// services/mailer.js
const getTime = () => new Date().toLocaleTimeString();

// Helper to strip HTML tags
function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, '');
}

// 1. Existing Notification Sender
async function sendNotification(member, templateConfig, transporter, isTestMode, logger = console.log) {
    if (!member.expiringSkills || member.expiringSkills.length === 0) {
        return;
    }

    const from = templateConfig.from || '"FENZ OSM Manager" <noreply@fenz.osm>';
    const subject = templateConfig.subject || 'FENZ OSM: Expiring Skills Notification';
    const intro = templateConfig.intro || '<p>Hello, you have expiring Skills due in OSM.</p>';
    const rowTemplate = templateConfig.rowHtml || '<li><strong>{{skill}}</strong> expires on {{date}}</li>';

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

// 2. NEW: Password Reset Sender
async function sendPasswordReset(email, newPassword, transporter) {
    const from = '"FENZ OSM Manager" <noreply@fenz.osm>';
    const subject = 'Security: Password Reset';
    
    const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
            <h2 style="color: #007bff;">Password Reset</h2>
            <p>A password reset was requested for your account.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #666;">Your new temporary password is:</p>
                <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold; color: #333; letter-spacing: 1px;">${newPassword}</p>
            </div>
            <p>Please log in and change your password immediately.</p>
        </div>
    `;

    const messageText = `Password Reset\n\nA password reset was requested. Your new temporary password is: ${newPassword}\n\nPlease log in and change it immediately.`;

    await transporter.sendMail({
        from: from,
        to: email,
        subject: subject,
        text: messageText,
        html: messageHtml
    });
    console.log(`[SMTP] Password reset email sent to ${email}`);
}

module.exports = { sendNotification, sendPasswordReset };