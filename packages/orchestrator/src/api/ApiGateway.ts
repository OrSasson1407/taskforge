import express from 'express';
import { Firestore } from '@google-cloud/firestore';

export class ApiGateway {
  public app = express();

  constructor(private db: Firestore) {
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.post('/api/v1/jobs', async (req, res) => {
      const { type, payload, priority = 0 } = req.body;
      const jobRef = this.db.collection('jobs').doc();
      
      await jobRef.set({
        type,
        payload,
        priority,
        state: 'QUEUED',
        createdAt: Date.now(),
        attempt: 0,
        maxAttempts: 3
      });
      
      res.status(201).json({ jobId: jobRef.id, state: 'QUEUED' });
    });
  }

  start(port: number) {
    this.app.listen(port, () => {
      console.log(\API Gateway listening on port \\);
    });
  }
}
