// services/mailer.js
const config = require("../config");
const logger = require("./logger");
const getTime = () =>
  new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlVars(variables) {
  const safe = {};
  for (const [key, value] of Object.entries(variables)) {
    safe[key] = typeof value === "string" ? escapeHtml(value) : value;
  }
  return safe;
}

function replaceVariables(text, variables) {
  if (!text) return "";
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{key}} globally
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  }
  return result;
}

function getTemplate(prefs, type, defaults) {
  const json = prefs[type];
  if (json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      return defaults;
    }
  }
  return defaults;
}

async function sendNotification(
  member,
  templateConfig,
  transporter,
  isTestMode,
  logger = console.log,
  appName,
) {
  if (!member.expiringSkills || member.expiringSkills.length === 0) return null;

  let skillsToProcess = member.expiringSkills;
  const isFilterEnabled =
    templateConfig.filterOnlyWithUrl === true ||
    templateConfig.filterOnlyWithUrl === "true";

  if (isFilterEnabled) {
    skillsToProcess = skillsToProcess.filter((s) => !!s.url);
  }

  if (skillsToProcess.length === 0) return null;

  const globalVars = {
    appname: appName || "OpReady",
    name: member.name,
    email: member.email,
  };

  const defaults = {
    from: templateConfig.from || `"${globalVars.appname}" <noreply@opready.app>`,
    subject:
      templateConfig.subject ||
      `${globalVars.appname}: Expiring Skills Notification`,
    intro:
      templateConfig.intro ||
      `<p>Hello <strong>{{name}}</strong>,</p><p>You have expiring skills in OSM. Please complete them ASAP.</p>`,
    rowHtml:
      templateConfig.rowHtml ||
      `<li><strong>{{skill}}</strong> - Expires: {{date}} {{critical}} <br> <a href="{{url}}">Form Link</a></li>`,
    rowHtmlNoUrl:
      templateConfig.rowHtmlNoUrl ||
      `<li><strong>{{skill}}</strong> - Expires: {{date}} {{critical}} (No online form available)</li>`,
  };

  const from = replaceVariables(defaults.from, globalVars);
  const subject = replaceVariables(defaults.subject, globalVars);
  const intro = replaceVariables(defaults.intro, escapeHtmlVars(globalVars));

  let rowsHtml = "";
  let plainTextList = "";

  skillsToProcess.forEach((skill) => {
    if (skill.isSubmitted) {
      const criticalLabel = skill.isCritical ? "(CRITICAL)" : "";
      rowsHtml += `<li style="color:#555;"><strong>${escapeHtml(skill.skill)}</strong> ${criticalLabel} <br> <span style="color:#17a2b8; font-weight:bold; font-size:0.9em;">&#9432; Form submitted and awaiting review</span></li>`;
      plainTextList += `- ${skill.skill}: Form submitted and awaiting review\n`;
      return;
    }
    let fullUrl = skill.url || "";
    const templateToUse = fullUrl ? defaults.rowHtml : defaults.rowHtmlNoUrl;

    if (fullUrl) {
      fullUrl = fullUrl
        .replace(/{{member-name}}/g, encodeURIComponent(member.name))
        .replace(/{{member-email}}/g, encodeURIComponent(member.email));
    }

    const criticalLabel = skill.isCritical ? "(CRITICAL)" : "";
    let row = templateToUse
      .replace(/{{skill}}/g, escapeHtml(skill.skill))
      .replace(/{{date}}/g, escapeHtml(skill.dueDate))
      .replace(/{{critical}}/g, criticalLabel)
      .replace(/{{url}}/g, escapeHtml(fullUrl))
      .replace(/{{next-planned-dates}}/g, escapeHtml(skill.nextPlannedDates || "None"));

    rowsHtml += row;
    plainTextList += `- ${skill.skill} (${skill.dueDate}) [Next: ${skill.nextPlannedDates}]\n`;
  });

  const messageHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            ${intro}
            <ul>${rowsHtml}</ul>
            <p style="font-size: 12px; color: #888; margin-top:20px;">Notification from ${escapeHtml(globalVars.appname)}.</p>
        </div>
    `;

  const messageText = `${stripHtml(intro)}\n\n${plainTextList}`;

  if (isTestMode) {
    logger(`[${getTime()}] [TEST MODE] Simulating email to: ${member.email}`);
    return { html: messageHtml, text: messageText };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: member.email,
      subject,
      text: messageText,
      html: messageHtml,
    });
    logger(
      `[${getTime()}] [SMTP] Email sent to ${member.name} (ID: ${info.messageId})`,
    );
    return { info, html: messageHtml, text: messageText };
  } catch (error) {
    logger(
      `[${getTime()}] [SMTP ERROR] Failed to send to ${member.name}: ${error.message}`,
    );
    throw error;
  }
}

async function sendPasswordReset(
  email,
  newPassword,
  transporter,
  appName,
  templatePref,
) {
  const variables = {
    appname: appName || "OpReady",
    email: email,
    password: newPassword,
  };
  const defaults = {
    from: `"${variables.appname}" <noreply@opready.app>`,
    subject: `${variables.appname}: Password Reset`,
    body: `<p>A password reset was requested.</p><p>New Password: <strong>{{password}}</strong></p>`,
  };
  const config = templatePref || defaults;
  const from = replaceVariables(config.from || defaults.from, variables);
  const subject = replaceVariables(config.subject || defaults.subject, variables);
  const body = replaceVariables(config.body || defaults.body, escapeHtmlVars(variables));

  await transporter.sendMail({
    from,
    to: email,
    subject,
    html: body,
    text: stripHtml(body),
  });
  logger.info(`[SMTP] Password reset email sent to ${email}`);
}

async function sendNewAccountNotification(
  email,
  name,
  password,
  transporter,
  appName,
  templatePref,
) {
  const variables = {
    appname: appName || "OpReady",
    name: name,
    email: email,
    password: password,
  };
  const defaults = {
    from: `"${variables.appname}" <noreply@opready.app>`,
    subject: `Welcome to ${variables.appname}`,
    body: `<p>Welcome <strong>{{name}}</strong>,</p><p>Your account has been created.</p><p>Password: <strong>{{password}}</strong></p>`,
  };
  const config = templatePref || defaults;
  const from = replaceVariables(config.from || defaults.from, variables);
  const subject = replaceVariables(config.subject || defaults.subject, variables);
  const body = replaceVariables(config.body || defaults.body, escapeHtmlVars(variables));

  await transporter.sendMail({
    from,
    to: email,
    subject,
    html: body,
    text: stripHtml(body),
  });
  logger.info(`[SMTP] New account email sent to ${email}`);
}

async function sendAccountDeletionNotification(
  email,
  name,
  transporter,
  appName,
  templatePref,
) {
  const variables = {
    appname: appName || "OpReady",
    name: name,
    email: email,
  };
  const defaults = {
    from: `"${variables.appname}" <noreply@opready.app>`,
    subject: `${variables.appname}: Account Deleted`,
    body: `<p>Hello {{name}},</p><p>Your account on {{appname}} has been deleted.</p>`,
  };
  const config = templatePref || defaults;
  const from = replaceVariables(config.from || defaults.from, variables);
  const subject = replaceVariables(config.subject || defaults.subject, variables);
  const body = replaceVariables(config.body || defaults.body, escapeHtmlVars(variables));

  await transporter.sendMail({
    from,
    to: email,
    subject,
    html: body,
    text: stripHtml(body),
  });
  logger.info(`[SMTP] Deletion notification sent to ${email}`);
}

async function sendSurveyInvitation(
  email,
  name,
  surveyName,
  surveyLink,
  transporter,
  appName,
  templatePref,
  isAnonymous = true,
) {
  const variables = {
    appname: appName || "OpReady",
    name: name || "Member",
    surveyName,
    surveyLink,
  };
  const defaults = {
    email: {
      from: `"${variables.appname}" <noreply@opready.app>`,
      subject: `Action Required: ${variables.surveyName}`,
      body: `<p>Please complete your anonymous survey: <a href="{{surveyLink}}">{{surveyLink}}</a></p>`,
      bodyNamed: `<p>Please complete your non-anonymous survey (identity recorded): <a href="{{surveyLink}}">{{surveyLink}}</a></p>`,
    },
  };

  const config =
    templatePref && templatePref.email ? templatePref.email : defaults.email;
  const from = replaceVariables(config.from || defaults.email.from, variables);
  const subject = replaceVariables(
    config.subject || defaults.email.subject,
    variables,
  );

  // Logic: Use non-anonymous body if flag is false AND the template exists
  let bodyTemplate = config.body || defaults.email.body;
  if (!isAnonymous && config.bodyNamed) {
    bodyTemplate = config.bodyNamed;
  }
  const body = replaceVariables(bodyTemplate, escapeHtmlVars(variables));

  await transporter.sendMail({
    from,
    to: email,
    subject,
    html: body,
    text: stripHtml(body),
  });
}

async function sendSecurityAlert(details, transporter, appName, superEmail) {
  const subject = `SECURITY ALERT: User Blocked on ${appName}`;
  const body = `
        <h3>Security Alert: User Account Automatically Blocked</h3>
        <p>A user has been blocked after exceeding the maximum number of failed login attempts.</p>
        <ul>
            <li><strong>User Email:</strong> ${escapeHtml(details.email)}</li>
            <li><strong>Date/Time:</strong> ${new Date().toLocaleString(config.locale, { timeZone: config.timezone })}</li>
            <li><strong>Failed Attempts:</strong> ${details.attempts}</li>
            <li><strong>IP Address:</strong> ${escapeHtml(details.ip)}</li>
        </ul>
        <p>Please review the system logs and manually unblock the user if necessary.</p>
    `;
  await transporter.sendMail({
    from: superEmail,
    to: superEmail,
    subject,
    html: body,
    text: stripHtml(body),
  });
}

module.exports = {
  sendNotification,
  sendPasswordReset,
  sendNewAccountNotification,
  sendAccountDeletionNotification,
  sendSurveyInvitation,
  sendSecurityAlert,
};
