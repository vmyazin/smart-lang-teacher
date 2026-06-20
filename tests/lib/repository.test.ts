import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import type { SkillItem } from "../../app/domain/types";

function repo() {
  return createRepository(openDb(":memory:"));
}

describe("repository", () => {
  it("creates and finds a user", () => {
    const r = repo();
    const u = r.createUser({ display_name: "alice", passcode_hash: "h" });
    expect(u.id).toBeGreaterThan(0);
    const found = r.findUserByName("alice");
    expect(found?.passcode_hash).toBe("h");
    expect(r.findUserByName("nobody")).toBeNull();
  });

  it("updates a user profile and reads interests back as an array", () => {
    const r = repo();
    const u = r.createUser({ display_name: "bob", passcode_hash: "h" });
    r.updateUserProfile(u.id, {
      native_lang: "en",
      target_lang: "es",
      interests: ["hiking", "music"],
      level: "intermediate",
    });
    const got = r.getUser(u.id);
    expect(got?.interests).toEqual(["hiking", "music"]);
    expect(got?.target_lang).toBe("es");
  });

  it("round-trips skill items", () => {
    const r = repo();
    const u = r.createUser({ display_name: "cara", passcode_hash: "h" });
    const item: SkillItem = {
      id: 0,
      user_id: u.id,
      category: "grammar",
      label: "past-tense",
      description: "Confuses past tenses.",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-06-01T00:00:00.000Z",
      last_seen: "2026-06-10T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-06-12T00:00:00.000Z",
    };
    r.replaceSkillItems(u.id, [item]);
    const got = r.getSkillItems(u.id);
    expect(got).toHaveLength(1);
    expect(got[0].label).toBe("past-tense");
    expect(got[0].occurrences).toBe(2);
  });

  it("persists a turn, diagnosis, and lesson", () => {
    const r = repo();
    const u = r.createUser({ display_name: "dan", passcode_hash: "h" });
    const sid = r.createSession(u.id, "2026-06-19T00:00:00.000Z");
    const tid = r.createTurn({
      session_id: sid,
      prompt_text: "How was your day?",
      created_at: "2026-06-19T00:00:00.000Z",
    });
    r.updateTurn(tid, { transcript: "It was good" });
    r.saveDiagnosis(tid, []);
    r.saveLesson(tid, { intro: "Nice", points: [] }, []);
    expect(tid).toBeGreaterThan(0);
  });
});
