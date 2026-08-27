import { Firestore } from '@google-cloud/firestore';
import * as crypto from 'crypto';

const db = new Firestore();
const WORKER_ID = crypto.randomUUID();
const HEARTBEAT_INTERVAL = 5000;

async function registerWorker() {
  const workerRef = db.collection('workers').doc(WORKER_ID);
  await workerRef.set({
    state: 'IDLE',
    capabilities: ['default'],
    resourceCapacity: { cpu: 1, memoryMb: 1024, maxConcurrentJobs: 1 },
    currentLoad: { activeJobs: 0, cpu: 0, memoryMb: 0 },
    registeredAt: Date.now(),
    lastHeartbeatAt: Date.now()
  });
  console.log(\Worker \ registered successfully.\);
  return workerRef;
}

async function startHeartbeat(workerRef: FirebaseFirestore.DocumentReference) {
  setInterval(async () => {
    try {
      await workerRef.update({ lastHeartbeatAt: Date.now() });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }, HEARTBEAT_INTERVAL);
}

async function start() {
  const workerRef = await registerWorker();
  await startHeartbeat(workerRef);
}

start().catch(console.error);
