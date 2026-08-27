import React from 'react';

export const JobDetails: React.FC<{ jobId?: string }> = ({ jobId = 'example-123' }) => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Job Details: {jobId}</h2>
      <div className="mt-4 p-4 border rounded bg-white">
        <p><strong>State:</strong> <span className="text-blue-600">RUNNING</span></p>
        <p><strong>Type:</strong> data-aggregation</p>
        <p><strong>Attempt:</strong> 1 / 3</p>
        <div className="mt-4">
          <h3 className="font-semibold">Event Timeline</h3>
          <ul className="list-disc pl-5 mt-2 text-sm text-gray-700">
            <li>CREATED - 10:00:00 AM</li>
            <li>QUEUED - 10:00:01 AM</li>
            <li>ASSIGNED (Worker-A) - 10:00:02 AM</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
