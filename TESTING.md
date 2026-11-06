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

## Stage 3 — Database & Persistence (2026-11-05)

Environment: Chrome for Testing 153 driven by playwright-core, real IndexedDB, a local static server. Chrome only.
Run: `tests/e2e-stage3.mjs`. Final result: **110 / 110 checks passed** (80 in-browser database tests + 30 persistence / UI / tab / unavailable-storage checks). Stage 2 regression: **174 / 174 passed**.

### Brief-required tests
| Test | What was done | Result |
|---|---|---|
| Create record | Episodes, custom emotions, custom actions, settings created; ids unique; defaults and timestamps set | Pass |
| Read record | get / getOrThrow, lists, filters, 200-episode volume; returned copies cannot alter stored data | Pass |
| Update record | Partial updates, whole-record validation, no-op keeps revision, `updatedAt` never goes backwards | Pass |
| Delete record | Delete, delete of missing id (not-found), in-use custom emotion refused | Pass |
| Duplicate prevention | Same id twice, simultaneous creates (one wins), duplicate custom names in different case/spacing, duplicate emotion in one episode | Pass |
| Refresh persistence | Data written, page reloaded, data identical | Pass |
| Incomplete-episode persistence | Draft saved mid-flow, survives refresh, a full browser restart and a second restart; resumes at the saved step | Pass |

### Further coverage
Initialisation and schema-drift check; migration v1→v2; failing migration rolls back and keeps data; newer-version database refused; upgrade from another tab; IndexedDB unavailable; error mapping; a 27-case validation table; stale save refused with `expectedRevision` (also across two real tabs); concurrent updates with no lost changes; transaction rollback; complete / reopen; settings (unknown keys rejected, reset); storage helpers; UI: real database with four stores, theme saved to it, DB beats mirror, pending recovery, legacy mirror migration, upgrade toast, storage-unavailable notice.

### Mutation checks (proving the tests can fail)
Removing the duplicate guard, disabling `expectedRevision` and disabling transaction rollback were each caught by the suite. Source was restored and the suite returned to 110 / 110.

### Defects found by testing and fixed
1. `occurredAt` re-validated against the current clock on every edit (a clock corrected backwards would block edits).
2. `create()` threw synchronously instead of returning a rejected promise.

### Not tested (and why)
Firefox, Safari, Edge and real phones/tablets (only Chrome available); browser storage eviction and the persistence prompt (`requestPersistence` is not called yet); very large datasets beyond 200 episodes; private-browsing modes other than simulated unavailability; low-disk quota exhaustion (error mapping tested, real quota not reached).

## Stage 4 — Emotional Episode Engine (2026-11-06)

Environment: Chrome for Testing 153 driven by playwright-core; real IndexedDB; every UI flow uses a fresh browser context (an empty database) unless it is about persistence.
Run: `tests/e2e-stage4.mjs`. Final result: **206 / 206 checks passed** (31 app-suite checks: 30 in-browser tests plus a no-uncaught-errors check; 175 UI / persistence / layout checks). Regression: Stage 3 script **111 / 111**, Stage 2 script **174 / 174** (after updating its Home expectations, see below).

### Requested coverage
| Area | What was checked | Result |
|---|---|---|
| Emotion library | Exactly the 19 requested emotions; each has a unique id, valid family and a tentative, non-diagnostic description; chips are labelled toggle buttons | Pass |
| Search | By name, similar word, description word, any case, accents, several words; no match gives a calm message; clearing restores all 19; best name match first | Pass |
| Multiple emotions | Selecting several, deselecting by chip or Remove, all 19 at once through the service, order kept | Pass |
| Custom emotions | Add with name, description, group; empty name refused; repeat of a built-in refused; repeat of your own in any case/spacing refused; selected straight away; found by search; survives refresh; used in an episode; Settings lists it; deleting is refused while an episode uses it and allowed once unused | Pass |
| Intensity | 1–10 whole numbers, default 5, independent per emotion, keyboard (Home / End / arrows), stops at 1 and 10, also shown as text ("7 of 10"); 0, 11, fractions, text refused by the model and service | Pass |
| Create | Full form through the UI; all ten parts stored; Arabic, emoji and markup-like text stored exactly | Pass |
| View | All parts shown with emotion descriptions; missing / invalid ids handled | Pass |
| Edit | Values load; Save changes stores text, intensity and an added emotion and keeps the episode completed; unseen details (the "learned" note, exact seconds of the time) are kept; removing every emotion or a future date is refused with a message beside the box; Cancel with changes asks first | Pass |
| Delete | Asks first and says it cannot be undone; "Keep it" changes nothing; confirming removes it from the database; stays deleted after refresh; deleted links show "does not exist"; a stale delete (changed in another tab) is refused | Pass |
| Save draft / resume | Autosave after a pause; address becomes the draft's; refresh reopens it with every value; Home and New Episode offer to continue; leaving the page right after typing still saves; saving without an emotion is refused kindly and stays a draft; completing the draft keeps the same record | Pass |
| Draft recovery | Draft survives a page refresh and a **full browser restart** with all typed values and emotions | Pass |
| Home | Real recent episodes (newest by when they happened) and counts (total / completed / drafts) update after saving, completing and deleting; continue-draft card appears and disappears; empty and error states | Pass |
| Every operation persists | Checked against the database itself (not only the screen) after each operation | Pass |

### Further checks
Two tabs: a stale tab stops, explains and keeps the typed text; nothing is overwritten (also on explicit Save). Storage unavailable: Home, the form and Save draft all behave calmly (text stays, "Not saved" shown), no uncaught errors. Responsive: desktop 1440, tablet 768 and phone 390 in light and dark, with real episodes: no horizontal scrolling on Home, All episodes, the episode page and the form; the save bar is fully visible and not covered by the bottom navigation; its buttons are at least 44 px tall. Persistent storage is requested exactly once after the first save, and a failure never blocks saving. Paging: 26 episodes show 20, then 6 more, no duplicates; filters; a filtered address opens filtered.

### Mutation checks (proving the tests can fail)
Each break below was caught, then the source was restored (byte-identical) and the suites returned to green: skipping the unknown-emotion check; allowing a custom emotion with a built-in name; changing the intensity floor to 0; changing the intensity ceiling to 11. **Not done:** mutation checks on the UI layer (autosave, the stale-tab guard); those are covered by passing tests but not shown to fail when broken.

### Defects found by testing and fixed
1. Elements with a display rule ignored `hidden`: an empty list still showed "Show more" (fixed globally in `base.css`).
2. Search results were not ordered by relevance (fixed in the picker).

### Test-script mistakes found and corrected (not app defects)
Several expectations written earlier were wrong, and were corrected after confirming the app was right: Home does not re-open when the address is unchanged; a re-selected emotion restarts at 5 (so 5 + 1 = 6, not 4 + 1); a toast from an earlier action was matched instead of the new one; navigation timing; clicking a radio's label text (use the input); a wrong label ("Body or movement"). The Stage 2 script was updated because the Home placeholders it asserted were replaced as requested, and its "Back to Home" link no longer exists (it uses the sidebar).

### Not tested (and why)
Firefox, Safari, Edge and real phones or tablets (only Chrome is available here); screen readers (accessibility is built on native controls and labels, and checked structurally, not by listening); very large histories beyond 26 episodes in the UI (200 in the Stage 3 database suite); browser storage eviction and the persistence prompt itself; browser-native "leave page?" dialogs.

## Template for future stages

| ID | Test | Method | Result |
|---|---|---|---|
| | | | Pass / Fail / Not run |

For each stage record: scope tested, environment (browser/version, viewport sizes), steps, actual result, defects found, and the fix reference.
