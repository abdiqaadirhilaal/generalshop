import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { bootstrap } from './bootstrap.js';

async function main() {
  await connectDatabase();
  await bootstrap();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`✓ HILAAL API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
    if (mongoose.connection.readyState === 1) {
      // Keep the process alive for transient errors; log for investigation.
      return;
    }
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('✖ Failed to start HILAAL API', error);
  process.exit(1);
});
