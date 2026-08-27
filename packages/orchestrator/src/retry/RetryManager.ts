import { Firestore } from '@google-cloud/firestore';

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;
const JITTER_FACTOR = 0.2;

export class RetryManager {
  constructor(private db: Firestore) {}

  computeBackoff(attempt: number): number {
    const base = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const capped = Math.min(base, MAX_DELAY_MS);
    const jitter = Math.random() * (capped * JITTER_FACTOR);
    return Math.floor(capped + jitter);
  }

  async handleFailure(jobId: string, currentAttempt: number, maxAttempts: number) {
    const jobRef = this.db.collection('jobs').doc(jobId);
    
    if (currentAttempt < maxAttempts) {
      const delayMs = this.computeBackoff(currentAttempt);
      await jobRef.update({ state: 'RETRY_PENDING', nextRetryAt: Date.now() + delayMs });
    } else {
      await jobRef.update({ state: 'DEAD_LETTER' });
    }
  }
}
