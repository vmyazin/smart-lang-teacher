# Smart Language Teacher — Design Spec

**Date:** 2026-06-19
**Status:** Approved design, pending implementation plan

## 1. Concept

A personalized language tutor that assesses an intermediate learner from their own
spontaneous speech, rather than serving generic canned content. Each turn:

```
generate prompt (themed by interests + targeting weak/due skill items)
   → learner records a spoken answer in the target language
   → Whisper transcribes it
   → Diagnostician (Claude) silently analyzes the FULL transcript → structured issues
   → Profile updater merges issues into the running skill profile + schedules review
   → Lesson composer (Claude) teaches the top 1–3 gently, in the learner's native language
   → OpenAI TTS voices the natural/example phrases so the learner can hear them
   → next prompt adapts
```

**Core principle: diagnose exhaustively, teach selectively and kindly.** Everything the
diagnostician finds is captured to the profile for trend tracking; only a curated couple
surface as a warm "here's how to sound more natural" lesson — never a red-pen correction.

## 2. Scope (v1)

- **Target languages:** language-agnostic (any language the LLM handles). Configured per user.
- **Audience:** the author + a few friends — lightweight multi-user with simple accounts.
- **Lesson delivery:** text + audio playback (native pronunciation via TTS).
- **Session rhythm:** answer → immediate lesson → repeat (tight feedback loop).
- **Prompts:** LLM-generated, adapting to the learner's interests and skill profile.
- **Memory:** a running structured skill profile per user (recurring gaps, weak vocab,
  naturalness issues), updated every session and used to target lessons + spaced repetition.
- **Teaching language:** the learner's configured native language.
- **Out of scope (v1):** pronunciation/accent analysis (Whisper returns text only — TTS still
  lets the learner *hear* correct pronunciation); progress charts/trend visualizations;
  real-time conversational voice agent; public sign-up / real identity system.

## 3. Stack

- **Framework / host:** React Router v7 (Remix), Node server mode, **local-only** for now
  (plain SQLite file on disk).
- **LLM:** Claude **Sonnet 4.6** (`claude-sonnet-4-6`) for diagnosis + lesson generation,
  via the official **`@anthropic-ai/sdk`** (single-provider, not on Vercel, so the direct
  SDK is used rather than the Vercel AI SDK). Structured diagnosis output uses
  `client.messages.parse()` with `zodOutputFormat()` (`output_config.format`) for
  Zod-validated results. Adaptive thinking (`thinking: { type: "adaptive" }`) MAY be enabled
  on the diagnostician where deeper analysis helps; the lesson composer runs without thinking
  for lower latency.
- **Speech-to-text:** OpenAI **Whisper** (`whisper-1`) via the `openai` SDK.
- **Text-to-speech:** OpenAI **TTS** (`gpt-4o-mini-tts` / `tts-1`) via the `openai` SDK.
- **Database:** **SQLite** file on disk (e.g. `better-sqlite3`), accessed through a thin
  repository layer.
- **Auth:** lightweight — pick-a-profile + per-user passcode (hashed). Just enough so each
  friend has isolated data. No real identity system.

Environment requires two API keys: `ANTHROPIC_API_KEY` (Claude) and `OPENAI_API_KEY`
(Whisper + TTS).

## 4. Architecture — modules

Each module is a plain TypeScript function behind a small interface, independently unit-testable
with a fake LLM / STT / TTS.

- **`auth`** — pick-a-profile + passcode (hashed). Enough to isolate each friend's data.
- **`onboarding`** — captures native language, target language, interests, self-rated level.
- **`prompt-generator`** — `(profile, interests, due-items) → prompt text`. One Claude call.
- **`recorder`** (client) — browser `MediaRecorder`; uploads the audio blob.
- **`transcriber`** — `(audio) → transcript`. Whisper wrapper.
- **`diagnostician`** — `(transcript, target, native, profile) → issues[]`. Claude with a
  Zod-validated schema. "Find everything, judge nothing."
- **`profile-updater`** — `(profile, new issues) → updated profile`. **Deterministic** logic
  (merge, occurrence counts, recency, status transitions, spaced-repetition scheduling). No
  LLM — predictable and cheap.
- **`lesson-composer`** — `(curated issues, native, target) → lesson + phrases-to-voice`.
  One Claude call, warm-tutor persona.
- **`speech-synth`** — `(phrases, target) → audio`. OpenAI TTS wrapper.
- **`persistence`** — SQLite repository layer; every other module talks to this, not raw SQL.

## 5. Diagnosis dimensions

The diagnostician scores across what separates an intermediate learner from a native speaker:

- **Grammar** — tense, agreement, prepositions, articles, etc.
- **Word choice / vocabulary range** — correct but basic where a more precise word exists.
- **Collocations & naturalness** — technically right, but a native wouldn't phrase it that way.
- **Idiom / slang opportunities** — where a colloquialism or shortcut would sound fluent.
- **Register / tone** — too formal, too stiff for the context.

Each issue: `{ dimension, severity, snippet, natural_version, explanation, tags[] }`.

*Known limitation:* pronunciation/accent cannot be judged from a transcript (Whisper returns
text only), so it is scoped out of v1 analysis. TTS still provides correct pronunciation to hear.

## 6. The skill profile (memory)

Per user, a structured running model. Each **skill item**:

```
{ category, label, description, severity, occurrences,
  first_seen, last_seen, status, next_review_at }
```

`status ∈ { active, improving, mastered }`.

The `profile-updater` (deterministic):
- increments `occurrences` and updates `last_seen` when an issue recurs;
- transitions items toward `improving` / `mastered` when they stop appearing;
- sets `next_review_at` for spaced repetition.

The `prompt-generator` biases new prompts toward due/active items so the learner naturally
gets chances to re-attempt weak spots.

## 7. Data model (SQLite)

- `users` — id, display_name, passcode_hash, native_lang, target_lang, interests(json), level
- `sessions` — id, user_id, started_at
- `turns` — id, session_id, prompt_text, audio_path, transcript, created_at
- `diagnoses` — id, turn_id, issues(json)
- `skill_items` — id, user_id, category, label, description, severity, occurrences,
  first_seen, last_seen, status, next_review_at
- `lessons` — id, turn_id, content(json), voiced_phrases(json)

## 8. The two-stage pipeline (chosen approach)

```
Whisper → Diagnostician (structured analysis of the full transcript)
        → Profile update (deterministic)
        → Lesson-composer (teaches only the top 1–3 curated issues)
```

Two separate Claude calls with distinct jobs:
- **Diagnostician** — a "find everything, judge nothing" analyst emitting structured issues.
- **Lesson-composer** — a warm tutor that picks the most valuable couple and explains them
  gently, framed positively ("here's a way to sound more natural"), never as corrections.

Rationale: clean separation makes each prompt simple and independently tunable; the full
diagnosis is captured for trends even though only a little is taught; teaching tone can change
without touching analysis. The extra LLM call is negligible at this scale.

## 9. Error handling

- Mic permission denied / no audio → friendly retry; never lose the current prompt.
- Whisper / Claude / TTS failure → graceful per-stage fallback (e.g. lesson still shows as
  text if TTS fails; "couldn't analyze, try again" if diagnosis fails). One failing stage
  never blanks the screen.
- Transcript empty / too short → skip diagnosis, ask the learner to say a bit more.
- All external calls wrapped with timeout + one retry. Use typed Anthropic exception classes
  (`RateLimitError`, etc.) rather than string-matching error messages.

## 10. Testing

Per the user's testing policy, write tests where they add clear value rather than blanket TDD:

- **Unit:** `profile-updater` (pure logic — spaced repetition, status transitions) and
  `persistence`.
- **LLM modules:** tested with recorded/fake responses validated against the Zod schema — no
  live API calls in tests.
- **End-to-end:** a couple of happy-path tests with all externals (LLM, STT, TTS) faked.

## 11. Open questions / deferred

- Hosting beyond local (VPS / Fly.io / Turso) — deferred; SQLite file is fine for now.
- Progress visualizations and long-term trend charts — deferred to a later milestone.
- Pronunciation/accent analysis — needs audio-level analysis beyond Whisper transcripts.
