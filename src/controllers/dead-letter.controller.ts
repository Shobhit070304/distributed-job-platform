import { Request, Response } from 'express';
import {
  getDeadLetterJobs,
  retryDeadLetterJob,
  discardDeadLetterJob,
} from '../services/jobs.service';

export async function listDeadLetterJobsHandler(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (limit < 1 || limit > 100) {
      return res.status(400).json({ error: '"limit" must be between 1 and 100' });
    }

    if (offset < 0 || isNaN(offset)) {
      return res.status(400).json({ error: '"offset" must be a non-negative integer' });
    }

    const { jobs, total } = await getDeadLetterJobs({ limit, offset });

    return res.status(200).json({
      data: jobs,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + jobs.length < total,
      },
    });
  } catch (err) {
    console.error('Error listing dead letter jobs:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function retryDeadLetterJobHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const job = await retryDeadLetterJob(id);
    if (!job) {
      return res.status(404).json({
        error: 'Job not found in dead letter queue',
      });
    }
    return res.status(200).json(job);
  } catch (err) {
    console.error('Error retrying dead letter job:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function discardDeadLetterJobHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const deleted = await discardDeadLetterJob(id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Job not found in dead letter queue',
      });
    }
    return res.status(200).json({ message: 'Job discarded successfully' });
  } catch (err) {
    console.error('Error discarding dead letter job:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}