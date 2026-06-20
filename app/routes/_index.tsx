import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { getContext } from "../lib/app-context.server";
import { hashPasscode, verifyPasscode } from "../lib/auth";
import { createUserSession, getUserId } from "../lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request)) return redirect("/session");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const passcode = String(form.get("passcode") ?? "");
  if (!name || !passcode) return { error: "Name and passcode required." };

  const { repo } = getContext();
  const existing = repo.findUserByName(name);
  if (existing) {
    if (!verifyPasscode(passcode, existing.passcode_hash))
      return { error: "Wrong passcode." };
    const dest = existing.target_lang ? "/session" : "/onboarding";
    return createUserSession(existing.id, dest);
  }
  const user = repo.createUser({
    display_name: name,
    passcode_hash: hashPasscode(passcode),
  });
  return createUserSession(user.id, "/onboarding");
}

export default function Index() {
  const data = useActionData<typeof action>();
  return (
    <main className="pk-wrap pk-wrap--narrow">
      <div className="pk-bar">
        <span className="pk-logo">
          <span className="blob" />
          Parla
        </span>
      </div>

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Welcome</span>
        <h1 className="pk-h1">Let's get talking 🎙️</h1>
        <p className="pk-sub">Pick your profile — a new name starts a fresh one.</p>

        <Form method="post" className="pk-form">
          <div>
            <label className="pk-label" htmlFor="name">Your name</label>
            <input
              id="name"
              className="pk-input"
              name="name"
              placeholder="e.g. Sam"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="pk-label" htmlFor="passcode">Passcode</label>
            <input
              id="passcode"
              className="pk-input"
              name="passcode"
              type="password"
              placeholder="••••"
            />
          </div>
          {data?.error && <p className="pk-error">{data.error}</p>}
          <button type="submit" className="pk-btn">Continue →</button>
        </Form>
      </div>
    </main>
  );
}
