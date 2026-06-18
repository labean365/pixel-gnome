/**
 * resource-tracker.js
 * Centralized memory management for blob URLs and temporary canvases.
 *
 * Phase 8.7: Prevents memory leaks by tracking all URL.createObjectURL()
 * calls and temporary canvases. Call releaseAll() on clear/remove to
 * ensure all resources are properly freed.
 */

/** @type {Set<string>} */
const trackedUrls = new Set();

/** @type {Set<HTMLCanvasElement>} */
const trackedCanvases = new Set();

/**
 * Track a blob URL for later revocation.
 * @param {string} url — result of URL.createObjectURL()
 * @returns {string} — the same URL (for chaining)
 */
export function trackUrl(url) {
  if (url && url.startsWith('blob:')) {
    trackedUrls.add(url);
  }
  return url;
}

/**
 * Revoke a single tracked blob URL.
 * @param {string} url
 */
export function revokeUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
    trackedUrls.delete(url);
  }
}

/**
 * Track a temporary canvas for later cleanup.
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
export function trackCanvas(canvas) {
  trackedCanvases.add(canvas);
  return canvas;
}

/**
 * Release a single tracked canvas (zero its dimensions to free GPU memory).
 * @param {HTMLCanvasElement} canvas
 */
export function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
  trackedCanvases.delete(canvas);
}

/**
 * Revoke all tracked blob URLs and release all tracked canvases.
 * Call this on "Clear All" and page unload.
 */
export function releaseAll() {
  trackedUrls.forEach((url) => URL.revokeObjectURL(url));
  trackedUrls.clear();

  trackedCanvases.forEach((canvas) => {
    canvas.width = 0;
    canvas.height = 0;
  });
  trackedCanvases.clear();
}

/**
 * Get the count of currently tracked resources (for debugging).
 * @returns {{ urls: number, canvases: number }}
 */
export function getTrackedCount() {
  return { urls: trackedUrls.size, canvases: trackedCanvases.size };
}
