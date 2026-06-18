/**
 * batch-manager.js
 * Manages batch image processing with sequential execution,
 * progress tracking, and ZIP export.
 *
 * Phase 9: Web Worker offloading — delegates standard image processing
 * (JPEG, PNG, WebP, GIF) to a Web Worker using OffscreenCanvas.
 * SVG and HEIC files fall back to main-thread processing (they need DOM APIs).
 *
 * When the worker is unavailable (no OffscreenCanvas support), all images
 * process on the main thread as before.
 */

import { processImage } from './image-processor.js';
import { isHeicFile } from './heic-decoder.js';
import JSZip from 'jszip';
import { buildOutputFilename, downloadBlob } from './exporter.js';

/**
 * @typedef {Object} BatchItem
 * @property {string} id
 * @property {File} file
 * @property {import('./image-processor.js').ProcessResult | null} result
 * @property {'pending'|'processing'|'done'|'error'} status
 * @property {string} [errorMessage]
 */

/**
 * @typedef {Object} BatchCallbacks
 * @property {function(string, string): void} onItemStatus - (id, status) item status changed
 * @property {function(string, import('./image-processor.js').ProcessResult): void} onItemResult - (id, result) item finished
 * @property {function(string, string): void} onItemError - (id, message) item failed
 * @property {function(number, number): void} onProgress - (completed, total) progress update
 * @property {function(): void} onBatchComplete - all items done
 */

let isProcessing = false;
let shouldCancel = false;

// --- Web Worker setup ---

let worker = null;
let workerSupported = false;
let pendingWorkerJobs = new Map(); // id → { resolve, reject }

/**
 * Initialize the Web Worker (called once on first batch).
 * Feature-detects OffscreenCanvas before spawning.
 */
function initWorker() {
  if (worker !== null) return; // Already initialized (or attempted)

  try {
    // Feature-detect OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined') {
      workerSupported = false;
      return;
    }

    // The new URL() pattern MUST be directly visible to Vite's static
    // analysis so it emits the worker as a separate chunk in multi-file builds.
    // Keep this line at the top — before any guards that might cause early return.
    const workerUrl = new URL('./process-worker.js', import.meta.url);

    // In single-file builds or local file:// usage, the worker file won't exist.
    // Skip worker setup — everything falls back to main-thread processing.
    const base = import.meta.url;
    if (base.startsWith('data:') || base.startsWith('blob:') || base.startsWith('file:')) {
      workerSupported = false;
      return;
    }

    worker = new Worker(workerUrl, { type: 'module' });

    worker.onmessage = (e) => {
      const { type, id } = e.data;
      const job = pendingWorkerJobs.get(id);
      if (!job) return;

      pendingWorkerJobs.delete(id);

      if (type === 'result') {
        job.resolve({
          blob: e.data.blob,
          outputWidth: e.data.outputWidth,
          outputHeight: e.data.outputHeight,
          outputSize: e.data.outputSize,
          achievedQuality: e.data.achievedQuality,
          smartCompress: e.data.smartCompress,
          lossless: e.data.lossless,
        });
      } else if (type === 'error') {
        job.reject(new Error(e.data.message));
      }
    };

    worker.onerror = (e) => {
      console.warn('PixelGnome: Worker error, falling back to main thread.', e);
      workerSupported = false;
      // Reject all pending jobs so they can retry on main thread
      for (const [id, job] of pendingWorkerJobs) {
        job.reject(new Error('Worker failed'));
      }
      pendingWorkerJobs.clear();
      worker.terminate();
      worker = null;
    };

    workerSupported = true;
  } catch (err) {
    console.warn('PixelGnome: Could not create worker:', err);
    workerSupported = false;
    worker = null;
  }
}

/**
 * Check if a file needs main-thread processing (SVG or HEIC).
 */
function needsMainThread(file) {
  if (isHeicFile(file)) return true;
  if (file.type === 'image/svg+xml') return true;
  if (file.name && file.name.toLowerCase().endsWith('.svg')) return true;
  return false;
}

/**
 * Process a single image via the Web Worker.
 * @returns {Promise<ProcessResult>}
 */
function processViaWorker(file, settings) {
  return new Promise((resolve, reject) => {
    const id = `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingWorkerJobs.set(id, { resolve, reject });

    // Send the file as a blob to the worker
    worker.postMessage({
      type: 'process',
      id,
      blob: file,
      settings: {
        mode: settings.mode,
        width: settings.width,
        height: settings.height,
        format: settings.format,
        quality: settings.quality,
        neverUpscale: settings.neverUpscale,
        targetSizeKB: settings.targetSizeKB || 0,
      },
    });
  });
}

/**
 * Process a batch of items sequentially.
 * Uses Web Worker for standard formats, main thread for SVG/HEIC.
 *
 * @param {BatchItem[]} items - Array of batch items to process
 * @param {import('./settings.js').ProcessSettings} settings
 * @param {BatchCallbacks} callbacks
 */
export async function processBatch(items, settings, callbacks) {
  if (isProcessing) return;
  isProcessing = true;
  shouldCancel = false;

  // Initialize worker on first batch
  initWorker();

  const total = items.length;
  let completed = 0;

  for (const item of items) {
    if (shouldCancel) break;
    if (item.status === 'done') {
      completed++;
      continue;
    }

    // Update status
    item.status = 'processing';
    callbacks.onItemStatus(item.id, 'processing');

    try {
      let result;

      // Route: main thread for SVG/HEIC/edited images, worker for standard
      const hasEdits =
        item.edits &&
        (item.edits.rotation !== 0 ||
          item.edits.flipH ||
          item.edits.flipV ||
          item.edits.crop !== null);

      if (workerSupported && !needsMainThread(item.file) && !hasEdits) {
        try {
          result = await processViaWorker(item.file, settings);
        } catch {
          // Worker failed for this image — fall back to main thread
          result = await processImage(item.file, settings, item.edits);
        }
      } else {
        result = await processImage(item.file, settings, item.edits);
      }

      result.originalSize = item.file.size;
      item.result = result;
      item.status = 'done';
      callbacks.onItemResult(item.id, result);
    } catch (err) {
      item.status = 'error';
      item.errorMessage = err.message || 'Processing failed';
      item.result = null;
      callbacks.onItemError(item.id, item.errorMessage);
    }

    completed++;
    callbacks.onProgress(completed, total);

    // Yield to browser for UI updates between images
    await yieldToUI();
  }

  isProcessing = false;
  shouldCancel = false;
  callbacks.onBatchComplete();
}

/**
 * Cancel a running batch
 */
export function cancelBatch() {
  shouldCancel = true;
}

/**
 * Check if a batch is currently processing
 */
export function isBatchProcessing() {
  return isProcessing;
}

/**
 * Check if the Web Worker is available and active.
 * @returns {boolean}
 */
export function isWorkerAvailable() {
  return workerSupported;
}

/**
 * Export all successful results as a ZIP file.
 * Handles filename collisions by appending a counter.
 *
 * @param {BatchItem[]} items - Items with results
 * @param {string} pattern - Filename pattern with tokens
 * @param {string} format - Output format
 * @param {(pct: number) => void} [onProgress] - Optional 0-100 progress callback
 *   driven by JSZip's internal `onUpdate`. Fires during zip build only (not
 *   during file staging above, which is synchronous).
 * @returns {Promise<void>}
 */
export async function exportAsZip(items, pattern, format, onProgress) {
  const zip = new JSZip();
  const usedNames = new Map(); // track name collisions

  for (const item of items) {
    if (!item.result) continue;

    let filename = buildOutputFilename(item.file.name, pattern, format, {
      width: item.result.outputWidth,
      height: item.result.outputHeight,
    });

    // Handle filename collisions
    if (usedNames.has(filename)) {
      const count = usedNames.get(filename) + 1;
      usedNames.set(filename, count);

      // Insert counter before extension: photo-web.jpg → photo-web-2.jpg
      const lastDot = filename.lastIndexOf('.');
      const base = filename.substring(0, lastDot);
      const ext = filename.substring(lastDot);
      filename = `${base}-${count}${ext}`;
    } else {
      usedNames.set(filename, 1);
    }

    zip.file(filename, item.result.blob);
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'STORE', // Images are already compressed; no need to re-compress
    },
    // JSZip's onUpdate fires many times with { percent, currentFile }. We
    // only need the percent — throttling is unnecessary since the host
    // already uses CSS transitions on the progress bar width.
    onProgress
      ? (meta) => {
          if (typeof meta.percent === 'number') onProgress(meta.percent);
        }
      : undefined
  );

  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(zipBlob, `pixelgnome-${timestamp}.zip`);
}

/**
 * Yield to the browser for a frame so UI updates render
 */
function yieldToUI() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}
