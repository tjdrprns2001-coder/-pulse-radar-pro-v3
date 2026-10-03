-- Storage contract for a future multi-worker PostgreSQL deployment.
-- The initial executable runtime uses an append-only disk journal, not this migration.
CREATE SCHEMA IF NOT EXISTS chartbro;
CREATE TABLE IF NOT EXISTS chartbro.instruments (
 venue text NOT NULL, market text NOT NULL, symbol text NOT NULL,
 tick numeric, lot numeric, metadata jsonb NOT NULL,
 PRIMARY KEY (venue,market,symbol)
);
CREATE TABLE IF NOT EXISTS chartbro.bars (
 venue text NOT NULL,market text NOT NULL,symbol text NOT NULL,timeframe text NOT NULL,
 open_time timestamptz NOT NULL,close_time timestamptz NOT NULL,received_at timestamptz,
 open numeric NOT NULL,high numeric NOT NULL,low numeric NOT NULL,close numeric NOT NULL,
 base_volume numeric,quote_volume numeric,taker_buy_base numeric,taker_buy_quote numeric,
 is_closed boolean NOT NULL,source_version text NOT NULL,
 PRIMARY KEY(venue,market,symbol,timeframe,open_time,source_version),
 CHECK(high>=greatest(open,close,low)),CHECK(low<=least(open,close,high))
);
CREATE TABLE IF NOT EXISTS chartbro.flow_snapshots (
 id text PRIMARY KEY,venue text NOT NULL,market text NOT NULL,symbol text NOT NULL,
 observed_at timestamptz NOT NULL,received_at timestamptz NOT NULL,
 window_start timestamptz,window_end timestamptz,unit text NOT NULL,payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS chartbro.analysis_snapshots (
 analysis_id text PRIMARY KEY,decision_at timestamptz NOT NULL,
 dataset_version text NOT NULL,engine_version text NOT NULL,config_hash text NOT NULL,
 payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS chartbro.object_events (
 id text PRIMARY KEY,analysis_id text NOT NULL REFERENCES chartbro.analysis_snapshots,
 object_id text,event_at timestamptz NOT NULL,known_at timestamptz NOT NULL,
 kind text NOT NULL,payload jsonb NOT NULL,CHECK(known_at>=event_at)
);
CREATE INDEX IF NOT EXISTS chartbro_events_asof ON chartbro.object_events(analysis_id,known_at);
CREATE TABLE IF NOT EXISTS chartbro.scan_jobs (
 id uuid PRIMARY KEY,state text NOT NULL CHECK(state IN ('QUEUED','RUNNING','PARTIAL','COMPLETED','CANCELLED','FAILED')),
 decision_at timestamptz NOT NULL,config_hash text NOT NULL,
 checkpoint jsonb NOT NULL,lease_until timestamptz,worker_id text
);
CREATE TABLE IF NOT EXISTS chartbro.scan_results (
 job_id uuid REFERENCES chartbro.scan_jobs,symbol text NOT NULL,
 analysis_id text REFERENCES chartbro.analysis_snapshots,payload jsonb NOT NULL,
 PRIMARY KEY(job_id,symbol)
);
CREATE TABLE IF NOT EXISTS chartbro.research_outcomes (
 setup_id text NOT NULL,horizon text NOT NULL,version text NOT NULL,
 payload jsonb NOT NULL,PRIMARY KEY(setup_id,horizon,version)
);
CREATE TABLE IF NOT EXISTS chartbro.sources (
 video_id text PRIMARY KEY,verification jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS chartbro.concept_requirements (
 id text PRIMARY KEY,video_id text REFERENCES chartbro.sources,chapter_start numeric,
 chapter_end numeric,definition_version text,module text,fixture text,verification jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS chartbro.trade_journal (
 id uuid PRIMARY KEY,recorded_at timestamptz NOT NULL,payload jsonb NOT NULL
);
