import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config/env';
validateEnv();

import { claimNextPendingJob, markJobCompleted, handleJobFailure, markJobFailedTerminal, cleanOrphanedJobs } from './services/jobs.service';
import { getHandler } from './workers/handlers';
import { pool } from './config/db';

// ── Concurrency Config ───────────────────────────────────────────────────────
// How many jobs can run in parallel inside this single worker process.
// Increase this number to get more throughput on I/O-bound workloads.
// Do NOT set higher than your DB pool size (currently 10).
const CONCURRENCY_LIMIT = parseInt(process.env.WORKER_CONCURRENCY ?? '5');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '2000');
const REAPER_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// ── State ────────────────────────────────────────────────────────────────────
// A Set of active job IDs for currently running jobs.
const activeJobs = new Set<string>();
let pendingClaimsCount = 0;
let isShuttingDown = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let reaperTimer: ReturnType<typeof setTimeout> | null = null;

// ── Core: Claim and launch a single job ─────────────────────────────────────
async function processJob(): Promise<void> {
    if (isShuttingDown) return;

    if (activeJobs.size + pendingClaimsCount >= CONCURRENCY_LIMIT) return;

    // Reserve a concurrency slot BEFORE awaiting the DB query.
    pendingClaimsCount++;
    let job;
    try {
        job = await claimNextPendingJob();
    } catch (err) {
        // DB errors during claim are handled by the outer scheduler catch.
        // Re-throw so the scheduler can log and recover.
        throw err;
    } finally {
        // Always release the reserved slot regardless of success or failure.
        pendingClaimsCount--;
    }

    if (!job) return; // Queue is empty right now.

    // Register the job as active immediately after claiming it.
    activeJobs.add(job.id);
    console.log(
        `[worker] Claimed job ${job.id} (type: ${job.type}, attempt ${job.attempts + 1}/${job.max_attempts}) | active: ${activeJobs.size}/${CONCURRENCY_LIMIT}`
    );

    const handler = getHandler(job.type);

    // Run the job asynchronously — do NOT await here.
    // This is what enables concurrency: we return immediately so the poll
    // loop can claim more jobs while this one is still running.
    (async () => {
        try {
            if (!handler) {
                console.error(`[worker] No handler for type "${job.type}"`);
                await markJobFailedTerminal(job.id, `No handler registered for type "${job.type}"`);
                return;
            }

            await handler(job);
            await markJobCompleted(job.id);
            console.log(`[worker] Job ${job.id} completed | active: ${activeJobs.size - 1}/${CONCURRENCY_LIMIT}`);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[worker] Job ${job.id} failed: ${error.message}`);
            await handleJobFailure(job, error);
        } finally {
            // De-register the job from the active set.
            activeJobs.delete(job.id);

            // ── Fast Pickup ─────────────────────────────────────────────────
            // A slot just freed up. Instead of waiting for the next poll
            // interval tick (up to 2s), immediately try to grab another job.
            if (!isShuttingDown) {
                scheduleNextPoll(0);
            }
        }
    })();

    // After starting one job, immediately try to fill more concurrent slots.
    // If the queue has 5 pending jobs and CONCURRENCY_LIMIT is 5,
    // we kick off all 5 in a single poll cycle rather than one per 2 seconds.
    if (activeJobs.size + pendingClaimsCount < CONCURRENCY_LIMIT) {
        scheduleNextPoll(0);
    }
}

// ── Polling Scheduler ────────────────────────────────────────────────────────
// Uses setTimeout (not setInterval) so poll calls never pile up on each other.
// Each poll schedules the next one only after it has run.
function scheduleNextPoll(delayMs: number = POLL_INTERVAL_MS): void {
    if (isShuttingDown) return;

    // If a regular-interval poll is already scheduled and this is another
    // regular-interval call, skip — avoid double-scheduling.
    if (pollTimer !== null && delayMs > 0) return;

    // If this is an immediate (0ms) call, cancel any pending timer first.
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
    }

    pollTimer = setTimeout(async () => {
        pollTimer = null;
        try {
            await processJob();
        } catch (err) {
            console.error('[worker] Unhandled error in poll cycle — will retry on next interval:', err);
        }
        // Schedule the next regular idle poll after this one finishes.
        scheduleNextPoll(POLL_INTERVAL_MS);
    }, delayMs);
}
async function runReaper(): Promise<void> {
    if (isShuttingDown) return;
    try {
        await cleanOrphanedJobs();
    } catch (err) {
        console.error('[reaper] Error during orphan cleanup:', err);
    }
    if (!isShuttingDown) {
        reaperTimer = setTimeout(runReaper, REAPER_INTERVAL_MS);
    }
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
    console.log(`[worker] ${signal} received — waiting for ${activeJobs.size} active job(s) to finish`);
    isShuttingDown = true;

    // Cancel any pending poll timer so no new jobs are claimed.
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }

    // Cancel the reaper timer.
    if (reaperTimer !== null) {
        clearTimeout(reaperTimer);
        reaperTimer = null;
    }

    // Wait until every active job has called activeJobs.delete() in its finally block.
    while (activeJobs.size > 0) {
        console.log(`[worker] Draining... ${activeJobs.size} job(s) still running`);
        await new Promise((r) => setTimeout(r, 200));
    }

    await pool.end();
    console.log('[worker] All jobs drained. Shut down cleanly.');
    process.exit(0);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
console.log(`[worker] Started — concurrency: ${CONCURRENCY_LIMIT}, poll interval: ${POLL_INTERVAL_MS}ms`);

// Run the reaper immediately on startup to recover any orphaned jobs from a
// previous worker crash, then schedule it to run on a recurring interval.
runReaper();

// Kick off the very first poll immediately on startup.
scheduleNextPoll(0);

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));