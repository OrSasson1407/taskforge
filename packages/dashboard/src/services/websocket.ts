export class TaskForgeWebSocket {
  private ws: WebSocket | null = null;
  private listeners: Record<string, Function[]> = {};

  connect(url = 'ws://localhost:8080') {
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // At-most-once delivery handling for UI updates[cite: 3]
      if (this.listeners[data.type]) {
        this.listeners[data.type].forEach(cb => cb(data.payload));
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket disconnected. Dashboard will fallback and reconnect in 5s...');
      setTimeout(() => this.connect(url), 5000);
    };
  }

  on(eventType: string, callback: Function) {
    if (!this.listeners[eventType]) this.listeners[eventType] = [];
    this.listeners[eventType].push(callback);
  }
}

export const wsClient = new TaskForgeWebSocket();
