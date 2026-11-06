# RE:ACT — Roadmap

> Stages 1–4 were defined by the project owner (Phase 02, 03 and 04 requests). Stage 5 is named by the owner (the six-stage guided workflow) but its scope has not been given yet. **Stages 6–10 are still my own proposal** and should be confirmed or corrected before they begin.

Legend: ✅ complete · 🔄 in progress · ⬜ not started

| # | Stage | Status |
|---|---|---|
| 1 | Project Initialization | ✅ Complete |
| 2 | Design System & Application Shell | ✅ Complete |
| 3 | Database Layer & Persistence | ✅ Complete |
| 4 | Emotional Episode Engine | ✅ Complete |
| 5 | Guided Six-Stage Workflow | ⬜ Next (scope to be given by the owner) |
| 6 | Action Library & Redirection Engine | ⬜ |
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
Carried forward (both resolved in Stage 4): emotion ids are now validated against the library, and the persistent-storage request is made once after the first save.

## Stage 4 — Emotional Episode Engine ✅ (defined by owner)
Delivered: searchable library of the 19 requested emotions with neutral descriptions; several emotions per episode, each with its own 1–10 intensity; custom emotions (add in the form, remove in Settings); a single-page episode form (emotion, intensity, trigger, event, interpretation, need, impulse, chosen response with category, outcome, reflection); create, view, edit, delete; save draft (autosave plus a Save draft button) and resume; Home shows real recent episodes, counts and a continue-draft card; an All episodes page with a status filter. Every operation persists through IndexedDB. 206 browser checks pass (see TESTING.md).
Carried forward: none.

## Stage 5 — Guided Six-Stage Workflow ⬜ (named by owner, scope not yet given)
The owner has said the guided workflow follows this phase. Open question for the owner: the workflow is described as six stages, while the stored `EPISODE_STEPS` vocabulary (Stage 1) has nine (emotions, trigger, event, interpretation, need, impulse, response, outcome, reflection). The six stages need to be defined, and mapped onto (or replace) the nine steps, before work begins. It will reuse `episodeService` and the library; `currentStep` / `completedSteps` are already stored on every episode and untouched by the Stage 4 form.

## Stage 6 — Action Library & Redirection Engine ⬜ (proposal)
Built-in action suggestions, custom actions (the store and model already exist), and the rule-based redirection engine: suggestions from emotion family, intensity, impulses and needs; rest, boundary and support options always present; plain-language reasons; always optional.

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
