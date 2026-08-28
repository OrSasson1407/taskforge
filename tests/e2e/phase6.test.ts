import request from 'supertest';
import { app } from '../../packages/orchestrator/src/api/ApiGateway';
import { AuthService } from '../../packages/orchestrator/src/auth/AuthService';

describe('Phase 6 - Dependencies & Workflows', () => {
    let token: string;

    beforeAll(() => {
        token = AuthService.generateToken('test-admin');
    });

    it('Rejects a workflow with a cycle', async () => {
        const res = await request(app)
            .post('/workflows')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Cycle Test',
                tasks: [
                    { id: 'A', payload: {}, dependsOn: ['B'] },
                    { id: 'B', payload: {}, dependsOn: ['C'] },
                    { id: 'C', payload: {}, dependsOn: ['A'] }
                ]
            });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cycle detected');
    });

    it('Rejects a workflow with missing dependencies', async () => {
        const res = await request(app)
            .post('/workflows')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Missing Dep Test',
                tasks: [
                    { id: 'A', payload: {}, dependsOn: ['Z'] }
                ]
            });
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('does not exist');
    });

    it('Successfully submits a valid DAG', async () => {
        const res = await request(app)
            .post('/workflows')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Valid DAG',
                tasks: [
                    { id: 'A', payload: { step: 1 } },
                    { id: 'B', payload: { step: 2 }, dependsOn: ['A'] },
                    { id: 'C', payload: { step: 2 }, dependsOn: ['A'] },
                    { id: 'D', payload: { step: 3 }, dependsOn: ['B', 'C'] }
                ]
            });
        
        expect(res.status).toBe(201);
        expect(res.body.workflowId).toBeDefined();
        expect(res.body.jobs.length).toBe(4);

        const jobA = res.body.jobs.find((j: any) => j.localId === 'A');
        const jobD = res.body.jobs.find((j: any) => j.localId === 'D');
        
        expect(jobA.state).toBe('PENDING'); // No dependencies
        expect(jobD.state).toBe('BLOCKED'); // Has dependencies
    });
});
