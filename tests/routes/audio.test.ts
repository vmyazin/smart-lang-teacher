import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// We import the loader directly. The Route.LoaderArgs type for the audio route
// matches { params: { name?: string } } — we construct a minimal stub.
import { loader } from "../../app/routes/audio";

function makeParams(name: string) {
  return {
    params: { name },
    request: new Request("http://localhost/audio/" + name),
    context: {},
  } as Parameters<typeof loader>[0];
}

describe("audio resource route", () => {
  let tmpDir: string;
  const originalAudioDir = process.env.AUDIO_DIR;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `audio-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    process.env.AUDIO_DIR = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalAudioDir === undefined) {
      delete process.env.AUDIO_DIR;
    } else {
      process.env.AUDIO_DIR = originalAudioDir;
    }
  });

  it("serves a valid audio file with correct content-type", async () => {
    const filename = `${randomUUID()}.webm`;
    const content = Buffer.from("fake-webm-bytes");
    writeFileSync(join(tmpDir, filename), content);

    const response = await loader(makeParams(filename));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/webm");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body).toEqual(content);
  });

  it("returns 404 for a file that does not exist", async () => {
    const response = await loader(makeParams("nonexistent.webm"));
    expect(response.status).toBe(404);
  });

  it("rejects path traversal with ../ (404)", async () => {
    // write the 'secret' file one level up
    const secretPath = join(tmpdir(), "secret.txt");
    writeFileSync(secretPath, "secret");
    try {
      const response = await loader(makeParams("../secret.txt"));
      expect(response.status).toBe(404);
    } finally {
      rmSync(secretPath, { force: true });
    }
  });

  it("rejects path traversal with .. alone (404)", async () => {
    const response = await loader(makeParams(".."));
    expect(response.status).toBe(404);
  });

  it("rejects names containing backslash (404)", async () => {
    const response = await loader(makeParams("sub\\file.webm"));
    expect(response.status).toBe(404);
  });

  it("rejects names containing forward slash (404)", async () => {
    const response = await loader(makeParams("sub/file.webm"));
    expect(response.status).toBe(404);
  });
});
