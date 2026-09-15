// services/quiz-live-socket.js
// Real-time push channel for host-driven Timed quiz play (Phase 4). Mutations
// (start/answer/reveal/next) still go through the normal REST routes in
// routes/api/live-quiz.js — this namespace only broadcasts the resulting state
// to the host screen and every joined player/team so they update instantly
// instead of polling.
const db = require("./db");
const logger = require("./logger");

let quizNamespace = null;

function roomName(kind, sessionId) {
  return `quiz:${kind}:${sessionId}`;
}

function initQuizLiveSocket(io, sessionMiddleware, ROLES) {
  quizNamespace = io.of("/quiz-live");
  const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);
  quizNamespace.use(wrap(sessionMiddleware));

  quizNamespace.on("connection", (socket) => {
    // Host: must be an authenticated admin — the launch button only appears
    // on the admin-only live-quiz.html page, so this mirrors that guard.
    socket.on("join-host", ({ kind, sessionId }) => {
      const role = socket.request.session?.user?.role;
      if ((ROLES[role] || 0) < ROLES.admin) return;
      if (kind !== "individual" && kind !== "team") return;
      socket.join(roomName(kind, sessionId));
    });

    // Player/team: no login required — the access code itself is the credential,
    // same trust model as the existing public play/team-play routes. Tracking
    // which participant this socket belongs to lets the host lobby show who
    // has actually joined (see getJoinedParticipantIds) — presence, derived
    // straight from live socket-room membership, not a persisted flag.
    socket.on("join-player", async ({ kind, code }) => {
      try {
        const participant = kind === "team" ? await db.getTeamByCode(code) : await db.getQuizPlayerByCode(code);
        if (!participant) return;
        const sessionId = kind === "team" ? participant.team_session_id : participant.session_id;
        socket.data.kind = kind;
        socket.data.sessionId = sessionId;
        socket.data.participantId = participant.id;
        socket.join(roomName(kind, sessionId));
        broadcastLobbyUpdate(kind, sessionId);
      } catch (e) {
        logger.error("[QuizLive] join-player failed", { error: e.message });
      }
    });

    socket.on("disconnect", () => {
      if (socket.data.kind && socket.data.sessionId != null) {
        broadcastLobbyUpdate(socket.data.kind, socket.data.sessionId);
      }
    });
  });
}

function getJoinedParticipantIds(kind, sessionId) {
  if (!quizNamespace) return [];
  const room = quizNamespace.adapter.rooms.get(roomName(kind, sessionId));
  if (!room) return [];
  const ids = [];
  for (const socketId of room) {
    const sock = quizNamespace.sockets.get(socketId);
    if (sock && sock.data && sock.data.participantId != null) ids.push(sock.data.participantId);
  }
  return ids;
}

function broadcastLobbyUpdate(kind, sessionId) {
  broadcastQuizLive(kind, sessionId, "lobby-update", { joined: getJoinedParticipantIds(kind, sessionId) });
}

function broadcastQuizLive(kind, sessionId, event, payload) {
  if (!quizNamespace) return;
  quizNamespace.to(roomName(kind, sessionId)).emit(event, payload);
}

module.exports = { initQuizLiveSocket, broadcastQuizLive, getJoinedParticipantIds };
