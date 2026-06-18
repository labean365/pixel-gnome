/**
 * analytics.js
 * Content-free dataLayer pushes for PixelGnome's two custom events:
 *   - image_processed : a batch of newly-added images finished processing
 *   - export          : the user downloaded / ZIP-exported results
 *
 * Privacy: NO image data is ever sent — only aggregate counts and the chosen
 * output format (jpeg/png/webp/…). Both push through a guard on
 * `window.dataLayer`, so they no-op cleanly:
 *   - before GTM bootstraps the dataLayer, and
 *   - in the portable single-file build, where the analytics snippet (which
 *     creates window.dataLayer) is stripped — keeping that build network-silent.
 */

/**
 * Fire once per processing run of newly-added images (the activation signal).
 * @param {{ count: number, format: string }} info
 */
export function trackImageProcessed({ count, format }) {
  push({ event: 'image_processed', image_count: count, output_format: format });
}

/**
 * Fire when the user exports results (the success signal).
 * @param {{ format: string, count: number, isZip: boolean }} info
 */
export function trackExport({ format, count, isZip }) {
  push({ event: 'export', export_format: format, export_count: count, is_zip: !!isZip });
}

function push(payload) {
  if (!Array.isArray(window.dataLayer)) return;
  window.dataLayer.push({ ...payload, page_location: window.location.href });
}
