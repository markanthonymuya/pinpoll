require('dotenv').config();
const express = require('express');
const cors = require('cors');

function createApp(pool, wsServer) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
  app.use(express.json());

  app.locals.pool = pool;
  app.locals.wsServer = wsServer;

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
