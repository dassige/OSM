const crypto = require("crypto");
const { initDB } = require("./connection");
const { TIMED_MAX_POINTS_PER_QUESTION } = require("../quiz-scoring");

// Join codes — short enough to read aloud or type on a phone (no long link
// needed). Excludes 0/O/1/I so it's unambiguous when read off a shared screen.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 6;

function generateJoinCode() {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueCode(db, table) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    const existing = await db.get(`SELECT id FROM ${table} WHERE access_code = ?`, code);
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique join code — please try again.");
}

function parseGame(g) {
  if (!g) return g;
  let questions = [];
  try {
    questions = JSON.parse(g.questions || "[]");
  } catch (e) {
    questions = [];
  }
  return {
    ...g,
    enabled: g.enabled !== 0,
    questions,
    questionCount: questions.length,
  };
}

async function getQuizGames() {
  const db = await initDB();
  const rows = await db.all("SELECT * FROM quiz_games ORDER BY name ASC");
  return rows.map(parseGame);
}

async function getQuizGameById(id) {
  const db = await initDB();
  const row = await db.get("SELECT * FROM quiz_games WHERE id = ?", id);
  return parseGame(row);
}

async function createQuizGame(game) {
  const db = await initDB();
  const result = await db.run(
    `INSERT INTO quiz_games (name, description, game_type, enabled, questions)
     VALUES (?, ?, ?, ?, ?)`,
    game.name,
    game.description || "",
    game.game_type || "score",
    game.enabled !== false ? 1 : 0,
    JSON.stringify(game.questions || []),
  );
  return result.lastID;
}

async function updateQuizGame(id, game) {
  const db = await initDB();
  await db.run(
    `UPDATE quiz_games SET name = ?, description = ?, game_type = ?, enabled = ?, questions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    game.name,
    game.description || "",
    game.game_type || "score",
    game.enabled !== false ? 1 : 0,
    JSON.stringify(game.questions || []),
    id,
  );
}

async function deleteQuizGame(id) {
  const db = await initDB();
  await db.run("DELETE FROM quiz_games WHERE id = ?", id);
}

// ── Quiz Sessions (Phase 2 — self-paced play) ───────────────────────────────

function parseSession(s) {
  if (!s) return s;
  let snapshot = { questions: [] };
  try {
    snapshot = JSON.parse(s.game_snapshot || "{}");
  } catch (e) {
    snapshot = { questions: [] };
  }
  return { ...s, is_archived: s.is_archived !== 0, snapshot };
}

async function createQuizSession(gameId, memberIds, createdBy) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const game = await db.get("SELECT * FROM quiz_games WHERE id = ?", gameId);
    if (!game) throw new Error("Quiz game not found.");

    const sessionName = `${game.name} - ${new Date().toISOString().split("T")[0]}`;
    const snapshot = JSON.stringify({
      name: game.name,
      description: game.description,
      game_type: game.game_type,
      questions: JSON.parse(game.questions || "[]"),
    });
    const sessionResult = await db.run(
      `INSERT INTO quiz_sessions (game_id, name, game_type, game_snapshot, created_by) VALUES (?, ?, ?, ?, ?)`,
      gameId, sessionName, game.game_type, snapshot, createdBy,
    );
    const sessionId = sessionResult.lastID;

    const players = [];
    const stmt = await db.prepare(
      `INSERT INTO quiz_players (session_id, member_id, access_code, status) VALUES (?, ?, ?, 'sent')`,
    );
    for (const memberId of memberIds) {
      const accessCode = await generateUniqueCode(db, "quiz_players");
      await stmt.run(sessionId, memberId, accessCode);
      players.push({ memberId, accessCode });
    }
    await stmt.finalize();
    await db.exec("COMMIT");
    return { sessionId, players };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

function withTotalQuestions(row) {
  let totalQuestions = 0;
  try {
    totalQuestions = (JSON.parse(row.game_snapshot || "{}").questions || []).length;
  } catch (e) {
    totalQuestions = 0;
  }
  const { game_snapshot, ...rest } = row;
  return { ...rest, total_questions: totalQuestions };
}

async function getQuizSessions() {
  const db = await initDB();
  const rows = await db.all(`
    SELECT
      qs.id, qs.name, qs.game_id, qs.game_type, qs.is_archived, qs.created_at,
      qs.game_phase, qs.current_question_index, qs.game_snapshot,
      g.name as game_name,
      COUNT(qp.id) as total_sent,
      SUM(CASE WHEN qp.status = 'submitted' THEN 1 ELSE 0 END) as total_submitted
    FROM quiz_sessions qs
    JOIN quiz_games g ON qs.game_id = g.id
    LEFT JOIN quiz_players qp ON qs.id = qp.session_id
    GROUP BY qs.id
    ORDER BY qs.created_at DESC
  `);
  return rows.map((r) => withTotalQuestions({ ...r, is_archived: r.is_archived !== 0 }));
}

async function getQuizSessionById(id) {
  const db = await initDB();
  const row = await db.get("SELECT * FROM quiz_sessions WHERE id = ?", id);
  return parseSession(row);
}

async function getQuizSessionPlayers(sessionId) {
  const db = await initDB();
  return db.all(
    `SELECT
       qp.id, qp.access_code, qp.status, qp.achieved_score, qp.max_score, qp.submitted_at,
       m.name as member_name, m.email,
       m.rank as member_rank, m.first_name as member_first_name, m.last_name as member_last_name
     FROM quiz_players qp
     JOIN members m ON qp.member_id = m.id
     WHERE qp.session_id = ?
     ORDER BY m.name ASC`,
    sessionId,
  );
}

async function getQuizPlayerByCode(code) {
  const db = await initDB();
  const row = await db.get(
    `SELECT qp.*, qs.name as session_name, qs.is_archived, qs.game_snapshot,
            m.name as member_name, m.rank as member_rank,
            m.first_name as member_first_name, m.last_name as member_last_name
     FROM quiz_players qp
     JOIN quiz_sessions qs ON qp.session_id = qs.id
     JOIN members m ON qp.member_id = m.id
     WHERE qp.access_code = ?`,
    code,
  );
  if (row) {
    try {
      row.snapshot = JSON.parse(row.game_snapshot || "{}");
    } catch (e) {
      row.snapshot = { questions: [] };
    }
  }
  return row;
}

async function getQuizPlayerById(id) {
  const db = await initDB();
  return db.get(
    `SELECT qp.*, m.name as member_name, m.email
     FROM quiz_players qp
     JOIN members m ON qp.member_id = m.id
     WHERE qp.id = ?`,
    id,
  );
}

async function getQuizPlayerReview(id) {
  const db = await initDB();
  const row = await db.get(
    `SELECT qp.*, qs.name as session_name, qs.game_snapshot,
            m.name as member_name, m.rank as member_rank,
            m.first_name as member_first_name, m.last_name as member_last_name
     FROM quiz_players qp
     JOIN quiz_sessions qs ON qp.session_id = qs.id
     JOIN members m ON qp.member_id = m.id
     WHERE qp.id = ?`,
    id,
  );
  if (!row) return row;
  try {
    row.snapshot = JSON.parse(row.game_snapshot || "{}");
  } catch (e) {
    row.snapshot = { questions: [] };
  }
  try {
    row.answers = JSON.parse(row.submitted_data || "{}");
  } catch (e) {
    row.answers = {};
  }
  return row;
}

async function submitQuizPlayerResponse(code, submittedData, achieved, maxScore) {
  const db = await initDB();
  await db.run(
    `UPDATE quiz_players
     SET status = 'submitted', submitted_data = ?, achieved_score = ?, max_score = ?, submitted_at = CURRENT_TIMESTAMP
     WHERE access_code = ?`,
    JSON.stringify(submittedData), achieved, maxScore, code,
  );
}

async function updateQuizSessionArchiveStatus(id, isArchived) {
  const db = await initDB();
  await db.run("UPDATE quiz_sessions SET is_archived = ? WHERE id = ?", isArchived ? 1 : 0, id);
}

async function deleteQuizSession(id) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    await db.run("DELETE FROM quiz_players WHERE session_id = ?", id);
    await db.run("DELETE FROM quiz_sessions WHERE id = ?", id);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ── Quiz Team Sessions (Phase 3 — team setup for both game types) ──────────

function parseTeamSession(s) {
  if (!s) return s;
  let snapshot = { questions: [] };
  try {
    snapshot = JSON.parse(s.game_snapshot || "{}");
  } catch (e) {
    snapshot = { questions: [] };
  }
  return { ...s, is_archived: s.is_archived !== 0, snapshot };
}

async function createTeamSession(gameId, teams, createdBy) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const game = await db.get("SELECT * FROM quiz_games WHERE id = ?", gameId);
    if (!game) throw new Error("Quiz game not found.");
    if (!Array.isArray(teams) || teams.length < 2) {
      throw new Error("At least 2 teams are required.");
    }
    for (const t of teams) {
      if (!t.name || !t.name.trim()) throw new Error("Every team needs a name.");
      if (!Array.isArray(t.memberIds) || t.memberIds.length === 0) {
        throw new Error(`Team "${t.name}" needs at least one member.`);
      }
    }
    const allMemberIds = teams.flatMap((t) => t.memberIds);
    if (new Set(allMemberIds).size !== allMemberIds.length) {
      throw new Error("A member cannot belong to more than one team.");
    }

    const sessionName = `${game.name} - ${new Date().toISOString().split("T")[0]}`;
    const snapshot = JSON.stringify({
      name: game.name,
      description: game.description,
      game_type: game.game_type,
      questions: JSON.parse(game.questions || "[]"),
    });
    const sessionResult = await db.run(
      `INSERT INTO quiz_team_sessions (game_id, name, game_type, game_snapshot, created_by) VALUES (?, ?, ?, ?, ?)`,
      gameId, sessionName, game.game_type, snapshot, createdBy,
    );
    const teamSessionId = sessionResult.lastID;

    const createdTeams = [];
    for (const t of teams) {
      const accessCode = await generateUniqueCode(db, "quiz_teams");
      const teamResult = await db.run(
        `INSERT INTO quiz_teams (team_session_id, name, access_code) VALUES (?, ?, ?)`,
        teamSessionId, t.name.trim(), accessCode,
      );
      const teamId = teamResult.lastID;
      for (const memberId of t.memberIds) {
        await db.run(`INSERT INTO quiz_team_members (team_id, member_id) VALUES (?, ?)`, teamId, memberId);
      }
      createdTeams.push({ teamId, name: t.name.trim(), accessCode, memberCount: t.memberIds.length });
    }

    await db.exec("COMMIT");
    return { teamSessionId, sessionName, gameType: game.game_type, teams: createdTeams };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function getTeamSessions() {
  const db = await initDB();
  const rows = await db.all(`
    SELECT
      qts.id, qts.name, qts.game_id, qts.game_type, qts.is_archived, qts.created_at,
      qts.game_phase, qts.current_question_index, qts.game_snapshot,
      g.name as game_name,
      COUNT(DISTINCT qt.id) as total_teams,
      COUNT(qtm.id) as total_members,
      COUNT(DISTINCT CASE WHEN qt.status = 'submitted' THEN qt.id END) as total_submitted
    FROM quiz_team_sessions qts
    JOIN quiz_games g ON qts.game_id = g.id
    LEFT JOIN quiz_teams qt ON qts.id = qt.team_session_id
    LEFT JOIN quiz_team_members qtm ON qt.id = qtm.team_id
    GROUP BY qts.id
    ORDER BY qts.created_at DESC
  `);
  return rows.map((r) => withTotalQuestions({ ...r, is_archived: r.is_archived !== 0 }));
}

async function getTeamSessionById(id) {
  const db = await initDB();
  const row = await db.get("SELECT * FROM quiz_team_sessions WHERE id = ?", id);
  return parseTeamSession(row);
}

async function getTeamSessionTeams(teamSessionId) {
  const db = await initDB();
  const teams = await db.all(
    `SELECT id, name, access_code, status, achieved_score, max_score, submitted_at
     FROM quiz_teams WHERE team_session_id = ? ORDER BY name ASC`,
    teamSessionId,
  );
  for (const team of teams) {
    team.members = await db.all(
      `SELECT m.id, m.name, m.rank, m.first_name, m.last_name
       FROM quiz_team_members qtm
       JOIN members m ON qtm.member_id = m.id
       WHERE qtm.team_id = ?
       ORDER BY m.name ASC`,
      team.id,
    );
  }
  return teams;
}

async function getTeamByCode(code) {
  const db = await initDB();
  const row = await db.get(
    `SELECT qt.*, qts.name as session_name, qts.game_type, qts.is_archived, qts.game_snapshot
     FROM quiz_teams qt
     JOIN quiz_team_sessions qts ON qt.team_session_id = qts.id
     WHERE qt.access_code = ?`,
    code,
  );
  if (row) {
    try {
      row.snapshot = JSON.parse(row.game_snapshot || "{}");
    } catch (e) {
      row.snapshot = { questions: [] };
    }
  }
  return row;
}

async function submitTeamResponse(code, submittedData, achieved, maxScore) {
  const db = await initDB();
  await db.run(
    `UPDATE quiz_teams
     SET status = 'submitted', submitted_data = ?, achieved_score = ?, max_score = ?, submitted_at = CURRENT_TIMESTAMP
     WHERE access_code = ?`,
    JSON.stringify(submittedData), achieved, maxScore, code,
  );
}

async function getTeamReview(teamId) {
  const db = await initDB();
  const row = await db.get(
    `SELECT qt.*, qts.name as session_name, qts.game_snapshot
     FROM quiz_teams qt
     JOIN quiz_team_sessions qts ON qt.team_session_id = qts.id
     WHERE qt.id = ?`,
    teamId,
  );
  if (!row) return row;
  try {
    row.snapshot = JSON.parse(row.game_snapshot || "{}");
  } catch (e) {
    row.snapshot = { questions: [] };
  }
  try {
    row.answers = JSON.parse(row.submitted_data || "{}");
  } catch (e) {
    row.answers = {};
  }
  return row;
}

async function updateTeamSessionArchiveStatus(id, isArchived) {
  const db = await initDB();
  await db.run("UPDATE quiz_team_sessions SET is_archived = ? WHERE id = ?", isArchived ? 1 : 0, id);
}

async function deleteTeamSession(id) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    await db.run(
      `DELETE FROM quiz_team_members WHERE team_id IN (SELECT id FROM quiz_teams WHERE team_session_id = ?)`,
      id,
    );
    await db.run("DELETE FROM quiz_teams WHERE team_session_id = ?", id);
    await db.run("DELETE FROM quiz_team_sessions WHERE id = ?", id);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ── Live hosting (Phase 4 — host-synced Timed play) ─────────────────────────
// "kind" is 'individual' (quiz_sessions/quiz_players) or 'team' (quiz_team_sessions/quiz_teams).

const LIVE_KIND_TABLES = {
  individual: { sessionTable: "quiz_sessions", participantTable: "quiz_players" },
  team: { sessionTable: "quiz_team_sessions", participantTable: "quiz_teams" },
};

function assertLiveKind(kind) {
  const cfg = LIVE_KIND_TABLES[kind];
  if (!cfg) throw new Error(`Invalid session kind: ${kind}`);
  return cfg;
}

async function getLiveSession(kind, sessionId) {
  const { sessionTable } = assertLiveKind(kind);
  const db = await initDB();
  const row = await db.get(`SELECT * FROM ${sessionTable} WHERE id = ?`, sessionId);
  return kind === "team" ? parseTeamSession(row) : parseSession(row);
}

async function getLiveRoster(kind, sessionId) {
  const db = await initDB();
  if (kind === "team") {
    return db.all(
      `SELECT id, name, access_code, status FROM quiz_teams WHERE team_session_id = ? ORDER BY name ASC`,
      sessionId,
    );
  }
  return db.all(
    `SELECT qp.id, m.name as name, qp.access_code, qp.status
     FROM quiz_players qp JOIN members m ON qp.member_id = m.id
     WHERE qp.session_id = ? ORDER BY m.name ASC`,
    sessionId,
  );
}

async function startLiveGame(kind, sessionId) {
  const { sessionTable } = assertLiveKind(kind);
  const db = await initDB();
  const result = await db.run(
    `UPDATE ${sessionTable} SET game_phase = 'question', current_question_index = 0, question_started_at = CURRENT_TIMESTAMP
     WHERE id = ? AND game_phase = 'lobby'`,
    sessionId,
  );
  return result.changes > 0;
}

async function recordLiveAnswer(kind, sessionId, participantId, questionIndex, answer, timeTakenMs, isCorrect, points) {
  const db = await initDB();
  const result = await db.run(
    `INSERT OR IGNORE INTO quiz_live_answers
       (session_kind, session_id, participant_id, question_index, answer, time_taken_ms, is_correct, points_awarded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    kind, sessionId, participantId, questionIndex, JSON.stringify(answer), timeTakenMs, isCorrect ? 1 : 0, points,
  );
  return result.changes > 0;
}

async function getAnsweredParticipantIds(kind, sessionId, questionIndex) {
  const db = await initDB();
  const rows = await db.all(
    `SELECT participant_id FROM quiz_live_answers WHERE session_kind = ? AND session_id = ? AND question_index = ?`,
    kind, sessionId, questionIndex,
  );
  return rows.map((r) => r.participant_id);
}

// Lets a player's own screen show what they picked at reveal time — recorded
// server-side, so it survives a page reload between answering and reveal.
async function getParticipantAnswer(kind, sessionId, participantId, questionIndex) {
  const db = await initDB();
  const row = await db.get(
    `SELECT answer FROM quiz_live_answers WHERE session_kind = ? AND session_id = ? AND participant_id = ? AND question_index = ?`,
    kind, sessionId, participantId, questionIndex,
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.answer);
  } catch (e) {
    return row.answer;
  }
}

async function revealCurrentQuestion(kind, sessionId) {
  const { sessionTable } = assertLiveKind(kind);
  const db = await initDB();
  const result = await db.run(
    `UPDATE ${sessionTable} SET game_phase = 'reveal' WHERE id = ? AND game_phase = 'question'`,
    sessionId,
  );
  return result.changes > 0;
}

async function advanceToLeaderboard(kind, sessionId) {
  const { sessionTable } = assertLiveKind(kind);
  const db = await initDB();
  const result = await db.run(
    `UPDATE ${sessionTable} SET game_phase = 'leaderboard' WHERE id = ? AND game_phase = 'reveal'`,
    sessionId,
  );
  return result.changes > 0;
}

async function getLiveLeaderboard(kind, sessionId) {
  const db = await initDB();
  const roster = await getLiveRoster(kind, sessionId);
  const totals = await db.all(
    `SELECT participant_id, SUM(points_awarded) as total FROM quiz_live_answers
     WHERE session_kind = ? AND session_id = ? GROUP BY participant_id`,
    kind, sessionId,
  );
  const totalsMap = new Map(totals.map((t) => [t.participant_id, t.total]));
  return roster
    .map((p) => ({ id: p.id, name: p.name, accessCode: p.access_code, score: totalsMap.get(p.id) || 0 }))
    .sort((a, b) => b.score - a.score);
}

async function finalizeLiveParticipants(kind, sessionId) {
  const db = await initDB();
  const session = await getLiveSession(kind, sessionId);
  const questions = session.snapshot.questions || [];
  const maxScore = questions.length * TIMED_MAX_POINTS_PER_QUESTION;

  const roster = await getLiveRoster(kind, sessionId);
  const rows = await db.all(
    `SELECT participant_id, question_index, answer, time_taken_ms, points_awarded
     FROM quiz_live_answers WHERE session_kind = ? AND session_id = ?`,
    kind, sessionId,
  );

  const byParticipant = new Map();
  for (const row of rows) {
    if (!byParticipant.has(row.participant_id)) {
      byParticipant.set(row.participant_id, { submittedData: {}, achieved: 0 });
    }
    const entry = byParticipant.get(row.participant_id);
    const question = questions[row.question_index];
    if (question) {
      let answer;
      try { answer = JSON.parse(row.answer); } catch (e) { answer = row.answer; }
      // Stored flat (question.id -> plain value), matching the Score-based
      // submission shape — the review UI (quiz-play.html renderReview) reads
      // submitted_data as a flat map for both game types.
      entry.submittedData[question.id] = answer;
    }
    entry.achieved += row.points_awarded;
  }

  for (const participant of roster) {
    const entry = byParticipant.get(participant.id) || { submittedData: {}, achieved: 0 };
    if (kind === "team") {
      await submitTeamResponse(participant.access_code, entry.submittedData, entry.achieved, maxScore);
    } else {
      await submitQuizPlayerResponse(participant.access_code, entry.submittedData, entry.achieved, maxScore);
    }
  }
}

async function advanceToNextQuestion(kind, sessionId, questionCount) {
  const { sessionTable } = assertLiveKind(kind);
  const db = await initDB();
  const session = await db.get(
    `SELECT * FROM ${sessionTable} WHERE id = ? AND game_phase = 'leaderboard'`,
    sessionId,
  );
  if (!session) return null;

  const nextIndex = session.current_question_index + 1;
  if (nextIndex >= questionCount) {
    await db.run(`UPDATE ${sessionTable} SET game_phase = 'finished' WHERE id = ?`, sessionId);
    await finalizeLiveParticipants(kind, sessionId);
    return "finished";
  }
  await db.run(
    `UPDATE ${sessionTable} SET game_phase = 'question', current_question_index = ?, question_started_at = CURRENT_TIMESTAMP WHERE id = ?`,
    nextIndex, sessionId,
  );
  return "question";
}

module.exports = {
  getQuizGames, getQuizGameById, createQuizGame, updateQuizGame, deleteQuizGame,
  createQuizSession, getQuizSessions, getQuizSessionById, getQuizSessionPlayers,
  getQuizPlayerByCode, getQuizPlayerById, getQuizPlayerReview, submitQuizPlayerResponse,
  updateQuizSessionArchiveStatus, deleteQuizSession,
  createTeamSession, getTeamSessions, getTeamSessionById, getTeamSessionTeams,
  getTeamByCode, submitTeamResponse, getTeamReview,
  updateTeamSessionArchiveStatus, deleteTeamSession,
  getLiveSession, getLiveRoster, startLiveGame, recordLiveAnswer, getAnsweredParticipantIds, getParticipantAnswer,
  revealCurrentQuestion, advanceToLeaderboard, getLiveLeaderboard, advanceToNextQuestion,
};
