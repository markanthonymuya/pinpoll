const WebSocket = require('ws');

function createWsServer() {
  const wss = new WebSocket.Server({ noServer: true });
  const rooms = new Map(); // code → Set<WebSocket>

  wss.on('connection', (ws) => {
    let joinedCode = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'join' && msg.code) {
          joinedCode = msg.code;
          if (!rooms.has(joinedCode)) rooms.set(joinedCode, new Set());
          rooms.get(joinedCode).add(ws);
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      if (joinedCode && rooms.has(joinedCode)) {
        rooms.get(joinedCode).delete(ws);
        if (rooms.get(joinedCode).size === 0) rooms.delete(joinedCode);
      }
    });
  });

  wss.broadcast = (code, payload) => {
    const clients = rooms.get(code);
    if (!clients) return;
    const data = JSON.stringify(payload);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  };

  return wss;
}

module.exports = { createWsServer };
