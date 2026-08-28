import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';
import { getFirestore } from 'firebase-admin/firestore';

describe('Phase 5 - Retries & Fault Tolerance', () => {
    let token: string;
    let jobId: string;
    const workerId = 'dead-worker-1';

    beforeAll(async () => {
        token = AuthService.generateToken('test-admin');
        const db = getFirestore();
        
        // Setup a "dead" worker
        await db.collection('workers').doc(workerId).set({
            id: workerId,
            state: 'IDLE',
            capabilities: ['default'],
            lastHeartbeat: Date.now() - 30000 // 30 seconds ago (past the 15s threshold)
        });

        // Setup a job assigned to this dead worker
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${token}`)
            .send({ payload: { type: 'reclaim-test' } });
            
        jobId = res.body.id;
        
        // Manually push it to SCHEDULED state assigned to the dead worker
        await db.collection('jobs').doc(jobId).update({
            state: 'SCHEDULED',
            assignedWorker: workerId
        });
    });

    it('FailureDetector sweeps dead workers and reclaims jobs', async () => {
        const res = await request(app).post('/system/sweep');
        expect(res.status).toBe(200);
        expect(res.body.reclaimedCount).toBeGreaterThanOrEqual(1);

        // Verify the job was pushed back to PENDING
        const jobRes = await request(app)
            .get(`/jobs/${jobId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(jobRes.body.state).toBe('PENDING');
        expect(jobRes.body.retryCount).toBe(1);
        expect(jobRes.body.assignedWorker).toBeNull();
    });

    it('RetryManager transitions to FAILED after max retries', async () => {
        // Manually exhaust retries
        const db = getFirestore();
        await db.collection('jobs').doc(jobId).update({
            retryCount: 3,
            maxRetries: 3
        });

        // Fail the job
        const res = await request(app)
            .post(`/jobs/${jobId}/fail`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'Simulated failure' });
        expect(res.status).toBe(200);

        // Verify it went to FAILED, not PENDING
        const jobRes = await request(app)
            .get(`/jobs/${jobId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(jobRes.body.state).toBe('FAILED');
    });
});
