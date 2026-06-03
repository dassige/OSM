// Thin wrapper around the `sqlite` package that exposes the shared adapter
// interface used by the rest of the application (all, get, run, exec,
// prepare, transaction, close).  SQLite is the default DB_TYPE.

function createSqliteAdapter(sqliteDb) {
  const adapter = {
    async all(sql, ...args) {
      return sqliteDb.all(sql, ...args);
    },

    async get(sql, ...args) {
      return sqliteDb.get(sql, ...args);
    },

    async run(sql, ...args) {
      const result = await sqliteDb.run(sql, ...args);
      return { lastID: result.lastID, changes: result.changes };
    },

    async exec(sql) {
      return sqliteDb.exec(sql);
    },

    async prepare(sql) {
      const stmt = await sqliteDb.prepare(sql);
      return {
        async run(...args) {
          const result = await stmt.run(...args);
          return { lastID: result.lastID, changes: result.changes };
        },
        async finalize() {
          return stmt.finalize();
        },
      };
    },

    // Wraps BEGIN / COMMIT / ROLLBACK so callers don't manage them manually.
    // For SQLite, the same adapter is passed to the callback because SQLite
    // serialises all writes through a single connection.
    async transaction(callback) {
      await sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const result = await callback(adapter);
        await sqliteDb.exec('COMMIT');
        return result;
      } catch (e) {
        try { await sqliteDb.exec('ROLLBACK'); } catch (_) {}
        throw e;
      }
    },

    async close() {
      return sqliteDb.close();
    },
  };

  return adapter;
}

module.exports = { createSqliteAdapter };
