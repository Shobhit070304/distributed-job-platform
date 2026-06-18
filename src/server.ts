import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config/env';
validateEnv();

import app from './app';
import { pool } from './config/db';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`[api] Server running on http://localhost:${PORT}`);
});

async function shutdown(signal: string): Promise<void> {
    console.log(`[api] ${signal} received — shutting down gracefully`);

    server.close(async () => {
        console.log('[api] HTTP server closed');
        await pool.end();
        console.log('[api] DB pool closed — exiting');
        process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
        console.error('[api] Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));