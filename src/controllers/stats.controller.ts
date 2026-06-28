import { Request, Response } from 'express';
import { getJobStats } from '../services/stats.service';
import { listJobs } from '../services/jobs.service';

export async function getStatsHandler(_req: Request, res: Response) {
    try {
        const stats = await getJobStats();
        return res.status(200).json(stats);
    } catch (err) {
        console.error('Error fetching stats:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export async function listJobsHandler(req: Request, res: Response) {
    try {
        const status = req.query.status as string | undefined;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        const validStatuses = ['pending', 'processing', 'completed', 'dead_letter'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }

        if (limit < 1 || limit > 100) {
            return res.status(400).json({ error: '"limit" must be between 1 and 100' });
        }

        const { jobs, total } = await listJobs({ status, limit, offset });
        return res.status(200).json({
            data: jobs,
            pagination: { total, limit, offset, has_more: offset + jobs.length < total },
        });
    } catch (err) {
        console.error('Error listing jobs:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}