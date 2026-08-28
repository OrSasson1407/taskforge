import { getFirestore } from 'firebase-admin/firestore';
import { WorkflowDef, WorkflowTaskDef } from '../../../shared/src/Workflow';
import { Job, JobState } from '../../../shared/src/Job';

export class WorkflowManager {
    static validateDAG(tasks: WorkflowTaskDef[]): void {
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        tasks.forEach(t => {
            inDegree.set(t.id, 0);
            adjList.set(t.id, []);
        });

        for (const t of tasks) {
            for (const dep of (t.dependsOn || [])) {
                if (!inDegree.has(dep)) {
                    throw new Error(`Dependency ${dep} referenced by ${t.id} does not exist in workflow.`);
                }
                adjList.get(dep)!.push(t.id);
                inDegree.set(t.id, inDegree.get(t.id)! + 1);
            }
        }

        const queue: string[] = [];
        for (const [node, degree] of inDegree.entries()) {
            if (degree === 0) queue.push(node);
        }

        let visitedCount = 0;
        while (queue.length > 0) {
            const current = queue.shift()!;
            visitedCount++;
            for (const neighbor of adjList.get(current)!) {
                inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
                if (inDegree.get(neighbor) === 0) queue.push(neighbor);
            }
        }

        if (visitedCount !== tasks.length) {
            throw new Error('Cycle detected in workflow DAG. Tasks must form a directed acyclic graph.');
        }
    }

    static async submitWorkflow(def: WorkflowDef): Promise<{ workflowId: string, jobs: Job[] }> {
        this.validateDAG(def.tasks);

        const db = getFirestore();
        const batch = db.batch();
        const now = Date.now();
        
        const workflowRef = db.collection('workflows').doc();
        batch.set(workflowRef, {
            id: workflowRef.id,
            name: def.name,
            state: 'RUNNING',
            createdAt: now
        });

        // Map local task IDs to global job IDs
        const idMap = new Map<string, string>();
        def.tasks.forEach(t => idMap.set(t.id, db.collection('jobs').doc().id));

        const createdJobs: Job[] = [];

        for (const t of def.tasks) {
            const globalId = idMap.get(t.id)!;
            const jobRef = db.collection('jobs').doc(globalId);
            
            const dependencies = (t.dependsOn || []).map(localDep => idMap.get(localDep)!);
            const state: JobState = dependencies.length > 0 ? 'BLOCKED' : 'PENDING';

            const job: Job = {
                id: globalId,
                workflowId: workflowRef.id,
                localId: t.id,
                state,
                payload: t.payload,
                dependencies,
                createdAt: now,
                updatedAt: now
            };

            batch.set(jobRef, job);
            createdJobs.push(job);

            const eventRef = jobRef.collection('events').doc();
            batch.set(eventRef, {
                id: eventRef.id,
                jobId: globalId,
                state,
                timestamp: now,
                message: `Workflow ${workflowRef.id} created task`
            });
        }

        await batch.commit();
        return { workflowId: workflowRef.id, jobs: createdJobs };
    }
}
