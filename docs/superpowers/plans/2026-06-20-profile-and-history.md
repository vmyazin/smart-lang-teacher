# Profile Page & Lesson History Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed-in History dashboard (searchable/filterable list → per-answer review with audio replay) and an editable Profile page (settings + skill snapshot) over data the app already stores.

**Architecture:** New `userId`-scoped read methods on the existing `Repository` (`listTurns`, `getTurnDetail`, `listSkillFacets`) plus three React Router v8 routes (`/history`, `/history/:turnId`, `/profile`) and a shared `Nav`. Skill filtering uses SQLite `json_each` over the `diagnoses.issues` JSON; audio replay reuses the existing `/audio/:name` route. Read/presentation only, plus a profile-edit form reusing `updateUserProfile`.

**Tech Stack:** TypeScript, React Router v8 (config routing, loaders/actions), better-sqlite3 (incl. `json_each`/`json_extract`), Vitest, the existing Pocket CSS.

## Global Constraints

- All DB access goes through `app/lib/repository.ts` — no raw SQL in routes/components.
- Every new repository read method is **`userId`-scoped**: a user must never see another user's turns. Ownership is enforced via the `turns t JOIN sessions s ON t.session_id = s.id WHERE s.user_id = ?` join.
- Routes require auth: `getUserId(request)`; unauthenticated → `redirect("/")`.
- Skill filter is implemented with SQLite `json_each`/`json_extract` (no schema change).
- Audio is served only by the existing `/audio/:name` route (basename, traversal-guarded); the client builds `/audio/${fileBasename(path)}`.
- React Router v8 config routing: every route is registered in `app/routes.ts`; resource/page routes get their `./+types/<file>` from typegen (run `npx react-router typegen` if a `+types` import doesn't resolve before `tsc`).
- Model/style: reuse the existing Pocket classes in `app/styles/pocket.css`; match the existing look.
- Domain types live in `app/domain/types.ts`; the `Issue`/`Lesson`/`VoicedPhrase`/`SkillItem`/`User`/`Dimension` types already exist.
- Verify each task with `pnpm exec vitest run <file>` (focused) and `pnpm test` (full) before committing; routes additionally with `pnpm typecheck`.

## File Structure

```
app/
  lib/paths.ts                  # NEW fileBasename (extracted from session.tsx; pure, browser-safe)
  lib/repository.ts             # + listTurns, getTurnDetail, listSkillFacets
  domain/types.ts               # + TurnSummary, TurnDetail
  components/Nav.tsx            # NEW shared header nav
  routes/profile.tsx            # NEW settings form + skill snapshot
  routes/history.tsx            # NEW list + search/filter
  routes/history.turn.tsx       # NEW per-answer detail/review (path history/:turnId)
  routes.ts                     # register the three routes
  routes/session.tsx            # use lib/paths fileBasename (remove local copy)
  styles/pocket.css             # + nav / history / detail / profile styles
tests/
  lib/paths.test.ts             # NEW
  lib/repository.history.test.ts # NEW (listTurns/getTurnDetail/listSkillFacets)
```

---

### Task 1: Extract `fileBasename` into a shared module

**Files:**
- Create: `app/lib/paths.ts`
- Create: `tests/lib/paths.test.ts`
- Modify: `app/routes/session.tsx` (remove the local `fileBasename`, import the shared one)

**Interfaces:**
- Consumes: nothing.
- Produces: `fileBasename(p: string): string` — returns the final path segment, handling both `/` and `\` separators; pure and browser-safe (no `node:path`).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/paths.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fileBasename } from "../../app/lib/paths";

describe("fileBasename", () => {
  it("returns the final segment of a posix path", () => {
    expect(fileBasename("data/audio/abc.webm")).toBe("abc.webm");
  });
  it("handles windows-style separators", () => {
    expect(fileBasename("data\\audio\\xyz.webm")).toBe("xyz.webm");
  });
  it("returns the input when there is no separator", () => {
    expect(fileBasename("plain.webm")).toBe("plain.webm");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/paths.test.ts`
Expected: FAIL — cannot find module `app/lib/paths`.

- [ ] **Step 3: Implement the module**

Create `app/lib/paths.ts`:
```ts
/** Final path segment, handling both "/" and "\" — pure and browser-safe (no node:path). */
export function fileBasename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/paths.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Update `session.tsx` to use the shared helper**

In `app/routes/session.tsx`, delete the local helper (the block starting with the comment `/** Extract just the filename …`):
```ts
/** Extract just the filename from a server-side path (works in browser without node:path). */
function fileBasename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}
```
and add this import alongside the other imports near the top of the file:
```ts
import { fileBasename } from "../lib/paths";
```

- [ ] **Step 6: Verify typecheck + full suite**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/lib/paths.ts tests/lib/paths.test.ts app/routes/session.tsx
git commit -m "refactor: extract fileBasename into shared app/lib/paths"
```

---

### Task 2: Domain types `TurnSummary` and `TurnDetail`

**Files:**
- Modify: `app/domain/types.ts` (append two interfaces)

**Interfaces:**
- Consumes: existing `Dimension`, `Issue`, `Lesson`, `VoicedPhrase`.
- Produces:
  - `TurnSummary { id: number; created_at: string; prompt_text: string; transcript: string | null; issueCount: number; dimensions: Dimension[] }`
  - `TurnDetail { id: number; created_at: string; prompt_text: string; transcript: string | null; audio_path: string | null; issues: Issue[]; lesson: Lesson | null; voicedPhrases: VoicedPhrase[] }`

- [ ] **Step 1: Append the types**

Add to the end of `app/domain/types.ts`:
```ts
export interface TurnSummary {
  id: number;
  created_at: string;
  prompt_text: string;
  transcript: string | null;
  issueCount: number;
  dimensions: Dimension[];
}

export interface TurnDetail {
  id: number;
  created_at: string;
  prompt_text: string;
  transcript: string | null;
  audio_path: string | null;
  issues: Issue[];
  lesson: Lesson | null;
  voicedPhrases: VoicedPhrase[];
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: no errors (types are unused so far — that's fine).

- [ ] **Step 3: Commit**

```bash
git add app/domain/types.ts
git commit -m "feat: add TurnSummary and TurnDetail domain types"
```

---

### Task 3: Repository `getTurnDetail`

**Files:**
- Modify: `app/lib/repository.ts` (add method + import `TurnDetail`)
- Create: `tests/lib/repository.history.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createRepository`, domain types; existing repo methods for seeding (`createUser`, `createSession`, `createTurn`, `updateTurn`, `saveDiagnosis`, `saveLesson`).
- Produces: `getTurnDetail(turnId: number, userId: number): TurnDetail | null` — ownership-guarded; `null` if the turn does not exist or is not the user's.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/repository.history.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import type { Issue } from "../../app/domain/types";

function issue(over: Partial<Issue> = {}): Issue {
  return {
    dimension: "grammar",
    severity: "medium",
    snippet: "I have went",
    natural_version: "I went",
    explanation: "Use simple past.",
    tags: ["past-tense"],
    ...over,
  };
}

/** Seed a user with one completed turn; returns { repo, userId, turnId }. */
function seedTurn(
  repo: ReturnType<typeof createRepository>,
  name: string,
  opts: { prompt?: string; transcript?: string; issues?: Issue[] } = {},
) {
  const user = repo.createUser({ display_name: name, passcode_hash: "h" });
  const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
  const tid = repo.createTurn({
    session_id: sid,
    prompt_text: opts.prompt ?? "How was your weekend?",
    created_at: "2026-06-20T00:00:00.000Z",
  });
  repo.updateTurn(tid, { audio_path: "data/audio/rec.webm", transcript: opts.transcript ?? "fui a la montaña" });
  repo.saveDiagnosis(tid, opts.issues ?? [issue()]);
  repo.saveLesson(
    tid,
    { intro: "Nice!", points: [{ title: "Past tense", body: "Use 'went'.", phrase: "I went home." }] },
    [{ text: "I went home.", audio_path: "data/audio/phrase1.webm" }],
  );
  return { userId: user.id, turnId: tid };
}

describe("getTurnDetail", () => {
  it("returns the full detail for the owner", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId, turnId } = seedTurn(repo, "alice");
    const d = repo.getTurnDetail(turnId, userId);
    expect(d).not.toBeNull();
    expect(d!.prompt_text).toBe("How was your weekend?");
    expect(d!.transcript).toBe("fui a la montaña");
    expect(d!.audio_path).toBe("data/audio/rec.webm");
    expect(d!.issues).toHaveLength(1);
    expect(d!.lesson?.points[0].phrase).toBe("I went home.");
    expect(d!.voicedPhrases[0].audio_path).toBe("data/audio/phrase1.webm");
  });

  it("returns null for another user's turn (ownership guard)", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    const b = seedTurn(repo, "bob");
    expect(repo.getTurnDetail(a.turnId, b.userId)).toBeNull();
  });

  it("returns null for a non-existent turn", () => {
    const repo = createRepository(openDb(":memory:"));
    const { userId } = seedTurn(repo, "alice");
    expect(repo.getTurnDetail(99999, userId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: FAIL — `repo.getTurnDetail is not a function`.

- [ ] **Step 3: Implement `getTurnDetail`**

In `app/lib/repository.ts`, update the type import to include the new types:
```ts
import type {
  Issue,
  Lesson,
  SkillItem,
  TurnDetail,
  TurnSummary,
  User,
  VoicedPhrase,
} from "../domain/types";
```
Then add this method inside the object returned by `createRepository` (e.g. after `getSkillItems`):
```ts
    getTurnDetail(turnId: number, userId: number): TurnDetail | null {
      const row = db
        .prepare(
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, t.audio_path,
                  d.issues AS issues, l.content AS lesson, l.voiced_phrases AS voiced
           FROM turns t
           JOIN sessions s  ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           LEFT JOIN lessons   l ON l.turn_id = t.id
           WHERE t.id = ? AND s.user_id = ?`,
        )
        .get(turnId, userId) as any;
      if (!row) return null;
      return {
        id: row.id,
        created_at: row.created_at,
        prompt_text: row.prompt_text,
        transcript: row.transcript,
        audio_path: row.audio_path,
        issues: row.issues ? JSON.parse(row.issues) : [],
        lesson: row.lesson ? JSON.parse(row.lesson) : null,
        voicedPhrases: row.voiced ? JSON.parse(row.voiced) : [],
      };
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/repository.ts tests/lib/repository.history.test.ts
git commit -m "feat: repository getTurnDetail (ownership-guarded)"
```

---

### Task 4: Repository `listTurns` (search + skill filter)

**Files:**
- Modify: `app/lib/repository.ts` (add method)
- Modify: `tests/lib/repository.history.test.ts` (append a describe block)

**Interfaces:**
- Consumes: the seeding helper from Task 3's test file; `TurnSummary`.
- Produces: `listTurns(userId: number, opts?: { search?: string; skill?: string }): TurnSummary[]` — newest-first; `search` does a `LIKE` over `prompt_text`/`transcript`; `skill` matches a turn whose diagnosis has that `dimension` or a matching `tags[]` entry (via `json_each`). Turns without a diagnosis still appear (`issueCount: 0`, `dimensions: []`).

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/repository.history.test.ts`:
```ts
describe("listTurns", () => {
  it("lists the user's turns newest-first with parsed issue summary", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "cara", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t1 = repo.createTurn({ session_id: sid, prompt_text: "first", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(t1, { transcript: "uno" });
    repo.saveDiagnosis(t1, [issue({ dimension: "grammar", tags: ["past-tense"] })]);
    const t2 = repo.createTurn({ session_id: sid, prompt_text: "second", created_at: "2026-06-20T00:01:00.000Z" });
    repo.updateTurn(t2, { transcript: "dos" });
    repo.saveDiagnosis(t2, [
      issue({ dimension: "idiom", tags: ["slang"] }),
      issue({ dimension: "grammar", tags: ["agreement"] }),
    ]);

    const out = repo.listTurns(user.id);
    expect(out.map((t) => t.id)).toEqual([t2, t1]); // newest first
    expect(out[0].issueCount).toBe(2);
    expect(out[0].dimensions.sort()).toEqual(["grammar", "idiom"]);
  });

  it("includes turns that have no diagnosis (issueCount 0)", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "dan", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t = repo.createTurn({ session_id: sid, prompt_text: "quiet", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(t, { transcript: "" });
    const out = repo.listTurns(user.id);
    expect(out).toHaveLength(1);
    expect(out[0].issueCount).toBe(0);
    expect(out[0].dimensions).toEqual([]);
  });

  it("text search matches prompt or transcript", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "ed", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const a = repo.createTurn({ session_id: sid, prompt_text: "tell me about hiking", created_at: "2026-06-20T00:00:00.000Z" });
    repo.updateTurn(a, { transcript: "fui a la montaña" });
    const b = repo.createTurn({ session_id: sid, prompt_text: "tell me about food", created_at: "2026-06-20T00:01:00.000Z" });
    repo.updateTurn(b, { transcript: "comí pasta" });
    expect(repo.listTurns(user.id, { search: "hiking" }).map((t) => t.id)).toEqual([a]);
    expect(repo.listTurns(user.id, { search: "pasta" }).map((t) => t.id)).toEqual([b]);
  });

  it("skill filter matches by dimension and by tag", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "fay", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const a = repo.createTurn({ session_id: sid, prompt_text: "a", created_at: "2026-06-20T00:00:00.000Z" });
    repo.saveDiagnosis(a, [issue({ dimension: "grammar", tags: ["past-tense"] })]);
    const b = repo.createTurn({ session_id: sid, prompt_text: "b", created_at: "2026-06-20T00:01:00.000Z" });
    repo.saveDiagnosis(b, [issue({ dimension: "idiom", tags: ["slang"] })]);
    expect(repo.listTurns(user.id, { skill: "idiom" }).map((t) => t.id)).toEqual([b]);
    expect(repo.listTurns(user.id, { skill: "past-tense" }).map((t) => t.id)).toEqual([a]);
  });

  it("never returns another user's turns", () => {
    const repo = createRepository(openDb(":memory:"));
    const a = seedTurn(repo, "alice");
    seedTurn(repo, "bob");
    const out = repo.listTurns(a.userId);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(a.turnId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: FAIL — `repo.listTurns is not a function`.

- [ ] **Step 3: Implement `listTurns`**

Add this method inside `createRepository` (after `getTurnDetail`):
```ts
    listTurns(
      userId: number,
      opts: { search?: string; skill?: string } = {},
    ): TurnSummary[] {
      const where: string[] = ["s.user_id = ?"];
      const args: unknown[] = [userId];

      const search = opts.search?.trim();
      if (search) {
        const like = `%${search}%`;
        where.push("(t.prompt_text LIKE ? OR t.transcript LIKE ?)");
        args.push(like, like);
      }

      const skill = opts.skill?.trim();
      if (skill) {
        where.push(`EXISTS (
          SELECT 1 FROM diagnoses d2, json_each(d2.issues) je
          WHERE d2.turn_id = t.id
            AND ( json_extract(je.value, '$.dimension') = ?
                  OR EXISTS (SELECT 1 FROM json_each(json_extract(je.value, '$.tags')) tg
                             WHERE tg.value = ?) )
        )`);
        args.push(skill, skill);
      }

      const rows = db
        .prepare(
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, d.issues AS issues
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           WHERE ${where.join(" AND ")}
           ORDER BY t.id DESC`,
        )
        .all(...args) as any[];

      return rows.map((r) => {
        const issues: Issue[] = r.issues ? JSON.parse(r.issues) : [];
        return {
          id: r.id,
          created_at: r.created_at,
          prompt_text: r.prompt_text,
          transcript: r.transcript,
          issueCount: issues.length,
          dimensions: [...new Set(issues.map((i) => i.dimension))],
        };
      });
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/repository.ts tests/lib/repository.history.test.ts
git commit -m "feat: repository listTurns with text search + json_each skill filter"
```

---

### Task 5: Repository `listSkillFacets`

**Files:**
- Modify: `app/lib/repository.ts` (add method)
- Modify: `tests/lib/repository.history.test.ts` (append a describe block)

**Interfaces:**
- Produces: `listSkillFacets(userId: number): string[]` — sorted, distinct dimensions and tags across the user's diagnoses (for the History filter dropdown). User-scoped.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/repository.history.test.ts`:
```ts
describe("listSkillFacets", () => {
  it("returns sorted distinct dimensions + tags for the user only", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "gus", passcode_hash: "h" });
    const sid = repo.createSession(user.id, "2026-06-20T00:00:00.000Z");
    const t = repo.createTurn({ session_id: sid, prompt_text: "p", created_at: "2026-06-20T00:00:00.000Z" });
    repo.saveDiagnosis(t, [
      issue({ dimension: "grammar", tags: ["past-tense", "agreement"] }),
      issue({ dimension: "idiom", tags: ["slang"] }),
    ]);
    // another user's data must not leak in
    const other = seedTurn(repo, "hank", { issues: [issue({ dimension: "register", tags: ["formality"] })] });
    void other;

    expect(repo.listSkillFacets(user.id)).toEqual([
      "agreement",
      "grammar",
      "idiom",
      "past-tense",
      "slang",
    ]);
  });

  it("returns an empty list when the user has no diagnoses", () => {
    const repo = createRepository(openDb(":memory:"));
    const user = repo.createUser({ display_name: "ivy", passcode_hash: "h" });
    expect(repo.listSkillFacets(user.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: FAIL — `repo.listSkillFacets is not a function`.

- [ ] **Step 3: Implement `listSkillFacets`**

Add this method inside `createRepository` (after `listTurns`):
```ts
    listSkillFacets(userId: number): string[] {
      const rows = db
        .prepare(
          `SELECT d.issues AS issues
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           JOIN diagnoses d ON d.turn_id = t.id
           WHERE s.user_id = ?`,
        )
        .all(userId) as any[];
      const facets = new Set<string>();
      for (const r of rows) {
        for (const i of JSON.parse(r.issues) as Issue[]) {
          facets.add(i.dimension);
          for (const tag of i.tags) facets.add(tag);
        }
      }
      return [...facets].sort();
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/repository.history.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run full suite + commit**

Run: `pnpm test`
Expected: all PASS.
```bash
git add app/lib/repository.ts tests/lib/repository.history.test.ts
git commit -m "feat: repository listSkillFacets for the history filter"
```

---

### Task 6: Shared `Nav` component + styles

**Files:**
- Create: `app/components/Nav.tsx`
- Modify: `app/styles/pocket.css` (append nav styles)

**Interfaces:**
- Consumes: `NavLink` from `react-router`.
- Produces: `default function Nav()` — a header bar with the Parla logo and links **Practice** (`/session`), **History** (`/history`), **Profile** (`/profile`). The active link gets an `is-active` class via `NavLink`.

- [ ] **Step 1: Implement the component**

Create `app/components/Nav.tsx`:
```tsx
import { NavLink } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  "pk-nav-link" + (isActive ? " is-active" : "");

export default function Nav() {
  return (
    <nav className="pk-nav">
      <NavLink to="/session" className="pk-logo" aria-label="Parla home">
        <span className="blob" />
        Parla
      </NavLink>
      <div className="pk-nav-links">
        <NavLink to="/session" className={linkClass}>Practice</NavLink>
        <NavLink to="/history" className={linkClass}>History</NavLink>
        <NavLink to="/profile" className={linkClass}>Profile</NavLink>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `app/styles/pocket.css`:
```css
/* shared header nav */
.pk-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; gap: 12px; flex-wrap: wrap; }
.pk-nav .pk-logo { text-decoration: none; }
.pk-nav-links { display: flex; gap: 8px; }
.pk-nav-link {
  font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 14px;
  text-decoration: none; color: var(--ink); background: #fff;
  border: 2.5px solid var(--shadow); border-radius: 999px; padding: 6px 14px;
  box-shadow: 2px 2px 0 var(--shadow); transition: transform 0.1s, box-shadow 0.1s;
}
.pk-nav-link:hover { transform: translateY(-1px); }
.pk-nav-link.is-active { background: var(--tang); color: #fff; }
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/Nav.tsx app/styles/pocket.css
git commit -m "feat: shared Pocket header nav component"
```

---

### Task 7: `/profile` route — editable settings + skill snapshot

**Files:**
- Create: `app/routes/profile.tsx`
- Modify: `app/routes.ts` (register `profile`)
- Modify: `app/styles/pocket.css` (append skill-snapshot styles)

**Interfaces:**
- Consumes: `getContext`, `getUserId`, `Nav`, existing repo methods `getUser`/`getSkillItems`/`updateUserProfile`, `SkillItem`/`SkillStatus` types.
- Produces: the `/profile` page (loader returns `{ user, skills }`; action updates the profile and redirects to `/profile`).

- [ ] **Step 1: Register the route**

In `app/routes.ts`, add inside the array (after the `session/progress` line):
```ts
  route("profile", "routes/profile.tsx"),
```

- [ ] **Step 2: Implement the route**

Create `app/routes/profile.tsx`:
```tsx
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
```

- [ ] **Step 3: Add styles**

Append to `app/styles/pocket.css`:
```css
/* section heading + empty + skill snapshot */
.pk-section-h { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 20px; margin: 30px 0 12px; }
.pk-empty { color: var(--ink-soft); background: #fdf0df; border: 2.5px dashed var(--tang); border-radius: 16px; padding: 16px; }
.pk-skill-group { margin-bottom: 18px; }
.pk-skill-group-h { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 15px; color: var(--ink-soft); margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.pk-skill-count { color: var(--berry); }
.pk-skill-items { display: flex; flex-direction: column; gap: 8px; }
.pk-skill-item { display: flex; align-items: center; gap: 10px; background: #fff; border: 2.5px solid var(--shadow); border-radius: 14px; box-shadow: 3px 3px 0 var(--shadow); padding: 10px 14px; }
.pk-skill-cat { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: var(--sky); border: 2px solid var(--shadow); border-radius: 999px; padding: 2px 8px; }
.pk-skill-label { font-weight: 700; }
.pk-skill-meta { margin-left: auto; color: var(--ink-soft); font-weight: 700; }
.pk-skill-due { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 11px; color: #fff; background: var(--berry); border: 2px solid var(--shadow); border-radius: 999px; padding: 2px 8px; }
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm typecheck`
Expected: clean (regenerates `+types/profile`).
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/routes/profile.tsx app/routes.ts app/styles/pocket.css
git commit -m "feat: /profile route with editable settings + skill snapshot"
```

---

### Task 8: `/history` route — list + search/filter

**Files:**
- Create: `app/routes/history.tsx`
- Modify: `app/routes.ts` (register `history`)
- Modify: `app/styles/pocket.css` (append list/search styles)

**Interfaces:**
- Consumes: `getContext`, `getUserId`, `Nav`, repo `listTurns`/`listSkillFacets`, `TurnSummary` type.
- Produces: the `/history` page. Loader reads `?q=` and `?skill=` from the URL, returns `{ turns, facets, q, skill }`. A GET `<Form>` sets those params (no client JS).

- [ ] **Step 1: Register the route**

In `app/routes.ts`, add (after the `profile` line):
```ts
  route("history", "routes/history.tsx"),
```

- [ ] **Step 2: Implement the route**

Create `app/routes/history.tsx`:
```tsx
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
```

- [ ] **Step 3: Add styles**

Append to `app/styles/pocket.css`:
```css
/* history search + list */
.pk-search { display: flex; gap: 10px; margin: 14px 0 20px; flex-wrap: wrap; }
.pk-search .pk-input { flex: 1; min-width: 160px; }
.pk-history { display: flex; flex-direction: column; gap: 12px; }
.pk-history-row {
  display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink);
  background: #fff; border: 3px solid var(--shadow); border-radius: 18px;
  box-shadow: 4px 5px 0 var(--shadow); padding: 14px 16px;
  transition: transform 0.15s, box-shadow 0.15s;
}
.pk-history-row:hover { transform: translateY(-2px); box-shadow: 6px 7px 0 var(--shadow); }
.pk-history-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pk-history-date { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 12px; color: var(--ink-soft); }
.pk-history-prompt { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-history-badge { margin-left: auto; flex: none; font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 12px; color: #fff; background: var(--teal); border: 2.5px solid var(--shadow); border-radius: 999px; padding: 4px 10px; box-shadow: 2px 2px 0 var(--shadow); }
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm typecheck`
Expected: clean.
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/routes/history.tsx app/routes.ts app/styles/pocket.css
git commit -m "feat: /history route with search + skill filter list"
```

---

### Task 9: `/history/:turnId` route — per-answer review

**Files:**
- Create: `app/routes/history.turn.tsx`
- Modify: `app/routes.ts` (register `history/:turnId`)
- Modify: `app/styles/pocket.css` (append detail styles)

**Interfaces:**
- Consumes: `getContext`, `getUserId`, `Nav`, `fileBasename` (Task 1), repo `getTurnDetail`, `Issue`/`TurnDetail` types.
- Produces: the `/history/:turnId` review page. Loader returns `{ detail }`; a missing/not-owned turn redirects to `/history`.

- [ ] **Step 1: Register the route**

In `app/routes.ts`, add (after the `history` line):
```ts
  route("history/:turnId", "routes/history.turn.tsx"),
```

- [ ] **Step 2: Implement the route**

Create `app/routes/history.turn.tsx`:
```tsx
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/history.turn";
import Nav from "../components/Nav";
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

      {detail.transcript && (
        <div className="pk-heard">
          <div className="pk-heard-h">you said</div>
          {detail.transcript}
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
                <b>{iss.dimension}</b>: “{iss.snippet}” → “{iss.natural_version}” — {iss.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Add styles**

Append to `app/styles/pocket.css`:
```css
/* history detail */
.pk-back { display: inline-block; font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 14px; color: var(--ink); text-decoration: none; margin-bottom: 14px; }
.pk-back:hover { color: var(--tang); }
.pk-audio { display: block; width: 100%; margin-top: 10px; height: 36px; }
.pk-phrase-line { display: flex; flex-direction: column; gap: 6px; }
.pk-phrase-text { font-family: "Bricolage Grotesque", sans-serif; font-weight: 700; font-size: 16px; background: var(--sun); border: 2.5px solid var(--shadow); border-radius: 14px; box-shadow: 3px 3px 0 var(--shadow); padding: 9px 13px; }
.pk-diag { margin-top: 22px; background: #fff; border: 2.5px solid var(--shadow); border-radius: 16px; box-shadow: 3px 3px 0 var(--shadow); padding: 12px 16px; }
.pk-diag summary { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; cursor: pointer; }
.pk-diag ul { margin: 10px 0 0; padding-left: 18px; }
.pk-diag li { margin-bottom: 8px; font-size: 14px; line-height: 1.5; }
```

- [ ] **Step 4: Verify typecheck, full suite, build**

Run: `pnpm typecheck`
Expected: clean (regenerates `+types/history.turn`).
Run: `pnpm test`
Expected: all PASS.
Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verification (optional, needs the running app)**

With `pnpm dev` running and a profile that has at least one recorded answer: visit `/history`, search and filter, open a lesson, play your recording and a native phrase, expand "What we noticed", then visit `/profile`, edit a setting and save, and confirm the skill snapshot renders.
Expected: all work; no other user's data is visible.

- [ ] **Step 6: Commit**

```bash
git add app/routes/history.turn.tsx app/routes.ts app/styles/pocket.css
git commit -m "feat: /history/:turnId per-answer review with audio replay"
```

---

## Self-Review

**Spec coverage:**
- §3 routes (`/history`, `/history/:turnId`, `/profile`, auth redirect) → Tasks 7, 8, 9. ✓
- §4 repository methods (`listTurns`, `getTurnDetail`, `listSkillFacets`) + `TurnSummary`/`TurnDetail` → Tasks 2, 3, 4, 5. ✓
- §5 skill filter via `json_each`/`json_extract` → Task 4 (dimension + tag, tested). ✓
- §6 audio reuse + extract `fileBasename` to `app/lib/paths.ts` → Tasks 1, 9. ✓
- §7 profile edit (reuse `updateUserProfile`) + skill snapshot grouped by status with due badge → Task 7. ✓
- §8 shared nav → Task 6 (used in Tasks 7–9). ✓
- §9 error handling (auth redirect, not-found→/history, empty states, missing audio hides player) → Tasks 7 (empty), 8 (empty/no-results), 9 (redirect + conditional audio). ✓
- §10 testing (two-user scoping, search, dimension+tag filter, ownership guard, facets, fileBasename) → Tasks 1, 3, 4, 5. ✓
- §11 styling in pocket.css → Tasks 6–9. ✓
- §12 file structure → matches (note: detail route file is `history.turn.tsx` registered at path `history/:turnId`, a cosmetic rename from the spec's `history.$turnId.tsx` to avoid a `$` in the filename; behavior identical). ✓

**Placeholder scan:** No "TBD"/"handle errors"/"similar to Task N" — every code step is complete. ✓

**Type consistency:** `TurnSummary`/`TurnDetail` defined in Task 2 and consumed unchanged in Tasks 3, 4, 8, 9. `listTurns(userId, {search, skill})`, `getTurnDetail(turnId, userId)`, `listSkillFacets(userId)` signatures identical across producer (Tasks 3–5) and consumer (Tasks 7–9) tasks. `fileBasename` defined Task 1, used Task 9. `Nav` default export created Task 6, imported Tasks 7–9. Pocket class names introduced in styles match those used in the JSX of the same task. ✓
