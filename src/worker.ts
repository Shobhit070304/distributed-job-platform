import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config/env';
validateEnv();


import { claimNextPendingJob, markJobCompleted, handleJobFailure, markJobFailedTerminal } from './services/jobs.service';
import { getHandler } from './workers/handlers';
import { pool } from './config/db';

const POLL_INTERVAL_MS = 2000;

let isShuttingDown = false;
let isProcessing = false;

async function pollAndProcess(): Promise<void> {
    if (isShuttingDown) return;

    const job = await claimNextPendingJob();
    if (!job) return;

    isProcessing = true;
    console.log(`[worker] Claimed job ${job.id} (type: ${job.type}, attempt ${job.attempts + 1}/${job.max_attempts})`);

    const handler = getHandler(job.type);

    if (!handler) {
        console.error(`[worker] No handler for type "${job.type}"`);
        await markJobFailedTerminal(job.id, `No handler registered for type "${job.type}"`);
        isProcessing = false;
        return;
    }

    try {
        await handler(job);
        await markJobCompleted(job.id);
        console.log(`[worker] Job ${job.id} completed`);
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`[worker] Job ${job.id} failed: ${error.message}`);
        await handleJobFailure(job, error);
    } finally {
        isProcessing = false;
    }
}

const interval = setInterval(pollAndProcess, POLL_INTERVAL_MS);

async function shutdown(signal: string): Promise<void> {
    console.log(`[worker] ${signal} received — waiting for current job to finish`);
    isShuttingDown = true;
    clearInterval(interval);

    // Wait for in-progress job to complete
    while (isProcessing) {
        await new Promise((r) => setTimeout(r, 100));
    }

    await pool.end();
    console.log('[worker] Shut down cleanly');
    process.exit(0);
}

console.log(`[worker] Started — polling every ${POLL_INTERVAL_MS}ms`);

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));