const API_BASE = '/api/v1';

export const api = {
  // Submit a single job (FR-001)[cite: 3]
  async submitJob(type: string, payload: any, priority = 0) {
    const res = await fetch(\\/jobs\, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, priority })
    });
    if (!res.ok) throw new Error('Failed to submit job');
    return res.json();
  },

  async getMetrics() {
    const res = await fetch(\\/metrics\);
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
  }
};
