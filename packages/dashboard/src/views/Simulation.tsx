import React from 'react';

export const Simulation: React.FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Simulation Mode</h2>
      <p className="text-gray-600 mb-4">Launch synthetic workloads in an isolated namespace.</p>
      <button className="bg-blue-600 text-white px-4 py-2 rounded">
        Launch Simulation (1000 Jobs)
      </button>
      <button className="bg-red-600 text-white px-4 py-2 rounded ml-2">
        Inject Failure (Kill 30%)
      </button>
    </div>
  );
};
