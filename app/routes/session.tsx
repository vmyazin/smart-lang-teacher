import { useRef, useState } from "react";
import { redirect, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/session";
import { getContext } from "../lib/app-context.server";
import { createLogger } from "../lib/log.server";
import { getUserId } from "../lib/session.server";
import { generatePrompt } from "../modules/prompt-generator";
import { runTurn } from "../modules/run-turn";

/** Extract just the filename from a server-side path (works in browser without node:path). */
function fileBasename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const { repo, chat } = getContext();
  const user = repo.getUser(userId);
  if (!user || !user.target_lang) return redirect("/onboarding");
  const profile = repo.getSkillItems(userId);
  const log = createLogger(`prompt user=${userId}`);
  log("generate prompt: start", { target: user.target_lang, profileItems: profile.length });
  const prompt = await generatePrompt({
    interests: user.interests,
    profile,
    targetLang: user.target_lang,
    now: new Date(),
    chat,
  });
  log("generate prompt: done", { chars: prompt.length });
  const tracking = profile
    .filter((s) => s.status !== "mastered")
    .slice(0, 4)
    .map((s) => s.label);
  return { prompt, user, tracking };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const ctx = getContext();
  const user = ctx.repo.getUser(userId);
  if (!user) return redirect("/");

  const log = createLogger(`turn user=${userId}`);
  const form = await request.formData();
  const promptText = String(form.get("prompt") ?? "");
  const blob = form.get("audio");
  if (!(blob instanceof File)) {
    log("rejected: no audio");
    return { error: "No audio received — please try recording again." };
  }
  const audio = Buffer.from(await blob.arrayBuffer());
  log("turn: received", { audioBytes: audio.length, promptChars: promptText.length });

  const now = new Date();
  const sessionId = ctx.repo.createSession(userId, now.toISOString());
  const turnId = ctx.repo.createTurn({
    session_id: sessionId,
    prompt_text: promptText,
    created_at: now.toISOString(),
  });
  log("turn: persisted", { sessionId, turnId });

  try {
    const result = await runTurn({
      repo: ctx.repo,
      user,
      sessionId,
      turnId,
      promptText,
      audio,
      chat: ctx.chat,
      stt: ctx.stt,
      tts: ctx.tts,
      log,
      now,
      saveAudio: ctx.saveAudio,
    });
    log("turn: done", {
      transcriptChars: result.transcript.trim().length,
      points: result.lesson.points.length,
    });
    return { result };
  } catch (err) {
    log("turn: ERROR", { message: String(err) });
    return {
      error:
        "Something went wrong while analyzing your answer. Please try recording again.",
    };
  }
}

const PLAY_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

/** A phrase pill that plays its TTS audio on tap (falls back to text only if synthesis failed). */
function Phrase({ text, src }: { text: string; src: string | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      className={"pk-say" + (playing ? " is-playing" : "")}
      disabled={!src}
      onClick={() => {
        const a = ref.current;
        if (a) {
          a.currentTime = 0;
          void a.play();
        }
      }}
    >
      {src && <span className="pk-pl">{PLAY_ICON}</span>}
      <span className="pk-say-t">{text}</span>
      {src && (
        <audio
          ref={ref}
          src={src}
          preload="none"
          onPlay={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
        />
      )}
    </button>
  );
}

export default function Session() {
  const { prompt, user, tracking } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [recording, setRecording] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

  const busy = fetcher.state !== "idle";
  const result =
    fetcher.data && "result" in fetcher.data ? fetcher.data.result : null;
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const lesson = result?.lesson ?? null;
  const voicedPhrases = result?.voicedPhrases ?? [];
  const transcript = result?.transcript ?? null;

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.start();
    recorder.current = mr;
    setRecording(true);
  }

  async function stop() {
    const mr = recorder.current!;
    await new Promise<void>((res) => {
      mr.onstop = () => res();
      mr.stop();
    });
    mr.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("audio", blob, "audio.webm");
    fetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <main className="pk-wrap">
      <div className="pk-bar">
        <span className="pk-logo">
          <span className="blob" />
          Parla
        </span>
        <span className="pk-pill">
          {(user.target_lang ?? "es").toUpperCase()}
          {user.level ? ` · ${user.level}` : ""}
        </span>
      </div>

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Today's prompt</span>
        <h1 className="pk-h1">{prompt}</h1>
      </div>

      <div className="pk-micwrap">
        <button
          type="button"
          className={"pk-mic" + (recording ? " pk-mic--live" : "")}
          disabled={busy}
          onClick={recording ? stop : start}
          aria-label={recording ? "Stop and submit" : "Record answer"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" />
          </svg>
        </button>
        <div className="pk-cap">
          {busy ? "Thinking…" : recording ? "Listening… tap to finish" : "Tap & talk!"}
        </div>
        <div className="pk-cap-sub">
          {busy
            ? "Transcribing & analyzing — this takes a few seconds."
            : "Answer like you'd tell a friend — about three sentences."}
        </div>
        {error && <p className="pk-error" style={{ marginTop: 16 }}>{error}</p>}
      </div>

      {transcript && (
        <div className="pk-heard">
          <div className="pk-heard-h">you said</div>
          {transcript}
        </div>
      )}

      {lesson && (
        <>
          <p className="pk-lead">
            <span className="pk-emo">🎉</span> {lesson.intro}
          </p>

          {lesson.points.length > 0 && (
            <div className="pk-deck">
              {lesson.points.map(
                (p: { title: string; body: string; phrase: string }, i: number) => {
                  const vp = voicedPhrases[i] ?? null;
                  const audioSrc = vp?.audio_path
                    ? `/audio/${fileBasename(vp.audio_path)}`
                    : null;
                  return (
                    <div className="pk-tip" key={i}>
                      <div className="pk-tip-row">
                        <span className={`pk-badge pk-badge--${i % 3}`}>{i + 1}</span>
                        <h3>{p.title}</h3>
                      </div>
                      <p>{p.body}</p>
                      <Phrase text={p.phrase} src={audioSrc} />
                    </div>
                  );
                },
              )}
            </div>
          )}

          <div className="pk-foot">
            {tracking.length > 0 && (
              <>
                <span className="pk-foot-lab">Working on</span>
                {tracking.map((t) => (
                  <span className="pk-chip" key={t}>
                    {t}
                  </span>
                ))}
              </>
            )}
            <button
              type="button"
              className="pk-btn pk-btn--teal pk-spacer"
              onClick={() => location.reload()}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </main>
  );
}
