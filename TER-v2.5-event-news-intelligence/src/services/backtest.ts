import type { OHLCVBar } from "../types";
import type { Regime } from "./technicalIndicators";

export interface BacktestTrade {
  entry: number;
  exit: number;
  direction: "LONG" | "SHORT";
  size?: number;      // position size in units, default 1
  entryTs?: string;
  exitTs?: string;
  /** Market regime detected strictly at entry; used for regime-level validation. */
  regime?: Regime;
}

/** Transaction cost model. Values are fractions (0.0005 = 5 bps), applied per side. */
export interface CostModel {
  feesPercent: number;
  slippagePercent: number;
}

export const defaultCosts: CostModel = { feesPercent: 0.0005, slippagePercent: 0.0005 };

/** Net PnL of one trade after fees and slippage — no more "PnL" pulled from thin air. */
function netPnl(t: BacktestTrade, costs: CostModel): number {
  const size = t.size ?? 1;
  const effectiveEntry = t.direction === "LONG"
    ? t.entry * (1 + costs.slippagePercent)
    : t.entry * (1 - costs.slippagePercent);
  const effectiveExit = t.direction === "LONG"
    ? t.exit * (1 - costs.slippagePercent)
    : t.exit * (1 + costs.slippagePercent);
  const gross = t.direction === "LONG"
    ? (effectiveExit - effectiveEntry) * size
    : (effectiveEntry - effectiveExit) * size;
  const fees = (t.entry + t.exit) * costs.feesPercent * size;
  return gross - fees;
}

export interface BacktestReport {
  trades: number;
  winRate: number;
  expectancy: number;
  /** null when there are no losing trades — JSON has no Infinity, so this is the honest representation instead of a value that silently becomes `null` on the wire anyway. */
  profitFactor: number | null;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  /** null when maxDrawdown is 0 (nothing to divide by) — same reasoning as profitFactor. */
  calmar: number | null;
  annualizedReturn: number;
  turnover: number;
  feesPaid: number;
  slippageCost: number;
}

/**
 * `periodsPerYear` lets the same function annualize daily (252), 4H (~1560) or
 * 1H (~6240) trade streams correctly instead of assuming one fixed frequency.
 */
export function backtest(
  trades: BacktestTrade[],
  costs: CostModel = defaultCosts,
  periodsPerYear = 252
): BacktestReport {
  if (!trades.length) {
    return { trades: 0, winRate: 0, expectancy: 0, profitFactor: 0, maxDrawdown: 0, sharpe: 0, sortino: 0, calmar: 0, annualizedReturn: 0, turnover: 0, feesPaid: 0, slippageCost: 0 };
  }

  const pnls = trades.map(t => netPnl(t, costs));
  const grossPnls = trades.map(t => {
    const size = t.size ?? 1;
    return t.direction === "LONG" ? (t.exit - t.entry) * size : (t.entry - t.exit) * size;
  });
  const feesPaid = trades.reduce((s, t) => s + (t.entry + t.exit) * costs.feesPercent * (t.size ?? 1), 0);
  const slippageCost = grossPnls.reduce((s, g, i) => s + (g - pnls[i]), 0) - feesPaid;

  const wins = pnls.filter(x => x > 0);
  const losses = pnls.filter(x => x < 0);

  let equity = 0, peak = 0, maxDD = 0;
  for (const pnl of pnls) {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, pnls.length - 1);
  const std = Math.sqrt(variance);

  const downside = pnls.filter(x => x < 0);
  const downsideVariance = downside.length
    ? downside.reduce((a, b) => a + b ** 2, 0) / downside.length
    : 0;
  const downsideStd = Math.sqrt(downsideVariance);

  const totalReturn = pnls.reduce((a, b) => a + b, 0);
  const annualizedReturn = mean * periodsPerYear;
  const calmar = maxDD > 0 ? annualizedReturn / maxDD : null;

  return {
    trades: pnls.length,
    winRate: (wins.length / pnls.length) * 100,
    expectancy: mean,
    profitFactor: losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : null,
    maxDrawdown: maxDD,
    sharpe: std ? (mean / std) * Math.sqrt(periodsPerYear) : 0,
    sortino: downsideStd ? (mean / downsideStd) * Math.sqrt(periodsPerYear) : 0,
    calmar,
    annualizedReturn,
    turnover: trades.length,
    feesPaid,
    slippageCost: Math.max(0, slippageCost)
  };
}

/**
 * Expanding-window walk-forward split: fold k trains on everything before its
 * test window and tests strictly after it, so no test bar ever leaks into
 * training — this is the "backtest sans fuite d'information" from the
 * roadmap's Phase 3, not just a single in-sample run.
 */
export interface WalkForwardFold {
  fold: number;
  trainBars: OHLCVBar[];
  testBars: OHLCVBar[];
}

export function walkForwardFolds(bars: OHLCVBar[], foldCount = 5, minTrainSize = 60): WalkForwardFold[] {
  const folds: WalkForwardFold[] = [];
  const usable = bars.length - minTrainSize;
  if (usable <= 0) return folds;

  const testSize = Math.floor(usable / foldCount);
  if (testSize <= 0) return folds;

  for (let f = 0; f < foldCount; f++) {
    const trainEnd = minTrainSize + f * testSize;
    const testEnd = f === foldCount - 1 ? bars.length : trainEnd + testSize;
    if (trainEnd >= bars.length) break;
    folds.push({
      fold: f + 1,
      trainBars: bars.slice(0, trainEnd),
      testBars: bars.slice(trainEnd, testEnd)
    });
  }
  return folds;
}

/** Runs `strategy` (which must only look at bars it's given) on the test slice of every fold. */
export function runWalkForward(
  bars: OHLCVBar[],
  strategy: (trainBars: OHLCVBar[], testBars: OHLCVBar[]) => BacktestTrade[],
  costs: CostModel = defaultCosts,
  foldCount = 5
): { perFold: BacktestReport[]; combined: BacktestReport } {
  const folds = walkForwardFolds(bars, foldCount);
  const allTrades: BacktestTrade[] = [];
  const perFold: BacktestReport[] = [];

  for (const fold of folds) {
    const trades = strategy(fold.trainBars, fold.testBars);
    allTrades.push(...trades);
    perFold.push(backtest(trades, costs));
  }

  return { perFold, combined: backtest(allTrades, costs) };
}

export interface MonteCarloResult {
  iterations: number;
  finalEquity: { p5: number; p50: number; p95: number };
  maxDrawdown: { p5: number; p50: number; p95: number };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Bootstrap resampling of trade PnLs (order-independent shuffles) to see how
 * sensitive the equity curve and drawdown are to the specific sequence of
 * trades observed — a single backtest run can hide "got lucky with the order" risk.
 */
export function monteCarloSimulation(
  trades: BacktestTrade[],
  costs: CostModel = defaultCosts,
  iterations = 1000
): MonteCarloResult {
  const pnls = trades.map(t => netPnl(t, costs));
  const finals: number[] = [];
  const drawdowns: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let equity = 0, peak = 0, maxDD = 0;
    for (let j = 0; j < pnls.length; j++) {
      const pnl = pnls[Math.floor(Math.random() * pnls.length)];
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, peak - equity);
    }
    finals.push(equity);
    drawdowns.push(maxDD);
  }

  finals.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);

  return {
    iterations,
    finalEquity: { p5: percentile(finals, 0.05), p50: percentile(finals, 0.5), p95: percentile(finals, 0.95) },
    maxDrawdown: { p5: percentile(drawdowns, 0.05), p50: percentile(drawdowns, 0.5), p95: percentile(drawdowns, 0.95) }
  };
}
