import type { AssetClass, MarketAsset, OHLCVBar, Signal } from "../types";
import { computeSnapshot, rsi } from "./technicalIndicators";

export type ConfluenceLevel = "LOW" | "MEDIUM" | "HIGH";
export interface SignalEvidence {
  timeframe: string;
  score: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  regime: string;
  rsi: number;
  adx: number;
  emaTrend: "UP" | "DOWN" | "FLAT";
  reasons: string[];
}
export interface DivergenceEvidence { type: "BULLISH" | "BEARISH"; indicator: "RSI"; strength: number; description: string; }
export interface StructureEvidence {
  support: number | null;
  resistance: number | null;
  breakout: "UP" | "DOWN" | "NONE";
  distanceToSupportPct: number | null;
  distanceToResistancePct: number | null;
}
export interface SignalIntelligence {
  confluenceScore: number;
  confluence: ConfluenceLevel;
  evidence: SignalEvidence[];
  divergences: DivergenceEvidence[];
  structure: StructureEvidence;
  trace: { generatedAt: string; engine: string; dataSymbols: string[]; indicators: string[] };
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function timeframeEvidence(bars: OHLCVBar[], assetClass: AssetClass, timeframe: string): SignalEvidence | null {
  const s = computeSnapshot(bars, assetClass, timeframe);
  if (!s || !Number.isFinite(s.rsi) || !Number.isFinite(s.adx)) return null;
  const emaGap = s.ema20 === 0 ? 0 : (s.ema20 - s.ema50) / s.ema20;
  const emaTrend = emaGap > 0.0015 ? "UP" : emaGap < -0.0015 ? "DOWN" : "FLAT";
  let score = 50;
  const reasons: string[] = [];
  if (s.regime === "TREND_UP") { score += 18; reasons.push("régime TREND_UP"); }
  if (s.regime === "TREND_DOWN") { score -= 18; reasons.push("régime TREND_DOWN"); }
  if (s.regime === "RANGE") {
    if (s.rsi < s.profile.rsiOversold) { score += 12; reasons.push("RSI en zone basse"); }
    if (s.rsi > s.profile.rsiOverbought) { score -= 12; reasons.push("RSI en zone haute"); }
  }
  score += emaTrend === "UP" ? 10 : emaTrend === "DOWN" ? -10 : 0;
  score += s.macdHistogram > 0 ? 7 : -7;
  if (s.volumeRatio >= 1.25) { score += emaTrend === "UP" ? 5 : emaTrend === "DOWN" ? -5 : 0; reasons.push("volume supérieur à sa moyenne"); }
  return {
    timeframe, score: Math.round(clamp(score)),
    direction: score >= 60 ? "LONG" : score <= 40 ? "SHORT" : "NEUTRAL",
    regime: s.regime, rsi: Number(s.rsi.toFixed(2)), adx: Number(s.adx.toFixed(2)), emaTrend, reasons
  };
}

function findLocalExtrema(values: number[], lookback = 3) {
  const highs: number[] = [], lows: number[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    const w = values.slice(i - lookback, i + lookback + 1);
    if (values[i] === Math.max(...w)) highs.push(i);
    if (values[i] === Math.min(...w)) lows.push(i);
  }
  return { highs, lows };
}

function detectRsiDivergence(bars: OHLCVBar[]): DivergenceEvidence[] {
  if (bars.length < 45) return [];
  const closes = bars.map(b => b.close);
  const rsis = rsi(closes, 14);
  const { highs, lows } = findLocalExtrema(closes.slice(-80), 3);
  const offset = Math.max(0, closes.length - 80);
  const result: DivergenceEvidence[] = [];
  const recentLows = lows.slice(-2).map(i => i + offset).filter(i => Number.isFinite(rsis[i]));
  if (recentLows.length === 2) {
    const [a, b] = recentLows;
    if (closes[b] < closes[a] && rsis[b] > rsis[a] + 2) result.push({ type: "BULLISH", indicator: "RSI", strength: Math.round(clamp(Math.abs(rsis[b] - rsis[a]) * 4, 0, 100)), description: "Le prix forme un plus bas tandis que le RSI forme un plus haut." });
  }
  const recentHighs = highs.slice(-2).map(i => i + offset).filter(i => Number.isFinite(rsis[i]));
  if (recentHighs.length === 2) {
    const [a, b] = recentHighs;
    if (closes[b] > closes[a] && rsis[b] < rsis[a] - 2) result.push({ type: "BEARISH", indicator: "RSI", strength: Math.round(clamp(Math.abs(rsis[b] - rsis[a]) * 4, 0, 100)), description: "Le prix forme un plus haut tandis que le RSI forme un plus bas." });
  }
  return result;
}

function structure(bars: OHLCVBar[]): StructureEvidence {
  if (!bars.length) return { support: null, resistance: null, breakout: "NONE", distanceToSupportPct: null, distanceToResistancePct: null };
  const recent = bars.slice(-30);
  const price = recent[recent.length - 1].close;
  const support = Math.min(...recent.slice(0, -1).map(b => b.low));
  const resistance = Math.max(...recent.slice(0, -1).map(b => b.high));
  const previous = bars.length > 30 ? bars[bars.length - 31].close : recent[0].close;
  const breakout = price > resistance && previous <= resistance ? "UP" : price < support && previous >= support ? "DOWN" : "NONE";
  return {
    support, resistance, breakout,
    distanceToSupportPct: price ? ((price - support) / price) * 100 : null,
    distanceToResistancePct: price ? ((resistance - price) / price) * 100 : null
  };
}

export function buildSignalIntelligence(
  asset: MarketAsset,
  baseSignal: Signal,
  histories: Record<string, OHLCVBar[]>
): Signal & { intelligence: SignalIntelligence } {
  const evidence = Object.entries(histories)
    .map(([tf, bars]) => timeframeEvidence(bars, asset.assetClass, tf))
    .filter((x): x is SignalEvidence => Boolean(x));
  const daily = histories["1D"] ?? histories["1d"] ?? [];
  const divergences = detectRsiDivergence(daily);
  const st = structure(daily);
  const directional = evidence.filter(e => e.direction !== "NEUTRAL");
  const agreement = directional.length ? directional.filter(e => e.direction === baseSignal.direction).length / directional.length : 0.5;
  let score = baseSignal.score * 0.55 + agreement * 100 * 0.30;
  score += divergences.some(d => (d.type === "BULLISH" && baseSignal.direction === "LONG") || (d.type === "BEARISH" && baseSignal.direction === "SHORT")) ? 8 : 0;
  score += (st.breakout === "UP" && baseSignal.direction === "LONG") || (st.breakout === "DOWN" && baseSignal.direction === "SHORT") ? 7 : 0;
  score = Math.round(clamp(score));
  const confluence: ConfluenceLevel = score >= 75 ? "HIGH" : score >= 55 ? "MEDIUM" : "LOW";
  const intelligence: SignalIntelligence = {
    confluenceScore: score, confluence, evidence, divergences, structure: st,
    trace: {
      generatedAt: new Date().toISOString(),
      engine: "TER Signal Intelligence v1.8",
      dataSymbols: Object.keys(histories),
      indicators: ["RSI", "ADX", "EMA20/EMA50", "MACD", "ATR", "Bollinger", "Volume", "RSI divergence", "Support/Resistance"]
    }
  };
  return { ...baseSignal, intelligence, confidence: Math.round(clamp((baseSignal.confidence + score) / 2)) };
}
