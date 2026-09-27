-- Pulse Radar full-universe automatic scanner v1
CREATE TABLE IF NOT EXISTS full_scan_runs (
  run_id TEXT PRIMARY KEY,
  scan_kind TEXT NOT NULL CHECK (scan_kind IN ('auto','manual')),
  bucket_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS full_scan_runs_completed_idx ON full_scan_runs(completed_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS full_scan_runs_kind_idx ON full_scan_runs(scan_kind, created_at DESC);

CREATE TABLE IF NOT EXISTS full_scan_items (
  run_id TEXT NOT NULL REFERENCES full_scan_runs(run_id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'unknown',
  market_cap_usd NUMERIC,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, symbol)
);
CREATE INDEX IF NOT EXISTS full_scan_items_tier_idx ON full_scan_items(run_id, tier, market_cap_usd DESC NULLS LAST);
