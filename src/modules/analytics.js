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

/**
 * Fire when a PDF is optimized. Content-free: only the bucketed size reduction,
 * never the filename or any document content. No-ops without window.dataLayer
 * (e.g. in the portable single-file build), like the events above.
 * @param {{ reductionPct: number }} info
 */
export function trackPdfOptimized({ reductionPct }) {
  push({ event: 'pdf_optimized', reduction_pct: bucketReduction(reductionPct) });
}

/**
 * Fire when a PDF organize operation completes. Content-free: only which
 * operation ran (extract / remove / split) — never filenames, page contents,
 * or counts that could fingerprint a document. No-ops without window.dataLayer
 * (e.g. the portable single-file build), like the events above.
 * @param {{ op: 'extract' | 'remove' | 'split' }} info
 */
export function trackPdfOrganized({ op }) {
  push({ event: 'pdf_organized', pdf_op: String(op || '') });
}

/** Bucket the % reduction so analytics never carries a precise per-file value. */
function bucketReduction(pct) {
  if (typeof pct !== 'number' || pct <= 0) return '0';
  if (pct < 25) return '1-24';
  if (pct < 50) return '25-49';
  if (pct < 75) return '50-74';
  return '75-100';
}

function push(payload) {
  if (!Array.isArray(window.dataLayer)) return;
  window.dataLayer.push({ ...payload, page_location: window.location.href });
}
