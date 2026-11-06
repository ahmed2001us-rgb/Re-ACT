# RE:ACT

*Feel without obeying. Understand without escaping. Act with intention.*

RE:ACT is an offline-first application for emotional awareness and intentional action. It helps you notice an emotion, see the impulse it carries, understand what you might need, and choose a response on purpose. It is not a habit tracker, mood tracker or journal, and it never diagnoses.

All data stays on your device (IndexedDB). Core features never need the internet.

## Current status

**Stage 4 of 10 complete — emotional episode engine.** You can record an episode on one page (the emotions you feel, each with its own intensity from 1 to 10, what set it off, what happened, how you saw it, what you might need, the urge you felt, what you chose, what followed, and a reflection), save it unfinished, and come back to it later. Episodes can be viewed, edited and deleted, and Home shows your recent episodes and counts. The step-by-step guided workflow is the next stage and is not built yet. See [ROADMAP.md](ROADMAP.md).

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari) with IndexedDB and ES module support.
- Optional for development: Node.js 18+ (only for syntax checks and tests; the app itself has no dependencies).

## Running locally

ES modules require the files to be served over HTTP (not opened via `file://`). Any static server works, for example:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The theme choice and everything you write are kept in this browser, on this device. Settings shows whether local storage is ready. Nothing is sent anywhere.

## Using it

- **New Episode:** pick one or more emotions (search by name or a similar word, or add your own), set an intensity for each, and fill in as much as you like. Drafts save themselves; press *Save episode* when you want to mark it finished.
- **Continue later:** Home and New Episode offer to continue your newest draft; *All episodes* lists everything, with a Completed / Drafts filter.
- **Edit or delete:** open an episode, then *Edit* or *Delete* (deleting asks first and cannot be undone).
- **Your own emotions:** added from the emotion picker, removed in Settings (an emotion that episodes still use cannot be removed).

## Tests

Needs Node.js 18+, Chrome and playwright-core (dev only; not an app dependency):

```bash
CHROME=/usr/bin/google-chrome PLAYWRIGHT_CORE=/path/to/node_modules SCRATCH=/tmp/react-test node tests/e2e-stage4.mjs   # Stage 4: library, episode flows, drafts, restart, two tabs, responsive
CHROME=... PLAYWRIGHT_CORE=... SCRATCH=... node tests/e2e-stage3.mjs                                                       # Stage 3: database and persistence
CHROME=... PLAYWRIGHT_CORE=... BASE_URL=http://localhost:8765 node tests/e2e-stage2.mjs                                     # Stage 2: shell (needs a static server on that port)
```

The Stage 4 and Stage 3 scripts start their own server and run the in-browser suites in `tests/app/` and `tests/db/`. See [TESTING.md](TESTING.md).

For code, use the database only through services: see ARCHITECTURE.md section 5.

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
