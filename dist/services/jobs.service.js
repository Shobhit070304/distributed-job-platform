"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.getJobById = getJobById;
exports.claimNextPendingJob = claimNextPendingJob;
exports.markJobCompleted = markJobCompleted;
exports.handleJobFailure = handleJobFailure;
exports.markJobFailedTerminal = markJobFailedTerminal;
exports.getDeadLetterJobs = getDeadLetterJobs;
exports.retryDeadLetterJob = retryDeadLetterJob;
exports.discardDeadLetterJob = discardDeadLetterJob;
exports.listJobs = listJobs;
const uuid_1 = require("uuid");
const db_1 = require("../config/db");
async function createJob(input) {
    const id = (0, uuid_1.v4)();
    const { type, payload = {}, max_attempts = 3, delay_seconds, run_at } = input;
    // If run_at is provided, calculate available_at
    let availableAt;
    if (run_at) {
        availableAt = new Date(run_at);
    }
    else {
        const seconds = delay_seconds ?? 0;
        availableAt = new Date(Date.now() + seconds * 1000);
    }
    const result = await db_1.pool.query(`INSERT INTO jobs(id, type, payload, max_attempts, available_at)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`, [id, type, payload, max_attempts, availableAt]);
    return result.rows[0];
}
async function getJobById(id) {
    const result = await db_1.pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
}
async function claimNextPendingJob() {
    const result = await db_1.pool.query(`UPDATE jobs
     SET status = 'processing', updated_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending' AND available_at <= now()
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`);
    return result.rows[0] ?? null;
}
async function markJobCompleted(id) {
    await db_1.pool.query(`UPDATE jobs SET status = 'completed', updated_at = now() WHERE id = $1`, [id]);
}
const BASE_DELAY_MS = 5000;
function computeBackoffMs(attempt) {
    const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return exponential + jitter;
}
async function handleJobFailure(job, error) {
    const newAttempts = job.attempts + 1;
    if (newAttempts >= job.max_attempts) {
        await db_1.pool.query(`UPDATE jobs
       SET status = 'dead_letter', attempts = $1, last_error = $2, dead_lettered_at = now(), updated_at = now()
       WHERE id = $3`, [newAttempts, error.message, job.id]);
        console.log(`Job ${job.id} exhausted all ${job.max_attempts} attempts. Marked as dead_letter.`);
        return;
    }
    const delayMs = computeBackoffMs(newAttempts);
    await db_1.pool.query(`UPDATE jobs
     SET status = 'pending', attempts = $1, last_error = $2,
         available_at = now() + ($3 || ' milliseconds')::interval,
         updated_at = now()
     WHERE id = $4`, [newAttempts, error.message, delayMs, job.id]);
    console.log(`Job ${job.id} failed (attempt ${newAttempts}/${job.max_attempts}). Retrying in ${Math.round(delayMs / 1000)}s.`);
}
// For jobs that should not be retried(like invalid input)
async function markJobFailedTerminal(id, errorMessage) {
    await db_1.pool.query(`UPDATE jobs SET status = 'dead_letter', last_error = $1, dead_lettered_at = now(), updated_at = now() WHERE id = $2`, [errorMessage, id]);
}
async function getDeadLetterJobs(options = {}) {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    const [dataResult, countResult] = await Promise.all([
        db_1.pool.query(`SELECT * FROM jobs
             WHERE status = 'dead_letter'
             ORDER BY dead_lettered_at DESC
             LIMIT $1 OFFSET $2`, [limit, offset]),
        db_1.pool.query(`SELECT COUNT(*) as count FROM jobs WHERE status = 'dead_letter'`),
    ]);
    return {
        jobs: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
    };
}
async function retryDeadLetterJob(id) {
    const result = await db_1.pool.query(`UPDATE jobs
     SET status = 'pending',
         attempts = 0,
         last_error = null,
         available_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'dead_letter'
     RETURNING *`, [id]);
    return result.rows[0] ?? null;
}
async function discardDeadLetterJob(id) {
    const result = await db_1.pool.query(`DELETE FROM jobs WHERE id = $1 AND status = 'dead_letter'`, [id]);
    return (result.rowCount ?? 0) > 0;
}
async function listJobs(options = {}) {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    // Build dynamic WHERE clause safely
    const conditions = [];
    const filterParams = [];
    if (options.status) {
        filterParams.push(options.status);
        conditions.push(`status = $${filterParams.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataParams = [...filterParams, limit, offset];
    const countParams = [...filterParams];
    const [dataResult, countResult] = await Promise.all([
        db_1.pool.query(`SELECT * FROM jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`, dataParams),
        db_1.pool.query(`SELECT COUNT(*) as count FROM jobs ${where}`, countParams),
    ]);
    return {
        jobs: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
    };
}
