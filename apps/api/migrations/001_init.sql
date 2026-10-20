-- OutOfBook schema as of the PoC (2026-10-20). IF NOT EXISTS so a database
-- created by the PoC can be adopted as is.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,               -- lowercase Lichess username
  username text NOT NULL,
  unlimited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id text NOT NULL,
  played_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

-- Shared by all users; a deeper eval replaces a shallower one.
CREATE TABLE IF NOT EXISTS evals (
  key text PRIMARY KEY,              -- FEN without move counters
  depth int NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The user's built repertoire model, gzipped JSON exactly as the browser sent
-- it; hash = the games and build settings it was built from.
CREATE TABLE IF NOT EXISTS models (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hash text NOT NULL,
  gz bytea NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);
