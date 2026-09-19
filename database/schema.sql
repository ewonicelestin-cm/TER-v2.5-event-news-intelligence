-- TER PostgreSQL core schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  venue TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  currency TEXT,
  UNIQUE(symbol, venue)
);

CREATE TABLE IF NOT EXISTS market_bars (
  instrument_id UUID NOT NULL REFERENCES instruments(id),
  timeframe TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC,
  PRIMARY KEY (instrument_id, timeframe, ts)
);

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES instruments(id),
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT','WATCH')),
  score NUMERIC NOT NULL CHECK(score BETWEEN 0 AND 100),
  confidence NUMERIC NOT NULL CHECK(confidence BETWEEN 0 AND 100),
  entry NUMERIC,
  stop NUMERIC,
  target NUMERIC,
  timeframe TEXT,
  source_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL,
  platform TEXT NOT NULL,
  strategy TEXT,
  verified BOOLEAN DEFAULT FALSE,
  sample_size INTEGER DEFAULT 0,
  win_rate NUMERIC,
  expectancy NUMERIC,
  max_drawdown NUMERIC,
  consistency NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(handle, platform)
);

CREATE TABLE IF NOT EXISTS strategy_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategy_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_url TEXT,
  outcome NUMERIC,
  verified BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS model_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  signal_id UUID REFERENCES signals(id),
  prediction NUMERIC,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores one row per backtest run (in-sample, walk-forward fold, or full
-- walk-forward summary) so engine versions can be compared over time instead
-- of only ever showing the latest run.
CREATE TABLE IF NOT EXISTS backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES instruments(id),
  strategy_version TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK(run_type IN ('in_sample','walk_forward_fold','walk_forward_combined','monte_carlo')),
  fold_number INTEGER,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  trades INTEGER NOT NULL,
  win_rate NUMERIC,
  expectancy NUMERIC,
  profit_factor NUMERIC,
  max_drawdown NUMERIC,
  sharpe NUMERIC,
  sortino NUMERIC,
  calmar NUMERIC,
  annualized_return NUMERIC,
  fees_paid NUMERIC,
  slippage_cost NUMERIC,
  params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row every time the risk engine's kill switch trips or is reset —
-- feeds the Phase 6 audit trail requirement.
CREATE TABLE IF NOT EXISTS kill_switch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL CHECK(event IN ('tripped','reset')),
  reason TEXT,
  equity_at_event NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Closed paper-trading trades, so the "does the signal engine actually work"
-- question can be answered from real data instead of only the backtest.
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  signal_score NUMERIC,
  pnl NUMERIC NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- v2.5 extension (optional persistence layer): event/news intelligence journal.
CREATE TABLE IF NOT EXISTS market_event_log (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  importance TEXT NOT NULL,
  region TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_intelligence_log (
  id TEXT PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL,
  source TEXT,
  title TEXT NOT NULL,
  sentiment_score NUMERIC,
  impact_score NUMERIC,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v3.5 extension: Persistence for Workflows, Automation and Observability
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'PAUSED')),
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('DRY_RUN', 'SUCCESS', 'ERROR')),
  trace JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  logic TEXT NOT NULL CHECK(logic IN ('ALL', 'ANY')),
  conditions JSONB NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('INFO', 'MEDIUM', 'HIGH')),
  enabled BOOLEAN DEFAULT TRUE,
  cooldown_minutes INTEGER DEFAULT 15,
  trigger_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('available', 'degraded', 'unavailable')),
  latency_ms INTEGER,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_health_name ON provider_health_metrics(provider_name, recorded_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf ON workflow_runs(workflow_id);
