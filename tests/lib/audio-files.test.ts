import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkAudioFiles } from "../../app/lib/audio-files.server";

const savedAudioDir = process.env.AUDIO_DIR;
afterEach(() => {
  if (savedAudioDir === undefined) delete process.env.AUDIO_DIR;
  else process.env.AUDIO_DIR = savedAudioDir;
});

describe("unlinkAudioFiles", () => {
  it("unlinks files by basename within AUDIO_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-"));
    process.env.AUDIO_DIR = dir;
    const file = join(dir, "rec.webm");
    writeFileSync(file, "x");
    // a stored path like "data/audio/rec.webm" → only the basename is used
    unlinkAudioFiles(["data/audio/rec.webm"]);
    expect(existsSync(file)).toBe(false);
  });

  it("does not throw on a missing file (best-effort)", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-"));
    process.env.AUDIO_DIR = dir;
    expect(() => unlinkAudioFiles(["data/audio/nope.webm"])).not.toThrow();
  });

  it("only touches the basename — never escapes the dir via traversal", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-"));
    process.env.AUDIO_DIR = dir;
    const outside = join(dir, "..", "outside.webm");
    writeFileSync(outside, "keep");
    unlinkAudioFiles(["../outside.webm"]); // basename "outside.webm" → dir/outside.webm (not the parent)
    expect(existsSync(outside)).toBe(true);
  });
});
