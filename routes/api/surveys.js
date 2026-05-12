// routes/api/surveys.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const db = require("../../services/db");
const { hasRole } = require("../../middleware/auth");
const nodemailer = require("nodemailer");
const mailer = require("../../services/mailer");
const config = require("../../config");
const logger = require("../../services/logger");

// Specific routes must be declared before wildcard /:id routes to avoid Express matching them as IDs
router.get("/responses/:id", hasRole("admin"), async (req, res) => {
    try {
        const response = await db.getSurveyResponseById(req.params.id);
        if (!response) return res.status(404).json({ error: "Response not found." });

        res.json({
            survey: {
                name: response.survey_name,
                intro: response.intro_text,
                structure: JSON.parse(response.structure)
            },
            answers: JSON.parse(response.submitted_data),
            member_name: response.member_name
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch response details." });
    }
});

router.get("/instances/:liveId/results", hasRole("admin"), async (req, res) => {
  try {
    const liveId = req.params.liveId;

    const instance = await db.getLiveSurveyInstanceById(liveId);
    if (!instance)
      return res.status(404).json({ error: "Survey instance not found." });

    const rawResponses = await db.getSurveyResponses(liveId);
    const parsedResponses = rawResponses.map((r) => ({
      id: r.id,
      submittedAt: r.submitted_at,
      answers: JSON.parse(r.submitted_data),
      // Only include identity if the survey isn't anonymous
      respondent:
        instance.is_anonymous === 0
          ? {
              name: r.member_name,

            }
          : null,
    }));
    const tracking = await db.getSurveyTracking(liveId);

    res.json({
      instanceName: instance.name,
      is_anonymous: instance.is_anonymous,
      structure:
        typeof instance.structure === "string"
          ? JSON.parse(instance.structure)
          : instance.structure,
      responses: parsedResponses,
      responseCount: parsedResponses.length, // Required by public/js/surveys-results.js
      stats: {
        totalInvited: tracking.length,
        submitted: parsedResponses.length,
        pending: tracking.length - parsedResponses.length,
      },
    });
  } catch (error) {
    logger.error("[API] Error fetching survey results", { error: error.message });
    res.status(500).json({ error: "Failed to retrieve survey results." });
  }
});

router.get("/export/all", hasRole("admin"), async (req, res) => {
  try {
    const surveys = await db.getAllSurveys();

    // Strip server-side IDs so the export can be imported into any instance without key conflicts
    surveys.forEach((s) => {
      if (typeof s.structure === "string")
        s.structure = JSON.parse(s.structure);
      delete s.id;
      delete s.public_id;
      delete s.created_at;
      delete s.updated_at;
    });

    const filename = `all_surveys_export_${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-type", "application/json");
    res.send(JSON.stringify(surveys, null, 2));
  } catch (error) {
    logger.error("[API] Error exporting all surveys", { error: error.message });
    res.status(500).json({ error: "Failed to export surveys." });
  }
});

router.post(
  "/import/all",
  hasRole("admin"),
  upload.single("surveysFile"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No file uploaded." });

      const importedSurveys = JSON.parse(req.file.buffer.toString());
      if (!Array.isArray(importedSurveys)) {
        return res
          .status(400)
          .json({ error: "Invalid format. Expected an array of surveys." });
      }

      const authorId = req.user?.id || req.session?.user?.id || 1;

      await db.importAllSurveys(importedSurveys, authorId);
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
      await db.logEvent(actor, "Surveys", "Bulk Imported Survey Templates", {
        count: importedSurveys.length,
      });
      res.json({ success: true, count: importedSurveys.length });
    } catch (error) {
      logger.error("[API] Error importing surveys", { error: error.message });
      res.status(500).json({ error: "Failed to import surveys." });
    }
  },
);
router.get(
  "/instances/:liveId/tracking",
  hasRole("admin"),
  async (req, res) => {
    try {
      const liveId = req.params.liveId;
      const trackingData = await db.getSurveyTracking(liveId);

      if (!trackingData)
        return res.status(404).json({ error: "No tracking data found." });

      const instance = await db.getLiveSurveyInstanceById(liveId);

      // Instance may not have its own GUID (older records); fall back to the parent template's GUID
      let surveyGuid = instance ? instance.public_id : null;
      if (!surveyGuid && instance && instance.template_id) {
        const template = await db.getSurveyById(instance.template_id);
        if (template) surveyGuid = template.public_id;
      }

      res.json({
        instanceName: instance ? instance.name : "Unknown Survey",
        surveyGuid: surveyGuid || liveId, // Integer ID fallback keeps the UI functional even without a GUID
        tracking: trackingData,
      });
    } catch (error) {
      logger.error("[API] Error fetching survey tracking", { error: error.message });
      res.status(500).json({ error: "Failed to retrieve tracking data." });
    }
  },
);

router.get("/", async (req, res) => {
  try {
    const surveys = await db.getAllSurveys();
    res.json(surveys);
  } catch (error) {
    logger.error("[API] Error fetching surveys", { error: error.message });
    res.status(500).json({ error: "Failed to retrieve surveys." });
  }
});

router.post("/", hasRole("admin"), async (req, res) => {
  try {
    const { name, intro, status, structure , is_anonymous} = req.body;

    if (!name || !structure) {
      return res
        .status(400)
        .json({ error: "Survey name and structure are required." });
    }

    const authorId = req.user?.id || req.session?.user?.id || 1;

    const result = await db.createSurvey(
      name,
      intro,
      status || 0,
      JSON.stringify(structure),
      authorId,
      is_anonymous || 0
    );
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Surveys", "Created Survey Template", {
      surveyName: name,
    });
    res.status(201).json(result);
  } catch (error) {
    logger.error("[API] Error creating survey", { error: error.message });
    res.status(500).json({ error: "Failed to create survey." });
  }
});

router.get("/instances", hasRole("admin"), async (req, res) => {
  try {
    const instances = await db.getLiveSurveyInstances();
    res.json(instances || []);
  } catch (error) {
    logger.error("[API] Error fetching live instances", { error: error.message });
    res.status(500).json({ error: "Failed to retrieve published surveys." });
  }
});

router.put("/instances/:id/archive", hasRole("admin"), async (req, res) => {
  try {
    const instance = await db.getLiveSurveyInstanceById(req.params.id);
    await db.updateSurveyArchiveStatus(req.params.id, req.body.is_archived);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    const action = req.body.is_archived ? "Archived Survey Instance" : "Unarchived Survey Instance";
    await db.logEvent(actor, "Surveys", action, {
      instanceId: req.params.id,
      instanceName: instance?.name,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update archive status." });
  }
});

router.delete("/instances/:id", hasRole("admin"), async (req, res) => {
  try {
    const instance = await db.getLiveSurveyInstanceById(req.params.id);
    await db.deleteSurveyInstance(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Surveys", "Deleted Survey Instance", {
      instanceId: req.params.id,
      instanceName: instance?.name,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete survey instance." });
  }
});

router.get("/:id/export", hasRole("admin"), async (req, res) => {
  try {
    const survey = await db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found." });

    if (typeof survey.structure === "string")
      survey.structure = JSON.parse(survey.structure);

    // Strip server-side IDs so the export is portable across instances
    delete survey.id;
    delete survey.public_id;
    delete survey.created_at;
    delete survey.updated_at;

    const filename = `survey_export_${survey.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
    res.setHeader("Content-disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-type", "application/json");
    res.send(JSON.stringify(survey, null, 2));
  } catch (error) {
    logger.error("[API] Error exporting survey", { error: error.message });
    res.status(500).json({ error: "Failed to export survey." });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const survey = await db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found." });

    if (typeof survey.structure === "string") {
      survey.structure = JSON.parse(survey.structure);
    }
    res.json(survey);
  } catch (error) {
    logger.error("[API] Error fetching survey", { error: error.message });
    res.status(500).json({ error: "Failed to retrieve survey." });
  }
});

router.put("/:id", hasRole("admin"), async (req, res) => {
  try {
    const surveyId = req.params.id;
    const { name, intro, status, structure, is_anonymous } = req.body;

    if (!name && !structure && status !== undefined) {
      const existing = await db.getSurveyById(surveyId);
      if (!existing) return res.status(404).json({ error: "Survey not found" });
      await db.updateSurvey(
        surveyId,
        existing.name,
        existing.intro,
        status,
        existing.structure,
        is_anonymous || existing.is_anonymous
      );
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
      await db.logEvent(actor, "Surveys", "Updated Survey Status", {
        surveyId,
        surveyName: existing.name,
        status,
      });
      return res.json({ success: true, message: "Status updated" });
    }

    if (!name || !structure)
      return res
        .status(400)
        .json({ error: "Survey name and structure are required." });

    await db.updateSurvey(
      surveyId,
      name,
      intro,
      status || 0,
      JSON.stringify(structure),
      is_anonymous || 0
    );
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Surveys", "Updated Survey Template", {
      surveyId,
      surveyName: name,
    });
    res.json({ success: true, message: "Survey updated successfully." });
  } catch (error) {
    logger.error("[API] Error updating survey", { error: error.message });
    res.status(500).json({ error: "Failed to update survey." });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    const surveyId = req.params.id;
    const survey = await db.getSurveyById(surveyId);
    await db.deleteSurvey(surveyId);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Surveys", "Deleted Survey Template", {
      surveyId,
      surveyName: survey?.name,
    });
    res.json({ success: true, message: "Survey deleted successfully." });
  } catch (error) {
    logger.error("[API] Error deleting survey", { error: error.message });
    res.status(500).json({ error: "Failed to delete survey." });
  }
});

router.post("/:id/publish", hasRole("admin"), async (req, res) => {
  try {
    const surveyId = req.params.id;
    const { memberIds } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one member must be selected." });
    }

    const authorId = req.user?.id || req.session?.user?.id || 1;

    const { liveInstanceId, trackingData } = await db.publishSurvey(
      surveyId,
      memberIds,
      authorId,
    );

    const survey = await db.getSurveyById(surveyId);
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_surveys ? JSON.parse(prefs.tpl_surveys) : null;
    const allTracking = await db.getSurveyTracking(liveInstanceId);
    const pending = allTracking.filter((t) => t.status === "pending");
    const instance = await db.getLiveSurveyInstanceById(liveInstanceId);
    const isAnon = instance.is_anonymous !== 0; // SQLite stores booleans as 1/0; strict comparison needed
    for (const data of pending) {
      if (data.email) {
        const surveyUrl = `${req.protocol}://${req.get("host")}/surveys-view.html?code=${data.access_code}&id=${survey.public_id}`;

        try {
          await mailer.sendSurveyInvitation(
            data.email,
            data.member_name,
            instance.name,
            surveyUrl,
            config.transporter,
            config.ui.loginTitle,
            tpl,
            isAnon,
          );
        } catch (err) {
          logger.error(`[SMTP ERROR] Failed to send survey link to ${data.email}`, { error: err.message });
        }
      }
    }
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Surveys", "Published Survey", {
      surveyName: instance.name,
      membersInvited: trackingData.length,
    });
    res.json({
      message: `Survey published successfully! Links generated for ${trackingData.length} members.`,
    });
  } catch (error) {
    logger.error("[API] Error publishing survey", { error: error.message });
    res.status(500).json({ error: "Failed to publish survey." });
  }
});

router.post(
  "/instances/:liveId/remind-all",
  hasRole("admin"),
  async (req, res) => {
    try {
      const liveId = req.params.liveId;
      const allTracking = await db.getSurveyTracking(liveId);
      const pending = allTracking.filter((t) => t.status === "pending");

      if (pending.length === 0) {
        return res.status(400).json({ error: "No pending members found." });
      }

      const instance = await db.getLiveSurveyInstanceById(liveId);
      const isAnon = instance.is_anonymous !== 0; // SQLite stores booleans as 1/0; strict comparison needed
      const prefs = await db.getPreferences();
      const tpl = prefs.tpl_surveys ? JSON.parse(prefs.tpl_surveys) : null;
      const template = await db.getSurveyById(instance.template_id);
      let sentCount = 0;
      for (const item of pending) {
        if (item.email) {
          const surveyUrl = `${req.protocol}://${req.get("host")}/surveys-view.html?code=${item.access_code}&id=${template.public_id}`;
          try {
            await mailer.sendSurveyInvitation(
              item.email,
              item.member_name,
              instance.name,
              surveyUrl,
              config.transporter,
              config.ui.loginTitle,
              tpl,
              isAnon,
            );
            sentCount++;
          } catch (err) {
            logger.error(`[SMTP ERROR] Remind-All failed for ${item.email}`, { error: err.message });
          }
        }
      }
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';

      await db.logEvent(actor, "Surveys", "Sent Bulk Reminders", {
        surveyName: instance.name,
        remindersSent: pending.length,
      });
      res.json({
        message: `Reminder emails triggered for ${sentCount} out of ${pending.length} pending members.`,
      });
    } catch (error) {
      logger.error("[API] Error sending bulk reminders", { error: error.message });
      res.status(500).json({ error: "Failed to send reminders." });
    }
  },
);

router.post(
  "/instances/:liveId/remind/:trackingId",
  hasRole("admin"),
  async (req, res) => {
    try {
      const { liveId, trackingId } = req.params;
      const allTracking = await db.getSurveyTracking(liveId);
      const record = allTracking.find((t) => t.tracking_id == trackingId);

      if (!record)
        return res.status(404).json({ error: "Tracking record not found." });
      if (record.status !== "pending")
        return res
          .status(400)
          .json({ error: "Member has already submitted the survey." });

      const instance = await db.getLiveSurveyInstanceById(liveId);
      const isAnon = instance.is_anonymous !== 0; // SQLite stores booleans as 1/0; strict comparison needed
      if (!record.email) {
        return res.status(400).json({
          error:
            "Cannot send reminder: Member has no registered email address.",
        });
      }
      const template = await db.getSurveyById(instance.template_id);
      const surveyUrl = `${req.protocol}://${req.get("host")}/surveys-view.html?code=${record.access_code}&id=${template.public_id}`;
      const prefs = await db.getPreferences();
      const tpl = prefs.tpl_surveys ? JSON.parse(prefs.tpl_surveys) : null;
      await mailer.sendSurveyInvitation(
        record.email,
        record.member_name,
        instance.name,
        surveyUrl,
        config.transporter,
        config.ui.loginTitle,
        tpl,
        isAnon,
      );

      res.json({
        message: `Reminder email successfully sent to ${record.member_name}.`,
      });
    } catch (error) {
      logger.error("[API] Error sending reminder", { error: error.message });
      res.status(500).json({ error: "Failed to send reminder." });
    }
  },
);

module.exports = router;
