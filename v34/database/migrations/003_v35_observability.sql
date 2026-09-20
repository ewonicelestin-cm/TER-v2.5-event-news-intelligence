-- TER v3.5 observability and reliability metadata.
CREATE TABLE IF NOT EXISTS system_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('UP','DEGRADED','DOWN')),
  latency_ms INTEGER,
  details JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_health_component_checked ON system_health_checks(component, checked_at DESC);
CREATE TABLE IF NOT EXISTS provider_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('UP','DEGRADED','DOWN')),
  latency_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_health_checked ON provider_health_checks(provider, checked_at DESC);
