import { describe, it, expect, vi, beforeEach } from 'vitest';

// Scheduler.scheduleJobs() is a static method that calls getFirestore() itself (no DI),
// and reaches out to WorkerManager + the real Redis client. Mock all three so this stays
// a true standalone unit test — no emulator/Redis required.
const mockBatchUpdate = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockGet = vi.fn();
const mockDb = {
    collection: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    doc: vi.fn((id?: string) => ({ id: id || 'generated-id', collection: vi.fn().mockReturnThis() })),
    get: mockGet,
    batch: vi.fn(() => ({
        update: mockBatchUpdate,
        set: mockBatchSet,
        commit: mockBatchCommit
    }))
};

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: () => mockDb
}));

vi.mock('../../packages/orchestrator/src/worker-manager/WorkerManager', () => ({
    WorkerManager: {
        getActiveWorkers: vi.fn()
    }
}));

vi.mock('../../shared/src/redis/RedisClient', () => ({
    redisClient: {
        xadd: vi.fn().mockResolvedValue('1-0')
    }
}));

import { Scheduler } from '../../packages/orchestrator/src/scheduler/Scheduler';
import { WorkerManager } from '../../packages/orchestrator/src/worker-manager/WorkerManager';
import { redisClient } from '../../shared/src/redis/RedisClient';

describe('Scheduler Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDb.collection.mockReturnThis();
        mockDb.where.mockReturnThis();
        mockDb.orderBy.mockReturnThis();
        mockDb.limit.mockReturnThis();
        mockDb.batch.mockReturnValue({
            update: mockBatchUpdate,
            set: mockBatchSet,
            commit: mockBatchCommit
        });
    });

    it('should query for PENDING jobs ordered by createdAt', async () => {
        mockGet.mockResolvedValue({ empty: true, docs: [] });
        (WorkerManager.getActiveWorkers as any).mockResolvedValue([]);

        await Scheduler.scheduleJobs();

        expect(mockDb.collection).toHaveBeenCalledWith('jobs');
        expect(mockDb.where).toHaveBeenCalledWith('state', '==', 'PENDING');
        expect(mockDb.orderBy).toHaveBeenCalledWith('createdAt', 'asc');
    });

    it('should return 0 and skip assignment when no active workers are available', async () => {
        mockGet.mockResolvedValue({
            empty: false,
            docs: [{ data: () => ({ id: 'job-1', payload: {}, retryCount: 0 }) }]
        });
        (WorkerManager.getActiveWorkers as any).mockResolvedValue([]);

        const count = await Scheduler.scheduleJobs();

        expect(count).toBe(0);
        expect(redisClient.xadd).not.toHaveBeenCalled();
    });

    it('should round-robin assign PENDING jobs across active workers and push to their Redis stream', async () => {
        const jobs = [
            { id: 'job-1', payload: { type: 'echo' }, retryCount: 0 },
            { id: 'job-2', payload: { type: 'sleep' }, retryCount: 1 }
        ];
        mockGet.mockResolvedValue({
            empty: false,
            docs: jobs.map(j => ({ data: () => j }))
        });
        (WorkerManager.getActiveWorkers as any).mockResolvedValue([
            { id: 'worker-a' },
            { id: 'worker-b' }
        ]);

        const count = await Scheduler.scheduleJobs();

        expect(count).toBe(2);
        expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
        expect(redisClient.xadd).toHaveBeenCalledWith(
            'worker:worker-a:jobs', '*', 'jobId', 'job-1', 'payload', JSON.stringify({ type: 'echo' }), 'retryCount', '0'
        );
        expect(redisClient.xadd).toHaveBeenCalledWith(
            'worker:worker-b:jobs', '*', 'jobId', 'job-2', 'payload', JSON.stringify({ type: 'sleep' }), 'retryCount', '1'
        );
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
});
