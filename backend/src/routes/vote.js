const router = require('express').Router();
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

router.post('/:code/vote', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { code } = req.params;
    const { option_id, email } = req.body;

    if (!option_id) return res.status(400).json({ error: 'option_id required' });

    const { rows: pollRows } = await pool.query(
      `SELECT id, status, deduplication_mode FROM polls WHERE code = $1 AND visibility = 'public'`,
      [code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll is closed' });
    }

    // Verify option belongs to this poll
    const { rows: optRows } = await pool.query(
      'SELECT id FROM options WHERE id = $1 AND poll_id = $2',
      [option_id, poll.id]
    );
    if (optRows.length === 0) return res.status(400).json({ error: 'invalid option_id' });

    let session_token;
    let cookieToken;

    if (poll.deduplication_mode === 'cookie') {
      cookieToken = req.cookies?.pinpoll_session;
      if (!cookieToken) {
        cookieToken = crypto.randomUUID();
      }
      session_token = sha256(cookieToken);

      // Check duplicate before transaction
      const { rows: dupRows } = await pool.query(
        'SELECT 1 FROM vote_events WHERE poll_id = $1 AND session_token = $2',
        [poll.id, session_token]
      );
      if (dupRows.length > 0) return res.status(409).json({ error: 'already voted' });
    } else {
      // email_hash mode
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'email required for verified poll' });
      }
      session_token = sha256(email.trim().toLowerCase());

      const { rows: dupRows } = await pool.query(
        'SELECT 1 FROM vote_events WHERE poll_id = $1 AND session_token = $2',
        [poll.id, session_token]
      );
      if (dupRows.length > 0) return res.status(409).json({ error: 'already voted' });
    }

    // Atomic transaction: draft→active + lock options + insert vote
    const client = await pool.connect();
    let vote_event;
    try {
      await client.query('BEGIN');

      if (poll.status === 'draft') {
        await client.query(
          `UPDATE polls SET status = 'active' WHERE id = $1`,
          [poll.id]
        );
        await client.query(
          `UPDATE options SET locked = TRUE WHERE poll_id = $1`,
          [poll.id]
        );
      }

      const { rows: voteRows } = await client.query(
        `INSERT INTO vote_events (poll_id, option_id, source, session_token)
         VALUES ($1, $2, 'self_vote', $3)
         RETURNING id, option_id, source, timestamp`,
        [poll.id, option_id, session_token]
      );

      await client.query('COMMIT');
      vote_event = voteRows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Set cookie after successful DB write (cookie mode only)
    if (poll.deduplication_mode === 'cookie') {
      res.cookie('pinpoll_session', cookieToken, {
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }

    // Broadcast only after successful DB write
    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(code, { type: 'vote_cast', option_id, vote_event });
    }

    res.status(201).json({ vote_event });
  } catch (err) { next(err); }
});

module.exports = router;
