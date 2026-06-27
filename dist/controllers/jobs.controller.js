"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJobHandler = createJobHandler;
exports.getJobHandler = getJobHandler;
const jobs_service_1 = require("../services/jobs.service");
async function createJobHandler(req, res) {
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
        const job = await (0, jobs_service_1.createJob)({ type, payload, max_attempts, delay_seconds, run_at });
        return res.status(201).json(job);
    }
    catch (err) {
        console.error('Error creating job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
async function getJobHandler(req, res) {
    try {
        const { id } = req.params;
        if (typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing job ID' });
        }
        const job = await (0, jobs_service_1.getJobById)(id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.status(200).json(job);
    }
    catch (err) {
        console.error('Error fetching job:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
