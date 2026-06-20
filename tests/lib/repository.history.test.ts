import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import type { Issue } from "../../app/domain/types";

function issue(over: Partial<Issue> = {}): Issue {
  return {
    dimension: "grammar",
    severity: "medium",
    snippet: "I have went",
    natural_version: "I went",
    explanation: "Use simple past.",
    tags: ["past-tense"],
    ...over,
  };
}

/** Seed a user with one completed turn; returns { repo, userId, turnId }. */
function seedTurn(
  repo: ReturnType<typeof createRepository>,
  name: string,
  opts: { prompt?: string; transcript?: string; issues?: Issue[] } = {},
) {
  const user = repo.createUser({ display_name: name, passcode_hash: "h" });
  const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
  const tid = repo.createTurn({
    session_id: sid,
    prompt_text: opts.prompt ?? "How was your weekend?",
    created_at: "2026-06-20T00:00:00.000Z",
  });
  repo.updateTurn(tid, { audio_path: "data/audio/rec.webm", transcript: opts.transcript ?? "fui a la montaña" });
  repo.saveDiagnosis(tid, opts.issues ?? [issue()]);
  repo.saveLesson(
    tid,
    { intro: "Nice!", points: [{ title: "Past tense", body: "Use 'went'.", phrase: "I went home." }] },
    [{ text: "I went home.", audio_path: "data/audio/phrase1.webm" }],
  );
  return { userId: user.id, turnId: tid };
}

describe("getTurnDetail", () => {
  it("returns the full detail for the owner", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId, turnId } = seedTurn(repo, "alice");
    const d = repo.getTurnDetail(turnId, userId);
    expect(d).not.toBeNull();
    expect(d!.prompt_text).toBe("How was your weekend?");
    expect(d!.transcript).toBe("fui a la montaña");
    expect(d!.audio_path).toBe("data/audio/rec.webm");
    expect(d!.issues).toHaveLength(1);
    expect(d!.lesson?.points[0].phrase).toBe("I went home.");
    expect(d!.voicedPhrases[0].audio_path).toBe("data/audio/phrase1.webm");
  });

  it("returns null for another user's turn (ownership guard)", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    const b = seedTurn(repo, "bob");
    expect(repo.getTurnDetail(a.turnId, b.userId)).toBeNull();
  });

  it("returns null for a non-existent turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId } = seedTurn(repo, "alice");
    expect(repo.getTurnDetail(99999, userId)).toBeNull();
  });
});

describe("listTurns", () => {
  it("lists the user's turns newest-first with parsed issue summary", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "cara", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t1 = repo.createTurn({ session_id: sid, prompt_text: "first", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(t1, { transcript: "uno" });
    repo.saveDiagnosis(t1, [issue({ dimension: "grammar", tags: ["past-tense"] })]);
    const t2 = repo.createTurn({ session_id: sid, prompt_text: "second", created_at: "2026-06-20T00:01:00.000Z" });
    repo.updateTurn(t2, { transcript: "dos" });
    repo.saveDiagnosis(t2, [
      issue({ dimension: "idiom", tags: ["slang"] }),
      issue({ dimension: "grammar", tags: ["agreement"] }),
    ]);

    const out = repo.listTurns(user.id);
    expect(out.map((t) => t.id)).toEqual([t2, t1]); // newest first
    expect(out[0].issueCount).toBe(2);
    expect(out[0].dimensions.sort()).toEqual(["grammar", "idiom"]);
  });

  it("includes turns that have no diagnosis (issueCount 0)", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "dan", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t = repo.createTurn({ session_id: sid, prompt_text: "quiet", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(t, { transcript: "" });
    const out = repo.listTurns(user.id);
    expect(out).toHaveLength(1);
    expect(out[0].issueCount).toBe(0);
    expect(out[0].dimensions).toEqual([]);
  });

  it("text search matches prompt or transcript", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "ed", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const a = repo.createTurn({ session_id: sid, prompt_text: "tell me about hiking", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(a, { transcript: "fui a la montaña" });
    const b = repo.createTurn({ session_id: sid, prompt_text: "tell me about food", created_at: "2026-06-20T00:01:00.000Z" });
    repo.updateTurn(b, { transcript: "comí pasta" });
    expect(repo.listTurns(user.id, { search: "hiking" }).map((t) => t.id)).toEqual([a]);
    expect(repo.listTurns(user.id, { search: "pasta" }).map((t) => t.id)).toEqual([b]);
  });

  it("skill filter matches by dimension and by tag", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "fay", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const a = repo.createTurn({ session_id: sid, prompt_text: "a", created_at: "2026-06-20T00:00:00.000Z" });
    repo.saveDiagnosis(a, [issue({ dimension: "grammar", tags: ["past-tense"] })]);
    const b = repo.createTurn({ session_id: sid, prompt_text: "b", created_at: "2026-06-20T00:01:00.000Z" });
    repo.saveDiagnosis(b, [issue({ dimension: "idiom", tags: ["slang"] })]);
    expect(repo.listTurns(user.id, { skill: "idiom" }).map((t) => t.id)).toEqual([b]);
    expect(repo.listTurns(user.id, { skill: "past-tense" }).map((t) => t.id)).toEqual([a]);
  });

  it("never returns another user's turns", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    seedTurn(repo, "bob");
    const out = repo.listTurns(a.userId);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(a.turnId);
  });
});

describe("listSkillFacets", () => {
  it("returns sorted distinct dimensions + tags for the user only", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "gus", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t = repo.createTurn({ session_id: sid, prompt_text: "p", created_at: "2026-06-20T00:00:00.000Z" });
    repo.saveDiagnosis(t, [
      issue({ dimension: "grammar", tags: ["past-tense", "agreement"] }),
      issue({ dimension: "idiom", tags: ["slang"] }),
    ]);
    // another user's data must not leak in
    const other = seedTurn(repo, "hank", { issues: [issue({ dimension: "register", tags: ["formality"] })] });
    void other;

    expect(repo.listSkillFacets(user.id)).toEqual([
      "agreement",
      "grammar",
      "idiom",
      "past-tense",
      "slang",
    ]);
  });

  it("returns an empty list when the user has no diagnoses", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "ivy", passcode_hash: "h" });
    expect(repo.listSkillFacets(user.id)).toEqual([]);
  });
});

describe("current_prompt + status", () => {
  it("round-trips current_prompt (set, read, clear)", () => {
    const repo = createRepository(openDb(":memory:"));
    const u = repo.createUser({ display_name: "pp", passcode_hash: "h" });
    expect(repo.getUser(u.id)!.current_prompt).toBeNull();
    repo.setCurrentPrompt(u.id, "¿Como vai?");
    expect(repo.getUser(u.id)!.current_prompt).toBe("¿Como vai?");
    repo.setCurrentPrompt(u.id, null);
    expect(repo.getUser(u.id)!.current_prompt).toBeNull();
  });

  it("createTurn stores status (default answered, explicit skipped)", () => {
    const repo = createRepository(openDb(":memory:"));
    const u = repo.createUser({ display_name: "st", passcode_hash: "h" });
    const sid = repo.createSession(u.id, "2026-06-20T00:00:00.000Z");
    const answered = repo.createTurn({ session_id: sid, prompt_text: "a", created_at: "2026-06-20T00:00:00.000Z" });
    const skipped = repo.createTurn({ session_id: sid, prompt_text: "b", created_at: "2026-06-20T00:01:00.000Z", status: "skipped" });
    const list = repo.listTurns(u.id);
    const byId = Object.fromEntries(list.map((t) => [t.id, t.status]));
    expect(byId[answered]).toBe("answered");
    expect(byId[skipped]).toBe("skipped");
    expect(repo.getTurnDetail(skipped, u.id)!.status).toBe("skipped");
  });
});

describe("deleteTurn", () => {
  it("deletes the turn + its diagnosis/lesson and returns audio paths", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId, turnId } = seedTurn(repo, "alice"); // seeds audio_path + a voiced phrase
    const res = repo.deleteTurn(turnId, userId);
    expect(res).not.toBeNull();
    expect(res!.audioPaths).toContain("data/audio/rec.webm");
    expect(res!.audioPaths).toContain("data/audio/phrase1.webm");
    expect(repo.getTurnDetail(turnId, userId)).toBeNull();
    expect(repo.listTurns(userId)).toHaveLength(0);
  });

  it("returns null and deletes nothing for another user's turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    const b = seedTurn(repo, "bob");
    expect(repo.deleteTurn(a.turnId, b.userId)).toBeNull();
    expect(repo.getTurnDetail(a.turnId, a.userId)).not.toBeNull(); // still there
  });

  it("returns null for a missing turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId } = seedTurn(repo, "alice");
    expect(repo.deleteTurn(99999, userId)).toBeNull();
  });
});
