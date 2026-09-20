import type { Signal } from "../types";
import { positionSize, riskGate, type KillSwitchState } from "./riskEngine";

/**
 * Paper trading: a quick way to validate the signal engine against real
 * (or synthetic) price movement without touching a broker, regulator, or
 * real money — the fastest path from "the demo looks good" to "did it
 * actually work" mentioned in the roadmap discussion.
 */
export interface PaperPosition {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  size: number;
  openedAt: string;
  signalScore: number;
}

export interface PaperTrade extends PaperPosition {
  exit: number;
  closedAt: string;
  pnl: number;
}

export interface PaperAccount {
  startingEquity: number;
  cash: number;
  positions: PaperPosition[];
  closedTrades: PaperTrade[];
}

export function createPaperAccount(startingEquity = 10000): PaperAccount {
  return { startingEquity, cash: startingEquity, positions: [], closedTrades: [] };
}

export interface OpenPositionResult {
  account: PaperAccount;
  opened: PaperPosition | null;
  reason: string;
}

/**
 * Opens a paper position from a signal, subject to the same risk gate and
 * kill switch used for real trading — a paper account with no risk controls
 * would validate a different (easier) product than the real one.
 */
export function openPositionFromSignal(
  account: PaperAccount,
  signal: Signal,
  killSwitch: KillSwitchState,
  riskPercent = 1
): OpenPositionResult {
  if (killSwitch.tripped) {
    return { account, opened: null, reason: `kill switch actif : ${killSwitch.trippedReason}` };
  }
  if (account.positions.some(p => p.symbol === signal.symbol)) {
    return { account, opened: null, reason: "position déjà ouverte sur ce symbole" };
  }
  const drawdownPercent = killSwitch.peakEquity > 0
    ? ((killSwitch.peakEquity - killSwitch.currentEquity) / killSwitch.peakEquity) * 100
    : 0;
  const gate = riskGate(signal.score, drawdownPercent);
  if (!gate.allowed) {
    return { account, opened: null, reason: gate.reason };
  }

  const size = positionSize({ equity: account.cash, entry: signal.entry, stop: signal.stop, riskPercent });
  if (size <= 0) {
    return { account, opened: null, reason: "taille de position nulle (stop invalide)" };
  }

  const position: PaperPosition = {
    id: `${signal.symbol}-${Date.now()}`,
    symbol: signal.symbol,
    direction: signal.direction === "SHORT" ? "SHORT" : "LONG",
    entry: signal.entry,
    stop: signal.stop,
    size,
    openedAt: new Date().toISOString(),
    signalScore: signal.score
  };

  return {
    account: { ...account, positions: [...account.positions, position] },
    opened: position,
    reason: "position ouverte"
  };
}

export function closePosition(account: PaperAccount, symbol: string, currentPrice: number): { account: PaperAccount; trade: PaperTrade | null } {
  const position = account.positions.find(p => p.symbol === symbol);
  if (!position) return { account, trade: null };

  const pnl = position.direction === "LONG"
    ? (currentPrice - position.entry) * position.size
    : (position.entry - currentPrice) * position.size;

  const trade: PaperTrade = { ...position, exit: currentPrice, closedAt: new Date().toISOString(), pnl };

  return {
    account: {
      ...account,
      cash: account.cash + pnl,
      positions: account.positions.filter(p => p.symbol !== symbol),
      closedTrades: [...account.closedTrades, trade]
    },
    trade
  };
}

export function markToMarket(account: PaperAccount, pricesBySymbol: Record<string, number>): number {
  const unrealized = account.positions.reduce((sum, p) => {
    const price = pricesBySymbol[p.symbol];
    if (price === undefined) return sum;
    const pnl = p.direction === "LONG" ? (price - p.entry) * p.size : (p.entry - price) * p.size;
    return sum + pnl;
  }, 0);
  return account.cash + unrealized;
}
