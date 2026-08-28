import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export class EventPublisher {
    private static io: SocketIOServer;

    static init(server: HttpServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: '*', // For dev; restrict in prod
                methods: ['GET', 'POST']
            }
        });

        this.io.on('connection', (socket) => {
            console.log(\[WebSocket] Client connected: \\);
            socket.on('disconnect', () => {
                console.log(\[WebSocket] Client disconnected: \\);
            });
        });
    }

    static broadcastJobState(jobId: string, newState: string) {
        if (this.io) {
            this.io.emit('job-update', { jobId, state: newState, timestamp: Date.now() });
        }
    }

    static broadcastWorkerState(workerId: string, newState: string) {
        if (this.io) {
            this.io.emit('worker-update', { workerId, state: newState, timestamp: Date.now() });
        }
    }
}
