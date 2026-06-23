// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * shared/focus-trap.js
 * Minimal focus trap for modal dialogs (H6). Keeps Tab / Shift+Tab cycling within
 * a container while it's open, and restores focus to whatever was focused before
 * (e.g. the card button that opened the dialog) on release. No dependencies.
 *
 * Usage:
 *   const trap = createFocusTrap(dialogEl);
 *   trap.activate();   // after the dialog is in the DOM and initial focus is set
 *   trap.release();    // on close — also restores prior focus
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {HTMLElement} container
 * @returns {{ activate: () => void, release: () => void }}
 */
export function createFocusTrap(container) {
  let previouslyFocused = null;

  function focusable() {
    // Visible, enabled, focusable nodes in DOM order. offsetParent is null for
    // display:none subtrees (e.g. a collapsed <details> panel's controls), so
    // those are correctly skipped.
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const nodes = focusable();
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      previouslyFocused = document.activeElement;
      // Capture phase so the trap sees Tab before any inner handler can.
      document.addEventListener('keydown', onKeydown, true);
    },
    release() {
      document.removeEventListener('keydown', onKeydown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          /* element may be gone — ignore */
        }
      }
      previouslyFocused = null;
    },
  };
}
