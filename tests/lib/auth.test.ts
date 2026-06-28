import { describe, it, expect } from "vitest";
import {
  hashPasscode,
  verifyPasscode,
  hashPassword,
  verifyPassword,
} from "../../app/lib/auth";

describe("auth", () => {
  it("verifies a correct passcode and rejects a wrong one", () => {
    const stored = hashPasscode("hunter2");
    expect(verifyPasscode("hunter2", stored)).toBe(true);
    expect(verifyPasscode("wrong", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", () => {
    expect(hashPasscode("x")).not.toBe(hashPasscode("x"));
  });

  it("verifies passwords (same scheme as passcodes)", () => {
    const stored = hashPassword("s3cret!");
    expect(verifyPassword("s3cret!", stored)).toBe(true);
    expect(verifyPassword("nope", stored)).toBe(false);
    // legacy passcodes verify as passwords unchanged
    expect(verifyPassword("hunter2", hashPasscode("hunter2"))).toBe(true);
  });
});
