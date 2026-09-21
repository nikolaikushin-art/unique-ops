import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SCROLL_CONTAINER_SELECTORS = [
  '.main',
  '.main-area',
  '.content',
  '.content--mailbox-workspace',
  '.app-page',
  '.outlook-premium-list-scroll',
  '.outlook-premium-reading-main',
  '.table-side',
  '.job-detail-panel',
] as const;

function resetElementScroll(el: Element) {
  const node = el as HTMLElement;
  node.scrollTop = 0;
  node.scrollLeft = 0;
}

/** Reset window and all app scroll containers to the top instantly. */
export function resetAppScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  for (const selector of SCROLL_CONTAINER_SELECTORS) {
    document.querySelectorAll(selector).forEach(resetElementScroll);
  }
}

/** Scroll to top on pathname change (not search/hash-only updates).
 *  A single reset isn't always enough: lazy-loaded route chunks and
 *  async data (useLocalQuery) can grow the page's height *after* this
 *  effect runs, and the browser's scroll-anchoring can then quietly
 *  shift the viewport down to keep whatever element ended up under the
 *  old scroll offset in place. Re-assert 0 a couple more times across
 *  the next two paints and shortly after data has had time to land. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    resetAppScroll();
    const raf1 = requestAnimationFrame(() => {
      resetAppScroll();
      requestAnimationFrame(resetAppScroll);
    });
    const t1 = window.setTimeout(resetAppScroll, 80);
    const t2 = window.setTimeout(resetAppScroll, 300);
    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}
