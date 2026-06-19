// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * pdf/pdf-ui.js
 * P1 PDF optimization UI — a self-contained modal that opens when the user
 * drops/picks a single PDF. Owns the lazy pdf-worker lifecycle, drives the
 * worker message protocol (pdf-info / pdf-optimize / pdf-preview), and renders
 * the controls (presets + advanced toggles/slider), a page preview, a
 * before/after size readout, and a download button.
 *
 * Privacy: everything runs client-side. The multi-MB MuPDF wasm lives only
 * inside pdf-worker.js and is referenced via `new URL(... , import.meta.url)`,
 * so nothing here statically imports the engine — the wasm loads off the main
 * thread, lazily, and is excluded from the portable single-file build
 * (VITE_PDF_ENABLED === 'false'; see vite.singlefile.config.js).
 */

import { t } from '../i18n.js';
import { showToast } from '../toast.js';
import { announce } from '../announcer.js';
import { trackUrl, revokeUrl } from '../resource-tracker.js';
import { trackPdfOptimized } from '../analytics.js';

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
let resultUrl = null; // object URL for the optimized download
let previewUrl = null; // object URL for the current preview page
let pdfInfo = null; // { pageCount, fileSize, hasText, imageCount }
let currentPage = 0; // 0-based page shown in preview
let busy = false; // an optimize run is in flight

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
    const workerUrl = new URL('./pdf-worker.js', import.meta.url);
    const base = import.meta.url;
    if (base.startsWith('data:') || base.startsWith('blob:') || base.startsWith('file:')) {
      return false;
    }
    worker = new Worker(workerUrl, { type: 'module' });
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
 * Open the PDF optimization modal for a single file.
 * @param {File} file
 */
export async function openPdfModal(file) {
  if (backdrop) return; // one at a time

  if (!isPdfSupported()) {
    showToast(t('pdf.errorUnsupported'), 'error', 6000);
    return;
  }

  srcFile = file;
  resultBytes = null;
  currentPage = 0;

  renderShell();

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

        <div class="pdf-status" id="pdfStatus" role="status" aria-live="polite"></div>

        <div class="pdf-actions">
          <button class="btn btn-primary" data-action="optimize" id="pdfOptimizeBtn">${t('pdf.optimize')}</button>
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
}

function onKeyDown(e) {
  if (e.key === 'Escape' && !busy) closePdfModal();
}

function syncQualityOutput() {
  const slider = byId('pdfQuality');
  const out = byId('pdfQualityOut');
  if (slider && out) out.textContent = slider.value;
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
  const dl = byId('pdfDownloadBtn');
  if (dl) dl.hidden = true;
  if (btn) btn.disabled = true;
  setStatus(t('pdf.optimizing'), 'info');

  try {
    const res = await call(
      'pdf-optimize',
      { bytes: srcBytes, options: readOptions() },
      (done, total) => {
        if (total > 0) setStatus(t('pdf.progress', { done, total }), 'info');
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
  const dl = byId('pdfDownloadBtn');
  if (dl) {
    if (resultUrl) revokeUrl(resultUrl);
    const blob = new Blob([resultBytes], { type: 'application/pdf' });
    resultUrl = trackUrl(URL.createObjectURL(blob));
    dl.href = resultUrl;
    dl.download = optimizedName(srcFile.name);
    dl.hidden = false;
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

function setStatus(text, kind) {
  const el = byId('pdfStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'pdf-status' + (kind ? ' pdf-status-' + kind : '');
}

function optimizedName(name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-optimized.pdf`;
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
