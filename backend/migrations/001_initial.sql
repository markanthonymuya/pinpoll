CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE poll_status AS ENUM ('draft', 'active', 'closed', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dedup_mode AS ENUM ('cookie', 'email_hash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE poll_visibility AS ENUM ('public', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vote_source AS ENUM ('self_vote', 'initiator_tap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) UNIQUE NOT NULL,
  topic TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status poll_status NOT NULL DEFAULT 'draft',
  deduplication_mode dedup_mode NOT NULL DEFAULT 'cookie',
  auto_close_at TIMESTAMPTZ,
  visibility poll_visibility NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  icon_key TEXT,
  display_order INTEGER NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  source vote_source NOT NULL,
  session_token TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_code VARCHAR(12) NOT NULL,
  poll_topic TEXT NOT NULL,
  total_votes INTEGER NOT NULL,
  pdf_downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
