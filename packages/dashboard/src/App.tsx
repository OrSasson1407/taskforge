import React, { useState, useEffect } from 'react';
import { Auth } from './views/Auth';
import { connectWebSocket, disconnectWebSocket } from './services/websocket';

export const App: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('auth_token'));
    const [lastEvent, setLastEvent] = useState<string>('No events yet');

    useEffect(() => {
        if (isAuthenticated) {
            connectWebSocket(
                (jobEvent) => setLastEvent(`Job ${jobEvent.jobId} -> ${jobEvent.state}`),
                (workerEvent) => setLastEvent(`Worker ${workerEvent.workerId} -> ${workerEvent.state}`)
            );
        }
        return () => disconnectWebSocket();
    }, [isAuthenticated]);

    if (!isAuthenticated) {
        return <Auth onLogin={() => setIsAuthenticated(true)} />;
    }

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px' }}>
            <h1>TaskForge Dashboard</h1>
            <button onClick={() => { localStorage.removeItem('auth_token'); setIsAuthenticated(false); }}>
                Logout
            </button>
            
            <div style={{ marginTop: '20px', padding: '10px', background: '#eee' }}>
                <h3>Live Event Stream</h3>
                <p>{lastEvent}</p>
            </div>
        </div>
    );
};
