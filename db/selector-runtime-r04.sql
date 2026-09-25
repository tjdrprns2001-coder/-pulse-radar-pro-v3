-- Selector runtime r0.4 PostgreSQL schema
CREATE TABLE IF NOT EXISTS raw_events (
  event_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  entity_key TEXT,
  source_time TIMESTAMPTZ,
  received_time TIMESTAMPTZ NOT NULL,
  available_time TIMESTAMPTZ,
  sequence_no BIGINT,
  provider_event_id TEXT,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  delivery_attempt INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  ingest_status TEXT NOT NULL DEFAULT 'RECEIVED',
  duplicate_of TEXT,
  correction_of TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raw_events_idem_idx ON raw_events(idempotency_key);
CREATE INDEX IF NOT EXISTS raw_events_source_time_idx ON raw_events(source_name, source_time);

CREATE TABLE IF NOT EXISTS source_watermarks (
  source_name TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  last_sequence BIGINT,
  last_source_time TIMESTAMPTZ,
  last_received_time TIMESTAMPTZ,
  last_available_time TIMESTAMPTZ,
  status TEXT NOT NULL,
  gap_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(source_name, entity_key)
);

CREATE TABLE IF NOT EXISTS worker_queue (
  job_id BIGSERIAL PRIMARY KEY,
  queue_name TEXT NOT NULL,
  event_id TEXT,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(queue_name,idempotency_key)
);

CREATE TABLE IF NOT EXISTS dead_letter_events (
  dlq_id BIGSERIAL PRIMARY KEY,
  event_id TEXT,
  source_name TEXT,
  reason TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_blocks (
  chain_id TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'CANONICAL',
  replaced_hash TEXT,
  PRIMARY KEY(chain_id, block_number, block_hash)
);
CREATE INDEX IF NOT EXISTS chain_blocks_latest_idx ON chain_blocks(chain_id, block_number, observed_at DESC);

CREATE TABLE IF NOT EXISTS address_labels (
  chain_id TEXT NOT NULL,
  address TEXT NOT NULL,
  label TEXT NOT NULL,
  label_type TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_ref TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY(chain_id,address,version)
);

CREATE TABLE IF NOT EXISTS feature_versions (
  feature_id TEXT PRIMARY KEY,
  feature_name TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  source_event_hash TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS selector_corrections (
  correction_id TEXT PRIMARY KEY,
  original_snapshot_id TEXT NOT NULL,
  corrected_snapshot_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Selector ledger persistence
CREATE TABLE IF NOT EXISTS selector_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  symbol TEXT,
  classification TEXT,
  decision_time TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS selector_snapshots_symbol_time_idx ON selector_snapshots(symbol,decision_time DESC);

CREATE TABLE IF NOT EXISTS selector_raw (
  snapshot_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS selector_transitions (
  transition_id TEXT PRIMARY KEY,
  symbol TEXT,
  decision_time TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS selector_outcomes (
  snapshot_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS selector_stats (
  stats_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS selector_evidence (
  evidence_id TEXT PRIMARY KEY,
  symbol TEXT,
  recorded_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS selector_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
