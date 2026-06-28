import { describe, it, expect, vi } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import { runTurn } from "../../app/modules/run-turn";
import type { ChatModel, SpeechToText, TextToSpeech } from "../../app/lib/providers/types";

const now = new Date("2026-06-19T00:00:00.000Z");

function setup() {
  const repo = createRepository(openDb(":memory:"));
  const user = repo.createUser({ email: "t@t.local", password_hash: "h" });
  repo.updateUserProfile(user.id, {
    native_lang: "es",
    target_lang: "en",
    interests: ["music"],
    level: "intermediate",
  });
  const full = repo.getUser(user.id)!;
  const sid = repo.createSession(user.id, now.toISOString());
  const tid = repo.createTurn({
    session_id: sid,
    prompt_text: "How was your day?",
    created_at: now.toISOString(),
  });
  return { repo, user: full, sid, tid };
}

const stt = (text: string): SpeechToText => ({
  transcribe: vi.fn().mockResolvedValue(text),
});
const tts: TextToSpeech = { synthesize: vi.fn().mockResolvedValue(Buffer.from("x")) };

describe("runTurn", () => {
  it("runs the full pipeline and persists a profile + lesson", async () => {
    const { repo, user, sid, tid } = setup();
    const chat: ChatModel = {
      parse: vi
        .fn()
        // diagnose → issues
        .mockResolvedValueOnce({
          issues: [
            {
              dimension: "grammar",
              severity: "high",
              snippet: "I have went",
              natural_version: "I went",
              explanation: "Use simple past.",
              tags: ["past-tense"],
            },
          ],
        })
        // composeLesson → lesson
        .mockResolvedValueOnce({
          intro: "Nice!",
          points: [{ title: "Past tense", body: "Use 'went'.", phrase: "I went home." }],
        }),
      generate: vi.fn(),
    };

    const result = await runTurn({
      repo,
      user,
      sessionId: sid,
      turnId: tid,
      promptText: "How was your day?",
      audio: Buffer.from("audio"),
      chat,
      stt: stt("Yesterday I have went home."),
      tts,
      now,
      saveAudio: async () => "data/audio/1.webm",
    });

    expect(result.transcript).toContain("went home");
    expect(result.lesson.points[0].phrase).toBe("I went home.");
    expect(result.voicedPhrases[0].audio_path).not.toBeNull();
    expect(repo.getSkillItems(user.id)).toHaveLength(1);
  });

  it("short-circuits on a blank transcript", async () => {
    const { repo, user, sid, tid } = setup();
    const chat: ChatModel = { parse: vi.fn(), generate: vi.fn() };
    const result = await runTurn({
      repo,
      user,
      sessionId: sid,
      turnId: tid,
      promptText: "How was your day?",
      audio: Buffer.from(""),
      chat,
      stt: stt("   "),
      tts,
      now,
      saveAudio: async () => "data/audio/1.webm",
    });
    expect(result.lesson.points).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
    expect(repo.getSkillItems(user.id)).toHaveLength(0);
  });
});
