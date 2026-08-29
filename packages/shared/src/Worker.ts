export type WorkerState =
    | 'STARTING'
    | 'REGISTERING'
    | 'IDLE'
    | 'BUSY'
    | 'UNHEALTHY'
    | 'DRAINING'
    | 'OFFLINE';

export interface ResourceCapacity {
    cpu: number;
    memoryMb: number;
    maxConcurrentJobs: number;
}

export interface CurrentLoad {
    activeJobs: number;
    cpu: number;
    memoryMb: number;
}

// Document 2, Section 10 — Worker State Machine.
export function isValidWorkerTransition(current: WorkerState, next: WorkerState): boolean {
    const allowed: Record<WorkerState, WorkerState[]> = {
        STARTING: ['REGISTERING'],
        REGISTERING: ['IDLE', 'OFFLINE'],
        IDLE: ['BUSY', 'UNHEALTHY', 'DRAINING'],
        BUSY: ['IDLE', 'BUSY', 'UNHEALTHY', 'DRAINING'],
        UNHEALTHY: ['IDLE', 'BUSY', 'OFFLINE'],
        DRAINING: ['OFFLINE'],
        OFFLINE: []
    };
    return allowed[current]?.includes(next) ?? false;
}

export interface WorkerNode {
    id: string;
    state: WorkerState;
    capabilities: string[];
    resourceCapacity: ResourceCapacity;
    currentLoad: CurrentLoad;
    lastHeartbeat: number;
    registeredAt?: number;
}