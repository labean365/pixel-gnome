/**
 * tooltip.js
 * Lightweight tooltip system for [data-tooltip] elements.
 *
 * Renders a single reusable tooltip element on <body> so it is never
 * clipped by overflow containers (sidebar, modals, etc.).
 * Positions above the trigger by default; flips below if there isn't room.
 * Horizontally clamped to the viewport with an 8px margin.
 */

let tooltipEl = null;
let showTimeout = null;
const DELAY = 350; // ms before showing
const GAP = 6; // px between trigger and tooltip
const VIEWPORT_MARGIN = 8; // px inset from viewport edges

/**
 * Initialize the tooltip system — call once at startup.
 * Listens globally via event delegation on [data-tooltip] elements.
 */
export function initTooltips() {
  // Create the shared tooltip element
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'pd-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltipEl);

  // Event delegation on the entire document
  document.addEventListener('pointerenter', onPointerEnter, true);
  document.addEventListener('pointerleave', onPointerLeave, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);

  // Hide on scroll (any scrollable ancestor)
  document.addEventListener('scroll', hide, true);
}

function getTrigger(event) {
  const t = event.target;
  return t && typeof t.closest === 'function' ? t.closest('[data-tooltip]') : null;
}

function onPointerEnter(e) {
  const trigger = getTrigger(e);
  if (!trigger) return;
  scheduleShow(trigger);
}

function onPointerLeave(e) {
  const trigger = getTrigger(e);
  if (!trigger) return;
  hide();
}

function onFocusIn(e) {
  const trigger = getTrigger(e);
  if (!trigger) return;
  scheduleShow(trigger);
}

function onFocusOut(e) {
  const trigger = getTrigger(e);
  if (!trigger) return;
  hide();
}

function scheduleShow(trigger) {
  clearTimeout(showTimeout);
  showTimeout = setTimeout(() => show(trigger), DELAY);
}

function show(trigger) {
  if (!tooltipEl) return;

  const text = trigger.getAttribute('data-tooltip');
  if (!text) return;

  tooltipEl.textContent = text;
  tooltipEl.classList.remove('visible');

  // Make visible off-screen first so we can measure
  tooltipEl.style.left = '0';
  tooltipEl.style.top = '0';
  tooltipEl.classList.add('visible');

  const rect = trigger.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Vertical: prefer above, flip below if no room
  let top;
  if (rect.top - GAP - tipRect.height >= VIEWPORT_MARGIN) {
    top = rect.top - GAP - tipRect.height;
  } else {
    top = rect.bottom + GAP;
  }

  // Horizontal: center on trigger, clamp to viewport
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - tipRect.width - VIEWPORT_MARGIN));

  // Clamp top as well (e.g. very tall tooltip)
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - tipRect.height - VIEWPORT_MARGIN));

  tooltipEl.style.left = `${Math.round(left)}px`;
  tooltipEl.style.top = `${Math.round(top)}px`;
}

function hide() {
  clearTimeout(showTimeout);
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
  }
}
