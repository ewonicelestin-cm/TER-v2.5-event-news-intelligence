export interface RiskInput {
  equity: number;
  entry: number;
  stop: number;
  riskPercent: number;
  maxPositionPercent?: number;
}

export function positionSize(input: RiskInput) {
  const riskBudget = input.equity * (input.riskPercent / 100);
  const riskPerUnit = Math.abs(input.entry - input.stop);
  if (riskPerUnit <= 0) return 0;

  const raw = riskBudget / riskPerUnit;
  const maxNotional = input.equity * ((input.maxPositionPercent ?? 20) / 100);
  return Math.min(raw, maxNotional / input.entry);
}

export function riskGate(score: number, drawdownPercent: number) {
  if (drawdownPercent >= 10) return { allowed: false, reason: "drawdown protection" };
  if (score < 65) return { allowed: false, reason: "signal score below threshold" };
  return { allowed: true, reason: "risk rules passed" };
}

/**
 * Stateful kill switch (roadmap Phase 1 architecture item "kill switch").
 * Tracks a running equity curve and halts new positions once drawdown from
 * the running peak breaches the configured limit, or once a losing-streak
 * limit is hit. This is intentionally conservative: once tripped it stays
 * tripped until explicitly reset, so a single good trade can't silently
 * re-enable risk-taking after a real breach.
 */
export interface KillSwitchConfig {
  maxDrawdownPercent: number;   // e.g. 10 = halt at -10% from peak equity
  maxConsecutiveLosses: number; // e.g. 5
}

export interface KillSwitchState {
  peakEquity: number;
  currentEquity: number;
  consecutiveLosses: number;
  tripped: boolean;
  trippedReason: string | null;
}

export function createKillSwitchState(startingEquity: number): KillSwitchState {
  return { peakEquity: startingEquity, currentEquity: startingEquity, consecutiveLosses: 0, tripped: false, trippedReason: null };
}

export function recordTradeResult(
  state: KillSwitchState,
  pnl: number,
  config: KillSwitchConfig
): KillSwitchState {
  if (state.tripped) return state; // stays halted until reset() is called explicitly

  const currentEquity = state.currentEquity + pnl;
  const peakEquity = Math.max(state.peakEquity, currentEquity);
  const drawdownPercent = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
  const consecutiveLosses = pnl < 0 ? state.consecutiveLosses + 1 : 0;

  if (drawdownPercent >= config.maxDrawdownPercent) {
    return { peakEquity, currentEquity, consecutiveLosses, tripped: true, trippedReason: `drawdown ${drawdownPercent.toFixed(1)}% >= limite ${config.maxDrawdownPercent}%` };
  }
  if (consecutiveLosses >= config.maxConsecutiveLosses) {
    return { peakEquity, currentEquity, consecutiveLosses, tripped: true, trippedReason: `${consecutiveLosses} pertes consécutives >= limite ${config.maxConsecutiveLosses}` };
  }
  return { peakEquity, currentEquity, consecutiveLosses, tripped: false, trippedReason: null };
}

/** Explicit, deliberate reset — never automatic, so a halt always requires a human decision. */
export function resetKillSwitch(state: KillSwitchState): KillSwitchState {
  return { ...state, tripped: false, trippedReason: null, consecutiveLosses: 0 };
}
