/**
 * In-process turn-progress store. The session action publishes pipeline stage
 * events here (keyed by a per-turn token); the client polls `/session/progress`
 * to telegraph what's happening behind the scenes while a turn runs.
 *
 * Single-process / local-only by design — fine for this app.
 */
export interface TurnProgress {
  step: number;
  total: number;
  label: string;
  at: number;
}

export const PROGRESS_TOTAL = 4;

/** Maps a runTurn/action log event name to a user-facing step + label. */
const STAGES: Record<string, { step: number; label: string }> = {
  "turn: received": { step: 0, label: "Getting your recording ready…" },
  "transcribe: start": { step: 1, label: "Transcribing what you said…" },
  "diagnose: start": { step: 2, label: "Analyzing your answer…" },
  "compose lesson: start": { step: 3, label: "Writing your mini-lesson…" },
  "tts: start": { step: 4, label: "Recording the pronunciation…" },
  "turn: done": { step: 4, label: "Done!" },
};

const store = new Map<string, TurnProgress>();

/** Record progress for a token if the event maps to a user-facing stage. */
export function reportProgress(token: string, event: string): void {
  const s = STAGES[event];
  if (!s) return;
  store.set(token, { step: s.step, total: PROGRESS_TOTAL, label: s.label, at: Date.now() });
}

export function getProgress(token: string): TurnProgress | null {
  return store.get(token) ?? null;
}

export function clearProgress(token: string): void {
  store.delete(token);
}
