"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDeadLetterJobsHandler = listDeadLetterJobsHandler;
exports.retryDeadLetterJobHandler = retryDeadLetterJobHandler;
exports.discardDeadLetterJobHandler = discardDeadLetterJobHandler;
const jobs_service_1 = require("../services/jobs.service");
async function listDeadLetterJobsHandler(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        if (limit < 1 || limit > 100) {
            return res.status(400).json({ error: '"limit" must be between 1 and 100' });
        }
        const { jobs, total } = await (0, jobs_service_1.getDeadLetterJobs)({ limit, offset });
        return res.status(200).json({
            data: jobs,
            pagination: {
                total,
                limit,
                offset,
                has_more: offset + jobs.length < total,
            },
        });
    }
    catch (err) {
        console.error('Error listing dead letter jobs:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function retryDeadLetterJobHandler(req, res) {
    try {
        const { id } = req.params;
        if (typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid job ID format' });
        }
        const job = await (0, jobs_service_1.retryDeadLetterJob)(id);
        if (!job) {
            return res.status(404).json({
                error: 'Job not found in dead letter queue',
            });
        }
        return res.status(200).json(job);
    }
    catch (err) {
        console.error('Error retrying dead letter job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function discardDeadLetterJobHandler(req, res) {
    try {
        const { id } = req.params;
        if (typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid job ID format' });
        }
        const deleted = await (0, jobs_service_1.discardDeadLetterJob)(id);
        if (!deleted) {
            return res.status(404).json({
                error: 'Job not found in dead letter queue',
            });
        }
        return res.status(200).json({ message: 'Job discarded successfully' });
    }
    catch (err) {
        console.error('Error discarding dead letter job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
