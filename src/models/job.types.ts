export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';

export interface Job {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    status: JobStatus;
    attempts: number;
    max_attempts: number;
    available_at: Date | null;
    last_error?: string | null;
    started_at?: Date | null;
    dead_lettered_at?: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateJobInput {
    type: string;
    payload?: Record<string, unknown>;
    max_attempts?: number;
    delay_seconds?: number | null;
    run_at?: string | null;
}