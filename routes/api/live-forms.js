// routes/api/live-forms.js
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const formsService = require("../../services/forms-service");
const config = require("../../config");
const logger = require("../../services/logger");
const whatsappService = require("../../services/whatsapp-service");
const { hasRole } = require("../../middleware/auth");
const { publicSubmitLimiter } = require("../../middleware/rate-limiter");
const { formatMemberName } = require("../../services/rank-config");

function convertHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
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

router.get("/", hasRole("admin"), async (req, res) => {
  try {
    const filters = {
      memberId: req.query.memberId,
      skillId: req.query.skillId,
      status: req.query.status,
      sentStart: req.query.sentStart,
      sentEnd: req.query.sentEnd,
      subStart: req.query.subStart,
      subEnd: req.query.subEnd,
      tries: req.query.tries,
      isArchived: req.query.isArchived,
    };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    const result = await formsService.getLiveForms(filters, { limit, offset });
    res.json({ ...result, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export", hasRole("admin"), async (req, res) => {
  try {
    const filters = {
      isArchived: req.query.isArchived,
      memberId: req.query.memberId,
      skillId: req.query.skillId,
      status: req.query.status,
      sentStart: req.query.sentStart,
      sentEnd: req.query.sentEnd,
      subStart: req.query.subStart,
      subEnd: req.query.subEnd,
      tries: req.query.tries,
    };
    const result = await formsService.getLiveForms(filters, null);
    const filename = `live_forms_export_${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(result.records, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

router.delete("/all", hasRole("superadmin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const filters = {
      memberId: req.query.memberId || req.body.memberId,
      isArchived: req.query.isArchived,
      skillId: req.query.skillId || req.body.skillId,
      status: req.query.status || req.body.status,
      sentStart: req.query.sentStart || req.body.sentStart,
      sentEnd: req.query.sentEnd || req.body.sentEnd,
      subStart: req.query.subStart || req.body.subStart,
      subEnd: req.query.subEnd || req.body.subEnd,
      tries: req.query.tries || req.body.tries,
    };
    const count = await formsService.purgeLiveForms(filters);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Live Forms", "Filtered Purge Executed", {
      deletedCount: count,
      targetScope: filters.isArchived === "true" ? "Archived" : "Active",
      filtersApplied: filters,
    });
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const { status, isArchived } = req.body;
    const id = req.params.id;

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    if (isArchived !== undefined) {
      await formsService.setArchiveStatus(id, isArchived);
      await db.logEvent(actor, "Live Forms", isArchived ? "Record Archived" : "Record Restored", { recordId: id });
    }
    if (status !== undefined) {
      await formsService.updateLiveFormStatus(id, status);
      await db.logEvent(actor, "Live Forms", "Status Updated", { recordId: id, newStatus: status });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await formsService.deleteLiveForm(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Live Forms", "Live Form Record Deleted", { recordId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/access/:code", publicSubmitLimiter, async (req, res) => {
  try {
    const result = await formsService.getLiveFormByCode(req.params.code);
    if (!result) return res.status(404).json({ error: "Form link invalid or expired." });

    await db.logEvent("System", "Live Forms", "Form Link Accessed", {
      memberName: formatMemberName(result.member_rank, result.member_last_name, result.member_first_name, result.member_name),
      skillName: result.skill_name,
      attemptNumber: result.tries || 1,
      accessCode: req.params.code,
    });

    if (["submitted", "accepted", "rejected"].includes(result.form_status)) {
      return res.status(403).json({ error: "This form has been already submitted", status: result.form_status });
    }
    if (result.form_status === "disabled") {
      return res.status(403).json({ error: "This form has been disabled", status: "disabled" });
    }

    res.json({
      status: "sent",
      name: result.form_name,
      intro: result.intro,
      structure: result.structure,
      member: formatMemberName(result.member_rank, result.member_last_name, result.member_first_name, result.member_name),
      skill: result.skill_name,
      tries: result.tries || 1,
      maxTries: result.max_tries,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/submit/:code", publicSubmitLimiter, async (req, res) => {
  try {
    const form = await formsService.getLiveFormByCode(req.params.code);
    if (!form || form.form_status !== "sent") {
      return res.status(403).json({ error: "Form session invalid or closed" });
    }

    await formsService.submitLiveForm(req.params.code, req.body);
    const { achieved, maximum, feedback } = await formsService.calculateFormScore(form.structure, req.body);

    const threshold = parseFloat(form.min_score);
    let isPass = false;
    if (form.min_score_type === "percentage") {
      isPass = maximum > 0 ? (achieved / maximum) * 100 >= threshold : true;
    } else {
      isPass = achieved >= threshold;
    }

    const currentTry = form.tries || 1;
    const maxAllowed = parseInt(form.max_tries) || 1;

    await db.logEvent("System", "Live Forms", "Form Submitted & Scored", {
      formId: form.id,
      memberName: formatMemberName(form.member_rank, form.member_last_name, form.member_first_name, form.member_name),
      skillName: form.skill_name,
      score: achieved,
      maxScore: maximum,
      outcome: isPass ? "Passed" : currentTry < maxAllowed ? "Retry" : "Failed",
      aiUsed: config.aiConfig.enabled,
    });

    if (isPass) {
      await formsService.updateLiveFormStatus(form.id, "accepted", achieved, feedback);
      return res.json({ status: "accepted", score: achieved });
    } else if (currentTry < maxAllowed) {
      await formsService.incrementTries(form.id);
      const database = await db.initDB();
      await database.run(
        "UPDATE live_forms SET form_status = 'sent', current_score = ?, ai_feedback = ? WHERE id = ?",
        achieved, JSON.stringify(feedback || {}), form.id
      );
      return res.status(400).json({ status: "retry", currentTry: currentTry, maxAllowed, message: "Minimum score not reached. Please try again." });
    } else {
      await formsService.updateLiveFormStatus(form.id, "rejected", achieved, feedback);
      return res.json({ status: "rejected", score: achieved });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/review/:id", hasRole("admin"), async (req, res) => {
  try {
    const result = await formsService.getLiveFormSubmission(req.params.id);
    if (!result) return res.status(404).json({ error: "Record not found" });

    const scoreInfo = await formsService.calculateFormScore(result.structure, result.form_submitted_data || {}, true);

    res.json({
      id: result.id,
      form_status: result.form_status,
      is_archived: !!result.is_archived,
      tries: result.tries,
      max_tries: result.max_tries,
      name: result.form_name,
      intro: result.intro,
      structure: result.structure,
      member: formatMemberName(result.member_rank, result.member_last_name, result.member_first_name, result.member_name),
      member_email: result.member_email,
      member_mobile: result.member_mobile,
      member_prefs: result.member_prefs,
      skill: result.skill_name,
      submittedData: result.form_submitted_data,
      submittedAt: result.form_submitted_datetime,
      ai_feedback: result.ai_feedback,
      achieved_score: result.current_score,
      max_score: scoreInfo.maximum,
      min_score: result.min_score,
      min_score_type: result.min_score_type,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/accept/:id", hasRole("admin"), async (req, res) => {
  try {
    const { notifyEmail, notifyWa, customComment } = req.body;
    const id = req.params.id;
    const isDemo = config.appMode === "demo"; 

    await formsService.updateLiveFormStatus(id, "accepted");
    const form = await formsService.getLiveFormSubmission(id);
    const member = {
      name:   formatMemberName(form.member_rank, form.member_last_name, form.member_first_name, form.member_name),
      email:  form.member_email,
      mobile: form.member_mobile,
    };

    const prefs = await db.getPreferences();
    let tplEmail = { from: null, subject: "Skill Verification Approved", body: null };
    let tplWa = { body: null };

    if (prefs.tpl_accepted) {
      try {
        const parsed = JSON.parse(prefs.tpl_accepted);
        if (parsed.email) {
          if (parsed.email.from) tplEmail.from = parsed.email.from;
          if (parsed.email.subject) tplEmail.subject = parsed.email.subject;
          if (parsed.email.body) tplEmail.body = parsed.email.body;
        }
        if (parsed.whatsapp && parsed.whatsapp.body) {
          tplWa.body = parsed.whatsapp.body;
        }
      } catch (e) { logger.warn("Template parse error", e); }
    }

    const applyVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, member.name)
        .replace(/{{email}}/g, member.email)
        .replace(/{{skill}}/g, form.skill_name)
        .replace(/{{appname}}/g, config.ui.loginTitle)
        .replace(/{{url}}/g, "")
        .replace(/{{custom_comment}}/g, customComment || "");
    };
    const applyHtmlVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, escapeHtml(member.name))
        .replace(/{{email}}/g, escapeHtml(member.email))
        .replace(/{{skill}}/g, escapeHtml(form.skill_name))
        .replace(/{{appname}}/g, escapeHtml(config.ui.loginTitle))
        .replace(/{{url}}/g, "")
        .replace(/{{custom_comment}}/g, escapeHtml(customComment || ""));
    };

    if (notifyEmail && member.email) {
      const from = tplEmail.from ? applyVars(tplEmail.from) : config.ui.loginTitle + " <noreply@opready.app>";
      const subject = applyVars(tplEmail.subject);
      const htmlBody = tplEmail.body ? applyHtmlVars(tplEmail.body) : `<p>Hello ${escapeHtml(member.name)}, your submission for &#34;${escapeHtml(form.skill_name)}&#34; has been APPROVED.</p>`;
      const textBody = convertHtmlToText(htmlBody);

      if (!isDemo) {
        await config.transporter.sendMail({ from, to: member.email, subject, text: textBody, html: htmlBody });
      }
    }

    if (notifyWa && member.mobile && config.enableWhatsApp) {
      let message = tplWa.body ? applyVars(tplWa.body) : `Hello ${member.name}, your submission for "${form.skill_name}" has been APPROVED.`;
      if (!isDemo) {
        await whatsappService.sendMessage(member.mobile, message);
      }
    }

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Live Forms", "Submission Approved", {
      memberName: formatMemberName(form.member_rank, form.member_last_name, form.member_first_name, form.member_name),
      skillName: form.skill_name,
      notifiedVia: { email: notifyEmail, whatsapp: notifyWa },
      adminComment: customComment || "No comment provided",
    });
    res.json({ success: true, demo: isDemo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/reject/:id", hasRole("admin"), async (req, res) => {
  try {
    const { notifyEmail, notifyWa, customComment, generateNew } = req.body;
    const id = req.params.id;
    const isDemo = config.appMode === "demo";

    await formsService.updateLiveFormStatus(id, "rejected");
    if (generateNew) {
      await formsService.setArchiveStatus(id, true);
    }
    const form = await formsService.getLiveFormSubmission(id);
    const member = {
      name:   formatMemberName(form.member_rank, form.member_last_name, form.member_first_name, form.member_name),
      email:  form.member_email,
      mobile: form.member_mobile,
    };

    let newLink = "";
    if (generateNew) {
      const newCode = await formsService.createRetryLiveForm(id);
      const baseUrl = req.protocol + "://" + req.get("host");
      newLink = `${baseUrl}/forms-view.html?code=${newCode}`;
    }

    const prefs = await db.getPreferences();
    let tplEmail = { from: null, subject: "Skill Verification Returned", bodyRetry: null, bodySimple: null };
    let tplWa = { bodyRetry: null, bodySimple: null };

    if (prefs.tpl_rejected) {
      try {
        const parsed = JSON.parse(prefs.tpl_rejected);
        if (parsed.email) {
          if (parsed.email.from) tplEmail.from = parsed.email.from;
          if (parsed.email.subject) tplEmail.subject = parsed.email.subject;
          if (parsed.email.bodyRetry) tplEmail.bodyRetry = parsed.email.bodyRetry;
          if (parsed.email.bodySimple) tplEmail.bodySimple = parsed.email.bodySimple;
        }
        if (parsed.whatsapp) {
          if (parsed.whatsapp.bodyRetry) tplWa.bodyRetry = parsed.whatsapp.bodyRetry;
          if (parsed.whatsapp.bodySimple) tplWa.bodySimple = parsed.whatsapp.bodySimple;
        }
      } catch (e) { logger.warn("Template parse error", e); }
    }

    const applyVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, member.name)
        .replace(/{{email}}/g, member.email)
        .replace(/{{skill}}/g, form.skill_name)
        .replace(/{{appname}}/g, config.ui.loginTitle)
        .replace(/{{url}}/g, newLink || "")
        .replace(/{{custom_comment}}/g, customComment || "");
    };
    const applyHtmlVars = (text) => {
      if (!text) return "";
      return text
        .replace(/{{name}}/g, escapeHtml(member.name))
        .replace(/{{email}}/g, escapeHtml(member.email))
        .replace(/{{skill}}/g, escapeHtml(form.skill_name))
        .replace(/{{appname}}/g, escapeHtml(config.ui.loginTitle))
        .replace(/{{url}}/g, escapeHtml(newLink || ""))
        .replace(/{{custom_comment}}/g, escapeHtml(customComment || ""));
    };

    if (notifyEmail && member.email) {
      const from = tplEmail.from ? applyVars(tplEmail.from) : config.ui.loginTitle + " <noreply@opready.app>";
      const subject = applyVars(tplEmail.subject);
      const rawBody = generateNew ? tplEmail.bodyRetry : tplEmail.bodySimple;
      let htmlBody = rawBody ? applyHtmlVars(rawBody) : `<p>Hello ${escapeHtml(member.name)}, your submission for &#34;${escapeHtml(form.skill_name)}&#34; was NOT accepted.</p>`;
      let textBody = convertHtmlToText(htmlBody);

      if (!isDemo) {
        await config.transporter.sendMail({ from, to: member.email, subject, text: textBody, html: htmlBody });
      }
    }

    if (notifyWa && member.mobile && config.enableWhatsApp) {
      const rawBody = generateNew ? tplWa.bodyRetry : tplWa.bodySimple;
      let message = rawBody ? applyVars(rawBody) : `Hello ${member.name}, your submission for "${form.skill_name}" was NOT accepted.`;
      if (!isDemo) {
        await whatsappService.sendMessage(member.mobile, message);
      }
    }

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Live Forms", "Submission Rejected", {
      memberName: formatMemberName(form.member_rank, form.member_last_name, form.member_first_name, form.member_name),
      skillName: form.skill_name,
      retryGenerated: generateNew,
      notifiedVia: { email: notifyEmail, whatsapp: notifyWa },
      reasonProvided: customComment || "No reason specified",
    });
    res.json({ success: true, demo: isDemo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;