import { getFirestore } from 'firebase-admin/firestore';
import { WorkerManager } from '../worker-manager/WorkerManager';

export class SimulationEngine {
    static async triggerChaosKill(percentile: number): Promise<string[]> {
        const workers = await WorkerManager.getActiveWorkers();
        if (workers.length === 0) return [];

        const killCount = Math.max(1, Math.floor(workers.length * (percentile / 100)));
        const shuffled = workers.sort(() => 0.5 - Math.random());
        const toKill = shuffled.slice(0, killCount);
        
        const db = getFirestore();
        const batch = db.batch();
        const killedIds: string[] = [];

        for (const worker of toKill) {
            const ref = db.collection('workers').doc(worker.id);
            batch.update(ref, { state: 'OFFLINE' });
            killedIds.push(worker.id);
        }

        await batch.commit();
        return killedIds;
    }
}
