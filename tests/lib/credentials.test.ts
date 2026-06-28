import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "creds-test-"));
const origDb = process.env.DB_PATH;
const origAudio = process.env.AUDIO_DIR;
process.env.DB_PATH = join(root, "app.db");
process.env.AUDIO_DIR = join(root, "audio");

// Imported after env is set so getContext() opens the temp DB.
const { getContext, getUserProviders, MissingApiKeyError, invalidateUserProviders } =
  await import("../../app/lib/app-context.server");
const { setApiKey, removeApiKey, getKeyStatus } =
  await import("../../app/lib/credentials.server");
const { decryptSecret } = await import("../../app/lib/crypto.server");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (origDb === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = origDb;
  if (origAudio === undefined) delete process.env.AUDIO_DIR;
  else process.env.AUDIO_DIR = origAudio;
});

function newUser() {
  return getContext().repo.createUser({
    email: `u-${Math.random()}@t.local`,
    password_hash: "h",
  }).id;
}

describe("credentials.server", () => {
  it("stores keys encrypted and reports masked status", () => {
    const uid = newUser();
    expect(getKeyStatus(uid)).toEqual({ anthropic: null, openai: null });

    setApiKey(uid, "anthropic", "sk-ant-secret-9999");
    const status = getKeyStatus(uid);
    expect(status.anthropic).toBe("…9999");
    expect(status.openai).toBeNull();

    // Stored value is ciphertext, not the plaintext.
    const cred = getContext().repo.getCredential(uid, "anthropic")!;
    expect(cred.secret_enc).not.toContain("sk-ant-secret-9999");
    expect(decryptSecret(cred.secret_enc)).toBe("sk-ant-secret-9999");
  });

  it("removes a key", () => {
    const uid = newUser();
    setApiKey(uid, "openai", "sk-openai-1234");
    expect(getKeyStatus(uid).openai).toBe("…1234");
    removeApiKey(uid, "openai");
    expect(getKeyStatus(uid).openai).toBeNull();
  });
});

describe("getUserProviders", () => {
  it("throws MissingApiKeyError until both keys are set", () => {
    const uid = newUser();
    expect(() => getUserProviders(uid)).toThrow(MissingApiKeyError);
    setApiKey(uid, "anthropic", "sk-ant-xxxx");
    expect(() => getUserProviders(uid)).toThrow(MissingApiKeyError);
    setApiKey(uid, "openai", "sk-openai-yyyy");
    const providers = getUserProviders(uid);
    expect(providers.chat).toBeDefined();
    expect(providers.stt).toBeDefined();
    expect(providers.tts).toBeDefined();
  });

  it("caches and rebuilds on key change", () => {
    const uid = newUser();
    setApiKey(uid, "anthropic", "sk-ant-a");
    setApiKey(uid, "openai", "sk-openai-a");
    const first = getUserProviders(uid);
    expect(getUserProviders(uid)).toBe(first); // cached instance

    setApiKey(uid, "anthropic", "sk-ant-b"); // change → cache invalidated
    expect(getUserProviders(uid)).not.toBe(first);

    invalidateUserProviders(uid);
    expect(() => getUserProviders(uid)).not.toThrow();
  });
});
