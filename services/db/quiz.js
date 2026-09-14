const crypto = require("crypto");
const { initDB } = require("./connection");

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
      const accessCode = crypto.randomUUID();
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

async function getQuizSessions() {
  const db = await initDB();
  const rows = await db.all(`
    SELECT
      qs.id, qs.name, qs.game_id, qs.game_type, qs.is_archived, qs.created_at,
      g.name as game_name,
      COUNT(qp.id) as total_sent,
      SUM(CASE WHEN qp.status = 'submitted' THEN 1 ELSE 0 END) as total_submitted
    FROM quiz_sessions qs
    JOIN quiz_games g ON qs.game_id = g.id
    LEFT JOIN quiz_players qp ON qs.id = qp.session_id
    GROUP BY qs.id
    ORDER BY qs.created_at DESC
  `);
  return rows.map((r) => ({ ...r, is_archived: r.is_archived !== 0 }));
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
      const accessCode = crypto.randomUUID();
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
  return rows.map((r) => ({ ...r, is_archived: r.is_archived !== 0 }));
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

module.exports = {
  getQuizGames, getQuizGameById, createQuizGame, updateQuizGame, deleteQuizGame,
  createQuizSession, getQuizSessions, getQuizSessionById, getQuizSessionPlayers,
  getQuizPlayerByCode, getQuizPlayerById, getQuizPlayerReview, submitQuizPlayerResponse,
  updateQuizSessionArchiveStatus, deleteQuizSession,
  createTeamSession, getTeamSessions, getTeamSessionById, getTeamSessionTeams,
  getTeamByCode, submitTeamResponse, getTeamReview,
  updateTeamSessionArchiveStatus, deleteTeamSession,
};
