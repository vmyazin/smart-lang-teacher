import { useEffect, useRef, useState } from "react";
import { Form, redirect, useLoaderData, useFetcher } from "react-router";
import Nav from "../components/Nav";
import HighlightedText from "../components/HighlightedText";
import type { Route } from "./+types/session";
import { getContext, getUserProviders, MissingApiKeyError } from "../lib/app-context.server";
import { unlinkAudioFiles } from "../lib/audio-files.server";
import { createLogger, type StageLogger } from "../lib/log.server";
import { clearProgress, reportProgress } from "../lib/progress.server";
import { getUserId } from "../lib/session.server";
import { fileBasename } from "../lib/paths";
import { generatePrompt } from "../modules/prompt-generator";
import { runTurn } from "../modules/run-turn";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const { repo } = getContext();
  const user = repo.getUser(userId);
  if (!user || !user.target_lang) return redirect("/onboarding");
  const profile = repo.getSkillItems(userId);

  let prompt = user.current_prompt;
  if (!prompt) {
    let chat;
    try {
      ({ chat } = getUserProviders(userId));
    } catch (err) {
      if (err instanceof MissingApiKeyError) return redirect("/settings/keys");
      throw err;
    }
    const log = createLogger(`prompt user=${userId}`);
    log("generate prompt: start", { target: user.target_lang, profileItems: profile.length });
    prompt = await generatePrompt({
      interests: user.interests,
      profile,
      targetLang: user.target_lang,
      level: user.level,
      now: new Date(),
      chat,
      recentPrompts: repo.recentPrompts(userId, 5),
    });
    repo.setCurrentPrompt(userId, prompt);
    log("generate prompt: done", { chars: prompt.length });
  }

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

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "answer");

  let providers;
  try {
    providers = getUserProviders(userId);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      if (intent === "skip" || intent === "next") return redirect("/settings/keys");
      return { error: "Add your API keys in Settings → API keys to start practicing." };
    }
    throw err;
  }
  const { chat, stt, tts } = providers;

  // "New question": record the current prompt as skipped, then regenerate.
  if (intent === "skip" || intent === "next") {
    const log = createLogger(`skip user=${userId}`);
    const current = user.current_prompt;
    if (intent === "skip" && current) {
      const now = new Date();
      const sessionId = ctx.repo.createSession(userId, now.toISOString());
      ctx.repo.createTurn({
        session_id: sessionId,
        prompt_text: current,
        created_at: now.toISOString(),
        status: "skipped",
      });
      log("skipped prompt recorded");
    }
    const fresh = await generatePrompt({
      interests: user.interests,
      profile: ctx.repo.getSkillItems(userId),
      targetLang: user.target_lang ?? "en",
      level: user.level,
      now: new Date(),
      chat,
      recentPrompts: ctx.repo.recentPrompts(userId, 5),
    });
    ctx.repo.setCurrentPrompt(userId, fresh);
    log("new prompt generated", { chars: fresh.length });
    if (intent === "next") return { prompt: fresh };
    return redirect("/session");
  }

  // Answer flow.
  const token = String(form.get("progressToken") ?? "");
  const base = createLogger(`turn user=${userId}`);
  const log: StageLogger = (event, detail) => {
    base(event, detail);
    if (token) reportProgress(token, event);
  };

  const blob = form.get("audio");
  if (!(blob instanceof File)) {
    log("rejected: no audio");
    return { error: "No audio received — please try recording again." };
  }
  const audio = Buffer.from(await blob.arrayBuffer());
  const promptText = user.current_prompt ?? String(form.get("prompt") ?? "");
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
      chat,
      stt,
      tts,
      log,
      now,
      saveAudio: ctx.saveAudio,
    });
    log("turn: done", {
      transcriptChars: result.transcript.trim().length,
      points: result.lesson.points.length,
    });
    ctx.repo.setCurrentPrompt(userId, null);
    return { result };
  } catch (err) {
    log("turn: ERROR", { message: String(err) });
    // Remove the empty turn this failed attempt created so it doesn't litter
    // history (and repeated retries don't accumulate "0 tips" ghost rows).
    const deleted = ctx.repo.deleteTurn(turnId, userId);
    if (deleted) unlinkAudioFiles(deleted.audioPaths);
    return {
      error:
        "Analyzing your answer failed. You can listen to your recording below and try again.",
    };
  } finally {
    if (token) clearProgress(token);
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

interface Progress {
  step: number;
  total: number;
  label: string | null;
}

// Cap each answer so recordings stay short (and well under upload limits). The
// last COUNTDOWN_FROM seconds show a wrap-up countdown before we auto-submit.
const MAX_RECORDING_SEC = 60;
const COUNTDOWN_FROM = 10;
const NEW_QUESTION_SOUND_KEY = "parla:play-new-question-sound";
const UI_SOUNDS = {
  tap: "/sfx/ui-tap.mp3",
  recordStart: "/sfx/ui-record-start.mp3",
  recordStop: "/sfx/ui-record-stop.mp3",
  newQuestion: "/sfx/ui-new-question.mp3",
} as const;
type UiSound = keyof typeof UI_SOUNDS;

const fmtClock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Session() {
  const { prompt: loaderPrompt, user, tracking } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const nextFetcher = useFetcher<typeof action>();
  const [prompt, setPrompt] = useState(loaderPrompt);
  const [showResult, setShowResult] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordSec, setRecordSec] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const tokenRef = useRef<string>("");
  const lastBlobRef = useRef<Blob | null>(null);
  const soundsRef = useRef<Partial<Record<UiSound, HTMLAudioElement>>>({});
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const analysisBusy = fetcher.state !== "idle";
  const nextBusy = nextFetcher.state !== "idle";
  const busy = analysisBusy || nextBusy;
  const result =
    showResult && fetcher.data && "result" in fetcher.data ? fetcher.data.result : null;
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const lesson = result?.lesson ?? null;
  const voicedPhrases = result?.voicedPhrases ?? [];
  const transcript = result?.transcript ?? null;
  const issues = result?.issues ?? [];

  function playSound(sound: UiSound) {
    if (typeof Audio === "undefined") return;
    let audio = soundsRef.current[sound];
    if (!audio) {
      audio = new Audio(UI_SOUNDS[sound]);
      audio.preload = "auto";
      audio.volume = 0.55;
      soundsRef.current[sound] = audio;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* Browsers can block non-gesture playback; the UI action still proceeds. */
    });
  }

  useEffect(() => {
    setPrompt(loaderPrompt);
  }, [loaderPrompt]);

  useEffect(() => {
    if (fetcher.data && "result" in fetcher.data) setShowResult(true);
  }, [fetcher.data]);

  useEffect(() => {
    const nextPromptText = nextFetcher.data && "prompt" in nextFetcher.data ? nextFetcher.data.prompt : null;
    if (typeof nextPromptText !== "string") return;
    setPrompt(nextPromptText);
    setShowResult(false);
    lastBlobRef.current = null;
    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [nextFetcher.data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(NEW_QUESTION_SOUND_KEY) !== "1") return;
    window.sessionStorage.removeItem(NEW_QUESTION_SOUND_KEY);
    playSound("newQuestion");
    // Only check after the rendered prompt changes; the sound marks a completed skip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // While a turn runs, poll the server for the real pipeline stage and tick an
  // elapsed timer so the wait always shows movement, even on the long step.
  useEffect(() => {
    if (!analysisBusy) {
      setProgress(null);
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(
          `/session/progress?token=${encodeURIComponent(tokenRef.current)}`,
        );
        if (res.ok && active) {
          const p = (await res.json()) as Progress;
          if (p?.label) setProgress(p);
        }
      } catch {
        /* keep the last known stage; the timer still moves */
      }
    };
    poll();
    const iv = setInterval(poll, 1200);
    return () => {
      active = false;
      clearInterval(iv);
      clearInterval(tick);
    };
  }, [analysisBusy]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.start();
    recorder.current = mr;
    setRecording(true);
    playSound("recordStart");
  }

  function submitRecording(blob: Blob) {
    const token = crypto.randomUUID();
    tokenRef.current = token;
    setProgress(null);
    setElapsed(0);
    setShowResult(false);
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("audio", blob, "audio.webm");
    fd.append("progressToken", token);
    fetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
  }

  async function stop() {
    const mr = recorder.current;
    if (!mr) return;
    playSound("recordStop");
    await new Promise<void>((res) => {
      mr.onstop = () => res();
      mr.stop();
    });
    mr.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    setRecording(false);
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    lastBlobRef.current = blob;
    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
    submitRecording(blob);
  }

  async function cancelRecording() {
    const mr = recorder.current;
    if (!mr) return;
    playSound("tap");
    await new Promise<void>((res) => {
      mr.onstop = () => res();
      mr.stop();
    });
    mr.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    chunks.current = [];
    setRecording(false);
  }

  // Re-run analysis on the same recording (after a failure) — no re-recording.
  function retry() {
    playSound("tap");
    if (lastBlobRef.current) submitRecording(lastBlobRef.current);
  }

  function markNewQuestionSound() {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(NEW_QUESTION_SOUND_KEY, "1");
  }

  function nextPrompt() {
    playSound("tap");
    const fd = new FormData();
    fd.append("intent", "next");
    nextFetcher.submit(fd, { method: "post" });
  }

  // While recording, tick a timer and auto-stop (which submits) once the max
  // duration is reached, so an answer can't run on forever or get too large.
  useEffect(() => {
    if (!recording) {
      setRecordSec(0);
      return;
    }
    const startedAt = Date.now();
    const iv = setInterval(() => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      setRecordSec(s);
      if (s >= MAX_RECORDING_SEC) {
        clearInterval(iv);
        void stop();
      }
    }, 500);
    return () => clearInterval(iv);
    // `stop` only reads refs/stable values, so the capture from this render is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const remaining = Math.max(0, MAX_RECORDING_SEC - recordSec);
  const wrappingUp = recording && remaining <= COUNTDOWN_FROM;

  return (
    <main className="pk-wrap">
      <Nav right={<span className="pk-pill">{(user.target_lang ?? "es").toUpperCase()}{user.level ? ` · ${user.level}` : ""}</span>} />

      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Today's prompt</span>
        <h1 className="pk-h1">{prompt}</h1>
      </div>

      <div className="pk-newq">
        <Form method="post" onSubmit={markNewQuestionSound}>
          <input type="hidden" name="intent" value="skip" />
          <button type="submit" className="pk-btn pk-btn--ghost pk-newq-btn" disabled={busy}>
            New question ↻
          </button>
        </Form>
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
          {analysisBusy
            ? (progress?.label ?? "Getting started…")
            : nextBusy
              ? "Getting your next question…"
              : recording
              ? (wrappingUp ? `Wrap up — ${remaining}s left` : "Listening… tap to finish")
              : "Tap & talk!"}
          {(analysisBusy || nextBusy) && (
            <span className="pk-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>

        {analysisBusy ? (
          <div className="pk-progress" role="status" aria-live="polite">
            <div className="pk-progress-bar">
              <span
                style={{
                  width: `${progress ? (progress.step / progress.total) * 100 : 5}%`,
                }}
              />
            </div>
            <div className="pk-progress-row">
              <span className="pk-progress-step">
                Step {progress?.step ?? 0} of {progress?.total ?? 4}
              </span>
              <span className="pk-progress-time">{elapsed}s</span>
            </div>
          </div>
        ) : nextBusy ? (
          <div className="pk-cap-sub" role="status" aria-live="polite">
            Loading a fresh prompt…
          </div>
        ) : recording ? (
          <div className="pk-recording-actions">
            <div
              className={"pk-cap-sub pk-rectimer" + (wrappingUp ? " pk-rectimer--warn" : "")}
              role="status"
              aria-live={wrappingUp ? "assertive" : "off"}
            >
              {wrappingUp
                ? `⏱ ${remaining}s — finishing automatically`
                : `${fmtClock(recordSec)} / ${fmtClock(MAX_RECORDING_SEC)}`}
            </div>
            <button
              type="button"
              className="pk-cancel-recording"
              onClick={cancelRecording}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="pk-cap-sub">
            Answer like you'd tell a friend — about three sentences. Make
            mistakes freely; there's no shame or judgement here.
          </div>
        )}

        {error && !busy && (
          <div className="pk-retry">
            <p className="pk-error">{error}</p>
            {recordingUrl && (
              <div className="pk-retry-audio">
                <span className="pk-retry-label">Your recording</span>
                <audio className="pk-audio" controls src={recordingUrl} />
              </div>
            )}
            <button
              type="button"
              className="pk-btn pk-btn--teal pk-retry-btn"
              onClick={retry}
              disabled={busy || !lastBlobRef.current}
            >
              Try analysis again
            </button>
          </div>
        )}
      </div>

      {transcript && (
        <div className="pk-heard">
          <div className="pk-heard-h">you said</div>
          <HighlightedText text={transcript} snippets={issues.map((i) => i.snippet)} />
          {issues.length > 0 && (
            <div className="pk-heard-key">Highlighted = could be improved</div>
          )}
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
              onClick={nextPrompt}
              disabled={busy}
            >
              {nextBusy ? "Next…" : "Next →"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
