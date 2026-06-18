// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf/pdf-engine.js
 * The PDF engine ADAPTER — the single boundary between PixelGnome and whatever
 * PDF library actually does the work. Nothing else in the app imports the engine
 * directly, so swapping the backend (see spec §4.3) means rewriting only this file.
 *
 * Planned backend (per docs/PDF-Toolkit-Spec-2026-06.md, Route 1 / AGPL):
 *   - MuPDF (`mupdf` / mupdf.js, AGPL-3.0) for true structural optimization
 *     (recompress embedded images, downsample DPI, subset fonts, garbage-collect)
 *     while PRESERVING text + vectors (Approach B, NOT rasterize-and-flatten).
 *   - Route 3 fallback (pdf.js + pdf-lib, permissive) keeps this same interface.
 *
 * IMPORTANT — this is a STUB. The engine dependency is not installed yet and no
 * method is implemented. Every call throws NotImplementedError so callers fail
 * loudly and obviously during development. Fill in the bodies when the engine
 * is added (and add the MuPDF NOTICE/attribution — spec §6).
 *
 * Loading: the engine is multiple MB of WebAssembly, so loadEngine() must be a
 * lazy dynamic import triggered only when the first PDF is processed — mirroring
 * how `heic-to` is loaded on demand. It is loaded INSIDE the worker
 * (pdf-worker.js) so the main thread stays responsive.
 */

/** Identifier for the backend this adapter targets. Update when the engine lands. */
export const PDF_ENGINE = 'mupdf'; // 'mupdf' (Route 1) | 'pdfjs-pdflib' (Route 3)

/**
 * @typedef {Object} PdfInfo
 * @property {number} pageCount
 * @property {number} fileSize       Bytes of the source document.
 * @property {boolean} hasText       True if any page carries extractable text.
 * @property {number} imageCount     Embedded raster image XObjects detected.
 * @property {string} [title]        Document title from metadata, if present.
 */

/**
 * @typedef {Object} OptimizeOptions
 * @property {number} targetDpi          Downsample images above this DPI (0 = no downsample).
 * @property {number} imageQuality       0–1 JPEG quality for recompressed images.
 * @property {boolean} downsampleImages
 * @property {boolean} stripMetadata
 * @property {boolean} subsetFonts
 * @property {boolean} garbageCollect    Drop unused objects.
 * @property {boolean} [linearize]       "Fast web view" (Phase 4).
 * @property {number[]} [pages]          Optional 0-based page subset; omit = all pages.
 * @property {(done:number,total:number)=>void} [onProgress]  Per-page progress.
 */

class NotImplementedError extends Error {
  constructor(method) {
    super(
      `pdf-engine: "${method}" is not implemented yet — the PDF engine (${PDF_ENGINE}) ` +
        `is scaffolded but not wired in. See docs/PDF-Toolkit-Spec-2026-06.md.`
    );
    this.name = 'NotImplementedError';
  }
}

/** Cached engine handle so the multi-MB wasm loads at most once per session. */
let _engine = null;

/**
 * Lazily import and initialize the PDF engine. Safe to call repeatedly.
 * @returns {Promise<unknown>} the initialized engine handle (backend-specific).
 */
export async function loadEngine() {
  if (_engine) return _engine;
  // TODO(pdf): _engine = await import(/* @vite-chunkName: pdf-engine */ 'mupdf');
  //            then run any one-time init the backend requires.
  throw new NotImplementedError('loadEngine');
}

/** True once the engine has been loaded this session. */
export function isEngineLoaded() {
  return _engine !== null;
}

/**
 * Inspect a PDF without modifying it.
 * @param {Uint8Array} bytes Raw PDF bytes.
 * @returns {Promise<PdfInfo>}
 */
export async function getInfo(bytes) {
  assertBytes(bytes, 'getInfo');
  await loadEngine();
  throw new NotImplementedError('getInfo');
}

/**
 * Optimize a PDF (Approach B): recompress/downsample embedded images, optionally
 * subset fonts, strip metadata, and garbage-collect — preserving text and vectors.
 * Returns the optimized document, or the ORIGINAL bytes if optimization would not
 * make it smaller (caller decides; never hand back a larger file silently).
 * @param {Uint8Array} bytes
 * @param {OptimizeOptions} options
 * @returns {Promise<Uint8Array>}
 */
export async function optimize(bytes, options) {
  assertBytes(bytes, 'optimize');
  if (!options || typeof options !== 'object') {
    throw new TypeError('pdf-engine.optimize: options object is required.');
  }
  await loadEngine();
  throw new NotImplementedError('optimize');
}

/**
 * Render one page to a bitmap for the preview UI.
 * @param {Uint8Array} bytes
 * @param {number} pageIndex 0-based.
 * @param {number} [scale=1] Render scale (1 = 72 DPI baseline).
 * @returns {Promise<ImageBitmap>}
 */
export async function renderPagePreview(bytes, pageIndex, scale = 1) {
  assertBytes(bytes, 'renderPagePreview');
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError('pdf-engine.renderPagePreview: pageIndex must be a non-negative integer.');
  }
  void scale;
  await loadEngine();
  throw new NotImplementedError('renderPagePreview');
}

// ---- Phase 2+ operations (organize / convert) — signatures reserved ----

/** @returns {Promise<Uint8Array>} Concatenate multiple PDFs into one. */
export async function merge(docs) {
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new TypeError('pdf-engine.merge: expected a non-empty array of PDF byte arrays.');
  }
  throw new NotImplementedError('merge');
}

/** @returns {Promise<Uint8Array[]>} Split a PDF into multiple documents. */
export async function split(bytes, ranges) {
  assertBytes(bytes, 'split');
  void ranges;
  throw new NotImplementedError('split');
}

/** @returns {Promise<Uint8Array>} Extract a subset of pages into a new PDF. */
export async function extractPages(bytes, pages) {
  assertBytes(bytes, 'extractPages');
  void pages;
  throw new NotImplementedError('extractPages');
}

/** @returns {Promise<Uint8Array>} Combine images (already resized/compressed) into a PDF. */
export async function imagesToPdf(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new TypeError('pdf-engine.imagesToPdf: expected a non-empty array of image blobs.');
  }
  throw new NotImplementedError('imagesToPdf');
}

/** @returns {Promise<Blob[]>} Rasterize pages to images (feeds the image pipeline). */
export async function pdfToImages(bytes, options) {
  assertBytes(bytes, 'pdfToImages');
  void options;
  throw new NotImplementedError('pdfToImages');
}

/**
 * Validate that the input looks like PDF bytes. Cheap guard so stubs (and the
 * real impl) reject obvious garbage before touching the engine.
 * @param {unknown} bytes
 * @param {string} method
 */
function assertBytes(bytes, method) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new TypeError(`pdf-engine.${method}: expected a non-empty Uint8Array of PDF bytes.`);
  }
}
