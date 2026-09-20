-- Operational indexes used by v3.5 dashboards and audit queries.
CREATE INDEX IF NOT EXISTS idx_audit_event_type_created ON audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_symbol_closed ON paper_trades(symbol, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_event_scheduled ON market_event_log(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_intelligence_log(published_at DESC);
