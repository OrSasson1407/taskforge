export interface WorkflowTaskDef {
    id: string; // Local identifier within the workflow
    payload: Record<string, any>;
    dependsOn?: string[]; // Array of local task IDs this task depends on
}

export interface WorkflowDef {
    name: string;
    tasks: WorkflowTaskDef[];
}

export interface WorkflowInstance {
    id: string;
    name: string;
    state: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_FAILURE';
    createdAt: number;
}
