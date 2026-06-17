const router = require('express').Router();
const { generatePollPDF } = require('../services/pdfGen');

router.get('/:code/pdf', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, created_at, closed_at FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];

    if (poll.status === 'draft') return res.status(403).json({ error: 'poll has no results to export' });

    const { rows: optRows } = await pool.query(
      `SELECT o.name, COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id, o.name, o.display_order
       ORDER BY o.display_order`,
      [poll.id]
    );
    const totalVotes = optRows.reduce((sum, o) => sum + o.vote_count, 0);
    const options = optRows.map((o) => ({
      ...o,
      percentage: totalVotes > 0 ? (o.vote_count / totalVotes) * 100 : 0,
    }));

    const { rows: eventRows } = await pool.query(
      `SELECT v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp ASC`,
      [poll.id]
    );

    const pdfBuffer = await generatePollPDF({ poll, options, events: eventRows });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pinpoll-${poll.code}.pdf`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

module.exports = router;
