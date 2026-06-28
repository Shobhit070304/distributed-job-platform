import { pool } from '../config/db';

export interface JobCounts {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead_letter: number;
    total: number;
}

export interface JobStats {
    counts: JobCounts;
    throughput: {
        completed_last_hour: number;
        completed_last_24h: number;
        failed_last_hour: number;
        failed_last_24h: number;
    };
    performance: {
        avg_processing_time_seconds: number | null;
        success_rate_percent: number | null;
    };
    dead_letter: {
        count: number;
        oldest_dead_lettered_at: string | null;
    };
}

export async function getJobStats(): Promise<JobStats> {
    const [countsResult, throughputResult, perfResult, dlqResult] = await Promise.all([
        pool.query<{ status: string; count: string }>(
            `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
        ),

        pool.query<{
            completed_last_hour: string;
            completed_last_24h: string;
            failed_last_hour: string;
            failed_last_24h: string;
        }>(
            `SELECT
        COUNT(*) FILTER (WHERE status = 'completed'
          AND updated_at > now() - interval '1 hour')  AS completed_last_hour,
        COUNT(*) FILTER (WHERE status = 'completed'
          AND updated_at > now() - interval '24 hours') AS completed_last_24h,
        COUNT(*) FILTER (
          WHERE updated_at > now() - interval '1 hour'
            AND (
              status = 'dead_letter'
              OR (status = 'pending' AND attempts > 0 AND last_error IS NOT NULL)
            )
        ) AS failed_last_hour,
        COUNT(*) FILTER (
          WHERE updated_at > now() - interval '24 hours'
            AND (
              status = 'dead_letter'
              OR (status = 'pending' AND attempts > 0 AND last_error IS NOT NULL)
            )
        ) AS failed_last_24h
       FROM jobs`
        ),

        pool.query<{
            avg_seconds: string | null;
            total_completed: string;
            total_terminal: string;
        }>(
            `SELECT
        AVG(EXTRACT(EPOCH FROM (updated_at - started_at))) AS avg_seconds,
        COUNT(*) FILTER (WHERE status = 'completed')        AS total_completed,
        COUNT(*) FILTER (WHERE status IN ('completed', 'dead_letter')) AS total_terminal
       FROM jobs
       WHERE status IN ('completed', 'dead_letter')
         AND started_at IS NOT NULL`
        ),

        pool.query<{ count: string; oldest: string | null }>(
            `SELECT COUNT(*) AS count, MIN(dead_lettered_at) AS oldest
       FROM jobs WHERE status = 'dead_letter'`
        ),
    ]);

    // Build counts with safe defaults (statuses with 0 jobs won't appear in GROUP BY result)
    const counts: JobCounts = {
        pending: 0, processing: 0, completed: 0,
        failed: 0, dead_letter: 0, total: 0,
    };
    for (const row of countsResult.rows) {
        const key = row.status as keyof Omit<JobCounts, 'total'>;
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