const cron = require('node-cron');

async function closeOverduePolls(pool, wsServer) {
  const { rows } = await pool.query(
    `UPDATE polls
     SET status = 'closed', closed_at = NOW()
     WHERE status = 'active' AND auto_close_at IS NOT NULL AND auto_close_at <= NOW()
     RETURNING code`
  );
  rows.forEach(({ code }) => {
    if (wsServer) wsServer.broadcast(code, { type: 'poll_closed' });
  });
}

function startScheduler(pool, wsServer) {
  cron.schedule('* * * * *', () => closeOverduePolls(pool, wsServer));
}

module.exports = { startScheduler, closeOverduePolls };
