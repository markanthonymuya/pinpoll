require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

function createApp(pool, wsServer) {
  const app = express();

  const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.locals.pool = pool;
  app.locals.wsServer = wsServer;

  // Homepage featured poll — resolved from HOMEPAGE_POLL_CODE env var
  app.get('/api/homepage-poll', async (req, res) => {
    const code = process.env.HOMEPAGE_POLL_CODE;
    if (!code) return res.status(404).json({ error: 'not configured' });
    try {
      const { rows: pollRows } = await req.app.locals.pool.query(
        `SELECT id, code, topic, status, deduplication_mode, created_at, closed_at
         FROM polls WHERE code = $1 AND visibility = 'public'`,
        [code]
      );
      if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });
      const poll = pollRows[0];
      const { rows: options } = await req.app.locals.pool.query(
        `SELECT o.id, o.name, o.display_order, o.locked, COUNT(v.id)::int AS vote_count
         FROM options o LEFT JOIN vote_events v ON v.option_id = o.id
         WHERE o.poll_id = $1 GROUP BY o.id ORDER BY o.display_order ASC`,
        [poll.id]
      );
      res.json({ poll, options });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/polls', require('./routes/polls'));
  app.use('/api/polls', require('./routes/options'));
  app.use('/api/polls', require('./routes/vote'));
  app.use('/api/polls', require('./routes/tally'));
  app.use('/api/polls', require('./routes/manage'));
  app.use('/api/polls', require('./routes/pdf'));
  app.use('/api/unsplash', require('./routes/unsplash'));

  const adminPath = process.env.ADMIN_PATH;
  if (adminPath) {
    app.use(`/${adminPath}`, require('./routes/admin'));
  }

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
