import { Request, Response } from 'express';
import { createJob, getJobById } from '../services/jobs.service';

export async function createJobHandler(req: Request, res: Response) {
    try {
        const { type, payload, max_attempts, delay_seconds, run_at } = req.body;

        if (!type || typeof type !== 'string') {
            return res.status(400).json({ error: '"type" is required and must be a string' });
        }

        if (delay_seconds !== undefined && run_at !== undefined) {
            return res.status(400).json({ error: 'Provide either delay_seconds or run_at' });
        }

        if (delay_seconds !== undefined && (typeof delay_seconds !== 'number' || delay_seconds < 0)) {
            return res.status(400).json({ error: 'delay_seconds must be a non-negative number' });
        }

        if (run_at !== undefined) {
            const parsed = new Date(run_at);
            if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
                return res.status(400).json({ error: 'run_at must be a valid date string in the future' });
            }
        }

        const job = await createJob({ type, payload, max_attempts, delay_seconds, run_at });
        return res.status(201).json(job);
    } catch (err) {
        console.error('Error creating job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export async function getJobHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        if (typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing job ID' });
        }
        const job = await getJobById(id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.status(200).json(job);
    } catch (err) {
        console.error('Error fetching job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}