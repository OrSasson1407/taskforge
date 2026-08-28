import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';

describe('Phase 2 - Queue & Job Lifecycle', () => {
    let token: string;
    let jobId: string;

    beforeAll(async () => {
        token = AuthService.generateToken('test-admin');
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${token}`)
            .send({ payload: { type: 'lifecycle-test' } });
        jobId = res.body.id;
    });

    it('Transitions PENDING -> SCHEDULED safely', async () => {
        const res = await request(app)
            .patch(`/jobs/${jobId}/state`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newState: 'SCHEDULED' });
        
        expect(res.status).toBe(200);
        expect(res.body.state).toBe('SCHEDULED');
    });

    it('Rejects invalid transition SCHEDULED -> COMPLETED', async () => {
        const res = await request(app)
            .patch(`/jobs/${jobId}/state`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newState: 'COMPLETED' });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid state transition');
    });

    it('Cancels job and creates event history entry', async () => {
        const res = await request(app)
            .patch(`/jobs/${jobId}/state`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newState: 'CANCELLED' });
        
        expect(res.status).toBe(200);

        const historyRes = await request(app)
            .get(`/jobs/${jobId}/events`)
            .set('Authorization', `Bearer ${token}`);
        
        expect(historyRes.body.length).toBeGreaterThan(1);
        expect(historyRes.body[historyRes.body.length - 1].state).toBe('CANCELLED');
    });
});
