import { describe, it, expect } from "vitest";
import {
  reportProgress,
  getProgress,
  clearProgress,
  PROGRESS_TOTAL,
} from "../../app/lib/progress.server";

describe("turn progress store", () => {
  it("maps known pipeline events to a user-facing step + label", () => {
    const t = "tok-1";
    reportProgress(t, "transcribe: start");
    expect(getProgress(t)).toMatchObject({ step: 1, total: PROGRESS_TOTAL });
    reportProgress(t, "diagnose: start");
    const p = getProgress(t);
    expect(p?.step).toBe(2);
    expect(p?.label).toMatch(/analy/i);
  });

  it("ignores events that don't map to a stage", () => {
    const t = "tok-2";
    reportProgress(t, "diagnose: done"); // not a user-facing start event
    expect(getProgress(t)).toBeNull();
  });

  it("clears progress for a token", () => {
    const t = "tok-3";
    reportProgress(t, "tts: start");
    expect(getProgress(t)).not.toBeNull();
    clearProgress(t);
    expect(getProgress(t)).toBeNull();
  });

  it("returns null for an unknown token", () => {
    expect(getProgress("never-set")).toBeNull();
  });
});
