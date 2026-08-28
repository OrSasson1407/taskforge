export type WorkerState = 'IDLE' | 'BUSY' | 'OFFLINE';

export interface WorkerNode {
    id: string;
    state: WorkerState;
    capabilities: string[];
    lastHeartbeat: number;
}
