import React from 'react';

export const Monitoring: React.FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">System Metrics</h2>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="h-48 bg-gray-50 border flex items-center justify-center">
          [ Jobs / Sec Chart ]
        </div>
        <div className="h-48 bg-gray-50 border flex items-center justify-center">
          [ P95 Latency Chart ]
        </div>
      </div>
    </div>
  );
};
