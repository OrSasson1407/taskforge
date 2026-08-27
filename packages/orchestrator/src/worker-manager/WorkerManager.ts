import { Firestore } from '@google-cloud/firestore';
import { WorkerNode } from '@taskforge/shared/src/Worker';

export class WorkerManager {
  constructor(private db: Firestore) {}

  async registerWorker(workerId: string, capabilities: string[], capacity: any): Promise<void> {
    const workerRef = this.db.collection('workers').doc(workerId);
    await workerRef.set({
      state: 'IDLE',
      capabilities,
      resourceCapacity: capacity,
      currentLoad: { activeJobs: 0, cpu: 0, memoryMb: 0 },
      lastHeartbeatAt: Date.now(),
      registeredAt: Date.now()
    } as Partial<WorkerNode>);
  }

  async handleHeartbeat(workerId: string, currentLoad: any): Promise<void> {
    const workerRef = this.db.collection('workers').doc(workerId);
    // Update load and timestamp, clearing UNHEALTHY state if recovering[cite: 4]
    await workerRef.update({
      lastHeartbeatAt: Date.now(),
      currentLoad,
      state: 'IDLE' // Simplified for v.1; full state machine applies here
    });
  }
}
