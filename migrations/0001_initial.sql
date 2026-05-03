CREATE TABLE IF NOT EXISTS submissions (
  submission_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  species TEXT NOT NULL,
  breed TEXT NOT NULL,
  age_now_years INTEGER,
  age_acquired_years INTEGER,
  state_code TEXT,
  total_vet_spend_bucket TEXT,
  largest_bill_bucket TEXT,
  pct_routine INTEGER,
  major_incidents TEXT,
  had_insurance INTEGER,
  would_buy_again INTEGER,
  verdict TEXT,
  verdict_dollars REAL
);

CREATE TABLE IF NOT EXISTS data_freshness_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  current_value REAL,
  stored_value REAL,
  pct_change REAL,
  flagged INTEGER
);

CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_breed ON submissions(species, breed);
