# RE:ACT — Architecture

*Feel without obeying. Understand without escaping. Act with intention.*

Status: **Stage 4 complete** (emotional episode engine). Sections marked *(implemented)* describe working code; everything else is a design contract filled in by the stage listed in ROADMAP.md.

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
  components/               (implemented) icons, button, card, input (field, select, segmented), modal, toast,
                            empty-state, loading-state, sidebar, bottom-nav, header, shell,
                            emotion-picker, episode-form, episode-item (Stage 4 feature components)
  pages/                    (implemented) home, new-episode (also edit / continue draft), episodes, episode (view),
                            patterns, growth, settings
  styles/                   (implemented) tokens.css, base.css, layout.css, components.css, pages.css
  db/                       (implemented) the ONLY code that touches IndexedDB
    index.js                Public database service: createDatabase(), the shared `database`, error re-exports
    schema.js               Declarative stores + indexes (a test compares the real database to it)
    connection.js           Open, version management, migration runner, multi-tab upgrade handling
    idb.js                  Promise helpers: runTransaction (durable, all-or-nothing), cursor collect
    errors.js               Maps raw browser errors to calm, specific errors
    migrations/             001-initial-schema.js + index.js (ordered list; one file per version)
    repositories/           episodes.js, library.js (emotions + actionLibrary), settings.js, shared.js
  models/                   (implemented) pure rules: no database, no clock, no DOM
    enums.js, typedefs.js   Vocabularies and entity shapes
    validation.js, model.js Validation primitives and the model factory (unknown/managed fields rejected)
    episode.js, library.js, setting.js   Episode, custom emotion/action, and setting rules
    episode-form.js         Pure translation between an episode record and the single-page form (Stage 4)
  services/                 (implemented) episode-service.js (drafts, finish, edit, delete, resume, counts),
                            library-service.js (built-in + custom emotions, search), settings-service.js
  utils/                    dom.js, date.js, time.js, id.js (UUIDs), equal.js, errors.js (error classes)
  data/
    emotions.js             (implemented) the 19 built-in emotions with neutral descriptions and search aliases
    actions/                Built-in action suggestions (Stage 6)
  engine/
    redirection/            Rule-based suggestion engine (Stage 6; pure functions)
  analytics/                Pure functions that derive patterns/growth from episodes (Stages 7-8)
tests/
  e2e-stage2.mjs            Stage 2 UI checks (174)
  e2e-stage3.mjs            Stage 3: runs db/db-tests.js in the browser, persistence, tabs, UI integration
  e2e-stage4.mjs            Stage 4: runs app/app-tests.js, then UI flows, restart, two tabs, unavailable storage, responsive
  db/                       In-browser test harness and the database suite
  app/                      In-browser suite for the library, episode service and form mapping
  static-server.mjs         Dependency-free static server used by the Stage 3 script
```

## 3. Layering and dependency rules

```
pages → components, services          (UI)
services → db, engine, analytics, data, utils
engine, analytics → data, models, utils   (pure; no DB, no DOM)
db → models, utils
components, pages → utils, other components, and the UI-level modules app/config and app/theme
feature components (episode-form, emotion-picker) → services too (they are page-sized composites)
models, utils, data → nothing project-internal (utils may use models)
```

Rules:

- **Only `src/db` touches IndexedDB.** Everything else calls services, which call the database service. This isolates data integrity and makes migrations safe.
- **`engine` and `analytics` are pure.** Input in, result out, no side effects. They can be tested in plain Node with no browser.
- **Pages never query the database directly.** They call services.
- **No circular imports.** Dependencies only point down the list above.
- **Feature components may call services.** `episode-form` and `emotion-picker` are page-sized composites, so they use `episodeService` / `libraryService` themselves. They still never import `src/db`. Small shared components (button, card, field...) stay free of services.
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
| Theme in the `settings` store, mirrored in `localStorage` | The theme must be applied before first paint (inline script in `index.html`), which IndexedDB cannot do synchronously. The database is the source of truth; the mirror only exists for the instant first paint. |
| Native `<dialog>` for modals | Browser-provided focus trap, Escape handling and inert background; less code and fewer accessibility bugs than a custom implementation. |
| System font stacks (serif headings, sans body) | No font files to fetch, so no network dependency; elegant serif headings via Iowan Old Style / Palatino / Georgia. |
| Page modules loaded with dynamic `import()` | Shell paints first; later stages add pages without growing the initial load. |
| Relative asset paths (`./src/...`) | App works from any folder or sub-path, which matters for hosting and for the Stage 10 service-worker scope. |

## 5. Database *(implemented in Stage 3)*

Database name `react-db`, version `1`. Declared in `src/db/schema.js`, created by `src/db/migrations/001-initial-schema.js`.

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `episodes` | `id` | `occurredAt`; `emotionIds` (multiEntry); `status_updatedAt` (`[status, updatedAt]`) | All emotional episodes, including unfinished ones |
| `emotions` | `id` | `family`; `labelKey` (**unique**) | **Custom** emotions only |
| `actionLibrary` | `id` | `category`; `labelKey` (**unique**) | **Custom** actions only |
| `settings` | `key` | none | Key/value preferences; only registered keys (currently `theme`) |

### Using it

Nothing outside `src/db` touches IndexedDB. Pages call a service; services call the database service:

```js
import { episodeService } from '../services/episode-service.js';
const draft = await episodeService.start({ emotions: [{ emotionId: 'anger', intensity: 6 }] });
await episodeService.saveProgress(draft.id, { trigger: 'A tense meeting' }, { currentStep: 'event', markStepsDone: ['emotions', 'trigger'], expectedRevision: draft.revision });
const resume = await episodeService.getResumable();   // the unfinished episode touched most recently
await episodeService.complete(draft.id);
```

`database.episodes | emotions | actionLibrary | settings` expose `create, get, getOrThrow, update, delete` (episodes add `complete, reopen, listRecent, listIncomplete, listByEmotion, listByDateRange, count, getAll`; settings are `get, getValue, set, reset, list`). **Every operation returns a promise and never throws synchronously.**

### Episode model (rules in `src/models/episode.js`, shape in `typedefs.js`)

Covers every field in the Phase 03 brief:

| Brief | Field(s) |
|---|---|
| Unique ID | `id` (random UUID) |
| Date and timestamp | `occurredAt` (when it happened; defaults to now) |
| Multiple emotions + individual intensities | `emotions: [{emotionId, intensity 1–10}]`, each emotion once; `emotionIds` derived for indexing |
| Trigger / Actual event | `trigger`, `actualEvent` (text) |
| Interpretation | `interpretations: [{text, plausibility?}]`, always possibilities |
| Underlying need | `needs: [text]` |
| Immediate impulse | `impulses: [{text, presetId?}]` |
| Chosen response + category | `chosenResponses: [{actionId|null, text, category, chosenAt}]` |
| Outcome / Reflection | `outcome {text?, shift?, recordedAt}`, `reflection {text?, learned?, recordedAt}` |
| Current workflow stage | `currentStep` (one of `EPISODE_STEPS`), plus `completedSteps` |
| Completion status | `status` (`in_progress` \| `completed`), `completedAt` |
| Creation and update timestamps | `createdAt`, `updatedAt`, plus `revision` |

The brief lists interpretation, need, impulse and response in the singular. They are stored as lists (the Stage 1 design) because they are naturally plural: several possible readings, several needs, several urges. A single value is a list of one, so nothing in the brief is lost and no later migration is needed.

### Safety guarantees (each is tested; see TESTING.md)

- **Validation before any write.** Types are never coerced (`"5"` is not 5); unknown fields and managed fields (`id`, `revision`, timestamps, `status`, `emotionIds`) are rejected; every problem is reported at once; a failed validation writes nothing.
- **Nothing is silently overwritten.** `create` refuses an existing id (checked inside the write transaction, so two simultaneous creates produce one record and one `duplicate` error). `update`, `delete`, `complete` and `reopen` on a missing record are `not-found`, never a silent success or an accidental create. Custom emotion/action names are unique (case-, spacing- and Unicode-form-insensitive) via a unique index plus a check.
- **Safe updates.** Read-modify-write happens in ONE transaction, so concurrent updates cannot lose each other's changes. Pass `expectedRevision` to refuse a change when another tab has edited the record meanwhile (`conflict`, `reason: 'stale'`). Saving identical data is a no-op (no new revision). `updatedAt` never moves backwards if the clock does.
- **Transactions.** Writes use strict durability and resolve only after the transaction has committed. Any error inside rolls back everything in that transaction.
- **Referential protection.** A custom emotion that episodes use cannot be deleted (`conflict`, `reason: 'in-use'`).
- **Incomplete episodes are first-class.** A draft can be empty and saved at any step; only completing needs data (at least one emotion). Completed episodes can still be edited (outcome and reflection often come later) and reopened.
- **Stored data is not re-judged against today's clock.** An existing `occurredAt` is only checked for "not in the future" when it is set or changed, so a corrected device clock never locks an episode.
- **Copies, not references.** Inputs are copied in and records are copied out; mutating either never changes stored data.
- **Calm errors.** `ValidationError` (code `validation`, `issues[{path,message}]`), `NotFoundError` (`not-found`), `DuplicateError` (`duplicate`), `ConflictError` (`conflict`, `details.reason` `stale` \| `in-use` \| ...), `StorageError` (`unavailable`, `quota`, `version-too-new`, `migration-failed`, `transaction`). Messages are safe to show to the person.

### Versions and migrations

`DB_VERSION` is the version of the latest migration. `src/db/migrations/index.js` lists migrations in order (versions must be 1, 2, 3... with no gaps). Each is `{version, name, up({db, transaction, oldVersion})}`; `up` runs inside the versionchange transaction and must use IndexedDB requests only. A migration that throws aborts the whole upgrade: the database stays at its old version with all data intact (tested). Opening data created by a newer app version is refused with `version-too-new` rather than risking damage. Old migrations are history: never edit one; add a new file. A test compares the migrated database with `schema.js` so they cannot drift.

If another tab upgrades the database, this tab closes its connection (so the upgrade is not blocked), reports `versionchange`, and the app tells the person to reload.

### Built-in libraries and settings

Built-in emotions ship in code (`src/data/emotions.js`) and are never copied into the database; the stores hold only the person's own additions. Episode `emotionIds` therefore refer to either a built-in key or a custom emotion's UUID, and `episodeService` refuses to store an id that is in neither. The `theme` setting lives in the `settings` store; `localStorage` keeps only a boot mirror (see `src/app/theme.js`): the database wins, except that a choice not yet confirmed by the database (page closed too fast) is flagged "pending" and wins on the next start.

### Storage persistence

`database.storage.getStatus()` and `.requestPersistence()` wrap the browser's persistent-storage API. Requesting persistence can show a browser prompt, so it is not called at start-up: `episodeService` asks once per session, after the first episode has been saved, and a refusal or error never affects saving.

## 5a. Emotional episode engine *(implemented in Stage 4)*

**Emotion library** (`src/data/emotions.js`, `src/services/library-service.js`). Nineteen built-in emotions (Anger, Anxiety, Fear, Sadness, Disappointment, Frustration, Envy, Jealousy, Guilt, Shame, Loneliness, Boredom, Overwhelm, Excitement, Joy, Peace, Gratitude, Motivation, Numbness), each with a neutral, tentative description, a descriptive family and search aliases. Built-in ids are stable keys stored inside episodes: never rename or remove one. `libraryService` merges them with the person's own emotions (the `emotions` store): `listEmotions`, `getEmotionMap`, `createEmotion`, `deleteEmotion`, `assertEmotionsExist`, and the pure `searchEmotions` (case-, accent- and spacing-insensitive; matches name, aliases and description; the best name match comes first). A custom name cannot repeat a built-in or another custom one. A custom emotion used by any episode cannot be deleted.

**Episode service** (`src/services/episode-service.js`):

| Call | Meaning |
|---|---|
| `saveDraft({id?, fields, expectedRevision?})` | Create (no id) or update an unfinished episode. Identical content changes nothing (no new revision), so autosave never churns the record. |
| `finish({id?, fields, expectedRevision?})` | Save and complete (needs one emotion). For an existing draft, the last edit and the completion are ONE transaction. A new episode is created first; if completion is refused the words are kept as a draft. |
| `saveChanges(id, fields, {expectedRevision})` | Edit an episode without changing whether it is complete. |
| `remove(id, {expectedRevision})`, `get`, `listRecent({limit, offset, status})`, `getResumable()`, `counts()` | Delete (a missing or stale episode is an error, never silent), read, list, "continue where you left off", counts. |

All of them refuse unknown emotion ids. `start` / `saveProgress` (Stage 3) remain for the guided workflow.

**Single-page form** (`components/episode-form.js`, `components/emotion-picker.js`, `models/episode-form.js`). The form holds plain text for each box; `formToFields` / `episodeToForm` translate to and from the episode. Each box edits the FIRST item of its list (interpretation, need, impulse, chosen response); any further items, a plausibility rating, a preset id and the "learned" note on a reflection are preserved untouched, so nothing the form cannot show is lost. `recordedAt` / `chosenAt` stamps are preserved while content is unchanged.

- Intensity is a whole number 1–10 per emotion (default 5). Removing an emotion and choosing it again starts at 5 again.
- **Drafts autosave.** A new or unfinished episode saves about a second after typing stops, when the page is left, and when the tab is hidden. After the first save the address becomes `#/edit-episode?id=...`, so a refresh reopens the draft. The status line says what happened ("Draft saved at 13:24", "Not saved. ...").
- **Completed episodes are not autosaved.** Changes apply only on "Save changes"; leaving with unsaved changes asks first (Cancel) or triggers the browser's own warning (closing the tab).
- **No silent overwrite.** Every save carries the revision it was based on. If another tab changed the episode, this page stops saving, keeps the typed text on screen and says so in plain words.
- Saves run one at a time, in order, so two quick saves can never create two records.
- Validation problems come back as issues and are shown next to the box they belong to.

**Pages.** `#/new-episode` (a blank form, with a gentle offer to continue an existing draft), `#/edit-episode?id=` (continue a draft or edit a completed episode), `#/episode?id=` (read, with Edit / Delete), `#/episodes[?status=completed|in_progress]` (all episodes, 20 at a time, status filter). Home shows the five most recent episodes, the counts (total, completed, drafts), and a card to continue the newest draft. Settings lists the person's own emotions with Delete (refused with an explanation while in use).

**Known behaviours.** A page shows what was in the database when it opened: changes made in another tab appear after navigating or reloading. Deleting asks for confirmation and cannot be undone.

## 6. Libraries (`src/data`)

Static modules exporting frozen arrays. Emotions are implemented (see 5a). Built-in action suggestions arrive with the redirection engine (Stage 6) and use the same pattern: code-defined entries, stable ids, plus the person's own additions in the `actionLibrary` store. Descriptions are neutral and non-diagnostic. New built-in entries can be added by an app update without touching stored data.

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

- **Routes** (`app/config.js`): navigation items `#/home`, `#/new-episode`, `#/patterns`, `#/growth`, `#/settings`, plus hidden routes (`hidden: true`, no navigation item) `#/edit-episode`, `#/episodes`, `#/episode`. Hidden routes take their data from the query string (`#/episode?id=...`); pages read it with `getRouteParams()`, and `replaceRoute()` updates the address without a navigation. A page is only re-opened when the address changes. An empty hash redirects to `#/home`; unknown routes show a clear "page does not exist" state.
- **Router** (`app/router.js`): pages export `render(ctx)` and an optional `destroy()`. On each navigation it tears down the previous page, shows a skeleton loader only if loading takes longer than 150 ms, renders the new page, updates `document.title`, scrolls to top and moves focus to the page's `<h1>` (marked `data-page-title`). Focus is not moved on the very first render. A guard token ignores out-of-order async results. Errors render a recoverable "could not be opened" state.
- **Store** (`app/store.js`): UI state only (`route`, `sectionTitle`, `theme`, `resolvedTheme`).
- **Shell** (`components/shell.js`): skip link, sidebar, header, `<main id="main">`, bottom nav, toast region.
- **Responsive modes** (CSS only, same markup): >= 1024 px full sidebar; 720-1023 px compact icon rail; < 720 px bottom navigation with five items. Content is capped at `--content-max` (64rem).
- **Design tokens** (`styles/tokens.css`): colors, type scale, spacing, radii, layout sizes and motion are CSS custom properties. The dark theme only overrides tokens under `[data-theme="dark"]`; no component CSS changes per theme.
- **Components**: `createButton` (button or link), `createIconButton`, `createCard`, `createField`, `createSegmented`, `openModal` / `openConfirm`, `showToast`, `createEmptyState` (with a visible placeholder tag), `createLoadingState` (spinner or skeleton).
- **Placeholders**: any content a later stage will replace is labelled in the UI with a dashed "Placeholder - arrives in Stage N" tag, so nothing appears finished that is not. (Home no longer has any; My Patterns and My Growth still do.)
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

Each stage adds files behind existing boundaries: Stage 2 fills `components/pages/styles/app`; 3 fills `db`; 4 fills `data/emotions.js`, libraryService and the single-page episode form; 5 replaces the form's body with the guided workflow on the same services; 6 fills `engine` and the action library; 7–8 fill `analytics` + pages; 9 extends `settings` + exportService; 10 adds `sw.js` + manifest. No stage requires moving or rewriting a previous layer.
