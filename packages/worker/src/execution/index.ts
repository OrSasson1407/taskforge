import { Firestore } from "@google-cloud/firestore";

export async function executeJob(db: Firestore, workerId: string) {
  const assignedJobs = await db.collection("jobs")
    .where("assignedWorkerId", "==", workerId)
    .where("state", "==", "ASSIGNED")
    .limit(1)
    .get();

  if (assignedJobs.empty) return;

  const jobDoc = assignedJobs.docs[0];
  const job = jobDoc.data();

  try {
    await jobDoc.ref.update({ state: "RUNNING" });
    console.log("Executing job " + jobDoc.id + " of type " + job?.type + "...");
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await jobDoc.ref.update({ state: "SUCCEEDED", result: { status: "ok" } });
    console.log("Job " + jobDoc.id + " succeeded.");
  } catch (error: any) {
    console.error("Job " + jobDoc.id + " failed:", error);
    await jobDoc.ref.update({ state: "FAILED", error: error.message });
  }
}
