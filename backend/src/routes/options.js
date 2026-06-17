const router = require('express').Router();
const bcrypt = require('bcrypt');

async function verifyInitiator(pool, code, password) {
  const { rows } = await pool.query(
    'SELECT id, status, password_hash FROM polls WHERE code = $1 AND visibility = $2',
    [code, 'public']
  );
  if (rows.length === 0) return { error: 'not_found', status: 404 };
  const poll = rows[0];
  const ok = await bcrypt.compare(password || '', poll.password_hash);
  if (!ok) return { error: 'unauthorized', status: 401 };
  return { poll };
}

router.post('/:code/options', async (req, res, next) => {
  try {
    const { name, password, image_url, icon_key } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    const pool = req.app.locals.pool;
    const auth = await verifyInitiator(pool, req.params.code, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { poll } = auth;
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'cannot add options to a closed poll' });
    }

    const { rows: orderRows } = await pool.query(
      'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM options WHERE poll_id = $1',
      [poll.id]
    );
    const display_order = orderRows[0].next_order;

    const { rows } = await pool.query(
      `INSERT INTO options (poll_id, name, image_url, icon_key, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, image_url, icon_key, display_order, locked`,
      [poll.id, name.trim(), image_url || null, icon_key || null, display_order]
    );

    const option = rows[0];
    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(req.params.code, {
        type: 'option_added',
        option: { ...option, vote_count: 0 },
      });
    }

    res.status(201).json({ option });
  } catch (err) { next(err); }
});

module.exports = router;
