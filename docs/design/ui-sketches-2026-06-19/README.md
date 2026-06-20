# UI direction sketches — 2026-06-19

Three throwaway mockups explored for the tutor's core screen (prompt → record →
gentle lesson with audio playback). Static HTML with placeholder Spanish-learner
content — open any file directly in a browser to view.

| File | Option | Direction |
|------|--------|-----------|
| `a-field-notes.html` | A · Field Notes | Editorial / literary — warm paper, serif (Fraunces/Spectral), numbered "tutor notes". Light. |
| `b-studio.html` | B · Studio | Dark immersive voice-coach — tactile mic orb, pulsing rings, live waveform, acid-lime accents (Syne/DM Mono/Sora). |
| `c-pocket.html` | C · Pocket | Playful card deck — chunky rounded type (Bricolage Grotesque/Nunito), hard shadows, tangerine/teal palette, streak badge. Light. |
| `index.html` | — | Side-by-side chooser that previews all three. |

## Decision

**Option C — "Pocket" was chosen and implemented** into the real app
(`app/styles/pocket.css` + the `_index` / `onboarding` / `session` routes), with the
mockup's faked content replaced by real data (live transcript, tracked-skill chips,
target language + level, tap-to-play TTS audio).

These files are kept as a design-history archive only; they are not part of the build.
