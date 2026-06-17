const router = require('express').Router();
const bcrypt = require('bcrypt');
const { generateSuggestions } = require('../services/codeGen');

router.get('/:code/code-suggestions', async (req, res, next) => {
  try {
    const suggestions = await generateSuggestions(req.app.locals.pool);
    res.json({ suggestions });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { topic, code, password, deduplication_mode, auto_close_at } = req.body;
    if (!topic || !topic.trim()) return res.status(400).json({ error: 'topic required' });
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    if (!['cookie', 'email_hash'].includes(deduplication_mode)) {
      return res.status(400).json({ error: 'invalid deduplication_mode' });
    }

    const pool = req.app.locals.pool;
    const existing = await pool.query('SELECT 1 FROM polls WHERE code = $1', [code]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'code already taken' });

    const password_hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    const { rows } = await pool.query(
      `INSERT INTO polls (code, topic, password_hash, deduplication_mode, auto_close_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, topic, status, deduplication_mode, created_at`,
      [code, topic.trim(), password_hash, deduplication_mode, auto_close_at || null]
    );

    res.status(201).json({ poll: rows[0] });
  } catch (err) { next(err); }
});

router.get('/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, deduplication_mode, created_at, closed_at, auto_close_at
       FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: options } = await pool.query(
      `SELECT o.id, o.name, o.image_url, o.icon_key, o.display_order, o.locked,
              COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id
       ORDER BY o.display_order ASC`,
      [poll.id]
    );

    res.json({ poll, options });
  } catch (err) { next(err); }
});

router.get('/:code/events', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });
    const { rows: events } = await pool.query(
      `SELECT v.id, v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp DESC
       LIMIT 500`,
      [pollRows[0].id]
    );
    res.json({ events });
  } catch (err) { next(err); }
});

module.exports = router;
