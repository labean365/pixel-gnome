/**
 * toast.js
 * Lightweight toast notification system.
 * Shows temporary messages at the bottom-right of the viewport.
 */

let container = null;

function getContainer() {
  if (container) return container;

  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'info'|'error'|'warning'|'success'} type - Toast type (affects color)
 * @param {number} duration - How long to show (ms). Default 5000.
 * @param {Object} [options]
 * @param {{ label: string, onClick: () => void }} [options.action] - Optional
 *   inline action button (e.g. "Undo"). Dismisses the toast after invoking
 *   onClick. The callback must be synchronous — long-running side effects
 *   should kick off their own async work.
 */
export function showToast(message, type = 'info', duration = 5000, options = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  // Icon per type
  const icons = {
    info: '&#8505;&#65039;',
    error: '&#10060;',
    warning: '&#9888;&#65039;',
    success: '&#9989;',
  };

  const actionHtml = options.action
    ? `<button class="toast-action" type="button">${escapeHtml(options.action.label)}</button>`
    : '';

  el.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    ${actionHtml}
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  // Dismiss on click
  el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));

  // Wire the optional action button — fires the callback, then dismisses
  // the toast so the action doesn't "linger" after the user acts on it.
  if (options.action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      try {
        options.action.onClick();
      } finally {
        dismiss(el);
      }
    });
  }

  getContainer().appendChild(el);

  // Trigger enter animation
  requestAnimationFrame(() => el.classList.add('toast-visible'));

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismiss(el), duration);
  }
}

function dismiss(el) {
  el.classList.remove('toast-visible');
  el.classList.add('toast-exit');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  // Fallback if transition doesn't fire
  setTimeout(() => el.remove(), 500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
