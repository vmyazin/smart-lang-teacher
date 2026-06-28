import { useState } from "react";
import { Form, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/_index";
import { getContext } from "../lib/app-context.server";
import { hashPassword, verifyPassword } from "../lib/auth";
import { createUserSession, getUserId } from "../lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request)) return redirect("/session");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const mode = String(form.get("mode") ?? "signin");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password required." };

  const { repo } = getContext();
  const existing = repo.findUserByEmail(email);

  if (mode === "signup") {
    if (existing) return { error: "An account with that email already exists." };
    const name = String(form.get("name") ?? "").trim();
    const user = repo.createUser({
      email,
      password_hash: hashPassword(password),
      display_name: name || null,
    });
    return createUserSession(user.id, "/onboarding");
  }

  // signin
  if (!existing || !verifyPassword(password, existing.password_hash))
    return { error: "Wrong email or password." };
  const dest = existing.target_lang ? "/session" : "/onboarding";
  return createUserSession(existing.id, dest);
}

export default function Index() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const isSignup = mode === "signup";

  return (
    <main className="pk-wrap pk-wrap--narrow">
      <div className="pk-bar">
        <span className="pk-logo">
          <span className="blob" />
          Parla
        </span>
      </div>

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">{isSignup ? "Create account" : "Welcome back"}</span>
        <h1 className="pk-h1">Let's get talking 🎙️</h1>

        <div className="pk-tabs" role="tablist" style={{ marginTop: "12px" }}>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={"pk-tab" + (!isSignup ? " is-active" : "")}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={"pk-tab" + (isSignup ? " is-active" : "")}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <Form method="post" className="pk-form">
          <input type="hidden" name="mode" value={mode} />
          {isSignup && (
            <div>
              <label className="pk-label" htmlFor="name">Your name</label>
              <input
                id="name"
                className="pk-input"
                name="name"
                placeholder="e.g. Sam"
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="pk-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="pk-input"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="pk-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="pk-input"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </div>
          {data?.error && <p className="pk-error">{data.error}</p>}
          <button type="submit" className="pk-btn">
            {isSignup ? "Create account →" : "Sign in →"}
          </button>
        </Form>
      </div>
    </main>
  );
}
