export type JobEventType = 
  | 'JOB_CREATED'
  | 'JOB_ASSIGNED'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'JOB_RETRIED';

export interface TaskForgeEvent {
  type: JobEventType;
  timestamp: number;
  payload: any;
}
