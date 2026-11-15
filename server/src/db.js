const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'queue_manager.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  token_number INTEGER NOT NULL,
  person_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','serving','completed','cancelled')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  service_started_at TEXT,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  waiting_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tokens_queue_status_position ON tokens(queue_id, status, position);
CREATE INDEX IF NOT EXISTS idx_events_queue_created ON queue_events(queue_id, created_at);
`);
module.exports = db;
