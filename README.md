# Distributed Job Processing Platform

A production-style background job processing system built with **Node.js, TypeScript, PostgreSQL, and Docker**. 

Think of it as a lightweight version of BullMQ or AWS SQS — built from scratch to understand the mechanics rather than abstract them away.

## Features

- **Job Queue API** — Submit jobs with type + arbitrary JSON payload
- **Concurrent Workers** — Multiple worker processes safely claim jobs using `SELECT FOR UPDATE SKIP LOCKED` (zero duplicate processing)
- **Exponential Backoff Retries** — Failed jobs retry with growing delays + jitter to prevent thundering herd
- **Delayed / Scheduled Jobs** — Submit jobs with a `delay_seconds` or exact `run_at` timestamp
- **Dead Letter Queue** — Jobs that exhaust all retries land in a DLQ with full API for listing, retrying, and discarding
- **Monitoring Dashboard** — Live web UI with real-time job counts, throughput, success rates, and DLQ alerts
- **Docker Setup** — Full multi-container setup with health checks, restart policies, and graceful shutdown

## Architecture

```
                    ┌─────────────────────────────────┐
  POST /api/jobs    │          Express API              │    GET /api/stats
  ─────────────────▶│  (Job Producer + REST Interface)  │◀───────────────────
                    └──────────────────┬───────────────┘
                                       │ INSERT
                                       ▼
                              ┌─────────────────┐
                              │   PostgreSQL      │
                              │   jobs table      │
                              │  ┌─────────────┐ │
                              │  │   pending   │ │
                              │  │ processing  │ │
                              │  │  completed  │ │
                              │  │ dead_letter │ │
                              │  └─────────────┘ │
                              └────────┬─────────┘
                                       │ SELECT FOR UPDATE SKIP LOCKED
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                      Worker 1    Worker 2    Worker N
                    (stateless — scale horizontally by running more)
```

## Quick Start

```bash
git clone <your-repo-url>
cd job-platform
docker-compose up --build
```

That's it. Visit `http://localhost:3000/dashboard.html` for the monitoring dashboard.

> **Note:** On first run, Postgres auto-applies all migrations from `migrations/` via `docker-entrypoint-initdb.d`.

## Running Locally (without Docker)

```bash
npm install
cp .env.example .env   # fill in your local Postgres credentials

# Run migrations
psql $DATABASE_URL -f migrations/001_create_jobs_table.sql
psql $DATABASE_URL -f migrations/002_add_retry_columns.sql
psql $DATABASE_URL -f migrations/003_add_dead_letter_columns.sql

# Terminal 1: API server
npm run dev

# Terminal 2: Worker
npm run worker
```

## API Reference

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs` | Create a new job |
| `GET` | `/api/jobs` | List jobs (filterable by status, paginated) |
| `GET` | `/api/jobs/:id` | Get a single job by ID |

**Create job — request body:**

```json
{
  "type": "send_email",
  "payload": { "to": "user@example.com" },
  "max_attempts": 3,
  "delay_seconds": 30
}
```

Or use `run_at` instead of `delay_seconds` for an absolute schedule:

```json
{
  "type": "send_email",
  "payload": { "to": "user@example.com" },
  "run_at": "2026-06-20T09:00:00Z"
}
```

### Dead Letter Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dead-letter` | List all DLQ jobs (paginated) |
| `POST` | `/api/dead-letter/:id/retry` | Reset job to pending (full retry reset) |
| `DELETE` | `/api/dead-letter/:id` | Permanently discard a job |

### Stats & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats` | Aggregate metrics (counts, throughput, success rate, DLQ health) |
| `GET` | `/health` | Health check |

## Job Lifecycle

```
pending ──► processing ──► completed
                │
                ├── attempts < max_attempts ──► pending (after backoff delay)
                │
                └── attempts >= max_attempts ──► dead_letter
```

## Key Design Decisions

**Why PostgreSQL as a queue (instead of Redis/BullMQ)?**  
At moderate scale, Postgres `SELECT FOR UPDATE SKIP LOCKED` provides durable, ACID-safe job claiming without additional infrastructure. The tradeoff vs. Redis-based queues is latency (polling interval vs. push-based wakeup) — a conscious choice here given the simpler ops footprint. Redis is included in the stack for future use (stats caching, pub/sub notifications).

**Why polling instead of `LISTEN/NOTIFY`?**  
Polling is simpler to reason about, debug, and operate. `LISTEN/NOTIFY` would reduce latency (~0ms vs. up to poll interval) but adds connection-management complexity. For most job workloads where seconds of latency are acceptable, polling is the right default.

**Why `available_at` instead of a separate `scheduled_at` column?**  
Both retries (exponential backoff) and delayed jobs need the same primitive: "don't make this job visible until time X." One column serves both use cases — fewer columns, same guarantee.

**Why `dead_letter` as a separate status instead of `failed`?**  
`failed` is transient (job is mid-retry-cycle). `dead_letter` is terminal (all retries exhausted, human action required). Using the same status for both makes them indistinguishable — bad observability. Two distinct statuses enable targeted querying, alerting, and admin tooling.

**Why partial index on `dead_letter`?**  
`CREATE INDEX ... WHERE status = 'dead_letter'` only indexes the small subset of rows that are actually in the DLQ. On a table with millions of `completed` jobs, a full-table status index would be unnecessarily large. The partial index stays small and fast regardless of table growth.

## Scaling

- **Horizontal worker scaling:** Workers are stateless — run `N` instances with the same `DATABASE_URL`. Postgres row-level locking handles coordination automatically.
- **Throughput bottleneck:** At high load, the poll interval becomes the primary latency driver. Reduce `POLL_INTERVAL_MS` or switch to Postgres `LISTEN/NOTIFY` for sub-second latency.
- **Database bottleneck:** The `idx_jobs_status_available_at` compound index keeps claim queries fast. For very high volume (millions of jobs/day), consider partitioning the table by status or archiving completed jobs.

## Project Structure

```
src/
├── config/         # DB pool, env validation
├── models/         # TypeScript interfaces
├── services/       # Business logic (jobs, stats)
├── controllers/    # Request handlers
├── routes/         # Express routers
└── workers/        # Worker process + job handlers
migrations/         # SQL migration files (auto-applied by Docker)
public/             # dashboard.html (served by Express)
```

## Tech Stack

- **Runtime:** Node.js 20, TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL 16
- **Cache / Messaging:** Redis 7 (infrastructure ready)
- **Containerization:** Docker + Docker Compose