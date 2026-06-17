CREATE UNIQUE INDEX IF NOT EXISTS vote_events_dedup ON vote_events(poll_id, session_token);
