/**
 * drop-zone.js
 * Handles drag-and-drop file input + file picker fallback.
 * Validates file types and passes File[] to a callback.
 */

import { t } from './i18n.js';

const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'image/avif',
  'application/pdf',
]);

// HEIC/AVIF files sometimes have an empty MIME type on some OSes
const ACCEPTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.svg',
  '.avif',
  '.pdf',
]);

/**
 * Check if a file is an accepted image type
 */
function isAcceptedFile(file) {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.has(ext);
}

// Full-window drop overlay element (Phase 10)
let windowOverlay = null;
let dragCounter = 0; // Track nested dragenter/dragleave events

// How long the red-border rejected-state flash remains on the drop zone.
// Kept in sync with the duration the accompanying error toast feels prominent;
// long enough to register, short enough to clear before the next drop.
const REJECTED_STATE_MS = 1200;

/**
 * Apply a transient "rejected" visual state to the drop zone, then clear it.
 * Safe to call repeatedly — the previous timer is cancelled and restarted.
 *
 * @param {HTMLElement} dropZoneEl
 */
let rejectedTimerId = null;
function flashRejected(dropZoneEl) {
  if (rejectedTimerId !== null) {
    clearTimeout(rejectedTimerId);
    // Re-trigger the CSS animation by removing + forcing reflow + re-adding.
    dropZoneEl.classList.remove('rejected');
    // Force reflow so the CSS animation restarts on the re-add below.
    void dropZoneEl.offsetWidth;
  }
  dropZoneEl.classList.add('rejected');
  rejectedTimerId = setTimeout(() => {
    dropZoneEl.classList.remove('rejected');
    rejectedTimerId = null;
  }, REJECTED_STATE_MS);
}

/**
 * Create the full-window drop overlay element.
 * Shown when user drags files anywhere over the browser window.
 */
function createWindowOverlay() {
  windowOverlay = document.createElement('div');
  windowOverlay.className = 'full-window-drop-overlay';
  windowOverlay.setAttribute('aria-hidden', 'true');
  windowOverlay.innerHTML = `
    <div class="full-window-drop-content">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span class="full-window-drop-text">${t('dropzone.overlay')}</span>
    </div>
  `;
  document.body.appendChild(windowOverlay);
  return windowOverlay;
}

/**
 * Initialize the drop zone
 * @param {HTMLElement} dropZoneEl - The drop zone container
 * @param {HTMLInputElement} fileInputEl - The hidden file input
 * @param {function(File[]): void} onFiles - Callback when valid files are received
 * @param {function(File[]): void} [onReject] - Callback when files are rejected (unsupported type)
 */
export function initDropZone(dropZoneEl, fileInputEl, onFiles, onReject) {
  createWindowOverlay();

  // --- Full-window drop target (Phase 10) ---
  // Show overlay when dragging files anywhere over the window.
  // dragCounter tracks nested enter/leave from child elements.
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1 && windowOverlay) {
      windowOverlay.classList.add('visible');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    // Required to allow drop
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (windowOverlay) windowOverlay.classList.remove('visible');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (windowOverlay) windowOverlay.classList.remove('visible');

    const all = Array.from(e.dataTransfer.files);
    const accepted = all.filter(isAcceptedFile);
    const rejected = all.filter((f) => !isAcceptedFile(f));
    if (accepted.length > 0) onFiles(accepted);
    if (rejected.length > 0) {
      flashRejected(dropZoneEl);
      if (onReject) onReject(rejected);
    }
  });

  // --- Sidebar drop zone visual feedback ---
  dropZoneEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZoneEl.classList.add('drag-over');
  });

  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZoneEl.classList.add('drag-over');
  });

  dropZoneEl.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.relatedTarget && dropZoneEl.contains(e.relatedTarget)) return;
    dropZoneEl.classList.remove('drag-over');
  });

  dropZoneEl.addEventListener('drop', (e) => {
    // The window-level handler already processes the drop,
    // just remove the visual state here.
    dropZoneEl.classList.remove('drag-over');
  });

  // Handle click / keyboard activation → open file picker
  dropZoneEl.addEventListener('click', (e) => {
    if (e.target === fileInputEl) return;
    fileInputEl.click();
  });

  dropZoneEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl.click();
    }
  });

  // Handle file picker selection
  fileInputEl.addEventListener('change', () => {
    const all = Array.from(fileInputEl.files);
    const accepted = all.filter(isAcceptedFile);
    const rejected = all.filter((f) => !isAcceptedFile(f));
    if (accepted.length > 0) onFiles(accepted);
    if (rejected.length > 0) {
      flashRejected(dropZoneEl);
      if (onReject) onReject(rejected);
    }
    fileInputEl.value = '';
  });
}
