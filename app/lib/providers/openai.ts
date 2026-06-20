import OpenAI, { toFile } from "openai";
import type { SpeechToText, TextToSpeech } from "./types";

export function createOpenAiStt(client: OpenAI): SpeechToText {
  return {
    async transcribe(audio, { language }) {
      const file = await toFile(audio, "audio.webm", { type: "audio/webm" });
      const res = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        ...(language ? { language } : {}),
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
