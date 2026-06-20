# Stable Prompts + History Management — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, pending implementation plan
**Builds on:** the existing Smart Language Teacher app (React Router v8, SQLite via `better-sqlite3`, Pocket UI, profile/history dashboard).

## 1. Purpose

Three connected changes:
1. **Stable current prompt** — the session prompt no longer regenerates on every reload. The latest *unanswered* prompt persists; reloading lands on the same one.
2. **Deliberate "New question"** — a button regenerates the prompt on demand. The previous prompt is marked **skipped** and retained in history.
3. **History management** — an iOS-style **Edit mode** on the history page reveals a per-row trashcan to **delete** lessons (with a confirm step). Hard delete, including audio files.

## 2. Approach (chosen: B)

The active unanswered prompt lives as a `users.current_prompt` field, NOT as a row. A `turn` row is created **only when a prompt is answered or skipped** — so every turn is a genuine history entry and there are no "pending" rows to filter.

## 3. Data model

- **`users.current_prompt TEXT`** (nullable) — the active unanswered prompt.
- **`turns.status TEXT NOT NULL DEFAULT 'answered'`** — `'answered' | 'skipped'`.
- **Migration** (in `openDb`): the table-creation SQL includes the new columns for fresh DBs; for existing DBs, an idempotent step adds each column if absent (`PRAGMA table_info` → `ALTER TABLE … ADD COLUMN …`). Existing turns default to `'answered'` (they were all answered), existing users to `current_prompt = NULL`.
- Domain types: `User` gains `current_prompt: string | null`; new `TurnStatus = "answered" | "skipped"`; `TurnSummary` and `TurnDetail` gain `status: TurnStatus`.

## 4. Session flow

- **Loader** (`/session`): read `user.current_prompt`. If null, call `generatePrompt(...)` once and `setCurrentPrompt(userId, prompt)`. Return the (now stable) prompt + `user` + `tracking`. Reloads read it back — no regeneration. *(The only GET-side write is a single nullable-string update, idempotent on reload.)*
- **Answer** (existing `useFetcher` multipart submit): the action takes the prompt from server state (`user.current_prompt`), creates an **answered** turn, runs the existing pipeline (`runTurn`) on it, then `setCurrentPrompt(userId, null)` so the next visit generates a fresh prompt. (The answered lesson lives in history; a reload after answering yields a new prompt.)
- **"New question"** button: a `<Form method="post">` posting `intent=skip` (no audio). The action: if `current_prompt` is set, create a **skipped** turn from it; then `generatePrompt(...)`, `setCurrentPrompt(userId, newPrompt)`; `redirect("/session")` → the loader shows the new prompt. The button is **disabled while a turn is being analyzed** (`fetcher.state !== "idle"`).
- The `/session` action branches on the form's `intent` field: `"skip"` → skip flow; otherwise → answer flow (must contain the audio `File`).

## 5. History changes

- **`listTurns` / `TurnSummary`**: add `status`. A row renders a **"skipped"** badge for skipped turns (instead of the "N tips" badge), and answered rows keep "N tips". Newest-first as today.
- **`getTurnDetail` / `TurnDetail`**: add `status`. The detail page already conditionally renders transcript/lesson, so a skipped turn shows just the prompt plus a small **"You skipped this one"** note.
- **Delete**: `deleteTurn(turnId, userId): { audioPaths: string[] } | null` — ownership-guarded. In a transaction: collect audio paths (`turns.audio_path` + each `lessons.voiced_phrases[].audio_path`), delete the `lessons`, `diagnoses`, and `turn` rows, and return the collected paths. Returns `null` (deletes nothing) if the turn isn't the user's or doesn't exist. The `/history` delete action then unlinks each returned file from `AUDIO_DIR` (basename-joined, existence-checked) — **hard delete + audio files**.

## 6. History edit mode (iOS-style)

- A client-side **Edit / Done** toggle button on `/history`. Default: off (rows are plain links).
- In edit mode, each row reveals a **trashcan** on the right and becomes non-navigating. Tapping the trashcan does an **inline two-step confirm**: that row swaps to **"Delete"** (red) / **"Cancel"** controls — no `window.confirm`, no accidental deletes.
- Confirming submits a `<Form method="post">` (hidden `turnId`) to the `/history` action (`intent=delete`); on success the action redirects back to `/history` and the list reflects the removal. (Search/filter params are preserved by including the current `q`/`skill` as hidden fields and redirecting with them.)

## 7. Repository — new/changed methods

All `userId`-scoped where they touch user data.

- `setCurrentPrompt(userId: number, prompt: string | null): void`
- `getUser(id)` — now also returns `current_prompt` (via `rowToUser`).
- `createTurn(input: { session_id; prompt_text; created_at; status?: TurnStatus })` — `status` defaults to `'answered'`. (Existing answer flow unaffected; skip flow passes `'skipped'`.)
- `deleteTurn(turnId: number, userId: number): { audioPaths: string[] } | null` — as in §5.
- `listTurns` / `getTurnDetail` — select and return `status`.

## 8. Error handling

- Unauthenticated on any action → `redirect("/")`.
- Skip when `current_prompt` is null → just generate + store a new one (no skipped turn created).
- Answer when `current_prompt` is null (edge: double submit) → fall back to the form's prompt text if present; otherwise return a friendly error (existing error path).
- Delete of a non-owned/missing turn → `deleteTurn` returns `null`; the action no-ops and redirects back (no error surfaced; nothing to delete).
- Missing audio file on delete → skip it (existence-checked); never error.

## 9. Testing

Repository (in-memory DB), the load-bearing logic:
- `setCurrentPrompt` + `getUser().current_prompt` round-trip (set, read, clear to null).
- `createTurn` with `status: 'skipped'` persists the status; default is `'answered'`.
- `listTurns` returns `status` per row; `getTurnDetail` returns `status`.
- `deleteTurn`: removes the turn + its diagnosis + lesson rows and returns the audio paths; a **non-owner** gets `null` and the rows remain (two-user test); a missing id returns `null`.
- Migration: documented; fresh `:memory:` DBs get the columns from the create SQL (covered implicitly by the above tests running against a fresh schema).

Route loaders/actions kept thin; the edit-mode toggle and inline confirm are client UI (manual verification). UI styling in `pocket.css`.

## 10. File structure

```
app/
  lib/db.ts                 # + users.current_prompt, turns.status (create SQL + idempotent ALTER migration)
  domain/types.ts           # + User.current_prompt, TurnStatus, status on TurnSummary/TurnDetail
  lib/repository.ts         # + setCurrentPrompt, createTurn status, deleteTurn; status in getUser/listTurns/getTurnDetail
  routes/session.tsx        # loader reads/stores current_prompt; action branches skip/answer; "New question" button
  routes/history.tsx        # status badge; Edit-mode toggle + per-row inline-confirm delete; delete action
  routes/history.turn.tsx   # "skipped" note on skipped detail
  styles/pocket.css         # edit-mode / trashcan / inline-confirm / skipped-badge styles
tests/lib/repository.history.test.ts  # + setCurrentPrompt, status, deleteTurn tests
```
