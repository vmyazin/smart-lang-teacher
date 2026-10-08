# Smart Language Teacher

![Smart Language Teacher — your spontaneous speech, gently taught: record a natural answer, get it diagnosed silently, and learn from bite-size lessons with native pronunciation](docs/assets/hero.png)

A personalized language tutor for intermediate learners. It elicits a spontaneous spoken
answer, transcribes it, silently diagnoses grammar/vocabulary/naturalness gaps, keeps a
running per-user skill profile with spaced repetition, and teaches the top issues gently —
with audio playback of the natural phrasing.

**The loop:** generate a prompt (tuned to your interests + weak spots) → record a spoken
answer → OpenAI (`gpt-transcribe`) transcribes → Claude diagnoses silently → deterministic profile update →
Claude composes a gentle mini-lesson on the top 1–3 issues → OpenAI TTS (`gpt-4o-mini-tts`) voices the example
phrases so you can hear them.

## Stack

- **React Router v8** (framework mode, Node server)
- **Claude Sonnet 4.6** via `@anthropic-ai/sdk` (Zod-validated structured output)
- **OpenAI** `gpt-transcribe` (speech-to-text) + **OpenAI TTS** `gpt-4o-mini-tts` (pronunciation playback)
- **SQLite** via `better-sqlite3`
- **Vitest** for tests

Local-only by design. Package manager: **pnpm**.

## Getting Started

### Prerequisites

- Node 24+ and pnpm 10+ (`corepack enable` to use the pinned version)
- An Anthropic API key and an OpenAI API key

### Install

```bash
pnpm install
```

### Configure

Create a `.env` (or `.env.local` — both are gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SESSION_SECRET=some-long-random-string
```

### Develop

```bash
pnpm run dev
```

Then open the app: create a profile → onboarding (native/target language + interests) →
record an answer. SQLite (`data/app.db`) and saved audio (`data/audio/`) are created on first use.

### Test

```bash
pnpm test
```

Runs the full suite with all external providers (LLM/STT/TTS) faked — no API calls, no keys needed.

### Build

```bash
pnpm run build
```

## Deployment

### Docker

```bash
docker build -t smart-lang-teacher .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=... -e OPENAI_API_KEY=... -e SESSION_SECRET=... \
  smart-lang-teacher
```

### DIY

The built-in app server is production-ready. Deploy the output of `pnpm run build`:

```
├── package.json
├── pnpm-lock.yaml
├── server.js
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Project layout

```
app/
  domain/      # shared types + Zod schemas
  lib/         # db, repository, auth, providers (ChatModel/STT/TTS interfaces)
  modules/     # diagnostician, profile-updater, lesson-composer, prompt-generator, run-turn
  routes/      # _index (login), onboarding, session (record loop), audio (TTS playback)
docs/superpowers/   # design spec + implementation plan
```
