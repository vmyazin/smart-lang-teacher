import { Form, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/profile";
import Nav from "../components/Nav";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";
import type { SkillItem, SkillStatus } from "../domain/types";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const { repo } = getContext();
  const user = repo.getUser(userId);
  if (!user) return redirect("/");
  return { user, skills: repo.getSkillItems(userId) };
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
  return redirect("/profile");
}

const STATUS_ORDER: SkillStatus[] = ["active", "improving", "mastered"];
const STATUS_LABEL: Record<SkillStatus, string> = {
  active: "Working on",
  improving: "Improving",
  mastered: "Mastered",
};
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;

export default function Profile() {
  const { user, skills } = useLoaderData<typeof loader>();
  const now = Date.now();
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: skills
      .filter((s: SkillItem) => s.status === status)
      .sort(
        (a: SkillItem, b: SkillItem) =>
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          b.occurrences - a.occurrences,
      ),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="pk-wrap">
      <Nav />

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Your settings</span>
        <h1 className="pk-h1">Profile</h1>
        <Form method="post" className="pk-form">
          <div>
            <label className="pk-label" htmlFor="native_lang">Native language</label>
            <input id="native_lang" className="pk-input" name="native_lang" defaultValue={user.native_lang ?? "en"} />
          </div>
          <div>
            <label className="pk-label" htmlFor="target_lang">Learning</label>
            <input id="target_lang" className="pk-input" name="target_lang" defaultValue={user.target_lang ?? ""} placeholder="es" />
          </div>
          <div>
            <label className="pk-label" htmlFor="interests">Interests</label>
            <input id="interests" className="pk-input" name="interests" defaultValue={user.interests.join(", ")} placeholder="hiking, cooking" />
          </div>
          <div>
            <label className="pk-label" htmlFor="level">Level</label>
            <select id="level" className="pk-select" name="level" defaultValue={user.level ?? "intermediate"}>
              <option>beginner</option>
              <option>intermediate</option>
              <option>advanced</option>
            </select>
          </div>
          <button type="submit" className="pk-btn pk-btn--teal">Save changes</button>
        </Form>
      </div>

      <h2 className="pk-section-h">Skill progress</h2>
      {groups.length === 0 ? (
        <p className="pk-empty">No skills tracked yet — record an answer to get started.</p>
      ) : (
        groups.map((g) => (
          <div className="pk-skill-group" key={g.status}>
            <h3 className="pk-skill-group-h">
              {STATUS_LABEL[g.status]} <span className="pk-skill-count">{g.items.length}</span>
            </h3>
            <div className="pk-skill-items">
              {g.items.map((s: SkillItem) => {
                const due = new Date(s.next_review_at).getTime() <= now && s.status !== "mastered";
                return (
                  <div className="pk-skill-item" key={s.id}>
                    <span className="pk-skill-cat">{s.category}</span>
                    <span className="pk-skill-label">{s.label}</span>
                    <span className="pk-skill-meta">×{s.occurrences}</span>
                    {due && <span className="pk-skill-due">due</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </main>
  );
}
