import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Overview } from './views/Overview';
import { Jobs } from './views/Jobs';
import { JobDetails } from './views/JobDetails';
import { Workers } from './views/Workers';
import { Workflow } from './views/Workflow';
import { Simulation } from './views/Simulation';
import { Monitoring } from './views/Monitoring';
import { Auth } from './views/Auth';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50">
        <nav className="w-64 bg-gray-800 text-white p-4">
          <h1 className="text-xl font-bold mb-8">TaskForge</h1>
          <ul className="space-y-2">
            <li><Link to="/" className="hover:text-blue-300">Overview</Link></li>
            <li><Link to="/jobs" className="hover:text-blue-300">Jobs</Link></li>
            <li><Link to="/workers" className="hover:text-blue-300">Workers</Link></li>
            <li><Link to="/workflows" className="hover:text-blue-300">Workflows</Link></li>
            <li><Link to="/monitoring" className="hover:text-blue-300">Monitoring</Link></li>
            <li><Link to="/simulation" className="hover:text-blue-300">Simulation Mode</Link></li>
          </ul>
        </nav>
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetails />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/workflows" element={<Workflow />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/simulation" element={<Simulation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
