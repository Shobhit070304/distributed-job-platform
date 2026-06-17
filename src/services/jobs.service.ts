import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db';
import { Job, CreateJobInput } from '../models/job.types';

export async function createJob(input: CreateJobInput): Promise<Job> {
    const id = uuidv4();
    const { type, payload = {}, max_attempts = 3, delay_seconds, run_at } = input;

    // If run_at is provided, calculate available_at
    let availableAt: Date | null = null;
    if (run_at) {
        availableAt = new Date(run_at);
    } else if (delay_seconds !== undefined) {
        availableAt = new Date(Date.now() + delay_seconds * 1000);
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
     SET status = 'processing', updated_at = now()
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
       SET status = 'failed', attempts = $1, last_error = $2, updated_at = now()
       WHERE id = $3`,
            [newAttempts, error.message, job.id]
        );
        console.log(`Job ${job.id} exhausted all ${job.max_attempts} attempts. Marked failed.`);
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
        `UPDATE jobs SET status = 'failed', last_error = $1, updated_at = now() WHERE id = $2`,
        [errorMessage, id]
    );
}