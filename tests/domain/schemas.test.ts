import { describe, it, expect } from "vitest";
import { IssueListSchema, LessonSchema } from "../../app/domain/schemas";

describe("schemas", () => {
  it("parses a valid issue list", () => {
    const parsed = IssueListSchema.parse({
      issues: [
        {
          dimension: "grammar",
          severity: "medium",
          snippet: "I have went",
          natural_version: "I went",
          explanation: "Use the simple past.",
          tags: ["past-tense"],
        },
      ],
    });
    expect(parsed.issues[0].dimension).toBe("grammar");
  });

  it("rejects an unknown dimension", () => {
    expect(() =>
      IssueListSchema.parse({
        issues: [
          {
            dimension: "spelling",
            severity: "low",
            snippet: "x",
            natural_version: "y",
            explanation: "z",
            tags: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("parses a valid lesson", () => {
    const parsed = LessonSchema.parse({
      intro: "Nice answer!",
      points: [
        { title: "Sounding natural", body: "Try X.", phrase: "X phrase" },
      ],
    });
    expect(parsed.points).toHaveLength(1);
  });
});
