import { ResourceCapacity, WorkerNode } from '../../../shared/src/Worker';

export interface RegisterWorkerOptions {
    id: string;
    capabilities: string[];
    resourceCapacity: ResourceCapacity;
}

export async function registerWorker(orchestratorUrl: string, token: string, options: RegisterWorkerOptions): Promise<WorkerNode> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${orchestratorUrl}/workers/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options)
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Worker registration failed: ${body.error || res.statusText}`);
    }
    return res.json();
}