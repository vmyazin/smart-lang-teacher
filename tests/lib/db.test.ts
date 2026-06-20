import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";

describe("openDb", () => {
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
