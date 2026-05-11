const { initDB } = require("./connection");
const logger = require("../logger");

async function logEvent(user, type, title, payload) {
  const db = await initDB();
  try {
    await db.run(
      "INSERT INTO event_log (user, event_type, title, payload, timestamp) VALUES (?, ?, ?, ?, ?)",
      user || "System",
      type,
      title,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
  } catch (e) {
    logger.error("Failed to write to event log", { error: e.message });
  }
}

async function getEventLogs(filters = {}) {
  const db = await initDB();
  let baseQuery = "FROM event_log WHERE 1=1";
  const params = [];

  if (filters.user) {
    baseQuery += " AND user = ?";
    params.push(filters.user);
  }
  if (filters.types && filters.types.length > 0) {
    const typesArray = Array.isArray(filters.types) ? filters.types : filters.types.split(",");
    if (typesArray.length > 0 && typesArray[0] !== "") {
      const placeholders = typesArray.map(() => "?").join(",");
      baseQuery += ` AND event_type IN (${placeholders})`;
      params.push(...typesArray);
    }
  }
  if (filters.startDate) { baseQuery += " AND timestamp >= ?"; params.push(filters.startDate); }
  if (filters.endDate) { baseQuery += " AND timestamp <= ?"; params.push(filters.endDate + " 23:59:59"); }

  const countResult = await db.get(`SELECT COUNT(*) as total ${baseQuery}`, params);
  const total = countResult.total;

  const page = filters.page && filters.page > 0 ? parseInt(filters.page) : 1;
  const limit = filters.limit && filters.limit > 0 ? parseInt(filters.limit) : 50;
  const offset = (page - 1) * limit;

  const rows = await db.all(`SELECT * ${baseQuery} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const logs = rows.map((r) => {
    try { return { ...r, payload: JSON.parse(r.payload) }; }
    catch (e) { return { ...r, payload: {} }; }
  });
  return { logs, total, page, limit };
}

async function getEventLogMetadata() {
  const db = await initDB();
  const users = await db.all("SELECT DISTINCT user FROM event_log ORDER BY user ASC");
  const types = await db.all("SELECT DISTINCT event_type FROM event_log ORDER BY event_type ASC");
  return { users: users.map((u) => u.user), types: types.map((t) => t.event_type) };
}

async function getEventLogsExport(filters = {}) {
  const db = await initDB();
  let baseQuery = "SELECT * FROM event_log WHERE 1=1";
  const params = [];

  if (filters.user) { baseQuery += " AND user = ?"; params.push(filters.user); }
  if (filters.types && filters.types.length > 0) {
    const typesArray = Array.isArray(filters.types) ? filters.types : filters.types.split(",");
    if (typesArray.length > 0 && typesArray[0] !== "") {
      const placeholders = typesArray.map(() => "?").join(",");
      baseQuery += ` AND event_type IN (${placeholders})`;
      params.push(...typesArray);
    }
  }
  if (filters.startDate) { baseQuery += " AND timestamp >= ?"; params.push(filters.startDate); }
  if (filters.endDate) { baseQuery += " AND timestamp <= ?"; params.push(filters.endDate + " 23:59:59"); }
  baseQuery += " ORDER BY id DESC";

  const rows = await db.all(baseQuery, params);
  return rows.map((r) => {
    try { return { ...r, payload: JSON.parse(r.payload) }; }
    catch (e) { return { ...r, payload: {} }; }
  });
}

async function purgeEventLog() {
  const db = await initDB();
  await db.run("DELETE FROM event_log");
}

async function pruneEventLog(days) {
  const db = await initDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.run("DELETE FROM event_log WHERE timestamp < ?", cutoff.toISOString());
}

module.exports = { logEvent, getEventLogs, getEventLogMetadata, getEventLogsExport, purgeEventLog, pruneEventLog };
