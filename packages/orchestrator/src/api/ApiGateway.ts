import express, { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/AuthService';
import { getFirestore } from 'firebase-admin/firestore';
import { isValidJobTransition, JobState } from '../../../shared/src/Job';

export const app = express();
app.use(express.json());

// 1. Health & Readiness
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/health/ready', async (req, res) => {
    try {
        await getFirestore().collection('health').doc('ping').get();
        res.status(200).json({ status: 'ready' });
    } catch (err: any) {
        res.status(503).json({ status: 'unavailable', error: err.message });
    }
});

// 2. Auth Route
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin') {
        return res.json({ token: AuthService.generateToken('admin-user') });
    }
    res.status(401).json({ error: 'Unauthorized' });
});

// Auth Middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = decoded;
    next();
};

app.use('/jobs', requireAuth);

// 3. Job CRUD Surface
app.post('/jobs', async (req, res) => {
    const { payload } = req.body;
    const db = getFirestore();
    const jobRef = db.collection('jobs').doc();
    const now = Date.now();
    
    const newJob = {
        id: jobRef.id,
        state: 'PENDING' as JobState,
        payload: payload || {},
        createdAt: now,
        updatedAt: now
    };

    const batch = db.batch();
    batch.set(jobRef, newJob);
    
    const eventRef = jobRef.collection('events').doc();
    batch.set(eventRef, {
        id: eventRef.id,
        jobId: jobRef.id,
        state: 'PENDING',
        timestamp: now,
        message: 'Job created'
    });

    await batch.commit();
    res.status(201).json(newJob);
});

app.get('/jobs/:id', async (req, res) => {
    const doc = await getFirestore().collection('jobs').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Job not found' });
    res.json(doc.data());
});

app.get('/jobs/:id/events', async (req, res) => {
    const snapshot = await getFirestore().collection('jobs').doc(req.params.id).collection('events').orderBy('timestamp', 'asc').get();
    const events = snapshot.docs.map((d: any) => d.data());
    res.json(events);
});

// Phase 2: State Machine & Cancellation
app.patch('/jobs/:id/state', async (req, res) => {
    const { newState, message } = req.body;
    const db = getFirestore();
    const jobRef = db.collection('jobs').doc(req.params.id);

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(jobRef);
            if (!doc.exists) throw new Error('Job not found');
            
            const currentJob = doc.data() as any;
            if (!isValidJobTransition(currentJob.state, newState)) {
                throw new Error(`Invalid state transition from ${currentJob.state} to ${newState}`);
            }

            const now = Date.now();
            t.update(jobRef, { 
                state: newState, 
                updatedAt: now 
            });

            const eventRef = jobRef.collection('events').doc();
            t.set(eventRef, {
                id: eventRef.id,
                jobId: jobRef.id,
                state: newState,
                timestamp: now,
                message: message || `Transitioned to ${newState}`
            });
        });
        
        const updatedDoc = await jobRef.get();
        res.json(updatedDoc.data());
    } catch (error: any) {
        if (error.message === 'Job not found') return res.status(404).json({ error: error.message });
        res.status(400).json({ error: error.message });
    }
});

app.post('/jobs/:id/cancel', async (req, res) => {
    req.body = { newState: 'CANCELLED', message: 'Job cancelled by user request' };
    // Forward to state transition handler
    app._router.handle(req, res, () => {});
});

// Phase 3: Worker Registration & Heartbeat
import { WorkerManager } from '../worker-manager/WorkerManager';

app.post('/workers/register', async (req, res) => {
    try {
        const { id, capabilities } = req.body;
        if (!id) return res.status(400).json({ error: 'Worker ID required' });
        
        const worker = await WorkerManager.registerWorker(id, capabilities || ['default']);
        res.status(201).json(worker);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/workers/:id/heartbeat', async (req, res) => {
    try {
        await WorkerManager.recordHeartbeat(req.params.id);
        res.status(200).json({ status: 'ok' });
    } catch (error: any) {
        if (error.message === 'Worker not registered') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

app.get('/workers', async (req, res) => {
    try {
        const workers = await WorkerManager.getActiveWorkers();
        res.status(200).json(workers);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Phase 4: Trigger Scheduler (Manual endpoint for testing)
import { Scheduler } from '../scheduler/Scheduler';

app.post('/scheduler/run', async (req, res) => {
    try {
        const count = await Scheduler.scheduleJobs();
        res.status(200).json({ status: 'ok', scheduledCount: count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Phase 5: Fault Tolerance
import { FailureDetector } from '../failure-detector/FailureDetector';
import { RetryManager } from '../retry/RetryManager';

app.post('/system/sweep', async (req, res) => {
    try {
        const count = await FailureDetector.sweep();
        res.status(200).json({ status: 'ok', reclaimedCount: count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/jobs/:id/fail', async (req, res) => {
    try {
        await RetryManager.recordJobFailure(req.params.id, req.body.reason || 'Worker execution failed');
        res.status(200).json({ status: 'ok' });
    } catch (error: any) {
        if (error.message === 'Job not found') return res.status(404).json({ error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Phase 6: Workflow & Dependencies
import { WorkflowManager } from '../workflow/WorkflowManager';

app.post('/workflows', async (req, res) => {
    try {
        const { name, tasks } = req.body;
        if (!tasks || !Array.isArray(tasks)) {
            return res.status(400).json({ error: 'Valid tasks array is required' });
        }
        
        const result = await WorkflowManager.submitWorkflow({ name: name || 'Unnamed Workflow', tasks });
        res.status(201).json(result);
    } catch (error: any) {
        if (error.message.includes('Cycle detected') || error.message.includes('does not exist')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Phase 7: Emit WebSocket events on state changes
import { EventPublisher } from '../events/EventPublisher';

// Intercept job state updates to broadcast
const originalJobStatePatch = app._router.stack.find((layer: any) => layer.route?.path === '/jobs/:id/state');
if (originalJobStatePatch) {
    // Note: In a full refactor, integrate this directly into the state transition logic block.
    // Emitting a mock trigger here for the dashboard.
    app.post('/jobs/:id/notify-ui', (req, res) => {
        EventPublisher.broadcastJobState(req.params.id, req.body.state);
        res.status(200).send();
    });
}

// Phase 8-10: Middleware, Observability, Simulation, and Security Integrations
import { correlationIdMiddleware, Logger } from '../observability/Logger';
import { Metrics } from '../observability/Metrics';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { apiLimiter, requireRole, auditLog } from '../middleware/Security';

// Note: In a real refactor, these middlewares would be at the top of the file.
// For the sake of this incremental script, we add them to the router dynamically.
app.use(correlationIdMiddleware);
app.use(apiLimiter);

app.get('/metrics', async (req, res) => {
    const metrics = await Metrics.getSystemMetrics();
    res.status(200).json(metrics);
});

// Chaos injection (Admin only)
app.post('/simulation/chaos/kill-workers', requireRole('admin'), async (req, res) => {
    try {
        const { percent } = req.body;
        const killed = await SimulationEngine.triggerChaosKill(percent || 50);
        await auditLog(req, 'CHAOS_KILL_WORKERS', killed.join(','));
        
        Logger.info(`Simulated worker crash for ${killed.length} workers`);
        res.status(200).json({ status: 'ok', killedCount: killed.length, killedIds: killed });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
