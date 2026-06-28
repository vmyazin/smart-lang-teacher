import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/history.turn";
import Nav from "../components/Nav";
import HighlightedText from "../components/HighlightedText";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";
import { fileBasename } from "../lib/paths";
import type { Issue } from "../domain/types";

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const id = Number(params.turnId);
  if (!Number.isInteger(id)) return redirect("/history");
  const { repo } = getContext();
  const detail = repo.getTurnDetail(id, userId);
  if (!detail) return redirect("/history");
  return { detail };
}

export default function HistoryTurn() {
  const { detail } = useLoaderData<typeof loader>();
  const yourAudio = detail.audio_path ? `/audio/${fileBasename(detail.audio_path)}` : null;

  return (
    <main className="pk-wrap">
      <Nav />
      <Link to="/history" className="pk-back">← All lessons</Link>

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Prompt</span>
        <h1 className="pk-h1">{detail.prompt_text}</h1>
      </div>

      {detail.status === "skipped" && (
        <p className="pk-skipped-note">You skipped this one — no answer recorded.</p>
      )}

      {detail.transcript && (
        <div className="pk-heard">
          <div className="pk-heard-h">you said</div>
          <HighlightedText
            text={detail.transcript}
            snippets={detail.issues.map((iss: Issue) => iss.snippet)}
          />
          {detail.issues.length > 0 && (
            <div className="pk-heard-key">Highlighted = could be improved</div>
          )}
          {yourAudio && <audio className="pk-audio" controls src={yourAudio} />}
        </div>
      )}

      {detail.lesson && (
        <>
          <p className="pk-lead"><span className="pk-emo">🎉</span> {detail.lesson.intro}</p>
          {detail.lesson.points.length > 0 && (
            <div className="pk-deck">
              {detail.lesson.points.map((p: { title: string; body: string; phrase: string }, i: number) => {
                const vp = detail.voicedPhrases[i] ?? null;
                const src = vp?.audio_path ? `/audio/${fileBasename(vp.audio_path)}` : null;
                return (
                  <div className="pk-tip" key={i}>
                    <div className="pk-tip-row">
                      <span className={`pk-badge pk-badge--${i % 3}`}>{i + 1}</span>
                      <h3>{p.title}</h3>
                    </div>
                    <p>{p.body}</p>
                    <div className="pk-phrase-line">
                      <span className="pk-phrase-text">{p.phrase}</span>
                      {src && <audio className="pk-audio" controls src={src} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {detail.issues.length > 0 && (
        <details className="pk-diag">
          <summary>What we noticed ({detail.issues.length})</summary>
          <ul>
            {detail.issues.map((iss: Issue, i: number) => (
              <li key={i}>
                <b>{iss.dimension}</b>: "{iss.snippet}" → "{iss.natural_version}" — {iss.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
