const http = require('http');
const WebSocket = require('ws');
const { createWsServer } = require('../src/ws/wsServer');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb } = require('./helpers');

let pool, server, wsServer, baseUrl;

beforeAll(async () => {
  pool = await createTestPool();
  wsServer = createWsServer();
  const app = createApp(pool, wsServer);
  server = http.createServer(app);
  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req);
    });
  });
  await new Promise((res) => server.listen(0, res));
  baseUrl = `ws://localhost:${server.address().port}`;
});

afterAll(async () => {
  await pool.end();
  // Terminate all open WS connections so server.close() can resolve
  for (const client of wsServer.clients) client.terminate();
  await new Promise((res) => server.close(res));
});

beforeEach(async () => { await cleanDb(pool); });

function connectClient(code) {
  return new Promise((resolve) => {
    const ws = new WebSocket(baseUrl);
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'join', code }));
      // Wait for server to process the join message before resolving
      setTimeout(() => resolve(ws), 100);
    });
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data))));
}

test('client receives broadcast after joining room', async () => {
  const client = await connectClient('test-AB12');
  const msgPromise = waitForMessage(client);
  wsServer.broadcast('test-AB12', { type: 'vote_cast', option_id: '123' });
  const msg = await msgPromise;
  expect(msg.type).toBe('vote_cast');
  client.close();
});

test('client in different room does not receive broadcast', async () => {
  const clientA = await connectClient('room-AAAA');
  const clientB = await connectClient('room-BBBB');

  let bReceived = false;
  clientB.on('message', () => { bReceived = true; });

  wsServer.broadcast('room-AAAA', { type: 'vote_cast', option_id: '123' });
  await new Promise((r) => setTimeout(r, 100));
  expect(bReceived).toBe(false);
  clientA.close();
  clientB.close();
});
