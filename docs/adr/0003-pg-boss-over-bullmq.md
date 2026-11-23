<!-- Decision record: background jobs will run on Postgres (pg-boss) instead of Redis (BullMQ).
     One less service to run; nothing is installed yet, Phase 8 starts from this decision. -->

# ADR 0003: Use pg-boss on Postgres for background jobs, not BullMQ

- **Status:** Accepted
- **Date:** 2026-11-22
- **Issue:** #2 (Phase 2: Foundation)

## Context

Later phases need background jobs: workflow steps with retries (Phase 8), proposal expiry and the retention purges for `tool_calls`, `proposals` and `audit_events`.

v1 of the blueprint chose Redis and BullMQ. v2 already runs on Neon Postgres and prefers one fewer service to run and pay for.

## Decision

- Use **pg-boss** on the same Postgres database for queues and schedules.
- Do not add Redis or BullMQ.
- Nothing is installed in Phase 2. This ADR records the decision so that Phase 8 starts from it.

## Consequences

- One less service to deploy, secure and pay for, and one place to back up.
- Jobs can be enqueued in the same transaction as the business write, so a job exists exactly when its row does.
- pg-boss has a lower throughput ceiling than Redis. Approval and workflow volumes are far below it, so this is acceptable.
- Job tables share the database's connection budget. On Neon, use the direct connection for the worker, not the pooled one.
- Revisit if job volume grows by orders of magnitude or if Redis is needed for another reason (rate limits, caching).
