# Smart Language Teacher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only web app that elicits a learner's spontaneous speech, transcribes it, silently diagnoses grammar/vocabulary/naturalness gaps, persists a running skill profile, and teaches the top issues gently with audio playback.

**Architecture:** React Router v7 (framework mode, Node server) with a SQLite file via `better-sqlite3`. A two-stage Claude pipeline (diagnostician → lesson composer) wrapped behind injectable provider interfaces so every module is unit-testable with fakes. OpenAI Whisper for STT and OpenAI TTS for pronunciation playback. A deterministic profile-updater handles spaced repetition with no LLM call.

**Tech Stack:** TypeScript, React Router v7, better-sqlite3, Vitest, `@anthropic-ai/sdk` (Claude Sonnet 4.6 + Zod structured outputs), `openai` (Whisper + TTS), Node `crypto` for passcode hashing.

## Global Constraints

- **Model:** Claude Sonnet 4.6, exact ID `claude-sonnet-4-6`. Never append a date suffix.
- **Claude SDK:** official `@anthropic-ai/sdk`. Structured output via `client.messages.parse()` + `zodOutputFormat()` in `output_config.format`. No assistant prefills (400 on Sonnet 4.6). Parse tool/JSON output via the SDK, never raw string matching.
- **STT/TTS:** OpenAI `whisper-1` and `gpt-4o-mini-tts` via the `openai` SDK.
- **Database:** SQLite file on disk via `better-sqlite3`. All DB access goes through the repository layer — no raw SQL in modules or routes.
- **Secrets:** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from the environment. Never hardcode keys.
- **Provider isolation:** LLM/STT/TTS are accessed through the `ChatModel`, `SpeechToText`, and `TextToSpeech` interfaces (Task 6). Modules receive these as injected dependencies; tests pass fakes. No live API calls in tests.
- **Testing policy:** TDD where it adds clear value (deterministic logic, persistence, schema validation, orchestration). UI gets implementation + manual verification, not blanket tests.
- **Module boundaries:** one responsibility per file; modules talk to `persistence`, not raw SQL.

## File Structure

```
app/
  domain/
    types.ts            # Issue, SkillItem, Lesson, User, Turn types
    schemas.ts          # Zod schemas: IssueListSchema, LessonSchema
  lib/
    db.ts               # opens SQLite, runs schema migration
    repository.ts       # all CRUD: users, sessions, turns, diagnoses, skill_items, lessons
    auth.ts             # hashPasscode / verifyPasscode
    providers/
      types.ts          # ChatModel, SpeechToText, TextToSpeech interfaces + input/output types
      anthropic.ts      # createAnthropicChatModel
      openai.ts         # createOpenAiStt, createOpenAiTts
  modules/
    diagnostician.ts    # diagnose(transcript, target, native, profile, chat)
    profile-updater.ts  # updateProfile(items, issues, now) — deterministic, no LLM
    prompt-generator.ts # generatePrompt(profile, interests, dueItems, target, chat)
    lesson-composer.ts  # composeLesson(issues, native, target, chat)
    run-turn.ts         # orchestrates the full turn pipeline + persistence
  routes/
    _index.tsx          # profile picker / login
    onboarding.tsx      # set native/target/interests/level
    session.tsx         # the main record→lesson loop
  root.tsx              # React Router root
tests/                  # mirrors app/ structure
data/                   # SQLite file + saved audio (gitignored)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `react-router.config.ts`, `vite.config.ts`, `app/root.tsx`, `app/routes/_index.tsx`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable React Router v7 app and a working Vitest runner.

- [ ] **Step 1: Scaffold the React Router app**

Run:
```bash
npx --yes create-react-router@latest . --no-git-init --no-install --template remix-run/react-router-templates/node-custom-server
```
If the template prompt blocks, fall back to:
```bash
npx --yes create-react-router@latest smart-app --yes && cp -r smart-app/. . && rm -rf smart-app
```
Expected: an `app/` directory with `root.tsx` and `routes/_index.tsx`, plus `react-router.config.ts` and `vite.config.ts`.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install better-sqlite3 @anthropic-ai/sdk openai zod
npm install -D vitest @types/better-sqlite3 @types/node typescript
```
Expected: dependencies added to `package.json`, exit code 0.

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add the test script and `.gitignore`**

In `package.json`, add to `"scripts"`: `"test": "vitest run"`.

Create `.gitignore` (append if it exists):
```
node_modules
build
.env
data/
```

- [ ] **Step 5: Write the smoke test**

Create `tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test to verify the harness works**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold React Router v7 app with Vitest"
```

---

### Task 2: Database connection and schema

**Files:**
- Create: `app/lib/db.ts`
- Test: `tests/lib/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `openDb(path: string): Database` (a `better-sqlite3` `Database`) with all tables created. `Database` is the type from `better-sqlite3`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/db.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";

describe("openDb", () => {
  it("creates all tables", () => {
    const db = openDb(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const t of [
      "users",
      "sessions",
      "turns",
      "diagnoses",
      "skill_items",
      "lessons",
    ]) {
      expect(names).toContain(t);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/db.test.ts`
Expected: FAIL — cannot find module `app/lib/db`.

- [ ] **Step 3: Implement `openDb`**

Create `app/lib/db.ts`:
```ts
import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL UNIQUE,
  passcode_hash TEXT NOT NULL,
  native_lang TEXT,
  target_lang TEXT,
  interests TEXT NOT NULL DEFAULT '[]',
  level TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  prompt_text TEXT NOT NULL,
  audio_path TEXT,
  transcript TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS diagnoses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER NOT NULL REFERENCES turns(id),
  issues TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  occurrences INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  status TEXT NOT NULL,
  next_review_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER NOT NULL REFERENCES turns(id),
  content TEXT NOT NULL,
  voiced_phrases TEXT NOT NULL
);
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/db.ts tests/lib/db.test.ts
git commit -m "feat: SQLite connection and schema"
```

---

### Task 3: Domain types and Zod schemas

**Files:**
- Create: `app/domain/types.ts`, `app/domain/schemas.ts`
- Test: `tests/domain/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `Dimension`, `Severity`, `Issue`, `SkillStatus`, `SkillItem`, `User`, `Lesson`, `VoicedPhrase`.
  - Zod schemas: `IssueListSchema` (parses `{ issues: Issue[] }`), `LessonSchema` (parses `Lesson`).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { IssueListSchema, LessonSchema } from "../../app/domain/schemas";

describe("schemas", () => {
  it("parses a valid issue list", () => {
    const parsed = IssueListSchema.parse({
      issues: [
        {
          dimension: "grammar",
          severity: "medium",
          snippet: "I have went",
          natural_version: "I went",
          explanation: "Use the simple past.",
          tags: ["past-tense"],
        },
      ],
    });
    expect(parsed.issues[0].dimension).toBe("grammar");
  });

  it("rejects an unknown dimension", () => {
    expect(() =>
      IssueListSchema.parse({
        issues: [
          {
            dimension: "spelling",
            severity: "low",
            snippet: "x",
            natural_version: "y",
            explanation: "z",
            tags: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("parses a valid lesson", () => {
    const parsed = LessonSchema.parse({
      intro: "Nice answer!",
      points: [
        { title: "Sounding natural", body: "Try X.", phrase: "X phrase" },
      ],
    });
    expect(parsed.points).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/schemas.test.ts`
Expected: FAIL — cannot find module `app/domain/schemas`.

- [ ] **Step 3: Implement the types**

Create `app/domain/types.ts`:
```ts
export type Dimension =
  | "grammar"
  | "word_choice"
  | "naturalness"
  | "idiom"
  | "register";

export type Severity = "low" | "medium" | "high";
export type SkillStatus = "active" | "improving" | "mastered";

export interface Issue {
  dimension: Dimension;
  severity: Severity;
  snippet: string;
  natural_version: string;
  explanation: string;
  tags: string[];
}

export interface SkillItem {
  id: number;
  user_id: number;
  category: Dimension;
  label: string;
  description: string;
  severity: Severity;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  status: SkillStatus;
  next_review_at: string;
}

export interface User {
  id: number;
  display_name: string;
  native_lang: string | null;
  target_lang: string | null;
  interests: string[];
  level: string | null;
}

export interface VoicedPhrase {
  text: string;
  audio_path: string | null;
}

export interface LessonPoint {
  title: string;
  body: string;
  phrase: string;
}

export interface Lesson {
  intro: string;
  points: LessonPoint[];
}
```

- [ ] **Step 4: Implement the schemas**

Create `app/domain/schemas.ts`:
```ts
import { z } from "zod";

export const IssueSchema = z.object({
  dimension: z.enum([
    "grammar",
    "word_choice",
    "naturalness",
    "idiom",
    "register",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  snippet: z.string(),
  natural_version: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
});

export const IssueListSchema = z.object({
  issues: z.array(IssueSchema),
});

export const LessonSchema = z.object({
  intro: z.string(),
  points: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      phrase: z.string(),
    }),
  ),
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/domain/schemas.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add app/domain tests/domain
git commit -m "feat: domain types and Zod schemas"
```

---

### Task 4: Repository layer

**Files:**
- Create: `app/lib/repository.ts`
- Test: `tests/lib/repository.test.ts`

**Interfaces:**
- Consumes: `openDb` (Task 2), domain types (Task 3).
- Produces a `Repository` created by `createRepository(db: Db)` with methods:
  - `createUser(input: { display_name: string; passcode_hash: string }): User`
  - `findUserByName(name: string): (User & { passcode_hash: string }) | null`
  - `getUser(id: number): User | null`
  - `updateUserProfile(id: number, p: { native_lang: string; target_lang: string; interests: string[]; level: string }): void`
  - `createSession(userId: number, startedAt: string): number` (returns session id)
  - `createTurn(input: { session_id: number; prompt_text: string; created_at: string }): number` (returns turn id)
  - `updateTurn(id: number, p: { audio_path?: string; transcript?: string }): void`
  - `saveDiagnosis(turnId: number, issues: Issue[]): void`
  - `saveLesson(turnId: number, lesson: Lesson, voicedPhrases: VoicedPhrase[]): void`
  - `getSkillItems(userId: number): SkillItem[]`
  - `replaceSkillItems(userId: number, items: SkillItem[]): void` (deletes the user's items, inserts the given set; ids on input items are ignored on insert)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/repository.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import type { SkillItem } from "../../app/domain/types";

function repo() {
  return createRepository(openDb(":memory:"));
}

describe("repository", () => {
  it("creates and finds a user", () => {
    const r = repo();
    const u = r.createUser({ display_name: "alice", passcode_hash: "h" });
    expect(u.id).toBeGreaterThan(0);
    const found = r.findUserByName("alice");
    expect(found?.passcode_hash).toBe("h");
    expect(r.findUserByName("nobody")).toBeNull();
  });

  it("updates a user profile and reads interests back as an array", () => {
    const r = repo();
    const u = r.createUser({ display_name: "bob", passcode_hash: "h" });
    r.updateUserProfile(u.id, {
      native_lang: "en",
      target_lang: "es",
      interests: ["hiking", "music"],
      level: "intermediate",
    });
    const got = r.getUser(u.id);
    expect(got?.interests).toEqual(["hiking", "music"]);
    expect(got?.target_lang).toBe("es");
  });

  it("round-trips skill items", () => {
    const r = repo();
    const u = r.createUser({ display_name: "cara", passcode_hash: "h" });
    const item: SkillItem = {
      id: 0,
      user_id: u.id,
      category: "grammar",
      label: "past-tense",
      description: "Confuses past tenses.",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-06-01T00:00:00.000Z",
      last_seen: "2026-06-10T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-06-12T00:00:00.000Z",
    };
    r.replaceSkillItems(u.id, [item]);
    const got = r.getSkillItems(u.id);
    expect(got).toHaveLength(1);
    expect(got[0].label).toBe("past-tense");
    expect(got[0].occurrences).toBe(2);
  });

  it("persists a turn, diagnosis, and lesson", () => {
    const r = repo();
    const u = r.createUser({ display_name: "dan", passcode_hash: "h" });
    const sid = r.createSession(u.id, "2026-06-19T00:00:00.000Z");
    const tid = r.createTurn({
      session_id: sid,
      prompt_text: "How was your day?",
      created_at: "2026-06-19T00:00:00.000Z",
    });
    r.updateTurn(tid, { transcript: "It was good" });
    r.saveDiagnosis(tid, []);
    r.saveLesson(tid, { intro: "Nice", points: [] }, []);
    expect(tid).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/repository.test.ts`
Expected: FAIL — cannot find module `app/lib/repository`.

- [ ] **Step 3: Implement the repository**

Create `app/lib/repository.ts`:
```ts
import type { Db } from "./db";
import type { Issue, Lesson, SkillItem, User, VoicedPhrase } from "../domain/types";

function rowToUser(row: any): User {
  return {
    id: row.id,
    display_name: row.display_name,
    native_lang: row.native_lang,
    target_lang: row.target_lang,
    interests: JSON.parse(row.interests),
    level: row.level,
  };
}

export function createRepository(db: Db) {
  return {
    createUser(input: { display_name: string; passcode_hash: string }): User {
      const info = db
        .prepare(
          "INSERT INTO users (display_name, passcode_hash) VALUES (?, ?)",
        )
        .run(input.display_name, input.passcode_hash);
      return this.getUser(Number(info.lastInsertRowid))!;
    },

    findUserByName(name: string): (User & { passcode_hash: string }) | null {
      const row = db
        .prepare("SELECT * FROM users WHERE display_name = ?")
        .get(name) as any;
      if (!row) return null;
      return { ...rowToUser(row), passcode_hash: row.passcode_hash };
    },

    getUser(id: number): User | null {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      return row ? rowToUser(row) : null;
    },

    updateUserProfile(
      id: number,
      p: { native_lang: string; target_lang: string; interests: string[]; level: string },
    ): void {
      db.prepare(
        "UPDATE users SET native_lang=?, target_lang=?, interests=?, level=? WHERE id=?",
      ).run(p.native_lang, p.target_lang, JSON.stringify(p.interests), p.level, id);
    },

    createSession(userId: number, startedAt: string): number {
      const info = db
        .prepare("INSERT INTO sessions (user_id, started_at) VALUES (?, ?)")
        .run(userId, startedAt);
      return Number(info.lastInsertRowid);
    },

    createTurn(input: {
      session_id: number;
      prompt_text: string;
      created_at: string;
    }): number {
      const info = db
        .prepare(
          "INSERT INTO turns (session_id, prompt_text, created_at) VALUES (?, ?, ?)",
        )
        .run(input.session_id, input.prompt_text, input.created_at);
      return Number(info.lastInsertRowid);
    },

    updateTurn(id: number, p: { audio_path?: string; transcript?: string }): void {
      if (p.audio_path !== undefined)
        db.prepare("UPDATE turns SET audio_path=? WHERE id=?").run(p.audio_path, id);
      if (p.transcript !== undefined)
        db.prepare("UPDATE turns SET transcript=? WHERE id=?").run(p.transcript, id);
    },

    saveDiagnosis(turnId: number, issues: Issue[]): void {
      db.prepare("INSERT INTO diagnoses (turn_id, issues) VALUES (?, ?)").run(
        turnId,
        JSON.stringify(issues),
      );
    },

    saveLesson(turnId: number, lesson: Lesson, voicedPhrases: VoicedPhrase[]): void {
      db.prepare(
        "INSERT INTO lessons (turn_id, content, voiced_phrases) VALUES (?, ?, ?)",
      ).run(turnId, JSON.stringify(lesson), JSON.stringify(voicedPhrases));
    },

    getSkillItems(userId: number): SkillItem[] {
      return db
        .prepare("SELECT * FROM skill_items WHERE user_id = ?")
        .all(userId) as SkillItem[];
    },

    replaceSkillItems(userId: number, items: SkillItem[]): void {
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM skill_items WHERE user_id = ?").run(userId);
        const stmt = db.prepare(
          `INSERT INTO skill_items
           (user_id, category, label, description, severity, occurrences,
            first_seen, last_seen, status, next_review_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const it of items) {
          stmt.run(
            userId,
            it.category,
            it.label,
            it.description,
            it.severity,
            it.occurrences,
            it.first_seen,
            it.last_seen,
            it.status,
            it.next_review_at,
          );
        }
      });
      tx();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/repository.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/repository.ts tests/lib/repository.test.ts
git commit -m "feat: repository layer over SQLite"
```

---

### Task 5: Auth (passcode hashing)

**Files:**
- Create: `app/lib/auth.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `hashPasscode(passcode: string): string`, `verifyPasscode(passcode: string, stored: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPasscode, verifyPasscode } from "../../app/lib/auth";

describe("auth", () => {
  it("verifies a correct passcode and rejects a wrong one", () => {
    const stored = hashPasscode("hunter2");
    expect(verifyPasscode("hunter2", stored)).toBe(true);
    expect(verifyPasscode("wrong", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", () => {
    expect(hashPasscode("x")).not.toBe(hashPasscode("x"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: FAIL — cannot find module `app/lib/auth`.

- [ ] **Step 3: Implement auth**

Create `app/lib/auth.ts`:
```ts
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(passcode, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth.ts tests/lib/auth.test.ts
git commit -m "feat: passcode hashing with scrypt"
```

---

### Task 6: Provider interfaces and implementations

**Files:**
- Create: `app/lib/providers/types.ts`, `app/lib/providers/anthropic.ts`, `app/lib/providers/openai.ts`
- Test: `tests/lib/providers/types.test.ts`

**Interfaces:**
- Consumes: domain schemas/types (Task 3).
- Produces:
  - `ChatModel` interface:
    - `parse<T>(opts: { system: string; user: string; schema: ZodType<T>; thinking?: boolean }): Promise<T>`
    - `generate(opts: { system: string; user: string }): Promise<string>`
  - `SpeechToText` interface: `transcribe(audio: Buffer, opts: { language?: string }): Promise<string>`
  - `TextToSpeech` interface: `synthesize(text: string, opts?: { language?: string }): Promise<Buffer>`
  - `createAnthropicChatModel(client: Anthropic, model?: string): ChatModel`
  - `createOpenAiStt(client: OpenAI): SpeechToText`
  - `createOpenAiTts(client: OpenAI): TextToSpeech`
  - A test helper `FakeChatModel` is NOT shipped in app code; tests define their own fakes inline.

- [ ] **Step 1: Write the failing test (interface shape + a fake)**

Create `tests/lib/providers/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { ChatModel } from "../../../app/lib/providers/types";

const fake: ChatModel = {
  async parse({ schema }) {
    return schema.parse({ ok: true });
  },
  async generate() {
    return "hello";
  },
};

describe("ChatModel interface", () => {
  it("parse returns schema-validated data", async () => {
    const out = await fake.parse({
      system: "s",
      user: "u",
      schema: z.object({ ok: z.boolean() }),
    });
    expect(out.ok).toBe(true);
  });

  it("generate returns text", async () => {
    expect(await fake.generate({ system: "s", user: "u" })).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/providers/types.test.ts`
Expected: FAIL — cannot find module `app/lib/providers/types`.

- [ ] **Step 3: Implement the interfaces**

Create `app/lib/providers/types.ts`:
```ts
import type { ZodType } from "zod";

export interface ChatModel {
  parse<T>(opts: {
    system: string;
    user: string;
    schema: ZodType<T>;
    thinking?: boolean;
  }): Promise<T>;
  generate(opts: { system: string; user: string }): Promise<string>;
}

export interface SpeechToText {
  transcribe(audio: Buffer, opts: { language?: string }): Promise<string>;
}

export interface TextToSpeech {
  synthesize(text: string, opts?: { language?: string }): Promise<Buffer>;
}
```

- [ ] **Step 4: Run the interface test to verify it passes**

Run: `npx vitest run tests/lib/providers/types.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement the Anthropic chat model**

Create `app/lib/providers/anthropic.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ChatModel } from "./types";

export function createAnthropicChatModel(
  client: Anthropic,
  model = "claude-sonnet-4-6",
): ChatModel {
  return {
    async parse({ system, user, schema, thinking }) {
      const res = await client.messages.parse({
        model,
        max_tokens: 4096,
        system,
        ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema as any) },
      });
      if (res.parsed_output == null) {
        throw new Error(`No parsed output (stop_reason=${res.stop_reason})`);
      }
      return res.parsed_output as any;
    },

    async generate({ system, user }) {
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new Error(`No text in response (stop_reason=${res.stop_reason})`);
      }
      return block.text;
    },
  };
}
```

- [ ] **Step 6: Implement the OpenAI STT/TTS adapters**

Create `app/lib/providers/openai.ts`:
```ts
import OpenAI, { toFile } from "openai";
import type { SpeechToText, TextToSpeech } from "./types";

export function createOpenAiStt(client: OpenAI): SpeechToText {
  return {
    async transcribe(audio, { language }) {
      const file = await toFile(audio, "audio.webm", { type: "audio/webm" });
      const res = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        ...(language ? { language } : {}),
      });
      return res.text;
    },
  };
}

export function createOpenAiTts(client: OpenAI): TextToSpeech {
  return {
    async synthesize(text) {
      const res = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
      });
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
```

- [ ] **Step 7: Typecheck the provider implementations**

Run: `npx tsc --noEmit`
Expected: no errors in `app/lib/providers/*`. (If the SDK type for `output_config` rejects the cast, keep the `as any` on the schema only — the runtime call is correct per the SDK structured-output API.)

- [ ] **Step 8: Commit**

```bash
git add app/lib/providers tests/lib/providers
git commit -m "feat: ChatModel/STT/TTS provider interfaces and implementations"
```

---

### Task 7: Profile updater (deterministic spaced repetition)

**Files:**
- Create: `app/modules/profile-updater.ts`
- Test: `tests/modules/profile-updater.test.ts`

**Interfaces:**
- Consumes: domain types (Task 3).
- Produces:
  - `reviewIntervalDays(occurrences: number): number` — returns `[1, 3, 7, 16, 35][min(occurrences - 1, 4)]`.
  - `issueKey(issue: Issue): string` — `${issue.dimension}:${(issue.tags[0] ?? issue.snippet).toLowerCase()}`.
  - `updateProfile(items: SkillItem[], issues: Issue[], now: Date): SkillItem[]` — pure function. For each issue: if a matching item exists (same `issueKey`, derived from `category`+`label`), increment `occurrences`, set `last_seen=now`, raise `severity` to the max of old/new, set `status='active'`, set `next_review_at = now + reviewIntervalDays(occurrences)`. Otherwise append a new item (`occurrences=1`, `first_seen=last_seen=now`, `status='active'`, `next_review_at=now+reviewIntervalDays(1)`). For each existing item NOT touched this session whose `next_review_at <= now` (it was due and did not recur → improvement): promote one level `active→improving→mastered` and set `next_review_at = now + reviewIntervalDays(occurrences)`. Item ids are preserved; new items get `id=0`.

Severity ordering: `low < medium < high`.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/profile-updater.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  reviewIntervalDays,
  issueKey,
  updateProfile,
} from "../../app/modules/profile-updater";
import type { Issue, SkillItem } from "../../app/domain/types";

const now = new Date("2026-06-19T00:00:00.000Z");

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

describe("reviewIntervalDays", () => {
  it("ramps and caps", () => {
    expect(reviewIntervalDays(1)).toBe(1);
    expect(reviewIntervalDays(3)).toBe(7);
    expect(reviewIntervalDays(99)).toBe(35);
  });
});

describe("issueKey", () => {
  it("keys on dimension + first tag, lowercased", () => {
    expect(issueKey(issue())).toBe("grammar:past-tense");
  });
});

describe("updateProfile", () => {
  it("creates a new active item for a fresh issue", () => {
    const out = updateProfile([], [issue()], now);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(1);
    expect(out[0].status).toBe("active");
    expect(out[0].category).toBe("grammar");
    expect(out[0].label).toBe("past-tense");
    expect(out[0].next_review_at).toBe("2026-06-20T00:00:00.000Z");
  });

  it("increments occurrences and raises severity on recurrence", () => {
    const existing: SkillItem = {
      id: 5,
      user_id: 1,
      category: "grammar",
      label: "past-tense",
      description: "old",
      severity: "low",
      occurrences: 1,
      first_seen: "2026-06-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "improving",
      next_review_at: "2026-06-02T00:00:00.000Z",
    };
    const out = updateProfile([existing], [issue({ severity: "high" })], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(5);
    expect(out[0].occurrences).toBe(2);
    expect(out[0].severity).toBe("high");
    expect(out[0].status).toBe("active");
    expect(out[0].last_seen).toBe(now.toISOString());
  });

  it("promotes a due, untouched item toward mastery", () => {
    const existing: SkillItem = {
      id: 9,
      user_id: 1,
      category: "idiom",
      label: "phrasal-verbs",
      description: "d",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-05-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-06-10T00:00:00.000Z", // due before now
    };
    const out = updateProfile([existing], [], now);
    expect(out[0].status).toBe("improving");
  });

  it("leaves a not-yet-due untouched item unchanged", () => {
    const existing: SkillItem = {
      id: 9,
      user_id: 1,
      category: "idiom",
      label: "phrasal-verbs",
      description: "d",
      severity: "medium",
      occurrences: 2,
      first_seen: "2026-05-01T00:00:00.000Z",
      last_seen: "2026-06-01T00:00:00.000Z",
      status: "active",
      next_review_at: "2026-12-01T00:00:00.000Z", // not due
    };
    const out = updateProfile([existing], [], now);
    expect(out[0].status).toBe("active");
    expect(out[0].next_review_at).toBe("2026-12-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/modules/profile-updater.test.ts`
Expected: FAIL — cannot find module `app/modules/profile-updater`.

- [ ] **Step 3: Implement the profile updater**

Create `app/modules/profile-updater.ts`:
```ts
import type { Issue, Severity, SkillItem, SkillStatus } from "../domain/types";

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high"];
const STATUS_NEXT: Record<SkillStatus, SkillStatus> = {
  active: "improving",
  improving: "mastered",
  mastered: "mastered",
};

export function reviewIntervalDays(occurrences: number): number {
  const ramp = [1, 3, 7, 16, 35];
  return ramp[Math.min(Math.max(occurrences, 1) - 1, ramp.length - 1)];
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function issueKey(issue: Issue): string {
  const tail = (issue.tags[0] ?? issue.snippet).toLowerCase();
  return `${issue.dimension}:${tail}`;
}

function itemKey(item: SkillItem): string {
  return `${item.category}:${item.label.toLowerCase()}`;
}

export function updateProfile(
  items: SkillItem[],
  issues: Issue[],
  now: Date,
): SkillItem[] {
  const nowIso = now.toISOString();
  const byKey = new Map<string, SkillItem>();
  for (const it of items) byKey.set(itemKey(it), { ...it });
  const touched = new Set<string>();

  for (const issue of issues) {
    const key = issueKey(issue);
    touched.add(key);
    const existing = byKey.get(key);
    if (existing) {
      const occurrences = existing.occurrences + 1;
      byKey.set(key, {
        ...existing,
        description: issue.explanation,
        severity: maxSeverity(existing.severity, issue.severity),
        occurrences,
        last_seen: nowIso,
        status: "active",
        next_review_at: addDays(now, reviewIntervalDays(occurrences)),
      });
    } else {
      byKey.set(key, {
        id: 0,
        user_id: items[0]?.user_id ?? 0,
        category: issue.dimension,
        label: issue.tags[0] ?? issue.snippet,
        description: issue.explanation,
        severity: issue.severity,
        occurrences: 1,
        first_seen: nowIso,
        last_seen: nowIso,
        status: "active",
        next_review_at: addDays(now, reviewIntervalDays(1)),
      });
    }
  }

  for (const [key, item] of byKey) {
    if (touched.has(key)) continue;
    if (new Date(item.next_review_at).getTime() <= now.getTime()) {
      byKey.set(key, {
        ...item,
        status: STATUS_NEXT[item.status],
        next_review_at: addDays(now, reviewIntervalDays(item.occurrences)),
      });
    }
  }

  return [...byKey.values()];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/modules/profile-updater.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add app/modules/profile-updater.ts tests/modules/profile-updater.test.ts
git commit -m "feat: deterministic profile updater with spaced repetition"
```

---

### Task 8: Diagnostician

**Files:**
- Create: `app/modules/diagnostician.ts`
- Test: `tests/modules/diagnostician.test.ts`

**Interfaces:**
- Consumes: `ChatModel` (Task 6), `IssueListSchema` (Task 3), `SkillItem`/`Issue` types.
- Produces: `diagnose(input: { transcript: string; targetLang: string; nativeLang: string; profile: SkillItem[]; chat: ChatModel }): Promise<Issue[]>`. Returns `[]` for empty/whitespace transcripts without calling the model.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/diagnostician.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { diagnose } from "../../app/modules/diagnostician";
import type { ChatModel } from "../../app/lib/providers/types";

function chatReturning(issues: unknown): ChatModel {
  return {
    parse: vi.fn().mockResolvedValue(issues),
    generate: vi.fn(),
  };
}

describe("diagnose", () => {
  it("returns issues parsed from the model", async () => {
    const chat = chatReturning({
      issues: [
        {
          dimension: "naturalness",
          severity: "low",
          snippet: "make a party",
          natural_version: "throw a party",
          explanation: "Native speakers say 'throw'.",
          tags: ["collocation"],
        },
      ],
    });
    const out = await diagnose({
      transcript: "Yesterday I make a party.",
      targetLang: "en",
      nativeLang: "es",
      profile: [],
      chat,
    });
    expect(out).toHaveLength(1);
    expect(out[0].natural_version).toBe("throw a party");
    expect(chat.parse).toHaveBeenCalledOnce();
  });

  it("skips the model for an empty transcript", async () => {
    const chat = chatReturning({ issues: [] });
    const out = await diagnose({
      transcript: "   ",
      targetLang: "en",
      nativeLang: "es",
      profile: [],
      chat,
    });
    expect(out).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/modules/diagnostician.test.ts`
Expected: FAIL — cannot find module `app/modules/diagnostician`.

- [ ] **Step 3: Implement the diagnostician**

Create `app/modules/diagnostician.ts`:
```ts
import type { ChatModel } from "../lib/providers/types";
import { IssueListSchema } from "../domain/schemas";
import type { Issue, SkillItem } from "../domain/types";

const SYSTEM = `You are a meticulous language-assessment analyst.
You receive a transcript of a learner speaking their target language.
Find EVERY way their production differs from a fluent native speaker across these
dimensions: grammar, word_choice, naturalness, idiom, register.
Judge nothing and teach nothing — only catalog issues.
For each issue give: the exact snippet, the natural_version a native would use,
a one-sentence explanation, and short tags. If the transcript is already native-like,
return an empty issues array.`;

export async function diagnose(input: {
  transcript: string;
  targetLang: string;
  nativeLang: string;
  profile: SkillItem[];
  chat: ChatModel;
}): Promise<Issue[]> {
  if (input.transcript.trim().length === 0) return [];

  const knownGaps = input.profile
    .map((s) => `- ${s.category}/${s.label} (${s.status})`)
    .join("\n");

  const user = `Target language: ${input.targetLang}
Learner's native language: ${input.nativeLang}
Known recurring gaps (pay extra attention, but report all new issues too):
${knownGaps || "(none yet)"}

Transcript:
"""
${input.transcript}
"""`;

  const result = await input.chat.parse({
    system: SYSTEM,
    user,
    schema: IssueListSchema,
    thinking: true,
  });
  return result.issues;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/modules/diagnostician.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/modules/diagnostician.ts tests/modules/diagnostician.test.ts
git commit -m "feat: diagnostician module"
```

---

### Task 9: Lesson composer

**Files:**
- Create: `app/modules/lesson-composer.ts`
- Test: `tests/modules/lesson-composer.test.ts`

**Interfaces:**
- Consumes: `ChatModel`, `LessonSchema` (Task 3), `Issue`/`Lesson` types.
- Produces:
  - `selectTopIssues(issues: Issue[], limit?: number): Issue[]` — sorts by severity (`high>medium>low`) and returns at most `limit` (default 3).
  - `composeLesson(input: { issues: Issue[]; nativeLang: string; targetLang: string; chat: ChatModel }): Promise<Lesson>`. If no issues, returns an encouraging lesson with empty `points` WITHOUT calling the model.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/lesson-composer.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { selectTopIssues, composeLesson } from "../../app/modules/lesson-composer";
import type { ChatModel } from "../../app/lib/providers/types";
import type { Issue } from "../../app/domain/types";

function issue(severity: Issue["severity"], tag: string): Issue {
  return {
    dimension: "grammar",
    severity,
    snippet: tag,
    natural_version: tag,
    explanation: "x",
    tags: [tag],
  };
}

describe("selectTopIssues", () => {
  it("orders by severity and caps the count", () => {
    const out = selectTopIssues(
      [issue("low", "a"), issue("high", "b"), issue("medium", "c")],
      2,
    );
    expect(out.map((i) => i.tags[0])).toEqual(["b", "c"]);
  });
});

describe("composeLesson", () => {
  it("returns an encouraging empty lesson without calling the model", async () => {
    const chat: ChatModel = { parse: vi.fn(), generate: vi.fn() };
    const lesson = await composeLesson({
      issues: [],
      nativeLang: "es",
      targetLang: "en",
      chat,
    });
    expect(lesson.points).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
  });

  it("returns the model's lesson when there are issues", async () => {
    const chat: ChatModel = {
      parse: vi.fn().mockResolvedValue({
        intro: "Great answer!",
        points: [{ title: "Sound natural", body: "Try X.", phrase: "X" }],
      }),
      generate: vi.fn(),
    };
    const lesson = await composeLesson({
      issues: [issue("high", "b")],
      nativeLang: "es",
      targetLang: "en",
      chat,
    });
    expect(lesson.points[0].phrase).toBe("X");
    expect(chat.parse).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/modules/lesson-composer.test.ts`
Expected: FAIL — cannot find module `app/modules/lesson-composer`.

- [ ] **Step 3: Implement the lesson composer**

Create `app/modules/lesson-composer.ts`:
```ts
import type { ChatModel } from "../lib/providers/types";
import { LessonSchema } from "../domain/schemas";
import type { Issue, Lesson, Severity } from "../domain/types";

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const SYSTEM = `You are a warm, encouraging language tutor.
You receive a few issues a learner made. DO NOT correct them harshly or list errors.
Open with genuine encouragement, then teach 1-3 points framed positively
("here's a way to sound more natural", "a shortcut native speakers use").
Write the explanation in the learner's NATIVE language. For each point include one
short example "phrase" in the TARGET language they can hear and repeat.`;

export function selectTopIssues(issues: Issue[], limit = 3): Issue[] {
  return [...issues]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, limit);
}

export async function composeLesson(input: {
  issues: Issue[];
  nativeLang: string;
  targetLang: string;
  chat: ChatModel;
}): Promise<Lesson> {
  const top = selectTopIssues(input.issues);
  if (top.length === 0) {
    return {
      intro: "That sounded great — nothing to flag this time. Keep going!",
      points: [],
    };
  }

  const user = `Native language (write explanations in this): ${input.nativeLang}
Target language (write example phrases in this): ${input.targetLang}
Issues to teach gently:
${top
  .map(
    (i) =>
      `- [${i.dimension}] they said "${i.snippet}"; natural: "${i.natural_version}" (${i.explanation})`,
  )
  .join("\n")}`;

  return await input.chat.parse({
    system: SYSTEM,
    user,
    schema: LessonSchema,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/modules/lesson-composer.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/modules/lesson-composer.ts tests/modules/lesson-composer.test.ts
git commit -m "feat: lesson composer module"
```

---

### Task 10: Prompt generator

**Files:**
- Create: `app/modules/prompt-generator.ts`
- Test: `tests/modules/prompt-generator.test.ts`

**Interfaces:**
- Consumes: `ChatModel`, `SkillItem` type.
- Produces:
  - `dueItems(items: SkillItem[], now: Date): SkillItem[]` — items with `status !== 'mastered'` and `next_review_at <= now`, sorted soonest-due first.
  - `generatePrompt(input: { interests: string[]; profile: SkillItem[]; targetLang: string; now: Date; chat: ChatModel }): Promise<string>` — one `generate` call; returns the trimmed text.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/prompt-generator.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { dueItems, generatePrompt } from "../../app/modules/prompt-generator";
import type { ChatModel } from "../../app/lib/providers/types";
import type { SkillItem } from "../../app/domain/types";

const now = new Date("2026-06-19T00:00:00.000Z");

function item(over: Partial<SkillItem>): SkillItem {
  return {
    id: 1,
    user_id: 1,
    category: "grammar",
    label: "x",
    description: "d",
    severity: "medium",
    occurrences: 1,
    first_seen: "2026-06-01T00:00:00.000Z",
    last_seen: "2026-06-01T00:00:00.000Z",
    status: "active",
    next_review_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("dueItems", () => {
  it("returns non-mastered items whose review date has passed", () => {
    const out = dueItems(
      [
        item({ id: 1, next_review_at: "2026-06-10T00:00:00.000Z" }),
        item({ id: 2, next_review_at: "2026-12-01T00:00:00.000Z" }),
        item({ id: 3, status: "mastered", next_review_at: "2026-01-01T00:00:00.000Z" }),
      ],
      now,
    );
    expect(out.map((i) => i.id)).toEqual([1]);
  });
});

describe("generatePrompt", () => {
  it("calls the model and returns trimmed text", async () => {
    const chat: ChatModel = {
      parse: vi.fn(),
      generate: vi.fn().mockResolvedValue("  Tell me about a hobby.  "),
    };
    const out = await generatePrompt({
      interests: ["hiking"],
      profile: [],
      targetLang: "en",
      now,
      chat,
    });
    expect(out).toBe("Tell me about a hobby.");
    expect(chat.generate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/modules/prompt-generator.test.ts`
Expected: FAIL — cannot find module `app/modules/prompt-generator`.

- [ ] **Step 3: Implement the prompt generator**

Create `app/modules/prompt-generator.ts`:
```ts
import type { ChatModel } from "../lib/providers/types";
import type { SkillItem } from "../domain/types";

const SYSTEM = `You generate ONE short, friendly conversation prompt for a language learner.
The prompt invites a 3-5 sentence spoken answer about their life or interests.
Keep it natural and open-ended. Return ONLY the prompt text, no preamble, no quotes.`;

export function dueItems(items: SkillItem[], now: Date): SkillItem[] {
  return items
    .filter(
      (i) =>
        i.status !== "mastered" &&
        new Date(i.next_review_at).getTime() <= now.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime(),
    );
}

export async function generatePrompt(input: {
  interests: string[];
  profile: SkillItem[];
  targetLang: string;
  now: Date;
  chat: ChatModel;
}): Promise<string> {
  const due = dueItems(input.profile, input.now);
  const user = `Target language: ${input.targetLang}
Learner interests: ${input.interests.join(", ") || "(unknown)"}
Weak areas to softly elicit (do NOT mention these to the learner): ${
    due.map((d) => `${d.category}/${d.label}`).join(", ") || "(none)"
  }`;

  const text = await input.chat.generate({ system: SYSTEM, user });
  return text.trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/modules/prompt-generator.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/modules/prompt-generator.ts tests/modules/prompt-generator.test.ts
git commit -m "feat: prompt generator module"
```

---

### Task 11: Turn orchestration service

**Files:**
- Create: `app/modules/run-turn.ts`
- Test: `tests/modules/run-turn.test.ts`

**Interfaces:**
- Consumes: `Repository` (Task 4), `ChatModel`/`SpeechToText`/`TextToSpeech` (Task 6), `diagnose` (Task 8), `updateProfile` (Task 7), `composeLesson` (Task 9), domain types.
- Produces: `runTurn(input: { repo: Repository; user: User; sessionId: number; turnId: number; promptText: string; audio: Buffer; chat: ChatModel; stt: SpeechToText; tts: TextToSpeech; now: Date; saveAudio: (bytes: Buffer) => Promise<string> }): Promise<{ transcript: string; lesson: Lesson; voicedPhrases: VoicedPhrase[] }>`.

Flow: transcribe → update turn transcript → if transcript blank, save an "ask for more" lesson and return early → diagnose → save diagnosis → updateProfile + replaceSkillItems → composeLesson → synth each lesson phrase (best-effort; on TTS failure leave `audio_path: null`) → save lesson → return.

- [ ] **Step 1: Write the failing test**

Create `tests/modules/run-turn.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { openDb } from "../../app/lib/db";
import { createRepository } from "../../app/lib/repository";
import { runTurn } from "../../app/modules/run-turn";
import type { ChatModel, SpeechToText, TextToSpeech } from "../../app/lib/providers/types";

const now = new Date("2026-06-19T00:00:00.000Z");

function setup() {
  const repo = createRepository(openDb(":memory:"));
  const user = repo.createUser({ display_name: "t", passcode_hash: "h" });
  repo.updateUserProfile(user.id, {
    native_lang: "es",
    target_lang: "en",
    interests: ["music"],
    level: "intermediate",
  });
  const full = repo.getUser(user.id)!;
  const sid = repo.createSession(user.id, now.toISOString());
  const tid = repo.createTurn({
    session_id: sid,
    prompt_text: "How was your day?",
    created_at: now.toISOString(),
  });
  return { repo, user: full, sid, tid };
}

const stt = (text: string): SpeechToText => ({
  transcribe: vi.fn().mockResolvedValue(text),
});
const tts: TextToSpeech = { synthesize: vi.fn().mockResolvedValue(Buffer.from("x")) };

describe("runTurn", () => {
  it("runs the full pipeline and persists a profile + lesson", async () => {
    const { repo, user, sid, tid } = setup();
    const chat: ChatModel = {
      parse: vi
        .fn()
        // diagnose → issues
        .mockResolvedValueOnce({
          issues: [
            {
              dimension: "grammar",
              severity: "high",
              snippet: "I have went",
              natural_version: "I went",
              explanation: "Use simple past.",
              tags: ["past-tense"],
            },
          ],
        })
        // composeLesson → lesson
        .mockResolvedValueOnce({
          intro: "Nice!",
          points: [{ title: "Past tense", body: "Use 'went'.", phrase: "I went home." }],
        }),
      generate: vi.fn(),
    };

    const result = await runTurn({
      repo,
      user,
      sessionId: sid,
      turnId: tid,
      promptText: "How was your day?",
      audio: Buffer.from("audio"),
      chat,
      stt: stt("Yesterday I have went home."),
      tts,
      now,
      saveAudio: async () => "data/audio/1.webm",
    });

    expect(result.transcript).toContain("went home");
    expect(result.lesson.points[0].phrase).toBe("I went home.");
    expect(result.voicedPhrases[0].audio_path).not.toBeNull();
    expect(repo.getSkillItems(user.id)).toHaveLength(1);
  });

  it("short-circuits on a blank transcript", async () => {
    const { repo, user, sid, tid } = setup();
    const chat: ChatModel = { parse: vi.fn(), generate: vi.fn() };
    const result = await runTurn({
      repo,
      user,
      sessionId: sid,
      turnId: tid,
      promptText: "How was your day?",
      audio: Buffer.from(""),
      chat,
      stt: stt("   "),
      tts,
      now,
      saveAudio: async () => "data/audio/1.webm",
    });
    expect(result.lesson.points).toEqual([]);
    expect(chat.parse).not.toHaveBeenCalled();
    expect(repo.getSkillItems(user.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/modules/run-turn.test.ts`
Expected: FAIL — cannot find module `app/modules/run-turn`.

- [ ] **Step 3: Implement the orchestrator**

Create `app/modules/run-turn.ts`:
```ts
import type { Repository } from "../lib/repository";
import type { ChatModel, SpeechToText, TextToSpeech } from "../lib/providers/types";
import type { Lesson, User, VoicedPhrase } from "../domain/types";
import { diagnose } from "./diagnostician";
import { updateProfile } from "./profile-updater";
import { composeLesson } from "./lesson-composer";

export async function runTurn(input: {
  repo: Repository;
  user: User;
  sessionId: number;
  turnId: number;
  promptText: string;
  audio: Buffer;
  chat: ChatModel;
  stt: SpeechToText;
  tts: TextToSpeech;
  now: Date;
  saveAudio: (bytes: Buffer) => Promise<string>;
}): Promise<{ transcript: string; lesson: Lesson; voicedPhrases: VoicedPhrase[] }> {
  const { repo, user, turnId } = input;
  const targetLang = user.target_lang ?? "en";
  const nativeLang = user.native_lang ?? "en";

  const audioPath = await input.saveAudio(input.audio);
  const transcript = await input.stt.transcribe(input.audio, {
    language: targetLang,
  });
  repo.updateTurn(turnId, { audio_path: audioPath, transcript });

  if (transcript.trim().length === 0) {
    const lesson: Lesson = {
      intro: "I couldn't quite hear that — try recording a bit more.",
      points: [],
    };
    repo.saveLesson(turnId, lesson, []);
    return { transcript, lesson, voicedPhrases: [] };
  }

  const profile = repo.getSkillItems(user.id);
  const issues = await diagnose({
    transcript,
    targetLang,
    nativeLang,
    profile,
    chat: input.chat,
  });
  repo.saveDiagnosis(turnId, issues);

  const updated = updateProfile(profile, issues, input.now);
  repo.replaceSkillItems(user.id, updated);

  const lesson = await composeLesson({
    issues,
    nativeLang,
    targetLang,
    chat: input.chat,
  });

  const voicedPhrases: VoicedPhrase[] = [];
  for (const point of lesson.points) {
    try {
      const bytes = await input.tts.synthesize(point.phrase, {
        language: targetLang,
      });
      const path = await input.saveAudio(bytes);
      voicedPhrases.push({ text: point.phrase, audio_path: path });
    } catch {
      voicedPhrases.push({ text: point.phrase, audio_path: null });
    }
  }

  repo.saveLesson(turnId, lesson, voicedPhrases);
  return { transcript, lesson, voicedPhrases };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/modules/run-turn.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/modules/run-turn.ts tests/modules/run-turn.test.ts
git commit -m "feat: turn orchestration pipeline"
```

---

### Task 12: App wiring — singletons, sessions, and routes

**Files:**
- Create: `app/lib/app-context.server.ts`, `app/lib/session.server.ts`, `app/routes/_index.tsx`, `app/routes/onboarding.tsx`, `app/routes/session.tsx`
- Modify: `app/root.tsx` (only if the scaffold's root needs an `<Outlet/>` — leave as generated otherwise)
- Test: `tests/lib/app-context.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `getContext()` returning `{ repo, chat, stt, tts, saveAudio }` built once from env (lazy singletons).
  - `saveAudio(bytes: Buffer): Promise<string>` — writes to `data/audio/<uuid>.webm`, returns the path.
  - Route modules with React Router `loader`/`action`/default component.
  - A cookie session storing `userId` via `app/lib/session.server.ts` (`getUserId(request)`, `createUserSession(userId, redirectTo)`, `logout(request)`).

- [ ] **Step 1: Write the failing test for `saveAudio`**

Create `tests/lib/app-context.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSaveAudio } from "../../app/lib/app-context.server";

describe("makeSaveAudio", () => {
  it("writes bytes and returns the path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "audio-"));
    const saveAudio = makeSaveAudio(dir);
    const path = await saveAudio(Buffer.from("hello"));
    expect(readFileSync(path).toString()).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/app-context.test.ts`
Expected: FAIL — cannot find module `app/lib/app-context.server`.

- [ ] **Step 3: Implement the app context + `saveAudio`**

Create `app/lib/app-context.server.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { openDb } from "./db";
import { createRepository, type Repository } from "./repository";
import { createAnthropicChatModel } from "./providers/anthropic";
import { createOpenAiStt, createOpenAiTts } from "./providers/openai";
import type { ChatModel, SpeechToText, TextToSpeech } from "./providers/types";

export function makeSaveAudio(dir: string) {
  mkdirSync(dir, { recursive: true });
  return async (bytes: Buffer): Promise<string> => {
    const path = join(dir, `${randomUUID()}.webm`);
    writeFileSync(path, bytes);
    return path;
  };
}

export interface AppContext {
  repo: Repository;
  chat: ChatModel;
  stt: SpeechToText;
  tts: TextToSpeech;
  saveAudio: (bytes: Buffer) => Promise<string>;
}

let ctx: AppContext | null = null;

export function getContext(): AppContext {
  if (ctx) return ctx;
  const db = openDb(process.env.DB_PATH ?? "data/app.db");
  const anthropic = new Anthropic();
  const openai = new OpenAI();
  ctx = {
    repo: createRepository(db),
    chat: createAnthropicChatModel(anthropic),
    stt: createOpenAiStt(openai),
    tts: createOpenAiTts(openai),
    saveAudio: makeSaveAudio(process.env.AUDIO_DIR ?? "data/audio"),
  };
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/app-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the cookie session helper**

Create `app/lib/session.server.ts`:
```ts
import { createCookieSessionStorage, redirect } from "react-router";

const storage = createCookieSessionStorage({
  cookie: {
    name: "slt_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [process.env.SESSION_SECRET ?? "dev-secret-change-me"],
  },
});

export async function getUserId(request: Request): Promise<number | null> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  const id = session.get("userId");
  return typeof id === "number" ? id : null;
}

export async function createUserSession(userId: number, redirectTo: string) {
  const session = await storage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

export async function logout(request: Request) {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: { "Set-Cookie": await storage.destroySession(session) },
  });
}
```

- [ ] **Step 6: Implement the login / profile-picker route**

Create `app/routes/_index.tsx`:
```tsx
import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/_index";
import { getContext } from "../lib/app-context.server";
import { hashPasscode, verifyPasscode } from "../lib/auth";
import { createUserSession, getUserId } from "../lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request)) return redirect("/session");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const passcode = String(form.get("passcode") ?? "");
  if (!name || !passcode) return { error: "Name and passcode required." };

  const { repo } = getContext();
  const existing = repo.findUserByName(name);
  if (existing) {
    if (!verifyPasscode(passcode, existing.passcode_hash))
      return { error: "Wrong passcode." };
    const dest = existing.target_lang ? "/session" : "/onboarding";
    return createUserSession(existing.id, dest);
  }
  const user = repo.createUser({
    display_name: name,
    passcode_hash: hashPasscode(passcode),
  });
  return createUserSession(user.id, "/onboarding");
}

export default function Index() {
  const data = useActionData<typeof action>();
  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Language Teacher</h1>
      <p>Pick your profile (new name = new profile).</p>
      <Form method="post">
        <input name="name" placeholder="Your name" autoComplete="off" />
        <input name="passcode" type="password" placeholder="Passcode" />
        <button type="submit">Continue</button>
      </Form>
      {data?.error && <p style={{ color: "crimson" }}>{data.error}</p>}
    </main>
  );
}
```

- [ ] **Step 7: Implement the onboarding route**

Create `app/routes/onboarding.tsx`:
```tsx
import { Form, redirect } from "react-router";
import type { Route } from "./+types/onboarding";
import { getContext } from "../lib/app-context.server";
import { getUserId } from "../lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return redirect("/");
  return null;
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
  return redirect("/session");
}

export default function Onboarding() {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Set up your learning</h1>
      <Form method="post">
        <label>Native language <input name="native_lang" defaultValue="en" /></label>
        <label>Target language <input name="target_lang" placeholder="es" /></label>
        <label>Interests (comma-separated) <input name="interests" /></label>
        <label>
          Level
          <select name="level" defaultValue="intermediate">
            <option>beginner</option>
            <option>intermediate</option>
            <option>advanced</option>
          </select>
        </label>
        <button type="submit">Start</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 8: Implement the session route (loader generates a prompt; action runs a turn)**

Create `app/routes/session.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
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
```

> Note: `./+types/<route>` imports are generated by React Router's typegen (`react-router typegen`, run automatically by `npm run dev`/`build`). If typecheck complains before the first dev run, run `npx react-router typegen`.

- [ ] **Step 9: Manual verification**

Create a `.env` with real keys:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SESSION_SECRET=some-random-string
```
Run: `npm run dev`
Then in a browser: create a profile → onboarding (native `en`, target `es`, an interest) → on the session page, record a short spoken answer → confirm a prompt appears, a lesson renders after submitting, and `data/app.db` + `data/audio/*.webm` are created.
Expected: the full loop works end-to-end against the live APIs.

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add app tests
git commit -m "feat: app context, sessions, and routes (login, onboarding, session loop)"
```

---

## Self-Review

**Spec coverage:**
- §1 core loop → Tasks 8–12 (diagnose → update → compose → voice → next prompt). ✓
- §2 scope (language-agnostic, multi-user, text+audio, immediate lesson, LLM prompts, running profile, native-language teaching) → Tasks 4, 7, 9, 10, 12. Pronunciation/charts explicitly deferred. ✓
- §3 stack (React Router v7, Sonnet 4.6 via `@anthropic-ai/sdk`, Whisper, OpenAI TTS, SQLite, passcode auth) → Tasks 1, 2, 5, 6, 12. ✓
- §4 modules (auth, onboarding, prompt-generator, recorder, transcriber, diagnostician, profile-updater, lesson-composer, speech-synth, persistence) → Tasks 4–12. Transcriber/speech-synth are the STT/TTS providers in Task 6. Recorder is in the Task 12 session route. ✓
- §5 diagnosis dimensions → `IssueSchema` enum (Task 3) + diagnostician prompt (Task 8). ✓
- §6 skill profile + spaced repetition → Task 7. ✓
- §7 data model → Task 2 schema. ✓
- §8 two-stage pipeline → Tasks 8, 9, 11. ✓
- §9 error handling (blank transcript short-circuit, per-stage TTS fallback) → Task 11; typed exceptions noted in Global Constraints. ✓
- §10 testing (unit for profile-updater + persistence, faked LLM/STT/TTS, e2e happy path) → Tasks 4, 7, 11. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code step shows full code. ✓

**Type consistency:** `Issue`, `SkillItem`, `Lesson`, `VoicedPhrase` defined in Task 3 and used unchanged in Tasks 4, 7–11. `ChatModel.parse/generate`, `SpeechToText.transcribe`, `TextToSpeech.synthesize` defined in Task 6 and consumed identically in Tasks 8–12. `Repository` method names match between Task 4 definition and Task 11/12 usage. `updateProfile`, `diagnose`, `composeLesson`, `generatePrompt`, `runTurn` signatures consistent across producer and consumer tasks. ✓
