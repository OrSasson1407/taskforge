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
            .set('Authorization', \Bearer \\)
            .send({ payload: { type: 'lifecycle-test' } });
        jobId = res.body.id;
    });

    it('Transitions PENDING -> SCHEDULED safely', async () => {
        const res = await request(app)
            .patch(\/jobs/\/state\)
            .set('Authorization', \Bearer \\)
            .send({ newState: 'SCHEDULED' });
        
        expect(res.status).toBe(200);
        expect(res.body.state).toBe('SCHEDULED');
    });

    it('Rejects invalid transition SCHEDULED -> COMPLETED', async () => {
        const res = await request(app)
            .patch(\/jobs/\/state\)
            .set('Authorization', \Bearer \\)
            .send({ newState: 'COMPLETED' });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid state transition');
    });

    it('Cancels job and creates event history entry', async () => {
        const res = await request(app)
            .patch(\/jobs/\/state\)
            .set('Authorization', \Bearer \\)
            .send({ newState: 'CANCELLED' });
        
        expect(res.status).toBe(200);

        const historyRes = await request(app)
            .get(\/jobs/\/events\)
            .set('Authorization', \Bearer \\);
        
        expect(historyRes.body.length).toBeGreaterThan(1);
        expect(historyRes.body[historyRes.body.length - 1].state).toBe('CANCELLED');
    });
});
