const express = require('express');
const router = express.Router();
const db = require('../../services/db');

// GET /api/live-surveys/:publicId - Fetch the survey UI structure for a respondent
router.get('/:publicId', (req, res) => {
    try {
        const survey = db.getSurveyByPublicId(req.params.publicId);
        
        if (!survey) {
            return res.status(404).json({ error: 'Survey not found or is closed.' });
        }
        
        // Parse the JSON string back into an object for the frontend builder to consume
        survey.structure = JSON.parse(survey.structure);
        res.json(survey);
    } catch (error) {
        console.error('[API] Error fetching live survey data:', error);
        res.status(500).json({ error: 'Failed to load survey.' });
    }
});

// POST /api/live-surveys/:surveyId/submit - Handle the anonymous submission payload
router.post('/:surveyId/submit', (req, res) => {
    try {
        const { accessCode, submittedData } = req.body;
        
        if (!accessCode || !submittedData) {
            return res.status(400).json({ error: 'Missing access code or payload.' });
        }

        db.submitSurveyResponse(
            req.params.surveyId, 
            accessCode, 
            JSON.stringify(submittedData)
        );
        
        res.json({ message: 'Survey submitted successfully.' });
    } catch (error) {
        console.error('[API] Error during survey submission:', error);
        
        // Handle specific transactional errors thrown by the DB service
        if (error.message === 'Invalid access code.' || error.message === 'Survey already submitted.') {
            return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error during submission.' });
    }
});

module.exports = router;