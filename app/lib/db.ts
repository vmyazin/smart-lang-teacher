import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  native_lang TEXT,
  target_lang TEXT,
  interests TEXT NOT NULL DEFAULT '[]',
  level TEXT,
  current_prompt TEXT
);
CREATE TABLE IF NOT EXISTS api_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  hint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider)
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  prompt_text TEXT NOT NULL,
  audio_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'answered'
);
CREATE TABLE IF NOT EXISTS diagnoses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER NOT NULL REFERENCES turns(id),
  issues TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  occurrences INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  status TEXT NOT NULL,
  next_review_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER NOT NULL REFERENCES turns(id),
  content TEXT NOT NULL,
  voiced_phrases TEXT NOT NULL
);
`;

function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function tableColumns(db: Db, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

/**
 * Migrate the pre-auth `users` table (display_name + passcode_hash) to the
 * email/password shape. Rebuilds the table inside a transaction, preserving
 * `id` so foreign keys in sessions/skill_items stay valid. Legacy rows get a
 * placeholder `<name>@legacy.local` email and keep their passcode as the
 * password (identical scrypt salt:hash format), so they can still log in.
 */
function migrateUsers(db: Db): void {
  const cols = tableColumns(db, "users");
  if (cols.includes("email") || !cols.includes("passcode_hash")) return;

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        native_lang TEXT,
        target_lang TEXT,
        interests TEXT NOT NULL DEFAULT '[]',
        level TEXT,
        current_prompt TEXT
      );
    `);
    db.exec(`
      INSERT INTO users_new
        (id, email, password_hash, display_name, native_lang, target_lang, interests, level, current_prompt)
      SELECT
        id,
        lower(display_name) || '@legacy.local',
        passcode_hash,
        display_name,
        native_lang, target_lang, interests, level, current_prompt
      FROM users;
    `);
    db.exec(`DROP TABLE users;`);
    db.exec(`ALTER TABLE users_new RENAME TO users;`);
  });
  tx();
}

export function openDb(path: string): Db {
  // better-sqlite3 won't create missing parent directories; do it ourselves
  // (skip for the in-memory database used in tests).
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateUsers(db);
  ensureColumn(db, "users", "current_prompt", "current_prompt TEXT");
  ensureColumn(db, "turns", "status", "status TEXT NOT NULL DEFAULT 'answered'");
  return db;
}
