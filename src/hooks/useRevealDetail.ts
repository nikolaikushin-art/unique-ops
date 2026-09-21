import { useEffect, useRef } from 'react';

/**
 * Keeps the detail panel (`.table-side`) in view after the person picks a row.
 *
 * - Desktop (side-by-side): the panel is `position: sticky`, so it already
 *   follows the reader. We only rewind its own internal scroll so the new
 *   record starts at its header (photo / title / tabs) rather than mid-way
 *   through the previous record's content.
 * - Tablet / phone (panel stacked under the list): the panel sits far below the
 *   row that was tapped, so we smoothly scroll it into view — otherwise it
 *   "opens" off-screen and looks like nothing happened.
 *
 * Skips the very first render so simply landing on a page never scrolls.
 */
export function useRevealDetail(selectedId: string | null | undefined) {
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!selectedId) return;

    const raf = requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>('.table-wrap > .table-side, .table-wrap > .job-detail-panel');
      if (!panel) return;
      panel.scrollTop = 0;

      const topbar = document.querySelector<HTMLElement>('.topbar');
      const topLimit = topbar ? topbar.getBoundingClientRect().bottom : 0;
      const r = panel.getBoundingClientRect();
      // Header must be on screen with a reasonable slice of the panel showing.
      const headerVisible = r.top >= topLimit - 1 && r.top <= window.innerHeight - 160;
      if (!headerVisible) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId]);
}
