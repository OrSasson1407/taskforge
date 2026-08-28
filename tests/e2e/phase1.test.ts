import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';

describe('Phase 1 - Auth & Core Job Model', () => {
    let token: string;
    let createdJobId: string;

    beforeAll(() => {
        token = AuthService.generateToken('test-admin');
    });

    it('GET /health returns 200', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('POST /jobs without auth returns 401', async () => {
        const res = await request(app).post('/jobs').send({ payload: { task: 'test' } });
        expect(res.status).toBe(401);
    });

    it('POST /jobs with auth creates a job', async () => {
        const res = await request(app)
            .post('/jobs')
            .set('Authorization', `Bearer ${token}`)
            .send({ payload: { data: 'val' } });
        
        expect(res.status).toBe(201);
        expect(res.body.state).toBe('PENDING');
        createdJobId = res.body.id;
    });

    it('GET /jobs/:id/events fetches event history subcollection', async () => {
        const res = await request(app)
            .get(`/jobs/${createdJobId}/events`)
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].state).toBe('PENDING');
    });
});
