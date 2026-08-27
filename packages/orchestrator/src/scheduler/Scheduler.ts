import { Firestore } from '@google-cloud/firestore';

export class Scheduler {
  constructor(private db: Firestore) {}

  async runCycle() {
    // Fetch top priority QUEUED jobs and IDLE workers
    const queuedJobs = await this.db.collection('jobs')
      .where('state', '==', 'QUEUED')
      .orderBy('priority', 'desc')
      .limit(50).get();
      
    const idleWorkers = await this.db.collection('workers')
      .where('state', '==', 'IDLE').get();

    if (queuedJobs.empty || idleWorkers.empty) return;

    let workerIndex = 0;
    for (const jobDoc of queuedJobs.docs) {
      if (workerIndex >= idleWorkers.docs.length) break;
      const workerDoc = idleWorkers.docs[workerIndex];

      // Optimistic concurrency to prevent double-assignment
      await this.db.runTransaction(async (t) => {
        const job = await t.get(jobDoc.ref);
        if (job.exists && job.data()?.state === 'QUEUED') {
          t.update(jobDoc.ref, { state: 'ASSIGNED', assignedWorkerId: workerDoc.id });
          t.update(workerDoc.ref, { state: 'BUSY' });
        }
      });
      workerIndex++;
    }
  }
}
