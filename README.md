# RE:ACT

*Feel without obeying. Understand without escaping. Act with intention.*

RE:ACT is an offline-first application for emotional awareness and intentional action. It helps you notice an emotion, see the impulse it carries, understand what you might need, and choose a response on purpose. It is not a habit tracker, mood tracker or journal, and it never diagnoses.

All data stays on your device (IndexedDB). Core features never need the internet.

## Current status

**Stage 2 of 10 complete — design system and application shell.** You can navigate between Home, New Episode, My Patterns, My Growth and Settings, switch between light and dark themes, and see the responsive layouts. Episodes, the database and the emotion library are not built yet; screens that depend on them show clearly labelled placeholders. See [ROADMAP.md](ROADMAP.md).

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari) with IndexedDB and ES module support.
- Optional for development: Node.js 18+ (only for syntax checks and tests; the app itself has no dependencies).

## Running locally

ES modules require the files to be served over HTTP (not opened via `file://`). Any static server works, for example:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The theme choice is remembered on this device (Settings, or the sun/moon button in the header). No data is stored yet, and nothing is sent anywhere.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full structure, layering rules and database design.

```
index.html   package.json
src/         app · components · pages · styles · db · models · services · utils · data · engine · analytics
public/      assets (icons, fonts)
tests/       browser checks (see TESTING.md)
```

## Documentation

| File | Purpose |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Ten stages, status and remaining work |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture, data models, conventions |
| [CHANGELOG.md](CHANGELOG.md) | Changes per stage |
| [TESTING.md](TESTING.md) | Test cases and actual results |

## Principles

Negative emotions are not failures. Interpretations are possibilities, not facts. Suggested actions are optional. Rest, boundaries and seeking support are always valid responses. No points, no streaks, no rewards for feeling happy.
