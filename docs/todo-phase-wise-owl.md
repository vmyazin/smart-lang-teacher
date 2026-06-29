# Todo Phase: Wise Owl

Created: 2026-06-29

## Naming Pattern

Use this pattern for future feature or fix todo documents:

```text
docs/todo-phase-[memorable-animal-name].md
```

Examples:

- `docs/todo-phase-wise-owl.md`
- `docs/todo-phase-bright-fox.md`
- `docs/todo-phase-steady-bear.md`

Guidelines:

- Use lowercase words separated by hyphens.
- Keep the animal name short and memorable.
- One todo doc should describe one coherent product or engineering phase.
- Prefer todo docs for scoped implementation candidates, not long-term strategy.

## Goal

Improve user retention and smoothness of the core language-practice loop:

1. Sign up and set up profile.
2. Add API keys.
3. Receive a relevant prompt.
4. Record a spoken answer.
5. Get understandable feedback.
6. Review progress and return for another practice session.

## Product Todos

- [ ] First-run activation checklist
  - Add a guided setup state that walks users through profile setup, API keys, microphone permission/test, and first successful recording.
  - Reduce the current interruption where `/session` redirects to `/settings/keys` after prompt generation needs providers.

- [ ] Language selection presets
  - Replace raw language text inputs in onboarding/profile with searchable language selects.
  - Store stable language codes while showing friendly labels and native language names.
  - Validate unsupported or empty target/native language values before practice begins.

- [ ] Daily practice goal and streak
  - Add a visible daily target such as `1/3 answers today`.
  - Derive streaks from existing `sessions` and `turns` data.
  - Show this in Practice and Profile so returning has an obvious purpose.

- [ ] Review due skills mode
  - Surface due `skill_items.next_review_at` items directly instead of only feeding them silently into prompt generation.
  - Add a Practice entry point like `Review 3 due skills`.
  - Generate short prompts or drills focused on due skills.

- [ ] Immediate micro-practice after corrections
  - For each lesson phrase, add a `Repeat this` interaction.
  - Record the learner repeating the corrected phrase.
  - Transcribe and give lightweight confirmation or retry guidance.

- [x] In-place Next flow
  - Replace the current `location.reload()` based Next button with an action/fetcher flow.
  - Clear the current lesson result and load the next prompt without a full page reload.
  - Preserve audio state, progress UI behavior, and error handling.

- [ ] Prompt tuning controls
  - Add quick controls for topic, easier/harder, practical/freeform, and shorter/longer prompts.
  - Track skip reasons when users hit `New question`.
  - Feed recent skip reasons into prompt generation to reduce rejected prompts.

- [ ] History progress summaries
  - Make History more than an archive by adding weekly/monthly summaries.
  - Show turns completed, practice days, recurring issues, mastered items, and notable before/after phrases.
  - Keep existing search and skill filters.

- [ ] Better analysis waiting state
  - Improve progress labels for transcription, diagnosis, lesson writing, and TTS.
  - Show a learned estimated remaining time after enough successful turns.
  - Consider pre-generating the next prompt after feedback is saved.

- [ ] Lightweight reminders
  - Add opt-in reminders tied to the user's daily practice goal.
  - Start with browser notifications or in-app reminder state before email.
  - Keep reminders easy to disable and avoid sending them before the first successful session.

## Suggested Build Order

1. First-run activation checklist.
2. In-place Next flow.
3. Review due skills mode.
4. Daily practice goal and streak.
5. Micro-practice after corrections.

These first items reuse existing data and should improve activation and repeat practice without a large redesign.
