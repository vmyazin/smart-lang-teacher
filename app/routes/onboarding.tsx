import { Form, redirect } from "react-router";
import type { Route } from "./+types/onboarding";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const form = await request.formData();
  const { repo } = getContext();
  repo.updateUserProfile(userId, {
    native_lang: String(form.get("native_lang") ?? "en"),
    target_lang: String(form.get("target_lang") ?? "en"),
    interests: String(form.get("interests") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    level: String(form.get("level") ?? "intermediate"),
  });
  return redirect("/session");
}

export default function Onboarding() {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Set up your learning</h1>
      <Form method="post">
        <label>Native language <input name="native_lang" defaultValue="en" /></label>
        <label>Target language <input name="target_lang" placeholder="es" /></label>
        <label>Interests (comma-separated) <input name="interests" /></label>
        <label>
          Level
          <select name="level" defaultValue="intermediate">
            <option>beginner</option>
            <option>intermediate</option>
            <option>advanced</option>
          </select>
        </label>
        <button type="submit">Start</button>
      </Form>
    </main>
  );
}
