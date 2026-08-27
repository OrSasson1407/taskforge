# TaskForge — Product Requirements & System Requirements Specification

**Document 1 of 5 — Pre-Development Documentation Package**
**Project type:** Solo Software Engineering final project
**Timeline:** 4 months
**Stack (locked for this package):** Node.js + TypeScript (backend & frontend), React + TypeScript (dashboard), Firebase/Firestore (database), Redis Streams (queue/broker), Docker Compose (deployment)

---

## 1. Executive Summary

TaskForge is a distributed job orchestration platform. It accepts computational jobs from clients, places them into priority-aware queues, schedules them across a pool of distributed worker processes, tracks worker health via heartbeats, detects and recovers from failures, retries failed work with exponential backoff, resolves dependencies between jobs expressed as a DAG (directed acyclic graph), and exposes a real-time web dashboard for observability and control.

Unlike a CRUD task-list application, TaskForge's core value is in the orchestration logic itself: the scheduler, the failure detector, the retry engine, and the workflow (DAG) engine are original algorithmic components, not thin wrappers around external infrastructure. Redis Streams and Firestore are used as supporting infrastructure for durability and messaging, but job placement, worker selection, failure detection, and dependency resolution are implemented by TaskForge, not delegated to them.

The system additionally includes a **Simulation Mode**, which allows a user to generate large synthetic workloads (many jobs, many simulated workers) and inject controlled failure conditions — killing a percentage of workers, introducing network delay, spiking queue depth — in order to observe and demonstrate the system's fault-tolerance behavior without needing real infrastructure at that scale.

## 2. Problem Statement

Running a single computational job is trivial. Running many independent and interdependent jobs reliably, across multiple machines, while machines and networks are unreliable, is not.

**Why distributed job execution is difficult:**
- Work must be divided among multiple workers without two workers claiming the same job (double execution) or a job being silently dropped (lost execution).
- Workers can crash, hang, or become unreachable at any point during execution, and the system must distinguish "slow" from "dead" using only imperfect signals (heartbeats, timeouts).
- Jobs can depend on other jobs completing first; a job cannot be considered "ready" until its full dependency graph is satisfied, and partial failures in that graph must be handled without corrupting the rest of the workflow.
- Retries must not turn a real failure into an infinite loop, and must not be indistinguishable from duplicate execution of a job that actually succeeded but whose success acknowledgement was lost.
- The system must remain useful — not necessarily perfect — as failures accumulate, i.e., it must degrade gracefully rather than stop entirely.

**Why naive solutions fail:**
A single-process task runner (e.g., an in-memory queue with a for-loop) cannot survive a process crash, cannot scale beyond one machine's resources, and has no concept of a worker being "gone" versus "busy." A simple "insert job into a table, worker polls the table" design without careful locking produces race conditions where two workers pick up the same row, and without a heartbeat/lease mechanism there is no way to reclaim a job whose worker died silently.

**Why orchestration is required:**
An orchestration layer is needed to own the decisions that no single worker or client can make correctly on its own: which worker should run which job, when a worker should be presumed dead, when a job should be retried versus dead-lettered, and when a dependent job becomes eligible to run. Centralizing (but not single-point-of-failure-ing) these decisions is the core engineering problem TaskForge solves.

## 3. Product Vision

TaskForge aims to be a small but architecturally honest distributed job orchestration platform: a system that a platform engineer could recognize the shape of (compare: Celery, Temporal, Airflow, Kubernetes Jobs controller) implemented at a scope appropriate for a single developer to build, understand fully, and defend in four months. The long-term vision (beyond this project's scope) is a system that could be extended toward true multi-node horizontal scaling of the orchestrator itself, pluggable execution backends (containers, serverless functions), and a general-purpose workflow scripting layer — none of which are required for the MVP, but the architecture should not actively preclude them.

## 4. Goals

**Product goals**
- Provide a working system where a user can submit jobs and workflows, observe them execute across multiple workers in real time, and see the system recover automatically from injected failures.
- Make orchestration behavior (scheduling decisions, retries, failure detection) visible and explainable, not a black box — this is a demonstration project as much as a working product.

**Technical goals**
- Demonstrate correct handling of concurrency and race conditions in job/worker assignment.
- Demonstrate at least three distinct scheduling strategies with measurable trade-offs.
- Demonstrate a working DAG-based workflow engine with cycle detection and partial-failure handling.
- Demonstrate horizontal scalability of the worker pool (workers can be added/removed without changing job definitions or restarting the orchestrator).
- Demonstrate observability: structured logs, metrics, and a real-time dashboard reflecting true system state.

## 5. Non-Goals

TaskForge will **not**:
- Attempt to orchestrate the orchestrator itself across multiple nodes with automatic leader election (single orchestrator instance is acceptable for MVP; this is called out explicitly as a Future item).
- Provide a general-purpose sandboxed code execution environment; jobs are assumed to be trusted work units (e.g., shell commands or defined task types), not arbitrary untrusted user code requiring container-level isolation.
- Implement multi-tenant billing, quotas, or organization-level account hierarchies.
- Guarantee exactly-once execution semantics at the framework level (see Document 3, Part A) — it will guarantee at-least-once execution with idempotency support, which is the realistic and industry-standard target for a system of this scope.
- Replace or integrate with a real cloud provider's infrastructure (AWS Batch, GCP Cloud Tasks, etc.) — TaskForge is self-contained.
- Use AI/ML for scheduling or any core decision-making in the MVP; all scheduling and failure-handling logic is deterministic.

## 6. Target Users

- **System Administrator** — operates the cluster, monitors health, intervenes on failures, manages user accounts and permissions.
- **Developer** — submits jobs and workflows for computational work (e.g., batch data processing, report generation, simulations), monitors their own jobs.
- **DevOps Engineer** — deploys and scales the worker pool, configures retry/timeout policies, reviews performance and observability data.
- **Platform Engineer** — evaluates the orchestration engine itself (scheduling algorithm choice, fault-tolerance behavior) for suitability, using Simulation Mode.

## 7. User Personas

**Dana, the Developer.** Submits data-processing jobs several times a day, sometimes as multi-step workflows (fetch → transform → aggregate). Cares about being able to see why a job failed and whether it will retry automatically. Does not want to think about which worker ran it.

**Sam, the DevOps Engineer.** Responsible for the health of the worker fleet. Adds and removes workers as load changes. Wants heartbeat/health data and clear signals when a worker is degraded versus dead. Cares about the system self-healing without manual intervention when a single worker dies.

**Priya, the Platform Engineer / Evaluator.** In this project's context, this persona doubles as the course evaluator. Wants to run Simulation Mode with a large synthetic workload, kill a percentage of workers mid-run, and visually confirm the system detected the failure, redistributed the affected jobs, and recovered — without reading source code to verify it.

**Alex, the System Administrator.** Manages who can submit jobs, reviews audit logs after incidents, and is the actor who would investigate a dead-lettered job or a stuck workflow.

## 8. User Stories

- As a Developer, I want to submit a single job with a priority level, so that urgent work is scheduled ahead of routine work.
- As a Developer, I want to submit a workflow of dependent jobs (a DAG), so that steps run in the correct order automatically.
- As a Developer, I want to see a job's current state, attempt count, and error message, so that I understand why it failed without needing server access.
- As a Developer, I want to cancel a queued or running job, so that I can stop work that is no longer needed.
- As a Developer, I want failed jobs to retry automatically with backoff, so that transient errors don't require manual resubmission.
- As a DevOps Engineer, I want to register a new worker and have it start receiving jobs within seconds, so that I can scale capacity on demand.
- As a DevOps Engineer, I want to see worker CPU/memory/active-job-count in real time, so that I can tell which workers are overloaded.
- As a Platform Engineer, I want to run a simulation of thousands of jobs across dozens of simulated workers, so that I can evaluate scheduling behavior without provisioning real infrastructure.
- As a Platform Engineer, I want to kill a percentage of simulated workers mid-run, so that I can observe failure detection and recovery.
- As a System Administrator, I want an audit log of job submissions, cancellations, and worker changes, so that I can investigate incidents after the fact.
- As any authenticated user, I want role-appropriate access (my jobs vs. all jobs), so that the system is safe to use with more than one account.

## 9. Use Cases

Each use case below assumes the actor is authenticated unless stated otherwise.

### UC-1 Submit Job
- **Actor:** Developer
- **Preconditions:** User is authenticated; request includes job type, payload, and optional priority/timeout/dependency list.
- **Main flow:** User submits job via API/dashboard → system validates payload → job persisted in state `CREATED` → job transitions to `QUEUED` and is published to the queue → API returns job ID.
- **Alternative flows:** Job has unresolved dependencies → job enters `WAITING_FOR_DEPENDENCIES` instead of `QUEUED`.
- **Exceptions:** Invalid payload → `400` with validation errors, job not persisted. Queue unavailable → job persisted as `CREATED`, queued for retry-publish (system does not lose the job).
- **Postconditions:** Job exists with a stable ID and is discoverable via API/dashboard.

### UC-2 Schedule Job
- **Actor:** System (Scheduler)
- **Preconditions:** Job is in `QUEUED` state; at least one eligible worker exists.
- **Main flow:** Scheduler evaluates queued jobs per active strategy → selects a worker via worker-selection algorithm → job transitions to `SCHEDULED` then `ASSIGNED` → assignment dispatched to worker.
- **Alternative flows:** No eligible worker (capability/resource mismatch) → job remains `QUEUED`, re-evaluated on next scheduling cycle or worker-availability event.
- **Exceptions:** Selected worker rejects assignment (race with concurrent failure) → job returned to `QUEUED`, different worker selected.
- **Postconditions:** Job is either `ASSIGNED` to exactly one worker or remains `QUEUED`.

### UC-3 Execute Job
- **Actor:** Worker
- **Preconditions:** Job is `ASSIGNED` to this worker.
- **Main flow:** Worker acknowledges assignment → job transitions to `RUNNING` → worker executes → worker reports result → job transitions to `SUCCEEDED` or `FAILED`.
- **Alternative flows:** Worker does not acknowledge within timeout → orchestrator treats as assignment failure, re-queues job.
- **Exceptions:** Execution exceeds configured timeout → job transitions to `TIMED_OUT`, handled as a failure for retry purposes.
- **Postconditions:** Job reaches a terminal or retry-eligible state; result/error is recorded.

### UC-4 Retry Job
- **Actor:** System (Retry Manager)
- **Preconditions:** Job is `FAILED` or `TIMED_OUT`; attempt count is below max attempts; error is classified retryable.
- **Main flow:** Retry Manager computes backoff delay → job transitions to `RETRY_PENDING` → after delay, job transitions to `QUEUED` with incremented attempt count.
- **Alternative flows:** Error classified non-retryable → job goes directly to `DEAD_LETTER` regardless of attempt count.
- **Exceptions:** Attempt count reaches max → job transitions to `DEAD_LETTER`.
- **Postconditions:** Job is either re-queued or terminally dead-lettered.

### UC-5 Cancel Job
- **Actor:** Developer or System Administrator
- **Preconditions:** Job exists and is not already in a terminal state.
- **Main flow:** User requests cancellation → if job is `QUEUED`/`WAITING_FOR_DEPENDENCIES`/`SCHEDULED`, job transitions directly to `CANCELLED` → if job is `RUNNING`, cancellation signal sent to assigned worker, job transitions to `CANCELLED` on acknowledgement.
- **Alternative flows:** Worker does not acknowledge cancellation promptly → job marked `CANCELLED` at orchestrator level after grace period; worker's eventual result for that job is discarded.
- **Exceptions:** Job already terminal → request rejected with explanatory error.
- **Postconditions:** Job is `CANCELLED` and will not be retried; dependent jobs are handled per workflow cancellation rules (Document 3, Part F).

### UC-6 Register Worker
- **Actor:** Worker (process)
- **Preconditions:** Worker has valid credentials/token.
- **Main flow:** Worker sends registration request with capabilities and resource capacity → orchestrator validates and authenticates → worker persisted, state `STARTING` → `IDLE` → worker becomes eligible for scheduling.
- **Alternative flows:** Worker re-registers after a restart → orchestrator reconciles with prior worker ID if provided.
- **Exceptions:** Invalid credentials → registration rejected, worker does not appear in the pool.
- **Postconditions:** Worker is known to the orchestrator and receiving heartbeat checks.

### UC-7 Worker Heartbeat
- **Actor:** Worker (process)
- **Preconditions:** Worker is registered.
- **Main flow:** Worker sends heartbeat with current load/resource stats at a fixed interval → orchestrator updates last-seen timestamp and worker metrics.
- **Alternative flows:** Heartbeat carries updated resource numbers reflecting a newly busy/idle state → worker state updated accordingly.
- **Exceptions:** None at this step (absence of heartbeat is handled by UC-9).
- **Postconditions:** Orchestrator's view of worker health is current as of the heartbeat interval.

### UC-8 Worker Failure (Detection)
- **Actor:** System (Failure Detector)
- **Preconditions:** Worker has an active registration.
- **Main flow:** Worker misses heartbeats beyond the configured timeout → worker enters a suspicion window → if still unresponsive after suspicion period, worker transitions to `UNHEALTHY`/`OFFLINE` → jobs assigned to that worker are reclaimed and re-queued.
- **Alternative flows:** Worker sends a heartbeat during the suspicion window → suspicion cleared, worker remains active.
- **Exceptions:** Reclaimed job later receives a late result from the "dead" worker → result is discarded if the job has already been reassigned (see idempotency handling, Document 3 Part A).
- **Postconditions:** Worker marked unhealthy/offline; its in-flight jobs are not lost.

### UC-9 Worker Recovery
- **Actor:** Worker (process)
- **Preconditions:** Worker was previously `UNHEALTHY`/`OFFLINE`.
- **Main flow:** Worker sends a heartbeat or re-registers → orchestrator transitions worker back to `IDLE` → worker becomes eligible for new assignments.
- **Alternative flows:** Worker was fully restarted with a new identity → treated as a new worker registration (UC-6).
- **Exceptions:** None.
- **Postconditions:** Worker resumes participating in scheduling.

### UC-10 Submit Workflow
- **Actor:** Developer
- **Preconditions:** User is authenticated; request defines a set of jobs and their dependency edges.
- **Main flow:** User submits workflow definition → system validates DAG (no cycles, all references resolve) → jobs persisted, dependency-free jobs enter `QUEUED`, others enter `WAITING_FOR_DEPENDENCIES` → workflow ID returned.
- **Alternative flows:** None beyond validation branch below.
- **Exceptions:** Cycle detected → workflow rejected with the offending cycle identified. Reference to non-existent job → rejected with validation error.
- **Postconditions:** Workflow and its constituent jobs exist and are tracked as a unit.

### UC-11 Execute Workflow
- **Actor:** System
- **Preconditions:** Workflow has been accepted (UC-10).
- **Main flow:** As each job in the workflow succeeds, dependent jobs are re-evaluated → jobs whose dependencies are all satisfied transition from `WAITING_FOR_DEPENDENCIES` to `QUEUED` → process continues until all jobs reach a terminal state.
- **Alternative flows:** A job fails and is retried successfully → dependents proceed normally after eventual success.
- **Exceptions:** A job in the workflow reaches `DEAD_LETTER` → dependent jobs are held (not run) and the workflow is marked `FAILED`, per the configured partial-failure policy (see Document 3, Part F).
- **Postconditions:** Workflow reaches a terminal state (`SUCCEEDED`, `FAILED`, or `CANCELLED`).

### UC-12 Run Simulation
- **Actor:** Platform Engineer
- **Preconditions:** User has permission to run simulations.
- **Main flow:** User configures a simulation (job count, simulated worker count, failure scenario) → Simulation Engine generates synthetic jobs/workers within an isolated simulation context → results and metrics stream to the dashboard in real time → simulation reaches configured completion condition.
- **Alternative flows:** User injects a mid-run event (e.g., "kill 30% of workers") → Simulation Engine applies it immediately and the dashboard reflects the consequence.
- **Exceptions:** Simulation exceeds configured resource/time budget → simulation is halted with a partial-results report.
- **Postconditions:** Simulation run and its results are stored and viewable after completion.

### UC-13 Inspect Metrics
- **Actor:** Any authenticated user (scope depends on role)
- **Preconditions:** None beyond authentication.
- **Main flow:** User opens the Monitoring view → dashboard displays current and historical metrics (throughput, queue depth, latency percentiles, worker utilization).
- **Alternative flows:** User filters by time range or job type.
- **Exceptions:** No data yet for the selected range → dashboard shows an explicit empty state, not an error.
- **Postconditions:** None (read-only).

## 10. Functional Requirements

**Jobs**
- FR-001: The system shall allow an authenticated user to submit a job with a type, payload, optional priority, optional timeout, and optional list of dependency job IDs.
- FR-002: The system shall assign every submitted job a unique, immutable identifier.
- FR-003: The system shall track each job's state through a defined state machine (Document 2, Section 9) and expose the current state via API.
- FR-004: The system shall allow a user to cancel a job that has not yet reached a terminal state.
- FR-005: The system shall record every state transition of a job with a timestamp, retrievable as that job's event history.

**Queues**
- FR-006: The system shall place newly submitted, dependency-satisfied jobs into a queue ordered according to the active scheduling strategy.
- FR-007: The system shall support at least three distinct scheduling strategies (FIFO, Priority, Resource-Aware), selectable at deployment or runtime configuration.
- FR-008: The system shall prevent indefinite starvation of low-priority jobs under the Priority strategy (see Document 3, Part E).

**Workers**
- FR-009: The system shall allow a worker process to register itself with its capabilities and resource capacity.
- FR-010: The system shall require each registered worker to send periodic heartbeats, including current load.
- FR-011: The system shall mark a worker unhealthy if it misses heartbeats beyond a configured threshold, and shall reclaim any jobs assigned to it.
- FR-012: The system shall allow a worker to rejoin the pool after recovering from an unhealthy state without requiring a full system restart.

**Scheduling**
- FR-013: The system shall assign each queued, eligible job to exactly one worker at a time.
- FR-014: The system shall select a worker based on capability match and current load/resource availability, per the active scheduling strategy.
- FR-015: The system shall prevent two schedulers or two scheduling cycles from assigning the same job to two different workers concurrently (see Document 3, Part I).

**Dependencies / Workflows**
- FR-016: The system shall allow a user to submit a set of jobs with dependency edges forming a DAG.
- FR-017: The system shall reject a workflow submission containing a dependency cycle, and shall identify the cycle in the rejection response.
- FR-018: The system shall only make a job eligible for scheduling once all of its declared dependencies have reached `SUCCEEDED`.
- FR-019: The system shall apply a configurable partial-failure policy when a job within a workflow is dead-lettered (halt dependents by default).

**Retries / Failures**
- FR-020: The system shall automatically retry a failed job up to a configured maximum attempt count if the failure is classified retryable.
- FR-021: The system shall apply exponential backoff with jitter between retry attempts.
- FR-022: The system shall move a job to a dead-letter state after exhausting retries or upon a non-retryable failure.
- FR-023: The system shall enforce a per-job execution timeout, after which the job is treated as failed.

**Simulation**
- FR-024: The system shall allow a user to configure and launch a simulation with a specified number of synthetic jobs and simulated workers.
- FR-025: The system shall allow a user to inject a failure event into a running simulation (e.g., terminate a percentage of simulated workers).
- FR-026: The system shall isolate simulation data from real job/worker data.
- FR-027: The system shall stream simulation progress and outcomes to the dashboard in real time.

**Monitoring**
- FR-028: The system shall expose real-time counts of jobs by state and workers by state.
- FR-029: The system shall expose throughput, queue depth, and latency percentile metrics over a selectable time range.
- FR-030: The system shall provide a visual representation of workflow DAGs and their per-job execution status.

**Users / Security**
- FR-031: The system shall require authentication for all job, worker, and administrative operations.
- FR-032: The system shall enforce role-based access control distinguishing at minimum Administrator and Developer roles.
- FR-033: The system shall authenticate worker processes separately from human users, using worker-specific credentials.
- FR-034: The system shall record an audit log entry for job submission, job cancellation, worker registration, and administrative actions.

## 11. Non-Functional Requirements

**Performance**
- NFR-001: Under a workload of 1,000 concurrent queued jobs and 10 active workers, the scheduler shall assign a queued, eligible job to a worker within 2 seconds of the job becoming eligible, measured at the 95th percentile.
- NFR-002: The dashboard shall reflect a job state change on-screen within 1 second of the change occurring, via real-time push (not polling-only).

**Scalability**
- NFR-003: The architecture shall allow additional workers to join the cluster without requiring changes to existing job definitions, orchestrator restarts, or downtime.
- NFR-004: The system shall support at least 100 concurrently registered workers in Simulation Mode without the dashboard becoming unresponsive (defined as UI interaction latency remaining under 500ms).

**Availability / Reliability**
- NFR-005: The failure of any single worker shall not cause the loss of any job's data or history; the job shall be reclaimed and retried per FR-020.
- NFR-006: The orchestrator shall persist job and worker state such that a restart of the orchestrator process does not lose in-flight job records (jobs resume from their last persisted state).

**Security**
- NFR-007: All API endpoints except authentication endpoints shall require a valid token.
- NFR-008: Passwords, if used, shall never be stored or logged in plaintext.
- NFR-009: All inter-component communication credentials (worker tokens, API keys) shall be distinct from end-user credentials.

**Maintainability**
- NFR-010: Core orchestration logic (scheduling, failure detection, retry, DAG resolution) shall be implemented as isolated, independently testable modules, not embedded inline in API route handlers.

**Observability**
- NFR-011: The system shall emit structured (machine-parseable) logs for every job state transition and every worker state transition.
- NFR-012: The system shall expose Jobs/sec, Queue Depth, P95 latency, P99 latency, Worker Utilization, Failed Job count, and Retry count as queryable metrics.

**Usability**
- NFR-013: A new user shall be able to submit a job and observe it complete via the dashboard without consulting API documentation, using dashboard forms alone.

## 12. MVP Definition

**Must Have (MVP)**
- Job submission, state machine, cancellation (FR-001–005)
- Single scheduling strategy fully working end-to-end (Priority), with FIFO available as a comparison mode (FR-006–008)
- Worker registration, heartbeat, failure detection, reclaim (FR-009–012)
- Core scheduling with race-safe assignment (FR-013–015)
- DAG workflow submission, cycle detection, dependency-gated execution (FR-016–019)
- Automatic retry with exponential backoff and dead-lettering (FR-020–023)
- Real-time dashboard: Overview, Jobs, Job Details, Workers, Workflow DAG view (subset of Part D)
- Authentication + basic RBAC (Admin/Developer) (FR-031–033)
- Structured logging and the core metric set (NFR-011–012)

**Should Have**
- Resource-aware scheduling strategy as a third, comparable strategy
- Simulation Mode with configurable job/worker counts and one failure-injection scenario ("kill N% of workers")
- Audit log view in the dashboard
- Queue depth / throughput charts (Monitoring view)

**Could Have**
- Multiple simultaneous failure-injection types (network delay, workload spikes) in Simulation Mode
- Comparative scheduling-strategy benchmarking view
- Chaos-testing automation harness (Document 4, Part F) run against the live system, not just simulation

**Future (explicitly out of scope for this project)**
- Multi-node orchestrator with leader election
- Kubernetes-based deployment
- Pluggable/sandboxed execution backends
- AI/ML-assisted scheduling

This MVP scope is realistic for a solo developer over 4 months: it fully covers the distributed-systems engineering core (scheduling, failure detection, retries, DAG resolution, concurrency safety) while deferring breadth (more strategies, more UI polish, more simulation scenarios) to Should/Could tiers.

## 13. Constraints

- Single developer; no dedicated QA, design, or DevOps role — all work is done by one person across all disciplines.
- 4-month total timeline, including learning/setup time, implementation, testing, and documentation/demo preparation.
- Infrastructure limited to what can run locally via Docker Compose on a single development machine; no access to a real multi-node cluster or cloud budget.
- Firestore's lack of multi-document ACID transactions at arbitrary scale and its document-model (non-relational) structure constrain how job/dependency data can be modeled compared to a relational database — this is treated as a design constraint, not an oversight (addressed directly in Document 2).
- Simulation Mode substitutes for true large-scale multi-machine testing, which is not feasible within the available infrastructure.

## 14. Assumptions

- Jobs represent trusted, bounded units of work (e.g., predefined task types with validated payloads), not arbitrary untrusted code requiring sandboxing.
- A single orchestrator process is acceptable for the MVP; orchestrator high-availability (multi-instance) is not required to demonstrate the project's core engineering goals.
- Workers run as separate OS processes/containers and communicate with the orchestrator over the network, even in local Docker Compose development.
- Network partitions and message loss can be reasonably approximated in Simulation Mode without a full network-fault-injection framework.
- The evaluator/grader will assess the system primarily through the demonstrations defined in Document 5, Part H, plus the documentation package itself.

## 15. Risks

- **Scope creep** — the full feature list (13 use cases, 3+ scheduling strategies, full simulation mode, full dashboard) is large for one developer; mitigated by the strict Must/Should/Could/Future split in Section 12.
- **Firestore modeling risk** — job dependency graphs and atomic state transitions are naturally relational problems; modeling them correctly in a document database requires careful denormalization and transaction-batch usage, and is a genuine technical risk to correctness under concurrency (see Document 2, Section 11 and Document 3, Part I).
- **Concurrency correctness** — race conditions in job assignment and worker failure/recovery are easy to get subtly wrong; mitigated by explicit synchronization design (Document 3, Part I) and dedicated concurrency tests (Document 4, Part F).
- **Simulation realism** — a simulation cannot perfectly emulate real network/hardware failure modes; this is disclosed as a known limitation rather than presented as equivalent to production-scale testing.
- **Timeline risk** — 4 months solo is tight for the Should-Have tier; the phased plan (Document 5) treats Should/Could items as explicitly droppable without compromising the core demonstration.

## 16. Success Criteria

- All Must-Have MVP requirements (Section 12) are implemented and demonstrable.
- The system correctly recovers from a killed worker in Simulation Mode: affected jobs are reclaimed and re-run without manual intervention, observable on the dashboard.
- At least two scheduling strategies are implemented and their behavioral difference is demonstrable on the same workload.
- A DAG workflow with at least one branch-and-merge shape (e.g., A→B→D, A→C→D) executes correctly, including a scenario where one branch fails.
- The five documents in this package remain internally consistent with the delivered implementation (traceable via the Master Consistency Matrix in Document 5).

## 17. Acceptance Criteria

- **Job submission & lifecycle:** A submitted job is visible in the dashboard within 1 second, transitions through documented states, and its full event history is retrievable.
- **Worker failure handling:** Killing a worker mid-job results in that job being reclaimed and reassigned within the configured heartbeat-timeout + suspicion window, with no duplicate terminal state recorded for the job.
- **Retry behavior:** A job configured to fail its first N attempts and succeed on attempt N+1 reaches `SUCCEEDED`, with recorded backoff delays matching the configured policy.
- **Workflow execution:** A 4-job diamond DAG (A→B, A→C, B→D, C→D) executes D only after both B and C succeed, and never executes D if either is dead-lettered under the default partial-failure policy.
- **Simulation:** A simulation of at least 1,000 jobs across at least 10 simulated workers completes, and a "kill 30% of workers" event mid-run is visibly reflected in the dashboard's worker and job states within the UI's real-time refresh window (NFR-002).
- **Security:** An unauthenticated request to any protected endpoint is rejected with 401; a Developer-role user cannot access another user's job cancellation endpoint (403).

## 18. Glossary

- **Job** — a single unit of work submitted to TaskForge, with a defined type and payload.
- **Workflow** — a set of jobs connected by dependency edges, forming a DAG.
- **DAG** — Directed Acyclic Graph; used here to represent job dependencies with no circular references.
- **Worker** — a process capable of executing jobs, registered with the orchestrator.
- **Orchestrator** — the central TaskForge service responsible for scheduling, failure detection, and state management.
- **Scheduler** — the orchestrator subcomponent that decides which worker runs which job and when.
- **Heartbeat** — a periodic signal from a worker to the orchestrator indicating liveness and current load.
- **Dead-letter** — a terminal state for a job that has exhausted retries or failed non-retryably; requires manual inspection.
- **Backoff (exponential, with jitter)** — a retry delay strategy where each successive delay grows exponentially, with randomization to avoid synchronized retry storms.
- **Idempotency** — the property that executing an operation more than once has the same effect as executing it once; relevant to safe retries.
- **At-least-once delivery** — a messaging guarantee that a message (job assignment) will be delivered one or more times, never zero.
- **Simulation Mode** — an isolated mode of TaskForge that generates synthetic jobs/workers and injectable failure events for testing and demonstration without real infrastructure at scale.
- **RBAC** — Role-Based Access Control.
- **P95 / P99 latency** — the 95th/99th percentile of a latency distribution; a standard way to describe "how slow is it for the worst 5%/1% of cases."

---
*End of Document 1. Proceed to Document 2 (System Architecture & Software Design) on approval.*
