// Turso / libSQL database layer for Brickworks.
//
// Replaces the old better-sqlite3 setup. Same schema, same semantics — just
// async (because the client is over HTTP) and serverless-friendly.
//
// Environment variables (see .env.example):
//   TURSO_DATABASE_URL   — libsql://... connection string
//   TURSO_AUTH_TOKEN     — database auth token
//
// On Vercel, set these in your project's Environment Variables page.

const { createClient } = require('@libsql/client');

let _client = null;
let _schemaPromise = null;

function client() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. Copy .env.example to .env and fill in your Turso credentials, or set them in your Vercel project.'
    );
  }
  _client = createClient({ url, authToken });
  return _client;
}

async function ensureSchema() {
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    const c = client();
    // One statement per batch call — libSQL executes these individually.
    await c.batch(
      [
        `CREATE TABLE IF NOT EXISTS creations (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT    DEFAULT '',
          author      TEXT    NOT NULL DEFAULT 'anonymous',
          data        TEXT    NOT NULL,
          thumbnail   TEXT,
          parent_id   INTEGER,
          likes       INTEGER NOT NULL DEFAULT 0,
          views       INTEGER NOT NULL DEFAULT 0,
          brick_count INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (parent_id) REFERENCES creations(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_creations_name    ON creations(name)`,
        `CREATE INDEX IF NOT EXISTS idx_creations_likes   ON creations(likes)`,
        `CREATE INDEX IF NOT EXISTS idx_creations_views   ON creations(views)`,
        `CREATE INDEX IF NOT EXISTS idx_creations_created ON creations(created_at)`,
      ],
      'write'
    );
  })().catch((err) => {
    // If the schema promise fails, don't cache the failure — let the next call retry.
    _schemaPromise = null;
    throw err;
  });
  return _schemaPromise;
}

// ---------- Helpers ----------

// libSQL returns rows as arrays + columns[]. Convert to plain objects.
function toObjects(rs) {
  const cols = rs.columns;
  return rs.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
    return obj;
  });
}

async function all(sql, args) {
  await ensureSchema();
  const rs = await client().execute({ sql, args });
  return toObjects(rs);
}

async function one(sql, args) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

async function run(sql, args) {
  await ensureSchema();
  return client().execute({ sql, args });
}

// ---------- Query API ----------
//
// Each method returns a promise. The shape of the results matches what the
// old better-sqlite3 prepared statements returned, so the route handlers
// need minimal changes beyond `await`.

const q = {
  async getById(id) {
    return one(`SELECT * FROM creations WHERE id = ?`, [id]);
  },

  async insert({ name, description, author, data, thumbnail, parent_id, brick_count }) {
    const r = await run(
      `INSERT INTO creations (name, description, author, data, thumbnail, parent_id, brick_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, description, author, data, thumbnail, parent_id, brick_count]
    );
    const id = Number(r.lastInsertRowid);
    return q.getById(id);
  },

  async update({ id, name, description, author, data, thumbnail, brick_count }) {
    // COALESCE keeps existing thumbnail when caller doesn't send a new one.
    const r = await run(
      `UPDATE creations
          SET name = ?, description = ?, data = ?,
              thumbnail = COALESCE(?, thumbnail),
              brick_count = ?,
              updated_at = datetime('now')
        WHERE id = ? AND author = ?`,
      [name, description, data, thumbnail, brick_count, id, author]
    );
    return Number(r.rowsAffected || 0);
  },

  async delete(id, author) {
    const r = await run(`DELETE FROM creations WHERE id = ? AND author = ?`, [id, author]);
    return Number(r.rowsAffected || 0);
  },

  async incrementViews(id) {
    await run(`UPDATE creations SET views = views + 1 WHERE id = ?`, [id]);
  },

  async incrementLikes(id) {
    await run(`UPDATE creations SET likes = likes + 1 WHERE id = ?`, [id]);
  },

  async decrementLikes(id) {
    await run(`UPDATE creations SET likes = MAX(likes - 1, 0) WHERE id = ?`, [id]);
  },

  async listByAuthor(author) {
    return all(
      `SELECT id, name, description, author, thumbnail, likes, views, brick_count,
              parent_id, created_at, updated_at
         FROM creations
        WHERE author = ?
        ORDER BY updated_at DESC`,
      [author]
    );
  },

  async featured(limit) {
    return all(
      `SELECT id, name, description, author, thumbnail, likes, views, brick_count,
              parent_id, created_at, updated_at
         FROM creations
        ORDER BY (likes * 3 + views) DESC, created_at DESC
        LIMIT ?`,
      [limit]
    );
  },

  async recent(limit) {
    return all(
      `SELECT id, name, description, author, thumbnail, likes, views, brick_count,
              parent_id, created_at, updated_at
         FROM creations
        ORDER BY created_at DESC
        LIMIT ?`,
      [limit]
    );
  },

  async search({ q: query, limit, offset }) {
    const like = `%${query}%`;
    return all(
      `SELECT id, name, description, author, thumbnail, likes, views, brick_count,
              parent_id, created_at, updated_at
         FROM creations
        WHERE name LIKE ? OR description LIKE ? OR author LIKE ?
        ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
                 likes DESC, views DESC
        LIMIT ? OFFSET ?`,
      [like, like, like, query, limit, offset]
    );
  },

  async browse({ sort, limit, offset }) {
    const orderBy =
      sort === 'newest'
        ? `created_at DESC`
        : `(likes * 3 + views) DESC, created_at DESC`;
    return all(
      `SELECT id, name, description, author, thumbnail, likes, views, brick_count,
              parent_id, created_at, updated_at
         FROM creations
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  },

  async countAll() {
    const row = await one(`SELECT COUNT(*) AS n FROM creations`);
    return row ? Number(row.n) : 0;
  },

  async clearAll() {
    await run(`DELETE FROM creations`);
    // Reset auto-increment so demo IDs stay predictable after re-seeding.
    await run(`DELETE FROM sqlite_sequence WHERE name = 'creations'`).catch(() => {});
  },

  async setStats(id, likes, views) {
    await run(`UPDATE creations SET likes = ?, views = ? WHERE id = ?`, [likes, views, id]);
  },
};

module.exports = { client, ensureSchema, q };
