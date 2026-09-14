const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const config = require('../../config');
const logger = require('../../services/logger');
const mailer = require('../../services/mailer');
const { hasRole } = require('../../middleware/auth');
const { publicSubmitLimiter } = require('../../middleware/rate-limiter');
const { formatMemberName } = require('../../services/rank-config');
const { calculateQuizScore, calculateTimedQuizScore } = require('../../services/quiz-scoring');

// ── Admin: session management ────────────────────────────────────────────────

router.get('/sessions', hasRole('admin'), async (req, res) => {
  try {
    res.json(await db.getQuizSessions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sessions/:id', hasRole('admin'), async (req, res) => {
  try {
    const session = await db.getQuizSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Quiz session not found' });
    const players = await db.getQuizSessionPlayers(req.params.id);
    res.json({ ...session, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sessions', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const { gameId, memberIds } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId is required.' });
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'At least one member must be selected.' });
    }

    const createdBy = req.apiKeyUser?.id || (req.session?.user?.id > 0 ? req.session.user.id : null);
    const { sessionId, players } = await db.createQuizSession(gameId, memberIds, createdBy);
    const session = await db.getQuizSessionById(sessionId);
    const sessionPlayers = await db.getQuizSessionPlayers(sessionId);

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Session Started', {
      sessionId,
      sessionName: session.name,
      gameId,
      gameType: session.game_type,
      playersInvited: players.length,
    });

    res.json({
      sessionId,
      sessionName: session.name,
      gameType: session.game_type,
      players: sessionPlayers,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/sessions/:id/players/:playerId/send', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const session = await db.getQuizSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Quiz session not found' });

    const player = await db.getQuizPlayerById(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!player.email) return res.status(400).json({ error: 'This member has no registered email address.' });

    const playLink = `${req.protocol}://${req.get('host')}/quiz-play.html?code=${player.access_code}`;
    const prefs = await db.getPreferences();
    const tpl = prefs.tpl_quiz ? JSON.parse(prefs.tpl_quiz) : null;

    await mailer.sendQuizInvitation(
      player.email,
      player,
      session.name,
      playLink,
      config.transporter,
      config.ui.loginTitle,
      tpl,
    );
    res.json({ success: true });
  } catch (e) {
    logger.error('[Quiz] Failed to send session invitation', { error: e.message });
    res.status(500).json({ error: 'Failed to send invitation email.' });
  }
});

router.put('/sessions/:id/archive', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const session = await db.getQuizSessionById(req.params.id);
    await db.updateQuizSessionArchiveStatus(req.params.id, req.body.is_archived);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', req.body.is_archived ? 'Quiz Session Archived' : 'Quiz Session Unarchived', {
      sessionId: req.params.id,
      sessionName: session?.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update archive status.' });
  }
});

router.delete('/sessions/:id', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const session = await db.getQuizSessionById(req.params.id);
    await db.deleteQuizSession(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Session Deleted', {
      sessionId: req.params.id,
      sessionName: session?.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete quiz session.' });
  }
});

// ── Admin: team session management (Phase 3 — both game types) ─────────────

router.get('/team-sessions', hasRole('admin'), async (req, res) => {
  try {
    res.json(await db.getTeamSessions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/team-sessions/:id', hasRole('admin'), async (req, res) => {
  try {
    const session = await db.getTeamSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Team session not found' });
    const teams = await db.getTeamSessionTeams(req.params.id);
    res.json({ ...session, teams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/team-sessions', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const { gameId, teams } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId is required.' });
    if (!teams || !Array.isArray(teams)) return res.status(400).json({ error: 'teams is required.' });

    const createdBy = req.apiKeyUser?.id || (req.session?.user?.id > 0 ? req.session.user.id : null);
    const { teamSessionId, sessionName, gameType, teams: createdTeams } = await db.createTeamSession(gameId, teams, createdBy);

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Team Session Created', {
      teamSessionId,
      sessionName,
      gameId,
      gameType,
      teamCount: createdTeams.length,
    });

    res.json({ teamSessionId, sessionName, gameType, teams: createdTeams });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/team-sessions/:id/archive', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const session = await db.getTeamSessionById(req.params.id);
    await db.updateTeamSessionArchiveStatus(req.params.id, req.body.is_archived);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', req.body.is_archived ? 'Quiz Team Session Archived' : 'Quiz Team Session Unarchived', {
      teamSessionId: req.params.id,
      sessionName: session?.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update archive status.' });
  }
});

router.delete('/team-sessions/:id', hasRole('admin'), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const session = await db.getTeamSessionById(req.params.id);
    await db.deleteTeamSession(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Quiz Team Session Deleted', {
      teamSessionId: req.params.id,
      sessionName: session?.name,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete team session.' });
  }
});

router.get('/players/:playerId/review', hasRole('admin'), async (req, res) => {
  try {
    const player = await db.getQuizPlayerReview(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.status !== 'submitted') return res.status(400).json({ error: 'This player has not submitted the quiz yet.' });

    res.json({
      sessionName: player.session_name,
      member: formatMemberName(player.member_rank, player.member_last_name, player.member_first_name, player.member_name),
      achievedScore: player.achieved_score,
      maxScore: player.max_score,
      submittedAt: player.submitted_at,
      questions: player.snapshot.questions,
      answers: player.answers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/teams/:teamId/review', hasRole('admin'), async (req, res) => {
  try {
    const team = await db.getTeamReview(req.params.teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.status !== 'submitted') return res.status(400).json({ error: 'This team has not submitted the quiz yet.' });

    res.json({
      sessionName: team.session_name,
      teamName: team.name,
      achievedScore: team.achieved_score,
      maxScore: team.max_score,
      submittedAt: team.submitted_at,
      questions: team.snapshot.questions,
      answers: team.answers,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public: player access by code ───────────────────────────────────────────

router.get('/play/:code', publicSubmitLimiter, async (req, res) => {
  try {
    const player = await db.getQuizPlayerByCode(req.params.code);
    if (!player) return res.status(404).json({ error: 'Invalid or unrecognized access code.' });

    if (player.status === 'submitted') {
      return res.json({
        status: 'submitted',
        achievedScore: player.achieved_score,
        maxScore: player.max_score,
      });
    }
    if (player.is_archived) {
      return res.status(403).json({ error: 'This quiz session is archived and no longer accepting responses.' });
    }

    res.json({
      status: 'sent',
      name: player.session_name,
      member: formatMemberName(player.member_rank, player.member_last_name, player.member_first_name, player.member_name),
      description: player.snapshot.description,
      gameType: player.snapshot.game_type,
      questions: player.snapshot.questions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/play/:code/submit', publicSubmitLimiter, async (req, res) => {
  try {
    const player = await db.getQuizPlayerByCode(req.params.code);
    if (!player) return res.status(404).json({ error: 'Invalid access code.' });
    if (player.status === 'submitted') return res.status(400).json({ error: 'Already submitted.' });
    if (player.is_archived) {
      return res.status(403).json({ error: 'This quiz session was recently archived and can no longer accept submissions.' });
    }

    const answers = req.body;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Invalid submission data.' });

    // Timed games are always played against the clock — even solo — so they're
    // scored on speed + correctness (submittedData[id] = { answer, timeTakenMs }).
    // Score-based games mirror the Forms submission contract: a flat answer
    // object (field.id -> value, or field.id[] -> array for checkboxes).
    const { achieved, maximum } = player.snapshot.game_type === 'timed'
      ? calculateTimedQuizScore(player.snapshot.questions, answers)
      : calculateQuizScore(player.snapshot.questions, answers);
    await db.submitQuizPlayerResponse(req.params.code, answers, achieved, maximum);

    await db.logEvent('System', 'Quiz', 'Quiz Submitted & Scored', {
      sessionId: player.session_id,
      memberName: formatMemberName(player.member_rank, player.member_last_name, player.member_first_name, player.member_name),
      score: achieved,
      maxScore: maximum,
    });

    res.json({ success: true, achievedScore: achieved, maxScore: maximum });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public: team access by code (both game types) ──────────────────────────

router.get('/team-play/:code', publicSubmitLimiter, async (req, res) => {
  try {
    const team = await db.getTeamByCode(req.params.code);
    if (!team) return res.status(404).json({ error: 'Invalid or unrecognized access code.' });

    if (team.status === 'submitted') {
      return res.json({
        status: 'submitted',
        achievedScore: team.achieved_score,
        maxScore: team.max_score,
      });
    }
    if (team.is_archived) {
      return res.status(403).json({ error: 'This team setup is archived and no longer accepting responses.' });
    }

    res.json({
      status: 'sent',
      name: team.session_name,
      team: team.name,
      description: team.snapshot.description,
      gameType: team.game_type,
      questions: team.snapshot.questions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/team-play/:code/submit', publicSubmitLimiter, async (req, res) => {
  try {
    const team = await db.getTeamByCode(req.params.code);
    if (!team) return res.status(404).json({ error: 'Invalid access code.' });
    if (team.status === 'submitted') return res.status(400).json({ error: 'Already submitted.' });
    if (team.is_archived) {
      return res.status(403).json({ error: 'This team setup was recently archived and can no longer accept submissions.' });
    }

    const answers = req.body;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Invalid submission data.' });

    const { achieved, maximum } = team.game_type === 'timed'
      ? calculateTimedQuizScore(team.snapshot.questions, answers)
      : calculateQuizScore(team.snapshot.questions, answers);
    await db.submitTeamResponse(req.params.code, answers, achieved, maximum);

    await db.logEvent('System', 'Quiz', 'Quiz Team Submitted & Scored', {
      teamSessionId: team.team_session_id,
      teamName: team.name,
      score: achieved,
      maxScore: maximum,
    });

    res.json({ success: true, achievedScore: achieved, maxScore: maximum });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
