# RE:ACT — Testing

Only tests that were actually executed are marked as passed. Anything not run is listed under "Not tested".

## Stage 1 — Project Initialization (2026-11-04)

Environment: Linux shell, Node.js (command-line checks only). No browser was used.

| ID | Test | Method | Result |
|---|---|---|---|
| T1 | Required files exist (5 docs, `index.html`, `package.json`, `src/main.js`, schema, enums, typedefs) | Shell existence check | Pass for all files. `TESTING.md` was reported missing on the first run only because it had not been written yet; re-verified after creation (see T7). |
| T2 | Required directories exist (app, components, pages, styles, db/migrations, services, utils, models, data/emotions, data/actions, engine/redirection, analytics, public/assets) | Shell existence check | Pass |
| T3 | JavaScript syntax valid | `node --check` on all four `.js` files | Pass |
| T4 | Modules import without error; schema is internally consistent | Node ESM import and assertions: store names match `STORES` and are unique; `DB_VERSION` is an integer ≥ 1; episode index names unique; `status` index present; `emotionIds` is multiEntry; `EPISODE_STEPS` unique (8 steps); enums and `STORES` frozen | Pass |
| T5 | No dependencies introduced | Read `package.json` | Pass (0 dependencies, 0 devDependencies, `"type": "module"`) |
| T6 | `index.html` has mount point and module entry | `grep` for `id="app"` and `type="module"` | Pass |
| T7 | `TESTING.md` exists | Created after the test run; existence re-checked with a shell test | Pass |

### Not tested (and why)
- Loading `index.html` in a real browser: the page is intentionally blank in Stage 1, so there is nothing meaningful to observe.
- IndexedDB creation from `schema.js`: the database opener is a Stage 3 deliverable. In Stage 1 only the declarative definition was verified.
- Responsive layouts, themes, navigation, accessibility: Stage 2 onward.

## Stage 2 — Design System & Application Shell (2026-11-04)

**Method:** automated browser run, `tests/e2e-stage2.mjs`, using Google Chrome for Testing 153 (headless) driven by playwright-core, against the project served by `python3 -m http.server`. **Result of the final run: 174 / 174 checks passed** (138 per-viewport checks + 36 functional/other checks). Screenshots of Home and Settings in light and dark at 1440, 820 and 390 px were produced and inspected by eye.

Run it yourself (see the header of the script for details):

```bash
python3 -m http.server 8765 &
CHROME=/usr/bin/google-chrome PLAYWRIGHT_CORE=/path/to/node_modules BASE_URL=http://127.0.0.1:8765 node tests/e2e-stage2.mjs
```

### Responsive layouts — 8 viewport sizes, each tested
Sizes: 1440, 1024 (desktop); 820, 768, 720 (tablet); 719, 390, 360 (mobile).

| Check (run at every size) | Result |
|---|---|
| Loads and redirects an empty hash to `#/home`; greeting rendered | Pass (8/8) |
| Correct navigation mode: full sidebar >= 1024, icon rail 720–1023 (labels hidden), bottom nav < 720 | Pass (8/8) |
| Home hero text sits at the left of its card | Pass (8/8) |
| Each of the 5 nav items navigates; heading, `aria-current`, document title and focus-on-heading are correct | Pass (40/40) |
| No horizontal overflow on any of the 5 pages | Pass (40/40) |
| No console errors, page errors or failed requests | Pass (8/8) |
| No network request leaves the local server | Pass (8/8) |
| Mobile only (719, 390, 360): bottom-nav tap targets >= 44 px; labels fit; bar pinned to the viewport bottom; last content not hidden behind the bar; toasts sit above the bar; header shows "RE:ACT" | Pass (3/3 sizes) |

### Functional checks (desktop 1440)
| Area | Result |
|---|---|
| Home: greeting, current date (matches the browser's date), New Episode CTA, placeholders labelled "Placeholder", reminder present | Pass |
| New Episode CTA navigates; Back to Home works; brand link works; browser back / forward work | Pass |
| Unknown route shows a clear message; "Go to Home" works | Pass |
| Keyboard: first Tab is the skip link; Enter moves focus to main without changing the route | Pass |
| Theme: header toggle flips and stores the choice; label names the next action; persists after reload | Pass |
| Settings: segmented control reflects the theme, follows the header toggle, Light / Dark apply, "System" follows the device and reacts live | Pass |
| Toasts: four tones, max 3 visible, live region, dismiss button, auto-dismiss after ~5 s | Pass |
| Modal: accessible name, Escape closes and returns focus to the opener, backdrop click closes, close button closes, focus stays inside while open | Pass |
| Confirm dialog: Confirm and Cancel paths each produce the right result | Pass |
| Field: error shown with `aria-invalid` when empty, cleared when filled | Pass |
| Loading state: skeleton shows (with `role="status"`), then resolves | Pass |
| No link without a destination on any page | Pass |
| Reduced motion: animations effectively disabled | Pass |
| Contrast: 11 token pairs meet WCAG AA 4.5:1, light and dark | Pass (both) |

### Regression (Stage 1 foundations)
| Check | Result |
|---|---|
| Schema and enums still import and are consistent (stores, `DB_VERSION`, `emotionIds` multiEntry index, 8 episode steps, frozen enums) | Pass |
| All `src/**/*.js` files and the test script parse (`node --check`) | Pass |

### Defects found by testing and fixed during the stage
| Defect | Found by | Fix |
|---|---|---|
| Home hero text pushed to the right half of the card (tablet and desktop) | Visual inspection (automated checks had not covered it) | `flex-direction: row` on `.ra-hero`; regression check added |
| Mobile header showed "RE:" instead of "RE:ACT" | Visual inspection | Show the full wordmark in the mobile header; regression check added |
| Light-theme `--earth` contrast 4.33:1 (below AA) | Contrast check | Darkened to `#855d3f` (5.68:1 on raised surface) |
| 404 for `/favicon.ico` logged as a console error | Console-error check | Inline SVG favicon |
| One-word orphans in the reminder and placeholder tags | Visual inspection | `text-wrap: balance` |
| (Test bugs, not app bugs) brand link and Home nav link shared an href; "Home" focus check ignored that Home is already active on load; keyboard test did not start from a fresh page | First runs | Test script corrected |

### Not tested (and why)
- **Other browsers:** only Chrome (Chromium 153) was used. Firefox and Safari were not run. The segmented control uses `:has()`, native `<dialog>` and `text-wrap: balance`, which current Firefox and Safari support, but this was not verified here.
- **Real devices and touch input:** mobile layouts were tested with emulated viewport sizes, not on physical phones or tablets.
- **Screen readers:** semantics (landmarks, labels, `aria-current`, live regions, focus handling) were checked programmatically, not with NVDA, VoiceOver or TalkBack.
- **Truly offline operation:** the app makes no external requests, but there is no service worker yet (Stage 10), so it still needs the local server.
- **Midnight rollover:** the Home date and greeting are computed at render time and were not tested across a date change.
- **Full-page screenshots:** the fixed bottom bar appears mid-image in stitched full-page mobile screenshots; the pinned-position check above confirms it sits at the bottom of the real viewport.

## Template for future stages

| ID | Test | Method | Result |
|---|---|---|---|
| | | | Pass / Fail / Not run |

For each stage record: scope tested, environment (browser/version, viewport sizes), steps, actual result, defects found, and the fix reference.
