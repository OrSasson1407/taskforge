export type JobState = 
  | 'CREATED' 
  | 'WAITING_FOR_DEPENDENCIES' 
  | 'QUEUED' 
  | 'SCHEDULED' 
  | 'ASSIGNED' 
  | 'RUNNING' 
  | 'SUCCEEDED' 
  | 'FAILED' 
  | 'TIMED_OUT' 
  | 'CANCELLED' 
  | 'RETRY_PENDING' 
  | 'DEAD_LETTER'; // Derived from Document 2, Section 9[cite: 5]

export interface Job {
  id: string;
  type: string;
  payload: any;
  priority: number;
  state: JobState;
  attempt: number;
  maxAttempts: number;
  dependsOn?: string[];
  workflowId?: string;
  assignedWorkerId?: string;
  createdAt: number;
  updatedAt: number;
  result?: any;
  error?: any;
}
