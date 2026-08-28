import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';

describe('Phase 3 - Worker Management', () => {
    const workerId = 'test-worker-1';

    it('Registers a new worker successfully', async () => {
        const res = await request(app)
            .post('/workers/register')
            .send({ id: workerId, capabilities: ['test-cap'] });
        
        expect(res.status).toBe(201);
        expect(res.body.id).toBe(workerId);
        expect(res.body.state).toBe('IDLE');
    });

    it('Accepts heartbeat for registered worker', async () => {
        const res = await request(app).post(`/workers/${workerId}/heartbeat`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('Rejects heartbeat for unknown worker', async () => {
        const res = await request(app).post('/workers/unknown-worker/heartbeat');
        expect(res.status).toBe(404);
    });

    it('Lists active workers', async () => {
        const res = await request(app).get('/workers');
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        const worker = res.body.find((w: any) => w.id === workerId);
        expect(worker).toBeDefined();
    });
});
