# AGENTS.md

Agent + deployment notes for **Smart Language Teacher**. Codex reads this; the
identical guidance lives in `CLAUDE.md` for Claude Code.

## Deployment model

- This repo is developed **directly on the VPS** (`zurd`, user `vasily`) under
  `~/apps/smart-lang-teacher`, run by **pm2** and reached via SSH tunnel / Tailscale.
- These are live files. Prefer small, atomic commits. Commit before risky changes
  so a rollback is just `git revert HEAD`.
- Runtime state lives in `data/` — SQLite (`data/app.db`) and saved audio
  (`data/audio/`). It is gitignored and **server-only**. Never delete it; never run
  `rsync --delete` over it.
- Secrets live in `.env.local` on the VPS (gitignored). Never commit keys and never
  paste them into a prompt.
- Do **not** bind to `0.0.0.0` on the VPS. Start with `HOST=127.0.0.1` and expose the
  app only through nginx, an SSH tunnel, or Tailscale.

## Stack

- React Router v8 (framework mode, SSR) on an Express server (`server.js`)
- Claude Sonnet via `@anthropic-ai/sdk`; OpenAI Whisper (STT) + OpenAI TTS
- SQLite via `better-sqlite3` — a **native module**: the VPS needs `build-essential`
  + `python3` so `pnpm install` can compile it
- Package manager: **pnpm** (run `corepack enable` to use the pinned version)

## Commands (pnpm — not npm)

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Check / typecheck (the "check" gate) | `pnpm typecheck` |
| Test (providers faked — no keys, no network) | `pnpm test` |
| Build (required before `start`) | `pnpm build` |
| Dev server | `pnpm dev` |
| Prod server (serves `./build`, loads `.env`/`.env.local`) | `pnpm start` |

There is **no** `npm run check`. Use `pnpm typecheck` followed by `pnpm test`.

## Before restarting the app

```bash
pnpm typecheck
pnpm test
pnpm build
pm2 restart smart-lang-teacher --update-env
```

## Process / ports / logs

- pm2 process: `smart-lang-teacher` — `PORT=3017`, `HOST=127.0.0.1`
- Status: `pm2 list`
- Logs: `pm2 logs smart-lang-teacher --lines 100`

## Environment variables

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — required for the core loop
- `SESSION_SECRET` — sign session cookies; set to a long random string
- `PORT` (default `3000`), `HOST` (default `0.0.0.0`)
- `DB_PATH` (default `data/app.db`), `AUDIO_DIR` (default `data/audio`)

See `.env.example`.
