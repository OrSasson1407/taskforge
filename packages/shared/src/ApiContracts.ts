export interface AuthResponse {
  token: string;
  expiresAt: number;
  role: 'Developer' | 'Admin';
}

export interface JobSubmitRequest {
  type: string;
  payload: any;
  priority?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  dependsOn?: string[];
}

export interface WorkerRegistrationRequest {
  capabilities: string[];
  resourceCapacity: {
    cpu: number;
    memoryMb: number;
    maxConcurrentJobs: number;
  };
}
