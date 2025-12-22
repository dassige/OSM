// services/mailer.js
const config = require('../config');
const getTime = () => new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });

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

//  Expiring Skills Notification
async function sendNotification(member, templateConfig, transporter, isTestMode, logger = console.log, appName) {
    if (!member.expiringSkills || member.expiringSkills.length === 0) return null;

    // --- FILTER LOGIC ---
    let skillsToProcess = member.expiringSkills;

    // Check if filtering is enabled (handle string/boolean)
    const isFilterEnabled = templateConfig.filterOnlyWithUrl === true || templateConfig.filterOnlyWithUrl === 'true';

    if (isFilterEnabled) {
        skillsToProcess = skillsToProcess.filter(s => !!s.url);
    }

    if (skillsToProcess.length === 0) return null; // Abort if nothing to send

    const globalVars = {
        appname: appName || "FENZ OSM Manager",
        name: member.name,
        email: member.email
    };

    const defaults = {
        from: templateConfig.from || `"${globalVars.appname}" <noreply@fenz.osm>`,
        subject: templateConfig.subject || `${globalVars.appname}: Expiring Skills Notification`,
        intro: templateConfig.intro || `<p>Hello <strong>{{name}}</strong>,</p><p>You have expiring skills in OSM. Please complete them ASAP.</p>`,
        // Default templates
        rowHtml: templateConfig.rowHtml || `<li><strong>{{skill}}</strong> - Expires: {{date}} {{critical}} <br> <a href="{{url}}">Form Link</a></li>`,
        rowHtmlNoUrl: templateConfig.rowHtmlNoUrl || `<li><strong>{{skill}}</strong> - Expires: {{date}} {{critical}} (No online form available)</li>`
    };

    const from = replaceVariables(defaults.from, globalVars);
    const subject = replaceVariables(defaults.subject, globalVars);
    const intro = replaceVariables(defaults.intro, globalVars);

    let rowsHtml = '';
    let plainTextList = '';

    skillsToProcess.forEach(skill => {
        // [NEW] Handle Submitted Status
        if (skill.isSubmitted) {
            const criticalLabel = skill.isCritical ? '(CRITICAL)' : '';
            rowsHtml += `<li style="color:#555;"><strong>${skill.skill}</strong> ${criticalLabel} <br> <span style="color:#17a2b8; font-weight:bold; font-size:0.9em;">&#9432; Form submitted and awaiting review</span></li>`;
            plainTextList += `- ${skill.skill}: Form submitted and awaiting review\n`;
            return; // Skip standard template processing for this row
        }
        let fullUrl = skill.url || '';

        // --- TEMPLATE SELECTION ---
        // Choose the template based on whether a URL exists
        const templateToUse = fullUrl ? defaults.rowHtml : defaults.rowHtmlNoUrl;

        if (fullUrl) {
            // Replace variables if they exist, otherwise keep original string (backward compat)
            fullUrl = fullUrl
                .replace(/{{member-name}}/g, encodeURIComponent(member.name))
                .replace(/{{member-email}}/g, encodeURIComponent(member.email));
        }

        const criticalLabel = skill.isCritical ? '(CRITICAL)' : '';

        let row = templateToUse
            .replace(/{{skill}}/g, skill.skill)
            .replace(/{{date}}/g, skill.dueDate)
            .replace(/{{critical}}/g, criticalLabel)
            .replace(/{{url}}/g, fullUrl)
            .replace(/{{next-planned-dates}}/g, skill.nextPlannedDates || "None");

        rowsHtml += row;
        plainTextList += `- ${skill.skill} (${skill.dueDate}) [Next: ${skill.nextPlannedDates}]\n`;
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

// services/mailer.js
async function sendSecurityAlert(details, transporter, appName, superEmail) {
    const subject = `SECURITY ALERT: User Blocked on ${appName}`;
    const body = `
        <h3>Security Alert: User Account Automatically Blocked</h3>
        <p>A user has been blocked after exceeding the maximum number of failed login attempts.</p>
        <ul>
            <li><strong>User Email:</strong> ${details.email}</li>
            <li><strong>Date/Time:</strong> ${new Date().toLocaleString()}</li>
            <li><strong>Failed Attempts:</strong> ${details.attempts}</li>
            <li><strong>IP Address:</strong> ${details.ip}</li>
        </ul>
        <p>Please review the system logs and manually unblock the user if necessary.</p>
    `;
    await transporter.sendMail({ from: superEmail, to: superEmail, subject, html: body, text: stripHtml(body) });
}
module.exports = {
    sendNotification,
    sendPasswordReset,
    sendNewAccountNotification,
    sendAccountDeletionNotification,
    sendSecurityAlert
};