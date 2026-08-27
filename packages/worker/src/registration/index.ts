export async function registerWorker(orchestratorUrl: string, token: string, capacity: any) {
  const res = await fetch(\\/api/v1/workers/register\, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \Bearer \\
    },
    body: JSON.stringify(capacity)
  });
  
  if (!res.ok) throw new Error('Worker registration failed');
  return res.json();
}
