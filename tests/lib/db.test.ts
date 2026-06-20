import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    ]) {
      expect(names).toContain(t);
    }
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
    db.prepare("INSERT INTO users (display_name, passcode_hash) VALUES ('a','h')").run();
    db.prepare("INSERT INTO sessions (user_id, started_at) VALUES (1, 't')").run();
    db.prepare("INSERT INTO turns (session_id, prompt_text, created_at) VALUES (1, 'p', 't')").run();
    const row = db.prepare("SELECT status FROM turns WHERE id = 1").get() as { status: string };
    expect(row.status).toBe("answered");
  });
});
