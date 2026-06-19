// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf/pdf-engine.js
 * The PDF engine ADAPTER — the single boundary between PixelGnome and the
 * underlying PDF library. Nothing else in the app imports the engine directly,
 * so swapping the backend (spec §4.3) means rewriting only this file.
 *
 * Backend: MuPDF (`mupdf`, AGPL-3.0 by Artifex). See the NOTICE file for
 * attribution. Implements Approach B — true structural optimization that
 * recompresses embedded raster images and garbage-collects/subsets, while
 * PRESERVING the text layer and vector content (verified in the spike: a
 * 51.5 MB image-heavy PDF → 1.96 MB, ~96% smaller, selectable text intact).
 *
 * Loading: `mupdf` is multiple MB of WebAssembly, so loadEngine() lazy-imports
 * it on first use. This module is intended to run INSIDE pdf-worker.js so the
 * wasm loads off the main thread.
 *
 * The exact mupdf calls below were validated against mupdf@1.27 in Node:
 *   - Document.openDocument(bytes, 'application/pdf').asPDF()
 *   - per object: pdf.newIndirect(i); ind.isStream(); ind.get('Subtype').asName()
 *   - pdf.loadImage(ind) → Image; image.toPixmap() → Pixmap
 *   - pix.convertToColorSpace(ColorSpace.DeviceRGB, false); pix.asJPEG(quality)
 *   - in-place stream replace MUST target the indirect ref: ind.put(...),
 *     ind.delete(...), ind.writeRawStream(jpegBytes)
 *   - pdf.subsetFonts(); pdf.saveToBuffer('garbage=4,deflate=yes') → Buffer
 */

// Static import so the bundler pulls MuPDF (and its `mupdf-wasm.wasm`, located
// via `new URL('mupdf-wasm.wasm', import.meta.url)`) into the worker chunk and
// emits the wasm as an asset. A dynamic `import('mupdf')` is left unresolved by
// the build (bare specifier) and the wasm is never emitted, so the engine fails
// to load in production. Laziness is preserved at the worker level: this module
// only evaluates when pdf-worker.js is instantiated, which happens on first PDF
// use. MuPDF uses top-level await, so the worker must be an ES module
// (worker.format 'es' + new Worker(..., { type: 'module' })).
import * as mupdfModule from 'mupdf';

export const PDF_ENGINE = 'mupdf';

/**
 * @typedef {Object} PdfInfo
 * @property {number} pageCount
 * @property {number} fileSize       Bytes of the source document.
 * @property {boolean} hasText       True if any (sampled) page has extractable text.
 * @property {number} imageCount     Embedded raster image XObjects detected.
 */

/**
 * @typedef {Object} OptimizeOptions
 * @property {number} [imageQuality=0.72]  0–1 JPEG quality for recompressed images.
 * @property {boolean} [recompressImages=true]
 * @property {boolean} [stripMetadata=true]
 * @property {boolean} [subsetFonts=true]
 * @property {boolean} [garbageCollect=true]
 * @property {number} [targetDpi=0]   RESERVED — true resolution downsampling is a
 *                                    follow-up (needs scaled image rendering); 0 = off.
 * @property {(done:number,total:number)=>void} [onProgress]  Per-image progress.
 */

class NotImplementedError extends Error {
  constructor(method) {
    super(`pdf-engine: "${method}" is not implemented yet.`);
    this.name = 'NotImplementedError';
  }
}

/** Cached engine module so the multi-MB wasm loads at most once per worker. */
let _engine = null;

/**
 * Lazily import and initialize MuPDF. Safe to call repeatedly.
 * @returns {Promise<typeof import('mupdf')>}
 */
export async function loadEngine() {
  if (!_engine) {
    _engine = mupdfModule;
  }
  return _engine;
}

/** True once the engine has been loaded this session. */
export function isEngineLoaded() {
  return _engine !== null;
}

/** Open bytes as a PDFDocument, throwing a clear error if it isn't a PDF. */
function openPdf(mupdf, bytes) {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const pdf = doc.asPDF();
  if (!pdf) throw new Error('pdf-engine: file is not a PDF.');
  return pdf;
}

/**
 * Inspect a PDF without modifying it.
 * @param {Uint8Array} bytes
 * @returns {Promise<PdfInfo>}
 */
export async function getInfo(bytes) {
  assertBytes(bytes, 'getInfo');
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const pageCount = pdf.countPages();

  // Sample up to 5 pages for a text layer.
  let hasText = false;
  for (let p = 0; p < Math.min(pageCount, 5); p++) {
    if (pdf.loadPage(p).toStructuredText().asText().trim().length > 0) {
      hasText = true;
      break;
    }
  }

  // Count image XObjects.
  let imageCount = 0;
  const nobj = pdf.countObjects();
  for (let i = 1; i < nobj; i++) {
    const ind = pdf.newIndirect(i);
    if (!ind.isStream()) continue;
    try {
      if (ind.get('Subtype').asName() === 'Image') imageCount++;
    } catch {
      /* not an image dict */
    }
  }

  return { pageCount, fileSize: bytes.length, hasText, imageCount };
}

/**
 * Optimize a PDF (Approach B). Returns the optimized bytes, or the ORIGINAL
 * bytes if optimization would not make it smaller (never inflate silently).
 * @param {Uint8Array} bytes
 * @param {OptimizeOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function optimize(bytes, options = {}) {
  assertBytes(bytes, 'optimize');
  const {
    imageQuality = 0.72,
    recompressImages = true,
    stripMetadata = true,
    subsetFonts = true,
    garbageCollect = true,
    onProgress,
  } = options;

  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const jpegQuality = Math.round(Math.min(1, Math.max(0.1, imageQuality)) * 100);

  if (recompressImages) {
    // First pass: collect image object numbers so progress totals are accurate.
    const imageObjs = [];
    const nobj = pdf.countObjects();
    for (let i = 1; i < nobj; i++) {
      const ind = pdf.newIndirect(i);
      if (!ind.isStream()) continue;
      try {
        if (ind.get('Subtype').asName() === 'Image') imageObjs.push(i);
      } catch {
        /* skip */
      }
    }

    let done = 0;
    for (const i of imageObjs) {
      const ind = pdf.newIndirect(i);
      try {
        const image = pdf.loadImage(ind);
        let pix = image.toPixmap();
        // JPEG needs an opaque RGB pixmap.
        if (pix.getAlpha() || pix.getNumberOfComponents() !== 3) {
          pix = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
        }
        const jpg = pix.asJPEG(jpegQuality, false);
        // Rewrite the image XObject in place (same object number ⇒ all
        // references, and therefore text/vectors/layout, stay valid).
        ind.put('Filter', pdf.newName('DCTDecode'));
        ind.put('Width', pdf.newInteger(pix.getWidth()));
        ind.put('Height', pdf.newInteger(pix.getHeight()));
        ind.put('BitsPerComponent', pdf.newInteger(8));
        ind.put('ColorSpace', pdf.newName('DeviceRGB'));
        ind.delete('DecodeParms');
        ind.delete('SMask');
        ind.writeRawStream(jpg);
      } catch {
        // Leave any image we can't recompress untouched.
      }
      done++;
      if (onProgress) onProgress(done, imageObjs.length);
    }
  }

  if (stripMetadata) {
    try {
      const trailer = pdf.getTrailer();
      trailer.delete('Info');
      const root = trailer.get('Root');
      if (root && !root.isNull()) root.delete('Metadata');
    } catch {
      /* best-effort */
    }
  }

  if (subsetFonts) {
    try {
      pdf.subsetFonts();
    } catch {
      /* best-effort */
    }
  }

  // garbage=4 → renumber + merge duplicate objects/streams; deflate → compress streams.
  const saveOpts = garbageCollect ? 'garbage=4,deflate=yes' : 'deflate=yes';
  const out = pdf.saveToBuffer(saveOpts).asUint8Array();

  // Never hand back a larger file.
  return out.length < bytes.length ? out : bytes;
}

/**
 * Render one page to PNG bytes for the preview UI. (Returns PNG bytes rather
 * than an ImageBitmap so the worker can transfer the buffer cheaply; the main
 * thread turns it into a Blob/object URL.)
 * @param {Uint8Array} bytes
 * @param {number} pageIndex 0-based.
 * @param {number} [scale=0.3] Render scale (1 = 72 DPI baseline).
 * @returns {Promise<{ png: Uint8Array, width: number, height: number }>}
 */
export async function renderPagePreview(bytes, pageIndex, scale = 0.3) {
  assertBytes(bytes, 'renderPagePreview');
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError('pdf-engine.renderPagePreview: pageIndex must be a non-negative integer.');
  }
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const page = pdf.loadPage(pageIndex);
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
  return { png: pix.asPNG(), width: pix.getWidth(), height: pix.getHeight() };
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
 * Validate that the input looks like PDF bytes.
 * @param {unknown} bytes
 * @param {string} method
 */
function assertBytes(bytes, method) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new TypeError(`pdf-engine.${method}: expected a non-empty Uint8Array of PDF bytes.`);
  }
}
