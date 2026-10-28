-- Two-factor sign-in with an authenticator app. Who must use it is a setting the DCC edits, not a rule in code.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);
-- two_factor_min_level: people at this approval level or above must use it (0 = no one by level).
-- two_factor_for_dcc: 1 = every DCC account must use it, whatever their level.
INSERT INTO settings (key, value) VALUES ('two_factor_min_level', '5'), ('two_factor_for_dcc', '1');

-- The secret is kept in the clear (it must be, to compute a code); D1 is encrypted at rest and the nightly backup is encrypted.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
-- NULL until the person has typed a code from their app, which proves it is set up. Only then is the second step asked at sign-in.
ALTER TABLE users ADD COLUMN totp_confirmed_at TEXT;
-- The last time step accepted, so one code cannot be used twice.
ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;

-- Single-use codes for a lost phone; only a hash is kept.
CREATE TABLE recovery_codes (
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  used_at TEXT,
  PRIMARY KEY (user_id, code_hash)
);
