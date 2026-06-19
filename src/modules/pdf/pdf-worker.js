// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf/pdf-worker.js
 * Web Worker for off-main-thread PDF work. PDF optimization (image decode /
 * re-encode, page rasterization) is CPU-bound, so it runs here to keep the UI
 * responsive — mirroring src/modules/process-worker.js for images.
 *
 * The multi-MB engine wasm is loaded INSIDE this worker via pdf-engine.js's lazy
 * loadEngine(), so the main thread never imports or initializes it.
 *
 * Message protocol:
 *   IN:  { type: 'pdf-info',     id, bytes }
 *   IN:  { type: 'pdf-optimize', id, bytes, options }
 *   IN:  { type: 'pdf-preview',  id, bytes, pageIndex, scale }
 *   IN:  { type: 'pdf-extract',  id, bytes, pages }        // P2: pages to KEEP
 *   IN:  { type: 'pdf-split',    id, bytes, ranges }       // P2: page-index groups
 *   IN:  { type: 'pdf-merge',    id, docs }                // P2: PDF byte arrays, in order
 *   IN:  { type: 'pdf-from-images', id, images }           // P3: JPEG/PNG byte arrays → PDF
 *   IN:  { type: 'pdf-rasterize', id, bytes, options }     // P4: PDF → one image per page
 *   OUT: { type: 'info',     id, info }
 *   OUT: { type: 'progress', id, done, total }      // emitted during optimize + rasterize
 *   OUT: { type: 'result',   id, bytes, outputSize } // optimize / extract / merge result
 *   OUT: { type: 'splitResult', id, parts, sizes }   // P2: array of PDF byte arrays
 *   OUT: { type: 'rasterResult', id, pages, format }  // P4: array of image byte arrays
 *   OUT: { type: 'preview',  id, png, width, height } // transferable PNG bytes
 *   OUT: { type: 'error',    id, message }
 *
 * Worker globals (`self`, `postMessage`, `ImageBitmap`, etc.) come from the flat
 * ESLint config's worker-globals override for src/modules/**\/*-worker.js.
 *
 * STATUS: live. All engine methods are implemented in pdf-engine.js (MuPDF,
 * Approach B) and wired to the UI via pdf-ui.js / the image-export flow:
 * getInfo/optimize/renderPagePreview (P1), extractPages/split/merge (P2),
 * imagesToPdf (P3), pdfToImages (P4).
 */

import {
  getInfo,
  optimize,
  renderPagePreview,
  extractPages,
  split,
  merge,
  imagesToPdf,
  pdfToImages,
} from './pdf-engine.js';

/**
 * Copy bytes into a fresh, transferable ArrayBuffer.
 *
 * MuPDF returns Uint8Arrays that are often VIEWS onto its WebAssembly heap, and
 * a WASM-memory ArrayBuffer is not detachable — passing `view.buffer` in the
 * postMessage transfer list throws "ArrayBuffer ... is not detachable and could
 * not be transferred". Copying into a standalone buffer makes it transferable
 * (one copy, same cost as the structured clone we'd otherwise pay).
 * @param {Uint8Array} u8
 * @returns {Uint8Array}
 */
function toTransferable(u8) {
  const copy = new Uint8Array(u8.length);
  copy.set(u8);
  return copy;
}

self.onmessage = async function (e) {
  const msg = e.data || {};
  const { type, id } = msg;

  try {
    switch (type) {
      case 'pdf-info': {
        const info = await getInfo(msg.bytes);
        self.postMessage({ type: 'info', id, info });
        break;
      }

      case 'pdf-optimize': {
        const onProgress = (done, total) => self.postMessage({ type: 'progress', id, done, total });
        const out = await optimize(msg.bytes, { ...msg.options, onProgress });
        // Copy off the WASM heap so the buffer is transferable (see toTransferable).
        const result = toTransferable(out);
        self.postMessage({ type: 'result', id, bytes: result, outputSize: result.byteLength }, [
          result.buffer,
        ]);
        break;
      }

      case 'pdf-preview': {
        const { png, width, height } = await renderPagePreview(
          msg.bytes,
          msg.pageIndex,
          msg.scale ?? 0.3
        );
        const pngOut = toTransferable(png);
        self.postMessage({ type: 'preview', id, png: pngOut, width, height }, [pngOut.buffer]);
        break;
      }

      case 'pdf-extract': {
        // Extract (or, by passing the pages to KEEP, remove) into one new PDF.
        const out = toTransferable(await extractPages(msg.bytes, msg.pages));
        self.postMessage({ type: 'result', id, bytes: out, outputSize: out.byteLength }, [
          out.buffer,
        ]);
        break;
      }

      case 'pdf-split': {
        // One new PDF per range; transfer every part's buffer in a single message.
        const results = await split(msg.bytes, msg.ranges);
        const parts = results.map(toTransferable);
        const sizes = parts.map((p) => p.byteLength);
        self.postMessage(
          { type: 'splitResult', id, parts, sizes },
          parts.map((p) => p.buffer)
        );
        break;
      }

      case 'pdf-merge': {
        // Combine multiple PDFs (msg.docs, in order) into one. The input buffers
        // are structure-cloned (not transferred) so the caller's merge list stays
        // intact for re-merging; only the result buffer is transferred back.
        const out = toTransferable(await merge(msg.docs));
        self.postMessage({ type: 'result', id, bytes: out, outputSize: out.byteLength }, [
          out.buffer,
        ]);
        break;
      }

      case 'pdf-from-images': {
        // One page per image (msg.images = JPEG/PNG byte arrays, in order).
        const out = toTransferable(await imagesToPdf(msg.images));
        self.postMessage({ type: 'result', id, bytes: out, outputSize: out.byteLength }, [
          out.buffer,
        ]);
        break;
      }

      case 'pdf-rasterize': {
        // One image per page; stream per-page progress, transfer every buffer.
        const onProgress = (done, total) => self.postMessage({ type: 'progress', id, done, total });
        const rendered = await pdfToImages(msg.bytes, { ...msg.options, onProgress });
        const pages = rendered.map(toTransferable);
        const format = msg.options?.format === 'jpeg' ? 'jpeg' : 'png';
        self.postMessage(
          { type: 'rasterResult', id, pages, format },
          pages.map((p) => p.buffer)
        );
        break;
      }

      default:
        // Ignore unrelated messages so this worker can coexist on a shared channel.
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
