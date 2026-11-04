# Changelog

All notable changes per development stage. Format loosely follows Keep a Changelog.

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
