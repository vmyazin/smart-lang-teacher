import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { openDb } from "./db";
import { createRepository, type Repository } from "./repository";
import { createAnthropicChatModel } from "./providers/anthropic";
import { createOpenAiStt, createOpenAiTts } from "./providers/openai";
import type { ChatModel, SpeechToText, TextToSpeech } from "./providers/types";

export function makeSaveAudio(dir: string) {
  mkdirSync(dir, { recursive: true });
  return async (bytes: Buffer): Promise<string> => {
    const path = join(dir, `${randomUUID()}.webm`);
    writeFileSync(path, bytes);
    return path;
  };
}

export interface AppContext {
  repo: Repository;
  chat: ChatModel;
  stt: SpeechToText;
  tts: TextToSpeech;
  saveAudio: (bytes: Buffer) => Promise<string>;
}

let ctx: AppContext | null = null;

export function getContext(): AppContext {
  if (ctx) return ctx;
  const db = openDb(process.env.DB_PATH ?? "data/app.db");
  // Bound every API call so a hung request can't freeze a turn forever.
  // Worst-case wall-clock per call ≈ timeout × (maxRetries + 1).
  const anthropic = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  const openai = new OpenAI({ timeout: 45_000, maxRetries: 1 });
  ctx = {
    repo: createRepository(db),
    chat: createAnthropicChatModel(anthropic),
    stt: createOpenAiStt(openai),
    tts: createOpenAiTts(openai),
    saveAudio: makeSaveAudio(process.env.AUDIO_DIR ?? "data/audio"),
  };
  return ctx;
}
