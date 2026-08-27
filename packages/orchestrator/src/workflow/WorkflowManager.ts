import { Firestore } from '@google-cloud/firestore';

export class WorkflowManager {
  constructor(private db: Firestore) {}

  // DFS-based cycle detection per Document 3[cite: 4]
  validateDag(jobIds: string[], edges: { from: string, to: string }[]): string[] | null {
    const graph: Record<string, string[]> = {};
    jobIds.forEach(id => graph[id] = []);
    edges.forEach(e => graph[e.from].push(e.to));

    const color: Record<string, number> = {};
    const WHITE = 0, GRAY = 1, BLACK = 2;
    jobIds.forEach(id => color[id] = WHITE);

    for (const id of jobIds) {
      if (color[id] === WHITE) {
        const cycle = this.dfs(id, graph, color, [id]);
        if (cycle) return cycle;
      }
    }
    return null;
  }

  private dfs(node: string, graph: Record<string, string[]>, color: Record<string, number>, path: string[]): string[] | null {
    color[node] = 1; // GRAY
    for (const neighbor of graph[node] || []) {
      if (color[neighbor] === 1) return [...path, neighbor];
      if (color[neighbor] === 0) {
        const result = this.dfs(neighbor, graph, color, [...path, neighbor]);
        if (result) return result;
      }
    }
    color[node] = 2; // BLACK
    return null;
  }
}
