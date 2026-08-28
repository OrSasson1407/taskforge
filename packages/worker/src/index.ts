import { redisClient } from '../../shared/src/redis/RedisClient';
import { JobHandlers } from './registry';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8080';
const WORKER_ID = `worker-${Math.random().toString(36).substring(2, 9)}`;
const HEARTBEAT_INTERVAL_MS = 5000;

async function startWorker() {
    console.log(`[Worker ${WORKER_ID}] Starting up...`);
    
    try {
        // 1. Registration
        const regRes = await fetch(`${ORCHESTRATOR_URL}/workers/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: WORKER_ID, capabilities: ['high-priority', 'default'] })
        });
        
        if (!regRes.ok) throw new Error(`Registration failed: ${regRes.statusText}`);
        console.log(`[Worker ${WORKER_ID}] Registered successfully.`);

        // 2. Heartbeat Loop
        setInterval(async () => {
            try {
                await fetch(`${ORCHESTRATOR_URL}/workers/${WORKER_ID}/heartbeat`, { method: 'POST' });
            } catch (err: any) {
                console.error(`[Worker ${WORKER_ID}] Heartbeat failed:`, err.message);
            }
        }, HEARTBEAT_INTERVAL_MS);

        // 3. Redis Stream Consumer Loop (Phase 4)
        let lastId = '0';
        console.log(`[Worker ${WORKER_ID}] Listening for jobs on Redis Stream...`);
        
        while (true) {
            try {
                const streamName = `worker:${WORKER_ID}:jobs`;
                const results = await redisClient.xread('BLOCK', 5000, 'STREAMS', streamName, '$');
                
                if (results) {
                    for (const stream of results) {
                        const messages = stream[1];
                        for (const message of messages) {
                            const [msgId, fields] = message;
                            // Fields arrive as a flat [key, value, key, value, ...] array from Redis.
                            // Parse into a record instead of relying on fixed indices, since fields
                            // may be added/reordered by the producer over time.
                            const fieldMap: Record<string, string> = {};
                            for (let i = 0; i < fields.length; i += 2) {
                                fieldMap[fields[i]] = fields[i + 1];
                            }
                            const jobId = fieldMap['jobId'];
                            const payload = JSON.parse(fieldMap['payload'] || '{}');
                            const retryCount = parseInt(fieldMap['retryCount'] || '0', 10);

                            console.log(`[Worker ${WORKER_ID}] Received Job ${jobId} from stream. Executing...`);

                            try {
                                await fetch(`${ORCHESTRATOR_URL}/jobs/${jobId}/state`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ newState: 'RUNNING' })
                                });

                                const handler = JobHandlers[payload.type];
                                if (!handler) {
                                    throw new Error(`No JobHandler registered for type "${payload.type}"`);
                                }

                                await handler(payload, { jobId, retryCount });

                                await fetch(`${ORCHESTRATOR_URL}/jobs/${jobId}/state`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ newState: 'COMPLETED' })
                                });
                                console.log(`[Worker ${WORKER_ID}] Job ${jobId} COMPLETED.`);
                            } catch (e: any) {
                                console.error(`[Worker ${WORKER_ID}] Job ${jobId} failed:`, e.message);
                                try {
                                    await fetch(`${ORCHESTRATOR_URL}/jobs/${jobId}/state`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ newState: 'FAILED', message: e.message })
                                    });
                                } catch (patchErr: any) {
                                    console.error(`[Worker ${WORKER_ID}] Failed to transition job ${jobId} to FAILED:`, patchErr.message);
                                }
                            }
                        }
                    }
                }
            } catch (err: any) {
                console.error(`[Worker ${WORKER_ID}] Redis Stream Read Error:`, err.message);
                await new Promise(res => setTimeout(res, 2000)); // backoff
            }
        }

    } catch (err: any) {
        console.error(`[Worker ${WORKER_ID}] Fatal startup error:`, err.message);
        process.exit(1);
    }
}

startWorker();
