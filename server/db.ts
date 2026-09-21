import pg from "pg";

/**
 * Thin Postgres wrapper around the tables defined in database/schema.sql.
 * Every insert function no-ops (and logs once) when DATABASE_URL isn't set,
 * so the API keeps working against the in-memory fallback in a laptop/demo
 * setup and only requires Postgres once you actually want persistence —
 * `docker-compose up postgres` + set DATABASE_URL to switch it on.
 */
const connectionString = process.env.DATABASE_URL;
const pool = connectionString ? new pg.Pool({ connectionString }) : null;

// node-postgres emits 'error' on idle clients that lose their connection
// (e.g. Postgres restart, network blip). Without a listener, that event is
// unhandled and crashes the entire Node process — not just the query.
pool?.on("error", (err) => {
  console.error("[db] connexion Postgres perdue sur un client inactif :", err.message);
});

let warnedOnce = false;
function warnIfNoDb() {
  if (!pool && !warnedOnce) {
    warnedOnce = true;
    console.warn("[db] DATABASE_URL non défini — persistence désactivée, écriture en mémoire uniquement.");
  }
}

export async function insertAuditEvent(eventType: string, payload: unknown): Promise<void> {
  warnIfNoDb();
  if (!pool) return;
  await pool.query(
    `INSERT INTO audit_events (event_type, payload) VALUES ($1, $2::jsonb)`,
    [eventType, JSON.stringify(payload)]
  );
}

export interface BacktestResultRow {
  strategyVersion: string;
  runType: "in_sample" | "walk_forward_fold" | "walk_forward_combined" | "monte_carlo";
  foldNumber?: number;
  trades: number;
  winRate: number;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar: number | null;
  annualizedReturn: number;
  feesPaid: number;
  slippageCost: number;
  params?: unknown;
}

export async function insertBacktestResult(row: BacktestResultRow): Promise<void> {
  warnIfNoDb();
  if (!pool) return;
  await pool.query(
    `INSERT INTO backtest_results
      (strategy_version, run_type, fold_number, trades, win_rate, expectancy, profit_factor,
       max_drawdown, sharpe, sortino, calmar, annualized_return, fees_paid, slippage_cost, params)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
    [
      row.strategyVersion, row.runType, row.foldNumber ?? null, row.trades, row.winRate, row.expectancy,
      row.profitFactor, row.maxDrawdown, row.sharpe, row.sortino,
      row.calmar, row.annualizedReturn, row.feesPaid, row.slippageCost,
      JSON.stringify(row.params ?? {})
    ]
  );
}

export async function insertKillSwitchEvent(event: "tripped" | "reset", reason: string | null, equity: number): Promise<void> {
  warnIfNoDb();
  if (!pool) return;
  await pool.query(
    `INSERT INTO kill_switch_events (event, reason, equity_at_event) VALUES ($1, $2, $3)`,
    [event, reason, equity]
  );
}

export interface PaperTradeRow {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  size: number;
  signalScore: number;
  pnl: number;
  openedAt: string;
}

export async function insertPaperTrade(row: PaperTradeRow): Promise<void> {
  warnIfNoDb();
  if (!pool) return;
  await pool.query(
    `INSERT INTO paper_trades (symbol, direction, entry_price, exit_price, size, signal_score, pnl, opened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [row.symbol, row.direction, row.entryPrice, row.exitPrice, row.size, row.signalScore, row.pnl, row.openedAt]
  );
}

// persistence and metrics
export async function insertProviderHealth(provider: string, status: string, latency: number, success: number, failure: number): Promise<void> {
  warnIfNoDb();
  if (!pool) return;
  await pool.query(
    `INSERT INTO provider_health_metrics (provider_name, status, latency_ms, success_count, failure_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [provider, status, Math.round(latency), success, failure]
  );
}

export async function getRecentProviderHealth(provider?: string, limit = 100) {
  warnIfNoDb();
  if (!pool) return [];
  const query = provider
    ? [`SELECT * FROM provider_health_metrics WHERE provider_name = $1 ORDER BY recorded_at DESC LIMIT $2`, [provider, limit]]
    : [`SELECT * FROM provider_health_metrics ORDER BY recorded_at DESC LIMIT $1`, [limit]];
  const res = await pool.query(query[0] as string, query[1] as any[]);
  return res.rows;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
}
