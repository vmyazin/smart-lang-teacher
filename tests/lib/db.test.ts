import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDb } from "../../app/lib/db";

describe("openDb", () => {
  it("creates the parent directory if it does not exist", () => {
    const base = mkdtempSync(join(tmpdir(), "db-"));
    const dbPath = join(base, "nested", "deeper", "app.db");
    const db = openDb(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it("creates all tables", () => {
    const db = openDb(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const t of [
      "users",
      "sessions",
      "turns",
      "diagnoses",
      "skill_items",
      "lessons",
      "api_credentials",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("creates users with the email/password auth shape", () => {
    const db = openDb(":memory:");
    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain("email");
    expect(cols).toContain("password_hash");
    expect(cols).not.toContain("passcode_hash");
  });
});

describe("users migration from passcode auth", () => {
  it("rebuilds a legacy users table preserving ids and data", () => {
    const base = mkdtempSync(join(tmpdir(), "db-migrate-"));
    const dbPath = join(base, "app.db");

    // Build a legacy (pre-auth) database by hand.
    const legacy = new Database(dbPath);
    legacy.exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL UNIQUE,
      passcode_hash TEXT NOT NULL,
      native_lang TEXT, target_lang TEXT,
      interests TEXT NOT NULL DEFAULT '[]', level TEXT, current_prompt TEXT
    );`);
    legacy
      .prepare("INSERT INTO users (id, display_name, passcode_hash, target_lang) VALUES (7, 'Sam', 'scrypthash', 'es')")
      .run();
    legacy.close();

    // openDb runs the migration.
    const db = openDb(dbPath);
    const row = db.prepare("SELECT * FROM users WHERE id = 7").get() as any;
    expect(row.id).toBe(7); // id preserved so FKs stay valid
    expect(row.email).toBe("sam@legacy.local");
    expect(row.password_hash).toBe("scrypthash"); // passcode reused as password
    expect(row.display_name).toBe("Sam");
    expect(row.target_lang).toBe("es");
    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).not.toContain("passcode_hash");
    db.close();
  });
});

describe("schema migration", () => {
  it("adds current_prompt to users and status to turns", () => {
    const db = openDb(":memory:");
    const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    const turnCols = (db.prepare("PRAGMA table_info(turns)").all() as { name: string }[]).map((c) => c.name);
    expect(userCols).toContain("current_prompt");
    expect(turnCols).toContain("status");
  });

  it("defaults turns.status to 'answered'", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO users (email, password_hash) VALUES ('a@t.local','h')").run();
    db.prepare("INSERT INTO sessions (user_id, started_at) VALUES (1, 't')").run();
    db.prepare("INSERT INTO turns (session_id, prompt_text, created_at) VALUES (1, 'p', 't')").run();
    const row = db.prepare("SELECT status FROM turns WHERE id = 1").get() as { status: string };
    expect(row.status).toBe("answered");
  });
});
