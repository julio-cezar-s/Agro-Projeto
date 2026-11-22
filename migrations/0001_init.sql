-- Fase 1: medição anônima + login admin
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,            -- epoch segundos
  day TEXT NOT NULL,              -- YYYY-MM-DD (UTC-4, America/Manaus)
  type TEXT NOT NULL,             -- view | tool_open | calc | error | perf
  tool TEXT,                      -- chave da ferramenta (whitelist)
  visitor TEXT,                   -- hash diário rotativo (sem IP bruto)
  country TEXT,
  device TEXT,                    -- mobile | desktop | tablet
  val INTEGER                     -- ms (perf) ou contagem
);
CREATE INDEX IF NOT EXISTS idx_events_day_type ON events(day, type);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events(day, tool, type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 do token do cookie
  email TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
