const express = require('express');
const router = express.Router();
const db = require('../../services/db');
const config = require('../../config');
const logger = require('../../services/logger');
const mailer = require('../../services/mailer');
const { hasRole } = require('../../middleware/auth');
const { publicSubmitLimiter } = require('../../middleware/rate-limiter');
const { formatMemberName } = require('../../services/rank-config');
const { calculateQuizScore, scoreTimedAnswer } = require('../../services/quiz-scoring');
const { broadcastQuizLive, getJoinedParticipantIds } = require('../../services/quiz-live-socket');

const LIVE_KINDS = ['individual', 'team'];

function stripCorrectAnswer(question) {
  if (!question) return question;
  const { correctAnswer, ...rest } = question;
  return rest;
}

function parseUtcTimestamp(ts) {
  return new Date(String(ts).replace(' ', 'T') + 'Z').getTime();
}

// Builds the Timed-play response shape for one participant (individual player
// or team) from the session's live host state — shared by GET /play/:code and
// GET /team-play/:code so both flavours of Timed play behave identically.
async function buildLiveStateForParticipant(kind, participantRow) {
  const sessionId = kind === 'team' ? participantRow.team_session_id : participantRow.session_id;
  const session = await db.getLiveSession(kind, sessionId);
  const questions = session.snapshot.questions || [];
  const phase = session.game_phase;
  const questionIndex = session.current_question_index;

  const state = {
    status: 'live',
    name: session.name,
    gameType: 'timed',
    phase,
    currentQuestionIndex: questionIndex,
    totalQuestions: questions.length,
  };

  if (phase === 'question' || phase === 'reveal') {
    const question = questions[questionIndex];
    state.currentQuestion = stripCorrectAnswer(question);
    state.questionStartedAt = session.question_started_at;
    if (phase === 'reveal') state.correctAnswer = question.correctAnswer;
    const myAnswer = await db.getParticipantAnswer(kind, sessionId, participantRow.id, questionIndex);
    state.hasAnsweredCurrent = myAnswer !== undefined;
    if (myAnswer !== undefined) state.myAnswer = myAnswer;
  }
  if (phase === 'leaderboard' || phase === 'finished') {
    state.leaderboard = await db.getLiveLeaderboard(kind, sessionId);
  }
  return state;
}

async function handleLiveAnswer(kind, req, res) {
  try {
    const code = req.params.code;
    const participant = kind === 'team' ? await db.getTeamByCode(code) : await db.getQuizPlayerByCode(code);
    if (!participant) return res.status(404).json({ error: 'Invalid access code.' });

    const gameType = kind === 'team' ? participant.game_type : participant.snapshot.game_type;
    if (gameType !== 'timed') return res.status(400).json({ error: 'This session is not a live Timed session.' });
    if (participant.is_archived) return res.status(403).json({ error: 'This session is archived and no longer accepting responses.' });

    const sessionId = kind === 'team' ? participant.team_session_id : participant.session_id;
    const session = await db.getLiveSession(kind, sessionId);
    if (session.game_phase !== 'question') return res.status(400).json({ error: 'No question is currently live.' });

    const questionIndex = session.current_question_index;
    const question = session.snapshot.questions[questionIndex];
    if (!question) return res.status(400).json({ error: 'Invalid question index.' });

    const { answer } = req.body;
    const timeTakenMs = Math.max(0, Date.now() - parseUtcTimestamp(session.question_started_at));
    const { isCorrect, points } = scoreTimedAnswer(question, answer, timeTakenMs);
    const recorded = await db.recordLiveAnswer(kind, sessionId, participant.id, questionIndex, answer, timeTakenMs, isCorrect, points);
    if (!recorded) return res.status(400).json({ error: 'You have already answered this question.' });

    const roster = await db.getLiveRoster(kind, sessionId);
    const answeredIds = await db.getAnsweredParticipantIds(kind, sessionId, questionIndex);
    broadcastQuizLive(kind, sessionId, 'answer-progress', { answeredCount: answeredIds.length, totalCount: roster.length });

    if (answeredIds.length >= roster.length) {
      const revealed = await db.revealCurrentQuestion(kind, sessionId);
      if (revealed) {
        broadcastQuizLive(kind, sessionId, 'question-revealed', { questionIndex, correctAnswer: question.correctAnswer });
      }
    }

    res.json({ success: true, isCorrect, points });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

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

// ── Admin: standalone leaderboard (Launch button, Score-based sessions) ─────
// Polled every ~10s by the standalone leaderboard window opened from
// live-quiz.html — shows current standings as members/teams submit their
// self-paced Score quiz. Works for either kind of session.

router.get('/leaderboard/:kind/:sessionId', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const session = await db.getLiveSession(kind, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const roster = kind === 'team'
      ? await db.getTeamSessionTeams(sessionId)
      : await db.getQuizSessionPlayers(sessionId);

    const rankings = roster
      .map((p) => ({
        id: p.id,
        name: kind === 'team'
          ? p.name
          : formatMemberName(p.member_rank, p.member_last_name, p.member_first_name, p.member_name),
        status: p.status,
        achievedScore: p.achieved_score,
        maxScore: p.max_score,
        accessCode: p.access_code,
      }))
      .sort((a, b) => (b.achievedScore || 0) - (a.achievedScore || 0));

    res.json({ sessionName: session.name, gameType: session.game_type, rankings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: live hosting (Phase 4 — host-synced Timed play) ──────────────────

router.get('/host/:kind/:sessionId/state', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const session = await db.getLiveSession(kind, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.game_type !== 'timed') return res.status(400).json({ error: 'Only Timed sessions support live hosting.' });

    // A freshly (re)opened host screen never resumes mid-question — collapse
    // question/reveal straight to the leaderboard so it always lands somewhere
    // stable, then the host drives the rest via Next Question. This must only
    // fire on an actual page (re)open (?resume=1, sent once by the host page's
    // init()) — NOT on the routine refetches triggered by every live socket
    // event (question-started, lobby-update, etc.), or a normal in-progress
    // question would collapse itself the instant it started.
    if (req.query.resume === '1') {
      if (session.game_phase === 'question') {
        await db.revealCurrentQuestion(kind, sessionId);
        await db.advanceToLeaderboard(kind, sessionId);
        session.game_phase = 'leaderboard';
      } else if (session.game_phase === 'reveal') {
        await db.advanceToLeaderboard(kind, sessionId);
        session.game_phase = 'leaderboard';
      }
    }

    const roster = await db.getLiveRoster(kind, sessionId);
    const joinedIds = getJoinedParticipantIds(kind, sessionId);
    const questions = session.snapshot.questions || [];
    const state = {
      sessionName: session.name,
      phase: session.game_phase,
      currentQuestionIndex: session.current_question_index,
      totalQuestions: questions.length,
      roster: roster.map((p) => ({ id: p.id, name: p.name, accessCode: p.access_code, joined: joinedIds.includes(p.id) })),
    };
    if (session.game_phase === 'question' || session.game_phase === 'reveal') {
      state.currentQuestion = questions[session.current_question_index];
      state.questionStartedAt = session.question_started_at;
      const answeredIds = await db.getAnsweredParticipantIds(kind, sessionId, session.current_question_index);
      state.answeredCount = answeredIds.length;
    }
    if (session.game_phase === 'leaderboard' || session.game_phase === 'finished') {
      state.leaderboard = await db.getLiveLeaderboard(kind, sessionId);
    }
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/host/:kind/:sessionId/start', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const session = await db.getLiveSession(kind, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.game_type !== 'timed') return res.status(400).json({ error: 'Only Timed sessions support live hosting.' });

    const started = await db.startLiveGame(kind, sessionId);
    if (!started) return res.status(400).json({ error: 'This game has already started.' });

    const questions = session.snapshot.questions || [];
    broadcastQuizLive(kind, sessionId, 'question-started', {
      questionIndex: 0,
      question: stripCorrectAnswer(questions[0]),
      totalQuestions: questions.length,
    });

    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Quiz', 'Live Quiz Started', { sessionKind: kind, sessionId, sessionName: session.name });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/host/:kind/:sessionId/reveal', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const session = await db.getLiveSession(kind, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const revealed = await db.revealCurrentQuestion(kind, sessionId);
    if (revealed) {
      const question = session.snapshot.questions[session.current_question_index];
      broadcastQuizLive(kind, sessionId, 'question-revealed', {
        questionIndex: session.current_question_index,
        correctAnswer: question.correctAnswer,
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/host/:kind/:sessionId/show-leaderboard', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const advanced = await db.advanceToLeaderboard(kind, sessionId);
    if (advanced) {
      const leaderboard = await db.getLiveLeaderboard(kind, sessionId);
      broadcastQuizLive(kind, sessionId, 'leaderboard-shown', { leaderboard });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/host/:kind/:sessionId/next', hasRole('admin'), async (req, res) => {
  try {
    const { kind, sessionId } = req.params;
    if (!LIVE_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid session kind.' });
    const session = await db.getLiveSession(kind, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const questions = session.snapshot.questions || [];
    const previousIndex = session.current_question_index;
    const result = await db.advanceToNextQuestion(kind, sessionId, questions.length);
    if (!result) return res.status(400).json({ error: 'The leaderboard must be shown before advancing.' });

    if (result === 'question') {
      const nextIndex = previousIndex + 1;
      broadcastQuizLive(kind, sessionId, 'question-started', {
        questionIndex: nextIndex,
        question: stripCorrectAnswer(questions[nextIndex]),
        totalQuestions: questions.length,
      });
    } else {
      const leaderboard = await db.getLiveLeaderboard(kind, sessionId);
      broadcastQuizLive(kind, sessionId, 'game-finished', { leaderboard });
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
      await db.logEvent(actor, 'Quiz', 'Live Quiz Finished', { sessionKind: kind, sessionId, sessionName: session.name });
    }
    res.json({ success: true, phase: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public: join by short code ──────────────────────────────────────────────
// Resolves the join code a player/captain typed on quiz-join.html to a kind
// (individual/team) and the code itself, so the frontend can redirect to the
// right quiz-play.html query param — same code, no separate lookup table,
// since access codes are now short enough to type directly.

router.post('/join', publicSubmitLimiter, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Enter a code.' });

    const player = await db.getQuizPlayerByCode(code);
    if (player) {
      if (player.is_archived) return res.status(403).json({ error: 'This quiz is no longer accepting responses.' });
      return res.json({ kind: 'individual', code });
    }

    const team = await db.getTeamByCode(code);
    if (team) {
      if (team.is_archived) return res.status(403).json({ error: 'This quiz is no longer accepting responses.' });
      return res.json({ kind: 'team', code });
    }

    res.status(404).json({ error: 'Code not found — check it and try again.' });
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

    if (player.snapshot.game_type === 'timed') {
      const state = await buildLiveStateForParticipant('individual', player);
      state.member = formatMemberName(player.member_rank, player.member_last_name, player.member_first_name, player.member_name);
      return res.json(state);
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

router.post('/play/:code/live-answer', publicSubmitLimiter, (req, res) => handleLiveAnswer('individual', req, res));

router.post('/play/:code/submit', publicSubmitLimiter, async (req, res) => {
  try {
    const player = await db.getQuizPlayerByCode(req.params.code);
    if (!player) return res.status(404).json({ error: 'Invalid access code.' });
    if (player.status === 'submitted') return res.status(400).json({ error: 'Already submitted.' });
    if (player.is_archived) {
      return res.status(403).json({ error: 'This quiz session was recently archived and can no longer accept submissions.' });
    }
    if (player.snapshot.game_type === 'timed') {
      return res.status(400).json({ error: 'Timed quizzes are answered live through the host session, not submitted as a whole.' });
    }

    const answers = req.body;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Invalid submission data.' });

    // Score-based games mirror the Forms submission contract: a flat answer
    // object (field.id -> value, or field.id[] -> array for checkboxes).
    const { achieved, maximum } = calculateQuizScore(player.snapshot.questions, answers);
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

    if (team.game_type === 'timed') {
      const state = await buildLiveStateForParticipant('team', team);
      state.team = team.name;
      return res.json(state);
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

router.post('/team-play/:code/live-answer', publicSubmitLimiter, (req, res) => handleLiveAnswer('team', req, res));

router.post('/team-play/:code/submit', publicSubmitLimiter, async (req, res) => {
  try {
    const team = await db.getTeamByCode(req.params.code);
    if (!team) return res.status(404).json({ error: 'Invalid access code.' });
    if (team.status === 'submitted') return res.status(400).json({ error: 'Already submitted.' });
    if (team.is_archived) {
      return res.status(403).json({ error: 'This team setup was recently archived and can no longer accept submissions.' });
    }
    if (team.game_type === 'timed') {
      return res.status(400).json({ error: 'Timed quizzes are answered live through the host session, not submitted as a whole.' });
    }

    const answers = req.body;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Invalid submission data.' });

    const { achieved, maximum } = calculateQuizScore(team.snapshot.questions, answers);
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
