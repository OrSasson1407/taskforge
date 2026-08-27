import React, { useEffect, useState } from 'react';
import { wsClient } from '../services/websocket';

export const Overview: React.FC = () => {
  const [stats, setStats] = useState({ active: 0, queued: 0, failed: 0 });

  useEffect(() => {
    // Listen for real-time queue updates from Redis pub/sub[cite: 3]
    wsClient.on('QUEUE_UPDATED', (payload: any) => {
      setStats(prev => ({ ...prev, queued: payload.depth }));
    });
  }, []);

  return (
    <div className="overview-container p-4">
      <h1 className="text-2xl font-bold mb-4">TaskForge Overview</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-blue-100 rounded">Active Jobs: {stats.active}</div>
        <div className="p-4 bg-yellow-100 rounded">Queued Jobs: {stats.queued}</div>
        <div className="p-4 bg-red-100 rounded">Failed Jobs: {stats.failed}</div>
      </div>
    </div>
  );
};
