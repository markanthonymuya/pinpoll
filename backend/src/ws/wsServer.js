const { WebSocketServer } = require('ws');

function createWsServer() {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'ws://localhost');
    const code = url.searchParams.get('code');
    if (code) {
      if (!rooms.has(code)) rooms.set(code, new Set());
      rooms.get(code).add(ws);
      ws.on('close', () => {
        const room = rooms.get(code);
        if (room) {
          room.delete(ws);
          if (room.size === 0) rooms.delete(code);
        }
      });
    }
  });

  wss.broadcast = function(code, data) {
    const room = rooms.get(code);
    if (!room) return;
    const msg = JSON.stringify(data);
    for (const client of room) {
      if (client.readyState === 1) client.send(msg);
    }
  };

  return wss;
}

module.exports = { createWsServer };
