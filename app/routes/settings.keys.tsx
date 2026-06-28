import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/settings.keys";
import Nav from "../components/Nav";
import { getUserId } from "../lib/session.server";
import { getKeyStatus, removeApiKey, setApiKey } from "../lib/credentials.server";
import type { ApiProvider } from "../domain/types";

// Local copy (not imported from the .server module) so the client component can
// reference it without pulling server code into the browser bundle.
const PROVIDERS: ApiProvider[] = ["anthropic", "openai"];

const LABELS: Record<ApiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (Whisper + TTS)",
};
const HELP: Record<ApiProvider, string> = {
  anthropic: "Used to generate prompts and analyze your answers.",
  openai: "Used to transcribe your recording and voice example phrases.",
};

function isProvider(v: string): v is ApiProvider {
  return (PROVIDERS as string[]).includes(v);
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  return { status: getKeyStatus(userId) };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const form = await request.formData();
  const provider = String(form.get("provider") ?? "");
  if (!isProvider(provider)) return { error: "Unknown provider." };

  const intent = String(form.get("intent") ?? "save");
  if (intent === "remove") {
    removeApiKey(userId, provider);
    return redirect("/settings/keys");
  }
  const key = String(form.get("key") ?? "").trim();
  if (!key) return { error: "Please paste a key before saving.", provider };
  setApiKey(userId, provider, key);
  return redirect("/settings/keys");
}

export default function ApiKeys() {
  const { status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main className="pk-wrap">
      <Nav />
      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Your settings</span>
        <h1 className="pk-h1">API keys 🔑</h1>
        <p className="pk-sub">
          Your keys are encrypted before they're stored and are only used to make
          requests on your behalf. We never show them again — only the last few
          characters.
        </p>

        {PROVIDERS.map((provider) => {
          const hint = status[provider];
          return (
            <div className="pk-form" key={provider} style={{ marginTop: "1.5rem" }}>
              <h3 className="pk-skill-group-h">{LABELS[provider]}</h3>
              <p className="pk-sub">{HELP[provider]}</p>
              {hint && (
                <p className="pk-sub">
                  Saved key ending in <code>{hint}</code>.
                </p>
              )}
              {actionData?.error && actionData.provider === provider && (
                <p className="pk-error">{actionData.error}</p>
              )}
              <Form method="post" className="pk-form">
                <input type="hidden" name="provider" value={provider} />
                <div>
                  <label className="pk-label" htmlFor={`key-${provider}`}>
                    {hint ? "Replace key" : "Add key"}
                  </label>
                  <input
                    id={`key-${provider}`}
                    className="pk-input"
                    name="key"
                    type="password"
                    placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                    autoComplete="off"
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" name="intent" value="save" className="pk-btn pk-btn--teal">
                    Save
                  </button>
                  {hint && (
                    <button type="submit" name="intent" value="remove" className="pk-btn pk-btn--ghost">
                      Remove
                    </button>
                  )}
                </div>
              </Form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
