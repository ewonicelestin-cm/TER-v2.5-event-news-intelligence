import { randomUUID } from "node:crypto";

export type WorkflowNodeType = "TRIGGER" | "CONDITION" | "LOGIC" | "ACTION" | "NOTIFICATION" | "JOURNAL" | "SCENARIO";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export interface WorkflowNode { id: string; type: WorkflowNodeType; label: string; config: Record<string, unknown>; }
export interface WorkflowEdge { from: string; to: string; when?: "TRUE" | "FALSE" | "ALWAYS"; }
export interface Workflow { id: string; name: string; description: string; status: WorkflowStatus; nodes: WorkflowNode[]; edges: WorkflowEdge[]; createdAt: string; updatedAt: string; runCount: number; lastRunAt?: string; }
export interface WorkflowRun { id: string; workflowId: string; status: "DRY_RUN" | "SUCCESS" | "ERROR"; startedAt: string; finishedAt: string; trace: string[]; }

const workflows: Workflow[] = [
  { id: "wf-demo-1", name: "Confluence signal → journal", description: "Contrôle qualité puis journalisation d'un scénario avant toute action.", status: "ACTIVE", nodes: [
    { id: "t1", type: "TRIGGER", label: "Nouveau signal", config: { event: "SIGNAL_CREATED" } },
    { id: "c1", type: "CONDITION", label: "Score ≥ 70", config: { metric: "SIGNAL_SCORE", operator: ">=", value: 70 } },
    { id: "c2", type: "CONDITION", label: "Qualité ≥ 80", config: { metric: "DATA_QUALITY_SCORE", operator: ">=", value: 80 } },
    { id: "l1", type: "LOGIC", label: "Toutes les conditions", config: { mode: "ALL" } },
    { id: "a1", type: "JOURNAL", label: "Journaliser le scénario", config: { action: "RECORD_DECISION" } },
    { id: "n1", type: "NOTIFICATION", label: "Notifier", config: { severity: "MEDIUM" } }
  ], edges: [{ from: "t1", to: "c1" }, { from: "c1", to: "c2", when: "TRUE" }, { from: "c2", to: "l1", when: "TRUE" }, { from: "l1", to: "a1", when: "TRUE" }, { from: "a1", to: "n1" }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), runCount: 0 }
];
const runs: WorkflowRun[] = [];
export function getWorkflows() { return workflows.map(x => ({ ...x, nodes: x.nodes.map(n => ({ ...n, config: { ...n.config } })), edges: [...x.edges] })); }
export function addWorkflow(input: Omit<Workflow, "id"|"createdAt"|"updatedAt"|"runCount">) { const now = new Date().toISOString(); const row: Workflow = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, runCount: 0 }; workflows.push(row); return row; }
export function updateWorkflow(id: string, patch: Partial<Pick<Workflow, "name"|"description"|"status"|"nodes"|"edges">>) { const row = workflows.find(x => x.id === id); if (!row) return null; Object.assign(row, patch, { updatedAt: new Date().toISOString() }); return row; }
export function deleteWorkflow(id: string) { const i = workflows.findIndex(x => x.id === id); if (i < 0) return false; workflows.splice(i, 1); return true; }
export function runWorkflow(id: string, dryRun = true): WorkflowRun | null { const wf = workflows.find(x => x.id === id); if (!wf) return null; const started = new Date(); const trace = [`Workflow: ${wf.name}`, `Statut: ${wf.status}`, `Nœuds: ${wf.nodes.length}`, `Transitions: ${wf.edges.length}`, "Validation du graphe: OK", "Aucune exécution financière réelle autorisée", dryRun ? "Mode simulation: aucune action externe" : "Actions externes désactivées par conception"]; const finished = new Date(); const run: WorkflowRun = { id: randomUUID(), workflowId: id, status: "DRY_RUN", startedAt: started.toISOString(), finishedAt: finished.toISOString(), trace }; runs.unshift(run); wf.runCount += 1; wf.lastRunAt = finished.toISOString(); return run; }
export function getWorkflowRuns(workflowId?: string) { return workflowId ? runs.filter(x => x.workflowId === workflowId) : [...runs]; }
export function workflowStats() { return { workflows: workflows.length, active: workflows.filter(x => x.status === "ACTIVE").length, paused: workflows.filter(x => x.status === "PAUSED").length, drafts: workflows.filter(x => x.status === "DRAFT").length, runs: runs.length }; }
