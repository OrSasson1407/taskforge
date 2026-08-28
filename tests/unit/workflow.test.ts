import { describe, it, expect } from 'vitest';
import { WorkflowManager } from '../../packages/orchestrator/src/workflow/WorkflowManager';
import { WorkflowTaskDef } from '../../packages/shared/src/Workflow';

describe('WorkflowManager DAG Validation', () => {
  it('should throw when a DAG submission has a cycle', () => {
    const tasks: WorkflowTaskDef[] = [
      { id: 'A', payload: {}, dependsOn: ['C'] },
      { id: 'B', payload: {}, dependsOn: ['A'] },
      { id: 'C', payload: {}, dependsOn: ['B'] } // Cycle: A -> B -> C -> A
    ];

    expect(() => WorkflowManager.validateDAG(tasks)).toThrow(/cycle/i);
  });

  it('should not throw for a valid diamond DAG', () => {
    const tasks: WorkflowTaskDef[] = [
      { id: 'A', payload: {} },
      { id: 'B', payload: {}, dependsOn: ['A'] },
      { id: 'C', payload: {}, dependsOn: ['A'] },
      { id: 'D', payload: {}, dependsOn: ['B', 'C'] }
    ];

    expect(() => WorkflowManager.validateDAG(tasks)).not.toThrow();
  });

  it('should throw when a task depends on a non-existent task', () => {
    const tasks: WorkflowTaskDef[] = [
      { id: 'A', payload: {}, dependsOn: ['ghost'] }
    ];

    expect(() => WorkflowManager.validateDAG(tasks)).toThrow(/does not exist/i);
  });
});
