CREATE TABLE IF NOT EXISTS portal_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visa_query_requests (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS visa_query_requests_user_id_idx
  ON visa_query_requests(user_id);

CREATE INDEX IF NOT EXISTS visa_query_requests_expires_at_idx
  ON visa_query_requests(expires_at);
