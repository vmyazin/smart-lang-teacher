import { describe, it, expect } from "vitest";
import { toIso6391 } from "../../../app/lib/providers/openai";

describe("toIso6391", () => {
  it("reduces a locale tag to its base ISO-639-1 subtag", () => {
    expect(toIso6391("pt-br")).toBe("pt");
    expect(toIso6391("en_US")).toBe("en");
    expect(toIso6391("ES")).toBe("es");
  });

  it("passes through a plain two-letter code", () => {
    expect(toIso6391("fr")).toBe("fr");
  });

  it("returns undefined for missing or non-ISO-639-1 input", () => {
    expect(toIso6391(undefined)).toBeUndefined();
    expect(toIso6391("")).toBeUndefined();
    expect(toIso6391("spanish")).toBeUndefined();
    expect(toIso6391("123")).toBeUndefined();
  });
});
