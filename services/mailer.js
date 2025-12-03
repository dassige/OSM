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
        return null;
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
        // Return content even in test mode
        return { html: messageHtml, text: messageText }; 
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
        
        // UPDATED: Return the content used
        return { info, html: messageHtml, text: messageText };

    } catch (error) {
        logger(`[${getTime()}] [SMTP ERROR] Failed to send to ${member.name}: ${error.message}`);
        throw error;
    }
}

// 2. Password Reset Sender
async function sendPasswordReset(email, newPassword, transporter, appName) {
    const applicationName = appName || "FENZ OSM Manager";
    const from = `"${applicationName}" <noreply@fenz.osm>`;
    const subject = `${applicationName}: Password Reset`;
    
    const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
            <h2 style="color: #007bff;">Password Reset</h2>
            <p>A password reset was requested for your account on <strong>${applicationName}</strong>.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #666;">Your new temporary password is:</p>
                <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold; color: #333; letter-spacing: 1px;">${newPassword}</p>
            </div>
            <p><strong>Important:</strong> Please log in and change your password immediately.</p>
        </div>
    `;

    const messageText = `Password Reset\n\nA password reset was requested for ${applicationName}.\nYour new temporary password is: ${newPassword}\n\nPlease log in and change it immediately.`;

    await transporter.sendMail({
        from: from,
        to: email,
        subject: subject,
        text: messageText,
        html: messageHtml
    });
    console.log(`[SMTP] Password reset email sent to ${email}`);
}
async function sendNewAccountNotification(email, name, password, transporter, appName) {
    const applicationName = appName || "FENZ OSM Manager"; // Fallback if undefined
    const from = `"${applicationName}" <noreply@fenz.osm>`;
    const subject = `Welcome to ${applicationName}`;
    
    const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
            <h2 style="color: #007bff;">Welcome, ${name}</h2>
            <p>An account has been created for you on <strong>${applicationName}</strong>.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #666;">Your temporary password is:</p>
                <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold; color: #333; letter-spacing: 1px;">${password}</p>
            </div>
            <p><strong>Important:</strong> Please log in and change your password immediately.</p>
        </div>
    `;

    const messageText = `Welcome ${name},\n\nAn account has been created for you on ${applicationName}.\nYour temporary password is: ${password}\n\nPlease log in and change it immediately.`;

    await transporter.sendMail({
        from: from,
        to: email,
        subject: subject,
        text: messageText,
        html: messageHtml
    });
    console.log(`[SMTP] New account email sent to ${email}`);
}
async function sendAccountDeletionNotification(email, name, transporter, appName) {
    const applicationName = appName || "FENZ OSM Manager";
    const from = `"${applicationName}" <noreply@fenz.osm>`;
    const subject = `${applicationName}: Account Deleted`;
    
    const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
            <h2 style="color: #d32f2f;">Account Deleted</h2>
            <p>Hello ${name},</p>
            <p>Your account on <strong>${applicationName}</strong> has been deleted by an administrator.</p>
            <p>You can no longer access the system.</p>
            <hr style="border:0; border-top:1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #888;">If you believe this is an error, please contact your Station Administrator.</p>
        </div>
    `;

    const messageText = `Hello ${name},\n\nYour account on ${applicationName} has been deleted by an administrator.\n\nYou can no longer access the system.`;

    await transporter.sendMail({
        from: from,
        to: email,
        subject: subject,
        text: messageText,
        html: messageHtml
    });
    console.log(`[SMTP] Deletion notification sent to ${email}`);
}
module.exports = { sendNotification, sendPasswordReset, sendNewAccountNotification , sendAccountDeletionNotification };