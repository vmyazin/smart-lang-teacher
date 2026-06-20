import { useRef, useState } from "react";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/session";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";
import { generatePrompt } from "../modules/prompt-generator";
import { runTurn } from "../modules/run-turn";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const { repo, chat } = getContext();
  const user = repo.getUser(userId);
  if (!user || !user.target_lang) return redirect("/onboarding");
  const prompt = await generatePrompt({
    interests: user.interests,
    profile: repo.getSkillItems(userId),
    targetLang: user.target_lang,
    now: new Date(),
    chat,
  });
  return { prompt, user };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const ctx = getContext();
  const user = ctx.repo.getUser(userId);
  if (!user) return redirect("/");

  const form = await request.formData();
  const promptText = String(form.get("prompt") ?? "");
  const blob = form.get("audio");
  if (!(blob instanceof File)) return { error: "No audio received." };
  const audio = Buffer.from(await blob.arrayBuffer());

  const now = new Date();
  const sessionId = ctx.repo.createSession(userId, now.toISOString());
  const turnId = ctx.repo.createTurn({
    session_id: sessionId,
    prompt_text: promptText,
    created_at: now.toISOString(),
  });

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
    now,
    saveAudio: ctx.saveAudio,
  });
  return { result };
}

export default function Session() {
  const { prompt } = useLoaderData<typeof loader>();
  const [lesson, setLesson] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

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
    setBusy(true);
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("audio", blob, "audio.webm");
    const res = await fetch("/session", { method: "post", body: fd });
    const data = await res.json();
    setLesson(data.result?.lesson ?? null);
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui" }}>
      <h2>{prompt}</h2>
      {!recording ? (
        <button onClick={start} disabled={busy}>
          {busy ? "Thinking…" : "Record answer"}
        </button>
      ) : (
        <button onClick={stop}>Stop & submit</button>
      )}
      {lesson && (
        <section style={{ marginTop: "2rem" }}>
          <p>{lesson.intro}</p>
          {lesson.points.map((p: any, i: number) => (
            <article key={i}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <em>{p.phrase}</em>
            </article>
          ))}
          <button onClick={() => location.reload()}>Next prompt</button>
        </section>
      )}
    </main>
  );
}
