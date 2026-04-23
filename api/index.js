// Brickworks — Express app. Acts as:
//   1) A Vercel serverless function handler (exported as module.exports)
//   2) A plain Express server for local development (`npm run dev`)
//
// On Vercel, all routes matching /api/* are rewritten to this file
// (see vercel.json). Static files under /public are served by Vercel's
// built-in static hosting.

const path = require('path');
const express = require('express');
const { q } = require('../lib/db');

const app = express();
app.use(express.json({ limit: '20mb' })); // thumbnails can be chunky

// ---------- helpers ----------

function sanitizeCreation(body) {
  const name = (body.name || 'Untitled').toString().slice(0, 120).trim() || 'Untitled';
  const description = (body.description || '').toString().slice(0, 2000);
  const author = (body.author || 'anonymous').toString().slice(0, 60).trim() || 'anonymous';
  const bricks = Array.isArray(body.bricks) ? body.bricks : [];
  const data = JSON.stringify({ bricks });
  const thumbnail = typeof body.thumbnail === 'string' ? body.thumbnail.slice(0, 2_000_000) : null;
  const brick_count = bricks.length;
  const parent_id = Number.isInteger(body.parent_id) ? body.parent_id : null;
  return { name, description, author, data, thumbnail, brick_count, parent_id };
}

function formatCreation(row) {
  if (!row) return null;
  let bricks = [];
  if (row.data) {
    try { bricks = JSON.parse(row.data).bricks || []; } catch {}
  }
  const { data, ...meta } = row;
  return { ...meta, bricks };
}

// Wraps async handlers so thrown errors land in the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- API routes ----------

// List creations: ?sort=popular|newest&limit=..&offset=..
app.get('/api/creations', wrap(async (req, res) => {
  const sort = req.query.sort === 'newest' ? 'newest' : 'popular';
  const limit = Math.min(parseInt(req.query.limit, 10) || 24, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const [items, total] = await Promise.all([
    q.browse({ sort, limit, offset }),
    q.countAll(),
  ]);
  res.json({ items, total, sort, limit, offset });
}));

// Featured (top of homepage)
app.get('/api/creations/featured', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 6, 24);
  res.json({ items: await q.featured(limit) });
}));

// Recent (bottom of homepage)
app.get('/api/creations/recent', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 24);
  res.json({ items: await q.recent(limit) });
}));

// Search: ?q=..&limit=..&offset=..
app.get('/api/creations/search', wrap(async (req, res) => {
  const raw = (req.query.q || '').toString().trim();
  if (!raw) return res.json({ items: [], q: '' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const items = await q.search({ q: raw, limit, offset });
  res.json({ items, q: raw, limit, offset });
}));

// My creations: ?author=..
app.get('/api/creations/mine', wrap(async (req, res) => {
  const author = (req.query.author || '').toString().trim();
  if (!author) return res.json({ items: [] });
  res.json({ items: await q.listByAuthor(author) });
}));

// Get single (optionally bump view count)
app.get('/api/creations/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const row = await q.getById(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (req.query.track === '1') await q.incrementViews(id);
  res.json(formatCreation(row));
}));

// Create
app.post('/api/creations', wrap(async (req, res) => {
  const c = sanitizeCreation(req.body);
  if (c.brick_count === 0) {
    return res.status(400).json({ error: 'creation is empty — place at least one brick' });
  }
  const row = await q.insert(c);
  res.status(201).json(formatCreation(row));
}));

// Update (only if author matches)
app.put('/api/creations/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  const existing = await q.getById(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const c = sanitizeCreation(req.body);
  if (c.author !== existing.author) {
    return res.status(403).json({ error: 'only the original author can edit — try Clone instead' });
  }
  if (c.brick_count === 0) {
    return res.status(400).json({ error: 'creation is empty' });
  }

  await q.update({ id, ...c });
  const row = await q.getById(id);
  res.json(formatCreation(row));
}));

// Delete (only if author matches)
app.delete('/api/creations/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const author = (req.query.author || '').toString().trim();
  if (!Number.isInteger(id) || !author) return res.status(400).json({ error: 'bad request' });
  const changed = await q.delete(id, author);
  if (changed === 0) return res.status(403).json({ error: 'not found or not yours' });
  res.json({ ok: true });
}));

// Like / unlike
app.post('/api/creations/:id/like', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  if (req.body && req.body.unlike) await q.decrementLikes(id);
  else await q.incrementLikes(id);
  const row = await q.getById(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ likes: row.likes });
}));

// ---------- error fallback ----------

app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: err && err.message ? err.message : 'internal error' });
});

// ---------- local dev only: serve static files + pretty URLs ----------
//
// On Vercel these are handled by cleanUrls + rewrites in vercel.json and the
// built-in static hosting, so we only set them up when running via
// `node api/index.js` on a developer's machine.
if (require.main === module) {
  // Lazy-load dotenv so it's not a prod dependency.
  try { require('dotenv').config(); } catch {}

  const PUBLIC_DIR = path.join(__dirname, '..', 'public');
  app.use(express.static(PUBLIC_DIR));
  app.get(['/', '/home'],    (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/browse',         (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'browse.html')));
  app.get('/builder',        (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'builder.html')));
  app.get('/creation',       (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'creation.html')));
  app.get('/my-creations',   (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'my-creations.html')));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Brickworks running at http://localhost:${PORT}`);
    if (!process.env.TURSO_DATABASE_URL) {
      console.warn('⚠ TURSO_DATABASE_URL is not set — API requests will fail until you configure .env');
    }
  });
}

module.exports = app;
