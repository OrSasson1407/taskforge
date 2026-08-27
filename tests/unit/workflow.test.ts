import { describe, it, expect } from 'vitest';
import { WorkflowManager } from '../../packages/orchestrator/src/workflow/WorkflowManager';

describe('WorkflowManager DAG Validation', () => {
  it('should detect cycles in a DAG submission', () => {
    const wm = new WorkflowManager({} as any);
    const jobs = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' } // Cycle
    ];

    const cycle = wm.validateDag(jobs, edges);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('A');
  });

  it('should return null for a valid DAG', () => {
    const wm = new WorkflowManager({} as any);
    const jobs = ['A', 'B', 'C', 'D'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' }
    ];

    const cycle = wm.validateDag(jobs, edges);
    expect(cycle).toBeNull();
  });
});
