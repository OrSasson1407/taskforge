import { createClient } from 'redis';

export class EventPublisher {
  private publisher;

  constructor(redisUrl = 'redis://localhost:6379') {
    this.publisher = createClient({ url: redisUrl });
    this.publisher.connect().catch(console.error);
  }

  // At-most-once delivery for UI convenience[cite: 3]
  async publish(eventType: string, payload: any) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      payload
    };
    
    try {
      await this.publisher.publish('taskforge-events', JSON.stringify(event));
    } catch (err) {
      console.error('Failed to publish event:', err);
    }
  }
}
