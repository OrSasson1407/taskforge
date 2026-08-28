import { Firestore } from "@google-cloud/firestore";
import { FailureDetector } from "./failure-detector/FailureDetector";
import { EventPublisher } from "./events/EventPublisher";
import { ApiGateway } from "./api/ApiGateway";
import { Scheduler } from "./scheduler/Scheduler";

const db = new Firestore({ projectId: "taskforge-local-dev" });
const publisher = new EventPublisher(process.env.REDIS_URL || "redis://redis:6379");
const failureDetector = new FailureDetector(db, publisher);
const scheduler = new Scheduler(db);
const api = new ApiGateway(db);

console.log("Orchestrator v.1 starting...");
api.start(8080);

setInterval(async () => {
  try {
    await failureDetector.sweep();
  } catch (err: any) {
    console.error("FD Sweep failed:", err);
  }
}, 5000);

setInterval(async () => {
  try {
    await scheduler.runCycle();
  } catch (err: any) {
    console.error("Scheduler failed:", err);
  }
}, 2000);
