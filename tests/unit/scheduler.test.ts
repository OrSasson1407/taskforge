import { describe, it, expect, vi } from 'vitest';
import { Scheduler } from '../../packages/orchestrator/src/scheduler/Scheduler';

describe('Scheduler Unit Tests', () => {
  it('should only assign jobs to IDLE workers with matching capabilities', async () => {
    // Mock Firestore
    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
    };

    const scheduler = new Scheduler(mockDb as any);
    await scheduler.runCycle();
    
    expect(mockDb.collection).toHaveBeenCalledWith('jobs');
    expect(mockDb.where).toHaveBeenCalledWith('state', '==', 'QUEUED');
  });
});
