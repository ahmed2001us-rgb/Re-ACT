# RE:ACT — Roadmap

> Stage 1 and Stage 2 are defined by the project owner. **Stages 3–10 are a proposal** made during Stage 1 and should be confirmed or corrected before Stage 3 begins.

Legend: ✅ complete · 🔄 in progress · ⬜ not started

| # | Stage | Status |
|---|---|---|
| 1 | Project Initialization | ✅ Complete |
| 2 | Design System & Application Shell | ✅ Complete |
| 3 | Database Layer & Persistence | ✅ Complete |
| 4 | Emotion Library & Action Library | ⬜ Next |
| 5 | New Episode Flow | ⬜ |
| 6 | Redirection Engine | ⬜ |
| 7 | Episode History & My Patterns | ⬜ |
| 8 | My Growth | ⬜ |
| 9 | Settings, Data Export/Import & Privacy | ⬜ |
| 10 | PWA, Offline, Accessibility & Release QA | ⬜ |

## Stage 1 — Project Initialization ✅
Architecture, directory structure, database schema, data models, conventions, documentation.
Remaining: none.

## Stage 2 — Design System & Application Shell ✅ (defined by owner)
Delivered: light/dark themes (system-aware), sidebar / icon rail / bottom navigation, header with theme toggle, five routed pages, reusable cards, buttons, fields, segmented control, modal and confirm dialogs, toasts, empty and loading states, Home dashboard with labelled placeholders, responsive layouts (desktop, tablet, mobile). 174 browser checks pass (see TESTING.md).
Carried forward: theme preference currently uses interim `localStorage` (moves to the settings store in Stage 3); the Settings "Development preview" card is removed or hidden in Stage 9.

## Stage 3 — Database Layer & Persistence ✅ (defined by owner)
Delivered: IndexedDB `react-db` v1 with `episodes`, `emotions`, `actionLibrary`, `settings`; versioned migration runner; validated models; repositories with transactions, duplicate prevention, revision-checked safe updates and calm errors; a reusable database service plus episode and settings services; incomplete episodes saved and resumed across sessions; the theme preference moved into the settings store. 110 browser checks pass (see TESTING.md).
Carried forward: the persistent-storage request is implemented but first called in Stage 5; episode emotion ids are validated against the library in Stage 4.

## Stage 4 — Emotion Library & Action Library ⬜
Built-in emotions (grouped by family, neutral descriptions), needs and impulse presets, built-in action suggestions, libraryService merging built-in entries with the custom ones already stored by Stage 3 (create/edit/delete UI), and validation that an episode's emotion ids exist.

## Stage 5 — New Episode Flow ⬜
Step-by-step flow: emotions and intensity, trigger, interpretations (as possibilities), needs, impulses, response, outcome, reflection. Built on `episodeService` (Stage 3): autosave of unfinished episodes, resume, skip, edit later. Requests persistent storage after the first save.

## Stage 6 — Redirection Engine ⬜
Rule-based suggestions from emotion family, intensity, impulses and needs; always includes rest, boundary and support options; plain-language reasons; integrated into the response step as optional.

## Stage 7 — Episode History & My Patterns ⬜
Recent episodes on Home, full list with filters (emotion, date, status), episode detail/edit/delete, pattern views (frequent emotions, triggers, impulses vs responses).

## Stage 8 — My Growth ⬜
Awareness and intention indicators (e.g. noticing impulses before acting, completing reflections), described without points, rewards for happiness, or punishment for hard emotions. Home emotional-development summary becomes real.

## Stage 9 — Settings, Data Export/Import & Privacy ⬜
Theme, text size, reduced motion, data export/import (validated JSON), delete-all with confirmation, privacy statement.

## Stage 10 — PWA, Offline, Accessibility & Release QA ⬜
Service worker, manifest, installability, offline verification, accessibility audit, performance pass, full regression test, documentation finalisation.

## Cross-cutting (every stage)
Preserve working features · test before declaring done · update README, ROADMAP, ARCHITECTURE, CHANGELOG, TESTING · completion report · wait for explicit instruction before the next stage.
