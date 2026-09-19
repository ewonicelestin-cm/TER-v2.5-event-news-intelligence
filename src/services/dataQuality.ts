import type { OHLCVBar } from "../types.js";

export type DataQualityStatus = "FRESH" | "STALE" | "INVALID" | "SYNTHETIC";

export interface DataQualityReport {
  status: DataQualityStatus;
  score: number;
  source: "live" | "synthetic";
  provider: string;
  bars: number;
  latestTs: string | null;
  ageSeconds: number | null;
  intervalSeconds: number | null;
  duplicateBars: number;
  invalidBars: number;
  gapCount: number;
  maxGapSeconds: number;
  warnings: string[];
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "4h": 14400, "1d": 86400, "1D": 86400,
};

export function timeframeSeconds(timeframe: string): number | null {
  return TIMEFRAME_SECONDS[timeframe] ?? null;
}

export function normalizeBars(input: OHLCVBar[], timeframe?: string): OHLCVBar[] {
  const sorted = [...input]
    .filter(b => Number.isFinite(Date.parse(b.ts)))
    .map(b => ({ ...b, ts: new Date(b.ts).toISOString() }))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const seen = new Set<string>();
  const result: OHLCVBar[] = [];
  for (const bar of sorted) {
    if (seen.has(bar.ts)) continue;
    seen.add(bar.ts);
    const open = Number(bar.open), high = Number(bar.high), low = Number(bar.low), close = Number(bar.close), volume = Number(bar.volume ?? 0);
    if (![open, high, low, close, volume].every(Number.isFinite)) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || low <= 0) continue;
    result.push({ ...bar, open, high, low, close, volume });
  }
  return result;
}

export function assessDataQuality(barsInput: OHLCVBar[], source: "live" | "synthetic", provider = "unknown", timeframe = "1d", nowMs = Date.now()): DataQualityReport {
  const bars = normalizeBars(barsInput, timeframe);
  const warnings: string[] = [];
  const expected = timeframeSeconds(timeframe);
  const originalDuplicateCount = Math.max(0, barsInput.length - new Set(barsInput.map(b => b.ts)).size);
  const invalidBars = Math.max(0, barsInput.length - bars.length - originalDuplicateCount);
  let gapCount = 0;
  let maxGapSeconds = 0;
  const gaps = expected ? expected * 1.75 : Infinity;

  for (let i = 1; i < bars.length; i++) {
    const delta = (Date.parse(bars[i].ts) - Date.parse(bars[i - 1].ts)) / 1000;
    if (delta > maxGapSeconds) maxGapSeconds = delta;
    if (delta > gaps) gapCount++;
  }

  const latestTs = bars.length ? bars[bars.length - 1].ts : null;
  const ageSeconds = latestTs ? Math.max(0, (nowMs - Date.parse(latestTs)) / 1000) : null;
  const staleThreshold = expected ? expected * 3 : 86400 * 3;

  let status: DataQualityStatus = source === "synthetic" ? "SYNTHETIC" : "FRESH";
  if (!bars.length || invalidBars > 0 && invalidBars >= Math.max(1, barsInput.length * 0.1)) status = "INVALID";
  else if (source === "live" && ageSeconds !== null && ageSeconds > staleThreshold) status = "STALE";

  if (source === "synthetic") warnings.push("Données synthétiques : non représentatives d'un flux de marché réel.");
  if (source === "live" && ageSeconds !== null && ageSeconds > staleThreshold) warnings.push("La dernière bougie dépasse le seuil de fraîcheur du timeframe.");
  if (gapCount) warnings.push(`${gapCount} intervalle(s) présentant un trou de données ont été détecté(s).`);
  if (invalidBars) warnings.push(`${invalidBars} bougie(s) invalides ont été écartées.`);
  if (originalDuplicateCount) warnings.push(`${originalDuplicateCount} bougie(s) dupliquées ont été écartées.`);

  let score = source === "live" ? 100 : 45;
  score -= Math.min(30, gapCount * 5);
  score -= Math.min(30, invalidBars * 2);
  if (status === "STALE") score -= 25;
  if (status === "INVALID") score = 0;
  score = Math.max(0, Math.min(100, score));

  return {
    status, score, source, provider, bars: bars.length, latestTs, ageSeconds,
    intervalSeconds: expected, duplicateBars: originalDuplicateCount, invalidBars,
    gapCount, maxGapSeconds, warnings
  };
}
