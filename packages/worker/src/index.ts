import { Firestore } from "@google-cloud/firestore";
import * as crypto from "crypto";
import { executeJob } from "./execution";

const db = new Firestore({ projectId: "taskforge-local-dev" });
const WORKER_ID = crypto.randomUUID();
const HEARTBEAT_INTERVAL = 5000;
let workerRef: FirebaseFirestore.DocumentReference;

async function registerWorker() {
  workerRef = db.collection("workers").doc(WORKER_ID);
  await workerRef.set({
    state: "IDLE",
    capabilities: ["default", "data-aggregation"],
    resourceCapacity: { cpu: 1, memoryMb: 1024, maxConcurrentJobs: 1 },
    currentLoad: { activeJobs: 0, cpu: 0, memoryMb: 0 },
    registeredAt: Date.now(),
    lastHeartbeatAt: Date.now()
  });
  console.log("Worker " + WORKER_ID + " registered successfully.");
}

async function startHeartbeat() {
  setInterval(async () => {
    try {
      await workerRef.update({ lastHeartbeatAt: Date.now() });
    } catch (error) {
      console.error("Heartbeat failed:", error);
    }
  }, HEARTBEAT_INTERVAL);
}

async function startExecutionLoop() {
  setInterval(async () => {
    try {
      await executeJob(db, WORKER_ID);
    } catch (error) {
      console.error("Execution loop error:", error);
    }
  }, 2000);
}

async function start() {
  console.log("Worker booting up...");
  await registerWorker();
  await startHeartbeat();
  await startExecutionLoop();
}

start().catch(console.error);
