"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatsHandler = getStatsHandler;
exports.listJobsHandler = listJobsHandler;
const stats_service_1 = require("../services/stats.service");
const jobs_service_1 = require("../services/jobs.service");
async function getStatsHandler(_req, res) {
    try {
        const stats = await (0, stats_service_1.getJobStats)();
        return res.status(200).json(stats);
    }
    catch (err) {
        console.error('Error fetching stats:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function listJobsHandler(req, res) {
    try {
        const status = req.query.status;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const validStatuses = ['pending', 'processing', 'completed', 'failed', 'dead_letter'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }
        if (limit < 1 || limit > 100) {
            return res.status(400).json({ error: '"limit" must be between 1 and 100' });
        }
        const { jobs, total } = await (0, jobs_service_1.listJobs)({ status, limit, offset });
        return res.status(200).json({
            data: jobs,
            pagination: { total, limit, offset, has_more: offset + jobs.length < total },
        });
    }
    catch (err) {
        console.error('Error listing jobs:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
