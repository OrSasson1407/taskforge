import { getFirestore } from 'firebase-admin/firestore';

export class Metrics {
    static async getSystemMetrics() {
        const db = getFirestore();
        
        // Simple mock counts for now to avoid full table scans in prod
        // In reality, you'd increment counters atomically or use aggregation queries
        const activeWorkers = await db.collection('workers').where('state', '==', 'IDLE').count().get();
        const pendingJobs = await db.collection('jobs').where('state', '==', 'PENDING').count().get();
        
        return {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            activeWorkers: activeWorkers.data().count,
            pendingJobs: pendingJobs.data().count
        };
    }
}
