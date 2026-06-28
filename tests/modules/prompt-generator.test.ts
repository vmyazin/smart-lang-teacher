import { describe, it, expect, vi } from "vitest";
import { dueItems, generatePrompt } from "../../app/modules/prompt-generator";
import type { ChatModel } from "../../app/lib/providers/types";
import type { SkillItem } from "../../app/domain/types";

const now = new Date("2026-06-19T00:00:00.000Z");

function item(over: Partial<SkillItem>): SkillItem {
  return {
    id: 1,
    user_id: 1,
    category: "grammar",
    label: "x",
    description: "d",
    severity: "medium",
    occurrences: 1,
    first_seen: "2026-06-01T00:00:00.000Z",
    last_seen: "2026-06-01T00:00:00.000Z",
    status: "active",
    next_review_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("dueItems", () => {
  it("returns non-mastered items whose review date has passed", () => {
    const out = dueItems(
      [
        item({ id: 1, next_review_at: "2026-06-10T00:00:00.000Z" }),
        item({ id: 2, next_review_at: "2026-12-01T00:00:00.000Z" }),
        item({ id: 3, status: "mastered", next_review_at: "2026-01-01T00:00:00.000Z" }),
      ],
      now,
    );
    expect(out.map((i) => i.id)).toEqual([1]);
  });
});

describe("generatePrompt", () => {
  it("calls the model and returns trimmed text", async () => {
    const chat: ChatModel = {
      parse: vi.fn(),
      generate: vi.fn().mockResolvedValue("  Tell me about a hobby.  "),
    };
    const out = await generatePrompt({
      interests: ["hiking"],
      profile: [],
      targetLang: "en",
      now,
      chat,
    });
    expect(out).toBe("Tell me about a hobby.");
    expect(chat.generate).toHaveBeenCalledOnce();
  });

  it("passes recent prompts to the model so it can avoid repeating", async () => {
    const generate = vi.fn().mockResolvedValue("A fresh question.");
    const chat: ChatModel = { parse: vi.fn(), generate };
    await generatePrompt({
      interests: ["cooking", "jiu-jitsu"],
      profile: [],
      targetLang: "pt",
      now,
      chat,
      recentPrompts: ["What did you cook today?", "How was training?"],
    });
    const { user } = generate.mock.calls[0][0];
    expect(user).toContain("What did you cook today?");
    expect(user).toContain("How was training?");
  });
});
