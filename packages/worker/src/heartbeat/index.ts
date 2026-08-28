export function startHeartbeat(orchestratorUrl: string, workerId: string, token: string, intervalMs = 5000) {
  setInterval(async () => {
    try {
      await fetch(`${orchestratorUrl}/workers/${workerId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentLoad: { activeJobs: 0, cpu: 0.1, memoryMb: 128 } // Stub metric
        })
      });
    } catch (err) {
      console.error('Failed to send heartbeat:', err);
    }
  }, intervalMs);
}
