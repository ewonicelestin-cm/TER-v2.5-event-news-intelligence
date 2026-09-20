import { randomUUID } from "node:crypto";

export interface MetricSnapshot { requests: number; errors: number; totalLatencyMs: number; activeRequests: number; providerFailures: Record<string, number>; lastErrorAt: string | null; startedAt: string; }
const startedAt = new Date().toISOString();
const metrics: MetricSnapshot = { requests: 0, errors: 0, totalLatencyMs: 0, activeRequests: 0, providerFailures: {}, lastErrorAt: null, startedAt };
const recentLogs: Array<{ id: string; level: "INFO" | "WARN" | "ERROR"; event: string; data: unknown; at: string }> = [];
function log(level: "INFO" | "WARN" | "ERROR", event: string, data: unknown = {}) { const row = { id: randomUUID(), level, event, data, at: new Date().toISOString() }; recentLogs.push(row); if (recentLogs.length > 200) recentLogs.shift(); if (process.env.LOG_FORMAT !== "json") console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](`[${level}] ${event}`, data); else console.log(JSON.stringify(row)); }
export function beginRequest() { metrics.requests += 1; metrics.activeRequests += 1; const started = Date.now(); return (error?: unknown) => { metrics.activeRequests = Math.max(0, metrics.activeRequests - 1); metrics.totalLatencyMs += Date.now() - started; if (error) { metrics.errors += 1; metrics.lastErrorAt = new Date().toISOString(); } }; }
export function recordProviderFailure(provider: string) { metrics.providerFailures[provider] = (metrics.providerFailures[provider] ?? 0) + 1; log("WARN", "provider_failure", { provider }); }
export function recordEvent(event: string, data?: unknown) { log("INFO", event, data); }
export function recordError(event: string, data?: unknown) { metrics.errors += 1; metrics.lastErrorAt = new Date().toISOString(); log("ERROR", event, data); }
export function getMetrics() { return { ...metrics, averageLatencyMs: metrics.requests ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0, uptimeSeconds: Math.round((Date.now() - Date.parse(startedAt)) / 1000) }; }
export function getRecentLogs(limit = 50) { return recentLogs.slice(-Math.max(1, Math.min(200, limit))); }
