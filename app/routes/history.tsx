import { useState } from "react";
import { Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/history";
import Nav from "../components/Nav";
import { getContext } from "../lib/app-context.server";
import { unlinkAudioFiles } from "../lib/audio-files.server";
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

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const form = await request.formData();
  const q = String(form.get("q") ?? "");
  const skill = String(form.get("skill") ?? "");
  const back = () => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (skill) qs.set("skill", skill);
    const s = qs.toString();
    return redirect("/history" + (s ? `?${s}` : ""));
  };

  if (String(form.get("intent")) === "delete") {
    const turnId = Number(form.get("turnId"));
    if (Number.isInteger(turnId) && turnId > 0) {
      const { repo } = getContext();
      const res = repo.deleteTurn(turnId, userId);
      if (res) unlinkAudioFiles(res.audioPaths);
    }
  }
  return back();
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function badge(t: TurnSummary) {
  if (t.status === "skipped") {
    return <span className="pk-history-badge pk-badge-skip">skipped</span>;
  }
  return (
    <span className="pk-history-badge">
      {t.issueCount} {t.issueCount === 1 ? "tip" : "tips"}
    </span>
  );
}

export default function History() {
  const { turns, facets, q, skill } = useLoaderData<typeof loader>();
  const [editing, setEditing] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <main className="pk-wrap">
      <Nav />
      <div className="pk-history-head">
        <h1 className="pk-h1">Your lessons</h1>
        {turns.length > 0 && (
          <button
            type="button"
            className="pk-btn pk-btn--ghost pk-edit-btn"
            onClick={() => {
              setEditing((e) => !e);
              setConfirmId(null);
            }}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

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
          {turns.map((t: TurnSummary) => {
            const inner = (
              <>
                <div className="pk-history-main">
                  <span className="pk-history-date">{dateLabel(t.created_at)}</span>
                  <span className="pk-history-prompt">{t.prompt_text}</span>
                </div>
                {badge(t)}
              </>
            );
            if (!editing) {
              return (
                <Link to={`/history/${t.id}`} className="pk-history-row" key={t.id}>
                  {inner}
                </Link>
              );
            }
            return (
              <div className="pk-history-row pk-history-row--edit" key={t.id}>
                {inner}
                {confirmId === t.id ? (
                  <span className="pk-row-confirm">
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="turnId" value={t.id} />
                      <input type="hidden" name="q" value={q} />
                      <input type="hidden" name="skill" value={skill} />
                      <button type="submit" className="pk-del-yes">Delete</button>
                    </Form>
                    <button type="button" className="pk-del-no" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="pk-trash"
                    aria-label="Delete this lesson"
                    onClick={() => setConfirmId(t.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                      <path d="M9 3v1H4v2h16V4h-5V3H9ZM6 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8H6Zm3 3h2v8H9v-8Zm4 0h2v8h-2v-8Z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
