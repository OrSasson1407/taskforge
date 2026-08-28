import { getFirestore } from 'firebase-admin/firestore';
import { JobState } from '../../shared/src/Job';

export class RetryManager {
    static async recordJobFailure(jobId: string, reason: string): Promise<void> {
        const db = getFirestore();
        const jobRef = db.collection('jobs').doc(jobId);
        
        await db.runTransaction(async (t) => {
            const doc = await t.get(jobRef);
            if (!doc.exists) throw new Error('Job not found');
            
            const job = doc.data() as any;
            const retries = job.retryCount || 0;
            const maxRetries = job.maxRetries || 3;
            
            const nextState: JobState = retries >= maxRetries ? 'FAILED' : 'PENDING';
            const now = Date.now();
            
            t.update(jobRef, {
                state: nextState,
                retryCount: retries + (nextState === 'PENDING' ? 1 : 0),
                updatedAt: now,
                assignedWorker: null // clear worker so it can be picked up again
            });

            const eventRef = jobRef.collection('events').doc();
            t.set(eventRef, {
                id: eventRef.id,
                jobId: doc.id,
                state: nextState,
                timestamp: now,
                message: \Job failed: \. Transitioned to \\
            });
        });
    }
}
