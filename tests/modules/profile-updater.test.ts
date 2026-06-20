import { describe, it, expect } from "vitest";
import {
  reviewIntervalDays,
  issueKey,
  updateProfile,
} from "../../app/modules/profile-updater";
import type { Issue, SkillItem } from "../../app/domain/types";

const now = new Date("2026-06-19T00:00:00.000Z");

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

describe("reviewIntervalDays", () => {
  it("ramps and caps", () => {
    expect(reviewIntervalDays(1)).toBe(1);
    expect(reviewIntervalDays(3)).toBe(7);
    expect(reviewIntervalDays(99)).toBe(35);
  });
});

describe("issueKey", () => {
  it("keys on dimension + first tag, lowercased", () => {
    expect(issueKey(issue())).toBe("grammar:past-tense");
  });
});

describe("updateProfile", () => {
  it("creates a new active item for a fresh issue", () => {
    const out = updateProfile([], [issue()], now);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(1);
    expect(out[0].status).toBe("active");
    expect(out[0].category).toBe("grammar");
    expect(out[0].label).toBe("past-tense");
    expect(out[0].next_review_at).toBe("2026-06-20T00:00:00.000Z");
  });

  it("increments occurrences and raises severity on recurrence", () => {
    const existing: SkillItem = {
      id: 5,
      user_id: 1,
      category: "grammar",
      label: "past-tense",
      description: "old",
      severity: "low",
      occurrences: 1,
      first_seen: "2026-06-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "improving",
      next_review_at: "2026-06-02T00:00:00.000Z",
    };
    const out = updateProfile([existing], [issue({ severity: "high" })], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(5);
    expect(out[0].occurrences).toBe(2);
    expect(out[0].severity).toBe("high");
    expect(out[0].status).toBe("active");
    expect(out[0].last_seen).toBe(now.toISOString());
  });

  it("promotes a due, untouched item toward mastery", () => {
    const existing: SkillItem = {
      id: 9,
      user_id: 1,
      category: "idiom",
      label: "phrasal-verbs",
      description: "d",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-05-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-06-10T00:00:00.000Z", // due before now
    };
    const out = updateProfile([existing], [], now);
    expect(out[0].status).toBe("improving");
    expect(new Date(out[0].next_review_at).getTime()).toBeGreaterThan(now.getTime());
  });

  it("leaves a not-yet-due untouched item unchanged", () => {
    const existing: SkillItem = {
      id: 9,
      user_id: 1,
      category: "idiom",
      label: "phrasal-verbs",
      description: "d",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-05-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-12-01T00:00:00.000Z", // not due
    };
    const out = updateProfile([existing], [], now);
    expect(out[0].status).toBe("active");
    expect(out[0].next_review_at).toBe("2026-12-01T00:00:00.000Z");
  });
});
