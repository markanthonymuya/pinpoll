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
    if (poll.status === 'closed') {
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
    } else {
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'email required for verified poll' });
      }
      session_token = sha256(email.trim().toLowerCase());
    }

    // Atomic transaction: verify status + draft→active + upsert vote
    const client = await pool.connect();
    let vote_event;
    let old_option_id = null;
    try {
      await client.query('BEGIN');

      // Re-read poll status with row lock
      const { rows: lockedRows } = await client.query(
        'SELECT status FROM polls WHERE id = $1 FOR UPDATE',
        [poll.id]
      );
      const currentStatus = lockedRows[0].status;
      if (currentStatus === 'closed' || currentStatus === 'deleted') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({ error: 'poll is closed' });
      }

      if (currentStatus === 'draft') {
        await client.query(`UPDATE polls SET status = 'active' WHERE id = $1`, [poll.id]);
        await client.query(`UPDATE options SET locked = TRUE WHERE poll_id = $1`, [poll.id]);
      }

      // Check if voter already has a vote (to detect change)
      const { rows: existingRows } = await client.query(
        'SELECT option_id FROM vote_events WHERE poll_id = $1 AND session_token = $2',
        [poll.id, session_token]
      );
      if (existingRows.length > 0) {
        old_option_id = existingRows[0].option_id;
      }

      // Upsert: insert or update existing vote
      const { rows: voteRows } = await client.query(
        `INSERT INTO vote_events (poll_id, option_id, source, session_token)
         VALUES ($1, $2, 'self_vote', $3)
         ON CONFLICT (poll_id, session_token) DO UPDATE SET option_id = EXCLUDED.option_id
         RETURNING id, option_id, source, timestamp`,
        [poll.id, option_id, session_token]
      );

      await client.query('COMMIT');
      vote_event = voteRows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      throw e;
    }
    client.release();

    // Set cookie after successful DB write (cookie mode only)
    if (poll.deduplication_mode === 'cookie') {
      res.cookie('pinpoll_session', cookieToken, {
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
      });
    }

    // Broadcast WS event
    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      if (old_option_id && old_option_id !== option_id) {
        wsServer.broadcast(code, { type: 'vote_changed', old_option_id, new_option_id: option_id });
      } else if (!old_option_id) {
        wsServer.broadcast(code, { type: 'vote_cast', option_id, vote_event });
      }
      // Same option voted again: no broadcast needed
    }

    const changed = old_option_id !== null && old_option_id !== option_id;
    res.status(changed ? 200 : 201).json({ vote_event, changed });
  } catch (err) { next(err); }
});

module.exports = router;
