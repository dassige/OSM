// routes/api/surveys.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const db = require("../../services/db");
const { hasRole } = require("../../middleware/auth");

// ============================================================================
// 1. SPECIFIC ROUTES (Must come before wildcard /:id routes)
// ============================================================================

// GET /api/surveys/instances/:liveId/results - Get aggregated survey results
router.get("/instances/:liveId/results", hasRole("admin"), async (req, res) => {
  try {
    const liveId = req.params.liveId;

    // 1. Get the instance to know the questions (structure)
    const instance = await db.getLiveSurveyInstanceById(liveId);
    if (!instance)
      return res.status(404).json({ error: "Survey instance not found." });

    // 2. Get the raw responses and parse the JSON answers
    const rawResponses = await db.getSurveyResponses(liveId);
    const parsedResponses = rawResponses.map((r) => ({
      id: r.id,
      date: r.submitted_at, // <-- FIXED THIS LINE
      answers: JSON.parse(r.submitted_data),
    }));
    // 3. Get tracking info just for the top-level stats (completion rate)
    const tracking = await db.getSurveyTracking(liveId);

    res.json({
      instanceName: instance.name,
      structure:
        typeof instance.structure === "string"
          ? JSON.parse(instance.structure)
          : instance.structure,
      responses: parsedResponses,
      stats: {
        totalInvited: tracking.length,
        submitted: tracking.filter((t) => t.status === "submitted").length,
        pending: tracking.filter((t) => t.status === "pending").length,
      },
    });
  } catch (error) {
    console.error("[API] Error fetching survey results:", error);
    res.status(500).json({ error: "Failed to retrieve survey results." });
  }
});
// GET /api/surveys/export/all - Export all survey templates
router.get("/export/all", hasRole("admin"), async (req, res) => {
  try {
    const surveys = await db.getAllSurveys();

    // Strip out DB-specific IDs to make the payload clean
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
    console.error("[API] Error exporting all surveys:", error);
    res.status(500).json({ error: "Failed to export surveys." });
  }
});

// POST /api/surveys/import/all - Bulk import survey templates
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
      res.json({ success: true, count: importedSurveys.length });
    } catch (error) {
      console.error("[API] Error importing surveys:", error);
      res.status(500).json({ error: "Failed to import surveys." });
    }
  },
);
// GET /api/surveys/instances/:liveId/tracking - Get tracking data for a specific instance
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

      // Attempt to get the GUID from the instance, or fallback to the parent template's GUID
      let surveyGuid = instance ? instance.public_id : null;
      if (!surveyGuid && instance && instance.template_id) {
        // FIXED: Using the properly encapsulated db.getSurveyById instead of raw db.get
        const template = await db.getSurveyById(instance.template_id);
        if (template) surveyGuid = template.public_id;
      }

      res.json({
        instanceName: instance ? instance.name : "Unknown Survey",
        surveyGuid: surveyGuid || liveId, // Fallback to the integer ID just in case
        tracking: trackingData,
      });
    } catch (error) {
      console.error("[API] Error fetching survey tracking:", error);
      res.status(500).json({ error: "Failed to retrieve tracking data." });
    }
  },
);

// GET /api/surveys - Get the list of all surveys (Global guard handles auth)
router.get("/", async (req, res) => {
  try {
    const surveys = await db.getAllSurveys();
    res.json(surveys);
  } catch (error) {
    console.error("[API] Error fetching surveys:", error);
    res.status(500).json({ error: "Failed to retrieve surveys." });
  }
});

// POST /api/surveys - Create a new survey template
router.post("/", hasRole("admin"), async (req, res) => {
  try {
    const { name, intro, status, structure } = req.body;

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
    );
    res.status(201).json(result);
  } catch (error) {
    console.error("[API] Error creating survey:", error);
    res.status(500).json({ error: "Failed to create survey." });
  }
});

// GET /api/surveys/instances - Get all published live survey instances
router.get("/instances", hasRole("admin"), async (req, res) => {
  try {
    const instances = await db.getLiveSurveyInstances();
    res.json(instances || []);
  } catch (error) {
    console.error("[API] Error fetching live instances:", error);
    res.status(500).json({ error: "Failed to retrieve published surveys." });
  }
});

// GET /api/surveys/instances/:liveId/results - Aggregate survey results
router.get("/instances/:liveId/results", hasRole("admin"), async (req, res) => {
  try {
    const liveId = req.params.liveId;
    const rawData = await db.getSurveyInstanceResults(liveId);

    if (!rawData || !rawData.instance)
      return res.status(404).json({ error: "Survey instance not found." });

    const structure = JSON.parse(rawData.instance.structure);
    const parsedResponses = rawData.responses.map((r) =>
      JSON.parse(r.submitted_data),
    );

    const aggregatedData = structure.map((question) => {
      const result = {
        id: question.id,
        description: question.description,
        type: question.type,
        totalAnswers: 0,
        data: question.type === "text_multi" ? [] : {},
      };

      if (question.type === "radio" || question.type === "checkboxes") {
        question.options.forEach((opt) => (result.data[opt] = 0));
      } else if (question.type === "boolean") {
        result.data["Yes"] = 0;
        result.data["No"] = 0;
      }

      parsedResponses.forEach((ans) => {
        const val = ans[question.id];
        if (val === null || val === undefined || val === "") return;
        result.totalAnswers++;

        if (question.type === "text_multi") {
          result.data.push(val);
        } else if (question.type === "checkboxes" && Array.isArray(val)) {
          val.forEach((v) => {
            if (result.data[v] !== undefined) result.data[v]++;
          });
        } else {
          if (result.data[val] !== undefined) result.data[val]++;
        }
      });
      return result;
    });

    res.json({
      survey: {
        id: rawData.instance.id,
        name: rawData.instance.name,
        publishedAt: rawData.instance.published_at,
      },
      stats: {
        totalInvited: rawData.trackingStats.totalInvited || 0,
        totalSubmitted: rawData.trackingStats.totalSubmitted || 0,
        completionRate:
          rawData.trackingStats.totalInvited > 0
            ? Math.round(
                (rawData.trackingStats.totalSubmitted /
                  rawData.trackingStats.totalInvited) *
                  100,
              )
            : 0,
      },
      results: aggregatedData,
    });
  } catch (error) {
    console.error("[API] Error aggregating survey results:", error);
    res.status(500).json({ error: "Failed to aggregate results." });
  }
});

// PUT /api/surveys/instances/:id/archive - Toggle archive status
router.put("/instances/:id/archive", hasRole("admin"), async (req, res) => {
  try {
    await db.updateSurveyArchiveStatus(req.params.id, req.body.is_archived);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update archive status." });
  }
});

// DELETE /api/surveys/instances/:id - Delete a published instance entirely
router.delete("/instances/:id", hasRole("admin"), async (req, res) => {
  try {
    await db.deleteSurveyInstance(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete survey instance." });
  }
});

// ============================================================================
// 2. WILDCARD ROUTES (Must come last)
// ============================================================================

// GET /api/surveys/:id/export - Export a single survey template
router.get("/:id/export", hasRole("admin"), async (req, res) => {
  try {
    const survey = await db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found." });

    if (typeof survey.structure === "string")
      survey.structure = JSON.parse(survey.structure);

    // Strip DB-specific markers
    delete survey.id;
    delete survey.public_id;
    delete survey.created_at;
    delete survey.updated_at;

    const filename = `survey_export_${survey.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
    res.setHeader("Content-disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-type", "application/json");
    res.send(JSON.stringify(survey, null, 2));
  } catch (error) {
    console.error("[API] Error exporting survey:", error);
    res.status(500).json({ error: "Failed to export survey." });
  }
});
// GET /api/surveys/:id - Get a specific survey by ID
router.get("/:id", async (req, res) => {
  try {
    const survey = await db.getSurveyById(req.params.id);
    if (!survey) return res.status(404).json({ error: "Survey not found." });

    if (typeof survey.structure === "string") {
      survey.structure = JSON.parse(survey.structure);
    }
    res.json(survey);
  } catch (error) {
    console.error("[API] Error fetching survey:", error);
    res.status(500).json({ error: "Failed to retrieve survey." });
  }
});

// PUT /api/surveys/:id - Update an existing survey template
router.put("/:id", hasRole("admin"), async (req, res) => {
  try {
    const surveyId = req.params.id;
    const { name, intro, status, structure } = req.body;

    if (!name && !structure && status !== undefined) {
      const existing = await db.getSurveyById(surveyId);
      if (!existing) return res.status(404).json({ error: "Survey not found" });
      await db.updateSurvey(
        surveyId,
        existing.name,
        existing.intro,
        status,
        existing.structure,
      );
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
    );
    res.json({ success: true, message: "Survey updated successfully." });
  } catch (error) {
    console.error("[API] Error updating survey:", error);
    res.status(500).json({ error: "Failed to update survey." });
  }
});

// DELETE /api/surveys/:id - Delete a survey template
router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    const surveyId = req.params.id;
    await db.deleteSurvey(surveyId);
    res.json({ success: true, message: "Survey deleted successfully." });
  } catch (error) {
    console.error("[API] Error deleting survey:", error);
    res.status(500).json({ error: "Failed to delete survey." });
  }
});

// POST /api/surveys/:id/publish - Publish and distribute links
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

    // db.publishSurvey now returns the tracking codes
    const { liveInstanceId, trackingData } = await db.publishSurvey(
      surveyId,
      memberIds,
      authorId,
    );

    // --- EMAIL DISPATCH LOOP ---
    // We will finalize the mailer integration and templates later, but this
    // is the exact architecture of where it hooks in.

    for (const data of trackingData) {
      // const member = await db.getMemberById(data.memberId);
      // if (member && member.email) {
      //     const surveyUrl = `${req.protocol}://${req.get('host')}/surveys-view.html?code=${data.accessCode}`;
      //     await mailer.sendSurveyEmail(member.email, surveyUrl);
      // }
    }

    res.json({
      message: `Survey published successfully! Links generated for ${trackingData.length} members.`,
    });
  } catch (error) {
    console.error("[API] Error publishing survey:", error);
    res.status(500).json({ error: "Failed to publish survey." });
  }
});

// POST /api/surveys/instances/:liveId/remind-all - Trigger reminder emails for all pending members
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

      // --- EMAIL DISPATCH LOOP (Placeholder) ---
      for (const item of pending) {
        // Example hook:
        // await mailer.sendSurveyReminderEmail(item.email, item.access_code);
      }

      res.json({
        message: `Reminder emails triggered for ${pending.length} pending members.`,
      });
    } catch (error) {
      console.error("[API] Error sending bulk reminders:", error);
      res.status(500).json({ error: "Failed to send reminders." });
    }
  },
);

// POST /api/surveys/instances/:liveId/remind/:trackingId - Trigger a single reminder email
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

      // --- EMAIL DISPATCH (Placeholder) ---
      // Example hook:
      // await mailer.sendSurveyReminderEmail(record.email, record.access_code);

      res.json({
        message: `Reminder email triggered for ${record.member_name}.`,
      });
    } catch (error) {
      console.error("[API] Error sending reminder:", error);
      res.status(500).json({ error: "Failed to send reminder." });
    }
  },
);

module.exports = router;
