# TaskForge — Implementation, DevOps, Roadmap & Final Project Plan

**Document 5 of 5 — Pre-Development Documentation Package**

No source code is included in this document. It defines how the architecture approved in Documents 1–4 will be built.

---

# Part A — Technology Stack

### Backend

| Option | Verdict |
|---|---|
| Go | Excellent concurrency primitives, but a second language on top of the frontend, adding context-switching cost for a solo developer on a 4-month budget. |
| Java | Mature, verbose, heavier setup/boilerplate for a project this size; not chosen. |
| Python | Easy to write, but weaker native concurrency story for this workload shape (would lean on async frameworks fighting the language's threading model) and a second language vs. the frontend. |
| **Node.js + TypeScript (chosen)** | Same language as the React dashboard (one language across the whole system), fast to write, non-blocking I/O model is a natural fit for an orchestrator that is mostly coordinating I/O (Firestore/Redis/HTTP calls) rather than doing CPU-bound work itself, huge ecosystem for JWT/validation/testing libraries. |

**Why → How → Trade-off → Verification:** *Why:* development speed and language unification for a solo build. *How:* TypeScript for type safety across the shared job/worker/event type definitions (a `shared` package used by both orchestrator and dashboard, Part B). *Trade-off:* Node's single-threaded event loop means genuinely CPU-heavy orchestrator logic (e.g., resource-aware scoring across many workers, Document 3 Part J) must stay efficient or risk blocking the event loop — mitigated by the algorithm's O(n·m) bound staying well within budget at target scale (~100 workers). *Verification:* performance tests (Document 4, Part F) directly measure scheduler cycle latency under load.

### Messaging

| Option | Verdict |
|---|---|
| Kafka | Best long-term durability/partitioning story, but requires ZooKeeper/KRaft operational overhead disproportionate to a single-host student deployment. |
| RabbitMQ | Solid, free, but adds a second infrastructure paradigm (AMQP) alongside Firestore, with less natural fit for the "replay from a consumer group" semantics used in failure recovery. |
| **Redis Streams (chosen)** | Free, single lightweight container, consumer-group semantics give at-least-once delivery natively, and it can double as the metrics/cache layer if needed later — one fewer piece of infrastructure to operate solo. |

### Database

| Option | Verdict |
|---|---|
| **PostgreSQL** | The architecturally "cleaner" fit (relational integrity for job dependency graphs) — the brief's own default recommendation — but requires operating/hosting a database instance. |
| **Firebase/Firestore (chosen)** | Free tier, managed (zero ops), real-time listeners align with dashboard push requirements. Explicitly accepted trade-off: no native multi-document transactions or foreign keys, compensated by document-scoped transactions and application-level DAG validation (Document 2, Section 11; Document 3, Part A/I). |

This trade-off is restated here deliberately: Document 5 is the implementation plan, and any implementer picking this document up needs the Firestore constraint in view at build time, not just in the architecture document.

### Cache

Redis (the same instance used for Streams) doubles as an in-memory cache where useful (e.g., caching the current eligible-worker set between scheduling cycles) — introducing a separate cache technology (e.g., Memcached) would be unjustified for this scope.

### Frontend

**React + TypeScript (chosen)** — confirmed per Document 2. Alternatives (Vue, Svelte) were not seriously evaluated given no stated preference and React's ecosystem maturity for real-time dashboards (charting libraries, WebSocket hook patterns).

### Communication

REST + Redis Streams + WebSocket, per Document 2 Section 6 and Document 4 Part B — gRPC explicitly deferred (documented there) as a legitimate post-MVP optimization if the worker protocol's REST heartbeat path became a bottleneck beyond the ~100-worker MVP target.

### Deployment

**Docker Compose (chosen for MVP)** — Kubernetes discussed as a future migration path (Document 2, Section 12) but not implemented; Compose is sufficient for a single-host student deployment and keeps DevOps scope proportionate to a solo 4-month timeline.

**Summary rationale across all choices:** every selection above was optimized for *engineering depth in the parts of the system that are the actual subject of this project* (scheduling, failure detection, retries, DAG resolution — Document 1, Engineering Principle) while minimizing *operational overhead in the supporting infrastructure* (database, broker, deployment), which is exactly backwards from a naive "use the most impressive infrastructure" approach and consistent with the brief's explicit instruction not to select technologies merely because they are fashionable.

---

# Part B — Project Structure

```
taskforge/
  packages/
    shared/          # Shared TypeScript types: Job, Workflow, Worker, Event, API contracts
    orchestrator/     # Node/TS service: API Gateway, Scheduler, Workflow Manager,
                       # Failure Detector, Retry Manager, Worker Manager, Simulation Engine,
                       # Event Publisher, Auth Service
    worker/            # Node/TS worker process: registration, heartbeat, job execution,
                       # job-type handler registry
    dashboard/         # React/TS frontend
  infrastructure/
    docker-compose.yml
    redis/             # Redis config (AOF persistence settings)
    firestore-rules/   # Firestore security rules (Document 4, Part E)
  tests/
    unit/
    integration/
    e2e/
    chaos/
  docs/
    01_PRD_SRS.md ... 05_Implementation_DevOps_Roadmap.md   # this package
  .github/workflows/    # CI/CD pipelines (Part E)
```

**Responsibilities:**
- `shared` exists specifically so the orchestrator and dashboard cannot drift on the shape of a `Job`/`Worker`/`Event` — a single source of type truth, checked at compile time on both sides.
- `orchestrator` contains all business logic modules as independently importable, independently unit-testable units (Document 2, Section 5 responsibilities map directly onto subdirectories here), with the API layer as a thin adapter over them (Document 2, Section 3 separation-of-concerns principle).
- `worker` is deliberately a separate package (not a mode-flag on the orchestrator) so it can be built, versioned, and scaled (`docker compose up --scale worker=N`) independently.
- `tests/chaos` holds the Docker-Compose-level chaos scripts (Document 4, Part F) since they operate on containers, not just code.

---

# Part C — Development Phases

### Phase 0 — Architecture & Infrastructure
- **Goals:** repo scaffolding, Docker Compose skeleton (orchestrator, worker, redis, dashboard stubs), Firestore project provisioned, CI pipeline skeleton.
- **Deliverables:** all services boot and can reach each other (health checks pass); `shared` package with initial type definitions.
- **Dependencies:** none.
- **Tests:** `GET /health` passes in CI via Compose.
- **Exit criteria:** `docker compose up` brings up a working (empty) system.

### Phase 1 — Authentication & Core Job Model
- **Goals:** user auth (login/JWT), Job document model in Firestore, `POST/GET /jobs` (no scheduling yet — jobs just persist as `CREATED`/`QUEUED`).
- **Deliverables:** FR-001–005 (partial, minus retries/cancellation-in-flight), NFR-007–009.
- **Dependencies:** Phase 0.
- **Tests:** unit (validation), integration (Firestore writes), security (auth-required tests).
- **Exit criteria:** a job can be submitted and fetched; unauthenticated requests rejected.

### Phase 2 — Queue & Job Lifecycle
- **Goals:** full job state machine (Document 2, Section 9), cancellation, event history subcollection.
- **Deliverables:** FR-003–005, all job states reachable except worker-dependent ones.
- **Tests:** unit (state machine transition legality), integration.
- **Exit criteria:** UC-1 and UC-5 fully demonstrable without a real worker (manually driven transitions).

### Phase 3 — Workers
- **Goals:** worker registration, heartbeat (REST path), Worker Manager, worker state machine (Document 2, Section 10).
- **Deliverables:** FR-009–010, UC-6, UC-7.
- **Dependencies:** Phase 0 (worker package scaffolding).
- **Tests:** integration (registration/heartbeat round trip).
- **Exit criteria:** multiple worker containers register and appear `IDLE` on the (still-minimal) dashboard/API.

### Phase 4 — Scheduler
- **Goals:** FIFO strategy first (simplest, validates the assignment pipeline end-to-end), then Priority, then Resource-Aware (Document 3, Part B); worker selection scoring (Part C); Redis Streams assignment transport (Document 2, Section 7).
- **Deliverables:** FR-006–008, FR-013–015, UC-2, UC-3.
- **Dependencies:** Phases 2, 3.
- **Tests:** unit (all three strategies against fixtures), integration (Firestore transaction race tests), concurrency tests (Document 4 Part F).
- **Exit criteria:** a submitted job is picked up by a real worker container and reaches `SUCCEEDED`.

### Phase 5 — Retries & Fault Tolerance
- **Goals:** Failure Detector (Document 3, Part G), Retry Manager (Part H), reclaim logic, idempotency key handling (Part A/I).
- **Deliverables:** FR-011–012, FR-020–023, UC-4, UC-8, UC-9.
- **Dependencies:** Phase 4.
- **Tests:** chaos (kill worker mid-job), concurrency (the four named races).
- **Exit criteria:** killing a worker container mid-job results in automatic reassignment and eventual success, observable via `GET /jobs/{id}/events`.

### Phase 6 — Dependencies & Workflows
- **Goals:** Workflow Manager, DAG validation (cycle detection, topological sort), dependency-gated release, partial-failure policy.
- **Deliverables:** FR-016–019, UC-10, UC-11.
- **Dependencies:** Phase 5 (workflows rely on the full job lifecycle including retries).
- **Tests:** unit (cycle detection, topo sort), e2e (diamond DAG scenario from Document 1, Acceptance Criteria).
- **Exit criteria:** the A→B, A→C, B→D, C→D scenario executes correctly, including the failure-halts-dependents case.

### Phase 7 — Dashboard
- **Goals:** all views from Document 4, Part D; WebSocket event stream (Part C); Auth UI.
- **Deliverables:** NFR-002, NFR-013, FR-028–030.
- **Dependencies:** Phases 1–6 (dashboard is a consumer of everything built so far).
- **Tests:** manual UX pass against Document 1 Acceptance Criteria; e2e via UI where feasible.
- **Exit criteria:** a user can perform every Must-Have MVP use case through the UI alone, no direct API calls needed.

### Phase 8 — Simulation
- **Goals:** Simulation Engine (Document 3, Part K), simulation namespace isolation, "kill N% of workers" event injection, Simulation dashboard view.
- **Deliverables:** FR-024–027, UC-12.
- **Dependencies:** Phase 7 (simulation view needs the dashboard shell) and Phase 5/6 (simulation exercises real scheduler/failure-detector/workflow code).
- **Tests:** e2e (launch simulation, inject kill event, verify recovery visible).
- **Exit criteria:** Document 1's Success Criteria simulation scenario (1,000+ jobs, 10+ workers, 30% kill) runs and recovers correctly.

### Phase 9 — Observability
- **Goals:** structured logging, metrics endpoint, correlationId propagation, Monitoring dashboard view, health/readiness endpoints.
- **Deliverables:** NFR-011–012, FR-029, Document 4 Part G.
- **Dependencies:** Phase 8 (by now there's enough real activity to make metrics meaningful to build against).
- **Tests:** verify every state transition produces a log line and metric update.
- **Exit criteria:** Monitoring view shows accurate live jobs/sec, queue depth, P95/P99.

### Phase 10 — Security Hardening
- **Goals:** RBAC enforcement audit, rate limiting, STRIDE mitigations (Document 4, Part E) implemented and verified, audit log, worker-credential scoping review.
- **Deliverables:** FR-031–034, NFR-007–009, Document 4 Part E in full.
- **Dependencies:** all prior phases (hardening reviews the whole surface).
- **Tests:** full security test suite (Document 4, Part F).
- **Exit criteria:** every security test case passes; audit log view functional.

### Phase 11 — Performance & Chaos Testing
- **Goals:** run the performance experiments (Part G below) and chaos scenarios (Document 4, Part F) against the completed system; tune scoring weights/backoff constants based on observed results; prepare final demonstrations (Part H).
- **Deliverables:** documented performance results, chaos-test pass record.
- **Dependencies:** all prior phases.
- **Tests:** the full test pyramid, run together as a release gate.
- **Exit criteria:** all Document 1 Acceptance Criteria verified against the real running system; demonstrations (Part H) rehearsed successfully.

---

# Part D — MVP Plan

The MVP is exactly the Must-Have tier from Document 1, Section 12, reached at the end of **Phase 6** for backend functionality and **Phase 7** for it being usable end-to-end via the dashboard. This is intentionally not a trivial CRUD system: by the end of Phase 6 alone, the system already demonstrates race-safe distributed assignment, automatic failure recovery, and DAG-based dependency resolution — the three hardest and most distinctly "distributed systems" pieces of the project — before a single line of dashboard code is required. Should-Have items (Resource-Aware strategy comparison, Simulation Mode, Audit view, Queue charts) extend the MVP in Phases 4 (partially), 8, and 9–10, and are the first things cut if the 4-month timeline is at risk, per Document 1's risk mitigation (Section 15).

---

# Part E — CI/CD

- **Git strategy:** trunk-based development with short-lived feature branches (`feature/scheduler-priority-strategy`, etc.), given solo development — a heavier Gitflow model would add process overhead with no team to coordinate.
- **Branching:** `main` is always deployable (Compose config must build and pass health checks); every phase in Part C corresponds to one or more merged feature branches.
- **Pull requests:** used even solo, as a forcing function for the automated checks below to run before merge (self-review discipline).
- **Code review:** self-review checklist per PR (does this satisfy the FR/NFR/UC it claims to; does it have unit tests; does it update the relevant document if behavior diverges from Documents 1–4).
- **Automated tests:** unit + integration tests run on every PR; e2e and chaos tests run on merge to `main` (slower, container-dependent).
- **Static analysis:** TypeScript strict mode as a compile-time gate; ESLint for style/correctness lint rules; both block merge on failure.
- **Security scanning:** dependency vulnerability scanning (e.g., `npm audit` or equivalent in CI) on every PR; secrets-scanning pre-commit hook to prevent committing Firebase/Redis credentials.
- **Build:** TypeScript compilation for all packages; React production build for dashboard.
- **Docker:** each package (`orchestrator`, `worker`, `dashboard`) builds its own image via CI on merge to `main`, tagged with commit SHA.
- **Deployment:** `docker compose pull && docker compose up -d` against the tagged images for the local/demo environment; no automated production deployment pipeline needed at this project's scope (single-host demo deployment, run manually before evaluation).
- **Rollback:** re-tag and redeploy the previous known-good image set (`main`'s prior commit SHA) — sufficient given the single-host, non-production nature of the deployment target.

---

# Part F — DevOps

- **Docker Compose:** services as defined in Document 2, Section 12 (`orchestrator`, `dashboard`, `redis`, `worker` scaled via `--scale`); healthchecks defined for each using the `/health`/`/health/ready` endpoints (Document 4, Part G).
- **Environment configuration:** `.env` file (gitignored) for local dev, populated from a checked-in `.env.example`; production-like Compose runs read the same variables from the host environment or Docker secrets.
- **Secrets:** Firebase service-account JSON and Redis auth credentials mounted as Docker secrets (or environment variables for local dev only); never committed (enforced by the CI secrets-scanning hook, Part E).
- **Database migrations:** Firestore is schemaless at the storage level, so "migrations" here mean versioned changes to the application's expected document shape and to Firestore security rules/composite indexes — tracked as versioned files in `infrastructure/firestore-rules/` and applied via the Firebase CLI as part of deployment, not as ad hoc manual console changes.
- **Logging:** container stdout/stderr captured by Docker's logging driver for local/demo use; structured JSON format (Document 4, Part G) makes this greppable/parseable even without a log-aggregation platform, which is intentionally not introduced given project scope.
- **Monitoring:** the Monitoring dashboard view itself (Document 4, Part D/G) is the monitoring solution for this project's scope; introducing Prometheus/Grafana was considered and rejected as redundant with the purpose-built dashboard that is already a required deliverable.
- **Local development:** `docker compose up` plus optionally running the dashboard's dev server (`vite`/similar) outside Compose for hot-reload during active frontend work, pointed at the Composed orchestrator.

**Future Kubernetes note:** as established in Document 2, Section 12, a migration path exists (each Compose service → Deployment, worker → HPA-scaled Deployment) but is explicitly not built for this project.

---

# Part G — Performance Plan

### Experiment 1 — 1,000 jobs / 10 workers
Baseline correctness-under-load run. Measures: throughput, latency, queue depth over the run, CPU/memory of orchestrator and workers, worker utilization, scheduler cycle latency. Validates NFR-001 at a comfortable scale.

### Experiment 2 — 10,000 jobs / 50 workers
Mid-scale run, primarily via Simulation Mode (Document 3, Part K) given real-worker provisioning limits on a single dev machine. Same metric set; watches specifically for scheduler cycle latency growth trend as worker count scales (Document 3, Part J analysis).

### Experiment 3 — 100,000 jobs / 100 workers
Upper-bound simulation run, exercising NFR-004's target directly. Primary goal is demonstrating the system degrades predictably (backpressure, Document 2 Section 7) rather than measuring a specific latency target at this scale, since this exceeds the NFR-001 guarantee's stated scope (1,000 jobs / 10 workers).

Each experiment's results (throughput, latency percentiles, queue depth over time, CPU/memory, worker utilization, scheduler performance) are recorded and compared across the three runs to produce the scaling-behavior narrative referenced in Document 3, Part J and used in the final Architecture Review (below).

---

# Part H — Failure Demonstrations

For the final evaluation, the following are performed live against the running system:

1. **Submit 10,000 jobs** — via Simulation Mode; observe queue depth rise and drain on the dashboard.
2. **Scale workers from 5 to 20** — `docker compose up --scale worker=20`; observe the Scheduler immediately begin utilizing new capacity without restart (demonstrates NFR-003).
3. **Kill a worker during execution** — `docker compose kill worker_3`; observe `WORKER_FAILED` event, job reclaim, and reassignment on the dashboard within the heartbeat-timeout + suspicion window.
4. **Demonstrate automatic retry** — submit a job configured (via a test job type) to fail its first two attempts; observe `RETRY_PENDING` with growing backoff, then eventual `SUCCEEDED`.
5. **Execute a dependency DAG** — submit the diamond A→B, A→C, B→D, C→D workflow; observe correct ordering on the Workflow view.
6. **Compare scheduling algorithms** — run the same synthetic workload under FIFO, Priority, and Resource-Aware in Simulation Mode; compare resulting latency/utilization metrics side by side.
7. **Kill multiple workers** — Simulation Mode "kill 30% of workers" event; observe system continuing to make progress with remaining capacity.
8. **Run a 100,000-job simulation** — Experiment 3 above, live.
9. **Demonstrate recovery** — combine 7 and 8: kill workers mid-large-simulation, observe `recovery_time_ms` metric and dashboard confirmation that all reclaimed jobs eventually reach a terminal state.

**What the evaluator should observe in each:** not just a final "it worked" state, but the *live transitions* on the dashboard — state badges changing, event timelines populating, metrics moving — since the documentation's explicit goal (Document 1, Section 16) is that orchestration behavior be visible and explainable, not a black box.

---

# Part I — Final Project Evaluation

**Evaluation matrix (suggested weighting for a generic Software Engineering final-project rubric):**

| Category | Weight | What is assessed |
|---|---|---|
| Functional correctness | 20% | Must-Have MVP use cases work as specified; Document 1 Acceptance Criteria pass |
| Architecture quality | 15% | Component separation, documented trade-offs actually reflected in the implementation |
| Algorithmic / distributed-systems depth | 20% | Scheduling strategies, DAG engine, failure detection, retry engine implemented correctly and non-trivially (Document 3 in full) |
| Fault tolerance | 15% | Chaos-test scenarios (Document 4, Part F) pass; Failure Demonstrations (Part H) succeed live |
| Performance | 5% | Experiments 1–3 (Part G) produce sensible, explainable results |
| Security | 5% | STRIDE mitigations (Document 4, Part E) implemented; security tests pass |
| Testing | 5% | Test pyramid present and meaningful (not just high coverage of trivial code) |
| Documentation | 5% | This 5-document package remains consistent with the delivered system (Master Consistency Matrix, below) |
| UI/UX | 5% | Dashboard supports every Must-Have use case without requiring direct API calls (NFR-013) |
| Code quality | 5% | Module boundaries match Document 2's component responsibilities; TypeScript strict mode clean |

---

# Part J — Risks (Final Risk Register)

| Risk | Probability | Impact | Severity | Mitigation | Contingency |
|---|---|---|---|---|---|
| Scope creep | High | Medium | High | Strict Must/Should/Could/Future split (Document 1 §12, Document 5 Part D) | Cut Should/Could items; MVP alone is a complete, demonstrable project |
| Distributed consistency bugs (Firestore's lack of multi-doc transactions) | Medium | High | High | Document 2 §11/§15 design, document-scoped transactions everywhere a race exists | Add a reconciliation sweep (already planned, Document 2 §16) as a safety net; expand concurrency test coverage if bugs surface |
| Race conditions in scheduling/failure handling | Medium | High | High | Document 3 Part I's four explicit race designs; dedicated concurrency tests | Add targeted regression tests immediately on any race bug found; do not ship Phase 4/5 without concurrency tests green |
| Scheduler bottleneck at higher worker counts | Low (given NFR-004's ~100-worker target) | Medium | Medium | O(n·m) analyzed and bounded for target scale (Document 3 Part J) | Documented optimization path (top-K scoring) if Experiment 2/3 reveal a problem |
| Database bottleneck (Firestore write contention on hot documents) | Low-Medium | Medium | Medium | Event history in a subcollection, not the parent doc (Document 2 §11), to avoid hot-document contention | Add sharding/counter patterns for any hot aggregate document discovered under load |
| Message loss (Redis) | Low | Medium | Medium | Consumer groups + `XACK` + AOF persistence (Document 2 §15) | Chaos test explicitly covers this (Document 4 Part F); redelivery via PEL is the recovery path |
| Worker failures | Expected/by design | Low (system designed to tolerate this) | Low | This is a core demonstrated capability, not really a "risk" | N/A — treated as a feature to prove, not a failure mode to avoid |
| Performance at 100k-job simulation scale | Medium | Low (Experiment 3 is exploratory, not a hard NFR target) | Low | Framed explicitly as "observe graceful degradation," not a pass/fail latency target | Report results honestly even if degradation is significant; this is itself a valid engineering finding |
| Security gaps | Medium | Medium | Medium | STRIDE model (Document 4 Part E) drives Phase 10 explicitly | Security test suite as a release gate before final demo |
| Development complexity (solo, 4 months, learning curve on Firestore transactions / Redis Streams) | Medium | High | High | Phased plan front-loads the highest-risk unknowns (Scheduler/Failure Detector in Phases 4–5, before UI polish) | If behind schedule by Phase 6, cut Should-Have Simulation/Resource-Aware scope, not the core MVP phases |

---

# Part K — Final Implementation Checklist

- [ ] Requirements: all Must-Have FR/NFR items (Document 1 §12) implemented and traced (see Matrix below)
- [ ] Architecture: implementation matches Document 2's component boundaries; no orchestration logic leaked into the dashboard
- [ ] Backend: all orchestrator modules (Scheduler, Workflow Manager, Failure Detector, Retry Manager, Worker Manager, Simulation Engine, Event Publisher, Auth Service) implemented
- [ ] Frontend: all Document 4 Part D views implemented and functional against the real API
- [ ] Workers: worker package registers, heartbeats, executes, and reports results correctly
- [ ] Scheduler: all three strategies implemented, selectable, and comparable
- [ ] Database: Firestore schema (Document 2 §11) implemented with correct composite indexes and security rules
- [ ] Messaging: Redis Streams assignment/result/heartbeat channels functioning with AOF persistence enabled
- [ ] Security: RBAC, worker-credential scoping, rate limiting, all STRIDE mitigations (Document 4 Part E) implemented
- [ ] Testing: unit, integration, e2e, performance, stress, chaos, concurrency, and security test suites all passing
- [ ] Simulation: job/worker generation, isolated namespace, kill-worker event injection functioning
- [ ] Monitoring: structured logs, metrics endpoint, correlationId propagation, Monitoring dashboard view accurate
- [ ] Documentation: this 5-document package updated to match any implementation deviations, Master Consistency Matrix verified
- [ ] Deployment: `docker compose up` brings up the full working system from a clean clone
- [ ] Demonstration: all 9 Failure Demonstrations (Part H) rehearsed and reliably reproducible

---

# Master Consistency Matrix

| Requirement | Component | API | Database Entity | Algorithm | Test | Document Ref |
|---|---|---|---|---|---|---|
| FR-001 Submit job | API Gateway, Job model | `POST /jobs` | `jobs/{id}` | — | Unit (validation), E2E | D1 §10, D2 §5/11, D4 Part A/F |
| FR-003 Job state tracking | Scheduler, Retry Mgr, Workflow Mgr | `GET /jobs/{id}` | `jobs/{id}.state` | State machine | Unit (transitions), Integration | D1 §10, D2 §9, D4 Part A/F |
| FR-005 Event history | API Gateway | `GET /jobs/{id}/events` | `jobs/{id}/events/{eid}` | — | Integration | D1 §10, D2 §11, D4 Part A |
| FR-006/007/008 Queue & strategies | Scheduler | `GET /queues/status` | `jobs` (indexed) | FIFO/Priority/Resource-Aware (D3 Part B) | Unit (per strategy), Performance | D1 §10, D2 §7, D3 Part B/E, D4 Part A/F |
| FR-009/010 Worker registration & heartbeat | Worker Manager | `POST /workers/register`, `POST /workers/{id}/heartbeat` | `workers/{id}` | — | Integration | D1 §10, D2 §5/8, D4 Part A/B |
| FR-011/012 Failure detection & recovery | Failure Detector | (event-driven, no direct endpoint) | `workers/{id}.state`, `jobs` (reclaim query) | Heartbeat sweep (D3 Part G) | Chaos, Concurrency | D1 §10, D2 §5/10, D3 Part G/I, D4 Part F |
| FR-013–015 Race-safe assignment | Scheduler | (internal) | `jobs/{id}` (transaction) | Worker selection (D3 Part C), transaction logic (D3 Part I) | Concurrency, Integration | D1 §10, D2 §11/15, D3 Part C/I, D4 Part F |
| FR-016–019 Workflows/DAG | Workflow Manager | `POST /workflows`, `GET /workflows/{id}` | `workflows/{id}`, `jobs/{id}.dependsOn` | Cycle detection, topo sort (D3 Part F) | Unit, E2E | D1 §10, D2 §5/11, D3 Part F, D4 Part A/F |
| FR-020–023 Retry & dead-letter | Retry Manager | (event-driven) | `jobs/{id}.attempt` | Exponential backoff w/ jitter (D3 Part H) | Unit, E2E | D1 §10, D2 §5/9, D3 Part H, D4 Part F |
| FR-024–027 Simulation | Simulation Engine | `POST /simulations`, `POST /simulations/{id}/events` | `simulations/{id}/...` (isolated) | Real Scheduler/FD/RM over synthetic data (D3 Part K) | E2E | D1 §10, D2 §5/11, D3 Part K, D4 Part A/D |
| FR-028–030 Monitoring | Event Publisher, API Gateway | `GET /metrics`, WebSocket events | (derived/aggregated) | — | Manual/E2E | D1 §10, D2 §5, D4 Part C/D/G |
| FR-031–034 Auth/RBAC/Audit | Auth Service, API Gateway | `POST /auth/login`, `GET /audit` | `users/{id}`, `auditLog/{id}` | JWT verification | Security | D1 §10, D2 §5/11, D4 Part A/E/F |
| NFR-001 Scheduling latency | Scheduler | — | — | Resource-Aware scoring (D3 Part C) | Performance | D1 §11, D3 Part B/J, D4 Part F/G, D5 Part G |
| NFR-003 Horizontal worker scaling | Worker Manager, Scheduler | — | `workers` (collection, unbounded) | — | Manual (Demo 2, D5 Part H) | D1 §11, D2 §3/8, D5 Part H |
| NFR-011/012 Observability | Event Publisher (logs), Metrics endpoint | `GET /metrics` | — | — | Manual verification | D1 §11, D4 Part G |

*(This matrix covers the representative/highest-risk requirements; the full requirement set in Document 1 §10–11 maps analogously through the same components — the pattern established above is exhaustive enough for an implementer to extend to any remaining FR/NFR.)*

---

# Architecture Review

## Strengths
- Orchestration logic (scheduling, failure detection, retries, DAG resolution) is genuinely implemented by TaskForge, not delegated to infrastructure — satisfying the project's core Engineering Principle (Document 1).
- Every race condition identified is resolved by a single consistent mechanism (document-scoped optimistic transactions), which is both simple to reason about and directly testable.
- Simulation Mode exercises real production code paths rather than a mocked demonstration, making it credible evidence rather than a canned animation.
- The technology choices are consistently justified by "solo developer, 4 months" constraints rather than by novelty, which is unusual rigor for a student project's tech-stack rationale.

## Weaknesses
- Firestore's lack of native multi-document transactions pushes real integrity work into the application layer (Workflow Manager's DAG validation, event-driven aggregate state) — this is more code to get right than a relational schema would require, and is the single biggest source of implementation risk in the whole package.
- Single-orchestrator design is a known, accepted single point of failure — appropriate for MVP scope but worth stating plainly rather than only in a "Non-Goals" section.
- REST-based heartbeat (chosen for MVP simplicity) will not scale gracefully much past the ~100-worker target without the documented Redis-based heartbeat alternative.

## Technical Risks
- Concurrency bugs in the scheduling/reclaim/retry paths are the highest-risk area technically, precisely because they are the hardest to catch without dedicated concurrency testing — mitigated but not eliminated by the Part I test plan.
- Firestore transaction contention under Experiment 2/3 scale is untested territory until Phase 11; if it underperforms, the mitigation path (Document 3 Part J) requires design changes, not just tuning.

## Scalability Risks
- The O(n·m) resource-aware scheduling cost and the O(w) failure-detector sweep both scale linearly with the dimension least controlled by TaskForge itself (external load) — acceptable at the documented ~100-worker target, explicitly not validated beyond it (Document 3 Part J is honest about this boundary).

## Complexity Risks
- Three scheduling strategies, a full DAG engine, a retry engine, and a simulation engine mirroring production code paths is a substantial surface for one developer in four months — the phased plan (Part C) is the primary complexity-risk mitigation, by sequencing the hardest, most valuable pieces first and treating later phases as droppable.

## Areas to Simplify (if timeline pressure emerges)
- Drop the Resource-Aware strategy's optional "estimated job duration" signal (Document 3 Part C) — it's explicitly designed to degrade gracefully without it.
- Reduce Simulation Mode to a single failure-injection type ("kill N% of workers") rather than the full Should-Have set (network delay, workload spikes) — already reflected as the MVP-adjacent Should-Have baseline in Document 1 §12.
- Defer the Audit dashboard view (keep the underlying audit log data model, since FR-034 is cheap to satisfy at the data layer; only the UI is droppable).

## Areas Requiring Further Research
- Firestore transaction throughput/contention behavior under the concurrent-write patterns TaskForge requires, specifically at Experiment 2/3 scale — should be spiked early (Phase 4–5) rather than discovered late.
- Redis Streams consumer-group behavior under simulated network partition, to confirm the chaos-test assumptions in Document 4 Part F hold as designed.

## Recommended Final Architecture

The architecture as specified across Documents 2–4 is recommended as-is, with two explicit acknowledgments carried forward into implementation: (1) the Firestore consistency-compensation code (Document 2 §11, Document 3 Part I) is the highest-priority area for early spiking and thorough testing, not something to leave until Phase 10; and (2) the single-orchestrator design, while correctly scoped as a Non-Goal exclusion for this project, should be called out explicitly in the final project defense/demo as a deliberate, reasoned scope boundary — not an oversight — using the trade-off analysis already documented in Document 2, Section 15.

---
*End of Document 5. This concludes the TaskForge Pre-Development Documentation Package (Documents 1–5).*
