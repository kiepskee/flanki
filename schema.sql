CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  facebook_id TEXT UNIQUE,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  email_verified INTEGER NOT NULL DEFAULT 1,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS friend_links (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (friend_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  team_mode TEXT NOT NULL DEFAULT 'waiting',
  draft_turn_slot TEXT,
  match_status TEXT NOT NULL DEFAULT 'setup',
  current_turn_team TEXT,
  current_turn_user_id TEXT,
  throw_number INTEGER NOT NULL DEFAULT 0,
  winner_team TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_members (
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  team_slot TEXT,
  team_order INTEGER,
  is_captain INTEGER NOT NULL DEFAULT 0,
  is_out INTEGER NOT NULL DEFAULT 0,
  out_throw_number INTEGER,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES game_sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_invites (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  inviter_user_id TEXT NOT NULL,
  invitee_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  UNIQUE (session_id, invitee_user_id),
  FOREIGN KEY (session_id) REFERENCES game_sessions(id),
  FOREIGN KEY (inviter_user_id) REFERENCES users(id),
  FOREIGN KEY (invitee_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_stats (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_slot TEXT,
  throws INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  turns_taken INTEGER NOT NULL DEFAULT 0,
  finished_beer INTEGER NOT NULL DEFAULT 0,
  hits_when_finished INTEGER,
  ranking_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS throw_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  throw_number INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  team_slot TEXT,
  was_hit INTEGER NOT NULL DEFAULT 0,
  finished_beer INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS player_records (
  user_id TEXT PRIMARY KEY,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_throws INTEGER NOT NULL DEFAULT 0,
  total_hits INTEGER NOT NULL DEFAULT 0,
  beers_finished INTEGER NOT NULL DEFAULT 0,
  total_hits_when_finished INTEGER NOT NULL DEFAULT 0,
  ranking_points INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
CREATE INDEX IF NOT EXISTS idx_users_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(token_hash, type, used_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type, used_at);
CREATE INDEX IF NOT EXISTS idx_friend_links_friend_id ON friend_links(friend_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON game_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_match_status ON game_sessions(match_status, winner_team);
CREATE INDEX IF NOT EXISTS idx_members_user ON session_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_session_team ON session_members(session_id, team_slot, team_order);
CREATE INDEX IF NOT EXISTS idx_invites_invitee_status ON session_invites(invitee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_stats_session ON session_stats(session_id);
CREATE INDEX IF NOT EXISTS idx_throw_events_session ON throw_events(session_id, throw_number);
