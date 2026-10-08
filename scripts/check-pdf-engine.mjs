// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * check-pdf-engine.mjs — runtime contract test for src/modules/pdf/pdf-engine.js.
 *
 * check-pdf-build.mjs only proves the MuPDF chunk/wasm are *emitted*; this one
 * proves the engine still *works* against the installed MuPDF version. It builds
 * a few image-heavy test PDFs in memory (large enough to force WASM heap
 * growth), then runs every engine operation and asserts real output.
 *
 * Added for v0.31.3 after two regressions slipped past the build checks:
 *   - MuPDF 1.28 rejects the old `deflate=yes` save option (every save threw).
 *   - split() returned a 0-byte first part for image-heavy PDFs (heap-view bug).
 *
 * Usage: node scripts/check-pdf-engine.mjs   (part of `npm run verify`)
 */
import * as mupdf from 'mupdf';
import * as E from '../src/modules/pdf/pdf-engine.js';

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};
const isPdf = (b) =>
  b instanceof Uint8Array && b.length > 100 && String.fromCharCode(...b.subarray(0, 5)) === '%PDF-';

// Noisy JPEGs compress poorly, so a handful of them push the heap to grow.
function noisyJpeg(w, h, seed) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  const px = pix.getPixels();
  let x = seed * 2654435761;
  for (let i = 0; i < px.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    px[i] = x >>> 24;
  }
  const jpg = pix.asJPEG(92, false).slice();
  pix.destroy?.();
  return jpg;
}

console.log(`\n[check-pdf-engine] MuPDF ${mupdf.Document ? 'loaded' : 'MISSING'}`);

const images = [0, 1, 2, 3].map((i) => noisyJpeg(1600, 1100, i + 1));
const doc = await E.imagesToPdf(images);
check(isPdf(doc), `imagesToPdf → ${doc.length} bytes`);

const info = await E.getInfo(doc);
check(info.pageCount === 4, `getInfo → ${info.pageCount} pages`);

const opt = await E.optimize(doc, { imageQuality: 0.6 });
check(isPdf(opt) && opt.length <= doc.length, `optimize → ${opt.length} bytes`);

const ext = await E.extractPages(doc, [3, 0]);
check(isPdf(ext) && (await E.getInfo(ext)).pageCount === 2, 'extractPages → 2 pages');

const rot = await E.rotatePages(doc, [{ index: 0, degrees: 90 }]);
const before = await E.renderPagePreview(doc, 0, 0.1);
const after = await E.renderPagePreview(rot, 0, 0.1);
check(after.width === before.height && after.height === before.width, 'rotatePages swaps page 1');

const parts = await E.split(doc, [[0], [1, 2], [3]]);
const partInfo = await Promise.all(parts.map((p) => (isPdf(p) ? E.getInfo(p) : null)));
check(
  parts.length === 3 && partInfo.every((pi, i) => pi && pi.pageCount === [1, 2, 1][i]),
  `split → parts of ${parts.map((p) => p.length).join(' / ')} bytes`
);

const merged = await E.merge([doc, ext]);
check(isPdf(merged) && (await E.getInfo(merged)).pageCount === 6, 'merge → 6 pages');

const pngs = await E.pdfToImages(doc, { format: 'png', dpi: 72 });
check(pngs.length === 4 && pngs.every((p) => p.length > 1000), 'pdfToImages → 4 PNGs');

if (failures) {
  console.error(`[check-pdf-engine] FAILED (${failures})\n`);
  process.exit(1);
}
console.log('[check-pdf-engine] OK\n');
