require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');
const { createApp } = require('./app');
const { createWsServer } = require('./ws/wsServer');
const { runMigrations } = require('./db/migrate');

const scheduler = (() => { try { return require('./services/scheduler'); } catch { return null; } })();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await runMigrations(pool);

  const wsServer = createWsServer();
  const app = createApp(pool, wsServer);
  const server = http.createServer(app);

  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req);
    });
  });

  scheduler?.startScheduler?.(pool, wsServer);

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`PinPoll backend on port ${port}`));
}

main().catch((err) => { console.error(err); process.exit(1); });
