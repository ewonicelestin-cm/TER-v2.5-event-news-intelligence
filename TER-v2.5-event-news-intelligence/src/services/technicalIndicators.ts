import type { AssetClass, OHLCVBar } from "../types";

/**
 * Technical-analysis engine for TER.
 *
 * The important change in v1.2 is that oscillators are not interpreted with
 * one universal set of thresholds. The profile is selected from the asset
 * class and timeframe, while the market regime (trend/range/high volatility)
 * changes the relative weight of the indicators.
 */

export type Regime = "TREND_UP" | "TREND_DOWN" | "RANGE" | "HIGH_VOL";
export type OscillatorMode = "TREND" | "MEAN_REVERSION" | "VOLATILITY";

export interface MarketProfile {
  assetClass: AssetClass;
  timeframe: string;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  stochasticPeriod: number;
  cciPeriod: number;
  adxPeriod: number;
  atrPeriod: number;
  bollingerPeriod: number;
  bollingerStd: number;
  highVolAtrPct: number;
  trendAdxThreshold: number;
}

const BASE_PROFILES: Record<AssetClass, Omit<MarketProfile, "assetClass" | "timeframe">> = {
  Equities: { rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2, highVolAtrPct: 0.028, trendAdxThreshold: 20 },
  Indices: { rsiPeriod: 14, rsiOverbought: 68, rsiOversold: 32, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2, highVolAtrPct: 0.022, trendAdxThreshold: 20 },
  Forex: { rsiPeriod: 14, rsiOverbought: 68, rsiOversold: 32, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2, highVolAtrPct: 0.012, trendAdxThreshold: 20 },
  Crypto: { rsiPeriod: 14, rsiOverbought: 75, rsiOversold: 25, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2.2, highVolAtrPct: 0.055, trendAdxThreshold: 23 },
  Commodities: { rsiPeriod: 14, rsiOverbought: 72, rsiOversold: 28, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2.1, highVolAtrPct: 0.032, trendAdxThreshold: 22 },
  Rates: { rsiPeriod: 14, rsiOverbought: 65, rsiOversold: 35, stochasticPeriod: 14, cciPeriod: 20, adxPeriod: 14, atrPeriod: 14, bollingerPeriod: 20, bollingerStd: 2, highVolAtrPct: 0.009, trendAdxThreshold: 20 }
};

function timeframeMultiplier(timeframe: string): number {
  const tf = timeframe.toLowerCase();
  if (["1m", "5m", "15m", "30m"].includes(tf)) return 0.85;
  if (["1h", "2h"].includes(tf)) return 0.95;
  if (["4h", "6h", "8h"].includes(tf)) return 1;
  if (["1d", "d", "day"].includes(tf)) return 1.05;
  if (["1w", "w", "week"].includes(tf)) return 1.2;
  return 1;
}

export function getMarketProfile(assetClass: AssetClass, timeframe = "1D"): MarketProfile {
  const base = BASE_PROFILES[assetClass];
  const m = timeframeMultiplier(timeframe);
  return {
    assetClass,
    timeframe,
    ...base,
    rsiPeriod: Math.max(7, Math.round(base.rsiPeriod * m)),
    stochasticPeriod: Math.max(8, Math.round(base.stochasticPeriod * m)),
    cciPeriod: Math.max(12, Math.round(base.cciPeriod * m)),
    adxPeriod: Math.max(10, Math.round(base.adxPeriod * m)),
    atrPeriod: Math.max(10, Math.round(base.atrPeriod * m)),
    bollingerPeriod: Math.max(16, Math.round(base.bollingerPeriod * m))
  };
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      if (i < period - 1) { out.push(NaN); continue; }
      const seed = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out.push(seed);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(bars: OHLCVBar[], period = 14): number[] {
  const trueRanges = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prevClose = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
  return ema(trueRanges, period);
}

export function stochastic(bars: OHLCVBar[], period = 14): { k: number[]; d: number[] } {
  const k = new Array<number>(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    const window = bars.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(b => b.high));
    const low = Math.min(...window.map(b => b.low));
    k[i] = high === low ? 50 : ((bars[i].close - low) / (high - low)) * 100;
  }
  return { k, d: sma(k.map(v => Number.isNaN(v) ? 50 : v), 3) };
}

export function cci(bars: OHLCVBar[], period = 20): number[] {
  const tp = bars.map(b => (b.high + b.low + b.close) / 3);
  const out = new Array<number>(bars.length).fill(NaN);
  const means = sma(tp, period);
  for (let i = period - 1; i < bars.length; i++) {
    const mean = means[i];
    let deviation = 0;
    for (let j = i - period + 1; j <= i; j++) deviation += Math.abs(tp[j] - mean);
    const md = deviation / period;
    out[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
  }
  return out;
}

export function williamsR(bars: OHLCVBar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  for (let i = period - 1; i < bars.length; i++) {
    const window = bars.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(b => b.high));
    const low = Math.min(...window.map(b => b.low));
    out[i] = high === low ? -50 : ((high - bars[i].close) / (high - low)) * -100;
  }
  return out;
}

export function adx(bars: OHLCVBar[], period = 14): number[] {
  const tr: number[] = new Array(bars.length).fill(NaN);
  const plusDm: number[] = new Array(bars.length).fill(0);
  const minusDm: number[] = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  }
  const atrSeries = ema(tr.map(v => Number.isNaN(v) ? 0 : v), period);
  const plusSmoothed = ema(plusDm, period);
  const minusSmoothed = ema(minusDm, period);
  const dx = new Array<number>(bars.length).fill(NaN);
  for (let i = 0; i < bars.length; i++) {
    if (!atrSeries[i] || Number.isNaN(atrSeries[i])) continue;
    const pdi = 100 * plusSmoothed[i] / atrSeries[i];
    const mdi = 100 * minusSmoothed[i] / atrSeries[i];
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : 100 * Math.abs(pdi - mdi) / denom;
  }
  return ema(dx.map(v => Number.isNaN(v) ? 0 : v), period).map((v, i) => i < period * 2 - 1 ? NaN : v);
}

export interface MACDResult { macd: number[]; signal: number[]; histogram: number[]; }
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MACDResult {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = closes.map((_, i) => Number.isNaN(fastEma[i]) || Number.isNaN(slowEma[i]) ? NaN : fastEma[i] - slowEma[i]);
  const signalLine = ema(macdLine.map(v => Number.isNaN(v) ? 0 : v), signalPeriod).map((v, i) => Number.isNaN(macdLine[i]) ? NaN : v);
  const histogram = macdLine.map((v, i) => Number.isNaN(v) || Number.isNaN(signalLine[i]) ? NaN : v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

export interface BollingerResult { upper: number[]; middle: number[]; lower: number[]; width: number[]; }
export function bollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): BollingerResult {
  const middle = sma(closes, period);
  const upper: number[] = [], lower: number[] = [], width: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (Number.isNaN(middle[i])) { upper.push(NaN); lower.push(NaN); width.push(NaN); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - middle[i]) ** 2;
    const std = Math.sqrt(variance / period);
    const u = middle[i] + stdDevMultiplier * std;
    const l = middle[i] - stdDevMultiplier * std;
    upper.push(u); lower.push(l); width.push(middle[i] === 0 ? 0 : (u - l) / middle[i]);
  }
  return { upper, middle, lower, width };
}

export function detectRegime(closes: number[], atrSeries: number[], adxSeries: number[], profile: MarketProfile): Regime {
  const last = closes.length - 1;
  const price = closes[last];
  const atrPct = price > 0 && Number.isFinite(atrSeries[last]) ? atrSeries[last] / price : 0;
  if (atrPct >= profile.highVolAtrPct) return "HIGH_VOL";

  const ema20 = ema(closes, Math.max(10, Math.round(profile.rsiPeriod * 1.4)));
  const ema50 = ema(closes, Math.max(30, Math.round(profile.rsiPeriod * 3.5)));
  const adxValue = adxSeries[last];
  if (Number.isFinite(adxValue) && adxValue >= profile.trendAdxThreshold) {
    if (ema20[last] > ema50[last] && price > ema20[last]) return "TREND_UP";
    if (ema20[last] < ema50[last] && price < ema20[last]) return "TREND_DOWN";
  }
  return "RANGE";
}

export interface IndicatorSnapshot {
  price: number;
  rsi: number;
  stochasticK: number;
  stochasticD: number;
  cci: number;
  williamsR: number;
  adx: number;
  ema20: number;
  ema50: number;
  atr: number;
  atrPct: number;
  macdHistogram: number;
  bollinger: { upper: number; middle: number; lower: number; width: number };
  volumeRatio: number;
  regime: Regime;
  oscillatorMode: OscillatorMode;
  profile: MarketProfile;
}

export function computeSnapshot(bars: OHLCVBar[], assetClass: AssetClass = "Equities", timeframe = "1D"): IndicatorSnapshot | null {
  const profile = getMarketProfile(assetClass, timeframe);
  const minBars = Math.max(60, profile.cciPeriod * 3);
  if (bars.length < minBars) return null;
  const closes = bars.map(b => b.close);
  const last = closes.length - 1;
  const rsiSeries = rsi(closes, profile.rsiPeriod);
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const atrSeries = atr(bars, profile.atrPeriod);
  const adxSeries = adx(bars, profile.adxPeriod);
  const macdSeries = macd(closes);
  const bb = bollingerBands(closes, profile.bollingerPeriod, profile.bollingerStd);
  const stoch = stochastic(bars, profile.stochasticPeriod);
  const cciSeries = cci(bars, profile.cciPeriod);
  const wrSeries = williamsR(bars, profile.stochasticPeriod);
  const volumeSma = sma(bars.map(b => b.volume), 20);
  const volumeRatio = volumeSma[last] > 0 ? bars[last].volume / volumeSma[last] : 1;
  const regime = detectRegime(closes, atrSeries, adxSeries, profile);
  const oscillatorMode: OscillatorMode = regime === "RANGE" ? "MEAN_REVERSION" : regime === "HIGH_VOL" ? "VOLATILITY" : "TREND";

  return {
    price: closes[last],
    rsi: rsiSeries[last],
    stochasticK: stoch.k[last],
    stochasticD: stoch.d[last],
    cci: cciSeries[last],
    williamsR: wrSeries[last],
    adx: adxSeries[last],
    ema20: ema20Series[last],
    ema50: ema50Series[last],
    atr: atrSeries[last],
    atrPct: closes[last] > 0 ? atrSeries[last] / closes[last] : 0,
    macdHistogram: macdSeries.histogram[last],
    bollinger: { upper: bb.upper[last], middle: bb.middle[last], lower: bb.lower[last], width: bb.width[last] },
    volumeRatio: Number.isFinite(volumeRatio) ? volumeRatio : 1,
    regime,
    oscillatorMode,
    profile
  };
}
