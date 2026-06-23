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

/** Cached engine module so the multi-MB wasm loads at most once per worker. */
let _engine = null;

/**
 * Lazily import and initialize MuPDF. Safe to call repeatedly.
 * @returns {Promise<typeof import('mupdf')>}
 */
export async function loadEngine() {
  if (!_engine) {
    // The DYNAMIC import here is deliberate and load-bearing — do not convert it to
    // a static top-level `import` of 'mupdf'. MuPDF uses top-level await, and a module
    // worker whose ENTRY import graph contains top-level await never finishes starting
    // up (it stalls forever and never handles messages — the "engine failed to load" /
    // hang we hit in production). Importing MuPDF lazily here keeps pdf-worker.js's entry
    // graph TLA-free; MuPDF loads as a code-split chunk on first PDF use.
    //
    // This still bundles correctly (chunk + wasm emitted) ONLY because the worker is
    // created with the inline `new Worker(new URL('./pdf-worker.js', import.meta.url),
    // { type: 'module' })` form in pdf-ui.js, with `worker.format: 'es'` in
    // vite.config.js enabling code-splitting inside the worker.
    _engine = await import('mupdf');
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
        const pix = image.toPixmap();
        // Only recompress straightforward OPAQUE RGB images. Skip anything that
        // carries transparency or isn't 3-component RGB:
        //   - alpha channel → JPEG can't hold it (transparent pixels go black);
        //   - non-RGB (grayscale/CMYK/indexed) → this also covers a soft-mask
        //     (/SMask) image, which is a DeviceGray mask; converting it to RGB
        //     JPEG corrupts the mask.
        // Crucially we also DON'T delete /SMask anymore: a base RGB image often
        // carries a soft mask (e.g. a transparent PNG logo). Recompressing the
        // base while preserving its /SMask keeps the transparency intact.
        if (pix.getAlpha() || pix.getNumberOfComponents() !== 3) {
          done++;
          if (onProgress) onProgress(done, imageObjs.length);
          continue;
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

// ---- P2 — Organize (extract / split / remove) ----

/**
 * Build a NEW PDF containing `pages` (0-based, in the given order) copied from
 * an already-open source document. Page copying uses a graft map so shared
 * resources (fonts, images) are copied once and de-duplicated, and text/vector
 * content is preserved exactly — this is a structural copy, never a raster.
 *
 * @param {typeof import('mupdf')} mupdf
 * @param {import('mupdf').PDFDocument} srcPdf  An open source PDFDocument.
 * @param {number[]} pages  0-based page indices, in output order.
 * @returns {Uint8Array}
 */
function subsetDoc(mupdf, srcPdf, pages) {
  const dst = new mupdf.PDFDocument();
  // One graft map per destination de-dupes resources shared across the pages.
  const map = dst.newGraftMap();
  for (const p of pages) {
    // `to = -1` appends the grafted page at the end of the destination.
    map.graftPage(-1, srcPdf, p);
  }
  // garbage=4 renumbers + merges duplicate objects/streams; deflate compresses.
  return dst.saveToBuffer('garbage=4,deflate=yes').asUint8Array();
}

/**
 * Validate a list of 0-based page indices against a page count.
 * @param {unknown} pages
 * @param {number} pageCount
 * @param {string} method
 * @returns {number[]} The validated indices (a copy).
 */
function assertPages(pages, pageCount, method) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new TypeError(`pdf-engine.${method}: expected a non-empty array of page indices.`);
  }
  const out = [];
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 0 || p >= pageCount) {
      throw new RangeError(
        `pdf-engine.${method}: page index ${p} is out of range (0–${pageCount - 1}).`
      );
    }
    out.push(p);
  }
  return out;
}

/**
 * Extract a subset of pages into a single new PDF, preserving text/vectors.
 * Also serves "remove pages" — the caller passes the pages to KEEP.
 * @param {Uint8Array} bytes
 * @param {number[]} pages  0-based indices, in the desired output order.
 * @returns {Promise<Uint8Array>}
 */
export async function extractPages(bytes, pages) {
  assertBytes(bytes, 'extractPages');
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const valid = assertPages(pages, pdf.countPages(), 'extractPages');
  return subsetDoc(mupdf, pdf, valid);
}

/**
 * Rotate pages by a relative angle (C2). Each entry ADDS its `degrees` (a
 * multiple of 90) to that page's current /Rotate, normalized to [0, 360); pages
 * not listed are untouched. Rotation is a page-dict change only — text, vectors,
 * and images are preserved (nothing is rasterized).
 *
 * Note: reads the leaf page dict's /Rotate (default 0). A rotation inherited
 * from an ancestor Pages node isn't added to — uncommon, and setting the leaf
 * value still yields the correct absolute orientation for the listed pages.
 * @param {Uint8Array} bytes
 * @param {Array<{ index: number, degrees: number }>} rotations  0-based indices.
 * @returns {Promise<Uint8Array>}
 */
export async function rotatePages(bytes, rotations) {
  assertBytes(bytes, 'rotatePages');
  if (!Array.isArray(rotations) || rotations.length === 0) {
    throw new TypeError(
      'pdf-engine.rotatePages: expected a non-empty array of { index, degrees }.'
    );
  }
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const pageCount = pdf.countPages();
  for (const entry of rotations) {
    const { index, degrees } = entry || {};
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new RangeError(
        `pdf-engine.rotatePages: page index ${index} is out of range (0–${pageCount - 1}).`
      );
    }
    if (!Number.isInteger(degrees) || degrees % 90 !== 0) {
      throw new RangeError('pdf-engine.rotatePages: degrees must be an integer multiple of 90.');
    }
    if (degrees % 360 === 0) continue; // net no-op — leave the page untouched
    const pageObj = pdf.loadPage(index).getObject();
    let cur = 0;
    try {
      const r = pageObj.get('Rotate');
      if (r && !r.isNull()) cur = r.asNumber();
    } catch {
      /* no readable /Rotate — treat as 0 */
    }
    const next = (((cur + degrees) % 360) + 360) % 360;
    pageObj.put('Rotate', pdf.newInteger(next));
  }
  // garbage=4 renumbers + merges duplicate objects/streams; deflate compresses.
  return pdf.saveToBuffer('garbage=4,deflate=yes').asUint8Array();
}

/**
 * Split a PDF into multiple new PDFs — one per range. Each range is a list of
 * 0-based page indices; the source is opened once and copied range-by-range.
 * @param {Uint8Array} bytes
 * @param {number[][]} ranges  Array of page-index groups; each group → one doc.
 * @returns {Promise<Uint8Array[]>}
 */
export async function split(bytes, ranges) {
  assertBytes(bytes, 'split');
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new TypeError('pdf-engine.split: expected a non-empty array of page-index ranges.');
  }
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const pageCount = pdf.countPages();
  return ranges.map((group, i) =>
    subsetDoc(mupdf, pdf, assertPages(group, pageCount, `split[range ${i}]`))
  );
}

/**
 * Concatenate multiple PDFs into one, in the given order, preserving text and
 * vector content (structural page copy — never a raster). A graft map is bound
 * to ONE source document, so we use a fresh map per source (it de-dupes that
 * source's shared resources across its own pages); the `garbage=4` save pass
 * then merges any duplicate objects/streams across documents.
 * @param {Uint8Array[]} docs  Source PDF byte arrays, in output order.
 * @returns {Promise<Uint8Array>}
 */
export async function merge(docs) {
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new TypeError('pdf-engine.merge: expected a non-empty array of PDF byte arrays.');
  }
  const mupdf = await loadEngine();
  const dst = new mupdf.PDFDocument();
  docs.forEach((bytes, i) => {
    assertBytes(bytes, `merge[doc ${i}]`);
    const src = openPdf(mupdf, bytes);
    const map = dst.newGraftMap(); // one map per source document (required)
    const n = src.countPages();
    for (let p = 0; p < n; p++) map.graftPage(-1, src, p); // -1 = append
  });
  return dst.saveToBuffer('garbage=4,deflate=yes').asUint8Array();
}

// ---- P3 — Images → PDF ----

/**
 * Combine images into a PDF — one image per page, each page sized to its image
 * (image pixels mapped 1:1 to PDF points). The image bytes MUST be a format
 * MuPDF decodes natively — JPEG or PNG. Callers normalize other formats
 * (WebP/AVIF/GIF) to PNG/JPEG before calling (the browser can decode anything;
 * MuPDF's wasm build can't). JPEG inputs embed as DCTDecode (kept compact);
 * PNG inputs are re-stored losslessly.
 * @param {Uint8Array[]} images  Encoded JPEG/PNG bytes, in page order.
 * @returns {Promise<Uint8Array>}
 */
export async function imagesToPdf(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new TypeError('pdf-engine.imagesToPdf: expected a non-empty array of image byte arrays.');
  }
  const mupdf = await loadEngine();
  const dst = new mupdf.PDFDocument();
  images.forEach((bytes, i) => {
    assertBytes(bytes, `imagesToPdf[image ${i}]`);
    // Copy: MuPDF takes ownership of the backing buffer, so a caller that reused
    // the same Uint8Array across images would otherwise get a corrupt/empty PDF.
    const image = new mupdf.Image(bytes.slice());
    const w = image.getWidth();
    const h = image.getHeight();
    if (!w || !h) throw new Error(`pdf-engine.imagesToPdf: image ${i} has no dimensions.`);
    const ref = dst.addImage(image);
    // Resources: /XObject << /Im0 <image ref> >>
    const resources = dst.newDictionary();
    const xobjects = dst.newDictionary();
    xobjects.put('Im0', ref);
    resources.put('XObject', xobjects);
    // Content stream: scale the unit image up to the page (w × h) and draw it.
    const contents = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    const page = dst.addPage([0, 0, w, h], 0, resources, contents);
    dst.insertPage(-1, page); // -1 = append
  });
  // Deflate compresses content/PNG streams; JPEG image streams stay DCTDecode.
  return dst.saveToBuffer('garbage=4,deflate=yes').asUint8Array();
}

// ---- Phase 4 operations (convert) — signatures reserved ----

/**
 * @typedef {Object} RasterizeOptions
 * @property {'png'|'jpeg'} [format='png']  Output image format per page.
 * @property {number} [dpi=150]   Render resolution; scale = dpi/72.
 * @property {number} [quality=0.85]  0–1 JPEG quality (ignored for PNG).
 * @property {number[]} [pages]   Optional 0-based page indices to render, in the
 *   given order. Omitted / empty ⇒ every page. Out-of-range indices are dropped.
 * @property {(done:number,total:number)=>void} [onProgress]  Per-page progress.
 */

/**
 * Rasterize every page of a PDF to an image (the inverse of imagesToPdf). Each
 * page is rendered to a pixmap at `dpi/72` scale on an opaque RGB surface, then
 * encoded as PNG (lossless) or JPEG. Returns one image's bytes per page, in
 * order — the caller wraps them in Blobs (ZIP download or feed to the image
 * pipeline).
 * @param {Uint8Array} bytes
 * @param {RasterizeOptions} [options]
 * @returns {Promise<Uint8Array[]>}
 */
export async function pdfToImages(bytes, options = {}) {
  assertBytes(bytes, 'pdfToImages');
  const { format = 'png', dpi = 150, quality = 0.85, pages = null, onProgress } = options;
  const mupdf = await loadEngine();
  const pdf = openPdf(mupdf, bytes);
  const total = pdf.countPages();
  // Optional subset (D2): render only the requested 0-based indices, in order.
  // Null/empty ⇒ all pages; out-of-range indices are dropped defensively.
  const indices =
    Array.isArray(pages) && pages.length
      ? pages.filter((i) => Number.isInteger(i) && i >= 0 && i < total)
      : Array.from({ length: total }, (_, i) => i);
  const scale = Math.max(0.1, dpi / 72);
  const jpegQuality = Math.round(Math.min(1, Math.max(0.1, quality)) * 100);
  const matrix = mupdf.Matrix.scale(scale, scale);

  const out = [];
  for (let k = 0; k < indices.length; k++) {
    const page = pdf.loadPage(indices[k]);
    // Opaque RGB (alpha=false): PDF pages render onto white, no transparency.
    const pix = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    out.push(format === 'jpeg' ? pix.asJPEG(jpegQuality, false) : pix.asPNG());
    if (onProgress) onProgress(k + 1, indices.length);
  }
  return out;
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
