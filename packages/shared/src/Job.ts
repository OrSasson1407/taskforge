export type JobState = 'PENDING' | 'BLOCKED' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export function isValidJobTransition(current: JobState, next: JobState): boolean {
    const allowed: Record<JobState, JobState[]> = {
        PENDING: ['SCHEDULED', 'CANCELLED'],
        BLOCKED: ['PENDING', 'CANCELLED'], // Can transition to PENDING when dependencies are met
        SCHEDULED: ['RUNNING', 'FAILED', 'CANCELLED'],
        RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
        COMPLETED: [],
        FAILED: ['PENDING'], 
        CANCELLED: []
    };
    return allowed[current]?.includes(next) ?? false;
}

export interface JobEvent {
    id: string;
    jobId: string;
    state: JobState;
    timestamp: number;
    message?: string;
}

export interface Job {
    id: string;
    workflowId?: string;
    localId?: string;
    state: JobState;
    payload: Record<string, any>;
    dependencies?: string[]; // Array of global job IDs this job waits for
    createdAt: number;
    updatedAt: number;
}
