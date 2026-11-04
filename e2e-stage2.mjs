/**
 * Stage 2 browser checks (shell, navigation, components, responsive layout, themes).
 *
 * Not part of the app and not a dependency of it. It needs a Chrome binary and playwright-core:
 *   CHROME=/usr/bin/google-chrome PLAYWRIGHT_CORE=/opt/npm-tools/node_modules \
 *   BASE_URL=http://localhost:8765 SHOTS=/some/dir node tests/e2e-stage2.mjs
 * Serve the project root first, e.g.  python3 -m http.server 8765
 * Exit code is non-zero if any check fails.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(`${process.env.PLAYWRIGHT_CORE || '/opt/npm-tools/node_modules'}/x.js`);
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://localhost:8765';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const SHOTS = process.env.SHOTS || './shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  -> ${detail}` : ''}`);
};

const ROUTES = [
  { path: 'home', heading: /^Good (morning|afternoon|evening)$/, title: 'Home' },
  { path: 'new-episode', heading: /^New Episode$/, title: 'New Episode' },
  { path: 'patterns', heading: /^My Patterns$/, title: 'My Patterns' },
  { path: 'growth', heading: /^My Growth$/, title: 'My Growth' },
  { path: 'settings', heading: /^Settings$/, title: 'Settings' },
];

const VIEWPORTS = [
  { name: 'desktop-1440', w: 1440, h: 900, mode: 'desktop' },
  { name: 'desktop-1024', w: 1024, h: 768, mode: 'desktop' },
  { name: 'tablet-820', w: 820, h: 1180, mode: 'tablet' },
  { name: 'tablet-768', w: 768, h: 1024, mode: 'tablet' },
  { name: 'tablet-720', w: 720, h: 900, mode: 'tablet' },
  { name: 'mobile-719', w: 719, h: 900, mode: 'mobile' },
  { name: 'mobile-390', w: 390, h: 844, mode: 'mobile' },
  { name: 'mobile-360', w: 360, h: 740, mode: 'mobile' },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

async function newPage(viewport, { colorScheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h }, colorScheme, reducedMotion });
  const page = await context.newPage();
  page.__errors = [];
  page.__requests = [];
  page.on('console', (m) => m.type() === 'error' && page.__errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.__errors.push(`requestfailed: ${r.url()}`));
  page.on('request', (r) => page.__requests.push(r.url()));
  return page;
}

const headingText = (page) => page.evaluate(() => document.querySelector('[data-page-title]')?.textContent?.trim() ?? null);

async function waitForHeading(page, regex) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const text = await headingText(page);
    if (text && regex.test(text)) return text;
    await page.waitForTimeout(40);
  }
  return await headingText(page);
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ---------- Per-viewport layout + navigation ---------- */
for (const vp of VIEWPORTS) {
  const page = await newPage(vp);
  await page.goto(`${BASE}/index.html`);
  const first = await waitForHeading(page, ROUTES[0].heading);
  check(`[${vp.name}] loads and redirects to #/home`, page.url().endsWith('#/home') && ROUTES[0].heading.test(first || ''), `url=${page.url()} h1=${first}`);

  const sidebarVisible = await page.locator('.ra-sidebar').isVisible();
  const bottomVisible = await page.locator('.ra-bottomnav').isVisible();
  const labelsVisible = await page.locator('.ra-nav__label').first().isVisible();
  const expected = { desktop: [true, false, true], tablet: [true, false, false], mobile: [false, true, false] }[vp.mode];
  check(`[${vp.name}] navigation mode = ${vp.mode}`, sidebarVisible === expected[0] && bottomVisible === expected[1] && labelsVisible === expected[2], `sidebar=${sidebarVisible} bottom=${bottomVisible} labels=${labelsVisible}`);

  const heroOffset = await page.evaluate(() => document.querySelector('.ra-hero__text').getBoundingClientRect().left - document.querySelector('.ra-hero').getBoundingClientRect().left);
  check(`[${vp.name}] home hero text is left-aligned inside its card`, heroOffset <= 80, `offset=${Math.round(heroOffset)}px`);
  if (vp.mode === 'mobile') {
    const brand = await page.locator('.ra-header__brand').innerText();
    check(`[${vp.name}] mobile header shows the full name`, brand.replace(/\s/g, '') === 'RE:ACT', brand);
  }

  const navScope = vp.mode === 'mobile' ? '.ra-bottomnav' : '.ra-nav';
  for (const route of ROUTES) {
    await page.locator(`${navScope} a[href="#/${route.path}"]`).click();
    const text = await waitForHeading(page, route.heading);
    const current = await page.locator(`${navScope} a[aria-current="page"]`).getAttribute('href');
    const docTitle = await page.title();
    const focusOnHeading = await page.evaluate(() => document.activeElement?.hasAttribute('data-page-title') ?? false);
    check(
      `[${vp.name}] nav -> ${route.title} (heading, aria-current, title, focus)`,
      route.heading.test(text || '') && current === `#/${route.path}` && docTitle === `${route.title} · RE:ACT` && (route.path === 'home' || focusOnHeading), // Home is already active on load, so clicking it makes no route change
      `h1=${text} current=${current} title=${docTitle} focus=${focusOnHeading}`,
    );
    const over = await overflow(page);
    check(`[${vp.name}] no horizontal overflow on ${route.title}`, over <= 0, `overflow=${over}px`);
  }

  if (vp.mode === 'mobile') {
    const sizes = await page.$$eval('.ra-bottomnav a', (as) => as.map((a) => a.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]));
    check(`[${vp.name}] bottom-nav touch targets >= 44px`, sizes.length === 5 && sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(sizes));
    const clipped = await page.evaluate(() => {
      const nav = document.querySelector('.ra-bottomnav').getBoundingClientRect();
      return [...document.querySelectorAll('.ra-bottomnav a span')].some((s) => s.getBoundingClientRect().right > nav.right + 0.5 || s.getBoundingClientRect().left < nav.left - 0.5);
    });
    check(`[${vp.name}] bottom-nav labels fit`, !clipped);
    // Currently on Settings (the longest page): bottom bar is pinned, covers nothing, and toasts clear it.
    const pinned = await page.evaluate(() => Math.abs(document.querySelector('.ra-bottomnav').getBoundingClientRect().bottom - window.innerHeight) <= 1);
    check(`[${vp.name}] bottom-nav is pinned to the bottom of the viewport`, pinned);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const clearOfNav = await page.evaluate(() => {
      const last = document.querySelector('.ra-main').lastElementChild.getBoundingClientRect().bottom;
      return last <= document.querySelector('.ra-bottomnav').getBoundingClientRect().top + 0.5;
    });
    check(`[${vp.name}] last content is not hidden behind the bottom nav`, clearOfNav);
    await page.getByRole('button', { name: 'Neutral', exact: true }).click();
    const toastClear = await page.evaluate(() => document.querySelector('.ra-toast').getBoundingClientRect().bottom <= document.querySelector('.ra-bottomnav').getBoundingClientRect().top + 0.5);
    check(`[${vp.name}] toasts sit above the bottom nav`, toastClear);
  }

  check(`[${vp.name}] no console errors / failed requests`, page.__errors.length === 0, page.__errors.join(' | '));
  const external = page.__requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:'));
  check(`[${vp.name}] no requests leave localhost (offline-capable)`, external.length === 0, external.join(', '));
  await page.context().close();
}

/* ---------- Screenshots (light + dark) for visual review ---------- */
for (const vp of VIEWPORTS.filter((v) => ['desktop-1440', 'tablet-820', 'mobile-390'].includes(v.name))) {
  for (const scheme of ['light', 'dark']) {
    const page = await newPage(vp, { colorScheme: scheme });
    await page.goto(`${BASE}/index.html#/home`);
    await waitForHeading(page, ROUTES[0].heading);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-${scheme}-home.png`, fullPage: true });
    await page.goto(`${BASE}/index.html#/settings`);
    await waitForHeading(page, /^Settings$/);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-${scheme}-settings.png`, fullPage: true });
    await page.context().close();
  }
}

/* ---------- Functional checks (desktop) ---------- */
{
  const vp = VIEWPORTS[0];
  const page = await newPage(vp);
  await page.goto(`${BASE}/index.html`);
  await waitForHeading(page, ROUTES[0].heading);

  // Home content
  const homeText = await page.locator('.ra-main').innerText();
  check('Home: greeting, date, CTA, placeholders, reminder present', /Good (morning|afternoon|evening)/.test(homeText) && /20\d\d/.test(homeText) && /Recent episodes/.test(homeText) && /Emotional development/.test(homeText) && (await page.locator('.ra-reminder__text').innerText()).length > 20);
  const placeholders = await page.locator('.ra-tag').allInnerTexts();
  check('Home: placeholders are visibly labelled', placeholders.length === 2 && placeholders.every((t) => /Placeholder/.test(t)), placeholders.join(' | '));
  const dateShown = await page.locator('.ra-hero__date').innerText();
  const dateExpected = await page.evaluate(() => new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  check('Home: shows the current date', dateShown === dateExpected, `${dateShown} vs ${dateExpected}`);

  // CTA
  await page.getByRole('link', { name: 'New Episode', exact: true }).first().click();
  check('Home: New Episode CTA navigates', (await waitForHeading(page, /^New Episode$/)) === 'New Episode' && page.url().endsWith('#/new-episode'));
  await page.getByRole('link', { name: 'Back to Home' }).click();
  check('New Episode: Back to Home works', /^Good/.test((await waitForHeading(page, /^Good/)) || ''));

  // Browser back / forward
  await page.locator('.ra-sidebar a[href="#/growth"]').click();
  await waitForHeading(page, /^My Growth$/);
  await page.goBack();
  const afterBack = await waitForHeading(page, /^Good/);
  await page.goForward();
  const afterForward = await waitForHeading(page, /^My Growth$/);
  check('Browser back / forward work', /^Good/.test(afterBack || '') && afterForward === 'My Growth');

  // Brand link
  await page.locator('.ra-sidebar .ra-brand').click();
  check('Brand link returns Home', /^Good/.test((await waitForHeading(page, /^Good/)) || ''));

  // Unknown route
  await page.goto(`${BASE}/index.html#/nope`);
  const nf = await waitForHeading(page, /does not exist/);
  check('Unknown route shows a clear message', /does not exist/.test(nf || ''));
  await page.getByRole('link', { name: 'Go to Home' }).click();
  check('Unknown route: Go to Home works', /^Good/.test((await waitForHeading(page, /^Good/)) || ''));

  // Skip link + keyboard (start from a fresh document so focus is at the top of the page)
  await page.goto('about:blank');
  await page.goto(`${BASE}/index.html#/home`);
  await waitForHeading(page, /^Good/);
  await page.keyboard.press('Tab');
  const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains('ra-skip-link'));
  await page.keyboard.press('Enter');
  const mainFocused = await page.evaluate(() => document.activeElement?.id === 'main');
  check('Keyboard: first Tab is the skip link; Enter moves focus to main without changing the route', skipFocused && mainFocused && page.url().endsWith('#/home'));

  // Header theme toggle + persistence
  await page.goto(`${BASE}/index.html#/home`);
  await waitForHeading(page, /^Good/);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('.ra-header button[aria-label^="Switch to"]').click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  const stored = await page.evaluate(() => localStorage.getItem('react.theme'));
  check('Theme toggle flips light/dark and stores the choice', before !== after && stored === after, `${before}->${after} stored=${stored}`);
  const label = await page.locator('.ra-header button[aria-label^="Switch to"]').getAttribute('aria-label');
  check('Theme toggle label describes the next action', label === (after === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'), label);
  await page.reload();
  await waitForHeading(page, /^Good/);
  check('Theme persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === after);

  // Settings: segmented control, sync with header, system mode
  await page.locator('.ra-sidebar a[href="#/settings"]').click();
  await waitForHeading(page, /^Settings$/);
  const checkedNow = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
  check('Settings: segmented control reflects current theme', checkedNow === after, `${checkedNow} vs ${after}`);
  await page.locator('.ra-header button[aria-label^="Switch to"]').click();
  const checkedAfterHeader = await page.evaluate(() => document.querySelector('input[name="theme"]:checked')?.value);
  const themeAfterHeader = await page.evaluate(() => document.documentElement.dataset.theme);
  check('Settings: segmented control follows the header toggle', checkedAfterHeader === themeAfterHeader, `${checkedAfterHeader} vs ${themeAfterHeader}`);
  for (const value of ['light', 'dark']) {
    await page.locator(`input[name="theme"][value="${value}"]`).check({ force: true });
    check(`Settings: choosing ${value} applies ${value}`, (await page.evaluate(() => document.documentElement.dataset.theme)) === value);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('input[name="theme"][value="system"]').check({ force: true });
  const sysDark = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(100);
  const sysLight = await page.evaluate(() => document.documentElement.dataset.theme);
  check('Settings: "System" follows the device and reacts live', sysDark === 'dark' && sysLight === 'light', `${sysDark}/${sysLight}`);

  // Toasts
  await page.getByRole('button', { name: 'Neutral', exact: true }).click();
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await page.getByRole('button', { name: 'Success', exact: true }).click();
  await page.getByRole('button', { name: 'Caution', exact: true }).click();
  const toastCount = await page.locator('.ra-toast').count();
  check('Toasts: four tones work and at most 3 stay visible', toastCount === 3, `count=${toastCount}`);
  check('Toasts: live region present', (await page.locator('.ra-toasts[role="region"][aria-live="polite"]').count()) === 1);
  await page.locator('.ra-toast button[aria-label="Dismiss notification"]').first().click();
  check('Toasts: dismiss button removes a toast', (await page.locator('.ra-toast').count()) === 2);
  await page.waitForTimeout(5600);
  check('Toasts: auto-dismiss after ~5s', (await page.locator('.ra-toast').count()) === 0);

  // Modal
  const openBtn = page.getByRole('button', { name: 'Open dialog' });
  await openBtn.click();
  check('Modal: opens with accessible name', (await page.locator('dialog[open]').count()) === 1 && (await page.locator('dialog[open]').getAttribute('aria-labelledby')) !== null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  check('Modal: Escape closes and focus returns to opener', (await page.locator('dialog').count()) === 0 && (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Open dialog');
  await openBtn.click();
  await page.mouse.click(5, 5);
  await page.waitForTimeout(80);
  check('Modal: backdrop click closes', (await page.locator('dialog').count()) === 0);
  await openBtn.click();
  await page.locator('dialog[open] button[aria-label="Close"]').click();
  await page.waitForTimeout(80);
  check('Modal: close button closes', (await page.locator('dialog').count()) === 0);
  await openBtn.click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const trapped = await page.evaluate(() => !!document.activeElement?.closest('dialog'));
  check('Modal: focus stays inside while open', trapped);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open confirmation' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForTimeout(80);
  check('Confirm dialog: Confirm -> success toast', /You confirmed/.test(await page.locator('.ra-toast').last().innerText()));
  await page.getByRole('button', { name: 'Open confirmation' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(80);
  check('Confirm dialog: cancel -> neutral toast', /chose not to continue/.test(await page.locator('.ra-toast').last().innerText()));

  // Field
  await page.getByRole('button', { name: 'Check field' }).click();
  const errVisible = await page.locator('.ra-field__error').isVisible();
  const invalid = await page.locator('.ra-field__control').getAttribute('aria-invalid');
  await page.locator('.ra-field__control').fill('hello');
  await page.getByRole('button', { name: 'Check field' }).click();
  check('Field: error shown when empty (aria-invalid) and cleared when filled', errVisible && invalid === 'true' && !(await page.locator('.ra-field__error').isVisible()));

  // Loading state
  await page.getByRole('button', { name: 'Show loading for 2 seconds' }).click();
  const skeleton = await page.locator('.ra-skeleton').isVisible();
  const statusRole = await page.locator('[role="status"]').count();
  await page.waitForTimeout(2300);
  check('Loading state: skeleton shows then resolves', skeleton && statusRole >= 1 && /Finished loading/.test(await page.locator('.ra-preview').innerText()));

  check('Functional run: no console errors', page.__errors.length === 0, page.__errors.join(' | '));
  await page.context().close();
}

/* ---------- Placeholder pages expose no dead controls ---------- */
{
  const page = await newPage(VIEWPORTS[0]);
  await page.goto(`${BASE}/index.html`);
  await waitForHeading(page, /^Good/);
  const dead = [];
  for (const route of ROUTES) {
    await page.goto(`${BASE}/index.html#/${route.path}`);
    await waitForHeading(page, route.heading);
    const items = await page.$$eval('.ra-main button, .ra-main a', (els) => els.map((e) => ({ tag: e.tagName, text: (e.textContent || '').trim(), href: e.getAttribute('href'), disabled: e.disabled })));
    for (const i of items) if (i.tag === 'A' && (!i.href || i.href === '#')) dead.push(`${route.path}: ${i.text}`);
  }
  check('No links without a destination', dead.length === 0, dead.join(', '));
  await page.context().close();
}

/* ---------- Reduced motion ---------- */
{
  const page = await newPage(VIEWPORTS[0], { reducedMotion: 'reduce' });
  await page.goto(`${BASE}/index.html#/settings`);
  await waitForHeading(page, /^Settings$/);
  await page.getByRole('button', { name: 'Show loading for 2 seconds' }).click();
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.ra-skeleton__line')).animationDuration);
  check('Reduced motion: animations are effectively disabled', parseFloat(dur) < 0.01, `duration=${dur}`);
  await page.context().close();
}

/* ---------- Contrast (WCAG AA) for token pairs, both themes ---------- */
{
  const page = await newPage(VIEWPORTS[0]);
  await page.goto(`${BASE}/index.html`);
  await waitForHeading(page, /^Good/);
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const pairs = [
    ['--text', '--bg'], ['--text', '--surface'], ['--text-muted', '--bg'], ['--text-muted', '--surface'], ['--text-muted', '--surface-raised'],
    ['--text-muted', '--surface-sunken'], ['--accent-strong', '--accent-soft'], ['--btn-primary-text', '--btn-primary-bg'], ['--earth', '--surface-raised'], ['--accent-strong', '--bg'], ['--earth', '--surface'],
  ];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const values = await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), [...new Set(pairs.flat())]);
    const bad = pairs.map(([fg, bg]) => [fg, bg, ratio(values[fg], values[bg])]).filter(([, , r]) => r < 4.5);
    check(`Contrast AA (4.5:1) for ${pairs.length} token pairs — ${theme}`, bad.length === 0, bad.map(([f, b, r]) => `${f}/${b}=${r.toFixed(2)}`).join(', '));
  }
  await page.context().close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
