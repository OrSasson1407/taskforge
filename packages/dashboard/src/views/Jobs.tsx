import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export const Jobs: React.FC = () => {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    // Initial poll, normally supplemented by WS events
    fetch('/api/v1/jobs')
      .then(res => res.json())
      .then(data => setJobs(data.items || []))
      .catch(console.error);
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Jobs</h2>
      <table className="min-w-full mt-4">
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>State</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job: any) => (
            <tr key={job.id}>
              <td>{job.id}</td>
              <td>{job.type}</td>
              <td>{job.state}</td>
              <td>{job.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
