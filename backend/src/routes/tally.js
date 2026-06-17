const router = require('express').Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

router.post('/:code/tally', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { code } = req.params;
    const { option_id, password } = req.body;

    if (!option_id) return res.status(400).json({ error: 'option_id required' });

    const { rows: pollRows } = await pool.query(
      `SELECT id, status, password_hash FROM polls WHERE code = $1 AND visibility = 'public'`,
      [code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const ok = await bcrypt.compare(password || '', poll.password_hash);
    if (!ok) return res.status(401).json({ error: 'unauthorized' });

    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll is closed' });
    }

    const { rows: optRows } = await pool.query(
      'SELECT id FROM options WHERE id = $1 AND poll_id = $2',
      [option_id, poll.id]
    );
    if (optRows.length === 0) return res.status(400).json({ error: 'invalid option_id' });

    // Initiator tap: unique session_token per tap (no dedup)
    const session_token = `tally:${crypto.randomUUID()}`;

    const { rows } = await pool.query(
      `INSERT INTO vote_events (poll_id, option_id, source, session_token)
       VALUES ($1, $2, 'initiator_tap', $3)
       RETURNING id, option_id, source, timestamp`,
      [poll.id, option_id, session_token]
    );

    const vote_event = rows[0];

    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(code, { type: 'tally_tap', option_id, vote_event });
    }

    res.status(201).json({ vote_event });
  } catch (err) { next(err); }
});

module.exports = router;
