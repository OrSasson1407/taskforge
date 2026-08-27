export type WorkerState = 'STARTING' | 'REGISTERING' | 'IDLE' | 'BUSY' | 'UNHEALTHY' | 'DRAINING' | 'OFFLINE'; // Derived from Document 2, Section 10[cite: 5]

export interface ResourceCapacity {
  cpu: number;
  memoryMb: number;
  maxConcurrentJobs: number;
}

export interface ResourceLoad {
  activeJobs: number;
  cpu: number;
  memoryMb: number;
}

export interface WorkerNode {
  id: string;
  state: WorkerState;
  capabilities: string[];
  resourceCapacity: ResourceCapacity;
  currentLoad: ResourceLoad;
  lastHeartbeatAt: number;
  registeredAt: number;
}
