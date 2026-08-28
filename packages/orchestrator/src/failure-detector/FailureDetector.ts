import { getFirestore } from 'firebase-admin/firestore';
import { JobState } from '../../../shared/src/Job';

export class FailureDetector {
    static async sweep(): Promise<number> {
        const db = getFirestore();
        const now = Date.now();
        const stalenessThresholdMs = 15000;
        const cutoff = now - stalenessThresholdMs;

        // 1. Find dead workers
        const deadWorkersSnap = await db.collection('workers')
            .where('lastHeartbeat', '<', cutoff)
            .where('state', '!=', 'OFFLINE')
            .get();
            
        if (deadWorkersSnap.empty) return 0;
        
        const deadWorkerIds = deadWorkersSnap.docs.map(d => d.id);
        let reclaimedCount = 0;

        // 2. Reclaim RUNNING/SCHEDULED jobs assigned to dead workers
        for (const workerId of deadWorkerIds) {
            const jobsSnap = await db.collection('jobs')
                .where('assignedWorker', '==', workerId)
                .where('state', 'in', ['SCHEDULED', 'RUNNING'])
                .get();

            if (!jobsSnap.empty) {
                const batch = db.batch();
                jobsSnap.docs.forEach(doc => {
                    const job = doc.data();
                    const retries = job.retryCount || 0;
                    const maxRetries = job.maxRetries || 3;
                    
                    const nextState: JobState = retries >= maxRetries ? 'FAILED' : 'PENDING';
                    
                    batch.update(doc.ref, {
                        state: nextState,
                        retryCount: retries + (nextState === 'PENDING' ? 1 : 0),
                        assignedWorker: null,
                        updatedAt: now
                    });

                    const eventRef = doc.ref.collection('events').doc();
                    batch.set(eventRef, {
                        id: eventRef.id,
                        jobId: doc.id,
                        state: nextState,
                        timestamp: now,
                        message: `Worker ${workerId} died. Reclaimed job. (Retry ${retries + 1}/${maxRetries})`
                    });
                    reclaimedCount++;
                });
                await batch.commit();
            }
            
            // Mark worker as offline
            await db.collection('workers').doc(workerId).update({ state: 'OFFLINE' });
        }
        
        return reclaimedCount;
    }
}
