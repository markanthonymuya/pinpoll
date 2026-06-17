const router = require('express').Router();
const { generatePollPDF } = require('../services/pdfGen');

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.use(requireAdmin);

router.get('/dashboard', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;

    const { rows: activeRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM polls WHERE status = 'active'`
    );
    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM vote_events WHERE timestamp >= CURRENT_DATE`
    );
    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM vote_events`
    );
    const { rows: topRows } = await pool.query(
      `SELECT p.code, p.topic, COUNT(v.id)::int AS vote_count
       FROM polls p
       LEFT JOIN vote_events v ON v.poll_id = p.id
       GROUP BY p.id
       ORDER BY vote_count DESC
       LIMIT 1`
    );

    res.json({
      active_count: activeRows[0].count,
      today_votes: todayRows[0].count,
      total_votes: totalRows[0].count,
      top_poll: topRows[0] || null,
    });
  } catch (err) { next(err); }
});

router.get('/polls', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows } = await pool.query(
      `SELECT p.id, p.code, p.topic, p.status, p.deduplication_mode, p.created_at, p.closed_at,
              COUNT(v.id)::int AS vote_count
       FROM polls p
       LEFT JOIN vote_events v ON v.poll_id = p.id
       WHERE p.visibility != 'deleted'
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT 200`
    );
    res.json({ polls: rows });
  } catch (err) { next(err); }
});

router.get('/polls/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, deduplication_mode, created_at, closed_at FROM polls WHERE code = $1`,
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
       ORDER BY o.display_order`,
      [poll.id]
    );
    const { rows: events } = await pool.query(
      `SELECT v.id, v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp ASC`,
      [poll.id]
    );

    res.json({ poll, options, events });
  } catch (err) { next(err); }
});

router.get('/polls/:code/pdf', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, created_at, closed_at FROM polls WHERE code = $1`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: optRows } = await pool.query(
      `SELECT o.name, COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id, o.name, o.display_order
       ORDER BY o.display_order`,
      [poll.id]
    );
    const total = optRows.reduce((s, o) => s + o.vote_count, 0);
    const options = optRows.map((o) => ({
      ...o,
      percentage: total > 0 ? (o.vote_count / total) * 100 : 0,
    }));

    const { rows: events } = await pool.query(
      `SELECT v.source, o.name AS option_name, v.timestamp
       FROM vote_events v JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1 ORDER BY v.timestamp`,
      [poll.id]
    );

    const pdfBuffer = await generatePollPDF({ poll, options, events });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pinpoll-admin-${poll.code}.pdf`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.delete('/polls/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { confirm_code } = req.body;

    if (confirm_code !== req.params.code) {
      return res.status(400).json({ error: 'confirm_code does not match poll code' });
    }

    const { rows: pollRows } = await pool.query(
      `SELECT id, topic FROM polls WHERE code = $1`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM vote_events WHERE poll_id = $1`,
      [poll.id]
    );

    const pdfDownloaded = req.body.pdf_downloaded === true;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO admin_deletion_log (poll_code, poll_topic, total_votes, pdf_downloaded)
         VALUES ($1, $2, $3, $4)`,
        [req.params.code, poll.topic, countRows[0].total, pdfDownloaded]
      );
      // Hard delete — CASCADE removes options and vote_events automatically
      await client.query(`DELETE FROM polls WHERE id = $1`, [poll.id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      throw e;
    }
    client.release();

    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
