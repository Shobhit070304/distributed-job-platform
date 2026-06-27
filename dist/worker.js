"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const env_1 = require("./config/env");
(0, env_1.validateEnv)();
const jobs_service_1 = require("./services/jobs.service");
const handlers_1 = require("./workers/handlers");
const db_1 = require("./config/db");
// ── Concurrency Config ───────────────────────────────────────────────────────
// How many jobs can run in parallel inside this single worker process.
// Increase this number to get more throughput on I/O-bound workloads.
// Do NOT set higher than your DB pool size (currently 10).
const CONCURRENCY_LIMIT = parseInt(process.env.WORKER_CONCURRENCY ?? '5');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '2000');
// ── State ────────────────────────────────────────────────────────────────────
// A Set of active job IDs replaces the old boolean `isProcessing`.
// This correctly tracks *multiple* concurrent jobs at the same time.
const activeJobs = new Set();
let isShuttingDown = false;
let pollTimer = null;
// ── Core: Claim and launch a single job ─────────────────────────────────────
async function processJob() {
    if (isShuttingDown)
        return;
    // If we are already at max concurrency, back off — don't even query the DB.
    if (activeJobs.size >= CONCURRENCY_LIMIT)
        return;
    const job = await (0, jobs_service_1.claimNextPendingJob)();
    if (!job)
        return; // Queue is empty right now.
    // Register the job as active BEFORE we await anything.
    activeJobs.add(job.id);
    console.log(`[worker] Claimed job ${job.id} (type: ${job.type}, attempt ${job.attempts + 1}/${job.max_attempts}) | active: ${activeJobs.size}/${CONCURRENCY_LIMIT}`);
    const handler = (0, handlers_1.getHandler)(job.type);
    // Run the job asynchronously — do NOT await here.
    // This is what enables concurrency: we return immediately so the poll
    // loop can claim more jobs while this one is still running.
    (async () => {
        try {
            if (!handler) {
                console.error(`[worker] No handler for type "${job.type}"`);
                await (0, jobs_service_1.markJobFailedTerminal)(job.id, `No handler registered for type "${job.type}"`);
                return;
            }
            await handler(job);
            await (0, jobs_service_1.markJobCompleted)(job.id);
            console.log(`[worker] Job ${job.id} completed | active: ${activeJobs.size - 1}/${CONCURRENCY_LIMIT}`);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[worker] Job ${job.id} failed: ${error.message}`);
            await (0, jobs_service_1.handleJobFailure)(job, error);
        }
        finally {
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
    if (activeJobs.size < CONCURRENCY_LIMIT) {
        scheduleNextPoll(0);
    }
}
// ── Polling Scheduler ────────────────────────────────────────────────────────
// Uses setTimeout (not setInterval) so poll calls never pile up on each other.
// Each poll schedules the next one only after it has run.
function scheduleNextPoll(delayMs = POLL_INTERVAL_MS) {
    if (isShuttingDown)
        return;
    // If a regular-interval poll is already scheduled and this is another
    // regular-interval call, skip — avoid double-scheduling.
    if (pollTimer !== null && delayMs > 0)
        return;
    // If this is an immediate (0ms) call, cancel any pending timer first.
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
    }
    pollTimer = setTimeout(async () => {
        pollTimer = null;
        await processJob();
        // Schedule the next regular idle poll after this one finishes.
        scheduleNextPoll(POLL_INTERVAL_MS);
    }, delayMs);
}
// ── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`[worker] ${signal} received — waiting for ${activeJobs.size} active job(s) to finish`);
    isShuttingDown = true;
    // Cancel any pending poll timer so no new jobs are claimed.
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    // Wait until every active job has called activeJobs.delete() in its finally block.
    while (activeJobs.size > 0) {
        console.log(`[worker] Draining... ${activeJobs.size} job(s) still running`);
        await new Promise((r) => setTimeout(r, 200));
    }
    await db_1.pool.end();
    console.log('[worker] All jobs drained. Shut down cleanly.');
    process.exit(0);
}
// ── Bootstrap ────────────────────────────────────────────────────────────────
console.log(`[worker] Started — concurrency: ${CONCURRENCY_LIMIT}, poll interval: ${POLL_INTERVAL_MS}ms`);
// Kick off the very first poll immediately on startup.
scheduleNextPoll(0);
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
