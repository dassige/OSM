// PostgreSQL adapter — wraps pg.Pool and exposes the same interface as the
// SQLite adapter (all, get, run, exec, prepare, transaction, close).
//
// Key translations applied at query time:
//   - SQLite `?` placeholders → PostgreSQL `$1, $2, …`
//   - SQLite `datetime('now')` → `CURRENT_TIMESTAMP`
//   - PRAGMA statements → silently skipped
//   - INSERT statements → `RETURNING id` appended automatically so
//     result.lastID is always populated (all tables use `id` as PK)

const { Pool } = require('pg');

// ── SQL normalisation helpers ─────────────────────────────────────────────

function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function normalizeSql(sql) {
  return sql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
}

function isPragma(stmt) {
  return /^\s*PRAGMA\b/i.test(stmt);
}

function isInsertStmt(sql) {
  return /^\s*INSERT\s/i.test(sql);
}

function addReturningId(sql) {
  return /\bRETURNING\b/i.test(sql) ? sql : sql + ' RETURNING id';
}

function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

// ── Per-connection adapter (used both for pool queries and tx clients) ─────

function createClientAdapter(queryFn) {
  return {
    async all(sql, ...args) {
      const params = normalizeParams(args);
      const result = await queryFn(convertPlaceholders(normalizeSql(sql)), params);
      return result.rows;
    },

    async get(sql, ...args) {
      const params = normalizeParams(args);
      const result = await queryFn(convertPlaceholders(normalizeSql(sql)), params);
      return result.rows[0];
    },

    async run(sql, ...args) {
      const params = normalizeParams(args);
      const normalized = convertPlaceholders(normalizeSql(sql));
      const finalSql = isInsertStmt(sql) ? addReturningId(normalized) : normalized;
      const result = await queryFn(finalSql, params);
      return {
        lastID: isInsertStmt(sql) ? (result.rows[0]?.id ?? null) : null,
        changes: result.rowCount,
      };
    },

    // Multi-statement exec: filter PRAGMAs, run each remaining statement.
    async exec(sql) {
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !isPragma(s));
      for (const stmt of statements) {
        await queryFn(normalizeSql(stmt), []);
      }
    },

    // Returns a fake prepared-statement object.  PostgreSQL has no persistent
    // client-side prepared statements via pool; each run() issues a query.
    async prepare(sql) {
      const isInsert = isInsertStmt(sql);
      const baseSql = convertPlaceholders(normalizeSql(sql));
      const finalSql = isInsert ? addReturningId(baseSql) : baseSql;

      return {
        async run(...args) {
          const params = normalizeParams(args);
          const result = await queryFn(finalSql, params);
          return {
            lastID: isInsert ? (result.rows[0]?.id ?? null) : null,
            changes: result.rowCount,
          };
        },
        async finalize() { /* no-op for PostgreSQL */ },
      };
    },
  };
}

// ── Pool-level adapter ────────────────────────────────────────────────────

function createPgAdapter(pool) {
  const poolQueryFn = (sql, params) => pool.query(sql, params);
  const adapter = createClientAdapter(poolQueryFn);

  // Acquires a dedicated client from the pool for the duration of the
  // transaction so BEGIN / COMMIT / ROLLBACK run on the same connection.
  adapter.transaction = async function transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientQueryFn = (sql, params) => client.query(sql, params);
      const txAdapter = createClientAdapter(clientQueryFn);
      // Expose transaction() on the tx-scoped adapter for nested callers.
      txAdapter.transaction = adapter.transaction;
      const result = await callback(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  };

  adapter.close = () => pool.end();

  return adapter;
}

// ── Pool factory ──────────────────────────────────────────────────────────

function createPool(dbConfig) {
  let sslConfig;
  if (dbConfig.ssl === 'verify') {
    sslConfig = true;                      // require + verify server cert
  } else if (dbConfig.ssl === 'true') {
    sslConfig = { rejectUnauthorized: false }; // require, skip cert check (Cloud SQL proxy)
  } else {
    sslConfig = false;
  }

  return new Pool({
    host:     dbConfig.host,
    port:     dbConfig.port,
    database: dbConfig.name,
    user:     dbConfig.user,
    password: dbConfig.password,
    ssl:      sslConfig,
    min:      dbConfig.poolMin,
    max:      dbConfig.poolMax,
  });
}

module.exports = { createPgAdapter, createPool };
