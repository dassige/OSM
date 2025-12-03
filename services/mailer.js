// services/mailer.js
const getTime = () => new Date().toLocaleTimeString();

// Helper: Strip HTML tags
function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, '');
}

// Helper: Generic Variable Replacement
function replaceVariables(text, variables) {
    if (!text) return "";
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
        // Replace {{key}} globally
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value);
    }
    return result;
}

// Helper: Get Default Template if DB is empty
function getTemplate(prefs, type, defaults) {
    const json = prefs[type];
    if (json) {
        try { return JSON.parse(json); } catch (e) { return defaults; }
    }
    return defaults;
}

// 1. Expiring Skills Notification
async function sendNotification(member, templateConfig, transporter, isTestMode, logger = console.log, appName) {
    if (!member.expiringSkills || member.expiringSkills.length === 0) return null;

    // Common Variables
    const globalVars = {
        appname: appName || "FENZ OSM Manager",
        name: member.name,
        email: member.email
    };

    // 1. Process From/Subject/Intro with Global Vars
    const from = replaceVariables(templateConfig.from || '"{{appname}}" <noreply@fenz.osm>', globalVars);
    const subject = replaceVariables(templateConfig.subject || '{{appname}}: Expiring Skills Notification', globalVars);
    const intro = replaceVariables(templateConfig.intro || '<p>Hello {{name}},</p><p>You have expiring Skills due.</p>', globalVars);
    const rowTemplate = templateConfig.rowHtml || '<li><strong>{{skill}}</strong> expires on {{date}}</li>';

    // 2. Build the rows
    let rowsHtml = '';
    let plainTextList = '';

    member.expiringSkills.forEach(skill => {
        const fullUrl = `${skill.url}${encodeURIComponent(member.name)}`;
        const criticalLabel = skill.isCritical ? '(CRITICAL)' : '';
        
        // Row specific replacement
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
            ${intro}
            <ul>${rowsHtml}</ul>
            <p style="font-size: 12px; color: #888; margin-top:20px;">Notification from ${globalVars.appname}.</p>
        </div>
    `;

    const messageText = `${stripHtml(intro)}\n\n${plainTextList}`;

    if (isTestMode) {
        logger(`[${getTime()}] [TEST MODE] Simulating email to: ${member.email}`);
        return { html: messageHtml, text: messageText }; 
    }

    try {
        const info = await transporter.sendMail({ from, to: member.email, subject, text: messageText, html: messageHtml });
        logger(`[${getTime()}] [SMTP] Email sent to ${member.name} (ID: ${info.messageId})`);
        return { info, html: messageHtml, text: messageText };
    } catch (error) {
        logger(`[${getTime()}] [SMTP ERROR] Failed to send to ${member.name}: ${error.message}`);
        throw error;
    }
}

// 2. Password Reset
async function sendPasswordReset(email, newPassword, transporter, appName, templatePref) {
    const variables = {
        appname: appName || "FENZ OSM Manager",
        email: email,
        password: newPassword
    };

    const defaults = {
        from: `"${variables.appname}" <noreply@fenz.osm>`,
        subject: `${variables.appname}: Password Reset`,
        body: `<p>A password reset was requested.</p><p>New Password: <strong>{{password}}</strong></p>`
    };

    const config = templatePref || defaults;
    const from = replaceVariables(config.from || defaults.from, variables);
    const subject = replaceVariables(config.subject || defaults.subject, variables);
    const body = replaceVariables(config.body || defaults.body, variables);

    await transporter.sendMail({ from, to: email, subject, html: body, text: stripHtml(body) });
    console.log(`[SMTP] Password reset email sent to ${email}`);
}

// 3. New Account
async function sendNewAccountNotification(email, name, password, transporter, appName, templatePref) {
    const variables = {
        appname: appName || "FENZ OSM Manager",
        name: name,
        email: email,
        password: password
    };

    const defaults = {
        from: `"${variables.appname}" <noreply@fenz.osm>`,
        subject: `Welcome to ${variables.appname}`,
        body: `<p>Welcome <strong>{{name}}</strong>,</p><p>Your account has been created.</p><p>Password: <strong>{{password}}</strong></p>`
    };

    const config = templatePref || defaults;
    const from = replaceVariables(config.from || defaults.from, variables);
    const subject = replaceVariables(config.subject || defaults.subject, variables);
    const body = replaceVariables(config.body || defaults.body, variables);

    await transporter.sendMail({ from, to: email, subject, html: body, text: stripHtml(body) });
    console.log(`[SMTP] New account email sent to ${email}`);
}

// 4. Account Deletion
async function sendAccountDeletionNotification(email, name, transporter, appName, templatePref) {
    const variables = {
        appname: appName || "FENZ OSM Manager",
        name: name,
        email: email
    };

    const defaults = {
        from: `"${variables.appname}" <noreply@fenz.osm>`,
        subject: `${variables.appname}: Account Deleted`,
        body: `<p>Hello {{name}},</p><p>Your account on {{appname}} has been deleted.</p>`
    };

    const config = templatePref || defaults;
    const from = replaceVariables(config.from || defaults.from, variables);
    const subject = replaceVariables(config.subject || defaults.subject, variables);
    const body = replaceVariables(config.body || defaults.body, variables);

    await transporter.sendMail({ from, to: email, subject, html: body, text: stripHtml(body) });
    console.log(`[SMTP] Deletion notification sent to ${email}`);
}

module.exports = { 
    sendNotification, 
    sendPasswordReset, 
    sendNewAccountNotification, 
    sendAccountDeletionNotification 
};