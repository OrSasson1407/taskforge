import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';
import { WorkerManager } from '../../packages/orchestrator/src/worker-manager/WorkerManager';

describe('Phase 4 - Scheduler & Redis Streams', () => {
    let token: string;

    beforeAll(async () => {
        token = AuthService.generateToken('test-admin');
        
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
        const updatedJob = await request(app).get(`/jobs/${jobId}`);
        expect(updatedJob.body.state).toBe('SCHEDULED');
        expect(updatedJob.body.assignedWorker).toBe('scheduler-test-worker');
    });
});
