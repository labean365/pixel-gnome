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
 * STATUS: scaffold. The engine methods it calls are not implemented yet
 * (pdf-engine.js throws NotImplementedError); errors surface via the 'error'
 * message until the backend is wired in.
 */

import { getInfo, optimize, renderPagePreview } from './pdf-engine.js';

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
        // Transfer the underlying buffer to avoid a copy back to the main thread.
        self.postMessage({ type: 'result', id, bytes: out, outputSize: out.byteLength }, [
          out.buffer,
        ]);
        break;
      }

      case 'pdf-preview': {
        const { png, width, height } = await renderPagePreview(
          msg.bytes,
          msg.pageIndex,
          msg.scale ?? 0.3
        );
        self.postMessage({ type: 'preview', id, png, width, height }, [png.buffer]);
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
