import { getFirestore } from 'firebase-admin/firestore';
import { WorkerManager } from '../worker-manager/WorkerManager';
import { redisClient } from '../../../shared/src/redis/RedisClient';
import { JobState } from '../../../shared/src/Job';

export class Scheduler {
    static async scheduleJobs(): Promise<number> {
        const db = getFirestore();
        
        // 1. Fetch PENDING jobs (FIFO - ordered by createdAt)
        const jobsSnapshot = await db.collection('jobs')
            .where('state', '==', 'PENDING' as JobState)
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get();

        if (jobsSnapshot.empty) return 0;

        // 2. Fetch Active Workers
        const workers = await WorkerManager.getActiveWorkers();
        if (workers.length === 0) {
            console.log('[Scheduler] No active workers available.');
            return 0;
        }

        const batch = db.batch();
        let scheduledCount = 0;

        // 3. Resource-Aware / Priority Assignment (Simplified Round-Robin for now)
        for (let i = 0; i < jobsSnapshot.docs.length; i++) {
            const jobDoc = jobsSnapshot.docs[i];
            const job = jobDoc.data();
            
            // Select worker (Round Robin)
            const worker = workers[i % workers.length];
            
            const now = Date.now();
            const jobRef = db.collection('jobs').doc(job.id);
            
            // Update Firestore State
            batch.update(jobRef, { 
                state: 'SCHEDULED' as JobState, 
                assignedWorker: worker.id,
                updatedAt: now 
            });

            // Create Event History
            const eventRef = jobRef.collection('events').doc();
            batch.set(eventRef, {
                id: eventRef.id,
                jobId: job.id,
                state: 'SCHEDULED' as JobState,
                timestamp: now,
                message: `Assigned to worker ${worker.id}`
            });

            // 4. Redis Streams Assignment Transport
            await redisClient.xadd(
                `worker:${worker.id}:jobs`,
                '*',
                'jobId', job.id,
                'payload', JSON.stringify(job.payload)
            );

            scheduledCount++;
        }

        await batch.commit();
        return scheduledCount;
    }

    static startPolling(intervalMs: number = 5000) {
        console.log(`[Scheduler] Starting polling loop (${intervalMs}ms)...`);
        setInterval(async () => {
            try {
                const count = await this.scheduleJobs();
                if (count > 0) {
                    console.log(`[Scheduler] Successfully scheduled ${count} jobs.`);
                }
            } catch (err: any) {
                console.error('[Scheduler] Error during scheduling cycle:', err.message);
            }
        }, intervalMs);
    }
}
