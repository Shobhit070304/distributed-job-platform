import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db';
import { Job, CreateJobInput } from '../models/job.types';

export async function createJob(input: CreateJobInput): Promise<Job> {
    const id = uuidv4();
    const { type, payload = {}, max_attempts = 3 } = input;

    const result = await pool.query<Job>(
        `INSERT INTO jobs(id, type, payload, max_attempts)
        VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, type, payload, max_attempts]
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