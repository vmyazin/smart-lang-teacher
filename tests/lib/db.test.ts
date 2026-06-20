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
