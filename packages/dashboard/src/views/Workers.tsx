import React from 'react';

export const Workers: React.FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Worker Fleet Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
         <div className="p-4 border rounded shadow-sm">
           <h3 className="font-semibold">Worker Node Placeholder</h3>
           <p className="text-sm text-green-600">IDLE</p>
         </div>
      </div>
    </div>
  );
};
