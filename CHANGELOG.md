# Changelog

All notable changes per development stage. Format loosely follows Keep a Changelog.

## [Stage 3] — 2026-11-05 — Database & Persistence

### Added
- **Database service (`src/db`)** — the only code that touches IndexedDB. Database `react-db` v1 with stores `episodes`, `emotions`, `actionLibrary`, `settings`. Versioned migration runner (ordered, no gaps, atomic: a failing migration rolls back and keeps the old version and data), refusal to open data from a newer app version, and handling of upgrades from another tab.
- **Models (`src/models`)** — pure validation for episodes, custom emotions, custom actions and settings: no type coercion, unknown and managed fields rejected, all problems reported at once.
- **Repositories** — create/get/update/delete for every store; episodes also `complete`, `reopen`, `listRecent`, `listIncomplete`, `listByEmotion`, `listByDateRange`, `count`, `getAll`. Every call returns a promise and never throws synchronously.
- **Safety** — duplicate prevention (`add`, never `put`, checked inside the transaction); no silent overwrite; revision counter with optional `expectedRevision` (stale saves are refused); single-transaction read-modify-write so concurrent updates cannot lose each other's changes; unique names for custom emotions/actions; custom emotions in use by episodes cannot be deleted; calm, specific errors.
- **Services** — `episode-service` (start, saveProgress, complete, reopen, getResumable, listIncomplete, listRecent, counts) so unfinished episodes are saved and resumed across sessions; `settings-service`.
- **Storage helpers** — `database.storage.getStatus()` and `requestPersistence()` (not called yet; see ROADMAP).
- **Settings page** — "Local storage" status row.
- Tests: `tests/e2e-stage3.mjs`, `tests/db/` (80 in-browser database tests), `tests/static-server.mjs`.
- Utilities: `utils/errors.js`, `utils/id.js`, `utils/time.js`, `utils/equal.js`.

### Changed
- Theme preference: the `settings` store is now the source of truth; `localStorage` remains only as a boot mirror for the pre-paint script. A choice that never reached the database is kept (pending flag) and wins at next start; a Stage 2 mirror is migrated into the database.
- `main.js`: database opens in the background after the shell is up; storage problems produce a calm notice and the app keeps working for the session.
- New Episode step list gained "Note what actually happened, apart from what it meant" (`event` step); action categories gained `other`.
- `APP_VERSION` 0.3.0, `APP_STAGE` 3. `typedefs.js` rewritten to match the real models.

### Fixed during the stage (found by testing)
- An existing episode's `occurredAt` was re-checked against today's clock on every edit, so correcting a device clock backwards would have blocked editing and completing episodes. It is now only checked when set or changed.
- `create()` threw synchronously on invalid input, which breaks `.catch()` and `Promise.all`. All repository methods now return rejected promises.

### Reconciliations with the brief
- Store `actions` (Stage 1 design) renamed `actionLibrary`; unused `meta` store dropped. Safe: no database had ever been created, so no migration was needed.
- The brief's singular interpretation / need / impulse / chosen response are stored as lists (`interpretations`, `needs`, `impulses`, `chosenResponses` with a `category` each). A single value is a list of one.
- Kept from Stage 1: `tags`, `overallIntensity`.

### Incident
- Earlier, interrupted Stage 3 attempts had left partial files; some (`utils/errors.js`, `utils/id.js`, `utils/date.js`) were overwritten by mistake. They were recovered from the session record and the Stage 2 archive, and dead leftovers (`models/entity.js`, `models/errors.js`, `.gitkeep` files) were deleted. The full suites pass on the restored tree.

### Known limitations
- Tested in Chrome only. Emotion ids are not yet checked against the library (Stage 4). Persistence is not requested yet (Stage 5). Record-level `schemaVersion` upgrades are not implemented; only structural migrations are.

## [Stage 2] — 2026-11-04 — Design System & Application Shell

### Added
- **Design system:** `tokens.css` (light and dark themes, type scale, spacing, radii, motion), `base.css`, `layout.css`, `components.css`, `pages.css`. System font stacks only (no network fonts).
- **App core:** `app/config.js` (routes), `app/store.js`, `app/theme.js` (system / light / dark), `app/router.js` (hash router, lazy pages, focus and title handling, error and not-found states).
- **Utilities:** `utils/dom.js` (safe DOM builder), `utils/date.js` (greeting, long date, day of year).
- **Components:** icons, button / icon button, card, field, segmented control, modal and confirm (native `<dialog>`), toast system, empty state, loading state (spinner and skeleton), sidebar, bottom navigation, header, shell.
- **Pages:** Home (greeting, current date, prominent New Episode button, recent-episodes and emotional-development placeholders, daily reminder), New Episode, My Patterns, My Growth (labelled placeholders), Settings (working theme control, About, development component preview).
- **Responsive layouts:** full sidebar (>= 1024 px), icon rail (720-1023 px), bottom navigation (< 720 px).
- **Accessibility:** skip link, landmarks, `aria-current`, focus moved to the page heading on navigation, focus-visible outlines, reduced-motion support, 44 px touch targets on mobile.
- `tests/e2e-stage2.mjs`: browser test script (174 checks).
- Inline SVG favicon (avoids a 404 for `favicon.ico`).

### Changed
- `index.html`: stylesheet links, pre-paint theme script, theme-color meta, favicon.
- `src/main.js`: boot sequence implemented (theme, shell, router).
- Docs updated: README, ROADMAP, ARCHITECTURE, TESTING.

### Fixed during the stage (found by testing)
- Home hero text was pushed to the right inside its card (card column layout inherited).
- Mobile header showed "RE:" instead of "RE:ACT".
- Light-theme `--earth` color failed AA contrast (4.33:1); darkened to `#855d3f` (5.68:1).
- Browser requested a missing `favicon.ico`.
- Orphaned words in the reminder and placeholder tags (`text-wrap: balance`).

### Known limitations
- Theme preference uses interim `localStorage`; it moves to the settings store in Stage 3.
- The Home date and greeting are computed when the page renders and do not update while it stays open past midnight.
- Clicking the already-active navigation item does nothing.
- No service worker yet: the app needs the local server until Stage 10.

## [Stage 1] — 2026-11-04 — Project Initialization

### Added
- Project directory structure: `app`, `components`, `pages`, `styles`, `db`, `models`, `services`, `utils`, `data/emotions`, `data/actions`, `engine/redirection`, `analytics`, `public/assets`.
- `index.html` entry document and `src/main.js` entry-point contract (no behaviour yet).
- `package.json` with `"type": "module"` and zero dependencies.
- `src/db/schema.js`: declarative IndexedDB schema (`episodes`, `emotions`, `actions`, `settings`, `meta`) with indexes.
- `src/models/enums.js`: controlled vocabularies (episode status/steps, emotion families, action categories, effort, outcome shift, source).
- `src/models/typedefs.js`: JSDoc models for Episode, Emotion, ActionSuggestion, Setting and their sub-structures.
- Documentation: `README.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `TESTING.md`.

### Decisions
- Vanilla JS + ES modules, no build step, no dependencies.
- Built-in emotion/action libraries live in code; the database stores only custom entries.
- Episode stored as a single document; `emotionIds` denormalised for indexing.
- Analytics derived on demand; no stored aggregates.
- Hash routing; pure `engine` and `analytics` layers; only `db` touches IndexedDB.

### Not changed / not implemented
- No UI, database connection, episode logic, service worker or manifest (scheduled for later stages).
