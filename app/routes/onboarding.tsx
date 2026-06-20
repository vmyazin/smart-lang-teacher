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
    <main className="pk-wrap pk-wrap--narrow">
      <div className="pk-bar">
        <span className="pk-logo">
          <span className="blob" />
          Parla
        </span>
      </div>

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Set up</span>
        <h1 className="pk-h1">What are we learning? 🌍</h1>
        <p className="pk-sub">A few quick things so prompts feel like you.</p>

        <Form method="post" className="pk-form">
          <div>
            <label className="pk-label" htmlFor="native_lang">Native language</label>
            <input id="native_lang" className="pk-input" name="native_lang" defaultValue="en" />
          </div>
          <div>
            <label className="pk-label" htmlFor="target_lang">Learning</label>
            <input id="target_lang" className="pk-input" name="target_lang" placeholder="es" />
          </div>
          <div>
            <label className="pk-label" htmlFor="interests">Interests</label>
            <input
              id="interests"
              className="pk-input"
              name="interests"
              placeholder="hiking, cooking, football"
            />
          </div>
          <div>
            <label className="pk-label" htmlFor="level">Level</label>
            <select id="level" className="pk-select" name="level" defaultValue="intermediate">
              <option>beginner</option>
              <option>intermediate</option>
              <option>advanced</option>
            </select>
          </div>
          <button type="submit" className="pk-btn pk-btn--teal">Start learning →</button>
        </Form>
      </div>
    </main>
  );
}
