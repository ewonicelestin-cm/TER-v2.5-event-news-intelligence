import type { AssetClass, OHLCVBar } from "../types";
import { backtest, defaultCosts, type BacktestReport, type BacktestTrade, type CostModel } from "./backtest";
import { computeSnapshot, type Regime } from "./technicalIndicators";

export const REGIMES: Regime[] = ["TREND_UP", "TREND_DOWN", "RANGE", "HIGH_VOL"];

export interface RegimeValidationRow {
  regime: Regime;
  bars: number;
  exposureBars: number;
  trades: number;
  report: BacktestReport;
}

export interface RegimeValidationReport {
  symbol?: string;
  assetClass: AssetClass;
  timeframe: string;
  strategy: string;
  totalBars: number;
  tradableBars: number;
  trades: number;
  regimes: RegimeValidationRow[];
  combined: BacktestReport;
}

/**
 * Adaptive strategy used by TER's regime-validation layer.
 * It deliberately uses only information available at the entry bar.
 *
 * TREND_UP / TREND_DOWN: follow EMA direction when MACD agrees.
 * RANGE: fade extremes using RSI + Bollinger position.
 * HIGH_VOL: only take directional setups when MACD and EMA direction agree.
 */
export function adaptiveRegimeStrategy(
  bars: OHLCVBar[],
  assetClass: AssetClass = "Equities",
  timeframe = "1D",
  holdBars = 5
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let nextAvailableIndex = 60;

  for (let i = 60; i < bars.length - holdBars; i++) {
    if (i < nextAvailableIndex) continue;
    const snapshot = computeSnapshot(bars.slice(0, i + 1), assetClass, timeframe);
    if (!snapshot) continue;

    const bandWidth = snapshot.bollinger.upper - snapshot.bollinger.lower;
    const bandPosition = bandWidth > 0 ? (snapshot.price - snapshot.bollinger.lower) / bandWidth : 0.5;
    let direction: "LONG" | "SHORT" | null = null;

    if (snapshot.regime === "TREND_UP") {
      if (snapshot.ema20 > snapshot.ema50 && snapshot.macdHistogram > 0) direction = "LONG";
    } else if (snapshot.regime === "TREND_DOWN") {
      if (snapshot.ema20 < snapshot.ema50 && snapshot.macdHistogram < 0) direction = "SHORT";
    } else if (snapshot.regime === "RANGE") {
      if (snapshot.rsi <= snapshot.profile.rsiOversold && bandPosition <= 0.2) direction = "LONG";
      else if (snapshot.rsi >= snapshot.profile.rsiOverbought && bandPosition >= 0.8) direction = "SHORT";
    } else if (snapshot.regime === "HIGH_VOL") {
      if (snapshot.ema20 > snapshot.ema50 && snapshot.macdHistogram > 0) direction = "LONG";
      else if (snapshot.ema20 < snapshot.ema50 && snapshot.macdHistogram < 0) direction = "SHORT";
    }

    if (!direction) continue;

    const entryBar = bars[i];
    const exitBar = bars[i + holdBars];
    // High-volatility setups are sized down to reflect wider uncertainty.
    const size = snapshot.regime === "HIGH_VOL" ? 0.5 : 1;
    trades.push({
      entry: entryBar.close,
      exit: exitBar.close,
      direction,
      size,
      regime: snapshot.regime,
      entryTs: entryBar.ts,
      exitTs: exitBar.ts
    });
    nextAvailableIndex = i + holdBars;
  }

  return trades;
}

export function validateByRegime(
  bars: OHLCVBar[],
  assetClass: AssetClass = "Equities",
  timeframe = "1D",
  costs: CostModel = defaultCosts,
  symbol?: string
): RegimeValidationReport {
  const regimeBars: Record<Regime, number> = {
    TREND_UP: 0,
    TREND_DOWN: 0,
    RANGE: 0,
    HIGH_VOL: 0
  };

  for (let i = 0; i < bars.length; i++) {
    const snapshot = computeSnapshot(bars.slice(0, i + 1), assetClass, timeframe);
    if (snapshot) regimeBars[snapshot.regime]++;
  }

  const trades = adaptiveRegimeStrategy(bars, assetClass, timeframe);
  const byRegime = Object.fromEntries(REGIMES.map(r => [r, trades.filter(t => t.regime === r)])) as Record<Regime, BacktestTrade[]>;
  const rows = REGIMES.map(regime => {
    const regimeTrades = byRegime[regime];
    return {
      regime,
      bars: regimeBars[regime],
      exposureBars: regimeBars[regime],
      trades: regimeTrades.length,
      report: backtest(regimeTrades, costs)
    };
  });

  return {
    symbol,
    assetClass,
    timeframe,
    strategy: "TER Adaptive Regime Strategy",
    totalBars: bars.length,
    tradableBars: rows.reduce((sum, row) => sum + row.bars, 0),
    trades: trades.length,
    regimes: rows,
    combined: backtest(trades, costs)
  };
}
