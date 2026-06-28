import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { loader } from "../../app/routes/audio";
import { getContext } from "../../app/lib/app-context.server";
import { createUserSession } from "../../app/lib/session.server";

// Shared temp dirs for the whole file: getContext() is a module singleton, so
// DB_PATH/AUDIO_DIR must be fixed before the first getContext() call.
const root = mkdtempSync(join(tmpdir(), "audio-test-"));
const audioDir = join(root, "audio");
const dbPath = join(root, "app.db");
const origAudio = process.env.AUDIO_DIR;
const origDb = process.env.DB_PATH;

process.env.AUDIO_DIR = audioDir;
process.env.DB_PATH = dbPath;
mkdirSync(audioDir, { recursive: true });

beforeAll(() => {
  mkdirSync(audioDir, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (origAudio === undefined) delete process.env.AUDIO_DIR;
  else process.env.AUDIO_DIR = origAudio;
  if (origDb === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = origDb;
});

function makeArgs(name: string, cookie?: string) {
  return {
    params: { name },
    request: new Request("http://localhost/audio/" + name, {
      headers: cookie ? { Cookie: cookie } : {},
    }),
    context: {},
  } as Parameters<typeof loader>[0];
}

/** Mint a signed session cookie for a user id. */
async function sessionCookie(userId: number): Promise<string> {
  const res = await createUserSession(userId, "/");
  return res.headers.get("Set-Cookie")!.split(";")[0];
}

describe("audio resource route", () => {
  let owner: number;
  let stranger: number;
  let ownedFile: string;

  beforeEach(() => {
    const { repo } = getContext();
    owner = repo.createUser({ email: `o-${randomUUID()}@t.local`, password_hash: "h" }).id;
    stranger = repo.createUser({ email: `s-${randomUUID()}@t.local`, password_hash: "h" }).id;
    ownedFile = `${randomUUID()}.webm`;
    writeFileSync(join(audioDir, ownedFile), Buffer.from("fake-webm-bytes"));
    const sid = repo.createSession(owner, "2026-06-20T00:00:00.000Z");
    const tid = repo.createTurn({
      session_id: sid,
      prompt_text: "p",
      created_at: "2026-06-20T00:00:00.000Z",
    });
    repo.updateTurn(tid, { audio_path: join(audioDir, ownedFile) });
  });

  it("serves an owned audio file with correct content-type", async () => {
    const res = await loader(makeArgs(ownedFile, await sessionCookie(owner)));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from("fake-webm-bytes"));
  });

  it("returns 404 when not logged in", async () => {
    expect((await loader(makeArgs(ownedFile))).status).toBe(404);
  });

  it("returns 404 when another user requests the file (tenant isolation)", async () => {
    const res = await loader(makeArgs(ownedFile, await sessionCookie(stranger)));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a file that does not exist", async () => {
    const res = await loader(makeArgs("nonexistent.webm", await sessionCookie(owner)));
    expect(res.status).toBe(404);
  });

  it("rejects path traversal with ../ (404)", async () => {
    expect((await loader(makeArgs("../secret.txt"))).status).toBe(404);
  });

  it("rejects path traversal with .. alone (404)", async () => {
    expect((await loader(makeArgs(".."))).status).toBe(404);
  });

  it("rejects names containing backslash (404)", async () => {
    expect((await loader(makeArgs("sub\\file.webm"))).status).toBe(404);
  });

  it("rejects names containing forward slash (404)", async () => {
    expect((await loader(makeArgs("sub/file.webm"))).status).toBe(404);
  });
});
