# TaskForge — API, UI, Security, Testing & Observability Specification

**Document 4 of 5 — Pre-Development Documentation Package**

---

# Part A — REST API

Base path: `/api/v1`. All endpoints except `POST /auth/login` and `POST /workers/register` (which uses a pre-issued worker credential, not a session) require `Authorization: Bearer <token>`.

### Authentication

**`POST /auth/login`**
- Purpose: authenticate a user, receive a JWT.
- Auth: none.
- Request: `{ email, password }`.
- Response: `{ token, expiresAt, role }`.
- Status codes: `200` success; `401` invalid credentials; `400` malformed request.
- Validation: email format, non-empty password.
- Error cases: rate-limited after repeated failures (Part E).

**`POST /auth/logout`**
- Purpose: invalidate current session token (token added to a short-lived revocation list).
- Auth: user token.
- Response: `204`.
- Status codes: `204`; `401` if already invalid.

### Users (Admin-scoped)

**`POST /users`** — create user. Auth: Admin. Request: `{ email, password, role }`. Response: `201 { userId }`. Status: `201`, `400` validation, `403` non-admin, `409` email exists.

**`GET /users`** — list users. Auth: Admin. Response: `200 [ {id, email, role, createdAt} ]`.

### Jobs

**`POST /jobs`**
- Purpose: submit a single job (FR-001).
- Auth: Developer or Admin.
- Request: `{ type, payload, priority?, timeoutMs?, maxAttempts?, dependsOn?: string[] }`.
- Response: `201 { jobId, state }`.
- Status codes: `201`; `400` invalid type/payload/priority range; `404` a referenced `dependsOn` job doesn't exist; `401`/`403` auth.
- Validation: `type` must be a registered job type; `priority` within configured bounds; `dependsOn` entries must exist and not create a single-job cycle trivially (full cycle check is workflow-level, Part below).

**`GET /jobs/{jobId}`**
- Purpose: fetch job detail (UC-13, Job Details view).
- Response: `200 { id, type, state, priority, attempt, maxAttempts, assignedWorkerId, createdAt, updatedAt, result, error }`.
- Status: `200`; `404` not found; `403` Developer requesting another user's job (Developers see only their own; Admins see all).

**`GET /jobs`**
- Purpose: list/search/filter jobs (Part D Jobs view).
- Query params: `state`, `type`, `workflowId`, `priority`, `submittedBy`, `page`, `pageSize`.
- Response: `200 { items: [...], total, page }`.

**`GET /jobs/{jobId}/events`**
- Purpose: full state-transition history (FR-005).
- Response: `200 [ { fromState, toState, timestamp, actor } ]`.
- Status: `200`; `404`.

**`POST /jobs/{jobId}/cancel`**
- Purpose: cancel a job (UC-5).
- Response: `200 { id, state: "CANCELLED" }`.
- Status: `200`; `404` not found; `409` job already terminal; `403` not owner and not Admin.

### Workflows

**`POST /workflows`**
- Purpose: submit a DAG of jobs (UC-10).
- Request: `{ jobs: [{ localId, type, payload, priority? }], edges: [{ from: localId, to: localId }], partialFailurePolicy? }`.
- Response: `201 { workflowId, jobIds: {localId: realJobId} }`.
- Status: `201`; `400` invalid job definitions; `422` cycle detected — response includes the offending cycle path (FR-017); `401`/`403`.

**`GET /workflows/{workflowId}`**
- Response: `200 { id, state, jobs: [...], edges, partialFailurePolicy }` (Part D Workflow DAG view).
- Status: `200`; `404`.

**`POST /workflows/{workflowId}/cancel`**
- Response: `200 { id, state: "CANCELLED" }`.
- Status: `200`; `404`; `409` already terminal.

### Workers

**`POST /workers/register`**
- Purpose: worker self-registration (UC-6).
- Auth: worker-scoped credential (not a user token).
- Request: `{ capabilities: string[], resourceCapacity: {cpu, memoryMb, maxConcurrentJobs} }`.
- Response: `201 { workerId, workerToken }`.
- Status: `201`; `401` invalid worker credential; `400` invalid capacity values.

**`POST /workers/{workerId}/heartbeat`**
- Auth: worker token, must match `workerId`.
- Request: `{ currentLoad: {activeJobs, cpu, memoryMb} }`.
- Response: `200 { acknowledged: true }`.
- Status: `200`; `401` token mismatch; `404` unknown worker (must re-register).

**`GET /workers`**
- Purpose: dashboard Workers view.
- Query params: `state`, `capability`.
- Response: `200 [ { id, state, capabilities, resourceCapacity, currentLoad, lastHeartbeatAt } ]`.

**`POST /workers/{workerId}/drain`**
- Purpose: administrative graceful drain (Document 2, Section 10).
- Auth: Admin.
- Response: `200 { id, state: "DRAINING" }`.
- Status: `200`; `404`; `403`.

### Queues

**`GET /queues/status`**
- Purpose: queue depth/congestion (Document 2, Section 7).
- Response: `200 { depth, byPriority: {...}, congested: boolean }`.

### Simulation

**`POST /simulations`**
- Purpose: configure and launch a simulation (UC-12).
- Auth: Platform Engineer/Admin role.
- Request: `{ jobCount, workerCount, jobShape: "flat"|"dag", submissionRate?, schedulingStrategy? }`.
- Response: `201 { simulationId, state: "RUNNING" }`.
- Status: `201`; `400` invalid config; `403` insufficient role.

**`POST /simulations/{id}/events`**
- Purpose: inject a mid-run event, e.g. `{ type: "KILL_WORKERS", percentage: 30 }` (UC-12 alt flow).
- Response: `200 { applied: true }`.
- Status: `200`; `404` simulation not found or not running; `400` invalid event type/params.

**`GET /simulations/{id}`**
- Response: `200 { id, state, config, summaryMetrics, startedAt, completedAt }`.

**`GET /simulations`** — list past/active simulations, `200 [ {...} ]`.

### Metrics

**`GET /metrics`**
- Query params: `range` (e.g. `1h`, `24h`), `metric?`.
- Response: `200 { jobsPerSec, queueDepth, p95LatencyMs, p99LatencyMs, workerUtilization, failedJobs, retryCount, series: [...] }`.
- Status: `200`; `400` invalid range.

### Audit

**`GET /audit`**
- Auth: Admin.
- Query params: `actor`, `action`, `range`, `page`.
- Response: `200 { items: [ {actor, action, targetType, targetId, timestamp, metadata} ], total }`.
- Status: `200`; `403` non-admin.

---

# Part B — Worker Protocol

Combination protocol per Document 2, Section 6: REST for registration, Redis Streams for assignment/heartbeat-adjacent traffic/results.

- **Registration:** `POST /workers/register` (REST, Part A) — one-time (or on restart) low-frequency call needing a clear auth handshake.
- **Heartbeat:** dual-path — `POST /workers/{id}/heartbeat` (REST) is the primary path for MVP simplicity (easy to implement, sufficient at target scale of ~100 workers per NFR-004); a Redis Streams heartbeat channel is documented as the scale-up alternative (Document 5, Part A) if REST polling overhead became a bottleneck beyond MVP scale.
- **Job assignment:** delivered via a per-worker Redis Streams consumer group entry (Document 2, Section 7) — orchestrator `XADD`s to the worker's assignment stream; worker `XREADGROUP`s and `XACK`s on receipt.
- **Job acknowledgement:** the `XACK` itself is the acknowledgement; if not received within `ASSIGNMENT_ACK_TIMEOUT` (default 10s), the orchestrator treats the assignment as failed and re-queues the job (Document 1, UC-3 alt flow).
- **Job execution:** local to the worker process; no protocol traffic during execution unless the job type supports progress reporting (Future item).
- **Result:** worker `XADD`s a result message `{ jobId, attempt, workerId, outcome: "SUCCEEDED"|"FAILED", payload|error }` to a shared results stream consumed by the orchestrator.
- **Failure (of the worker, from orchestrator's view):** no explicit protocol message — detected purely by heartbeat absence (Document 3, Part G); this is intentional, since a protocol message cannot be relied upon from a genuinely dead process.
- **Cancellation:** orchestrator `XADD`s a cancellation message to the worker's assignment stream referencing the `jobId`; worker checks for cancellation messages between/during execution steps where feasible (best-effort — true mid-execution interruption depends on job type) and reports `CANCELLED` outcome.

---

# Part C — Real-Time Events

Delivered to the dashboard over WebSocket, one connection per authenticated session, filtered server-side to events the user's role/ownership permits seeing.

| Event | Payload | Delivery |
|---|---|---|
| `JOB_CREATED` | `{jobId, type, priority, workflowId?}` | at-most-once (UI convenience; authoritative state always fetchable via REST) |
| `JOB_ASSIGNED` | `{jobId, workerId}` | at-most-once |
| `JOB_STARTED` | `{jobId, workerId}` | at-most-once |
| `JOB_COMPLETED` | `{jobId, outcome: "SUCCEEDED", durationMs}` | at-most-once |
| `JOB_FAILED` | `{jobId, error, attempt}` | at-most-once |
| `JOB_RETRIED` | `{jobId, attempt, backoffMs}` | at-most-once |
| `WORKER_REGISTERED` | `{workerId, capabilities}` | at-most-once |
| `WORKER_FAILED` | `{workerId, reclaimedJobIds}` | at-most-once |
| `WORKER_RECOVERED` | `{workerId}` | at-most-once |
| `QUEUE_UPDATED` | `{depth, congested}` | at-most-once, throttled to 1/sec max |
| `SIMULATION_STARTED` | `{simulationId, config}` | at-most-once |
| `SIMULATION_COMPLETED` | `{simulationId, summaryMetrics}` | at-most-once |

**Delivery behavior:** these are UI-convenience events, deliberately **at-most-once** — unlike the job-assignment protocol (Part B), losing a UI event is not a correctness problem because Firestore remains the source of truth and the dashboard reconciles via REST on reconnect (NFR-002 is measured under normal operation, not network-partition conditions). This asymmetry (at-least-once for execution-critical messages, at-most-once for UI notifications) is a deliberate, documented design choice, not an inconsistency.

---

# Part D — UI/UX (Dashboard)

**Overview**
- Active/Queued/Failed job counts (large summary tiles), worker count by state, throughput sparkline, queue depth gauge, overall health indicator (green/yellow/red derived from congestion + unhealthy-worker ratio).

**Jobs**
- Filterable/searchable table (state, type, priority, submittedBy, date range); row click → Job Details.

**Job Details**
- Header: id, type, state badge, priority.
- Body: attempt count / maxAttempts, assigned worker (link), duration, dependency list with each dependency's current state, full event timeline (from `GET /jobs/{id}/events`), error detail (if failed), Cancel button (if non-terminal).

**Workers**
- Card/table per worker: status badge, CPU/memory bars, capabilities tags, active job count vs. capacity, last heartbeat (relative time), Drain button (Admin).

**Workflow**
- Visual DAG (nodes = jobs colored by state, edges = dependencies), rendered top-to-bottom or left-to-right; clicking a node opens Job Details inline.

**Queues**
- Depth-over-time chart, breakdown by priority band, congestion indicator with the threshold that triggered it.

**Simulation**
- Configuration form (job count, worker count, DAG vs. flat, submission rate, strategy selector) → Launch; live view during run (mirrors Overview + Workers, scoped to the simulation namespace); event-injection controls (e.g., "Kill 30% of workers" button) enabled only while `RUNNING`; post-run summary report.

**Monitoring**
- Time-range selector; charts for jobs/sec, P95/P99 latency, worker utilization, failed-job rate, retry count — each metric from `GET /metrics`.

**Audit**
- Filterable table (actor, action, target, timestamp) — Admin-only view.

**Wireframe description (Overview, representative):**
```
+--------------------------------------------------------------+
| TaskForge                                    [User] [Logout] |
+--------------------------------------------------------------+
| [Active: 42] [Queued: 118] [Failed: 3] [Workers: 12/15 idle] |
+--------------------------------------------------------------+
| Throughput (jobs/sec)     |  Queue Depth                     |
|  ~~~~/\/\~~~~              |   ▂▃▅▇▆▄▃                        |
+--------------------------------------------------------------+
| Health: ● Healthy   |  Nav: Jobs Workers Workflow Sim Metrics |
+--------------------------------------------------------------+
```

---

# Part E — Security

- **Authentication:** JWT-based for users (`POST /auth/login`), separate credential type for workers (Document 2, Section 8), consistent with NFR-009.
- **Authorization / RBAC:** two roles for MVP — `Developer` (own jobs/workflows only, read-only metrics) and `Admin` (all jobs, user management, worker drain, audit log, simulation launch). Role checks enforced at the API Gateway layer before reaching business logic, not left to individual handlers to remember.
- **Worker authentication:** workers authenticate with a distinct worker-credential/token issued out-of-band (e.g., via deployment configuration) and scoped only to `/workers/*` and the Redis assignment/result streams — a compromised worker token cannot be used to call user-facing job-management endpoints.
- **Token handling:** short-lived JWTs (e.g., 1h) with refresh via re-login for MVP simplicity (a refresh-token flow is a documented future enhancement, not required for a solo 4-month scope); revoked tokens tracked in a short-lived denylist for the logout case.
- **Password security:** hashed with bcrypt (or equivalent, e.g. argon2), never logged, never returned in any API response (NFR-008).
- **Input validation:** schema validation (e.g., a JSON schema/validation library) on every request body before it reaches business logic; rejects unknown fields to reduce injection surface.
- **Rate limiting:** applied to `/auth/login` (prevent credential-stuffing) and to job submission per user (prevent a single user from starving the queue, working alongside the congestion backpressure in Document 2, Section 7).
- **Audit logs:** as specified in FR-034, covering submission, cancellation, worker registration/drain, and all Admin actions.
- **Secrets:** Firebase service-account credentials and Redis connection secrets loaded from environment variables / Docker secrets, never committed to source control (Document 5, Part F).
- **Secure communication:** TLS terminated at the reverse proxy/ingress in front of the orchestrator in any non-local deployment; local Docker Compose development may run plain HTTP for simplicity, explicitly noted as a dev-only exception.
- **Job isolation:** consistent with Document 1's Non-Goals — job payloads are trusted, structured data, not arbitrary code, so sandboxing/container isolation per job is out of scope; job *type* handlers are the trust boundary (only registered, developer-authored job types can execute).

**STRIDE Threat Model**

| Threat | Asset | Attack | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| Spoofing | User identity | Stolen/guessed JWT | Unauthorized job submission/cancellation as another user | Medium | Short-lived tokens, TLS in transit, rate-limited login |
| Spoofing | Worker identity | Forged worker token | Attacker registers a fake worker, receives real job assignments, never executes them or exfiltrates payloads | Low-Medium | Worker credentials issued out-of-band, distinct from user tokens, scoped narrowly |
| Tampering | Job payload | Modify request body in transit | Job executes with attacker-modified data | Low (mitigated by TLS) | TLS, schema validation, no client-side trust of pre-signed payloads |
| Tampering | Firestore records | Direct DB write bypassing orchestrator (if credentials leaked) | Corrupted job/worker state | Low | Firestore security rules restrict writes to the orchestrator's service account only; no client-direct Firestore access |
| Repudiation | Admin actions | Admin denies performing a destructive action | Inability to investigate incidents | Medium | Audit log (FR-034) records actor + timestamp for every administrative action |
| Information Disclosure | Job payload/results | Developer queries another user's job | Exposure of another user's data | Medium | Ownership check on every job read (`403` if not owner/Admin) |
| Information Disclosure | Credentials | Verbose error messages leak stack traces/secrets | Aid to further attack | Low | Generic error responses in production; detailed errors only in dev-mode logs, never in API responses |
| Denial of Service | Job queue | Submission flooding | Queue congestion, legitimate jobs starved | Medium | Rate limiting per user, congestion backpressure (Document 2, Section 7) |
| Denial of Service | Worker pool | Fake heartbeats from a rogue "worker" claiming huge capacity | Real jobs assigned to a non-functional worker, silently lost until timeout | Low-Medium | Worker registration requires valid worker credential; anomalous capacity claims flaggable for Admin review |
| Elevation of Privilege | RBAC | Developer forges/modifies role claim in token | Developer gains Admin access | Low | Role embedded in server-signed JWT, verified server-side on every request, never trusted from client-supplied fields |

---

# Part F — Testing

### Unit Tests
- **Objective:** verify core algorithms in isolation, no Firestore/Redis required.
- **Test cases:** each scheduling strategy's worker selection given fixed job/worker fixtures; `hasCycle`/`topologicalOrder` against known cyclic and acyclic graphs; `computeBackoff` monotonicity and jitter bounds; `workerScore` ranking given controlled load scenarios; state-machine transition validity (reject illegal transitions).
- **Expected result:** deterministic pass/fail, no flakiness (no real time/network dependency — clocks and randomness injected/mocked).
- **Metrics:** line/branch coverage target ≥80% on `scheduler/`, `workflow/`, `retry/`, `failure-detector/` modules specifically (not a blanket repo-wide vanity number).

### Integration Tests
- **Objective:** verify module-to-infrastructure correctness.
- **Test cases:** Firestore transaction correctness under simulated concurrent writers (two processes racing to claim the same job); Redis Streams consumer-group delivery and `XACK`/redelivery behavior; Scheduler-to-Firestore round trip for a full assignment cycle; API-to-Firestore for job submission validation.
- **Expected result:** race-prone operations resolve to exactly one winner, verified via assertions on final document state.
- **Metrics:** zero double-assignments across N repeated concurrent-race trials (N ≥ 100 in CI).

### End-to-End Tests
- **Objective:** full job lifecycle through real (test-environment) components.
- **Test cases:** submit job → observe `SUCCEEDED` via API polling; submit workflow → observe correct ordering and final state; submit job configured to fail then succeed → observe retry + eventual success; cancel a running job → observe `CANCELLED`.
- **Expected result:** each scenario reaches its expected terminal state within a bounded time window in the test environment.

### Performance Tests
- **Objective:** validate NFR-001/002/004 under realistic load.
- **Test cases:** 1,000 jobs / 10 workers steady-state throughput; scheduling latency distribution under sustained submission.
- **Expected result:** P95 scheduling latency ≤ 2s (NFR-001).
- **Metrics:** jobs/sec, P95/P99 latency, recorded per run for trend comparison.

### Stress Tests
- **Objective:** find the breaking point beyond documented targets.
- **Test cases:** ramp job submission rate until queue congestion triggers (Document 2, Section 7); ramp worker count in Simulation Mode toward and past NFR-004's 100-worker target.
- **Expected result:** system degrades predictably (backpressure engages, `503`s returned) rather than crashing or silently dropping jobs.

### Chaos Tests
- **Objective:** validate the failure scenarios in Document 2, Section 16 actually hold in practice.
- **Test cases:** kill a worker container mid-job (`docker compose kill worker_2`) and verify reclaim; kill the scheduler/orchestrator process and verify the reconciliation sweep on restart; introduce artificial network delay (e.g., via `tc netem` or a proxy) between orchestrator and a worker and verify heartbeat-timeout behavior triggers correctly, not prematurely; simulate message loss on the Redis stream and verify redelivery via consumer-group PEL; restart the Redis container and verify AOF-persisted stream data survives.
- **Expected result:** no job is permanently lost or double-terminally-completed in any scenario; system recovers without manual intervention beyond restarting the killed component.

### Concurrency Tests
- **Objective:** directly exercise the four races named in Document 3, Part I.
- **Test cases:** fire two simultaneous scheduling attempts at the same `QUEUED` job; simulate a worker result arriving at the exact moment its owning worker is being reclaimed; fire two retry timers for the same `(jobId, attempt)`; complete two sibling DAG branches simultaneously and verify the downstream job is released exactly once.
- **Expected result:** exactly one outcome wins in each race; the losing operation is a safe no-op, never a corrupted or duplicated state.

### Security Tests
- **Objective:** validate Part E's controls.
- **Test cases:** unauthenticated request to every protected endpoint → `401`; Developer attempting to read/cancel another user's job → `403`; forged/tampered JWT role claim → rejected; SQL/NoSQL-injection-style payloads in job `payload` field → safely stored as inert data, never interpreted; brute-force login attempts → rate-limited.
- **Expected result:** no unauthorized action succeeds under any test case.

---

# Part G — Observability

- **Structured logs:** every job and worker state transition logged as a structured (JSON) log line with `timestamp`, `entityType`, `entityId`, `fromState`, `toState`, `actor`, `correlationId` (NFR-011) — `correlationId` ties together the chain of events for one job across submission, scheduling, execution, and completion, which is what makes debugging a specific job's history tractable.
- **Metrics** (NFR-012): `jobs_per_sec`, `queue_depth`, `p95_latency_ms`, `p99_latency_ms`, `worker_utilization_pct`, `failed_jobs_total`, `retry_count_total`, plus `recovery_time_ms` (time from worker-marked-`OFFLINE` to all its jobs being reassigned) and `scheduler_cycle_latency_ms`.
- **Tracing:** a `correlationId`-based lightweight trace (not a full OpenTelemetry deployment, which is disproportionate for this scope) — every log line and event for a given job/request carries the same ID, enabling manual or tooled reconstruction of a request's path across components; documented as upgradeable to full OpenTelemetry post-MVP.
- **Health checks:** `GET /health` (orchestrator liveness), `GET /health/ready` (readiness — checks Firestore and Redis connectivity before reporting ready), used by Docker Compose healthchecks and any future orchestration platform's probes.
- **Alerts:** threshold-based (e.g., queue depth exceeds congestion threshold for >60s, unhealthy-worker ratio exceeds 50%, P99 latency exceeds NFR-001's target) — for MVP scope, alerts surface as dashboard banner warnings rather than external paging (email/Slack integration documented as a future extension).

**Recommended dashboards:**
- **Operational Overview:** jobs/sec, queue depth, worker utilization, failed/retry counts — the Document 4 Part D Overview view *is* this dashboard.
- **Latency:** P95/P99 over time, scheduler cycle latency — the Monitoring view.
- **Fleet Health:** worker state distribution over time, recovery time trend — the Workers view plus a historical chart.

---
*End of Document 4. Proceed to Document 5 (Implementation, DevOps, Roadmap & Final Project Plan) on approval.*
