const http = require('http');
const config = require('./config/env');
const app = require('./app');
const { connectDB } = require('./config/db');
const { initSocket } = require('./sockets');
const { registerListeners } = require('./events/listeners');

async function start() {
  await connectDB();
  const server = http.createServer(app);
  initSocket(server);
  registerListeners();
  server.listen(config.port, () => console.log(`[server] listening on http://localhost:${config.port}`));

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
