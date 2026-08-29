import { getFirestore } from 'firebase-admin/firestore';
import { WorkerNode, WorkerState, ResourceCapacity, CurrentLoad, isValidWorkerTransition } from '../../../shared/src/Worker';

const DEFAULT_CAPACITY: ResourceCapacity = { cpu: 1, memoryMb: 512, maxConcurrentJobs: 1 };
const DEFAULT_LOAD: CurrentLoad = { activeJobs: 0, cpu: 0, memoryMb: 0 };

export class WorkerManager {
    static async registerWorker(id: string, capabilities: string[], resourceCapacity?: ResourceCapacity): Promise<WorkerNode> {
        const db = getFirestore();
        const ref = db.collection('workers').doc(id);
        const existing = await ref.get();
        const now = Date.now();

        // Every registration collapses STARTING -> REGISTERING -> IDLE into one write (the
        // worker process has already done the "starting/connecting" part by the time this
        // request arrives) but is guarded by the same transition table used everywhere else,
        // so an illegal jump here would fail loudly instead of silently corrupting state.
        if (!isValidWorkerTransition('STARTING', 'REGISTERING') || !isValidWorkerTransition('REGISTERING', 'IDLE')) {
            throw new Error('Worker state machine misconfigured: STARTING->REGISTERING->IDLE must be legal');
        }

        if (existing.exists) {
            // UC-6 alternative flow: worker re-registers after a restart, reconciled by ID.
            const prior = existing.data() as WorkerNode;
            const worker: WorkerNode = {
                ...prior,
                capabilities,
                resourceCapacity: resourceCapacity || prior.resourceCapacity || DEFAULT_CAPACITY,
                currentLoad: DEFAULT_LOAD,
                state: 'IDLE',
                lastHeartbeat: now
            };
            await ref.set(worker);
            return worker;
        }

        const worker: WorkerNode = {
            id,
            state: 'IDLE',
            capabilities,
            resourceCapacity: resourceCapacity || DEFAULT_CAPACITY,
            currentLoad: DEFAULT_LOAD,
            lastHeartbeat: now,
            registeredAt: now
        };
        await ref.set(worker);
        return worker;
    }

    static async recordHeartbeat(id: string, currentLoad?: CurrentLoad): Promise<WorkerNode> {
        const db = getFirestore();
        const ref = db.collection('workers').doc(id);
        const doc = await ref.get();

        if (!doc.exists) {
            throw new Error('Worker not registered');
        }

        const worker = doc.data() as WorkerNode;

        if (worker.state === 'OFFLINE') {
            throw new Error('Worker is offline; re-registration required');
        }

        const load = currentLoad || worker.currentLoad || DEFAULT_LOAD;

        // Derive IDLE/BUSY from active job count. A worker that heartbeats while UNHEALTHY has
        // recovered (UC-9) and rejoins at IDLE/BUSY as appropriate. DRAINING is left untouched
        // here — it only exits via an explicit admin action (Phase 10), never via load alone.
        let nextState: WorkerState = worker.state;
        if (worker.state === 'IDLE' || worker.state === 'BUSY' || worker.state === 'UNHEALTHY') {
            const candidate: WorkerState = load.activeJobs > 0 ? 'BUSY' : 'IDLE';
            if (candidate === worker.state || isValidWorkerTransition(worker.state, candidate)) {
                nextState = candidate;
            }
        }

        const updated = {
            lastHeartbeat: Date.now(),
            currentLoad: load,
            state: nextState
        };
        await ref.update(updated);
        return { ...worker, ...updated };
    }

    static async getActiveWorkers(stalenessThresholdMs: number = 15000): Promise<WorkerNode[]> {
        const db = getFirestore();
        const cutoff = Date.now() - stalenessThresholdMs;
        const snapshot = await db.collection('workers')
            .where('lastHeartbeat', '>=', cutoff)
            .get();

        return snapshot.docs.map(doc => doc.data() as WorkerNode);
    }
}