import { describe, it, expect } from "vitest";
import { fileBasename } from "../../app/lib/paths";

describe("fileBasename", () => {
  it("returns the final segment of a posix path", () => {
    expect(fileBasename("data/audio/abc.webm")).toBe("abc.webm");
  });
  it("handles windows-style separators", () => {
    expect(fileBasename("data\\audio\\xyz.webm")).toBe("xyz.webm");
  });
  it("returns the input when there is no separator", () => {
    expect(fileBasename("plain.webm")).toBe("plain.webm");
  });
});
