import dotenv from 'dotenv';
dotenv.config();

import { claimNextPendingJob, markJobCompleted, handleJobFailure, markJobFailedTerminal } from './services/jobs.service';
import { getHandler } from './workers/handlers';

const POLL_INTERVAL_MS = 2000;

async function pollAndProcess() {
    const job = await claimNextPendingJob();
    if (!job) {
        console.log('No pending jobs');
        return;
    }
    console.log(`Claimed job ${job.id} (type: ${job.type}, attempt ${job.attempts + 1}/${job.max_attempts})`);

    const handler = getHandler(job.type);

    if (!handler) {
        console.error(`No handler registered for job type "${job.type}"`);
        await markJobFailedTerminal(job.id, `No handler registered for type "${job.type}"`);
        return;
    }

    try {
        await handler(job);
        await markJobCompleted(job.id);
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`Job ${job.id} threw an error:`, error.message);
        await handleJobFailure(job, error);
    }
}

console.log(`Worker starting ${POLL_INTERVAL_MS}ms poll interval...`);

setInterval(pollAndProcess, POLL_INTERVAL_MS);

process.on('SIGINT', async () => {
    console.log('Worker shutting down...');
    process.exit(0);
});