import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, keyHint } from "../../app/lib/crypto.server";

describe("crypto.server", () => {
  it("round-trips a secret", () => {
    const plain = "sk-ant-abc123-very-secret";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered ciphertext", () => {
    const enc = encryptSecret("hello");
    const [v, iv, tag, ct] = enc.split(":");
    const flipped = ct[0] === "A" ? "B" : "A";
    const bad = [v, iv, tag, flipped + ct.slice(1)].join(":");
    expect(() => decryptSecret(bad)).toThrow();
  });

  it("rejects a malformed value", () => {
    expect(() => decryptSecret("not-encrypted")).toThrow();
  });

  it("masks a key to its last 4 chars", () => {
    expect(keyHint("sk-ant-1234")).toBe("…1234");
    expect(keyHint("")).toBe("…");
  });
});
