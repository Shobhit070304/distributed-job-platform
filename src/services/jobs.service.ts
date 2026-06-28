import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db';
import { Job, CreateJobInput } from '../models/job.types';

export async function createJob(input: CreateJobInput): Promise<Job> {
    const id = uuidv4();
    const { type, payload = {}, max_attempts = 3, delay_seconds, run_at } = input;

    // If run_at is provided, calculate available_at
    let availableAt: Date;
    if (run_at) {
        availableAt = new Date(run_at);
    } else {
        const seconds = delay_seconds ?? 0;
        availableAt = new Date(Date.now() + seconds * 1000);
    }

    const result = await pool.query<Job>(
        `INSERT INTO jobs(id, type, payload, max_attempts, available_at)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, type, payload, max_attempts, availableAt]
    );
    return result.rows[0];
}

export async function getJobById(id: string): Promise<Job | null> {
    const result = await pool.query<Job>(
        `SELECT * FROM jobs WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
}

export async function claimNextPendingJob(): Promise<Job | null> {
    const result = await pool.query<Job>(
        `UPDATE jobs
     SET status = 'processing', updated_at = now(), started_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending' AND available_at <= now()
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`
    );
    return result.rows[0] ?? null;
}

export async function markJobCompleted(id: string): Promise<void> {
    await pool.query(
        `UPDATE jobs SET status = 'completed', updated_at = now() WHERE id = $1`,
        [id]
    );
}

const BASE_DELAY_MS = 5000;

function computeBackoffMs(attempt: number): number {
    const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return exponential + jitter;
}

export async function handleJobFailure(job: Job, error: Error): Promise<void> {
    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.max_attempts) {
        await pool.query(
            `UPDATE jobs
       SET status = 'dead_letter', attempts = $1, last_error = $2, dead_lettered_at = now(), updated_at = now()
       WHERE id = $3`,
            [newAttempts, error.message, job.id]
        );
        console.log(`Job ${job.id} exhausted all ${job.max_attempts} attempts. Marked as dead_letter.`);
        return;
    }

    const delayMs = computeBackoffMs(newAttempts);
    await pool.query(
        `UPDATE jobs
     SET status = 'pending', attempts = $1, last_error = $2,
         available_at = now() + ($3 || ' milliseconds')::interval,
         updated_at = now()
     WHERE id = $4`,
        [newAttempts, error.message, delayMs, job.id]
    );
    console.log(`Job ${job.id} failed (attempt ${newAttempts}/${job.max_attempts}). Retrying in ${Math.round(delayMs / 1000)}s.`);
}

// For jobs that should not be retried(like invalid input)
export async function markJobFailedTerminal(id: string, errorMessage: string): Promise<void> {
    await pool.query(
        `UPDATE jobs SET status = 'dead_letter', last_error = $1, dead_lettered_at = now(), updated_at = now() WHERE id = $2`,
        [errorMessage, id]
    );
}


// --- Dead-Letter Queue (DLQ) Management ---
export interface DeadLetterListOptions {
    limit?: number;
    offset?: number;
}

export async function getDeadLetterJobs(options: DeadLetterListOptions = {}): Promise<{ jobs: Job[]; total: number }> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const [dataResult, countResult] = await Promise.all([
        pool.query<Job>(
            `SELECT * FROM jobs
             WHERE status = 'dead_letter'
             ORDER BY dead_lettered_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        ),
        pool.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM jobs WHERE status = 'dead_letter'`
        ),
    ]);

    return {
        jobs: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
    };
}

export async function retryDeadLetterJob(id: string): Promise<Job | null> {
    const result = await pool.query<Job>(
        `UPDATE jobs
     SET status = 'pending',
         attempts = 0,
         last_error = null,
         available_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'dead_letter'
     RETURNING *`,
        [id]
    );
    return result.rows[0] ?? null;
}

export async function discardDeadLetterJob(id: string): Promise<boolean> {
    const result = await pool.query(
        `DELETE FROM jobs WHERE id = $1 AND status = 'dead_letter'`,
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}


// --- Jobs List + Search ---
export interface ListJobsOptions {
    status?: string;
    limit?: number;
    offset?: number;
}

export async function listJobs(options: ListJobsOptions = {}): Promise<{ jobs: Job[]; total: number }> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    // Build dynamic WHERE clause safely
    const conditions: string[] = [];
    const filterParams: unknown[] = [];

    if (options.status) {
        filterParams.push(options.status);
        conditions.push(`status = $${filterParams.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataParams = [...filterParams, limit, offset];
    const countParams = [...filterParams];

    const [dataResult, countResult] = await Promise.all([
        pool.query<Job>(
            `SELECT * FROM jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
            dataParams
        ),
        pool.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM jobs ${where}`,
            countParams
        ),
    ]);

    return {
        jobs: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
    };
}


// ── Bug 3 Fix: Orphaned Job Reaper ──────────────────────────────────────────
// Jobs stuck in 'processing' for longer than STALE_JOB_TIMEOUT_MINUTES are
// considered orphaned — the worker that claimed them crashed or was killed.
// This function resets them to 'pending' so another worker can retry them.
const STALE_JOB_TIMEOUT_MINUTES = 10;

export async function cleanOrphanedJobs(): Promise<number> {
    const result = await pool.query(
        // Bug Fix: Check if attempts + 1 >= max_attempts. If true, move the job
        // to 'dead_letter' instead of 'pending' to prevent poison-pill jobs
        // from causing infinite crash loops across worker restarts.
        `UPDATE jobs
         SET
           status = CASE 
                      WHEN attempts + 1 >= max_attempts THEN 'dead_letter'::varchar
                      ELSE 'pending'::varchar
                    END,
           dead_lettered_at = CASE 
                                WHEN attempts + 1 >= max_attempts THEN now()
                                ELSE dead_lettered_at
                              END,
           attempts   = attempts + 1,
           last_error = CASE 
                          WHEN attempts + 1 >= max_attempts THEN 'Worker crashed or was killed. Max attempts exhausted.'
                          ELSE 'Worker crashed or was killed during execution. Job reset by reaper.'
                        END,
           started_at = NULL,
           updated_at = now()
         WHERE status = 'processing'
           AND updated_at < now() - ($1 || ' minutes')::interval
         RETURNING id, status`,
        [STALE_JOB_TIMEOUT_MINUTES]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
        const deadLettered = result.rows.filter(r => r.status === 'dead_letter').length;
        const resetPending = count - deadLettered;
        
        if (resetPending > 0) {
            console.log(`[reaper] Reset ${resetPending} orphaned processing job(s) back to pending.`);
        }
        if (deadLettered > 0) {
            console.log(`[reaper] Marked ${deadLettered} orphaned job(s) as dead_letter (exhausted attempts).`);
        }
    }
    return count;
}