/**
 * smart-compress.js
 * Binary search quality targeting — iteratively adjusts quality
 * to hit a target file size for JPEG, WebP, and AVIF output.
 *
 * Phase 9: Smart Compression.
 * PNG is lossless (no quality knob) — target size mode is skipped for PNG.
 *
 * Worker-safe: feature-detects `convertToBlob` so this module works for both
 * HTMLCanvasElement (main thread, `toBlob`) and OffscreenCanvas (worker,
 * `convertToBlob`).
 */

/**
 * Encode a canvas to a blob at a given quality. Works with both
 * HTMLCanvasElement and OffscreenCanvas — prefers the promise-based
 * convertToBlob when available.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {string} mimeType — e.g. 'image/jpeg'
 * @param {number} quality — 0-1
 * @returns {Promise<Blob>}
 */
function encodeAtQuality(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    // OffscreenCanvas path (worker)
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  // HTMLCanvasElement path (main thread)
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

/**
 * Binary search for the highest quality that produces a blob ≤ targetBytes.
 *
 * @param {HTMLCanvasElement} canvas — the final-sized canvas to encode
 * @param {string} mimeType — 'image/jpeg', 'image/webp', or 'image/avif'
 * @param {number} targetBytes — target file size in bytes
 * @param {Object} [opts]
 * @param {number} [opts.minQuality=0.10] — lowest quality to try
 * @param {number} [opts.maxQuality=0.95] — highest quality to try
 * @param {number} [opts.maxIterations=8] — max binary search steps
 * @param {number} [opts.tolerance=0.05] — stop when within 5% of target
 * @returns {Promise<{ blob: Blob, quality: number, iterations: number }>}
 */
export async function compressToTarget(canvas, mimeType, targetBytes, opts = {}) {
  const { minQuality = 0.1, maxQuality = 0.95, maxIterations = 8, tolerance = 0.05 } = opts;

  let lo = minQuality;
  let hi = maxQuality;
  let bestBlob = null;
  let bestQuality = maxQuality;
  let iterations = 0;

  // First, try max quality — if it's already under target, return immediately
  const maxBlob = await encodeAtQuality(canvas, mimeType, maxQuality);
  if (maxBlob.size <= targetBytes) {
    return { blob: maxBlob, quality: maxQuality, iterations: 1 };
  }

  // Try min quality — if even that exceeds the target, return it with a warning
  const minBlob = await encodeAtQuality(canvas, mimeType, minQuality);
  if (minBlob.size > targetBytes) {
    return { blob: minBlob, quality: minQuality, iterations: 2, belowTarget: false };
  }

  // Binary search
  bestBlob = minBlob;
  bestQuality = minQuality;

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    const mid = (lo + hi) / 2;
    const blob = await encodeAtQuality(canvas, mimeType, mid);

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      bestQuality = mid;
      lo = mid; // Try higher quality

      // Close enough to target — stop early
      if (blob.size >= targetBytes * (1 - tolerance)) {
        break;
      }
    } else {
      hi = mid; // Try lower quality
    }

    // Convergence check
    if (hi - lo < 0.01) break;
  }

  return { blob: bestBlob, quality: bestQuality, iterations: iterations + 2, belowTarget: true };
}
