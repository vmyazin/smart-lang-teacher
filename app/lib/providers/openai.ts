// app/lib/providers/openai.ts
import OpenAI, { toFile } from "openai";
import type { SpeechToText, TextToSpeech } from "./types";

/** File transcription model for POST /v1/audio/transcriptions. */
export const OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe";

/**
 * Text-to-speech model for POST /v1/audio/speech.
 * Dated `gpt-4o-mini-tts` snapshots shut down on 2027-01-06. This bare alias
 * is still the model the speech guide documents. `gpt-realtime-2.1-mini` does
 * not support this endpoint, so it is not a drop-in replacement.
 */
export const OPENAI_SPEECH_MODEL = "gpt-4o-mini-tts";

/** Built-in voice supported by `gpt-4o-mini-tts` on the speech endpoint. */
export const OPENAI_SPEECH_VOICE = "alloy";

/**
 * `gpt-transcribe` language hints are ISO-639-1 codes (e.g. "pt"), so reduce
 * a locale tag like "pt-br" or "en_US" to its base subtag. Returns undefined for
 * anything that isn't a 2-letter code, so the hint is omitted instead of rejected.
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
      // openai@6 types the singular `language` field. gpt-transcribe uses
      // `languages` instead and rejects a request that sends both, so the
      // hint goes out on the request body the speech-to-text guide shows.
      const body = {
        file,
        model: OPENAI_TRANSCRIPTION_MODEL,
        ...(code ? { languages: [code] } : {}),
      };
      const res = await client.audio.transcriptions.create(
        { file, model: OPENAI_TRANSCRIPTION_MODEL },
        { body },
      );
      return res.text;
    },
  };
}

export function createOpenAiTts(client: OpenAI): TextToSpeech {
  return {
    async synthesize(text) {
      const res = await client.audio.speech.create({
        model: OPENAI_SPEECH_MODEL,
        voice: OPENAI_SPEECH_VOICE,
        input: text,
      });
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
