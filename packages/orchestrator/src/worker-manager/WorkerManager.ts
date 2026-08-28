import { getFirestore } from 'firebase-admin/firestore';
import { WorkerNode } from '../../../shared/src/Worker';

export class WorkerManager {
    static async registerWorker(id: string, capabilities: string[]): Promise<WorkerNode> {
        const db = getFirestore();
        const worker: WorkerNode = {
            id,
            state: 'IDLE',
            capabilities,
            lastHeartbeat: Date.now()
        };
        await db.collection('workers').doc(id).set(worker);
        return worker;
    }

    static async recordHeartbeat(id: string): Promise<void> {
        const db = getFirestore();
        const workerRef = db.collection('workers').doc(id);
        const doc = await workerRef.get();
        
        if (!doc.exists) {
            throw new Error('Worker not registered');
        }
        
        await workerRef.update({
            lastHeartbeat: Date.now()
        });
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
