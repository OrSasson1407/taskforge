import { Firestore } from '@google-cloud/firestore';

export async function executeJob(db: Firestore, workerId: string) {
  // Poll for ASSIGNED jobs for this specific worker
  const assignedJobs = await db.collection('jobs')
    .where('assignedWorkerId', '==', workerId)
    .where('state', '==', 'ASSIGNED')
    .limit(1)
    .get();

  if (assignedJobs.empty) return;

  const jobDoc = assignedJobs.docs[0];
  const job = jobDoc.data();

  try {
    // Acknowledge and start running[cite: 6]
    await jobDoc.ref.update({ state: 'RUNNING' });
    console.log(\Executing job \ of type \...\);
    
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Report success
    await jobDoc.ref.update({ state: 'SUCCEEDED', result: { status: 'ok' } });
    console.log(\Job \ succeeded.\);
  } catch (error) {
    console.error(\Job \ failed:\, error);
    await jobDoc.ref.update({ state: 'FAILED', error: error.message });
  }
}
