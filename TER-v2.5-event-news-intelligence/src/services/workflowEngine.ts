import { randomUUID } from "node:crypto";
import { ObservabilityEngine } from "./observabilityEngine.js";
import { compare, metricValue, type RuleMetric, type RuleOperator } from "./automationEngine.js";
import { pushAutomationNotifications } from "./notificationEngine.js";
import type { MarketAsset, Signal } from "../types.js";

export type WorkflowNodeType = "TRIGGER" | "CONDITION" | "LOGIC" | "ACTION" | "NOTIFICATION" | "JOURNAL" | "SCENARIO";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export interface WorkflowNode { id: string; type: WorkflowNodeType; label: string; config: Record<string, unknown>; }
export interface WorkflowEdge { from: string; to: string; when?: "TRUE" | "FALSE" | "ALWAYS"; }
export interface Workflow { id: string; name: string; description: string; status: WorkflowStatus; nodes: WorkflowNode[]; edges: WorkflowEdge[]; createdAt: string; updatedAt: string; runCount: number; lastRunAt?: string; }
export interface WorkflowRun { id: string; workflowId: string; status: "DRY_RUN" | "SUCCESS" | "ERROR" | "HALTED"; startedAt: string; finishedAt: string; trace: string[]; nodeMetrics?: Record<string, number>; }

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

function evaluateNode(node: WorkflowNode, context: Record<string, any>, trace: string[]): { success: boolean; result?: any } {
  const { type, config, label } = node;
  const { asset, signal, dryRun } = context as { asset?: MarketAsset; signal?: Signal; dryRun: boolean };

  if (type === "TRIGGER") return { success: true };

  if (type === "CONDITION") {
    const metric = config.metric as RuleMetric;
    const operator = config.operator as RuleOperator;
    const target = Number(config.value);

    if (!asset) {
      trace.push(`[${type}] SKIP: No asset context for ${label}`);
      return { success: false };
    }

    const value = metricValue(metric, asset, signal);
    const ok = compare(value, operator, target);
    trace.push(`[${type}] ${label}: ${metric} (${Number.isFinite(value) ? value : "N/A"}) ${operator} ${target} -> ${ok ? "PASS" : "FAIL"}`);
    return { success: ok };
  }

  if (type === "LOGIC") {
    return { success: true }; // Simplified linear logic for now
  }

  if (type === "NOTIFICATION") {
    if (dryRun) {
      trace.push(`[${type}] DRY_RUN: Notification skipped (${label})`);
      return { success: true };
    }
    if (asset) {
      pushAutomationNotifications([{
        symbol: asset.symbol,
        title: `Workflow: ${label}`,
        message: `Déclenché par le workflow pour ${asset.symbol}`,
        severity: (config.severity as any) || "MEDIUM",
        source: "Workflow Engine"
      }]);
      trace.push(`[${type}] Sent notification for ${asset.symbol}`);
    }
    return { success: true };
  }

  if (type === "JOURNAL") {
    trace.push(`[${type}] Action performed: ${config.action ?? label}`);
    return { success: true };
  }

  return { success: true };
}

/**
 * Functional traversal for Tracing.
 * Evaluates the workflow logic and records timing per node.
 */
export function runWorkflow(id: string, dryRun = true, inputContext: Record<string, any> = {}): WorkflowRun | null {
  const wf = workflows.find(x => x.id === id);
  if (!wf) return null;
  const started = new Date();
  const trace: string[] = [`Tracing Start: ${wf.name}`, `Mode: ${dryRun ? "DRY_RUN" : "LIVE"}`];
  const nodeMetrics: Record<string, number> = {};

  let currentNodeId = wf.nodes.find(n => n.type === "TRIGGER")?.id;
  let status: WorkflowRun["status"] = dryRun ? "DRY_RUN" : "SUCCESS";

  while (currentNodeId) {
    const nodeStart = Date.now();
    const node = wf.nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    const { success } = evaluateNode(node, { ...inputContext, dryRun }, trace);
    nodeMetrics[node.id] = Date.now() - nodeStart;

    const when = success ? "TRUE" : "FALSE";
    // Find next edge. Priority: explicit TRUE/FALSE, then ALWAYS, then implicit success-based.
    const nextEdge = wf.edges.find(e => e.from === currentNodeId && e.when === when) ||
                     wf.edges.find(e => e.from === currentNodeId && e.when === "ALWAYS") ||
                     wf.edges.find(e => e.from === currentNodeId && !e.when && success);

    currentNodeId = nextEdge?.to;

    if (!success && !nextEdge) {
      status = "HALTED";
      trace.push(`[${node.type}] HALTED: Condition not met and no alternative path.`);
      break;
    }
  }

  const finished = new Date();
  const run: WorkflowRun = { id: randomUUID(), workflowId: id, status, startedAt: started.toISOString(), finishedAt: finished.toISOString(), trace, nodeMetrics };

  runs.unshift(run);
  wf.runCount += 1;
  wf.lastRunAt = finished.toISOString();

  ObservabilityEngine.recordMetric("workflow_latency", finished.getTime() - started.getTime(), "ms", { workflowId: id, status });

  return run;
}

export function getWorkflowRuns(workflowId?: string) { return workflowId ? runs.filter(x => x.workflowId === workflowId) : [...runs]; }
export function workflowStats() { return { workflows: workflows.length, active: workflows.filter(x => x.status === "ACTIVE").length, paused: workflows.filter(x => x.status === "PAUSED").length, drafts: workflows.filter(x => x.status === "DRAFT").length, runs: runs.length }; }
