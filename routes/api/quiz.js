const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const config = require('../../config');
const { hasRole } = require('../../middleware/auth');
const { validateQuizGame } = require('../../middleware/validation');
const logger = require('../../services/logger');

router.get('/games', hasRole('admin'), async (req, res) => {
  try {
    res.json(await db.getQuizGames());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/games/:id', hasRole('admin'), async (req, res) => {
  try {
    const game = await db.getQuizGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Quiz game not found' });
    res.json(game);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/games', hasRole('admin'), validateQuizGame, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const id = await db.createQuizGame(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Game Created', {
      gameId: id,
      gameName: req.body.name,
      gameType: req.body.game_type,
      questionCount: (req.body.questions || []).length,
    });
    logger.info('[Quiz] Game created', { gameId: id, name: req.body.name });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/games/:id', hasRole('admin'), validateQuizGame, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.updateQuizGame(req.params.id, req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Game Updated', {
      gameId: req.params.id,
      gameName: req.body.name,
      gameType: req.body.game_type,
      questionCount: (req.body.questions || []).length,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/games/:id/toggle', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const game = await db.getQuizGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Quiz game not found' });
    await db.updateQuizGame(req.params.id, { ...game, enabled: !game.enabled });
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Game Toggled', {
      gameId: req.params.id,
      gameName: game.name,
      newState: !game.enabled ? 'enabled' : 'disabled',
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/games/:id/export', hasRole('admin'), async (req, res) => {
  try {
    const game = await db.getQuizGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Quiz game not found' });
    const filename = `quiz_game_export_${game.id}_${game.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
      name: game.name,
      description: game.description,
      game_type: game.game_type,
      questions: game.questions,
    }, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/games/:id', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const game = await db.getQuizGameById(req.params.id);
    await db.deleteQuizGame(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Game Deleted', {
      gameId: req.params.id,
      gameName: game?.name,
    });
    res.json({ success: true });
  } catch (e) {
    logger.error('[Quiz] Delete game error', { error: e.message });
    res.status(500).json({ error: 'Could not delete quiz game.' });
  }
});

module.exports = router;
