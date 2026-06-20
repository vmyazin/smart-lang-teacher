import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSaveAudio } from "../../app/lib/app-context.server";

describe("makeSaveAudio", () => {
  it("writes bytes and returns the path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "audio-"));
    const saveAudio = makeSaveAudio(dir);
    const path = await saveAudio(Buffer.from("hello"));
    expect(readFileSync(path).toString()).toBe("hello");
  });
});
