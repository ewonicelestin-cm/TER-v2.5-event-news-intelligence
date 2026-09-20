import type { PaperAccount } from "./paperTrading";
import type { KillSwitchState } from "./riskEngine";

/**
 * Thin client for the paper-trading endpoints exposed by server/index.ts.
 * The signal engine, indicators, and backtest all run client-side (see
 * App.tsx) — but paper trading has real state (an account, a kill switch)
 * that must live in one place, so it goes through the API instead of being
 * duplicated in the browser. Every function here degrades gracefully to an
 * `ApiResult` with `ok: false` instead of throwing, since the API server is
 * optional (`npm run dev` alone doesn't start it) and the UI needs to say
 * "the API isn't running" rather than crash.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";
const TIMEOUT_MS = 5000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (body && typeof body === "object" && "error" in body) ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === "TimeoutError";
    return { ok: false, error: isAbort ? "délai dépassé — API injoignable" : "API injoignable (server non démarré ?)" };
  }
}

export interface PaperAccountResponse {
  account: PaperAccount;
  killSwitch: KillSwitchState;
}

export function getPaperAccount() {
  return request<PaperAccountResponse>("/api/paper/account");
}

export interface OpenPositionResponse {
  opened: boolean;
  reason: string;
  account: PaperAccount;
}

export function openPaperPosition(symbol: string, riskPercent = 1) {
  return request<OpenPositionResponse>("/api/paper/open", {
    method: "POST",
    body: JSON.stringify({ symbol, riskPercent })
  });
}

export interface ClosePositionResponse {
  trade: PaperAccount["closedTrades"][number];
  account: PaperAccount;
  killSwitch: KillSwitchState;
}

export function closePaperPosition(symbol: string) {
  return request<ClosePositionResponse>("/api/paper/close", {
    method: "POST",
    body: JSON.stringify({ symbol })
  });
}

export function resetKillSwitch() {
  return request<{ killSwitch: KillSwitchState }>("/api/paper/reset-kill-switch", { method: "POST" });
}

export function getSignals() {
  return request<import("../types").Signal[]>("/api/signals");
}


export interface CalibrationReport {
  symbol: string; sampleSize: number; resolved: number; pending: number;
  brierScore: number | null; logLoss: number | null; accuracy: number | null; meanConfidence: number | null;
  reliability: { bucket: string; count: number; predicted: number; observed: number; gap: number }[];
  status: "INSUFFICIENT_SAMPLE" | "CALIBRATING"; note: string;
}

export function getCalibration(symbol: string) {
  return request<CalibrationReport>(`/api/ai/calibration/${encodeURIComponent(symbol)}`);
}

export interface PortfolioRiskReport {
  generatedAt: string; equity: number; cash: number; grossExposure: number; netExposure: number;
  exposurePercent: number; concentrationPercent: number; openPositions: number;
  portfolioVolatilityPercent: number; estimatedDailyVaRPercent: number; estimatedDailyVaR: number;
  stress: { name: string; pnlPercent: number; pnlAmount: number }[];
  byAssetClass: { assetClass: string; notional: number; percent: number }[];
  positions: { symbol: string; direction: string; entry: number; currentPrice: number; size: number; notional: number; pnl: number; weightPercent: number; stopRisk: number; stopRiskPercent: number }[];
  correlations: { a: string; b: string; value: number }[];
  warnings: string[];
}
export function getPortfolioRisk() { return request<PortfolioRiskReport>("/api/risk/portfolio"); }


export interface PortfolioOptimizationReport {
  generatedAt:string; method:"EQUAL_WEIGHT"|"INVERSE_VOL"|"RISK_PARITY_APPROX"; capital:number; investableCapital:number;
  maxPositionPercent:number; maxAssetClassPercent:number; grossTargetPercent:number; estimatedVolatilityPercent:number; estimatedConcentrationPercent:number;
  positions:{symbol:string;assetClass:string;currentWeight:number;targetWeight:number;deltaWeight:number;currentNotional:number;targetNotional:number;rationale:string}[];
  byAssetClass:{assetClass:string;currentPercent:number;targetPercent:number}[]; changes:string[]; constraints:string[]; disclaimer:string;
}
export function getPortfolioOptimization(method="RISK_PARITY_APPROX") { return request<PortfolioOptimizationReport>(`/api/risk/optimize?method=${encodeURIComponent(method)}`); }


export function getAssetIntelligence(symbol: string) {
  return request<import("./unifiedAssetIntelligence").UnifiedAssetIntelligence>(`/api/asset-intelligence/${encodeURIComponent(symbol)}`);
}


export interface IntelligenceOverviewResponse {
  generatedAt: string; engineVersion: string; coverage: number; globalConfidence: number; signalCount: number; contradictions: number; regime: string;
  controls: { dataQuality: number; modelAgreement: number; freshness: number; uncertainty: number };
  decision: { stance: string; probabilities: { bullish:number; neutral:number; bearish:number }; scenario: { base:string; upside:string; downside:string; invalidation:string }; contradictions: Array<{id:string;severity:string;description:string;resolution:string}> };
  warnings: string[]; scenarios: Array<{id:string;name:string;probability:number;trigger:string;impact?:string;invalidation?:string}>;
  graph: { nodes:Array<{id:string;kind:string;label:string;score:number;quality:number;origin:string}>; edges:Array<{from:string;to:string;relation:string;strength:number}>; density:number };
  pipeline: Array<{stage:string;status:string;latencyMs:number;dependencies:number}>;
  sources: Array<{value:string;provenance:{source:string;origin:string;qualityScore:number;timestamp:string;methodology:string;dependencies:string[]}}>
}

export async function getIntelligenceOverview(): Promise<{ok:true; data:IntelligenceOverviewResponse} | {ok:false; error:string}> {
  try { const r = await fetch("/api/intelligence/overview"); if (!r.ok) return {ok:false,error:`HTTP ${r.status}`}; return {ok:true,data:await r.json()}; }
  catch (e) { return {ok:false,error:e instanceof Error ? e.message : "network error"}; }
}
