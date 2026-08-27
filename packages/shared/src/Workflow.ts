export type WorkflowState = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface Edge {
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  state: WorkflowState;
  jobIds: string[];
  edges: Edge[];
  partialFailurePolicy: 'HALT_DEPENDENTS' | 'CONTINUE_INDEPENDENT_BRANCHES'; // Default policy per Document 3, Part F[cite: 4]
  createdAt: number;
  updatedAt: number;
}
