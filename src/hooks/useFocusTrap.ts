import { type RefObject, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Elements that can take focus right now, in document order.
 *
 * Visibility is judged by inline/attribute state rather than layout: jsdom
 * reports `offsetParent === null` for everything, so a layout-based check makes
 * the whole trap untestable.
 */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true')
      return false;
    const style = element.style;
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/**
 * Keeps Tab inside an open overlay and returns focus to whatever opened it.
 * Without this, Tab walks out of a dialog into the list behind the scrim — the
 * keyboard user loses the dialog while it is still covering the screen.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // React applies autoFocus during the commit phase, before this effect runs.
    // Moving focus here would override the field the dialog chose — typically
    // the confirmation input — and send keystrokes to the close button instead.
    if (!container.contains(document.activeElement)) {
      const initial = getFocusable(container)[0] ?? container;
      initial.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [containerRef, active]);
}
