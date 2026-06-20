import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { ChatModel } from "../../../app/lib/providers/types";

const fake: ChatModel = {
  async parse({ schema }) {
    return schema.parse({ ok: true });
  },
  async generate() {
    return "hello";
  },
};

describe("ChatModel interface", () => {
  it("parse returns schema-validated data", async () => {
    const out = await fake.parse({
      system: "s",
      user: "u",
      schema: z.object({ ok: z.boolean() }),
    });
    expect(out.ok).toBe(true);
  });

  it("generate returns text", async () => {
    expect(await fake.generate({ system: "s", user: "u" })).toBe("hello");
  });
});
