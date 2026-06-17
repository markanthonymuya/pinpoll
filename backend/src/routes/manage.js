const router = require('express').Router();
const bcrypt = require('bcrypt');

async function verifyPassword(pool, code, password) {
  const { rows } = await pool.query(
    `SELECT id, status, password_hash FROM polls WHERE code = $1 AND visibility = 'public'`,
    [code]
  );
  if (rows.length === 0) return { error: 'not_found', status: 404 };
  const poll = rows[0];
  const ok = await bcrypt.compare(password || '', poll.password_hash);
  if (!ok) return { error: 'unauthorized', status: 401 };
  return { poll };
}

router.post('/:code/auth', async (req, res, next) => {
  try {
    const auth = await verifyPassword(req.app.locals.pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/:code/close', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const auth = await verifyPassword(pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { poll } = auth;
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll already closed or deleted' });
    }

    const { rows } = await pool.query(
      `UPDATE polls SET status = 'closed', closed_at = NOW()
       WHERE id = $1
       RETURNING id, code, status, closed_at`,
      [poll.id]
    );

    const wsServer = req.app.locals.wsServer;
    if (wsServer) wsServer.broadcast(req.params.code, { type: 'poll_closed' });

    res.json({ poll: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const auth = await verifyPassword(pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    await pool.query(
      `UPDATE polls SET visibility = 'deleted', status = 'deleted' WHERE id = $1`,
      [auth.poll.id]
    );

    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
