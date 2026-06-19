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
import { trackPdfOptimized, trackPdfOrganized, trackPdfMerged } from '../analytics.js';

/**
 * Whether the PDF feature is compiled into this build. The single-file build
 * defines this as the string 'false' and stubs out `mupdf`, so PDF is absent
 * there (wasm can't be inlined into one HTML file).
 */
export function isPdfSupported() {
  return import.meta.env.VITE_PDF_ENABLED !== 'false';
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
let previewUrl = null; // object URL for the current preview page
let pdfInfo = null; // { pageCount, fileSize, hasText, imageCount }
let currentPage = 0; // 0-based page shown in preview
let busy = false; // an optimize/organize run is in flight

// Organize-mode state.
let mode = 'compress'; // 'compress' | 'organize' | 'merge'
let organizeOp = 'extract'; // 'extract' | 'remove' | 'split'
const selectedPages = new Set(); // 0-based indices selected in the page grid
let gridBuilt = false; // page grid rendered yet (lazy on first Organize view)
let thumbObserver = null; // IntersectionObserver for lazy thumbnails
const thumbUrls = []; // object URLs for thumbnails (revoked on close)

// Merge-mode state.
let mergeList = []; // [{ id, name, size, bytes, pages }] in output order
let mergeSeq = 0; // id generator for merge rows
let mergeBuilt = false; // merge list seeded with the current PDF yet
let initialMode = 'compress'; // mode to show once the modal has loaded
let pendingMergeFiles = null; // extra dropped PDFs to preload into the merge list

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
 * Open the PDF modal for a single file. When multiple PDFs are dropped, pass the
 * full list via `opts.mergeFiles` to open straight into Merge mode with all of
 * them preloaded (the `file` arg is the first/primary one shown in Compress).
 * @param {File} file
 * @param {{ mergeFiles?: File[] }} [opts]
 */
export async function openPdfModal(file, opts = {}) {
  if (backdrop) return; // one at a time

  if (!isPdfSupported()) {
    showToast(t('pdf.errorUnsupported'), 'error', 6000);
    return;
  }

  srcFile = file;
  resultBytes = null;
  currentPage = 0;
  mode = 'compress';
  organizeOp = 'extract';
  selectedPages.clear();
  gridBuilt = false;
  mergeList = [];
  mergeBuilt = false;
  const extra = Array.isArray(opts.mergeFiles) ? opts.mergeFiles : null;
  // Open into Merge when more than one PDF was provided.
  initialMode = extra && extra.length > 1 ? 'merge' : 'compress';
  pendingMergeFiles = initialMode === 'merge' ? extra : null;

  renderShell();
  setStatus(t('pdf.loading'), 'info', true);

  try {
    const buf = await file.arrayBuffer();
    srcBytes = new Uint8Array(buf);
  } catch {
    setStatus(t('pdf.errorRead'), 'error');
    return;
  }

  // Inspect, then render the first preview page.
  try {
    const res = await call('pdf-info', { bytes: srcBytes });
    pdfInfo = res.info;
    renderInfo();
    await showPreview(0);
    setStatus('');
    // If opened for merge, switch once the primary PDF is loaded.
    if (initialMode === 'merge') switchMode('merge');
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
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
      <div class="pdf-modal-header">
        <span class="pdf-modal-title">${t('pdf.title')}</span>
        <button class="btn btn-icon" data-action="close" title="${t('pdf.close')}" aria-label="${t('pdf.closeAria')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="pdf-modal-body">
        <div class="pdf-info" id="pdfInfo">${t('pdf.loading')}</div>

        <div class="pdf-mode-switch" role="tablist" aria-label="${t('pdf.modeAria')}">
          <button class="pdf-mode-tab active" data-mode="compress" role="tab" aria-selected="true">${t('pdf.mode.compress')}</button>
          <button class="pdf-mode-tab" data-mode="organize" role="tab" aria-selected="false">${t('pdf.mode.organize')}</button>
          <button class="pdf-mode-tab" data-mode="merge" role="tab" aria-selected="false">${t('pdf.mode.merge')}</button>
        </div>

        <!-- COMPRESS pane -->
        <div class="pdf-pane pdf-pane-compress" id="pdfPaneCompress">
          <div class="pdf-preview" id="pdfPreview">
            <div class="pdf-preview-stage" id="pdfPreviewStage"></div>
            <div class="pdf-preview-nav" id="pdfPreviewNav" hidden>
              <button class="btn btn-icon" data-action="prev" aria-label="${t('pdf.prevPage')}" title="${t('pdf.prevPage')}">‹</button>
              <span class="pdf-preview-pageno" id="pdfPageNo"></span>
              <button class="btn btn-icon" data-action="next" aria-label="${t('pdf.nextPage')}" title="${t('pdf.nextPage')}">›</button>
            </div>
          </div>

          <div class="pdf-controls">
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
          </div>

          <div class="pdf-actions">
            <button class="btn btn-primary" data-action="optimize" id="pdfOptimizeBtn">${t('pdf.optimize')}</button>
          </div>
        </div>

        <!-- ORGANIZE pane -->
        <div class="pdf-pane pdf-pane-organize" id="pdfPaneOrganize" hidden>
          <div class="pdf-organize-controls">
            <label class="pdf-op-row">
              <span>${t('pdf.org.operation')}</span>
              <select id="pdfOrganizeOp">
                <option value="extract">${t('pdf.org.opExtract')}</option>
                <option value="remove">${t('pdf.org.opRemove')}</option>
                <option value="split">${t('pdf.org.opSplit')}</option>
              </select>
            </label>

            <p class="pdf-organize-hint" id="pdfOrganizeHint"></p>

            <div class="pdf-select-toolbar" id="pdfSelectToolbar">
              <button type="button" class="pdf-linkbtn" data-action="select-all">${t('pdf.org.selectAll')}</button>
              <button type="button" class="pdf-linkbtn" data-action="select-none">${t('pdf.org.clear')}</button>
              <span class="pdf-select-count" id="pdfSelectCount"></span>
            </div>

            <div class="pdf-split-controls" id="pdfSplitControls" hidden>
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
            </div>
          </div>

          <div class="pdf-page-grid" id="pdfPageGrid"></div>

          <div class="pdf-actions">
            <button class="btn btn-primary" data-action="organize" id="pdfOrganizeBtn">${t('pdf.org.build')}</button>
          </div>
        </div>

        <!-- MERGE pane -->
        <div class="pdf-pane pdf-pane-merge" id="pdfPaneMerge" hidden>
          <p class="pdf-merge-hint">${t('pdf.merge.hint')}</p>
          <ol class="pdf-merge-list" id="pdfMergeList"></ol>
          <div class="pdf-merge-add">
            <button type="button" class="pdf-linkbtn" data-action="add-pdfs">${t('pdf.merge.add')}</button>
            <input type="file" id="pdfMergeInput" accept="application/pdf,.pdf" multiple hidden>
          </div>
          <div class="pdf-actions">
            <button class="btn btn-primary" data-action="merge" id="pdfMergeBtn">${t('pdf.merge.build')}</button>
          </div>
        </div>

        <div class="pdf-status" id="pdfStatus" role="status" aria-live="polite"></div>

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

  // Show the pager only for multi-page documents.
  const nav = byId('pdfPreviewNav');
  if (nav) nav.hidden = pdfInfo.pageCount <= 1;
}

async function showPreview(pageIndex) {
  if (!pdfInfo) return;
  const clamped = Math.max(0, Math.min(pdfInfo.pageCount - 1, pageIndex));
  currentPage = clamped;
  const stage = byId('pdfPreviewStage');
  const pageNo = byId('pdfPageNo');
  if (pageNo) pageNo.textContent = t('pdf.pageOf', { n: clamped + 1, total: pdfInfo.pageCount });
  if (stage) stage.classList.add('loading');
  try {
    const res = await call('pdf-preview', { bytes: srcBytes, pageIndex: clamped, scale: 0.4 });
    const blob = new Blob([res.png], { type: 'image/png' });
    if (previewUrl) revokeUrl(previewUrl);
    previewUrl = trackUrl(URL.createObjectURL(blob));
    if (stage) {
      stage.innerHTML = `<img src="${previewUrl}" alt="${t('pdf.previewAlt', { n: clamped + 1 })}" />`;
    }
  } catch {
    if (stage) stage.innerHTML = `<div class="pdf-preview-fail">${t('pdf.previewFail')}</div>`;
  } finally {
    if (stage) stage.classList.remove('loading');
  }
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

  // Presets set the slider; moving the slider clears the active preset.
  backdrop.querySelectorAll('.pdf-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      backdrop.querySelectorAll('.pdf-preset').forEach((b) => b.classList.remove('active'));
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
      backdrop.querySelectorAll('.pdf-preset').forEach((b) => b.classList.remove('active'));
      syncQualityOutput();
    });
  }

  byId('pdfOptimizeBtn').addEventListener('click', runOptimize);

  const nav = byId('pdfPreviewNav');
  if (nav) {
    const prev = nav.querySelector('[data-action="prev"]');
    const next = nav.querySelector('[data-action="next"]');
    prev.addEventListener('click', () => showPreview(currentPage - 1));
    next.addEventListener('click', () => showPreview(currentPage + 1));
  }

  // --- Organize mode ---
  backdrop.querySelectorAll('.pdf-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  const opSel = byId('pdfOrganizeOp');
  if (opSel) opSel.addEventListener('change', () => setOrganizeOp(opSel.value));

  const splitMode = byId('pdfSplitMode');
  if (splitMode) {
    splitMode.addEventListener('change', () => {
      const row = byId('pdfRangesRow');
      if (row) row.hidden = splitMode.value !== 'ranges';
    });
  }

  const toolbar = byId('pdfSelectToolbar');
  if (toolbar) {
    toolbar.addEventListener('click', (e) => {
      const act = e.target?.dataset?.action;
      if (act === 'select-all') selectAllPages(true);
      else if (act === 'select-none') selectAllPages(false);
    });
  }

  byId('pdfOrganizeBtn').addEventListener('click', runOrganize);

  // --- Merge mode ---
  const addBtn = backdrop.querySelector('[data-action="add-pdfs"]');
  const mergeInput = byId('pdfMergeInput');
  if (addBtn && mergeInput) {
    addBtn.addEventListener('click', () => mergeInput.click());
    mergeInput.addEventListener('change', () => {
      addMergeFiles([...mergeInput.files]);
      mergeInput.value = ''; // allow re-picking the same file
    });
  }
  const mergeListEl = byId('pdfMergeList');
  if (mergeListEl) {
    mergeListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = Number(btn.closest('.pdf-merge-item')?.dataset.id);
      const act = btn.dataset.act;
      if (act === 'up') moveMergeItem(id, -1);
      else if (act === 'down') moveMergeItem(id, 1);
      else if (act === 'remove') removeMergeItem(id);
    });
  }
  byId('pdfMergeBtn').addEventListener('click', runMerge);
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
/* Organize mode                                                      */
/* ------------------------------------------------------------------ */

/** Switch between the Compress, Organize, and Merge panes. */
function switchMode(next) {
  const valid = next === 'compress' || next === 'organize' || next === 'merge';
  if (busy || !valid || next === mode) return;
  mode = next;
  backdrop.querySelectorAll('.pdf-mode-tab').forEach((tab) => {
    const on = tab.dataset.mode === mode;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const compress = byId('pdfPaneCompress');
  const organize = byId('pdfPaneOrganize');
  const merge = byId('pdfPaneMerge');
  if (compress) compress.hidden = mode !== 'compress';
  if (organize) organize.hidden = mode !== 'organize';
  if (merge) merge.hidden = mode !== 'merge';

  // Result from one mode shouldn't linger as a download for the other.
  hideDownload();
  setStatus('');
  if (mode === 'organize' && !gridBuilt) buildPageGrid();
  if (mode === 'merge' && !mergeBuilt) initMergeList();
}

/** Apply the selected organize operation (extract / remove / split). */
function setOrganizeOp(op) {
  organizeOp = op;
  const splitCtl = byId('pdfSplitControls');
  const toolbar = byId('pdfSelectToolbar');
  const isSplit = op === 'split';
  if (splitCtl) splitCtl.hidden = !isSplit;
  // Page selection only applies to extract/remove; split uses its own controls.
  if (toolbar) toolbar.hidden = isSplit;
  const grid = byId('pdfPageGrid');
  if (grid) grid.classList.toggle('pdf-grid-readonly', isSplit);
  // Disable the checkboxes in split mode so label clicks can't mutate selection.
  backdrop.querySelectorAll('.pdf-thumb-check').forEach((cb) => {
    cb.disabled = isSplit;
  });
  // Contextual instruction so it's obvious HOW to pick pages.
  const hint = byId('pdfOrganizeHint');
  if (hint) hint.textContent = t('pdf.org.hint.' + op);
  // Action button reflects the operation rather than a generic "Build".
  const btn = byId('pdfOrganizeBtn');
  if (btn) btn.textContent = t('pdf.org.buildOp.' + op);
  hideDownload();
  updateSelectionUI();
}

/** Build the lazy page-thumbnail grid (one tile per page, rendered on scroll). */
function buildPageGrid() {
  const grid = byId('pdfPageGrid');
  if (!grid || !pdfInfo) return;
  gridBuilt = true;
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

  for (let i = 0; i < pdfInfo.pageCount; i++) {
    const tile = document.createElement('label');
    tile.className = 'pdf-thumb';
    tile.dataset.page = String(i);
    tile.innerHTML = `
      <input type="checkbox" class="pdf-thumb-check" data-page="${i}" aria-label="${t('pdf.org.pageLabel', { n: i + 1 })}">
      <span class="pdf-thumb-stage" aria-hidden="true"></span>
      <span class="pdf-thumb-no">${i + 1}</span>`;
    const cb = tile.querySelector('.pdf-thumb-check');
    cb.addEventListener('change', () => togglePage(i, cb.checked));
    grid.appendChild(tile);
    thumbObserver.observe(tile);
  }
  // Initialize the operation state (hint, toolbar, checkbox enablement) so the
  // grid is fully set up the first time Organize is shown — not just on change.
  setOrganizeOp(organizeOp);
}

/** Render one page thumbnail via the worker preview (small scale). */
async function renderThumb(index) {
  const tile = backdrop?.querySelector(`.pdf-thumb[data-page="${index}"] .pdf-thumb-stage`);
  if (!tile) return;
  tile.classList.add('loading');
  try {
    const res = await call('pdf-preview', { bytes: srcBytes, pageIndex: index, scale: 0.22 });
    const blob = new Blob([res.png], { type: 'image/png' });
    const url = trackUrl(URL.createObjectURL(blob));
    thumbUrls.push(url);
    tile.innerHTML = `<img src="${url}" alt="" loading="lazy" />`;
  } catch {
    tile.innerHTML = `<span class="pdf-thumb-fail">${index + 1}</span>`;
  } finally {
    tile.classList.remove('loading');
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
  if (!pdfInfo) return;
  selectedPages.clear();
  backdrop.querySelectorAll('.pdf-thumb-check').forEach((cb) => {
    cb.checked = on;
    cb.closest('.pdf-thumb')?.classList.toggle('selected', on);
  });
  if (on) for (let i = 0; i < pdfInfo.pageCount; i++) selectedPages.add(i);
  hideDownload();
  updateSelectionUI();
}

/** Update the selected-count label and enable/disable the Build button. */
function updateSelectionUI() {
  const countEl = byId('pdfSelectCount');
  const n = selectedPages.size;
  if (countEl) countEl.textContent = t('pdf.org.selectedCount', { count: n });
  const btn = byId('pdfOrganizeBtn');
  if (btn && !busy) btn.disabled = organizeOp !== 'split' && n === 0;
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

async function runOrganize() {
  if (busy || !srcBytes || !pdfInfo) return;

  // Resolve the operation into worker calls.
  let kind; // 'single' | 'split'
  let pages = null;
  let ranges = null;
  const total = pdfInfo.pageCount;

  try {
    if (organizeOp === 'extract') {
      if (selectedPages.size === 0) throw new Error(t('pdf.org.errNoSelection'));
      pages = [...selectedPages].sort((a, b) => a - b);
      kind = 'single';
    } else if (organizeOp === 'remove') {
      if (selectedPages.size === 0) throw new Error(t('pdf.org.errNoSelection'));
      if (selectedPages.size >= total) throw new Error(t('pdf.org.errRemoveAll'));
      pages = [];
      for (let i = 0; i < total; i++) if (!selectedPages.has(i)) pages.push(i);
      kind = 'single';
    } else {
      // split
      const splitMode = byId('pdfSplitMode')?.value || 'each';
      if (splitMode === 'each') {
        if (total < 2) throw new Error(t('pdf.org.errSplitOne'));
        ranges = Array.from({ length: total }, (_, i) => [i]);
      } else {
        ranges = parseRanges(byId('pdfRanges')?.value, total);
      }
      kind = 'split';
    }
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
    return;
  }

  busy = true;
  const btn = byId('pdfOrganizeBtn');
  if (btn) btn.disabled = true;
  hideDownload();
  setStatus(t('pdf.org.building'), 'info', true);

  try {
    if (kind === 'single') {
      const res = await call('pdf-extract', { bytes: srcBytes, pages });
      const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
      const name = organizeOp === 'extract' ? `${stem()}-extract.pdf` : `${stem()}-removed.pdf`;
      finishSingleResult(bytes, name, pages.length);
      trackPdfOrganized({ op: organizeOp });
    } else {
      const res = await call('pdf-split', { bytes: srcBytes, ranges });
      await finishSplitResult(res.parts || [], ranges);
      trackPdfOrganized({ op: 'split' });
    }
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
    updateSelectionUI();
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
/* Merge mode                                                         */
/* ------------------------------------------------------------------ */

/** Seed the merge list with the currently-open PDF, plus any dropped extras. */
async function initMergeList() {
  if (mergeBuilt) return;
  mergeBuilt = true;
  mergeList = [];
  if (srcBytes && pdfInfo) {
    mergeList.push({
      id: ++mergeSeq,
      name: srcFile.name,
      size: srcFile.size,
      bytes: srcBytes,
      pages: pdfInfo.pageCount,
    });
  }
  renderMergeList();
  // Preload any additional files that came in via a multi-PDF drop (skip the
  // first — it's already the open PDF above).
  if (pendingMergeFiles && pendingMergeFiles.length > 1) {
    await addMergeFiles(pendingMergeFiles.slice(1));
  }
  pendingMergeFiles = null;
}

/** Read + validate dropped/picked PDFs and append them to the merge list. */
async function addMergeFiles(files) {
  const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  if (pdfs.length === 0) return;
  setStatus(t('pdf.merge.reading'), 'info', true);
  let added = 0;
  for (const file of pdfs) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const res = await call('pdf-info', { bytes }); // validates it's a real PDF
      mergeList.push({
        id: ++mergeSeq,
        name: file.name,
        size: file.size,
        bytes,
        pages: res.info.pageCount,
      });
      added++;
    } catch {
      showToast(t('pdf.merge.errFile', { name: file.name }), 'error', 5000);
    }
  }
  setStatus('');
  if (added) {
    hideDownload();
    renderMergeList();
  }
}

function moveMergeItem(id, dir) {
  const i = mergeList.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= mergeList.length) return;
  [mergeList[i], mergeList[j]] = [mergeList[j], mergeList[i]];
  hideDownload();
  renderMergeList();
}

function removeMergeItem(id) {
  mergeList = mergeList.filter((e) => e.id !== id);
  hideDownload();
  renderMergeList();
}

function renderMergeList() {
  const list = byId('pdfMergeList');
  if (!list) return;
  list.innerHTML = mergeList
    .map(
      (e, i) => `
      <li class="pdf-merge-item" data-id="${e.id}">
        <span class="pdf-merge-pos">${i + 1}</span>
        <span class="pdf-merge-meta">
          <span class="pdf-merge-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
          <span class="pdf-merge-sub">${t('pdf.pages', { count: e.pages })} · ${formatBytes(e.size)}</span>
        </span>
        <span class="pdf-merge-actions">
          <button type="button" class="btn btn-icon" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="${t('pdf.merge.moveUp')}" title="${t('pdf.merge.moveUp')}">↑</button>
          <button type="button" class="btn btn-icon" data-act="down" ${i === mergeList.length - 1 ? 'disabled' : ''} aria-label="${t('pdf.merge.moveDown')}" title="${t('pdf.merge.moveDown')}">↓</button>
          <button type="button" class="btn btn-icon" data-act="remove" aria-label="${t('pdf.merge.remove', { name: e.name })}" title="${t('pdf.merge.removeShort')}">✕</button>
        </span>
      </li>`
    )
    .join('');
  // Need at least two documents to merge.
  const btn = byId('pdfMergeBtn');
  if (btn && !busy) btn.disabled = mergeList.length < 2;
  const total = mergeList.reduce((sum, e) => sum + e.pages, 0);
  const hint = backdrop?.querySelector('.pdf-merge-hint');
  if (hint) {
    hint.textContent =
      mergeList.length < 2
        ? t('pdf.merge.hint')
        : t('pdf.merge.summary', { files: mergeList.length, pages: total });
  }
}

async function runMerge() {
  if (busy || mergeList.length < 2) return;
  busy = true;
  const btn = byId('pdfMergeBtn');
  if (btn) btn.disabled = true;
  hideDownload();
  setStatus(t('pdf.merge.building'), 'info', true);
  try {
    const docs = mergeList.map((e) => e.bytes);
    const res = await call('pdf-merge', { docs });
    const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
    resultBytes = bytes;
    const totalPages = mergeList.reduce((sum, e) => sum + e.pages, 0);
    setStatus(
      t('pdf.merge.done', { count: totalPages, size: formatBytes(bytes.length) }),
      'success'
    );
    announce(t('pdf.merge.done', { count: totalPages, size: formatBytes(bytes.length) }));
    const base = stemOf(mergeList[0]?.name) || stem();
    showDownload(new Blob([bytes], { type: 'application/pdf' }), `${base}-merged.pdf`);
    trackPdfMerged({ count: mergeList.length });
  } catch (err) {
    setStatus(err?.message || t('pdf.errorGeneric'), 'error');
  } finally {
    busy = false;
    if (btn) btn.disabled = mergeList.length < 2;
  }
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
  if (previewUrl) {
    revokeUrl(previewUrl);
    previewUrl = null;
  }
  if (resultUrl) {
    revokeUrl(resultUrl);
    resultUrl = null;
  }
  // Organize-mode cleanup.
  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }
  for (const url of thumbUrls) revokeUrl(url);
  thumbUrls.length = 0;
  selectedPages.clear();
  gridBuilt = false;
  mode = 'compress';
  organizeOp = 'extract';
  // Merge-mode cleanup (release the held PDF byte arrays).
  mergeList = [];
  mergeBuilt = false;
  pendingMergeFiles = null;
  initialMode = 'compress';

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
