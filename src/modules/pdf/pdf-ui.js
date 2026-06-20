// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf/pdf-ui.js
 * PDF toolkit UI — a self-contained modal that opens when the user drops/picks a
 * single PDF. Owns the lazy pdf-worker lifecycle and drives the worker message
 * protocol. Two modes, switched by a segmented control:
 *   - Compress (P1): presets + advanced toggles/slider, page preview, before/
 *     after size readout (pdf-info / pdf-optimize / pdf-preview).
 *   - Organize (P2): a page-thumbnail selection grid for extract / remove pages
 *     (→ one PDF) and split into multiple files (→ a ZIP via JSZip)
 *     (pdf-extract / pdf-split, reusing pdf-preview for thumbnails).
 *   - Merge (P2): a reorderable list of PDFs (the open one + "Add PDFs") combined
 *     top-to-bottom into one file (pdf-merge). Multi-PDF drops open here directly.
 *   - To Images (P4): rasterize every page to PNG/JPEG at a chosen DPI
 *     (pdf-rasterize) → download a ZIP, or send the pages into the image queue
 *     via the registered image-import handler.
 *
 * Also exports imagesToPdfBlob() (P3) for the headless image-export "Combine
 * into PDF" action.
 *
 * Privacy: everything runs client-side. The multi-MB MuPDF wasm lives only
 * inside pdf-worker.js and is referenced via `new URL(... , import.meta.url)`,
 * so nothing here statically imports the engine — the wasm loads off the main
 * thread, lazily, and is excluded from the portable single-file build
 * (VITE_PDF_ENABLED === 'false'; see vite.singlefile.config.js).
 */

import JSZip from 'jszip';
import { t } from '../i18n.js';
import { showToast } from '../toast.js';
import { announce } from '../announcer.js';
import { trackUrl, revokeUrl } from '../resource-tracker.js';
import { trackPdfOptimized, trackPdfOrganized, trackPdfRasterized } from '../analytics.js';

/**
 * Whether the PDF feature is compiled into this build. The single-file build
 * defines this as the string 'false' and stubs out `mupdf`, so PDF is absent
 * there (wasm can't be inlined into one HTML file).
 */
export function isPdfSupported() {
  return import.meta.env.VITE_PDF_ENABLED !== 'false';
}

/**
 * Register the handler that "Send to editor" (PDF → images) calls with the
 * rasterized pages as File objects. main.js wires this to its image-queue
 * ingestion; kept as a registration to avoid a circular import.
 * @param {(files: File[]) => void} fn
 */
export function setImageImportHandler(fn) {
  imageImportHandler = typeof fn === 'function' ? fn : null;
}

/**
 * Headlessly read a dropped PDF's page count and render a first-page thumbnail,
 * for the unified-intake card (C1). Reuses the same lazy pdf-worker as the modal
 * — no UI, and it never touches the modal's module state. The thumbnail object
 * URL is registered with the resource tracker (and revoked per-card on remove /
 * globally on Clear All).
 * @param {File} file
 * @returns {Promise<{ pageCount: number, fileSize: number, thumbnailUrl: string|null }>}
 */
export async function getPdfCardMeta(file) {
  if (!isPdfSupported()) throw new Error(t('pdf.errorUnsupported'));
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const infoRes = await call('pdf-info', { bytes });
  const pageCount = infoRes?.info?.pageCount ?? 0;
  let thumbnailUrl = null;
  try {
    const prev = await call('pdf-preview', { bytes, pageIndex: 0, scale: 0.4 });
    const png = prev.png instanceof Uint8Array ? prev.png : new Uint8Array(prev.png);
    thumbnailUrl = trackUrl(URL.createObjectURL(new Blob([png], { type: 'image/png' })));
  } catch {
    /* thumbnail is optional — the card shows a placeholder icon */
  }
  return { pageCount, fileSize: file.size, thumbnailUrl };
}

// Preset → JPEG image quality (0–1). Tuned defaults; revisit with real docs.
const PRESETS = {
  email: 0.5,
  web: 0.72,
  max: 0.9,
};
const DEFAULT_PRESET = 'web';

// --- Module state (one modal at a time) ---
let backdrop = null;
let worker = null;
let msgSeq = 0;
const pending = new Map(); // id → { resolve, reject, onProgress }

let srcBytes = null; // Uint8Array of the source PDF
let srcFile = null; // original File (for name + size)
let resultBytes = null; // optimized Uint8Array, once produced
let resultUrl = null; // object URL for the current download (PDF or ZIP)
let pdfInfo = null; // { pageCount, fileSize, hasText, imageCount }
let busy = false; // an optimize/organize run is in flight

// Page-grid state (C2 drill-in — the grid is the primary surface).
const selectedPages = new Set(); // 0-based ORIGINAL indices selected in the grid
let thumbObserver = null; // IntersectionObserver for lazy thumbnails
const thumbUrls = []; // object URLs for thumbnails (revoked on close)
const thumbCache = new Map(); // origIndex → thumbnail URL (survives grid rebuilds)

// Edit model (C2): pending page edits, baked into bytes only on Apply/Export.
let pageOrder = []; // original page indices in display order (deletes drop them)
const rotations = new Map(); // origIndex → degrees (90/180/270); 0 ⇒ absent
let dragSrcPage = null; // origIndex being dragged (reorder)
let onApplyHandler = null; // called with the edited File so the card can persist

// To-Images (rasterize) state.
let rasterFormat = 'png'; // 'png' | 'jpeg'
let rasterDpi = 150; // 96 (screen) | 150 (standard) | 300 (print)
let rasterCache = null; // { key, pages:[Uint8Array], format } — last render, reused

// Registered by main.js so "Send to editor" can hand page images to the queue
// (set via setImageImportHandler — avoids a circular import).
let imageImportHandler = null;

/* ------------------------------------------------------------------ */
/* Worker plumbing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Lazily create the PDF worker. Mirrors batch-manager's guards: the
 * `new URL(...)` MUST be statically visible to Vite, and we bail out in
 * single-file / file:// contexts where a separate worker module can't load.
 * @returns {boolean} true if the worker is available.
 */
function ensureWorker() {
  if (worker) return true;
  if (!isPdfSupported()) return false;
  try {
    const base = import.meta.url;
    if (base.startsWith('data:') || base.startsWith('blob:') || base.startsWith('file:')) {
      return false;
    }
    // The `new URL(...)` MUST be inline inside `new Worker(...)` — the bundler
    // only detects and emits the worker chunk for this exact form (a hoisted
    // `const url = new URL(...)` is left unresolved and 404s in production).
    worker = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onWorkerMessage;
    worker.onerror = () => {
      // Fail every in-flight job; the modal surfaces the error.
      for (const [, job] of pending) job.reject(new Error(t('pdf.errorEngine')));
      pending.clear();
      destroyWorker();
    };
    return true;
  } catch {
    destroyWorker();
    return false;
  }
}

function destroyWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
  }
  worker = null;
}

function onWorkerMessage(e) {
  const msg = e.data || {};
  const job = pending.get(msg.id);
  if (!job) return;
  if (msg.type === 'progress') {
    if (job.onProgress) job.onProgress(msg.done, msg.total);
    return;
  }
  pending.delete(msg.id);
  if (msg.type === 'error') {
    job.reject(new Error(msg.message || t('pdf.errorGeneric')));
  } else {
    job.resolve(msg);
  }
}

/** Send one request to the worker and await its matching reply. */
function call(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    if (!ensureWorker()) {
      reject(new Error(t('pdf.errorUnsupported')));
      return;
    }
    const id = ++msgSeq;
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ type, id, ...payload });
  });
}

/* ------------------------------------------------------------------ */
/* Public entry                                                       */
/* ------------------------------------------------------------------ */

/**
 * Open the PDF drill-in editor for a single file (C2): a full-screen editing
 * surface with the page grid as the primary content and compress / extract /
 * remove / split / to-images as tools. Reached from a PDF card in the workspace.
 * @param {File} file
 * @param {{ onApply?: (file: File) => void }} [opts] - onApply receives the
 *   edited PDF as a File so the calling card can persist it (C2 "Apply").
 */
export async function openPdfModal(file, opts = {}) {
  if (backdrop) return; // one at a time

  if (!isPdfSupported()) {
    showToast(t('pdf.errorUnsupported'), 'error', 6000);
    return;
  }

  srcFile = file;
  onApplyHandler = typeof opts.onApply === 'function' ? opts.onApply : null;
  resultBytes = null;
  selectedPages.clear();
  rotations.clear();
  pageOrder = [];
  thumbCache.clear();
  dragSrcPage = null;
  rasterFormat = 'png';
  rasterDpi = 150;
  rasterCache = null;

  renderShell();
  setStatus(t('pdf.loading'), 'info', true);

  try {
    const buf = await file.arrayBuffer();
    srcBytes = new Uint8Array(buf);
  } catch {
    setStatus(t('pdf.errorRead'), 'error');
    return;
  }

  // Inspect, then build the page grid (the drill-in's primary surface).
  try {
    const res = await call('pdf-info', { bytes: srcBytes });
    pdfInfo = res.info;
    pageOrder = Array.from({ length: pdfInfo.pageCount }, (_, i) => i);
    renderInfo();
    buildPageGrid();
    setStatus('');
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  }
}

/**
 * Build one PDF from a list of image Blobs — one image per page, each page sized
 * to its image. Powers the image-export "Combine into PDF" action; it drives the
 * same lazy pdf-worker as the modal, but headless (no UI).
 *
 * MuPDF's wasm build only decodes JPEG/PNG, so each blob is normalized first:
 * JPEG/PNG pass through untouched (lossless, and JPEG stays compact DCTDecode);
 * anything else (WebP/AVIF/GIF/…) is re-encoded to JPEG over a white background
 * via canvas (the browser can decode any format). Transparency is flattened.
 * @param {Blob[]} blobs  Processed image blobs, in page order.
 * @returns {Promise<Blob>} an application/pdf blob.
 */
export async function imagesToPdfBlob(blobs) {
  if (!isPdfSupported()) throw new Error(t('pdf.errorUnsupported'));
  if (!Array.isArray(blobs) || blobs.length === 0) throw new Error(t('pdf.img.errNone'));
  const images = [];
  for (const blob of blobs) images.push(await normalizeForPdf(blob));
  const res = await call('pdf-from-images', { images });
  const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Merge several PDF Blobs into one, top-to-bottom in the given order. Reads each
 * blob to bytes and drives the existing `pdf-merge` worker op (same engine the
 * Merge modal uses), then wraps the result bytes as an application/pdf Blob.
 * @param {Blob[]} pdfBlobs  PDF blobs, in output order.
 * @returns {Promise<Blob>} an application/pdf blob.
 */
export async function mergePdfBlobs(pdfBlobs) {
  if (!isPdfSupported()) throw new Error(t('pdf.errorUnsupported'));
  if (!Array.isArray(pdfBlobs) || pdfBlobs.length === 0) throw new Error(t('pdf.img.errNone'));
  const docs = [];
  for (const blob of pdfBlobs) docs.push(new Uint8Array(await blob.arrayBuffer()));
  const res = await call('pdf-merge', { docs });
  const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Combine a mixed, ordered list of image + PDF entries into one PDF (C4
 * "Combine to PDF"). Order is preserved: adjacent image runs are collapsed into
 * a single `imagesToPdfBlob` call (each image → one page), PDF entries pass
 * through as-is, then every resulting PDF is merged in order via `pdf-merge`.
 *
 * Short-circuits avoid needless re-encodes: an all-image list goes straight to
 * one `imagesToPdfBlob`; a single PDF entry is returned untouched; a single
 * image becomes a one-page PDF.
 * @param {{ type: 'image' | 'pdf', blob: Blob }[]} entries  Entries in page order.
 * @returns {Promise<Blob>} an application/pdf blob.
 */
export async function combineMixedToPdf(entries) {
  if (!isPdfSupported()) throw new Error(t('pdf.errorUnsupported'));
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(t('pdf.img.errNone'));

  // Short-circuits.
  if (entries.every((e) => e.type === 'image')) {
    return imagesToPdfBlob(entries.map((e) => e.blob));
  }
  if (entries.length === 1) {
    const only = entries[0];
    return only.type === 'pdf' ? only.blob : imagesToPdfBlob([only.blob]);
  }

  // Walk in order, collapsing adjacent image runs into one PDF each.
  const pdfBlobs = [];
  let imageRun = [];
  const flushImages = async () => {
    if (imageRun.length === 0) return;
    pdfBlobs.push(await imagesToPdfBlob(imageRun));
    imageRun = [];
  };
  for (const entry of entries) {
    if (entry.type === 'pdf') {
      await flushImages();
      pdfBlobs.push(entry.blob);
    } else {
      imageRun.push(entry.blob);
    }
  }
  await flushImages();

  if (pdfBlobs.length === 1) return pdfBlobs[0];
  return mergePdfBlobs(pdfBlobs);
}

/** JPEG/PNG → raw bytes (pass-through); any other format → JPEG bytes via canvas. */
async function normalizeForPdf(blob) {
  const type = blob.type || '';
  if (type === 'image/jpeg' || type === 'image/png') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // flatten transparency to white for the page
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const out = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('image encode failed'))),
        'image/jpeg',
        0.92
      )
    );
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bitmap.close?.();
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderShell() {
  backdrop = document.createElement('div');
  backdrop.className = 'pdf-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', t('pdf.dialogAria'));

  backdrop.innerHTML = `
    <div class="pdf-modal">
      <div class="pdf-modal-header pdf-drillin-header">
        <button class="btn btn-icon pdf-back" data-action="close" title="${t('pdf.back')}" aria-label="${t('pdf.backAria')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <span class="pdf-modal-info" id="pdfInfo">${t('pdf.loading')}</span>
      </div>

      <div class="pdf-modal-body">
        <!-- Page grid is the primary surface (C2 drill-in). -->
        <div class="pdf-select-toolbar" id="pdfSelectToolbar">
          <button type="button" class="pdf-linkbtn" data-action="select-all">${t('pdf.org.selectAll')}</button>
          <button type="button" class="pdf-linkbtn" data-action="select-none">${t('pdf.org.clear')}</button>
          <span class="pdf-select-count" id="pdfSelectCount"></span>
          <span class="pdf-toolbar-spacer"></span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="rotate-ccw" id="pdfRotateCcwBtn" disabled>${t('pdf.edit.rotateLeft')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="rotate-cw" id="pdfRotateCwBtn" disabled>${t('pdf.edit.rotateRight')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="delete" id="pdfDeleteBtn" disabled>${t('pdf.edit.delete')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="extract" id="pdfExtractBtn" disabled>${t('pdf.org.buildOp.extract')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="remove" id="pdfRemoveBtn" disabled>${t('pdf.org.buildOp.remove')}</button>
        </div>

        <div class="pdf-page-grid" id="pdfPageGrid"></div>

        <!-- Secondary actions as collapsible panels -->
        <details class="pdf-panel" id="pdfPanelCompress">
          <summary>${t('pdf.mode.compress')}</summary>
          <div class="pdf-panel-body">
            <div class="pdf-presets" role="group" aria-label="${t('pdf.presetsAria')}">
              ${Object.keys(PRESETS)
                .map(
                  (key) =>
                    `<button class="pdf-preset${key === DEFAULT_PRESET ? ' active' : ''}" data-preset="${key}">${t('pdf.preset.' + key)}</button>`
                )
                .join('')}
            </div>
            <details class="pdf-advanced">
              <summary>${t('pdf.advanced')}</summary>
              <div class="pdf-advanced-body">
                <label class="pdf-slider-row">
                  <span>${t('pdf.quality')}</span>
                  <input type="range" id="pdfQuality" min="10" max="100" step="1" value="${Math.round(PRESETS[DEFAULT_PRESET] * 100)}">
                  <output id="pdfQualityOut">${Math.round(PRESETS[DEFAULT_PRESET] * 100)}</output>
                </label>
                <label class="pdf-toggle"><input type="checkbox" id="pdfRecompress" checked> ${t('pdf.opt.recompress')}</label>
                <label class="pdf-toggle"><input type="checkbox" id="pdfStripMeta" checked> ${t('pdf.opt.stripMeta')}</label>
                <label class="pdf-toggle"><input type="checkbox" id="pdfSubsetFonts" checked> ${t('pdf.opt.subsetFonts')}</label>
                <label class="pdf-toggle"><input type="checkbox" id="pdfGarbage" checked> ${t('pdf.opt.garbage')}</label>
              </div>
            </details>
            <div class="pdf-actions">
              <button class="btn btn-primary" data-action="optimize" id="pdfOptimizeBtn">${t('pdf.optimize')}</button>
            </div>
          </div>
        </details>

        <details class="pdf-panel" id="pdfPanelSplit">
          <summary>${t('pdf.org.opSplit')}</summary>
          <div class="pdf-panel-body">
            <label class="pdf-op-row">
              <span>${t('pdf.org.splitMode')}</span>
              <select id="pdfSplitMode">
                <option value="each">${t('pdf.org.splitEach')}</option>
                <option value="ranges">${t('pdf.org.splitRanges')}</option>
              </select>
            </label>
            <label class="pdf-ranges-row" id="pdfRangesRow" hidden>
              <span>${t('pdf.org.ranges')}</span>
              <input type="text" id="pdfRanges" inputmode="numeric" placeholder="${t('pdf.org.rangesHint')}">
            </label>
            <div class="pdf-actions">
              <button class="btn btn-primary" data-action="split" id="pdfSplitBtn">${t('pdf.org.buildOp.split')}</button>
            </div>
          </div>
        </details>

        <details class="pdf-panel" id="pdfPanelToImages">
          <summary>${t('pdf.mode.toImages')}</summary>
          <div class="pdf-panel-body">
            <p class="pdf-organize-hint">${t('pdf.img2.hint')}</p>
            <div class="pdf-op-row">
              <span>${t('pdf.img2.format')}</span>
              <div class="pdf-presets" role="group" aria-label="${t('pdf.img2.format')}">
                <button class="pdf-preset active" data-raster-format="png">PNG</button>
                <button class="pdf-preset" data-raster-format="jpeg">JPEG</button>
              </div>
            </div>
            <div class="pdf-op-row">
              <span>${t('pdf.img2.resolution')}</span>
              <div class="pdf-presets" role="group" aria-label="${t('pdf.img2.resolution')}">
                <button class="pdf-preset" data-raster-dpi="96">${t('pdf.img2.dpiScreen')}</button>
                <button class="pdf-preset active" data-raster-dpi="150">${t('pdf.img2.dpiStandard')}</button>
                <button class="pdf-preset" data-raster-dpi="300">${t('pdf.img2.dpiPrint')}</button>
              </div>
            </div>
            <div class="pdf-actions">
              <button class="btn btn-primary" data-action="raster-zip" id="pdfRasterZipBtn">${t('pdf.img2.downloadZip')}</button>
              <button class="btn btn-secondary" data-action="raster-editor" id="pdfRasterEditorBtn">${t('pdf.img2.sendToEditor')}</button>
            </div>
          </div>
        </details>

        <div class="pdf-status" id="pdfStatus" role="status" aria-live="polite"></div>

        <div class="pdf-edit-bar" id="pdfEditBar" hidden>
          <span class="pdf-preflight" id="pdfPreflight"></span>
          <span class="pdf-toolbar-spacer"></span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="reset-edits">${t('pdf.edit.reset')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="export-edits">${t('pdf.edit.export')}</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="apply-edits">${t('pdf.edit.apply')}</button>
        </div>

        <div class="pdf-actions pdf-download-row">
          <a class="btn btn-secondary" data-action="download" id="pdfDownloadBtn" hidden download>${t('pdf.download')}</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  wireEvents();
  backdrop.querySelector('[data-action="close"]').focus();
}

function renderInfo() {
  const el = byId('pdfInfo');
  if (!el || !pdfInfo) return;
  const parts = [
    escapeHtml(srcFile.name),
    t('pdf.pages', { count: pdfInfo.pageCount }),
    formatBytes(pdfInfo.fileSize),
  ];
  let html = `<span class="pdf-info-name">${parts.join(' · ')}</span>`;
  if (pdfInfo.hasText) {
    html += ` <span class="pdf-badge" title="${t('pdf.textPreservedHint')}">${t('pdf.textPreserved')}</span>`;
  }
  el.innerHTML = html;
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

function wireEvents() {
  backdrop.querySelector('[data-action="close"]').addEventListener('click', closePdfModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && !busy) closePdfModal();
  });
  document.addEventListener('keydown', onKeyDown);

  // Compress presets set the slider; moving the slider clears the active preset.
  // Scoped to [data-preset] so the To-Images format/DPI buttons (which also carry
  // .pdf-preset) don't get caught by the compress handler.
  backdrop.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const q = PRESETS[btn.dataset.preset];
      const slider = byId('pdfQuality');
      if (slider) {
        slider.value = String(Math.round(q * 100));
        syncQualityOutput();
      }
    });
  });

  const slider = byId('pdfQuality');
  if (slider) {
    slider.addEventListener('input', () => {
      backdrop.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('active'));
      syncQualityOutput();
    });
  }

  byId('pdfOptimizeBtn').addEventListener('click', runOptimize);

  // --- Page grid: selection toolbar + extract / remove ---
  const toolbar = byId('pdfSelectToolbar');
  if (toolbar) {
    toolbar.addEventListener('click', (e) => {
      const act = e.target?.closest('[data-action]')?.dataset?.action;
      if (act === 'select-all') selectAllPages(true);
      else if (act === 'select-none') selectAllPages(false);
      else if (act === 'rotate-ccw') rotateSelected('ccw');
      else if (act === 'rotate-cw') rotateSelected('cw');
      else if (act === 'delete') deleteSelected();
      else if (act === 'extract') extractSelected();
      else if (act === 'remove') removeSelected();
    });
  }

  // --- Edit bar: reset / export / apply (page edits) ---
  const editBar = byId('pdfEditBar');
  if (editBar) {
    editBar.addEventListener('click', (e) => {
      const act = e.target?.closest('[data-action]')?.dataset?.action;
      if (act === 'reset-edits') resetEdits();
      else if (act === 'export-edits') exportEdits();
      else if (act === 'apply-edits') applyEdits();
    });
  }

  // --- Split panel ---
  const splitMode = byId('pdfSplitMode');
  if (splitMode) {
    splitMode.addEventListener('change', () => {
      const row = byId('pdfRangesRow');
      if (row) row.hidden = splitMode.value !== 'ranges';
    });
  }
  byId('pdfSplitBtn').addEventListener('click', runSplit);

  // --- To Images (rasterize) ---
  backdrop.querySelectorAll('[data-raster-format]').forEach((btn) => {
    btn.addEventListener('click', () => setRasterFormat(btn.dataset.rasterFormat));
  });
  backdrop.querySelectorAll('[data-raster-dpi]').forEach((btn) => {
    btn.addEventListener('click', () => setRasterDpi(Number(btn.dataset.rasterDpi)));
  });
  byId('pdfRasterZipBtn').addEventListener('click', runRasterZip);
  byId('pdfRasterEditorBtn').addEventListener('click', runRasterToEditor);
}

function onKeyDown(e) {
  if (e.key === 'Escape' && !busy) closePdfModal();
}

function syncQualityOutput() {
  const slider = byId('pdfQuality');
  const out = byId('pdfQualityOut');
  if (slider && out) out.textContent = slider.value;
}

/* ------------------------------------------------------------------ */
/* Page grid                                                          */
/* ------------------------------------------------------------------ */

/** Build the lazy page-thumbnail grid (one tile per page, rendered on scroll). */
function buildPageGrid() {
  const grid = byId('pdfPageGrid');
  if (!grid || !pdfInfo) return;
  if (thumbObserver) thumbObserver.disconnect();
  grid.innerHTML = '';

  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const tile = entry.target;
          thumbObserver.unobserve(tile);
          renderThumb(Number(tile.dataset.page));
        }
      }
    },
    { root: grid, rootMargin: '120px' }
  );

  // Render in pageOrder (reflects reorder/delete); display number is the slot.
  pageOrder.forEach((orig, pos) => {
    const tile = document.createElement('label');
    tile.className = 'pdf-thumb';
    tile.dataset.page = String(orig);
    tile.draggable = true;
    tile.tabIndex = 0;
    const selected = selectedPages.has(orig);
    if (selected) tile.classList.add('selected');
    const deg = rotations.get(orig) || 0;
    const rot = deg ? ` style="transform: rotate(${deg}deg)"` : '';
    tile.innerHTML = `
      <input type="checkbox" class="pdf-thumb-check" data-page="${orig}"${selected ? ' checked' : ''} aria-label="${t('pdf.org.pageLabel', { n: pos + 1 })}">
      <span class="pdf-thumb-stage" aria-hidden="true"${rot}></span>
      <span class="pdf-thumb-no">${pos + 1}</span>`;
    const cb = tile.querySelector('.pdf-thumb-check');
    cb.addEventListener('change', () => togglePage(orig, cb.checked));
    wireTileDnd(tile, orig);
    grid.appendChild(tile);
    thumbObserver.observe(tile);
  });
  updateSelectionUI();
  updateEditBar();
}

/** Wire drag-and-drop + Alt+Arrow keyboard reorder on a page tile. */
function wireTileDnd(tile, orig) {
  tile.addEventListener('dragstart', (e) => {
    dragSrcPage = orig;
    tile.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  tile.addEventListener('dragend', () => {
    dragSrcPage = null;
    tile.classList.remove('dragging');
  });
  tile.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    movePage(dragSrcPage, orig);
  });
  tile.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const i = pageOrder.indexOf(orig);
    const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
    if (i < 0 || j < 0 || j >= pageOrder.length) return;
    [pageOrder[i], pageOrder[j]] = [pageOrder[j], pageOrder[i]];
    buildPageGrid();
    backdrop?.querySelector(`.pdf-thumb[data-page="${orig}"]`)?.focus();
  });
}

/** Move page `src` (original index) to just before page `target` in pageOrder. */
function movePage(src, target) {
  if (src == null || src === target) return;
  const from = pageOrder.indexOf(src);
  if (from < 0) return;
  pageOrder.splice(from, 1);
  const to = pageOrder.indexOf(target);
  pageOrder.splice(to < 0 ? pageOrder.length : to, 0, src);
  hideDownload();
  buildPageGrid();
}

/** Render one page thumbnail via the worker preview (cached by original index). */
async function renderThumb(index) {
  const stage = backdrop?.querySelector(`.pdf-thumb[data-page="${index}"] .pdf-thumb-stage`);
  if (!stage) return;
  if (thumbCache.has(index)) {
    stage.innerHTML = `<img src="${thumbCache.get(index)}" alt="" loading="lazy" />`;
    return;
  }
  stage.classList.add('loading');
  try {
    const res = await call('pdf-preview', { bytes: srcBytes, pageIndex: index, scale: 0.22 });
    const url = trackUrl(URL.createObjectURL(new Blob([res.png], { type: 'image/png' })));
    thumbCache.set(index, url);
    thumbUrls.push(url);
    stage.innerHTML = `<img src="${url}" alt="" loading="lazy" />`;
  } catch {
    stage.innerHTML = `<span class="pdf-thumb-fail">${index + 1}</span>`;
  } finally {
    stage.classList.remove('loading');
  }
}

function togglePage(index, checked) {
  if (checked) selectedPages.add(index);
  else selectedPages.delete(index);
  const tile = backdrop?.querySelector(`.pdf-thumb[data-page="${index}"]`);
  if (tile) tile.classList.toggle('selected', checked);
  hideDownload();
  updateSelectionUI();
}

function selectAllPages(on) {
  selectedPages.clear();
  if (on) for (const p of pageOrder) selectedPages.add(p);
  backdrop.querySelectorAll('.pdf-thumb').forEach((tile) => {
    tile.classList.toggle('selected', on);
    const cb = tile.querySelector('.pdf-thumb-check');
    if (cb) cb.checked = on;
  });
  hideDownload();
  updateSelectionUI();
}

/** Rotate the selected pages by ±90° (pending until Apply/Export). */
function rotateSelected(dir) {
  if (selectedPages.size === 0) return;
  const delta = dir === 'ccw' ? -90 : 90;
  for (const orig of selectedPages) {
    const next = ((((rotations.get(orig) || 0) + delta) % 360) + 360) % 360;
    if (next === 0) rotations.delete(orig);
    else rotations.set(orig, next);
    const stage = backdrop?.querySelector(`.pdf-thumb[data-page="${orig}"] .pdf-thumb-stage`);
    if (stage) stage.style.transform = next ? `rotate(${next}deg)` : '';
  }
  hideDownload();
  updateEditBar();
}

/** Delete the selected pages from the working order (pending until Apply/Export). */
function deleteSelected() {
  if (selectedPages.size === 0) return;
  if (selectedPages.size >= pageOrder.length) {
    setStatus(t('pdf.edit.errDeleteAll'), 'error');
    return;
  }
  pageOrder = pageOrder.filter((p) => !selectedPages.has(p));
  for (const p of selectedPages) rotations.delete(p);
  selectedPages.clear();
  hideDownload();
  buildPageGrid();
}

/** Update the selected-count label and enable/disable selection actions. */
function updateSelectionUI() {
  const countEl = byId('pdfSelectCount');
  const n = selectedPages.size;
  if (countEl) countEl.textContent = t('pdf.org.selectedCount', { count: n });
  if (!busy) setSelectionActionsDisabled(false);
}

/** Enable/disable selection actions (rotate / delete / extract / remove). */
function setSelectionActionsDisabled(disabled) {
  const noSel = selectedPages.size === 0;
  for (const id of [
    'pdfRotateCcwBtn',
    'pdfRotateCwBtn',
    'pdfDeleteBtn',
    'pdfExtractBtn',
    'pdfRemoveBtn',
  ]) {
    const el = byId(id);
    if (el) el.disabled = disabled || noSel;
  }
}

/** True when there are pending page edits (rotate / reorder / delete). */
function isEdited() {
  if (rotations.size > 0) return true;
  if (!pdfInfo) return false;
  if (pageOrder.length !== pdfInfo.pageCount) return true;
  return pageOrder.some((p, i) => p !== i);
}

/** Show/refresh the edit bar (preflight summary + Apply/Export) when edited. */
function updateEditBar() {
  const bar = byId('pdfEditBar');
  if (!bar) return;
  const edited = isEdited();
  bar.hidden = !edited;
  if (!edited) return;
  const pre = byId('pdfPreflight');
  if (pre) {
    pre.textContent = t('pdf.edit.preflight', {
      kept: pageOrder.length,
      total: pdfInfo?.pageCount ?? pageOrder.length,
      rotated: rotations.size,
    });
  }
}

/**
 * Compose the edited PDF bytes from the current model: reorder/delete via
 * extractPages (in display order), then bake rotations onto the output pages.
 * Returns srcBytes untouched when there are no edits.
 */
async function composeEdited() {
  let bytes = srcBytes;
  const identity =
    pageOrder.length === (pdfInfo?.pageCount ?? -1) && pageOrder.every((p, i) => p === i);
  if (!identity) {
    const res = await call('pdf-extract', { bytes, pages: pageOrder });
    bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
  }
  const rot = [];
  pageOrder.forEach((orig, outIdx) => {
    const d = rotations.get(orig) || 0;
    if (d % 360 !== 0) rot.push({ index: outIdx, degrees: d });
  });
  if (rot.length) {
    const res = await call('pdf-rotate', { bytes, rotations: rot });
    bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
  }
  return bytes;
}

/** Bake the edits into a new PDF, hand it to the card (onApply), and close. */
async function applyEdits() {
  if (busy || !isEdited()) return;
  busy = true;
  setStatus(t('pdf.edit.applying'), 'info', true);
  try {
    const bytes = await composeEdited();
    const file = new File([bytes], srcFile?.name || 'document.pdf', { type: 'application/pdf' });
    const handler = onApplyHandler;
    closePdfModal();
    if (handler) handler(file);
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
    busy = false;
  }
}

/** Download the edited PDF without changing the card. */
async function exportEdits() {
  if (busy) return;
  busy = true;
  setStatus(t('pdf.edit.exporting'), 'info', true);
  try {
    const bytes = await composeEdited();
    showDownload(new Blob([bytes], { type: 'application/pdf' }), `${stem()}-edited.pdf`);
    setStatus('');
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
  }
}

/** Discard pending edits and rebuild the grid from the original order. */
function resetEdits() {
  pageOrder = Array.from({ length: pdfInfo?.pageCount ?? 0 }, (_, i) => i);
  rotations.clear();
  selectedPages.clear();
  hideDownload();
  buildPageGrid();
}

/**
 * Parse a 1-based range spec like "1-3, 5, 8-10" into groups of 0-based page
 * indices (one group per comma-separated token). Throws on malformed input or
 * out-of-range pages.
 * @param {string} spec
 * @param {number} pageCount
 * @returns {number[][]}
 */
function parseRanges(spec, pageCount) {
  const tokens = String(spec || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new Error(t('pdf.org.errRanges'));

  const groups = [];
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(t('pdf.org.errRanges'));
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (lo < 1 || hi > pageCount) throw new Error(t('pdf.org.errRangeOob', { total: pageCount }));
    const group = [];
    for (let p = lo; p <= hi; p++) group.push(p - 1); // → 0-based
    groups.push(group);
  }
  return groups;
}

/** Extract the selected pages into a new PDF (offered as a download). */
async function extractSelected() {
  if (busy || !srcBytes || !pdfInfo) return;
  if (selectedPages.size === 0) {
    setStatus(t('pdf.org.errNoSelection'), 'error');
    return;
  }
  // Preserve the current display order (respects pending reorder/delete).
  const pages = pageOrder.filter((p) => selectedPages.has(p));
  await runSingle(pages, `${stem()}-extract.pdf`, 'extract');
}

/** Remove the selected pages, keeping the rest in a new PDF (download). */
async function removeSelected() {
  if (busy || !srcBytes || !pdfInfo) return;
  if (selectedPages.size === 0) {
    setStatus(t('pdf.org.errNoSelection'), 'error');
    return;
  }
  if (selectedPages.size >= pageOrder.length) {
    setStatus(t('pdf.org.errRemoveAll'), 'error');
    return;
  }
  // Keep the unselected pages in current display order.
  const pages = pageOrder.filter((p) => !selectedPages.has(p));
  await runSingle(pages, `${stem()}-removed.pdf`, 'remove');
}

/** Shared runner for extract/remove (both produce one new PDF via pdf-extract). */
async function runSingle(pages, name, op) {
  busy = true;
  setSelectionActionsDisabled(true);
  hideDownload();
  setStatus(t('pdf.org.building'), 'info', true);
  try {
    const res = await call('pdf-extract', { bytes: srcBytes, pages });
    const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
    finishSingleResult(bytes, name, pages.length);
    trackPdfOrganized({ op });
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    updateSelectionUI();
  }
}

/** Split the PDF into multiple files (every page, or custom ranges) → ZIP. */
async function runSplit() {
  if (busy || !srcBytes || !pdfInfo) return;
  const total = pdfInfo.pageCount;
  let ranges;
  try {
    const splitMode = byId('pdfSplitMode')?.value || 'each';
    if (splitMode === 'each') {
      if (total < 2) throw new Error(t('pdf.org.errSplitOne'));
      ranges = Array.from({ length: total }, (_, i) => [i]);
    } else {
      ranges = parseRanges(byId('pdfRanges')?.value, total);
    }
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
    return;
  }

  busy = true;
  const btn = byId('pdfSplitBtn');
  if (btn) btn.disabled = true;
  hideDownload();
  setStatus(t('pdf.org.building'), 'info', true);
  try {
    const res = await call('pdf-split', { bytes: srcBytes, ranges });
    await finishSplitResult(res.parts || [], ranges);
    trackPdfOrganized({ op: 'split' });
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
  }
}

/** Wire a single-PDF organize result to the download button. */
function finishSingleResult(bytes, filename, pageCount) {
  resultBytes = bytes;
  setStatus(
    t('pdf.org.doneSingle', { count: pageCount, size: formatBytes(bytes.length) }),
    'success'
  );
  announce(t('pdf.org.doneSingle', { count: pageCount, size: formatBytes(bytes.length) }));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  showDownload(blob, filename);
}

/** Zip the split parts and wire the ZIP to the download button. */
async function finishSplitResult(parts, ranges) {
  if (!parts.length) {
    setStatus(t('pdf.errorGeneric'), 'error');
    return;
  }
  const zip = new JSZip();
  const base = stem();
  parts.forEach((part, i) => {
    const u8 = part instanceof Uint8Array ? part : new Uint8Array(part);
    const r = ranges[i];
    const label = r.length === 1 ? `${r[0] + 1}` : `${r[0] + 1}-${r[r.length - 1] + 1}`;
    zip.file(`${base}-${label}.pdf`, u8);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  setStatus(
    t('pdf.org.doneSplit', { count: parts.length, size: formatBytes(blob.size) }),
    'success'
  );
  announce(t('pdf.org.doneSplit', { count: parts.length, size: formatBytes(blob.size) }));
  showDownload(blob, `${base}-split.zip`);
}

/** Source filename without extension. */
function stem() {
  return stemOf(srcFile?.name);
}

/** Strip the extension from a filename (falls back to 'document'). */
function stemOf(name) {
  const n = name || 'document.pdf';
  const dot = n.lastIndexOf('.');
  return dot > 0 ? n.slice(0, dot) : n;
}

/** Show the (green, ready) download button for a generated blob. */
function showDownload(blob, filename) {
  const dl = byId('pdfDownloadBtn');
  if (!dl) return;
  if (resultUrl) revokeUrl(resultUrl);
  resultUrl = trackUrl(URL.createObjectURL(blob));
  dl.href = resultUrl;
  dl.download = filename;
  dl.hidden = false;
  dl.classList.add('pdf-download-ready');
}

/** Hide and reset the download button (e.g. when inputs change). */
function hideDownload() {
  const dl = byId('pdfDownloadBtn');
  if (!dl) return;
  dl.hidden = true;
  dl.classList.remove('pdf-download-ready');
  if (resultUrl) {
    revokeUrl(resultUrl);
    resultUrl = null;
  }
}

/* ------------------------------------------------------------------ */
/* To Images (rasterize)                                              */
/* ------------------------------------------------------------------ */

function setRasterFormat(fmt) {
  rasterFormat = fmt === 'jpeg' ? 'jpeg' : 'png';
  backdrop.querySelectorAll('[data-raster-format]').forEach((b) => {
    b.classList.toggle('active', b.dataset.rasterFormat === rasterFormat);
  });
  hideDownload();
}

function setRasterDpi(dpi) {
  rasterDpi = dpi;
  backdrop.querySelectorAll('[data-raster-dpi]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.rasterDpi) === rasterDpi);
  });
  hideDownload();
}

/** File extension + MIME for the current raster format. */
function rasterExt() {
  return rasterFormat === 'jpeg' ? 'jpg' : 'png';
}
function rasterMime() {
  return rasterFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
}

/**
 * Render every page to images at the current format/DPI, reusing the last render
 * if format+DPI are unchanged. Returns an array of Uint8Array page images.
 */
async function renderRasterPages() {
  const key = `${rasterFormat}@${rasterDpi}`;
  if (rasterCache && rasterCache.key === key) return rasterCache.pages;
  const total = pdfInfo?.pageCount ?? 0;
  const res = await call(
    'pdf-rasterize',
    { bytes: srcBytes, options: { format: rasterFormat, dpi: rasterDpi, quality: 0.85 } },
    (done) => setStatus(t('pdf.img2.rendering', { done, total }), 'info', true)
  );
  const pages = (res.pages || []).map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  rasterCache = { key, pages, format: rasterFormat };
  return pages;
}

async function runRasterZip() {
  if (busy || !srcBytes || !pdfInfo) return;
  busy = true;
  setRasterButtonsDisabled(true);
  hideDownload();
  setStatus(t('pdf.img2.rendering', { done: 0, total: pdfInfo.pageCount }), 'info', true);
  try {
    const pages = await renderRasterPages();
    setStatus(t('pdf.img2.zipping'), 'info', true);
    const zip = new JSZip();
    const ext = rasterExt();
    const pad = String(pages.length).length;
    pages.forEach((bytes, i) => {
      zip.file(`${stem()}-p${String(i + 1).padStart(pad, '0')}.${ext}`, bytes);
    });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    setStatus(t('pdf.img2.done', { count: pages.length }), 'success');
    announce(t('pdf.img2.done', { count: pages.length }));
    showDownload(blob, `${stem()}-pages.zip`);
    trackPdfRasterized({ format: rasterFormat, dpi: rasterDpi });
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    setRasterButtonsDisabled(false);
  }
}

async function runRasterToEditor() {
  if (busy || !srcBytes || !pdfInfo) return;
  if (!imageImportHandler) {
    setStatus(t('pdf.img2.noEditor'), 'error');
    return;
  }
  busy = true;
  setRasterButtonsDisabled(true);
  hideDownload();
  setStatus(t('pdf.img2.rendering', { done: 0, total: pdfInfo.pageCount }), 'info', true);
  try {
    const pages = await renderRasterPages();
    const ext = rasterExt();
    const mime = rasterMime();
    const base = stem();
    const pad = String(pages.length).length;
    const files = pages.map(
      (bytes, i) =>
        new File([bytes], `${base}-p${String(i + 1).padStart(pad, '0')}.${ext}`, { type: mime })
    );
    const count = files.length;
    trackPdfRasterized({ format: rasterFormat, dpi: rasterDpi });
    // Hand off to the image queue, then close the modal so the user sees them.
    const handler = imageImportHandler;
    closePdfModal();
    handler(files);
    showToast(t('pdf.img2.sent', { count }), 'success', 4000);
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
    busy = false;
    setRasterButtonsDisabled(false);
  }
}

function setRasterButtonsDisabled(disabled) {
  const z = byId('pdfRasterZipBtn');
  const e = byId('pdfRasterEditorBtn');
  if (z) z.disabled = disabled;
  if (e) e.disabled = disabled;
}

function readOptions() {
  const slider = byId('pdfQuality');
  return {
    imageQuality: slider ? Number(slider.value) / 100 : PRESETS[DEFAULT_PRESET],
    recompressImages: byId('pdfRecompress')?.checked ?? true,
    stripMetadata: byId('pdfStripMeta')?.checked ?? true,
    subsetFonts: byId('pdfSubsetFonts')?.checked ?? true,
    garbageCollect: byId('pdfGarbage')?.checked ?? true,
  };
}

async function runOptimize() {
  if (busy || !srcBytes) return;
  busy = true;
  const btn = byId('pdfOptimizeBtn');
  hideDownload();
  if (btn) btn.disabled = true;
  setStatus(t('pdf.optimizing'), 'info', true);

  try {
    const res = await call(
      'pdf-optimize',
      { bytes: srcBytes, options: readOptions() },
      (done, total) => {
        if (total > 0) setStatus(t('pdf.progress', { done, total }), 'info', true);
      }
    );
    resultBytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
    finishResult(res.outputSize ?? resultBytes.length);
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
  }
}

function finishResult(outSize) {
  const inSize = pdfInfo?.fileSize ?? srcFile.size;
  const noGain = outSize >= inSize;

  if (noGain) {
    setStatus(t('pdf.noReduction'), 'info');
  } else {
    const pct = Math.round((1 - outSize / inSize) * 100);
    setStatus(
      t('pdf.result', { from: formatBytes(inSize), to: formatBytes(outSize), pct }),
      'success'
    );
    announce(t('pdf.result', { from: formatBytes(inSize), to: formatBytes(outSize), pct }));
    trackPdfOptimized({ reductionPct: pct });
  }

  // Wire the download (locally-generated file; nothing leaves the browser).
  // Only offer a download when there was an actual reduction.
  if (!noGain) {
    const blob = new Blob([resultBytes], { type: 'application/pdf' });
    showDownload(blob, optimizedName(srcFile.name));
  }
}

function closePdfModal() {
  document.removeEventListener('keydown', onKeyDown);
  // Settle any in-flight worker jobs so their awaits don't dangle.
  for (const [, job] of pending) job.reject(new Error('closed'));
  pending.clear();
  if (resultUrl) {
    revokeUrl(resultUrl);
    resultUrl = null;
  }
  // Page-grid cleanup.
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
  for (const url of thumbUrls) revokeUrl(url);
  thumbUrls.length = 0;
  thumbCache.clear();
  selectedPages.clear();
  // Edit-model cleanup.
  pageOrder = [];
  rotations.clear();
  dragSrcPage = null;
  onApplyHandler = null;
  // To-Images cleanup (release cached rendered pages).
  rasterCache = null;

  destroyWorker();
  pending.clear();
  if (backdrop) {
    backdrop.remove();
    backdrop = null;
  }
  srcBytes = null;
  resultBytes = null;
  pdfInfo = null;
  busy = false;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function byId(id) {
  return backdrop ? backdrop.querySelector('#' + id) : null;
}

function setStatus(text, kind, showSpinner = false) {
  const el = byId('pdfStatus');
  if (!el) return;
  el.textContent = text;
  el.className =
    'pdf-status' + (kind ? ' pdf-status-' + kind : '') + (showSpinner ? ' pdf-status-busy' : '');
}

/**
 * Download filename for an optimized PDF, suffixed with the active preset
 * (`-email` / `-web` / `-max`) or `-custom` when the slider was moved off a
 * preset. Falls back to `-optimized` if state can't be read.
 */
function optimizedName(name) {
  const dot = name.lastIndexOf('.');
  const fileStem = dot > 0 ? name.slice(0, dot) : name;
  const active = backdrop?.querySelector('.pdf-preset.active')?.dataset?.preset;
  const suffix = active || 'custom';
  return `${fileStem}-${suffix}.pdf`;
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
