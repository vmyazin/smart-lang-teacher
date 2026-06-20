import { describe, it, expect, vi } from "vitest";
import { selectTopIssues, composeLesson } from "../../app/modules/lesson-composer";
import type { ChatModel } from "../../app/lib/providers/types";
import type { Issue } from "../../app/domain/types";

function issue(severity: Issue["severity"], tag: string): Issue {
  return {
    dimension: "grammar",
    severity,
    snippet: tag,
    natural_version: tag,
    explanation: "x",
    tags: [tag],
  };
}

describe("selectTopIssues", () => {
  it("orders by severity and caps the count", () => {
    const out = selectTopIssues(
      [issue("low", "a"), issue("high", "b"), issue("medium", "c")],
      2,
    );
    expect(out.map((i) => i.tags[0])).toEqual(["b", "c"]);
  });
});

describe("composeLesson", () => {
  it("returns an encouraging empty lesson without calling the model", async () => {
    const chat: ChatModel = { parse: vi.fn(), generate: vi.fn() };
    const lesson = await composeLesson({
      issues: [],
      nativeLang: "es",
      targetLang: "en",
      chat,
    });
    expect(lesson.points).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
  });

  it("returns the model's lesson when there are issues", async () => {
    const chat: ChatModel = {
      parse: vi.fn().mockResolvedValue({
        intro: "Great answer!",
        points: [{ title: "Sound natural", body: "Try X.", phrase: "X" }],
      }),
      generate: vi.fn(),
    };
    const lesson = await composeLesson({
      issues: [issue("high", "b")],
      nativeLang: "es",
      targetLang: "en",
      chat,
    });
    expect(lesson.points[0].phrase).toBe("X");
    expect(chat.parse).toHaveBeenCalledOnce();
  });
});
