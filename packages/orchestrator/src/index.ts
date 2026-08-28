import { app } from './api/ApiGateway';
import { Scheduler } from './scheduler/Scheduler';
import { EventPublisher } from './events/EventPublisher';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;
const server = createServer(app);

// Initialize WebSocket for Phase 7
EventPublisher.init(server);

server.listen(PORT, () => {
    console.log(`[Orchestrator] API Gateway running on port ${PORT}`);
    
    // Start Phase 4 background polling
    Scheduler.startPolling(5000);
});
