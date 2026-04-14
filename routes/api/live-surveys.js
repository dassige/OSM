const express = require('express');
const router = express.Router();
const db = require('../../services/db'); 
const { hasRole } = require('../../middleware/auth');

// GET /api/live-surveys/preview/:publicId
// PREVIEW MODE: Fetches the template directly. Protected by admin auth.
router.get('/preview/:publicId', hasRole('admin'), async (req, res) => {
    try {
        const publicId = req.params.publicId;
        const surveyTemplate = await db.getSurveyByPublicId(publicId);

        if (!surveyTemplate) {
            return res.status(404).json({ error: 'Survey template not found or is disabled.' });
        }

        // Return in the format the frontend expects
        res.json({
            status: 'preview',
            survey: {
                name: surveyTemplate.name,
                intro: surveyTemplate.intro_text,
                structure: surveyTemplate.structure
            }
        });
    } catch (error) {
        console.error('[API] Error fetching preview:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/live-surveys/:accessCode
// LIVE MODE: Fetches the published instance using a member's unique tracking code
router.get('/:accessCode', async (req, res) => {
    try {
        const accessCode = req.params.accessCode;
        
        // 1. Verify the code in tracking table and get the live_survey_id
        const trackingRecord = await db.get(
            `SELECT id, survey_live_id, status FROM survey_tracking WHERE access_code = ?`, 
            accessCode
        );

        if (!trackingRecord) {
            return res.status(404).json({ error: 'Invalid or unrecognized access code.' });
        }

        if (trackingRecord.status === 'submitted') {
            return res.json({ status: 'submitted' }); // Frontend will show "Thank you" screen
        }

        // 2. Fetch the snapshot instance from survey_live
        const liveInstance = await db.get(
            `SELECT name, intro_text, structure FROM survey_live WHERE id = ?`,
            trackingRecord.survey_live_id
        );

        if (!liveInstance) {
            return res.status(404).json({ error: 'Survey instance not found.' });
        }

        res.json({
            status: 'pending',
            survey: {
                name: liveInstance.name,
                intro: liveInstance.intro_text,
                structure: liveInstance.structure
            }
        });

    } catch (error) {
        console.error('[API] Error fetching live survey:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/live-surveys/:accessCode/submit
// LIVE MODE: Processes the anonymous response and marks the code as consumed
router.post('/:accessCode/submit', async (req, res) => {
    try {
        const accessCode = req.params.accessCode;
        const { answers } = req.body;

        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ error: 'Invalid submission data.' });
        }

        // Find the tracking record to get the live instance ID
        const trackingRecord = await db.get(
            `SELECT id, survey_live_id, status FROM survey_tracking WHERE access_code = ?`, 
            accessCode
        );

        if (!trackingRecord) return res.status(404).json({ error: 'Invalid access code.' });
        if (trackingRecord.status === 'submitted') return res.status(400).json({ error: 'Already submitted.' });

        // submitSurveyResponse handles the transaction (marks tracked as submitted, inserts anon response)
        await db.submitSurveyResponse(trackingRecord.survey_live_id, accessCode, JSON.stringify(answers));

        res.json({ success: true, message: 'Response recorded securely.' });
    } catch (error) {
        console.error('[API] Error submitting survey:', error);
        res.status(500).json({ error: 'Failed to submit response.' });
    }
});

module.exports = router;