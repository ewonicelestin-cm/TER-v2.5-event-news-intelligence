import type { AIDecision } from "./aiDecisionEngine";
import type { MarketAsset } from "../types";
import { calibrationReport, resolveObservation, type CalibrationObservation, type CalibrationReport } from "./probabilityCalibration";

const journal: CalibrationObservation[] = [];
const MAX = 5000;

export function recordDecision(asset: MarketAsset, decision: AIDecision, horizonHours = 24): CalibrationObservation {
  const obs: CalibrationObservation = { id: `${asset.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, symbol: asset.symbol, generatedAt: decision.generatedAt, horizonHours, entryPrice: asset.price, probability: decision.probability };
  journal.push(obs);
  if (journal.length > MAX) journal.splice(0, journal.length - MAX);
  return obs;
}

export function resolveDue(assetMap: Map<string, MarketAsset>, now = Date.now()): number {
  let resolved = 0;
  for (let i = 0; i < journal.length; i++) {
    const obs = journal[i];
    if (obs.outcome) continue;
    const due = new Date(obs.generatedAt).getTime() + obs.horizonHours * 3600_000;
    if (due > now) continue;
    const asset = assetMap.get(obs.symbol);
    if (!asset || !Number.isFinite(asset.price)) continue;
    journal[i] = resolveObservation(obs, asset.price, new Date(now).toISOString());
    resolved++;
  }
  return resolved;
}

export function getJournal(symbol?: string) {
  return journal.filter(o => !symbol || o.symbol === symbol).slice().reverse();
}

export function getCalibration(symbol: string): CalibrationReport {
  return calibrationReport(getJournal(symbol), symbol);
}
