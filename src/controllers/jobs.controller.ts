import { Request, Response } from 'express';
import { createJob, getJobById } from '../services/jobs.service';

export async function createJobHandler(req: Request, res: Response) {
    try {
        const { type, payload, max_attempts } = req.body;

        if (!type || typeof type !== 'string') {
            return res.status(400).json({ error: '"type" is required and must be a string' });
        }

        const job = await createJob({ type, payload, max_attempts });
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