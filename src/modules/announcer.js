/**
 * announcer.js
 * Screen reader announcements via a live region.
 * Uses the #srAnnouncer element (aria-live="assertive") in index.html.
 *
 * Pattern: clear → wait a frame → set text, so screen readers
 * pick up repeated announcements reliably.
 */

let announcerEl = null;

/**
 * Initialize the announcer
 */
export function initAnnouncer() {
  announcerEl = document.getElementById('srAnnouncer');
}

/**
 * Announce a message to screen readers
 * @param {string} message
 */
export function announce(message) {
  if (!announcerEl) return;

  // Clear first so the same message can be announced again
  announcerEl.textContent = '';

  requestAnimationFrame(() => {
    announcerEl.textContent = message;
  });
}
