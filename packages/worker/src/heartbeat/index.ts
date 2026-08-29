import { CurrentLoad } from '../../../shared/src/Worker';

export function startHeartbeat(
    orchestratorUrl: string,
    workerId: string,
    token: string,
    intervalMs = 5000,
    getCurrentLoad: () => CurrentLoad = () => ({ activeJobs: 0, cpu: 0.1, memoryMb: 128 })
) {
    setInterval(async () => {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${orchestratorUrl}/workers/${workerId}/heartbeat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ currentLoad: getCurrentLoad() })
            });
            if (!res.ok) {
                console.error(`[Worker ${workerId}] Heartbeat rejected: ${res.status} ${res.statusText}`);
            }
        } catch (err: any) {
            console.error(`[Worker ${workerId}] Heartbeat failed:`, err.message);
        }
    }, intervalMs);
}