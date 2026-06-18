ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_dead_letter
  ON jobs(status, dead_lettered_at DESC)
  WHERE status = 'dead_letter';