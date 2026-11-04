# RE:ACT — Architecture

*Feel without obeying. Understand without escaping. Act with intention.*

Status: **Stage 2 complete** (design system and application shell). Sections marked *(implemented)* describe working code; everything else is a design contract filled in by the stage listed in ROADMAP.md.

## 1. Goals that shape the architecture

1. **Offline-first and private.** All data lives in IndexedDB on the device. No network call is needed for any core feature; no analytics leave the device.
2. **Grow across ten stages without a rebuild.** Every stage adds modules behind stable boundaries instead of changing existing ones.
3. **Few dependencies.** Vanilla JS, ES modules, no framework, no build step required. Vite is only an option if bundling becomes necessary later (it would not change the folder layout).
4. **Respect for the user's emotions.** Product rules (no diagnosis, interpretations are possibilities, suggestions are optional, no rewards for feeling happy) are encoded in data shapes and in the engine's contract, not just in copy.

## 2. Directory structure

```
index.html                  Entry document: pre-paint theme script, stylesheet links, #app mount (implemented)
package.json                "type": "module"; zero dependencies
sw.js                       (Stage 10) service worker; at root so its scope covers the app
public/
  manifest.webmanifest      (Stage 10) PWA manifest
  assets/icons, fonts       Static assets, self-hosted (no CDN)
src/
  main.js                   Entry point (implemented): theme -> shell -> router; database joins in Stage 3
  app/                      (implemented)
    config.js               App name/version and the route table (single source for nav, router, titles)
    store.js                Tiny observable store for UI state
    theme.js                Theme manager: system | light | dark
    router.js               Hash router, lazy page loading, focus and document-title management
  components/               (implemented) icons, button, card, input (field + segmented), modal, toast,
                            empty-state, loading-state, sidebar, bottom-nav, header, shell
  pages/                    (implemented) home, new-episode, patterns, growth, settings
  styles/                   (implemented) tokens.css, base.css, layout.css, components.css, pages.css
  db/
    schema.js               Declarative stores + indexes (implemented)
    migrations/             One file per schema/data version bump
    (index.js, repositories) Added in Stage 3
  models/
    enums.js                Controlled vocabularies (implemented)
    typedefs.js             JSDoc entity shapes (implemented)
  services/                 Application logic: episodeService, settingsService, exportService, ... (Stage 3+)
  utils/                    dom.js (safe DOM builder), date.js (implemented); more as needed
  data/
    emotions/               Built-in emotion library (Stage 4)
    actions/                Built-in action suggestions (Stage 4)
  engine/
    redirection/            Rule-based suggestion engine (Stage 6; pure functions)
  analytics/                Pure functions that derive patterns/growth from episodes (Stages 7-8)
tests/
  e2e-stage2.mjs            Browser checks (needs Chrome + playwright-core; not an app dependency)
```

## 3. Layering and dependency rules

```
pages → components, services          (UI)
services → db, engine, analytics, data, utils
engine, analytics → data, models, utils   (pure; no DB, no DOM)
db → models, utils
components, pages → utils, other components, and the UI-level modules app/config and app/theme
models, utils, data → nothing project-internal (utils may use models)
```

Rules:

- **Only `src/db` touches IndexedDB.** Everything else calls services/repositories. This isolates data integrity and makes migrations safe.
- **`engine` and `analytics` are pure.** Input in, result out, no side effects. They can be tested in plain Node with no browser.
- **Pages never query the database directly.** They call services.
- **No circular imports.** Dependencies only point down the list above.
- **One acknowledged exception:** `app/router.js` imports two presentational components (loading and empty states) to render its own fallback screens. Nothing else in `app/` imports components.

## 4. Key technical decisions

| Decision | Reason |
|---|---|
| Vanilla JS + ES modules | Matches the project stack, no dependency risk, works offline and with any static server. |
| Components are functions returning DOM nodes: `createCard(props) → HTMLElement` | Simple, testable, no framework. Pages compose them. |
| Pages export `render(ctx)` and optional `destroy()` | Gives the router a uniform contract and clean teardown (no leaked listeners). |
| Hash-based routing (`#/home`) | Works from any static host and `file://`-like contexts, and survives service-worker caching without server rewrites. |
| User text is only inserted with `textContent` | Prevents XSS from the user's own stored text. `innerHTML` is never used with stored data. |
| Built-in libraries live in code, not the DB | They can be improved by app updates without migrating or overwriting user data. The DB stores only custom entries. |
| Episode is **one document** with embedded arrays | An episode is always read and written as a whole; embedded emotions/impulses avoid joins and give atomic saves. |
| `emotionIds` denormalised on the episode | IndexedDB cannot index into arrays of objects; this multiEntry index makes "episodes with emotion X" a fast query for My Patterns. |
| Analytics computed on demand, not stored | One source of truth means no stale aggregates and no sync bugs. A cache can be added later without schema breakage. |
| `schemaVersion` on every record + `DB_VERSION` | Records and stores can be migrated independently. |
| Dates as ISO-8601 UTC strings | Sortable, serialisable, export-friendly. Display converts to the user's local time zone. |
| IDs via `crypto.randomUUID()` | No collisions, safe for export/import merging. |
| Theme preference in `localStorage` for now *(interim)* | The theme must be applied before first paint (inline script in `index.html`), which IndexedDB cannot do synchronously. Stage 3 moves the source of truth into the `settings` store and keeps only a tiny boot flag; `app/theme.js` is the only module that changes. |
| Native `<dialog>` for modals | Browser-provided focus trap, Escape handling and inert background; less code and fewer accessibility bugs than a custom implementation. |
| System font stacks (serif headings, sans body) | No font files to fetch, so no network dependency; elegant serif headings via Iowan Old Style / Palatino / Georgia. |
| Page modules loaded with dynamic `import()` | Shell paints first; later stages add pages without growing the initial load. |
| Relative asset paths (`./src/...`) | App works from any folder or sub-path, which matters for hosting and for the Stage 10 service-worker scope. |

## 5. Database

Database name `react-db`, version `1`. Defined in `src/db/schema.js`.

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `episodes` | `id` | `createdAt`, `updatedAt`, `status`, `emotionIds` (multiEntry), `tags` (multiEntry) | All emotional episodes, including unfinished ones |
| `emotions` | `id` | `family` | **Custom** emotions only |
| `actions` | `id` | `category` | **Custom** action suggestions only |
| `settings` | `key` | none | Key/value preferences (theme, locale, ...) |
| `meta` | `key` | none | installId, data/library versions, last export date |

### Data models (full shapes in `src/models/typedefs.js`)

**Episode** supports everything the product requires:

- **Multiple emotions**: `emotions[] = {emotionId, intensity 0–10}`, plus optional `overallIntensity`.
- **Trigger**: `{text, occurredAt?}`.
- **Interpretations**: array of `{text, plausibility?}`. Always a *possibility*; the UI says "one way to see it".
- **Underlying needs**: `needs[]` (library keys or free text).
- **Impulses**: `impulses[] = {text, presetId?}` — what the emotion urges, captured *before* choosing.
- **Chosen responses**: `chosenResponses[] = {actionId|null, customText?, chosenAt}` (custom responses are equal citizens).
- **Outcome**: `{text?, shift?, recordedAt}` with a neutral `shift` vocabulary (`lighter | same | heavier | mixed | unsure`).
- **Reflection**: `{text?, learned?, recordedAt}`.
- **Incomplete progress**: `status` (`in_progress | completed`), `currentStep`, `completedSteps[]`. Any step can be skipped or finished later; outcome/reflection are expected to be added after the moment passes.

**Emotion** — `id, label, family, description, commonNeeds[], commonImpulses[], source, schemaVersion`.
**ActionSuggestion** — `id, label, description, category, effort, suitableFamilies[], intensityRange, source, schemaVersion`.
**Setting** — `key, value, updatedAt`.

### Migrations

`DB_VERSION` increases only when stores/indexes change; structural changes live in `src/db/migrations/NNN-description.js`, each exporting `up(db, tx)`. Record-level changes bump `schemaVersion` and are upgraded lazily on read or in a one-time pass. Before any destructive migration, the app offers/creates an export.

## 6. Emotion library (`src/data/emotions`, `src/data/actions`)

Static modules exporting frozen arrays. A `libraryService` (Stage 4) merges built-in entries with custom DB entries. Descriptions are neutral and non-diagnostic. Version number stored in `meta` lets future updates add entries safely.

## 7. Redirection engine (`src/engine/redirection`)

A **pure, rule-based** function: `suggest(draftEpisode, library, options) → RankedSuggestion[]`.

- Inputs: chosen emotions + intensities, impulses, needs, user history summary (optional), library.
- Matches actions by emotion family, intensity range and effort, and *always* keeps rest, boundaries and seeking support in the candidate set — it never assumes productivity is the right answer to sadness, anger, anxiety or grief.
- Returns suggestions with a plain-language reason ("often helpful when..."). Suggestions are optional; the engine has no "correct" answer and never labels the user.
- No diagnosis, no scoring of the user, no network, no randomness without a seed (testable).

## 8. Analytics (`src/analytics`)

Pure functions over arrays of episodes: emotion frequency, common triggers, impulse-vs-response patterns, intensity over time, completion of reflection. Design rules from the product:

- Difficult emotions are never framed as failures or negative scores.
- Being happy earns nothing; there are no points or streak penalties.
- Growth is described in terms of awareness and intention (e.g. "paused before acting"), not in terms of feeling better.

## 9. Application shell, routing, state *(implemented in Stage 2)*

- **Routes** (`app/config.js`): `#/home`, `#/new-episode`, `#/patterns`, `#/growth`, `#/settings`. An empty hash redirects to `#/home`; unknown routes show a clear "page does not exist" state.
- **Router** (`app/router.js`): pages export `render(ctx)` and an optional `destroy()`. On each navigation it tears down the previous page, shows a skeleton loader only if loading takes longer than 150 ms, renders the new page, updates `document.title`, scrolls to top and moves focus to the page's `<h1>` (marked `data-page-title`). Focus is not moved on the very first render. A guard token ignores out-of-order async results. Errors render a recoverable "could not be opened" state.
- **Store** (`app/store.js`): UI state only (`route`, `sectionTitle`, `theme`, `resolvedTheme`).
- **Shell** (`components/shell.js`): skip link, sidebar, header, `<main id="main">`, bottom nav, toast region.
- **Responsive modes** (CSS only, same markup): >= 1024 px full sidebar; 720-1023 px compact icon rail; < 720 px bottom navigation with five items. Content is capped at `--content-max` (64rem).
- **Design tokens** (`styles/tokens.css`): colors, type scale, spacing, radii, layout sizes and motion are CSS custom properties. The dark theme only overrides tokens under `[data-theme="dark"]`; no component CSS changes per theme.
- **Components**: `createButton` (button or link), `createIconButton`, `createCard`, `createField`, `createSegmented`, `openModal` / `openConfirm`, `showToast`, `createEmptyState` (with a visible placeholder tag), `createLoadingState` (spinner or skeleton).
- **Placeholders**: any content a later stage will replace is labelled in the UI with a dashed "Placeholder - arrives in Stage N" tag, so nothing appears finished that is not.
- **Settings page** includes a "Development preview" card that exercises every shared component. It is hidden or removed in Stage 9.

## 10. Offline and PWA (Stage 10)

`sw.js` precaches the app shell and assets (cache-first for static files, versioned cache names, old caches cleaned on activate). `manifest.webmanifest` provides name, icons and display mode. No runtime dependency on external hosts: fonts and icons are self-hosted in `public/assets`.

## 11. Privacy and data integrity

- No accounts, no servers, no third-party scripts or fonts.
- Data export/import (JSON) with validation and version checks in Stage 9; import never overwrites without confirmation.
- Writes go through repositories using single transactions; episode saves are atomic.
- Request persistent storage (`navigator.storage.persist()`) so the browser is less likely to evict data.

## 12. Coding conventions

- ES modules only; `const`/`let`; no globals; one responsibility per file.
- File names `kebab-case.js`; functions `camelCase`; constants `UPPER_SNAKE_CASE`; CSS classes `kebab-case` with a short prefix (`ra-`) to avoid collisions.
- Component factories named `createX`, services named `xService`, repositories named `xRepository`.
- Types via JSDoc using `src/models/typedefs.js`; every exported function has a JSDoc signature.
- Errors: services throw `Error` subclasses with user-safe messages; the UI shows them through the toast system; nothing fails silently.
- Accessibility baseline: semantic HTML, visible focus, keyboard-operable controls, `prefers-reduced-motion` and `prefers-color-scheme` respected.
- Copy: calm, plain, non-prescriptive. No exclamation-heavy or motivational language.
- No dependency is added without a written reason in this file.

### UI conventions (Stage 2)

- Never hard-code colors, sizes or radii in component CSS; use tokens.
- Breakpoints: `1024px` (rail below) and `720px` (bottom nav below). Tap targets are at least 44 px.
- Body text and controls must meet WCAG AA contrast (4.5:1) in both themes; the browser test suite verifies the token pairs.
- Animations are short and subtle, and are disabled under `prefers-reduced-motion`.
- Every control visible in the UI must work; if a feature is not built yet, show a labelled placeholder instead of a dead control.
- Pages build DOM with `h()` from `utils/dom.js`; strings become text nodes, never HTML.

## 13. How the architecture supports all ten stages

Each stage adds files behind existing boundaries: Stage 2 fills `components/pages/styles/app`; 3 fills `db`; 4 fills `data` + libraryService; 5 builds `new-episode` on episodeService; 6 fills `engine`; 7–8 fill `analytics` + pages; 9 extends `settings` + exportService; 10 adds `sw.js` + manifest. No stage requires moving or rewriting a previous layer.
