# Profile Page & Lesson History Dashboard — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, pending implementation plan
**Builds on:** the existing Smart Language Teacher app (React Router v8, SQLite via `better-sqlite3`, Pocket UI).

## 1. Purpose

Surface the data the app already captures so the learner can **review and re-listen** to
past answers, and manage their profile. Two signed-in surfaces:

- **History** — review/re-listen is the primary job: revisit past answers, re-read the
  corrections, replay native pronunciation and your own recording.
- **Profile** — edit learning settings, and see a snapshot of skill progress.

This is almost entirely a **read/presentation** feature over existing data (`turns`,
`diagnoses`, `lessons`, `skill_items`, `users`), plus a profile-edit form reusing
`updateUserProfile`.

## 2. Scope (this pass)

- **History list** (`/history`): past answers newest-first, with text search + skill filter.
- **History detail** (`/history/:turnId`): full review of one answer — prompt, transcript,
  replay of your recording, the lesson with per-point native-phrase replay, and a
  collapsible raw diagnosis.
- **Profile** (`/profile`): editable settings (native/target language, interests, level) +
  a read-only skill snapshot grouped by status.
- **Navigation**: a header nav (Practice · History · Profile) on signed-in pages.
- **Out of scope**: progress charts/trends; per-phrase A/B alignment of your audio vs native
  (we only store one recording per answer); pagination (personal scale — a simple list is fine);
  deleting/exporting history.

## 3. Routes

All require `getUserId(request)`; unauthenticated → redirect `/`. All data access is
`userId`-scoped (a user only sees their own turns).

| Route | Loader | Action | Notes |
|-------|--------|--------|-------|
| `/history` | `listTurns(userId, { search, skill })` + `listSkillFacets(userId)`; reads `?q=` and `?skill=` from the URL | — | GET search/filter form sets the URL params (no client JS). Empty + no-results states. |
| `/history/:turnId` | `getTurnDetail(turnId, userId)` | — | Not found / not owned → redirect `/history`. |
| `/profile` | `getUser(userId)` + `getSkillItems(userId)` | `updateUserProfile(userId, …)` | Edit form (same fields as onboarding) + skill snapshot. |

## 4. Repository — new read methods

Added to the existing `Repository` (`app/lib/repository.ts`); every method is `userId`-scoped.
Domain types live in `app/domain/types.ts`.

```ts
interface TurnSummary {
  id: number;
  created_at: string;
  prompt_text: string;
  transcript: string | null;
  issueCount: number;
  dimensions: Dimension[]; // distinct dimensions touched, from the diagnosis
}

interface TurnDetail {
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

- `listTurns(userId: number, opts?: { search?: string; skill?: string }): TurnSummary[]`
  - Joins `turns t → sessions s ON t.session_id = s.id` where `s.user_id = userId`, ordered
    by `t.id DESC` (newest first).
  - `search` → `WHERE (t.prompt_text LIKE %q% OR t.transcript LIKE %q%)`.
  - `skill` → matches a turn whose diagnosis contains the given dimension or tag (see §5).
  - `issueCount`/`dimensions` are computed by parsing each row's `diagnoses.issues` JSON in TS.
- `getTurnDetail(turnId: number, userId: number): TurnDetail | null`
  - Ownership-guarded via the `sessions.user_id = userId` join; returns `null` if the turn
    doesn't exist or isn't the user's. Parses `diagnoses.issues`, `lessons.content`,
    `lessons.voiced_phrases`.
- `listSkillFacets(userId: number): string[]`
  - Distinct dimensions/tags across the user's diagnoses, to populate the filter `<select>`.

Existing methods reused: `getUser`, `getSkillItems`, `updateUserProfile`.

## 5. Skill filter — SQLite JSON

A turn "touches" a skill when its `diagnoses.issues` JSON contains a matching `dimension`
or `tags[]` entry. Implemented with SQLite's `json_each` rather than a schema change:

```sql
SELECT DISTINCT t.* FROM turns t
JOIN sessions s   ON t.session_id = s.id
JOIN diagnoses d  ON d.turn_id = t.id
JOIN json_each(d.issues) je
WHERE s.user_id = ?
  AND (
    json_extract(je.value, '$.dimension') = ?
    OR EXISTS (SELECT 1 FROM json_each(json_extract(je.value, '$.tags')) tg
               WHERE tg.value = ?)
  )
ORDER BY t.id DESC;
```

Text search and skill filter compose (both applied when present). The SQL lives entirely
inside the repository; routes/modules never see raw SQL.

## 6. Audio replay — reuses existing infra

No new audio infrastructure. The existing `/audio/:name` resource route serves any file in
`AUDIO_DIR` (default `data/audio`) by basename with a traversal guard. Both `turns.audio_path`
(your recording) and `lessons.voiced_phrases[].audio_path` (native phrases) live there.

- The `fileBasename` helper currently inlined in `session.tsx` is extracted to a tiny shared
  `app/lib/paths.ts` (pure, browser-safe) and reused by the history detail page.
- Detail page renders one `<audio controls>` for your full answer recording, and a replay
  control per lesson point for its native phrase. A missing audio file simply hides that
  player (the `/audio` route 404s safely).
- **Known authorization limitation:** the `/audio/:name` route has no session/ownership check —
  audio bytes are protected only by the unguessability of the random UUID filename, not by
  `userId`. This is a pre-existing, consciously-reused tradeoff acceptable for a **local-only,
  personal app**; turn-level authorization (which lessons/transcripts a user can list and open)
  is correctly enforced in the repository. If this app ever becomes multi-tenant/public, gate
  `/audio/:name` behind auth + an ownership lookup (filename → turn → user).

## 7. Profile editing & skill snapshot

- **Edit form**: the same fields as onboarding (native_lang, target_lang, interests, level),
  pre-filled from `getUser`, posting to a `/profile` action that calls `updateUserProfile`.
- **Skill snapshot** (read-only): `getSkillItems(userId)` grouped by `status`
  (`active` / `improving` / `mastered`). Within a group, sort weakest-first (severity, then
  occurrences). Each item shows category/label, occurrences, last-seen, and a "due" badge when
  `next_review_at ≤ now`. No charts.

## 8. Navigation

A small shared header nav rendered on `/session`, `/history`, `/history/:turnId`, `/profile`:
**Practice** (→ `/session`) · **History** (→ `/history`) · **Profile** (→ `/profile`),
styled to match the Pocket header bar. Implemented as a small reusable component
(`app/components/Nav.tsx`).

## 9. Error handling

- Unauthenticated on any route → redirect `/`.
- `/history/:turnId` for a missing or non-owned turn → redirect `/history`.
- Empty history, empty search results → friendly Pocket empty states.
- Missing audio file → hide that player; never error the page.
- Profile edit with blank target language → keep the existing behavior (defaults), no crash.

## 10. Testing

Per the testing policy, test where it adds clear value — primarily the repository read logic:

- Seed an in-memory DB with turns/diagnoses/lessons across **two** users.
- `listTurns`: newest-first ordering; text search matches prompt/transcript; skill filter
  matches by dimension and by tag; **user-scoping** (user A never sees user B's turns);
  `issueCount`/`dimensions` parsed correctly.
- `getTurnDetail`: returns the full shape; returns `null` for another user's turn id and for
  a non-existent id (ownership guard).
- `listSkillFacets`: returns the distinct dimensions/tags for the user only.
- `app/lib/paths.ts` `fileBasename`: a couple of cases (plain, nested, backslashes).
- Route loaders kept thin; covered lightly only where worthwhile.

## 11. Styling

Extend `app/styles/pocket.css`: history list rows, the search/filter bar, the detail layout
(transcript block, audio players, lesson points), the profile edit form (reusing
`pk-form`/`pk-card`/`pk-input`/`pk-select`/`pk-btn`), the skill-snapshot groups and chips,
and empty states. Consistent with the existing Pocket aesthetic.

## 12. File structure

```
app/
  components/Nav.tsx          # shared header nav
  lib/paths.ts                # fileBasename (extracted from session.tsx; pure, shared)
  lib/repository.ts           # + listTurns, getTurnDetail, listSkillFacets
  domain/types.ts             # + TurnSummary, TurnDetail
  routes/history.tsx          # list + search/filter
  routes/history.$turnId.tsx  # detail / review
  routes/profile.tsx          # edit settings + skill snapshot
  routes.ts                   # register the three routes
  styles/pocket.css           # + history/detail/profile/nav styles
tests/lib/repository.test.ts  # + new read-method tests
tests/lib/paths.test.ts       # fileBasename
```
