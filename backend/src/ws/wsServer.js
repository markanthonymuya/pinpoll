const { WebSocketServer } = require('ws');

function createWsServer() {
  // noServer: true so we handle upgrades manually in server.js
  return new WebSocketServer({ noServer: true });
}

module.exports = { createWsServer };
