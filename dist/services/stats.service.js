"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobStats = getJobStats;
const db_1 = require("../config/db");
async function getJobStats() {
    const [countsResult, throughputResult, perfResult, dlqResult] = await Promise.all([
        db_1.pool.query(`SELECT status, COUNT(*) as count FROM jobs GROUP BY status`),
        db_1.pool.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'completed'
          AND updated_at > now() - interval '1 hour')  AS completed_last_hour,
        COUNT(*) FILTER (WHERE status = 'completed'
          AND updated_at > now() - interval '24 hours') AS completed_last_24h,
        COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter')
          AND updated_at > now() - interval '1 hour')  AS failed_last_hour,
        COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter')
          AND updated_at > now() - interval '24 hours') AS failed_last_24h
       FROM jobs`),
        db_1.pool.query(`SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) AS avg_seconds,
        COUNT(*) FILTER (WHERE status = 'completed')        AS total_completed,
        COUNT(*) FILTER (WHERE status IN ('completed', 'dead_letter')) AS total_terminal
       FROM jobs
       WHERE status IN ('completed', 'dead_letter')`),
        db_1.pool.query(`SELECT COUNT(*) AS count, MIN(dead_lettered_at) AS oldest
       FROM jobs WHERE status = 'dead_letter'`),
    ]);
    // Build counts with safe defaults (statuses with 0 jobs won't appear in GROUP BY result)
    const counts = {
        pending: 0, processing: 0, completed: 0,
        failed: 0, dead_letter: 0, total: 0,
    };
    for (const row of countsResult.rows) {
        const key = row.status;
        const n = parseInt(row.count, 10);
        counts[key] = n;
        counts.total += n;
    }
    const tp = throughputResult.rows[0];
    const perf = perfResult.rows[0];
    const dlq = dlqResult.rows[0];
    const totalCompleted = parseInt(perf.total_completed, 10);
    const totalTerminal = parseInt(perf.total_terminal, 10);
    return {
        counts,
        throughput: {
            completed_last_hour: parseInt(tp.completed_last_hour, 10),
            completed_last_24h: parseInt(tp.completed_last_24h, 10),
            failed_last_hour: parseInt(tp.failed_last_hour, 10),
            failed_last_24h: parseInt(tp.failed_last_24h, 10),
        },
        performance: {
            avg_processing_time_seconds: perf.avg_seconds
                ? parseFloat(parseFloat(perf.avg_seconds).toFixed(2))
                : null,
            success_rate_percent: totalTerminal > 0
                ? parseFloat(((totalCompleted / totalTerminal) * 100).toFixed(1))
                : null,
        },
        dead_letter: {
            count: parseInt(dlq.count, 10),
            oldest_dead_lettered_at: dlq.oldest ?? null,
        },
    };
}
