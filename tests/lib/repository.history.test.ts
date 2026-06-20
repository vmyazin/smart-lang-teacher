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
