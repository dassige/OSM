const express = require('express');
const router = express.Router();
const db = require('../../services/db'); // Assuming the methods were added here
const { requireAuth, requireRole } = require('../../middleware/auth');


// GET /api/surveys - Get the list of all surveys
router.get('/', (req, res) => {
    try {
        const surveys = db.getAllSurveys();
        res.json(surveys);
    } catch (error) {
        console.error('[API] Error fetching surveys:', error);
        res.status(500).json({ error: 'Failed to retrieve surveys.' });
    }
});

// POST /api/surveys - Create a new draft survey
router.post('/', (req, res) => {
    try {
        const { name, intro_text, structure } = req.body;
        
        if (!name || !structure) {
            return res.status(400).json({ error: 'Survey name and structure are required.' });
        }
        
        const result = db.createSurvey(name, intro_text, JSON.stringify(structure), req.user.id);
        res.status(201).json(result);
    } catch (error) {
        console.error('[API] Error creating survey:', error);
        res.status(500).json({ error: 'Failed to create survey draft.' });
    }
});

// POST /api/surveys/:id/publish - Publish and distribute links
router.post('/:id/publish', (req, res) => {
    try {
        const surveyId = req.params.id;
        const { memberIds } = req.body; // Array of member IDs targeted for the survey
        
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'At least one member must be selected.' });
        }

        db.publishSurvey(surveyId, memberIds);
        res.json({ message: 'Survey published and tracking links generated.' });
    } catch (error) {
        console.error('[API] Error publishing survey:', error);
        res.status(500).json({ error: 'Failed to publish survey.' });
    }
});

module.exports = router;