import { Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/history";
import Nav from "../components/Nav";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";
import type { TurnSummary } from "../domain/types";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const skill = url.searchParams.get("skill")?.trim() ?? "";
  const { repo } = getContext();
  const turns = repo.listTurns(userId, { search: q || undefined, skill: skill || undefined });
  const facets = repo.listSkillFacets(userId);
  return { turns, facets, q, skill };
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default function History() {
  const { turns, facets, q, skill } = useLoaderData<typeof loader>();
  return (
    <main className="pk-wrap">
      <Nav />
      <h1 className="pk-h1">Your lessons</h1>

      <Form method="get" className="pk-search">
        <input className="pk-input" name="q" defaultValue={q} placeholder="Search prompts & answers…" />
        <select className="pk-select" name="skill" defaultValue={skill}>
          <option value="">All skills</option>
          {facets.map((f: string) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button type="submit" className="pk-btn pk-btn--teal">Search</button>
      </Form>

      {turns.length === 0 ? (
        <p className="pk-empty">
          {q || skill ? "No lessons match that search." : "No lessons yet — record your first answer in Practice."}
        </p>
      ) : (
        <div className="pk-history">
          {turns.map((t: TurnSummary) => (
            <Link to={`/history/${t.id}`} className="pk-history-row" key={t.id}>
              <div className="pk-history-main">
                <span className="pk-history-date">{dateLabel(t.created_at)}</span>
                <span className="pk-history-prompt">{t.prompt_text}</span>
              </div>
              <span className="pk-history-badge">
                {t.issueCount} {t.issueCount === 1 ? "tip" : "tips"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
