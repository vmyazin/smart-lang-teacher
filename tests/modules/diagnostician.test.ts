import { describe, it, expect, vi } from "vitest";
import { diagnose } from "../../app/modules/diagnostician";
import type { ChatModel } from "../../app/lib/providers/types";

function chatReturning(issues: unknown): ChatModel {
  return {
    parse: vi.fn().mockResolvedValue(issues),
    generate: vi.fn(),
  };
}

describe("diagnose", () => {
  it("returns issues parsed from the model", async () => {
    const chat = chatReturning({
      issues: [
        {
          dimension: "naturalness",
          severity: "low",
          snippet: "make a party",
          natural_version: "throw a party",
          explanation: "Native speakers say 'throw'.",
          tags: ["collocation"],
        },
      ],
    });
    const out = await diagnose({
      transcript: "Yesterday I make a party.",
      targetLang: "en",
      nativeLang: "es",
      profile: [],
      chat,
    });
    expect(out).toHaveLength(1);
    expect(out[0].natural_version).toBe("throw a party");
    expect(chat.parse).toHaveBeenCalledOnce();
  });

  it("skips the model for an empty transcript", async () => {
    const chat = chatReturning({ issues: [] });
    const out = await diagnose({
      transcript: "   ",
      targetLang: "en",
      nativeLang: "es",
      profile: [],
      chat,
    });
    expect(out).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
  });
});
