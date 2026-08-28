import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';
import { WorkerManager } from '../../packages/orchestrator/src/worker-manager/WorkerManager';
import { getFirestore } from 'firebase-admin/firestore';

describe('Phase 4 - Scheduler & Redis Streams', () => {
    let token: string;

    beforeAll(async () => {
        token = AuthService.generateToken('test-admin');

        // Other test files (e.g. phase3) register their own workers against the
        // same emulator instance and nothing clears them between files. Wipe the
        // workers collection here so this test's round-robin assertion is
        // deterministic instead of depending on file execution order.
        const db = getFirestore();
        const existingWorkers = await db.collection('workers').get();
        const cleanupBatch = db.batch();
        existingWorkers.docs.forEach(doc => cleanupBatch.delete(doc.ref));
        await cleanupBatch.commit();

        // Ensure at least one worker exists for the scheduler to assign to
        await WorkerManager.registerWorker('scheduler-test-worker', ['default']);
    });

    it('Triggers the scheduler and assigns PENDING jobs to active workers', async () => {
        // 1. Create a PENDING job
        const jobRes = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${token}`)
            .send({ payload: { task: 'scheduling-test' } });
        
        const jobId = jobRes.body.id;

        // 2. Trigger Scheduler
        const scheduleRes = await request(app).post('/scheduler/run');
        expect(scheduleRes.status).toBe(200);
        expect(scheduleRes.body.scheduledCount).toBeGreaterThanOrEqual(1);

        // 3. Verify Job is now SCHEDULED
        const updatedJob = await request(app)
            .get(`/jobs/${jobId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(updatedJob.body.state).toBe('SCHEDULED');
        expect(updatedJob.body.assignedWorker).toBe('scheduler-test-worker');
    });
});
