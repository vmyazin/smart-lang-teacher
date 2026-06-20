# Stable Prompts + History Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the session prompt stable across reloads with a deliberate "New question" (skip) button, and add an iOS-style Edit mode to the history page for deleting lessons.

**Architecture:** The active unanswered prompt lives in a new `users.current_prompt` column; a `turn` row is created only when answered or skipped (`turns.status`). The session loader reads/lazily-generates the current prompt; a skip action records the old prompt as a `skipped` turn and regenerates; the answer action clears `current_prompt` after the pipeline. History gains a status badge, a hard `deleteTurn` (rows + audio files), and a client Edit-mode toggle with inline-confirm delete.

**Tech Stack:** TypeScript, React Router v8 (config routing, loaders/actions, `<Form>`/`useFetcher`), better-sqlite3 (incl. `PRAGMA table_info`, `json_each`), Vitest, the existing Pocket CSS. Package manager: **pnpm**.

## Global Constraints

- Approach B: the active prompt is `users.current_prompt`; turns are created only for answered/skipped attempts. There are NO "pending" turn rows.
- `turns.status` is `'answered' | 'skipped'` (`TurnStatus`); default `'answered'`. `users.current_prompt` is nullable TEXT.
- Migration must be idempotent and safe for existing on-disk DBs: include the columns in the create SQL (fresh DBs) AND add them via `PRAGMA table_info` → `ALTER TABLE … ADD COLUMN …` if absent.
- All DB access goes through `app/lib/repository.ts`; every method that touches a turn is `userId`-scoped via `turns t JOIN sessions s ON t.session_id = s.id WHERE s.user_id = ?`.
- Routes require auth: `getUserId(request)`; unauthenticated → `redirect("/")`.
- Delete is **hard**: remove the `lessons`/`diagnoses`/`turn` rows AND unlink the audio files from `AUDIO_DIR` (`process.env.AUDIO_DIR ?? "data/audio"`), basename-joined + existence-checked. `deleteTurn` returns `null` for a non-owned/missing turn (deletes nothing).
- "New question" button is disabled while a turn is being analyzed (`fetcher.state !== "idle"`).
- Delete uses an inline two-step confirm (no `window.confirm`); search/filter (`q`/`skill`) preserved across a delete.
- Reuse the existing Pocket classes; new styles appended to `app/styles/pocket.css`.
- Verify each task with `pnpm exec vitest run <file>` (focused) + `pnpm test` (full); routes additionally with `pnpm exec react-router typegen && pnpm typecheck` and `pnpm run build`.

## File Structure

```
app/
  lib/db.ts                 # + users.current_prompt, turns.status (create SQL + idempotent ALTER migration)
  domain/types.ts           # + User.current_prompt, TurnStatus, status on TurnSummary/TurnDetail
  lib/repository.ts         # + setCurrentPrompt, createTurn status, deleteTurn; current_prompt in getUser; status in listTurns/getTurnDetail
  routes/session.tsx        # loader reads/stores current_prompt; action branches skip/answer; "New question" button
  routes/history.tsx        # status badge; Edit-mode toggle + per-row inline-confirm delete; delete action
  routes/history.turn.tsx   # "skipped" note on a skipped detail
  styles/pocket.css         # edit-mode / trashcan / inline-confirm / skipped-badge styles
tests/
  lib/db.test.ts            # + migration column tests
  lib/repository.history.test.ts  # + current_prompt, status, deleteTurn tests
```

---

### Task 1: DB migration — `users.current_prompt` and `turns.status`

**Files:**
- Modify: `app/lib/db.ts` (add columns to create SQL + idempotent ALTER migration)
- Modify: `tests/lib/db.test.ts` (append column tests)

**Interfaces:**
- Consumes: existing `openDb`.
- Produces: a schema where `users` has `current_prompt TEXT` and `turns` has `status TEXT NOT NULL DEFAULT 'answered'`, on both fresh and pre-existing DBs.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/db.test.ts` (inside the existing top-level `describe("openDb", …)` or as a new describe — either works; here as new top-level blocks at the end of the file):
```ts
describe("schema migration", () => {
  it("adds current_prompt to users and status to turns", () => {
    const db = openDb(":memory:");
    const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    const turnCols = (db.prepare("PRAGMA table_info(turns)").all() as { name: string }[]).map((c) => c.name);
    expect(userCols).toContain("current_prompt");
    expect(turnCols).toContain("status");
  });

  it("defaults turns.status to 'answered'", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO users (display_name, passcode_hash) VALUES ('a','h')").run();
    db.prepare("INSERT INTO sessions (user_id, started_at) VALUES (1, 't')").run();
    db.prepare("INSERT INTO turns (session_id, prompt_text, created_at) VALUES (1, 'p', 't')").run();
    const row = db.prepare("SELECT status FROM turns WHERE id = 1").get() as { status: string };
    expect(row.status).toBe("answered");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/db.test.ts`
Expected: FAIL — `userCols` lacks `current_prompt` / `turnCols` lacks `status`.

- [ ] **Step 3: Add the columns to the create SQL**

In `app/lib/db.ts`, in the `SCHEMA` string, change the `users` table to include `current_prompt`:
```
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL UNIQUE,
  passcode_hash TEXT NOT NULL,
  native_lang TEXT,
  target_lang TEXT,
  interests TEXT NOT NULL DEFAULT '[]',
  level TEXT,
  current_prompt TEXT
);
```
and the `turns` table to include `status`:
```
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  prompt_text TEXT NOT NULL,
  audio_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'answered'
);
```

- [ ] **Step 4: Add the idempotent migration for existing DBs**

In `app/lib/db.ts`, add a helper above `openDb` and call it after `db.exec(SCHEMA)`:
```ts
function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
```
In `openDb`, after `db.exec(SCHEMA);` and before `return db;`:
```ts
  ensureColumn(db, "users", "current_prompt", "current_prompt TEXT");
  ensureColumn(db, "turns", "status", "status TEXT NOT NULL DEFAULT 'answered'");
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite + commit**

Run: `pnpm test`
Expected: all PASS (existing repository tests still green — the new columns are additive).
```bash
git add app/lib/db.ts tests/lib/db.test.ts
git commit -m "feat: add users.current_prompt and turns.status columns + migration"
```

---

### Task 2: Types + repository reads/writes for current_prompt & status

**Files:**
- Modify: `app/domain/types.ts` (User.current_prompt, TurnStatus, status on summary/detail)
- Modify: `app/lib/repository.ts` (rowToUser, setCurrentPrompt, createTurn status, listTurns/getTurnDetail status)
- Modify: `tests/lib/repository.history.test.ts` (append tests)

**Interfaces:**
- Consumes: Task 1's columns.
- Produces:
  - `User.current_prompt: string | null`; `export type TurnStatus = "answered" | "skipped"`; `TurnSummary.status: TurnStatus`; `TurnDetail.status: TurnStatus`.
  - `setCurrentPrompt(userId: number, prompt: string | null): void`.
  - `createTurn(input: { session_id: number; prompt_text: string; created_at: string; status?: TurnStatus }): number` (status defaults `'answered'`).
  - `getUser` returns `current_prompt`; `listTurns`/`getTurnDetail` return `status`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/repository.history.test.ts`:
```ts
describe("current_prompt + status", () => {
  it("round-trips current_prompt (set, read, clear)", () => {
    const repo = createRepository(openDb(":memory:"));
    const u = repo.createUser({ display_name: "pp", passcode_hash: "h" });
    expect(repo.getUser(u.id)!.current_prompt).toBeNull();
    repo.setCurrentPrompt(u.id, "¿Como vai?");
    expect(repo.getUser(u.id)!.current_prompt).toBe("¿Como vai?");
    repo.setCurrentPrompt(u.id, null);
    expect(repo.getUser(u.id)!.current_prompt).toBeNull();
  });

  it("createTurn stores status (default answered, explicit skipped)", () => {
    const repo = createRepository(openDb(":memory:"));
    const u = repo.createUser({ display_name: "st", passcode_hash: "h" });
    const sid = repo.createSession(u.id, "2026-06-20T00:00:00.000Z");
    const answered = repo.createTurn({ session_id: sid, prompt_text: "a", created_at: "2026-06-20T00:00:00.000Z" });
    const skipped = repo.createTurn({ session_id: sid, prompt_text: "b", created_at: "2026-06-20T00:01:00.000Z", status: "skipped" });
    const list = repo.listTurns(u.id);
    const byId = Object.fromEntries(list.map((t) => [t.id, t.status]));
    expect(byId[answered]).toBe("answered");
    expect(byId[skipped]).toBe("skipped");
    expect(repo.getTurnDetail(skipped, u.id)!.status).toBe("skipped");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: FAIL — `setCurrentPrompt` not a function / `status`/`current_prompt` undefined.

- [ ] **Step 3: Update the domain types**

In `app/domain/types.ts`, add `current_prompt` to `User`:
```ts
export interface User {
  id: number;
  display_name: string;
  native_lang: string | null;
  target_lang: string | null;
  interests: string[];
  level: string | null;
  current_prompt: string | null;
}
```
Add the status type (near `SkillStatus`):
```ts
export type TurnStatus = "answered" | "skipped";
```
Add `status` to both `TurnSummary` and `TurnDetail`:
```ts
export interface TurnSummary {
  id: number;
  created_at: string;
  prompt_text: string;
  transcript: string | null;
  status: TurnStatus;
  issueCount: number;
  dimensions: Dimension[];
}

export interface TurnDetail {
  id: number;
  created_at: string;
  prompt_text: string;
  transcript: string | null;
  audio_path: string | null;
  status: TurnStatus;
  issues: Issue[];
  lesson: Lesson | null;
  voicedPhrases: VoicedPhrase[];
}
```

- [ ] **Step 4: Update the repository**

In `app/lib/repository.ts`:

(a) Add `TurnStatus` to the type import from `../domain/types`.

(b) In `rowToUser`, add the field:
```ts
    current_prompt: row.current_prompt ?? null,
```

(c) Add `setCurrentPrompt` (e.g. after `updateUserProfile`):
```ts
    setCurrentPrompt(userId: number, prompt: string | null): void {
      db.prepare("UPDATE users SET current_prompt = ? WHERE id = ?").run(prompt, userId);
    },
```

(d) Replace `createTurn` with the status-aware version:
```ts
    createTurn(input: {
      session_id: number;
      prompt_text: string;
      created_at: string;
      status?: TurnStatus;
    }): number {
      const info = db
        .prepare(
          "INSERT INTO turns (session_id, prompt_text, created_at, status) VALUES (?, ?, ?, ?)",
        )
        .run(input.session_id, input.prompt_text, input.created_at, input.status ?? "answered");
      return Number(info.lastInsertRowid);
    },
```

(e) In `listTurns`, add `t.status AS status` to the SELECT column list, and `status: r.status` to the returned object:
```ts
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, t.status AS status, d.issues AS issues
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           WHERE ${where.join(" AND ")}
           ORDER BY t.id DESC`,
```
and in the `.map`:
```ts
        return {
          id: r.id,
          created_at: r.created_at,
          prompt_text: r.prompt_text,
          transcript: r.transcript,
          status: r.status,
          issueCount: issues.length,
          dimensions: [...new Set(issues.map((i) => i.dimension))],
        };
```

(f) In `getTurnDetail`, add `t.status AS status` to the SELECT and `status: row.status` to the returned object:
```ts
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, t.audio_path, t.status AS status,
                  d.issues AS issues, l.content AS lesson, l.voiced_phrases AS voiced
           FROM turns t
           JOIN sessions s  ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           LEFT JOIN lessons   l ON l.turn_id = t.id
           WHERE t.id = ? AND s.user_id = ?`,
```
and in the return object add `status: row.status,` (e.g. right after `audio_path`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + full suite + commit**

Run: `pnpm typecheck`
Expected: clean (every place that constructs `User`/`TurnSummary`/`TurnDetail` now supplies the new fields).
Run: `pnpm test`
Expected: all PASS.
```bash
git add app/domain/types.ts app/lib/repository.ts tests/lib/repository.history.test.ts
git commit -m "feat: current_prompt + turn status in types and repository reads/writes"
```

---

### Task 3: Repository `deleteTurn`

**Files:**
- Modify: `app/lib/repository.ts` (add `deleteTurn`)
- Modify: `tests/lib/repository.history.test.ts` (append tests)

**Interfaces:**
- Consumes: the `seedTurn` helper already in the test file; `VoicedPhrase`.
- Produces: `deleteTurn(turnId: number, userId: number): { audioPaths: string[] } | null` — ownership-guarded; collects the turn's recording path + each voiced-phrase audio path, deletes the `lessons`/`diagnoses`/`turn` rows in a transaction, returns the collected paths. Returns `null` (and deletes nothing) for a non-owned or missing turn.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/repository.history.test.ts`:
```ts
describe("deleteTurn", () => {
  it("deletes the turn + its diagnosis/lesson and returns audio paths", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId, turnId } = seedTurn(repo, "alice"); // seeds audio_path + a voiced phrase
    const res = repo.deleteTurn(turnId, userId);
    expect(res).not.toBeNull();
    expect(res!.audioPaths).toContain("data/audio/rec.webm");
    expect(res!.audioPaths).toContain("data/audio/phrase1.webm");
    expect(repo.getTurnDetail(turnId, userId)).toBeNull();
    expect(repo.listTurns(userId)).toHaveLength(0);
  });

  it("returns null and deletes nothing for another user's turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    const b = seedTurn(repo, "bob");
    expect(repo.deleteTurn(a.turnId, b.userId)).toBeNull();
    expect(repo.getTurnDetail(a.turnId, a.userId)).not.toBeNull(); // still there
  });

  it("returns null for a missing turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId } = seedTurn(repo, "alice");
    expect(repo.deleteTurn(99999, userId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: FAIL — `repo.deleteTurn is not a function`.

- [ ] **Step 3: Implement `deleteTurn`**

Add this method inside `createRepository` (e.g. after `getTurnDetail`):
```ts
    deleteTurn(turnId: number, userId: number): { audioPaths: string[] } | null {
      const owned = db
        .prepare(
          `SELECT t.id FROM turns t JOIN sessions s ON t.session_id = s.id
           WHERE t.id = ? AND s.user_id = ?`,
        )
        .get(turnId, userId) as { id: number } | undefined;
      if (!owned) return null;

      const turnRow = db.prepare("SELECT audio_path FROM turns WHERE id = ?").get(turnId) as
        | { audio_path: string | null }
        | undefined;
      const lessonRow = db.prepare("SELECT voiced_phrases FROM lessons WHERE turn_id = ?").get(turnId) as
        | { voiced_phrases: string }
        | undefined;

      const audioPaths: string[] = [];
      if (turnRow?.audio_path) audioPaths.push(turnRow.audio_path);
      if (lessonRow?.voiced_phrases) {
        for (const vp of JSON.parse(lessonRow.voiced_phrases) as VoicedPhrase[]) {
          if (vp.audio_path) audioPaths.push(vp.audio_path);
        }
      }

      const tx = db.transaction(() => {
        db.prepare("DELETE FROM lessons WHERE turn_id = ?").run(turnId);
        db.prepare("DELETE FROM diagnoses WHERE turn_id = ?").run(turnId);
        db.prepare("DELETE FROM turns WHERE id = ?").run(turnId);
      });
      tx();

      return { audioPaths };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `pnpm test`
Expected: all PASS.
```bash
git add app/lib/repository.ts tests/lib/repository.history.test.ts
git commit -m "feat: repository deleteTurn (ownership-guarded, returns audio paths)"
```

---

### Task 4: Session route — stable prompt + skip + New question button

**Files:**
- Modify: `app/routes/session.tsx` (loader, action, component button)
- Modify: `app/styles/pocket.css` (append a small style for the new-question row)

**Interfaces:**
- Consumes: repo `getUser` (now with `current_prompt`), `setCurrentPrompt`, `createSession`, `createTurn` (status), `getSkillItems`; `generatePrompt`, `runTurn`; `createLogger`, `reportProgress`/`clearProgress`.
- Produces: a `/session` where the loader returns a stable `prompt`; the action handles `intent=skip` (record skipped turn + regenerate) and the answer flow (clears `current_prompt` after success); a "New question" button.

- [ ] **Step 1: Replace the loader**

In `app/routes/session.tsx`, replace the entire `export async function loader(...) { … }` with:
```ts
export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const { repo, chat } = getContext();
  const user = repo.getUser(userId);
  if (!user || !user.target_lang) return redirect("/onboarding");
  const profile = repo.getSkillItems(userId);

  let prompt = user.current_prompt;
  if (!prompt) {
    const log = createLogger(`prompt user=${userId}`);
    log("generate prompt: start", { target: user.target_lang, profileItems: profile.length });
    prompt = await generatePrompt({
      interests: user.interests,
      profile,
      targetLang: user.target_lang,
      now: new Date(),
      chat,
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
```

- [ ] **Step 2: Replace the action**

Replace the entire `export async function action(...) { … }` with:
```ts
export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  const ctx = getContext();
  const user = ctx.repo.getUser(userId);
  if (!user) return redirect("/");

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "answer");

  // "New question": record the current prompt as skipped, then regenerate.
  if (intent === "skip") {
    const log = createLogger(`skip user=${userId}`);
    const current = user.current_prompt;
    if (current) {
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
      now: new Date(),
      chat: ctx.chat,
    });
    ctx.repo.setCurrentPrompt(userId, fresh);
    log("new prompt generated", { chars: fresh.length });
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
    ctx.repo.setCurrentPrompt(userId, null);
    return { result };
  } catch (err) {
    log("turn: ERROR", { message: String(err) });
    return {
      error:
        "Something went wrong while analyzing your answer. Please try recording again.",
    };
  } finally {
    if (token) clearProgress(token);
  }
}
```

- [ ] **Step 3: Add the "New question" button in the component**

In the component's returned JSX, immediately AFTER the prompt card block:
```tsx
      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Today's prompt</span>
        <h1 className="pk-h1">{prompt}</h1>
      </div>
```
insert:
```tsx
      <div className="pk-newq">
        <Form method="post">
          <input type="hidden" name="intent" value="skip" />
          <button type="submit" className="pk-btn pk-btn--ghost pk-newq-btn" disabled={busy}>
            New question ↻
          </button>
        </Form>
      </div>
```
Add `Form` to the existing `react-router` import in this file (it currently imports `redirect, useLoaderData, useFetcher` — add `Form`):
```ts
import { Form, redirect, useLoaderData, useFetcher } from "react-router";
```

- [ ] **Step 4: Add the style**

Append to `app/styles/pocket.css`:
```css
/* "new question" (skip) control on the session page */
.pk-newq { display: flex; justify-content: flex-end; margin: 10px 0 4px; }
.pk-newq-btn { font-size: 14px; padding: 8px 16px; }
```

- [ ] **Step 5: Verify**

Run: `pnpm exec react-router typegen && pnpm typecheck`
Expected: clean.
Run: `pnpm test`
Expected: all PASS (no unit tests cover routes; the suite must stay green).
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/routes/session.tsx app/styles/pocket.css
git commit -m "feat: stable session prompt + New question (skip) flow"
```

---

### Task 5: History route — status badge + Edit mode + delete

**Files:**
- Modify: `app/routes/history.tsx` (add `action`; status badge; Edit-mode toggle + inline-confirm delete)
- Modify: `app/styles/pocket.css` (append edit-mode/trash/confirm/skipped-badge styles)

**Interfaces:**
- Consumes: repo `deleteTurn`, `listTurns`/`listSkillFacets`; `getContext`, `getUserId`, `fileBasename`, `Nav`, `TurnSummary`.
- Produces: a `/history` with a status-aware badge, an Edit/Done toggle, per-row inline-confirm delete, and a delete `action` that hard-deletes (rows + audio files) and preserves `q`/`skill`.

- [ ] **Step 1: Add the delete action**

In `app/routes/history.tsx`, update the imports to add `redirect` (already imported) and the node modules + `fileBasename`:
```ts
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileBasename } from "../lib/paths";
```
Add an `action` export (after the existing `loader`):
```ts
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
    if (Number.isInteger(turnId)) {
      const { repo } = getContext();
      const res = repo.deleteTurn(turnId, userId);
      if (res) {
        const audioDir = process.env.AUDIO_DIR ?? "data/audio";
        for (const p of res.audioPaths) {
          const fp = join(audioDir, fileBasename(p));
          if (existsSync(fp)) {
            try {
              unlinkSync(fp);
            } catch {
              /* best-effort: a missing/locked file must not fail the delete */
            }
          }
        }
      }
    }
  }
  return back();
}
```

- [ ] **Step 2: Replace the component with the status badge + Edit mode**

Update the `react-router` import to include `useState` from react and `Form` (Link is already imported):
```ts
import { useState } from "react";
import { Form, Link, redirect, useLoaderData } from "react-router";
```
Replace the entire `export default function History() { … }` with:
```tsx
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
```
(The `dateLabel` helper already exists in this file from the previous feature — leave it in place.)

- [ ] **Step 3: Add styles**

Append to `app/styles/pocket.css`:
```css
/* history edit mode + delete */
.pk-history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pk-edit-btn { font-size: 14px; padding: 8px 16px; }
.pk-history-row--edit { cursor: default; }
.pk-history-row--edit:hover { transform: none; box-shadow: 4px 5px 0 var(--shadow); }
.pk-badge-skip { background: var(--ink-soft); }
.pk-trash {
  margin-left: auto; flex: none; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 12px; cursor: pointer;
  color: #fff; background: var(--berry); border: 2.5px solid var(--shadow);
  box-shadow: 2px 2px 0 var(--shadow); padding: 0;
}
.pk-trash:active { transform: translate(2px, 2px); box-shadow: 0 0 0 var(--shadow); }
.pk-row-confirm { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.pk-row-confirm form { margin: 0; }
.pk-del-yes, .pk-del-no {
  font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 13px;
  border: 2.5px solid var(--shadow); border-radius: 999px; padding: 6px 12px; cursor: pointer;
  box-shadow: 2px 2px 0 var(--shadow);
}
.pk-del-yes { color: #fff; background: var(--berry); }
.pk-del-no { color: var(--ink); background: #fff; }
```

- [ ] **Step 4: Verify**

Run: `pnpm exec react-router typegen && pnpm typecheck`
Expected: clean.
Run: `pnpm test`
Expected: all PASS.
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/routes/history.tsx app/styles/pocket.css
git commit -m "feat: history edit mode with inline-confirm delete + skipped badge"
```

---

### Task 6: History detail — skipped note

**Files:**
- Modify: `app/routes/history.turn.tsx` (show a note when the turn was skipped)

**Interfaces:**
- Consumes: `getTurnDetail` (now returns `status`).
- Produces: the detail page shows a "You skipped this one" note for a `skipped` turn (its transcript/lesson are already absent, so the page otherwise shows just the prompt).

- [ ] **Step 1: Add the skipped note**

In `app/routes/history.turn.tsx`, immediately AFTER the prompt card block:
```tsx
      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">Prompt</span>
        <h1 className="pk-h1">{detail.prompt_text}</h1>
      </div>
```
insert:
```tsx
      {detail.status === "skipped" && (
        <p className="pk-skipped-note">You skipped this one — no answer recorded.</p>
      )}
```

- [ ] **Step 2: Add the style**

Append to `app/styles/pocket.css`:
```css
.pk-skipped-note { color: var(--ink-soft); background: #f1ece3; border: 2.5px dashed var(--ink-soft); border-radius: 16px; padding: 14px 16px; margin: 16px 0; font-weight: 700; }
```

- [ ] **Step 3: Verify**

Run: `pnpm exec react-router typegen && pnpm typecheck`
Expected: clean.
Run: `pnpm test`
Expected: all PASS.
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification (optional, needs the running app + keys)**

With `pnpm dev`: on `/session`, reload — the prompt stays the same; click "New question" — a new prompt appears and the old one shows in `/history` with a "skipped" badge (opening it shows the skipped note). Answer a prompt, then in `/history` tap Edit → trashcan → Delete on an entry and confirm it disappears and its audio files are gone from `data/audio`.

- [ ] **Step 5: Commit**

```bash
git add app/routes/history.turn.tsx app/styles/pocket.css
git commit -m "feat: show skipped note on a skipped lesson detail"
```

---

## Self-Review

**Spec coverage:**
- §3 data model (`users.current_prompt`, `turns.status`, migration) → Task 1; types → Task 2. ✓
- §4 session flow (stable loader prompt; skip records skipped turn + regenerates; answer clears current_prompt; New-question button disabled while busy) → Task 4. ✓
- §5 history (status on summary/detail; skipped badge; hard `deleteTurn` + audio files) → Tasks 2 (status), 3 (deleteTurn), 5 (badge + action unlinks files). ✓
- §6 edit mode (Edit/Done toggle; per-row trashcan; inline two-step confirm; preserves q/skill) → Task 5. ✓
- §7 repository methods (`setCurrentPrompt`, `createTurn` status, `deleteTurn`, status in reads) → Tasks 2, 3. ✓
- §8 error handling (auth redirect; skip with null prompt just regenerates; answer falls back to form prompt; delete of non-owned no-ops; missing audio skipped) → Tasks 4 (skip/answer guards), 5 (delete no-op + best-effort unlink). ✓
- §9 testing (current_prompt round-trip, status, deleteTurn ownership + paths + removal, migration columns) → Tasks 1, 2, 3. ✓
- §10 file structure → matches. ✓

**Placeholder scan:** No "TBD"/"handle errors"/"similar to Task N"; every code step is complete. ✓

**Type consistency:** `TurnStatus` defined in Task 2 and used in `createTurn`/summary/detail and the routes. `current_prompt: string | null` on `User` (Task 2) consumed by the session loader/action (Task 4). `setCurrentPrompt(userId, prompt|null)`, `createTurn({…, status?})`, `deleteTurn(turnId, userId) → {audioPaths}|null` signatures identical across producer (Tasks 2–3) and consumer (Tasks 4–5) tasks. `deleteTurn` return shape `{ audioPaths: string[] }` matches the route's `res.audioPaths` loop. `TurnSummary.status`/`TurnDetail.status` used by the history badge (Task 5) and the detail note (Task 6). ✓
