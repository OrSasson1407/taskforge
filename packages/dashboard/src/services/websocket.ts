import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectWebSocket = (onJobUpdate: (data: any) => void, onWorkerUpdate: (data: any) => void) => {
    if (!socket) {
        socket = io(import.meta.env.VITE_API_URL || 'http://localhost:8080');
        
        socket.on('connect', () => console.log('Connected to Orchestrator WebSocket'));
        socket.on('job-update', onJobUpdate);
        socket.on('worker-update', onWorkerUpdate);
    }
};

export const disconnectWebSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
