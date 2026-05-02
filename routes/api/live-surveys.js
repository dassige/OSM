const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const { hasRole } = require("../../middleware/auth");

// GET /api/live-surveys/preview/:publicId
// PREVIEW MODE: Fetches the template directly. Protected by admin auth.
router.get("/preview/:publicId", hasRole("admin"), async (req, res) => {
  try {
    const publicId = req.params.publicId;
    const surveyTemplate = await db.getSurveyByPublicId(publicId);

    if (!surveyTemplate) {
      return res
        .status(404)
        .json({ error: "Survey template not found or is disabled." });
    }

    res.json({
      status: "preview",
      survey: {
        name: surveyTemplate.name,
        intro: surveyTemplate.intro_text,
        is_anonymous: surveyTemplate.is_anonymous,
        respondentName: "[Respondent Name]", // Placeholder for preview mode
        structure: surveyTemplate.structure,
      },
    });
  } catch (error) {
    console.error("[API] Error fetching preview:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/live-surveys/:accessCode
// LIVE MODE: Fetches the published instance using a member's unique tracking code
router.get("/:accessCode", async (req, res) => {
  try {
    const accessCode = req.params.accessCode;

    const trackingRecord = await db.getTrackingRecordWithMember(accessCode);

    if (!trackingRecord) {
      return res
        .status(404)
        .json({ error: "Invalid or unrecognized access code." });
    }

    if (trackingRecord.status === "submitted") {
      return res.json({ status: "submitted" });
    }

    const liveInstance = await db.getLiveSurveyInstanceById(
      trackingRecord.survey_live_id,
    );

    if (!liveInstance) {
      return res.status(404).json({ error: "Survey instance not found." });
    }

    // NEW: Block loading if the survey is archived
    if (liveInstance.is_archived === 1 || liveInstance.is_archived === true) {
      return res.status(403).json({
        error: "This survey is archived and no longer accepting responses.",
      });
    }

    res.json({
      status: "pending",
      survey: {
        name: liveInstance.name,
        intro: liveInstance.intro_text,
        structure: liveInstance.structure,
        is_anonymous: liveInstance.is_anonymous, 
        respondentName: trackingRecord.member_name 
      },
    });
  } catch (error) {
    console.error("[API] Error fetching live survey:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/live-surveys/:accessCode/submit
// LIVE MODE: Processes the anonymous response and marks the code as consumed
router.post("/:accessCode/submit", async (req, res) => {
  try {
    const accessCode = req.params.accessCode;
    const { answers } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Invalid submission data." });
    }

    const trackingRecord = await db.getTrackingRecordByAccessCode(accessCode);

    if (!trackingRecord)
      return res.status(404).json({ error: "Invalid access code." });
    if (trackingRecord.status === "submitted")
      return res.status(400).json({ error: "Already submitted." });

    // NEW: Double-check the archive status at the moment of submission
    const liveInstance = await db.getLiveSurveyInstanceById(
      trackingRecord.survey_live_id,
    );
    if (
      liveInstance &&
      (liveInstance.is_archived === 1 || liveInstance.is_archived === true)
    ) {
      return res.status(403).json({
        error:
          "This survey was recently archived and can no longer accept submissions.",
      });
    }
    // Determine if we should record identity
    // If is_anonymous is false (0), we pass the member_id to the database service
    const memberToRecord =
      liveInstance.is_anonymous === 0 ? trackingRecord.member_id : null;
    await db.submitSurveyResponse(
      trackingRecord.survey_live_id,
      accessCode,
      JSON.stringify(answers),
      memberToRecord,
    );
    await db.logEvent("Anonymous", "Surveys", "Submitted Survey Response", {
      instanceId: trackingRecord.survey_live_id,
    });
    res.json({ success: true, message: "Response recorded securely." });
  } catch (error) {
    console.error("[API] Error submitting survey:", error);
    res.status(500).json({ error: "Failed to submit response." });
  }
});

module.exports = router;
