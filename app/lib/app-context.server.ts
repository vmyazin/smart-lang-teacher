import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { openDb } from "./db";
import { createRepository, type Repository } from "./repository";
import { createAnthropicChatModel } from "./providers/anthropic";
import { createOpenAiStt, createOpenAiTts } from "./providers/openai";
import { decryptSecret } from "./crypto.server";
import type { ApiProvider } from "../domain/types";
import type { ChatModel, SpeechToText, TextToSpeech } from "./providers/types";

export function makeSaveAudio(dir: string) {
  mkdirSync(dir, { recursive: true });
  return async (bytes: Buffer): Promise<string> => {
    const path = join(dir, `${randomUUID()}.webm`);
    writeFileSync(path, bytes);
    return path;
  };
}

/** Shared, key-independent services available to every request. */
export interface AppContext {
  repo: Repository;
  saveAudio: (bytes: Buffer) => Promise<string>;
}

/** Per-user AI provider clients, built from that user's stored API keys. */
export interface UserProviders {
  chat: ChatModel;
  stt: SpeechToText;
  tts: TextToSpeech;
}

/** Thrown when a user tries to run the pipeline without the required API key. */
export class MissingApiKeyError extends Error {
  constructor(public provider: ApiProvider) {
    super(`Missing ${provider} API key`);
    this.name = "MissingApiKeyError";
  }
}

let ctx: AppContext | null = null;

export function getContext(): AppContext {
  if (ctx) return ctx;
  const db = openDb(process.env.DB_PATH ?? "data/app.db");
  ctx = {
    repo: createRepository(db),
    saveAudio: makeSaveAudio(process.env.AUDIO_DIR ?? "data/audio"),
  };
  return ctx;
}

// Provider clients are cached per user so we don't rebuild SDK clients on every
// turn. The fingerprint is derived from the encrypted secrets, so changing a
// key (which rewrites secret_enc) automatically invalidates the cache.
interface CachedProviders {
  fingerprint: string;
  providers: UserProviders;
}
const providerCache = new Map<number, CachedProviders>();

function fingerprint(...encrypted: string[]): string {
  return createHash("sha256").update(encrypted.join("|")).digest("hex");
}

/**
 * Build (or reuse) the Anthropic + OpenAI clients for a user from their stored,
 * encrypted API keys. Throws {@link MissingApiKeyError} if a key is absent.
 */
export function getUserProviders(userId: number): UserProviders {
  const { repo } = getContext();
  const anthropicCred = repo.getCredential(userId, "anthropic");
  if (!anthropicCred) throw new MissingApiKeyError("anthropic");
  const openaiCred = repo.getCredential(userId, "openai");
  if (!openaiCred) throw new MissingApiKeyError("openai");

  const fp = fingerprint(anthropicCred.secret_enc, openaiCred.secret_enc);
  const cached = providerCache.get(userId);
  if (cached && cached.fingerprint === fp) return cached.providers;

  // Bound every API call so a hung request can't freeze a turn forever.
  // Worst-case wall-clock per call ≈ timeout × (maxRetries + 1).
  const anthropic = new Anthropic({
    apiKey: decryptSecret(anthropicCred.secret_enc),
    timeout: 90_000,
    maxRetries: 1,
  });
  const openai = new OpenAI({
    apiKey: decryptSecret(openaiCred.secret_enc),
    timeout: 45_000,
    maxRetries: 1,
  });
  const providers: UserProviders = {
    chat: createAnthropicChatModel(anthropic),
    stt: createOpenAiStt(openai),
    tts: createOpenAiTts(openai),
  };
  providerCache.set(userId, { fingerprint: fp, providers });
  return providers;
}

/** Drop a user's cached provider clients (call after their keys change). */
export function invalidateUserProviders(userId: number): void {
  providerCache.delete(userId);
}
