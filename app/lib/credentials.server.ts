import { getContext, invalidateUserProviders } from "./app-context.server";
import { encryptSecret, keyHint } from "./crypto.server";
import type { ApiProvider } from "../domain/types";

export const PROVIDERS: ApiProvider[] = ["anthropic", "openai"];

/** Encrypt and store (or replace) a user's API key for a provider. */
export function setApiKey(
  userId: number,
  provider: ApiProvider,
  plaintext: string,
): void {
  const key = plaintext.trim();
  if (!key) throw new Error("Empty API key");
  const { repo } = getContext();
  repo.upsertCredential(
    userId,
    provider,
    encryptSecret(key),
    keyHint(key),
    new Date().toISOString(),
  );
  invalidateUserProviders(userId);
}

/** Remove a user's stored key for a provider. */
export function removeApiKey(userId: number, provider: ApiProvider): void {
  const { repo } = getContext();
  repo.deleteCredential(userId, provider);
  invalidateUserProviders(userId);
}

/** Masked status for the settings page: provider → hint (null = not set). */
export function getKeyStatus(userId: number): Record<ApiProvider, string | null> {
  const { repo } = getContext();
  const hints = repo.listCredentialHints(userId);
  const status: Record<ApiProvider, string | null> = {
    anthropic: null,
    openai: null,
  };
  for (const { provider, hint } of hints) status[provider] = hint ?? "set";
  return status;
}
