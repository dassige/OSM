// routes/api/surveys.js
const express = require('express');
const router = express.Router();
const db = require('../../services/db'); 
const { hasRole } = require('../../middleware/auth'); // Fixed import

// GET /api/surveys - Get the list of all surveys (Global guard handles auth)
router.get('/', async (req, res) => {
    try {
        const surveys = await db.getAllSurveys();
        res.json(surveys);
    } catch (error) {
        console.error('[API] Error fetching surveys:', error);
        res.status(500).json({ error: 'Failed to retrieve surveys.' });
    }
});

// GET /api/surveys/:id - Get a specific survey by ID
router.get('/:id', async (req, res) => {
    try {
        const survey = await db.getSurveyById(req.params.id);
        if (!survey) return res.status(404).json({ error: 'Survey not found.' });
        
        // Parse the JSON structure back into an object for the frontend
        if (typeof survey.structure === 'string') {
            survey.structure = JSON.parse(survey.structure);
        }
        res.json(survey);
    } catch (error) {
        console.error('[API] Error fetching survey:', error);
        res.status(500).json({ error: 'Failed to retrieve survey.' });
    }
});

// POST /api/surveys - Create a new survey
router.post('/', hasRole('admin'), async (req, res) => {
    try {
        const { name, intro, status, structure } = req.body;
        
        if (!name || !structure) {
            return res.status(400).json({ error: 'Survey name and structure are required.' });
        }
        
        // --- THE FIX IS HERE ---
        // Try req.user first, then req.session.user. Fallback to 1 (Admin) to prevent SQLite FK crashes.
        const authorId = req.user?.id || req.session?.user?.id || 1; 
        
        const result = await db.createSurvey(
             name, 
             intro, 
             status || 0, 
             JSON.stringify(structure), 
             authorId
        );
        
        res.status(201).json(result);
    } catch (error) {
        console.error('[API] Error creating survey:', error);
        res.status(500).json({ error: 'Failed to create survey.' });
    }
});

// PUT /api/surveys/:id - Update an existing survey
router.put('/:id', hasRole('admin'), async (req, res) => { // Fixed middleware
    try {
        const surveyId = req.params.id;
        const { name, intro, status, structure } = req.body;

        // If it's just a status update toggle from the list view
        if (!name && !structure && status !== undefined) {
             const existing = await db.getSurveyById(surveyId);
             if (!existing) return res.status(404).json({ error: 'Survey not found' });
             await db.updateSurvey(surveyId, existing.name, existing.intro, status, existing.structure);
             return res.json({ success: true, message: 'Status updated' });
        }

        if (!name || !structure) {
            return res.status(400).json({ error: 'Survey name and structure are required.' });
        }

        await db.updateSurvey(surveyId, name, intro, status || 0, JSON.stringify(structure));
        res.json({ success: true, message: 'Survey updated successfully.' });
    } catch (error) {
        console.error('[API] Error updating survey:', error);
        res.status(500).json({ error: 'Failed to update survey.' });
    }
});

// DELETE /api/surveys/:id - Delete a survey
router.delete('/:id', hasRole('admin'), async (req, res) => { // Fixed middleware
    try {
        const surveyId = req.params.id;
        await db.deleteSurvey(surveyId);
        res.json({ success: true, message: 'Survey deleted successfully.' });
    } catch (error) {
        console.error('[API] Error deleting survey:', error);
        res.status(500).json({ error: 'Failed to delete survey.' });
    }
});

// POST /api/surveys/:id/publish - Publish and distribute links
router.post('/:id/publish', hasRole('admin'), async (req, res) => {
    try {
        const surveyId = req.params.id;
        const { memberIds } = req.body; 
        
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'At least one member must be selected.' });
        }

        // Get the author ID safely
        const authorId = req.user?.id || req.session?.user?.id || 1; 

        // Pass the authorId to the new publish logic
        await db.publishSurvey(surveyId, memberIds, authorId);
        
        res.json({ message: 'Survey published successfully. Instance created and tracking links generated.' });
    } catch (error) {
        console.error('[API] Error publishing survey:', error);
        res.status(500).json({ error: 'Failed to publish survey.' });
    }
});
// GET /api/surveys/instances/:liveId/results - Aggregate survey results
router.get('/instances/:liveId/results', hasRole('admin'), async (req, res) => {
    try {
        const liveId = req.params.liveId;
        const rawData = await db.getSurveyInstanceResults(liveId);

        if (!rawData || !rawData.instance) {
            return res.status(404).json({ error: 'Survey instance not found.' });
        }

        const structure = JSON.parse(rawData.instance.structure);
        const parsedResponses = rawData.responses.map(r => JSON.parse(r.submitted_data));

        // Aggregation Engine
        const aggregatedData = structure.map(question => {
            const result = {
                id: question.id,
                description: question.description,
                type: question.type,
                totalAnswers: 0,
                data: question.type === 'text_multi' ? [] : {}
            };

            // Pre-fill keys with 0 for choice-based questions so we show 0% for unselected options
            if (question.type === 'radio' || question.type === 'checkboxes') {
                question.options.forEach(opt => result.data[opt] = 0);
            } else if (question.type === 'boolean') {
                result.data['Yes'] = 0;
                result.data['No'] = 0;
            }

            // Tally up the responses
            parsedResponses.forEach(ans => {
                const val = ans[question.id];
                
                // Skip if the user didn't answer this question
                if (val === null || val === undefined || val === '') return;
                
                result.totalAnswers++;

                if (question.type === 'text_multi') {
                    result.data.push(val);
                } else if (question.type === 'checkboxes' && Array.isArray(val)) {
                    val.forEach(v => {
                        if (result.data[v] !== undefined) result.data[v]++;
                    });
                } else {
                    // Radio and Boolean
                    if (result.data[val] !== undefined) result.data[val]++;
                }
            });

            return result;
        });

        res.json({
            survey: {
                id: rawData.instance.id,
                name: rawData.instance.name,
                publishedAt: rawData.instance.published_at
            },
            stats: {
                totalInvited: rawData.trackingStats.totalInvited || 0,
                totalSubmitted: rawData.trackingStats.totalSubmitted || 0,
                completionRate: rawData.trackingStats.totalInvited > 0 
                    ? Math.round((rawData.trackingStats.totalSubmitted / rawData.trackingStats.totalInvited) * 100) 
                    : 0
            },
            results: aggregatedData
        });

    } catch (error) {
        console.error('[API] Error aggregating survey results:', error);
        res.status(500).json({ error: 'Failed to aggregate results.' });
    }
});
// GET /api/surveys/instances - Get all published live survey instances
router.get('/instances', hasRole('admin'), async (req, res) => {
    try {
        const instances = await db.getLiveSurveyInstances();
        res.json(instances || []);
    } catch (error) {
        console.error('[API] Error fetching live instances:', error);
        res.status(500).json({ error: 'Failed to retrieve published surveys.' });
    }
});

// PUT /api/surveys/instances/:id/archive - Toggle archive status
router.put('/instances/:id/archive', hasRole('admin'), async (req, res) => {
    try {
        await db.updateSurveyArchiveStatus(req.params.id, req.body.is_archived);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update archive status.' });
    }
});

// DELETE /api/surveys/instances/:id - Delete a published instance entirely
router.delete('/instances/:id', hasRole('admin'), async (req, res) => {
    try {
        await db.deleteSurveyInstance(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete survey instance.' });
    }
});
module.exports = router;