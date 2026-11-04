/**
 * Hash router. Page module contract:
 *   export async function render(ctx): Node | Promise<Node>
 *   export function destroy(): void        (optional; called before leaving)
 * `ctx` = { route, store, toast, modal, navigate } supplied by main.js.
 */
import { ROUTES, DEFAULT_ROUTE, APP_NAME } from './config.js';
import { createLoadingState } from '../components/loading-state.js';
import { createEmptyState } from '../components/empty-state.js';
import { createButton } from '../components/button.js';

export function navigate(path) {
  location.hash = `#/${path}`;
}

/**
 * @param {{ mount: HTMLElement, store: ReturnType<import('./store.js').createStore>, context: object }} options
 */
export function createRouter({ mount, store, context }) {
  let token = 0;
  let activeModule = null;
  let firstRender = true;

  const currentPath = () => location.hash.replace(/^#\/?/, '').split('?')[0];

  function leaveCurrent() {
    if (activeModule && typeof activeModule.destroy === 'function') {
      try {
        activeModule.destroy();
      } catch (error) {
        console.error('Page teardown failed', error);
      }
    }
    activeModule = null;
  }

  function show(node, { title, route }) {
    mount.replaceChildren(node);
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    store.set({ route, sectionTitle: title || '' });
    window.scrollTo(0, 0);
    if (!firstRender) {
      // Move focus to the page heading so keyboard and screen-reader users land in the new page.
      const heading = mount.querySelector('[data-page-title]');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    firstRender = false;
  }

  async function resolve() {
    let path = currentPath();
    if (!path) {
      history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
      path = DEFAULT_ROUTE;
    }

    const run = ++token;
    leaveCurrent();

    const route = ROUTES.find((r) => r.path === path);
    if (!route) {
      const missing = createEmptyState({
        icon: 'compass',
        title: 'This page does not exist',
        message: 'The address may have been mistyped. You can return to Home.',
        action: createButton({ label: 'Go to Home', href: `#/${DEFAULT_ROUTE}`, variant: 'primary' }),
      });
      missing.querySelector('.ra-empty__title').setAttribute('data-page-title', '');
      show(missing, { title: 'Page not found', route: null });
      return;
    }

    // Only show the loader if loading is actually slow (avoids a flash).
    const loaderTimer = setTimeout(() => {
      if (run === token) mount.replaceChildren(createLoadingState({ label: `Opening ${route.title}…`, variant: 'skeleton' }));
    }, 150);

    try {
      const module = await route.load();
      const node = await module.render({ route, ...context });
      if (run !== token) return;
      activeModule = module;
      show(node, { title: route.title, route: route.path });
    } catch (error) {
      if (run !== token) return;
      console.error(`Failed to open "${route.path}"`, error);
      const failed = createEmptyState({
        icon: 'compass',
        title: 'This page could not be opened',
        message: 'Nothing was lost. Try again, or go back to Home.',
        action: createButton({ label: 'Try again', variant: 'primary', onClick: resolve }),
      });
      failed.querySelector('.ra-empty__title').setAttribute('data-page-title', '');
      show(failed, { title: 'Something went wrong', route: null });
    } finally {
      clearTimeout(loaderTimer);
    }
  }

  return {
    start() {
      window.addEventListener('hashchange', resolve);
      return resolve();
    },
  };
}
