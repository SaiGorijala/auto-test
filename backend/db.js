/**
 * db.js — SQLite database layer using better-sqlite3 (synchronous API).
 * Runs WAL mode for concurrent read performance without blocking writes.
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pipeline.db');
const db = new Database(DB_PATH);

// Performance and integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id               TEXT PRIMARY KEY,
    created_at       TEXT NOT NULL,
    instance_ip      TEXT NOT NULL,
    repo_url         TEXT NOT NULL,
    github_username  TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    duration_ms      INTEGER,
    jenkins_url      TEXT,
    sonarqube_url    TEXT,
    app_url          TEXT,
    phase            TEXT    DEFAULT 'Initializing',
    phase_percent    INTEGER DEFAULT 0,
    config_snapshot  TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id  TEXT    NOT NULL,
    timestamp      TEXT    NOT NULL,
    level          TEXT    NOT NULL DEFAULT 'info',
    message        TEXT    NOT NULL,
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_reasoning (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id  TEXT    NOT NULL,
    timestamp      TEXT    NOT NULL,
    title          TEXT    NOT NULL,
    content        TEXT    NOT NULL,
    reasoning_type TEXT    DEFAULT 'analysis',
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deployment_artifacts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id  TEXT    NOT NULL,
    artifact_type  TEXT    NOT NULL,
    content        TEXT    NOT NULL,
    created_at     TEXT    NOT NULL,
    FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_logs_deployment_id
    ON logs(deployment_id, id);

  CREATE INDEX IF NOT EXISTS idx_ai_reasoning_deployment
    ON ai_reasoning(deployment_id);

  CREATE INDEX IF NOT EXISTS idx_deployments_created_at
    ON deployments(created_at DESC);

  ALTER TABLE deployments ADD COLUMN IF NOT EXISTS
    deployment_plan TEXT;
  
  ALTER TABLE deployments ADD COLUMN IF NOT EXISTS
    ai_reasoning_summary TEXT;
`);

try {
  db.exec('ALTER TABLE deployments ADD COLUMN app_url TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) throw err;
}

try {
  db.exec('ALTER TABLE deployments ADD COLUMN recovery_metadata TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) throw err;
}

try {
  db.exec('ALTER TABLE deployments ADD COLUMN pem_path TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) throw err;
}

try {
  db.exec('ALTER TABLE deployments ADD COLUMN ssh_user TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) throw err;
}

module.exports = db;
