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
    <main style={{ maxWidth: 420, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Language Teacher</h1>
      <p>Pick your profile (new name = new profile).</p>
      <Form method="post">
        <input name="name" placeholder="Your name" autoComplete="off" />
        <input name="passcode" type="password" placeholder="Passcode" />
        <button type="submit">Continue</button>
      </Form>
      {data?.error && <p style={{ color: "crimson" }}>{data.error}</p>}
    </main>
  );
}
