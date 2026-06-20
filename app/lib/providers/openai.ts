import OpenAI, { toFile } from "openai";
import type { SpeechToText, TextToSpeech } from "./types";

/**
 * Whisper's `language` parameter requires an ISO-639-1 code (e.g. "pt"), so reduce
 * a locale tag like "pt-br" or "en_US" to its base subtag. Returns undefined for
 * anything that isn't a 2-letter code, letting Whisper auto-detect instead of 400ing.
 */
export function toIso6391(lang?: string): string | undefined {
  if (!lang) return undefined;
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(base) ? base : undefined;
}

export function createOpenAiStt(client: OpenAI): SpeechToText {
  return {
    async transcribe(audio, { language } = {}) {
      const file = await toFile(audio, "audio.webm", { type: "audio/webm" });
      const code = toIso6391(language);
      const res = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        ...(code ? { language: code } : {}),
      });
      return res.text;
    },
  };
}

export function createOpenAiTts(client: OpenAI): TextToSpeech {
  return {
    async synthesize(text) {
      const res = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
      });
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
