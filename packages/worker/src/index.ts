import { registerWorker } from './registration';
import { startHeartbeat } from './heartbeat';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8080';
const WORKER_AUTH_TOKEN = process.env.WORKER_AUTH_TOKEN || '';
const WORKER_ID = process.env.WORKER_ID || `worker-${Math.random().toString(36).substring(2, 9)}`;
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 5000);

const RESOURCE_CAPACITY = {
    cpu: Number(process.env.WORKER_CPU_CAPACITY || 1),
    memoryMb: Number(process.env.WORKER_MEMORY_MB || 512),
    maxConcurrentJobs: Number(process.env.WORKER_MAX_CONCURRENT_JOBS || 1)
};

async function startWorker() {
    console.log(`[Worker ${WORKER_ID}] Starting up...`);

    try {
        const worker = await registerWorker(ORCHESTRATOR_URL, WORKER_AUTH_TOKEN, {
            id: WORKER_ID,
            capabilities: ['high-priority', 'default'],
            resourceCapacity: RESOURCE_CAPACITY
        });
        console.log(`[Worker ${WORKER_ID}] Registered successfully, state=${worker.state}.`);

        startHeartbeat(ORCHESTRATOR_URL, WORKER_ID, WORKER_AUTH_TOKEN, HEARTBEAT_INTERVAL_MS);
        console.log(`[Worker ${WORKER_ID}] Heartbeat loop started (every ${HEARTBEAT_INTERVAL_MS}ms).`);

        // Phase 4 adds the Redis Streams job-consumption loop here. Registration + heartbeat
        // are the full Phase 3 scope (Document 5, Part C) - deliberately not pulling in job
        // execution yet so this phase can be verified in isolation.
    } catch (err: any) {
        console.error(`[Worker ${WORKER_ID}] Fatal startup error:`, err.message);
        process.exit(1);
    }
}

startWorker();