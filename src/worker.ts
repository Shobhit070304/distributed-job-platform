import dotenv from 'dotenv';
dotenv.config();

import { claimNextPendingJob, markJobCompleted, markJobFailed } from './services/jobs.service';
import { getHandler } from './workers/handlers';

const POLL_INTERVAL_MS = 2000;

async function pollAndProcess() {
    const job = await claimNextPendingJob();
    if (!job) {
        console.log('No pending jobs');
        return;
    }
    console.log(`Claimed job ${job.id} (type: ${job.type})`);

    const handler = getHandler(job.type);

    if (!handler) {
        console.error(`No handler found for job type ${job.type}`);
        await markJobFailed(job.id);
        return;
    }

    try {
        await handler(job);
        await markJobCompleted(job.id);
    } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        await markJobFailed(job.id);
    }
}

console.log(`Worker starting ${POLL_INTERVAL_MS}ms poll interval...`);

setInterval(pollAndProcess, POLL_INTERVAL_MS);

process.on('SIGINT', async () => {
    console.log('Worker shutting down...');
    process.exit(0);
});