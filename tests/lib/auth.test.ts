import { describe, it, expect } from "vitest";
import { hashPasscode, verifyPasscode } from "../../app/lib/auth";

describe("auth", () => {
  it("verifies a correct passcode and rejects a wrong one", () => {
    const stored = hashPasscode("hunter2");
    expect(verifyPasscode("hunter2", stored)).toBe(true);
    expect(verifyPasscode("wrong", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", () => {
    expect(hashPasscode("x")).not.toBe(hashPasscode("x"));
  });
});
