import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectDatabase } from './config/database.js';

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down gracefully...`);

  // Force-exit if connections do not drain in time.
  const forceExit = setTimeout(() => {
    console.error('[server] forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (err) => {
    try {
      await disconnectDatabase();
    } finally {
      clearTimeout(forceExit);
      process.exit(err ? 1 : 0);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception:', error);
  void shutdown('uncaughtException');
});
