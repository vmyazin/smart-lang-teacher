// tests/lib/providers/openai.test.ts
import { describe, it, expect, vi } from "vitest";
import type OpenAI from "openai";
import {
  toIso6391,
  createOpenAiStt,
  createOpenAiTts,
  OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_SPEECH_MODEL,
  OPENAI_SPEECH_VOICE,
} from "../../../app/lib/providers/openai";

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

function mockClient() {
  const transcriptionsCreate = vi.fn().mockResolvedValue({ text: "olá" });
  const speechCreate = vi.fn().mockResolvedValue({
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  const client = {
    audio: {
      transcriptions: { create: transcriptionsCreate },
      speech: { create: speechCreate },
    },
  } as unknown as OpenAI;
  return { client, transcriptionsCreate, speechCreate };
}

describe("OpenAI provider model selection", () => {
  it("transcribes recorded audio with gpt-transcribe and a languages hint", async () => {
    const { client, transcriptionsCreate } = mockClient();
    const transcript = await createOpenAiStt(client).transcribe(Buffer.from("audio"), {
      language: "pt-BR",
    });

    expect(transcript).toBe("olá");
    expect(OPENAI_TRANSCRIPTION_MODEL).toBe("gpt-transcribe");
    expect(transcriptionsCreate).toHaveBeenCalledOnce();
    const [params, options] = transcriptionsCreate.mock.calls[0];
    expect(params).toMatchObject({ model: "gpt-transcribe" });
    expect(params).not.toHaveProperty("language");
    expect(params).not.toHaveProperty("languages");
    expect(options.body).toMatchObject({
      model: "gpt-transcribe",
      languages: ["pt"],
    });
    expect(options.body).not.toHaveProperty("language");
    expect(options.body.file).toBeDefined();
  });

  it("omits the language hint when none is usable", async () => {
    const { client, transcriptionsCreate } = mockClient();
    await createOpenAiStt(client).transcribe(Buffer.from("audio"), { language: "spanish" });

    const options = transcriptionsCreate.mock.calls[0][1];
    expect(options.body.model).toBe("gpt-transcribe");
    expect(options.body).not.toHaveProperty("languages");
    expect(options.body).not.toHaveProperty("language");
  });

  it("synthesizes speech with gpt-4o-mini-tts and the alloy voice", async () => {
    const { client, speechCreate } = mockClient();
    const audio = await createOpenAiTts(client).synthesize("Bom dia");

    expect(OPENAI_SPEECH_MODEL).toBe("gpt-4o-mini-tts");
    expect(OPENAI_SPEECH_VOICE).toBe("alloy");
    expect(speechCreate).toHaveBeenCalledWith({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "Bom dia",
    });
    expect(audio).toEqual(Buffer.from([1, 2, 3]));
  });
});
