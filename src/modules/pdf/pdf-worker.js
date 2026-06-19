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
 *   OUT: { type: 'info',     id, info }
 *   OUT: { type: 'progress', id, done, total }      // emitted during optimize
 *   OUT: { type: 'result',   id, bytes, outputSize } // optimize result
 *   OUT: { type: 'preview',  id, png, width, height } // transferable PNG bytes
 *   OUT: { type: 'error',    id, message }
 *
 * Worker globals (`self`, `postMessage`, `ImageBitmap`, etc.) come from the flat
 * ESLint config's worker-globals override for src/modules/**\/*-worker.js.
 *
 * STATUS: live. getInfo/optimize/renderPagePreview are implemented in
 * pdf-engine.js (MuPDF, Approach B). The P1 optimize path (pdf-info /
 * pdf-optimize / pdf-preview) is wired to the UI via pdf-ui.js. The Phase 2+
 * engine methods (merge/split/extractPages/imagesToPdf/pdfToImages) still throw
 * NotImplementedError and surface via the 'error' message.
 */

import { getInfo, optimize, renderPagePreview } from './pdf-engine.js';

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

      default:
        // Ignore unrelated messages so this worker can coexist on a shared channel.
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
