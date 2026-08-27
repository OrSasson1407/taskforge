# TaskForge — Distributed Engine, Scheduling & Algorithms Design

**Document 3 of 5 — Pre-Development Documentation Package**

---

# Part A — Distributed System Foundations

**Distributed coordination & concurrency:** TaskForge's orchestrator is a single process (Document 2, Section 15), which removes orchestrator-to-orchestrator coordination as a concern for MVP. Coordination that remains: multiple *async operations within* the orchestrator (concurrent scheduling cycles, concurrent heartbeat processing, concurrent API requests) can race over the same job or worker document. This is handled with Firestore document-scoped transactions (optimistic concurrency: read a document's version, write conditionally on it being unchanged) rather than distributed locks, because the contended resource is always a single document.

**Race conditions in scope:** two scheduling passes assigning the same job; a worker's late result arriving after the job was already reassigned; two retry timers firing for the same job; two dependency-completion events updating the same workflow concurrently. Each is addressed specifically in Part I.

**Consistency vs. availability (CAP):** Firestore is a strongly-consistent document store for single-document operations (which covers all of TaskForge's race-sensitive transitions, since they are scoped to one job or one worker document at a time per Document 2 Section 11). Across documents (e.g., a workflow and its many jobs), TaskForge accepts **eventual consistency**: a workflow's aggregate state is derived by the Workflow Manager reacting to individual job events, not by a single atomic multi-document write. This is a deliberate CP-per-document / eventually-consistent-in-aggregate design, appropriate because no correctness property of TaskForge depends on the workflow's aggregate view being instantaneously consistent — only on each individual job's state transitions being race-safe.

**Failure detection, worker ownership, job ownership:** a worker "owns" a job by virtue of `job.assignedWorkerId` and `job.state ∈ {ASSIGNED, RUNNING}`. Ownership is revoked unilaterally by the Failure Detector when a worker is presumed dead (Part G) — the worker is never asked for permission, because a worker that cannot be reached also cannot be asked. This means TaskForge must tolerate the previously-owning worker eventually coming back and reporting a result for a job it no longer owns (see idempotency, below).

**Duplicate execution & idempotency:** because job reassignment happens based on a *timeout*, not a confirmed kill, it is possible (though not common) that the original worker was merely slow — not dead — and both the original and the reassigned worker execute the same job. TaskForge does not prevent this at the network level (that would require distributed consensus disproportionate to this project's scope); instead it makes the consequence safe: every result message carries `(jobId, attempt)`, and the orchestrator only accepts a result for the `(jobId, attempt)` pair matching the job's *current* attempt number and current `assignedWorkerId`. A late/duplicate result is logged and discarded, not applied. This pushes the actual idempotency requirement outward: **job handlers themselves should be idempotent where possible** (documented as a job-authoring guideline, not enforced by the framework, consistent with Document 1 Non-Goals).

**Delivery semantics — analysis:**
- *At-most-once:* would mean a job might never run if a message is lost. Rejected — violates the basic premise of a job orchestrator.
- *Exactly-once:* would require distributed transactions or consensus (e.g., two-phase commit between Redis delivery and Firestore state) spanning the assignment-delivery and execution-acknowledgement boundary — disproportionate complexity for this project and, per the well-established distributed-systems result, not achievable as a pure delivery guarantee without idempotency support at the application layer anyway.
- *At-least-once (chosen):* Redis Streams consumer groups + `XACK` naturally provide this — an unacknowledged message is redelivered. Combined with the idempotency key above, TaskForge achieves what is sometimes called "effectively-once" processing: delivery may duplicate, but effect does not (as long as job handlers respect the idempotency contract).

**Recovery:** covered by Document 2 Section 16 (reconciliation sweep on orchestrator restart) and Part G below (heartbeat-based worker recovery).

---

# Part B — Scheduler

## Strategy 1: FIFO

- **Problem solved:** simplest possible fair ordering; useful as a baseline for comparison.
- **Inputs:** the set of `QUEUED`, dependency-satisfied jobs.
- **Outputs:** one job selected per scheduling cycle per available worker.
- **Data structures:** a min-heap (or simply Firestore query ordered `by createdAt asc`) keyed by `createdAt`.
- **Algorithm:** repeatedly pop the oldest queued job and assign it to any capability-eligible free worker.
- **Pseudocode:**
```
function scheduleFIFO(queuedJobs, workers):
    queuedJobs.sortBy(createdAt ascending)
    for job in queuedJobs:
        eligible = workers.filter(w => w.state == IDLE and w.capabilities.includes(job.type))
        if eligible.isEmpty(): continue
        worker = eligible[0]
        assign(job, worker)
```
- **Complexity:** O(n log n) for the sort per cycle (n = queued jobs); O(1) amortized per assignment given a pre-filtered eligible list.
- **Advantages:** simple, predictable, no starvation by definition (strict arrival order).
- **Disadvantages:** ignores urgency entirely — a critical job submitted after a large batch of routine jobs waits behind all of them; ignores worker load distribution beyond "idle or not."
- **Failure cases:** under sustained high submission rate, average wait time grows unbounded for all jobs equally — no way to express "this matters more."

## Strategy 2: Priority Scheduling

- **Problem solved:** allows urgent work to jump the queue.
- **Inputs:** queued jobs, each with a `priority` (integer, higher = more urgent).
- **Outputs:** assignment order favoring higher priority, subject to starvation prevention (Part E).
- **Data structures:** a priority queue (binary heap) keyed by `(priority desc, agingBoostedScore desc, createdAt asc)`.
- **Algorithm:** compute an effective score per job combining declared priority and wait time (aging, Part E), then select highest score first among capability-eligible idle workers.
- **Pseudocode:**
```
function schedulePriority(queuedJobs, workers, now):
    for job in queuedJobs:
        job.score = job.priority + agingBoost(job, now)   // see Part E
    queuedJobs.sortBy(score descending)
    for job in queuedJobs:
        eligible = workers.filter(w => w.state == IDLE and w.capabilities.includes(job.type))
        if eligible.isEmpty(): continue
        worker = eligible[0]
        assign(job, worker)
```
- **Complexity:** O(n log n) per cycle for sorting/heap maintenance.
- **Advantages:** urgent work is served first; aging (Part E) bounds worst-case wait for low-priority jobs.
- **Disadvantages:** requires tuning the aging function; a burst of high-priority submissions can still meaningfully delay low-priority work during that burst.
- **Failure cases:** if priority is set carelessly by all clients as "high," the strategy degenerates toward FIFO — a known real-world failure mode, mitigated operationally (documentation/guidance) rather than algorithmically.

## Strategy 3: Resource-Aware Dynamic Scheduling

- **Problem solved:** priority alone ignores whether a worker actually has the capacity to run a job well; this strategy factors in current worker load, not just idle/busy.
- **Inputs:** queued jobs (with priority/score from Strategy 2), workers with `currentLoad` (active job count, CPU/memory) and `resourceCapacity`.
- **Outputs:** assignment to the *best-scoring* eligible worker, not just the first idle one.
- **Data structures:** priority queue for jobs (as above); a worker-scoring function (Part C) evaluated per candidate.
- **Algorithm:** for each job in priority order, score all capability-eligible workers by available headroom and current load, pick the highest-scoring worker (which may be "busy but has headroom" for multi-job-capable workers, not only strictly idle ones).
- **Pseudocode:**
```
function scheduleResourceAware(queuedJobs, workers, now):
    for job in queuedJobs:
        job.score = job.priority + agingBoost(job, now)
    queuedJobs.sortBy(score descending)
    for job in queuedJobs:
        eligible = workers.filter(w => w.capabilities.includes(job.type)
                                        and hasHeadroom(w, job))
        if eligible.isEmpty(): continue
        best = argmax(eligible, w => workerScore(w, job))   // Part C
        assign(job, best)
```
- **Complexity:** O(n · m) worst case per cycle (n = queued jobs, m = eligible workers per job), acceptable at the target scale (Part J).
- **Advantages:** better overall utilization; avoids piling jobs on one worker while another sits idle with matching capability; most realistic of the three.
- **Disadvantages:** more complex, more to test, scoring function requires tuning; O(n·m) is worse than Priority's O(n log n) at very large worker counts.
- **Failure cases:** a poorly tuned scoring function can oscillate assignments (thrashing) if load data is stale between heartbeats — mitigated by only re-scoring on each discrete scheduling cycle, not continuously.

## Comparison & Default Selection

| | FIFO | Priority | Resource-Aware |
|---|---|---|---|
| Fairness | Perfect (arrival order) | Good (with aging) | Good (with aging) |
| Urgency handling | None | Strong | Strong |
| Load balancing | None | None (idle-only) | Strong |
| Complexity | Lowest | Medium | Highest |
| Best for | Baseline/demo comparison | Simple prioritized workloads | Heterogeneous, multi-job-capable worker fleets |

**Default strategy: Resource-Aware Dynamic Scheduling**, because it is a strict superset of Priority's urgency handling plus load-awareness, and load-awareness is the property most worth demonstrating for a distributed-systems final project (Document 1, Goals). FIFO and Priority remain available as configurable alternatives specifically so their behavioral differences can be demonstrated side-by-side (Document 1, Success Criteria), which is also why all three are designed against the same `SchedulingStrategy` interface (Document 2, Section 14 class diagram).

---

# Part C — Worker Selection

**Scoring inputs:** CPU headroom, memory headroom, current active-job count vs. declared capacity, capability match (binary gate, not scored), estimated job duration (if the job type has historical average duration data; optional signal, degrades gracefully to unweighted if absent), and worker health (only `IDLE`/healthy-`BUSY` workers are candidates at all — `UNHEALTHY` is never a candidate).

**Pseudocode:**
```
function workerScore(worker, job):
    if not worker.capabilities.includes(job.type):
        return -infinity
    if worker.state not in [IDLE, BUSY_WITH_HEADROOM]:
        return -infinity

    cpuHeadroom = (worker.capacity.cpu - worker.currentLoad.cpu) / worker.capacity.cpu
    memHeadroom = (worker.capacity.memoryMb - worker.currentLoad.memoryMb) / worker.capacity.memoryMb
    slotHeadroom = 1 - (worker.currentLoad.activeJobs / worker.capacity.maxConcurrentJobs)

    score = (W_CPU * cpuHeadroom) + (W_MEM * memHeadroom) + (W_SLOT * slotHeadroom)
    return score

function hasHeadroom(worker, job):
    return worker.currentLoad.activeJobs < worker.capacity.maxConcurrentJobs
```
Default weights `W_CPU = W_MEM = W_SLOT = 1/3`, configurable — documented as a tunable, not hard-coded, so the trade-off can be demonstrated/adjusted without code changes.

---

# Part D — Load Balancing

- **Load measurement:** each worker reports `currentLoad` in every heartbeat (Document 2, Section 8); the Scheduler never measures load itself, it only consumes the latest reported value — this keeps the Scheduler stateless with respect to load tracking.
- **Worker capacity:** declared at registration (`maxConcurrentJobs`, CPU/memory limits) and treated as fixed for a worker's lifetime in MVP (dynamic capacity renegotiation is a Future item).
- **Dynamic allocation:** because scoring (Part C) is recomputed every scheduling cycle against the latest heartbeat data, allocation naturally shifts away from workers as they fill up — no separate "rebalancing" pass is needed for newly-submitted jobs.
- **Hot/idle/overloaded workers:** a worker is "hot" when `slotHeadroom` approaches 0 and is excluded from `hasHeadroom` once `activeJobs == maxConcurrentJobs`; an "idle" worker has `activeJobs == 0`; "overloaded" is prevented by construction — the Scheduler never assigns beyond `maxConcurrentJobs`, so true overload can only happen if a worker's actual resource usage diverges from its heartbeat-reported numbers (an operational/monitoring concern, surfaced via NFR-012 metrics, not a scheduling-algorithm failure).
- **Avoiding overload:** the `hasHeadroom` gate in Part C's `scheduleResourceAware` is the enforcement point — a job is never assigned to a worker already at declared capacity, regardless of how favorably it might otherwise score.

---

# Part E — Priority, Fairness, Starvation Prevention

- **Priority queues:** implemented as described in Part B (score-sorted selection each cycle, not a static sort computed once).
- **Starvation prevention (aging):** a job's effective score increases the longer it waits, so a low-priority job eventually outranks a stream of newly-arriving higher-priority ones.
```
function agingBoost(job, now):
    waitMs = now - job.createdAt
    return AGING_RATE * (waitMs / AGING_INTERVAL_MS)
    // e.g., AGING_RATE = 1 priority point per 30 seconds waited
```
- **Fairness:** with aging enabled, maximum wait time for any job is bounded: once a job's aged score exceeds the highest possible incoming priority, it will be selected next, giving an upper bound on starvation proportional to `(maxPriority / AGING_RATE) * AGING_INTERVAL_MS`.
- **Priority inversion:** considered in the context of workflows — a high-priority job that depends on a low-priority job's completion is effectively blocked by it. TaskForge's mitigation: a job's *effective* priority for scheduling purposes is the **maximum** of its own declared priority and the priorities of any jobs that (transitively) depend on it, computed at workflow submission time and re-derivable on demand — this prevents a low-priority prerequisite from silently delaying a high-priority dependent.

---

# Part F — Workflow Engine

- **DAG representation:** adjacency list — `workflow.edges: {from: jobId, to: jobId}[]`, plus a derived `dependsOn` list stored per job document (Document 2, Section 11) for efficient "what does this job need" lookups without traversing the whole edge list at schedule time.
- **Cycle detection:** standard DFS-based detection at submission time, before any job is persisted.
```
function hasCycle(jobIds, edges):
    graph = buildAdjacencyList(jobIds, edges)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {id: WHITE for id in jobIds}

    function visit(node, path):
        color[node] = GRAY
        for neighbor in graph[node]:
            if color[neighbor] == GRAY:
                return path + [neighbor]   // cycle found, return it for error reporting
            if color[neighbor] == WHITE:
                result = visit(neighbor, path + [neighbor])
                if result: return result
        color[node] = BLACK
        return null

    for id in jobIds:
        if color[id] == WHITE:
            cycle = visit(id, [id])
            if cycle: return cycle
    return null
```
- **Topological ordering:** Kahn's algorithm, used at submission time to validate the DAG is fully resolvable and to compute each job's initial state (`QUEUED` if in-degree 0, else `WAITING_FOR_DEPENDENCIES`).
```
function topologicalOrder(jobIds, edges):
    inDegree = {id: 0 for id in jobIds}
    graph = buildAdjacencyList(jobIds, edges)
    for edge in edges: inDegree[edge.to] += 1

    queue = [id for id in jobIds if inDegree[id] == 0]
    order = []
    while queue.notEmpty():
        node = queue.dequeue()
        order.append(node)
        for neighbor in graph[node]:
            inDegree[neighbor] -= 1
            if inDegree[neighbor] == 0:
                queue.enqueue(neighbor)

    if order.length != jobIds.length:
        throw CycleDetectedError  // safety net; hasCycle() should already have caught this
    return order
```
- **Ready-job detection / dependency resolution:** event-driven, not polling — on every job `SUCCEEDED` transition, the Workflow Manager looks up jobs whose `dependsOn` includes the completed job, and for each, checks whether *all* of its dependencies are now `SUCCEEDED`; if so, transitions it `WAITING_FOR_DEPENDENCIES → QUEUED`.
```
function onJobSucceeded(completedJob):
    dependents = findJobsDependingOn(completedJob.id)
    for dep in dependents:
        if all(d.state == SUCCEEDED for d in getJobs(dep.dependsOn)):
            transition(dep, QUEUED)
```
- **Partial failure:** default policy `HALT_DEPENDENTS` — if a job reaches `DEAD_LETTER`, all of its (transitive) dependents remain in `WAITING_FOR_DEPENDENCIES` permanently (never auto-released) and the workflow's aggregate state becomes `FAILED`. An alternative `CONTINUE_INDEPENDENT_BRANCHES` policy (documented as a Should-Have configuration option) allows sibling branches not depending on the failed job to proceed to completion independently.
- **Retry behavior:** unchanged from a standalone job's retry behavior (Part H) — a workflow job retries in place; dependents only re-evaluate once it reaches a terminal state (`SUCCEEDED` releases them, `DEAD_LETTER` halts them per policy).
- **Workflow cancellation:** cancelling a workflow cancels every non-terminal constituent job (UC-5 applied per-job) and marks the workflow `CANCELLED`; already-`SUCCEEDED` jobs are not undone.

---

# Part G — Failure Detection

- **Heartbeat interval:** default 5 seconds (configurable).
- **Timeout:** a worker is considered "missed a beat" if `now - lastHeartbeatAt > 2 * HEARTBEAT_INTERVAL` (10s default) — using a multiple of the interval, not the raw interval, absorbs normal jitter without false-flagging.
- **Suspicion period:** an additional grace window (default 15s) after the miss-threshold, during which the worker is `UNHEALTHY` but its jobs are *not yet* reclaimed — this distinguishes "reclaim assignments" (expensive to walk back if wrong) from "stop assigning new work to it" (cheap and safe to do eagerly).
- **Failure detection (final):** if no heartbeat arrives by the end of the suspicion period, the worker transitions `OFFLINE` and its in-flight jobs are reclaimed (Document 2, Section 13 "Failure" flow).
- **False positives:** a worker under heavy GC pause or transient network blip may miss beats and recover within the suspicion window — handled gracefully since assignments aren't reclaimed until suspicion fully expires; if it does recover after reclaim, its late result is discarded via the idempotency check (Part A).
- **Network delays:** treated identically to a slow/dead worker, per the CAP-theorem-grounded reasoning in Part A — TaskForge does not attempt to distinguish "network is slow" from "worker is dead," because doing so reliably is not possible without additional infrastructure (e.g., a second independent network path) disproportionate to this project.
- **Pseudocode:**
```
function failureDetectorSweep(workers, now):
    for worker in workers where worker.state in [IDLE, BUSY]:
        if now - worker.lastHeartbeatAt > MISS_THRESHOLD:
            transition(worker, UNHEALTHY, suspicionStartedAt = now)

    for worker in workers where worker.state == UNHEALTHY:
        if now - worker.lastHeartbeatAt <= MISS_THRESHOLD:
            transition(worker, IDLE)   // recovered
        elif now - worker.suspicionStartedAt > SUSPICION_WINDOW:
            transition(worker, OFFLINE)
            reclaimJobs(worker)

function reclaimJobs(worker):
    jobs = queryJobs(assignedWorkerId = worker.id, state in [ASSIGNED, RUNNING])
    for job in jobs:
        transactionally: job.state -> QUEUED, job.assignedWorkerId = null
```

---

# Part H — Retry Engine

- **Retry policy:** per-job `maxAttempts` (default 3, configurable per job type), applied uniformly regardless of which failure state (`FAILED` or `TIMED_OUT`) triggered it.
- **Exponential backoff with jitter:**
```
function computeBackoff(attempt):
    base = BASE_DELAY_MS * (2 ** (attempt - 1))     // e.g., 1s, 2s, 4s, 8s...
    capped = min(base, MAX_DELAY_MS)                 // e.g., cap at 60s
    jitter = random(0, capped * JITTER_FACTOR)        // e.g., up to 20% jitter
    return capped + jitter
```
- **Retryable vs. non-retryable errors:** job handlers classify their own errors by throwing a typed error (`RetryableError` vs. `FatalError`); infrastructure-level failures (timeout, worker died mid-execution) are always treated as retryable by the framework itself, since those are not the job's fault.
- **Dead-letter jobs:** a job reaching `DEAD_LETTER` is terminal and requires manual inspection/resubmission (Document 1, UC use case for Administrator investigation, Document 4 Part D Audit view).
- **Poison jobs:** a job that fails identically on every attempt (same error signature across attempts) is flagged in its dead-letter record with a `repeatedFailureSignature` note, surfaced in the dashboard so an operator isn't left to infer it manually — this is a diagnostic aid, not a separate mechanism.
- **Timeouts:** enforced by the worker (local timer from `RUNNING` start) *and* independently by the orchestrator (a job that has been `RUNNING` longer than `timeoutMs` without a result is force-transitioned to `TIMED_OUT` even if the worker itself never reports it) — the double enforcement exists because a hung worker cannot be trusted to police its own timeout.

---

# Part I — Concurrency

Identified races and their synchronization strategy, in addition to the general transaction approach in Part A:

- **Two schedulers assign the same job:** not applicable in the literal sense (single orchestrator, Document 2 Section 15), but two *async scheduling cycles overlapping within the same process* is possible in Node's event loop if a cycle takes longer than the tick interval. Mitigated by a Firestore transaction on the job document that conditionally writes `SCHEDULED` only if `state == QUEUED`; the losing cycle's transaction fails and it moves on to the next candidate job.
- **Worker finishes a job while being marked dead:** the Failure Detector's `reclaimJobs` transaction conditionally writes `QUEUED` only if `state == RUNNING` (or `ASSIGNED`) *and* `assignedWorkerId == worker.id`. If the worker's result arrives and is processed first, the job is already `SUCCEEDED`/`FAILED` and the reclaim transaction's precondition fails harmlessly (no-op). If the reclaim happens first, the worker's later result is rejected by the idempotency check (Part A) because `assignedWorkerId` no longer matches.
- **Two retries happen simultaneously:** the delayed re-queue mechanism (Document 2, Section 13) is itself keyed by `(jobId, attempt)`; a transaction conditionally advances the job only if it is still in `RETRY_PENDING` at that exact attempt number, so a duplicate timer firing twice (e.g., due to an at-least-once internal timer implementation) is a no-op on the second firing.
- **Workflow dependency updates happen simultaneously** (two sibling jobs in a diamond DAG succeed at nearly the same instant, both trying to release the same downstream job): the release check (Part F pseudocode) re-reads all of the downstream job's dependencies fresh at evaluation time inside a transaction on the downstream job document, conditionally transitioning it only if it is still `WAITING_FOR_DEPENDENCIES`; whichever of the two concurrent evaluations commits first "wins" the release, and the second's transaction is a safe no-op since the job is no longer in the waiting state.

**General strategy:** every race in this system is resolved the same way — a conditional (optimistic) transaction on the single document whose state is contended, where the condition is "is this document still in the state I expect," never a cross-document lock. This is consistent with, and only possible because of, the Firestore document-scoped transaction model chosen in Document 2, Section 11/15.

---

# Part J — Complexity Analysis

| Algorithm | Time complexity | Space complexity |
|---|---|---|
| FIFO scheduling | O(n log n) per cycle | O(n) |
| Priority scheduling | O(n log n) per cycle | O(n) |
| Resource-aware scheduling | O(n · m) per cycle | O(n + m) |
| Cycle detection (DFS) | O(V + E) per workflow submission | O(V) |
| Topological sort (Kahn's) | O(V + E) per workflow submission | O(V) |
| Failure detector sweep | O(w) per sweep (w = workers) | O(w) |
| Reclaim on worker failure | O(j) (j = jobs owned by that worker, typically ≪ total jobs) | O(j) |

**Expected scale behavior:**
- **10 workers:** all strategies perform indistinguishably; resource-aware overhead is negligible.
- **100 workers:** resource-aware's O(n·m) becomes the strategy worth watching, but at expected queue depths (hundreds, not tens of thousands, per cycle) this remains sub-100ms in Node.
- **1,000 workers:** the failure-detector sweep (O(w)) and resource-aware scoring both scale linearly with worker count; this is the range where an implementation optimization (e.g., only scoring the top-K least-loaded workers via a maintained heap rather than all eligible workers) would become worth implementing — documented as a noted optimization point, not required for MVP scale targets (Document 1, NFR-004: 100 workers).
- **10,000 workers:** outside this project's target scale (Document 1 explicitly targets ~100 for Simulation Mode); noted here only to be honest about where the current O(n·m) design would need revisiting (e.g., sharding workers by capability class before scoring) if the project were extended beyond its stated scope.

---

# Part K — Simulation Engine

- **Design:** the Simulation Engine does not reimplement scheduling/failure-detection logic — it generates synthetic `Job` and `Worker` records inside the `simulations/{id}/...` namespace (Document 2, Section 11) and drives them through the *real* Scheduler, Failure Detector, and Retry Manager code paths, configured to operate over that namespace instead of the live one. This is the single most important design decision in this part: it means Simulation Mode is a demonstration of the actual production code paths, not a separate mock, which is what makes it meaningful evidence of correctness (Document 1, Success Criteria) rather than a canned animation.
- **Generating load:** a configurable job generator produces N synthetic jobs with randomized (or DAG-shaped, for workflow simulation) type/priority/duration characteristics at a configurable submission rate (burst or steady); a configurable worker generator spins up M synthetic worker *records* (not real OS processes — a lightweight in-process "simulated worker" executes a synthetic duration/outcome instead of real work, but still goes through real registration, heartbeat, and result-reporting code paths via direct function calls rather than real network hops).
- **Failure/latency injection:** "kill N% of workers" simply stops the simulated workers' heartbeat-sending loop for the selected subset, letting the *real* Failure Detector discover it on its normal schedule — this is why the demonstration is convincing: the same timeout/suspicion/reclaim logic used in production is what's being observed. Network delay is injected by adding artificial latency to the simulated worker's heartbeat/result timing. Workload spikes are injected by temporarily increasing the job generator's submission rate.
- **How simulation differs from real execution:** (1) simulated workers execute a synthetic sleep/outcome instead of real computational work; (2) simulated workers communicate via in-process function calls annotated with artificial latency rather than real Redis Streams round-trips (kept swappable — the simulated worker still implements the same protocol interface as a real worker, so this is a transport substitution, not a logic substitution); (3) all data is isolated to the simulation namespace and excluded from real metrics/dashboard views by default (FR-026). Everything else — state machines, scheduling scoring, failure detection timing, retry backoff — is identical to production behavior.

---
*End of Document 3. Proceed to Document 4 (API, UI, Security, Testing & Observability Specification) on approval.*
