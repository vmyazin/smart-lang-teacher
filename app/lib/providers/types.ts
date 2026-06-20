import type { ZodType } from "zod";

export interface ChatModel {
  parse<T>(opts: {
    system: string;
    user: string;
    schema: ZodType<T>;
    thinking?: boolean;
  }): Promise<T>;
  generate(opts: { system: string; user: string }): Promise<string>;
}

export interface SpeechToText {
  transcribe(audio: Buffer, opts: { language?: string }): Promise<string>;
}

export interface TextToSpeech {
  synthesize(text: string, opts?: { language?: string }): Promise<Buffer>;
}
