/**
 * main.js
 * Entry point — wires all modules together.
 * This is the only file that knows about all other modules.
 *
 * Phase 5: Adds per-image editing (rotate, flip, crop) with
 * single-item reprocessing on edit change.
 */

import { initI18n, t, onLocaleChange } from './modules/i18n.js';
import { initLangSwitcher } from './modules/lang-switcher.js';
import { initDropZone } from './modules/drop-zone.js';
import {
  initSettings,
  getProcessSettings,
  getPattern,
  getResponsiveSettings,
  applyExportSize,
} from './modules/settings.js';
import { isHeicFile } from './modules/heic-decoder.js';
import {
  addPreviewCard,
  addPdfPreviewCard,
  updatePdfCardMeta,
  setPdfCardSavings,
  updatePreviewCardResult,
  updatePreviewCardError,
  markPreviewCardExported,
  removePreviewCard,
  clearPreviews,
  setCardProgress,
  clearCardProgress,
  updateCropOverlay,
  setCardEditedState,
  formatBytes,
} from './modules/preview.js';
import { buildOutputFilename, downloadBlob } from './modules/exporter.js';
import { showToast } from './modules/toast.js';
import { addHistoryEntry, initHistory } from './modules/history.js';
import { processBatch, exportAsZip, isBatchProcessing } from './modules/batch-manager.js';
import { initTheme } from './modules/theme.js';
import { initAnnouncer, announce } from './modules/announcer.js';
import { processImage, isSvgFile, rasterizeSvg } from './modules/image-processor.js';
import {
  createDefaultEdits,
  rotateCW,
  rotateCCW,
  toggleFlipH,
  toggleFlipV,
  hasEdits,
} from './modules/editor.js';
import { openEditModal } from './modules/crop-modal.js';
import { initHelpModal, openHelpModal } from './modules/help-modal.js';
import { initTooltips } from './modules/tooltip.js';
import { releaseAll, revokeUrl, trackUrl } from './modules/resource-tracker.js';
import { exportMultiSizeZip } from './modules/responsive-export.js';
import { initKeyboardShortcuts } from './modules/keyboard-shortcuts.js';
import { initPrivacyModal } from './modules/privacy-modal.js';
import { initConsentBanner } from './modules/consent-banner.js';
import {
  openPdfModal,
  isPdfSupported,
  imagesToPdfBlob,
  combineMixedToPdf,
  optimizePdfBlob,
  setImageImportHandler,
  getPdfCardMeta,
} from './modules/pdf/pdf-ui.js';
import { trackImageProcessed, trackExport, trackPdfMerged } from './modules/analytics.js';
import { isGifFile, isAnimatedGif } from './modules/gif-detect.js';
import {
  isPngFile,
  isWebpFile,
  isAnimatedPng,
  isAnimatedWebp,
} from './modules/animation-detect.js';
import { MAX_MEGAPIXELS, MAX_BATCH_SIZE } from './modules/constants.js';
import { initErrorReporter } from './modules/error-reporter.js';

// Install global error handlers as early as possible so uncaught errors surface.
initErrorReporter();

// --- State ---

/**
 * @type {Map<string, import('./modules/batch-manager.js').BatchItem>}
 */
const imageQueue = new Map();

/**
 * PDF items live in their own map (C1 unified intake). They render as cards in
 * the shared preview list but are deliberately kept out of imageQueue so the
 * image processing / reprocess / export / bulk paths stay image-only. The C2
 * drill-in will build on this; mixed-type selection/export is C4.
 * @type {Map<string, { id: string, file: File, kind: 'pdf', pdfMeta: object|null }>}
 */
const pdfQueue = new Map();

let idCounter = 0;

function generateId() {
  return `img-${++idCounter}-${Date.now()}`;
}

// --- Selection state (Phase 3b) ---
//
// Deliberately kept as a separate `Set<string>` of IDs rather than a flag on
// each BatchItem. Rationale:
//   - Survives `reprocessAll` (which rebuilds result state but preserves items)
//   - Doesn't pollute per-item state that gets serialized into history
//   - Easy to swap for a different data structure later (e.g. ordered array
//     for "last-selected" tracking) without touching the queue items
// `selectionAnchor` remembers the last individually-clicked id so Shift-click
// can extend from it — standard file-browser behavior.
/** @type {Set<string>} */
const selectedIds = new Set();
/** @type {string | null} */
let selectionAnchor = null;

/**
 * Probe localStorage with a safe round-trip. Catches the three ways it can
 * fail in the wild:
 *  - Incognito / private browsing (most browsers, quota = 0)
 *  - Safari on file:// (blocked entirely, `localStorage` access throws)
 *  - Users with site-data disabled via browser privacy settings
 *
 * Wrapped in try/catch so the boot sequence never throws here.
 * @returns {boolean} true if localStorage is usable for read + write.
 */
function isLocalStorageAvailable() {
  const probeKey = '__pixeldrop_probe__';
  try {
    localStorage.setItem(probeKey, '1');
    const roundTrip = localStorage.getItem(probeKey);
    localStorage.removeItem(probeKey);
    return roundTrip === '1';
  } catch {
    return false;
  }
}

// --- DOM references ---

const dropZoneEl = document.getElementById('dropZone');
const fileInputEl = document.getElementById('fileInput');
const progressBarEl = document.getElementById('progressBar');
const progressFillEl = document.getElementById('progressFill');
const progressLabelEl = document.getElementById('progressLabel');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const bulkToolbarEl = document.getElementById('bulkToolbar');
const bulkToolbarCountEl = document.getElementById('bulkToolbarCount');
const bulkDeselectBtn = document.getElementById('bulkDeselectBtn');
const themeToggleBtn = document.getElementById('themeToggle');
const helpBtn = document.getElementById('helpBtn');

// --- Initialize modules ---

// i18n — resolve locale and translate static markup before anything else
// renders, so the first paint is already in the right language.
initI18n();
initLangSwitcher();

// Theme toggle (before other modules so it applies immediately)
initTheme(themeToggleBtn);

// Screen reader announcer
initAnnouncer();

// Help modal (also hosts the Changelog as a tab)
initHelpModal(helpBtn);

// Footer version opens the Help modal directly on the Changelog tab — the
// changelog no longer has its own standalone modal or a header badge.
const footerVersion = document.getElementById('footerVersion');
if (footerVersion) {
  footerVersion.addEventListener('click', () => openHelpModal('changelog'));
}

// Privacy modal (triggered by the footer "Privacy" link)
initPrivacyModal(document.getElementById('privacyLink'));

// Consent banner + Google Consent Mode. No-ops when the analytics snippet is
// absent (e.g. the portable single-file build), so the portable file stays
// network-silent and shows no banner.
initConsentBanner(document.getElementById('cookieSettingsLink'));

// Tooltips (JS-positioned, renders on body to avoid sidebar overflow clipping)
initTooltips();

// Phase 3a — Detect localStorage availability once on boot. Incognito/private
// browsing and Safari on file:// silently drop persistence — without this
// probe, the user would never know their custom presets, history, and
// settings are being reset on every reload. Fire exactly one warning toast.
if (!isLocalStorageAvailable()) {
  showToast(t('toast.storageUnavailable'), 'warning', 8000);
}

initSettings((newSettings) => {
  updateAllCropOverlays();
  reprocessAll();
});

/**
 * Refresh the exact-mode center-crop overlay on every queued card. Cheap, pure
 * DOM math — runs on each settings change so the crop preview tracks the
 * currently selected preset/mode without waiting for reprocessing.
 */
function updateAllCropOverlays() {
  const settings = getProcessSettings();
  for (const id of imageQueue.keys()) {
    updateCropOverlay(id, settings);
  }
}

initDropZone(dropZoneEl, fileInputEl, handleNewFiles, handleRejectedFiles);

// --- Empty-state hero (Phase 1) ---
// Drops anywhere are handled by the full-window overlay (drop-zone.js), so the
// hero just needs click/keyboard to open the file picker, plus preset chips.
const contentEmptyDrop = document.getElementById('contentEmptyDrop');
if (contentEmptyDrop) {
  contentEmptyDrop.addEventListener('click', () => fileInputEl.click());
  contentEmptyDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl.click();
    }
  });
}
// Reveal the "Optimize a PDF" chip only when the PDF feature is compiled in
// (it's excluded from the portable single-file build).
const emptyChipPdf = document.getElementById('emptyChipPdf');
if (emptyChipPdf && isPdfSupported()) emptyChipPdf.hidden = false;

for (const chip of document.querySelectorAll('.content-empty-chip')) {
  chip.addEventListener('click', () => {
    // PDF chip: open the file picker (a chosen PDF becomes a card via the C1
    // unified-intake path in handleNewFiles).
    if (chip.dataset.action === 'pdf') {
      fileInputEl.click();
      return;
    }
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect && chip.dataset.preset) {
      presetSelect.value = chip.dataset.preset;
      // Fire change so settings.js applies the preset through its existing wiring.
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Nudge the user to the next step.
    dropZoneEl.focus();
  });
}

// Wrap in arrows so the click Event isn't passed as `idsFilter` — handleExportAll
// /handleExportZip treat a truthy first arg as a Set of ids to export, and an
// Event would resolve to an empty selection (i.e. export nothing).
document.getElementById('exportBtn').addEventListener('click', () => handleExportAll());
document.getElementById('exportZipBtn').addEventListener('click', () => handleExportZip());
document.getElementById('exportResponsiveBtn').addEventListener('click', handleExportResponsive);

// "Combine into PDF" — only when the PDF feature is compiled in (excluded from
// the portable single-file build). Reveal the button, otherwise it stays hidden.
const exportPdfBtn = document.getElementById('exportPdfBtn');
if (exportPdfBtn && isPdfSupported()) {
  exportPdfBtn.hidden = false;
  exportPdfBtn.addEventListener('click', () => handleExportPdf());
}

// PDF → images "Send to editor" loads rasterized pages into the image queue.
if (isPdfSupported()) setImageImportHandler((files) => handleNewFiles(files));

// Step 3 export mirrors — same handlers as the preview toolbar (Phase 3).
const exportStep3Btn = document.getElementById('exportStep3Btn');
const exportZipStep3Btn = document.getElementById('exportZipStep3Btn');
if (exportStep3Btn) exportStep3Btn.addEventListener('click', () => handleExportAll());
if (exportZipStep3Btn) exportZipStep3Btn.addEventListener('click', () => handleExportZip());
document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
selectAllBtn.addEventListener('click', () => toggleSelectAll(true));
deselectAllBtn.addEventListener('click', () => toggleSelectAll(false));
if (bulkDeselectBtn) {
  bulkDeselectBtn.addEventListener('click', () => toggleSelectAll(false));
}

// Bulk rotate / flip buttons (Phase 3b — task #12). Guarded so the app still
// boots if a future theme strips any of these buttons from the DOM.
const bulkRotateCcwBtn = document.getElementById('bulkRotateCcwBtn');
const bulkRotateCwBtn = document.getElementById('bulkRotateCwBtn');
const bulkFlipHBtn = document.getElementById('bulkFlipHBtn');
const bulkFlipVBtn = document.getElementById('bulkFlipVBtn');
if (bulkRotateCcwBtn) bulkRotateCcwBtn.addEventListener('click', () => handleBulkRotate('ccw'));
if (bulkRotateCwBtn) bulkRotateCwBtn.addEventListener('click', () => handleBulkRotate('cw'));
if (bulkFlipHBtn) bulkFlipHBtn.addEventListener('click', () => handleBulkFlip('h'));
if (bulkFlipVBtn) bulkFlipVBtn.addEventListener('click', () => handleBulkFlip('v'));

const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => handleBulkDelete());

// Bulk download + ZIP buttons (Phase 3b — task #14). Same guard-and-wire
// pattern as the edit-group buttons above.
const bulkDownloadBtn = document.getElementById('bulkDownloadBtn');
const bulkZipBtn = document.getElementById('bulkZipBtn');
if (bulkDownloadBtn) bulkDownloadBtn.addEventListener('click', () => handleBulkDownload());
if (bulkZipBtn) bulkZipBtn.addEventListener('click', () => handleBulkExportZip());

// Bulk "Combine to PDF" (C4) — only when the PDF feature is compiled in (it's
// excluded from the portable single-file build). Reveal + wire it; otherwise it
// stays hidden, mirroring exportPdfBtn above.
const bulkCombinePdfBtn = document.getElementById('bulkCombinePdfBtn');
if (bulkCombinePdfBtn && isPdfSupported()) {
  bulkCombinePdfBtn.hidden = false;
  bulkCombinePdfBtn.addEventListener('click', () => handleBulkCombinePdf());
}

// Bulk "Optimize PDFs" (D6) — also PDF-feature-gated. Unlike Combine, it's only
// shown when the selection actually contains a PDF (toggled in renderSelectionState).
const bulkOptimizePdfBtn = document.getElementById('bulkOptimizePdfBtn');
if (bulkOptimizePdfBtn && isPdfSupported()) {
  bulkOptimizePdfBtn.addEventListener('click', () => handleBulkOptimizePdf());
}

// Recipes are PDF-aware (H2): settings.js applies the recipe to the image
// pipeline; this runs the PDF-side equivalent so a recipe isn't a no-op when the
// workspace holds PDFs. Both listeners fire independently on the same chip.
if (isPdfSupported()) {
  document.querySelectorAll('[data-recipe]').forEach((chip) => {
    chip.addEventListener('click', () => handleRecipeForPdfs(chip.dataset.recipe));
  });
}

initHistory();

// Phase 10: Global keyboard shortcuts
// Phase 3b: hasSelection + onDeleteSelection let Delete/Backspace remove a
// multi-selection before falling back to the focused-card path.
initKeyboardShortcuts({
  fileInput: fileInputEl,
  onRemove: (id) => removeImagesWithUndo([id]),
  queueSize: () => imageQueue.size,
  hasSelection: () => selectedIds.size > 0,
  onDeleteSelection: handleBulkDelete,
});

// Release tracked blob URLs and canvases on page unload
window.addEventListener('beforeunload', releaseAll);

// Feature-detect AVIF encoding support
(async function detectAvif() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/avif', 0.5));
  if (!blob || blob.type !== 'image/avif') {
    const avifOption = document.querySelector('#outputFormat option[value="avif"]');
    if (avifOption) {
      avifOption.disabled = true;
      avifOption.textContent = 'AVIF (not supported)';
    }
  }
})();

// SVG Code Paste
const svgPasteToggle = document.getElementById('svgPasteToggle');
const svgPastePanel = document.getElementById('svgPastePanel');
const svgPasteInput = document.getElementById('svgPasteInput');
const svgPasteConvert = document.getElementById('svgPasteConvert');
const svgPasteClear = document.getElementById('svgPasteClear');

if (svgPasteToggle && svgPastePanel) {
  svgPasteToggle.addEventListener('click', () => {
    const isOpen = svgPastePanel.classList.contains('open');
    svgPastePanel.classList.toggle('open', !isOpen);
    svgPasteToggle.classList.toggle('active', !isOpen);
    svgPasteToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  svgPasteConvert.addEventListener('click', async () => {
    const svgText = svgPasteInput.value.trim();
    if (!svgText) {
      showToast(t('toast.pasteSvgFirst'), 'warning');
      return;
    }
    if (!svgText.includes('<svg')) {
      showToast(t('toast.noSvgTag'), 'error');
      return;
    }

    try {
      // Create a File object from the SVG text
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const file = new File([blob], 'pasted-svg.svg', { type: 'image/svg+xml' });

      // Feed it through the normal file handling pipeline
      await handleNewFiles([file]);
      showToast(t('toast.svgConverted'), 'success', 3000);
      svgPasteInput.value = '';
    } catch (err) {
      showToast(t('toast.svgFailed'), 'error');
      console.error('SVG paste error:', err);
    }
  });

  svgPasteClear.addEventListener('click', () => {
    svgPasteInput.value = '';
  });
}

// --- Progress bar helpers ---

function showProgress(completed, total) {
  progressBarEl.hidden = false;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFillEl.style.width = `${pct}%`;
  progressLabelEl.textContent = `${completed} / ${total}`;

  // Update ARIA attributes on the progress bar
  progressBarEl.setAttribute('aria-valuenow', pct);
}

function hideProgress() {
  progressBarEl.hidden = true;
  progressFillEl.style.width = '0%';
  progressBarEl.setAttribute('aria-valuenow', '0');
}

/**
 * Drive the existing global progress bar from a 0-100 percent value.
 * Used for ZIP build (JSZip `onUpdate` emits percent, not count/total).
 * @param {number} pct - 0-100
 * @param {string} [label] - Optional label text shown in place of "N / M"
 */
function showProgressPercent(pct, label) {
  progressBarEl.hidden = false;
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  progressFillEl.style.width = `${clamped}%`;
  progressLabelEl.textContent = label != null ? label : `${clamped}%`;
  progressBarEl.setAttribute('aria-valuenow', String(clamped));
}

// --- Pseudo-progress for opaque slow paths (HEIC, animated GIF) ---
//
// libheif (HEIC decode) and our hand-rolled GIF encoder both run as a single
// opaque call. Neither exposes a progress callback. For ops that can exceed
// ~2s we still want the UI to feel responsive, so we animate a per-card
// progress bar on an asymptotic elapsed-time curve:
//
//    pct = CAP * (1 - exp(-t / tau))
//
// The bar approaches CAP (90%) but never quite reaches it — when the real
// work finishes, onItemResult/onItemError calls clearCardProgress() and the
// bar vanishes, which reads as "snapped to done". This is the standard
// honest-ish approach for progress on black-box operations.
const PSEUDO_PROGRESS_CAP = 90;
const pseudoProgressTimers = new Map(); // id → intervalId

function startPseudoProgress(id, label, expectedMs = 2500) {
  stopPseudoProgress(id); // safety: reset any stale timer
  const start = performance.now();
  // tau controls how fast the curve rises. At t=expectedMs, we want ~63% of
  // the remaining range filled (one time-constant in exponential terms), so
  // tau === expectedMs gives a visually satisfying "halfway-ish at expected".
  const tau = Math.max(500, expectedMs);
  // Paint an initial non-zero tick immediately so the bar appears instantly.
  setCardProgress(id, 2, label);
  const intervalId = setInterval(() => {
    const elapsed = performance.now() - start;
    const pct = PSEUDO_PROGRESS_CAP * (1 - Math.exp(-elapsed / tau));
    setCardProgress(id, pct, label);
  }, 120);
  pseudoProgressTimers.set(id, intervalId);
}

function stopPseudoProgress(id) {
  const intervalId = pseudoProgressTimers.get(id);
  if (intervalId !== undefined) {
    clearInterval(intervalId);
    pseudoProgressTimers.delete(id);
  }
  clearCardProgress(id);
}

/**
 * Should this item show a per-card progress bar?
 * True for HEIC (WASM decode is 2-4s) and animated GIFs (per-frame encode
 * can run several seconds). Static JPEG/PNG/WebP paths are fast enough that
 * a progress bar would just flicker.
 *
 * @param {File} file
 * @param {boolean} animatedGif - pre-detected by handleNewFiles
 * @returns {{ show: boolean, label: string, expectedMs: number }}
 */
function slowOpHint(file, animatedGif) {
  if (isHeicFile(file)) {
    return { show: true, label: 'Decoding HEIC…', expectedMs: 3000 };
  }
  if (animatedGif) {
    return { show: true, label: 'Encoding GIF…', expectedMs: 3500 };
  }
  return { show: false, label: '', expectedMs: 0 };
}

// --- Select / Deselect controls ---

function updateBatchControls() {
  // Multi-select spans both queues (C4) — gate on the combined card count so a
  // PDF-only or mixed workspace also gets the per-card toggles + bulk toolbar.
  const count = imageQueue.size + pdfQueue.size;
  const multi = count >= 2;
  selectAllBtn.hidden = !multi;
  deselectAllBtn.hidden = !multi;

  // Multi-select (per-card toggles + bulk toolbar) only makes sense with 2+
  // files. Gate the whole pathway: reveal the toggles via a list class, and
  // drop any lingering selection if we've fallen back to a single file so the
  // bulk toolbar can't stay open over a one-file workflow.
  if (previewListEl) previewListEl.classList.toggle('multi-enabled', multi);
  if (!multi && selectedIds.size > 0) clearSelection();

  // Step indicators (1 Add · 2 Size · 3 Export) are refreshed centrally inside
  // updateExportMeta(), which knows both the queue count and whether a result
  // is ready to export.
  updateExportMeta();
}

/**
 * Drive the sidebar's stepped progress indicator (1 Add · 2 Choose a size ·
 * 3 Export). Each step shows one of three states:
 *   active — the step the user is currently on (solid accent + ring)
 *   done   — completed (green ✓)
 *   idle   — not yet reachable (muted gray)
 *
 * Progression: empty → Step 1 active. Images present but no result yet →
 * Step 1 done, Step 2 active. A result is ready → Steps 1-2 done, Step 3 active
 * (and the green Download button enables).
 *
 * @param {number} count - images in the queue
 * @param {boolean} exportable - at least one finished result exists
 */
function refreshStepIndicators(count, exportable) {
  const setStep = (numId, titleId, state, label) => {
    const num = document.getElementById(numId);
    const title = document.getElementById(titleId);
    if (num) {
      num.classList.remove('active', 'done', 'idle');
      if (state !== 'reachable') num.classList.add(state);
      num.textContent = state === 'done' ? '✓' : label;
    }
    if (title) {
      title.classList.toggle('active', state === 'active');
      title.classList.toggle('idle', state === 'idle');
    }
  };

  setStep('step1Num', 'step1Title', count === 0 ? 'active' : 'done', '1');
  setStep('step2Num', 'step2Title', count === 0 ? 'idle' : exportable ? 'done' : 'active', '2');
  // Skip Step 3 while a transient "Exported ✓" confirmation is showing.
  if (!exportConfirmActive) {
    setStep('step3Num', 'step3Title', exportable ? 'active' : 'idle', '3');
  }
}

// Transient "Exported ✓" confirmation state for Step 3.
let exportConfirmActive = false;
let exportConfirmTimer = null;

/**
 * Refresh Step 3 (Export): enable/disable the buttons, and show a live
 * "N images · ~X MB out" readout summing the processed output sizes. Skips the
 * meta text while a transient "Exported ✓" confirmation is showing.
 */
function updateExportMeta() {
  const count = imageQueue.size;

  // Tally finished results so the buttons only enable when there's something to
  // export — during a settings-change reprocess every result is briefly null.
  let bytes = 0;
  let done = 0;
  for (const item of imageQueue.values()) {
    if (item.result && typeof item.result.outputSize === 'number') {
      bytes += item.result.outputSize;
      done++;
    }
  }
  const exportable = done > 0;

  const btn = document.getElementById('exportStep3Btn');
  const zipBtn = document.getElementById('exportZipStep3Btn');
  const meta = document.getElementById('exportMeta');

  if (btn) btn.disabled = !exportable;
  if (zipBtn) zipBtn.disabled = !exportable;
  refreshStepIndicators(count, exportable);

  if (!meta || exportConfirmActive) return;

  if (count === 0) {
    meta.textContent = 'Ready after step 1';
    return;
  }

  const imgs = `${count} image${count > 1 ? 's' : ''}`;
  meta.textContent =
    done === count ? `${imgs} · ~${formatBytes(bytes)} out` : `${imgs} · calculating…`;
}

/**
 * Briefly show "Exported ✓" on Step 3 after a successful export, then revert.
 */
function flashExportConfirm() {
  const step3Num = document.getElementById('step3Num');
  const meta = document.getElementById('exportMeta');
  exportConfirmActive = true;
  if (step3Num) {
    step3Num.classList.remove('idle', 'active');
    step3Num.classList.add('done');
    step3Num.textContent = '✓';
  }
  if (meta) meta.textContent = 'Exported ✓';
  if (exportConfirmTimer) clearTimeout(exportConfirmTimer);
  exportConfirmTimer = setTimeout(() => {
    exportConfirmActive = false;
    if (step3Num) {
      step3Num.classList.remove('done');
      step3Num.textContent = '3';
    }
    updateExportMeta();
  }, 2800);
}

/**
 * Walk the cards in #previewList in visual (DOM) order and return one entry per
 * id — used by every mixed image+PDF path (C4) that must respect the order the
 * cards actually appear in. Strips the `card-` id prefix and classifies each id
 * via the two queues; cards belonging to neither queue are skipped.
 * @returns {{ id: string, kind: 'image' | 'pdf',
 *   item: import('./modules/batch-manager.js').BatchItem |
 *     { id: string, file: File, kind: 'pdf', pdfMeta: object|null } }[]}
 */
function cardsInDomOrder() {
  if (!previewListEl) return [];
  const out = [];
  for (const card of previewListEl.children) {
    if (!card.id || !card.id.startsWith('card-')) continue;
    const id = card.id.replace(/^card-/, '');
    if (pdfQueue.has(id)) out.push({ id, kind: 'pdf', item: pdfQueue.get(id) });
    else if (imageQueue.has(id)) out.push({ id, kind: 'image', item: imageQueue.get(id) });
  }
  return out;
}

/**
 * Same as `cardsInDomOrder` but filtered to the current selection — the ordered
 * source of truth for bulk download / combine / ZIP across both queues.
 * @returns {ReturnType<typeof cardsInDomOrder>}
 */
function selectedInDomOrder() {
  return cardsInDomOrder().filter((e) => selectedIds.has(e.id));
}

/**
 * Tally how many images vs PDFs are currently selected. Drives the mixed count
 * label and the rotate/flip disable rule (greyed when any PDF is selected).
 * @returns {{ images: number, pdfs: number }}
 */
function selectionCounts() {
  let images = 0;
  let pdfs = 0;
  for (const e of selectedInDomOrder()) {
    if (e.kind === 'pdf') pdfs++;
    else images++;
  }
  return { images, pdfs };
}

/**
 * Select every card currently in the workspace (both queues), in DOM order.
 * Anchor becomes the first card's id so a subsequent Shift-click produces an
 * intuitive range.
 */
function selectAllIds() {
  selectedIds.clear();
  const cards = cardsInDomOrder();
  for (const { id } of cards) selectedIds.add(id);
  selectionAnchor = cards.length > 0 ? cards[0].id : null;
  renderSelectionState();
}

/**
 * Clear all selection state. Also resets the anchor so the next Shift-click
 * starts fresh from the clicked item.
 */
function clearSelection() {
  if (selectedIds.size === 0 && selectionAnchor === null) return;
  selectedIds.clear();
  selectionAnchor = null;
  renderSelectionState();
}

/**
 * Cmd/Ctrl-click semantics: toggle this id in/out of the selection and
 * update the anchor so future Shift-click extends from here.
 * @param {string} id
 */
function toggleSelectOne(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  selectionAnchor = id;
  renderSelectionState();
}

/**
 * Shift-click semantics: select every id between `fromId` and `toId` in the
 * queue's insertion order (inclusive), REPLACING any previous selection —
 * this matches Finder, Explorer, and every mail client. The anchor is
 * preserved so the user can keep extending the range with further
 * Shift-clicks.
 * @param {string} fromId - The anchor id
 * @param {string} toId - The id the user just clicked
 */
function selectRange(fromId, toId) {
  // DOM order spans both queues so a range can cross image and PDF cards.
  const ids = cardsInDomOrder().map((e) => e.id);
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) {
    // Anchor is stale (item was removed). Fall back to single-select.
    selectedIds.clear();
    selectedIds.add(toId);
    selectionAnchor = toId;
    renderSelectionState();
    return;
  }
  const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  selectedIds.clear();
  for (let i = lo; i <= hi; i++) selectedIds.add(ids[i]);
  // Anchor intentionally left as-is so further Shift-clicks extend from the
  // original anchor rather than creeping with each click.
  renderSelectionState();
}

/**
 * Drop a single id from the selection (used by `handleRemove` so the
 * selection doesn't hold stale ids after a card is deleted).
 * @param {string} id
 */
function removeFromSelection(id) {
  const changed = selectedIds.delete(id);
  if (selectionAnchor === id) selectionAnchor = null;
  if (changed) renderSelectionState();
}

/**
 * Batch variant of `removeFromSelection` for cleanup paths that remove many
 * ids at once (bulk delete, bulk export). Triggers a single render instead
 * of N renders — important because `renderSelectionState` walks the entire
 * queue, and doing that once per id would be quadratic.
 * @param {Iterable<string>} ids
 */
function removeIdsFromSelection(ids) {
  let changed = false;
  for (const id of ids) {
    if (selectedIds.delete(id)) changed = true;
    if (selectionAnchor === id) selectionAnchor = null;
  }
  if (changed) renderSelectionState();
}

/**
 * Reflect the current selection into the DOM:
 *  - Toggle `.selected` on each preview card
 *  - Show/hide the bulk toolbar based on `selectedIds.size`
 *  - Update the count label and aria-live announcement
 *
 * Called after any selection mutation. Kept cheap — only touches classList
 * on known ids, no full re-query of the DOM.
 */
function renderSelectionState() {
  // Toggle .selected on every card in both queues. Walking the queues (not
  // `querySelectorAll`) keeps this O(n) and safe against stale DOM nodes.
  for (const id of [...imageQueue.keys(), ...pdfQueue.keys()]) {
    const card = document.getElementById(`card-${id}`);
    if (!card) continue;
    const isSel = selectedIds.has(id);
    card.classList.toggle('selected', isSel);
    card.setAttribute('aria-selected', isSel ? 'true' : 'false');
    // The circular select toggle reflects selection visually via the card's
    // `.selected` class (CSS); we just keep its aria-pressed state in sync.
    const selectBtn = card.querySelector('.preview-card-select');
    if (selectBtn) selectBtn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
  }

  const count = selectedIds.size;
  // While any card is selected, reveal every card's checkbox (not just the
  // hovered one) so the selection set is visible at a glance.
  if (previewListEl) {
    previewListEl.classList.toggle('has-selection', count > 0);
  }
  if (bulkToolbarEl) {
    bulkToolbarEl.hidden = count === 0;
  }
  if (bulkToolbarCountEl) {
    bulkToolbarCountEl.textContent = selectionCountLabel();
  }

  // Rotate/flip don't apply to PDFs — grey them out (still visible) whenever the
  // selection contains any PDF. Delete stays enabled (mixed delete is wired).
  const counts = selectionCounts();
  const blockEdits = counts.pdfs > 0;
  // H16: explain why rotate/flip are greyed when the selection includes a PDF
  // (they apply to images only). Set a title on disable; restore the normal
  // custom-tooltip state on enable.
  for (const btn of [bulkRotateCcwBtn, bulkRotateCwBtn, bulkFlipHBtn, bulkFlipVBtn]) {
    if (!btn) continue;
    btn.disabled = blockEdits;
    if (blockEdits) btn.title = t('bulk.rotateFlipImagesOnly');
    else btn.removeAttribute('title');
  }

  // "Optimize PDFs" (D6) only makes sense for PDFs — show it only when the
  // selection contains at least one (and the PDF feature is compiled in).
  if (bulkOptimizePdfBtn) {
    bulkOptimizePdfBtn.hidden = !(isPdfSupported() && counts.pdfs > 0);
  }
}

/**
 * Build the bulk-toolbar count label for the current selection. Picks an
 * images-only, PDFs-only, or mixed phrasing and respects singular/plural — the
 * `t()` helper only does `{var}` interpolation, so the plural choice is made
 * here in JS.
 * @returns {string}
 */
function selectionCountLabel() {
  const { images, pdfs } = selectionCounts();
  if (images > 0 && pdfs > 0) {
    const imgPart = t('bulk.countImagesPart', { count: images });
    const pdfPart = t('bulk.countPdfsPart', { count: pdfs });
    return t('bulk.countMixed', { images: imgPart, pdfs: pdfPart });
  }
  if (pdfs > 0) return t('bulk.countPdfs', { count: pdfs });
  return t('bulk.countImages', { count: images });
}

/**
 * Handler for the "Select All" / "Deselect All" header buttons.
 * @param {boolean} select - true → select all, false → clear selection
 */
function toggleSelectAll(select) {
  if (select) {
    selectAllIds();
    announce(t('announce.allSelected', { count: imageQueue.size }));
  } else {
    clearSelection();
    announce(t('announce.selectionCleared'));
  }
}

// --- Drag-to-reorder (Phase 3c) ---
//
// Updates the queue's iteration order (Map insertion order) AND the DOM to
// match the new order. Per the plan, this does NOT rename files or change
// ZIP filename numbering — it only changes display + download iteration
// order. The `{preset}` / `{name}` / `{width}` / `{height}` tokens are
// unaffected because none of them are position-dependent.
//
// Implementation note: JavaScript `Map` preserves insertion order, so we
// rebuild the whole Map to move one item. For queues of realistic size
// (≤ 50 items per the batch guard), this is trivially fast.
function handleReorder(sourceId, targetId, insertBefore) {
  if (sourceId === targetId) return;
  if (!imageQueue.has(sourceId) || !imageQueue.has(targetId)) return;

  // Rebuild the queue Map in the new order. Destructuring into an array
  // preserves references so BatchItem contents are untouched.
  const entries = Array.from(imageQueue.entries());
  const moving = entries.find(([id]) => id === sourceId);
  const without = entries.filter(([id]) => id !== sourceId);
  const targetIdx = without.findIndex(([id]) => id === targetId);
  if (targetIdx === -1 || !moving) return;

  const insertIdx = insertBefore ? targetIdx : targetIdx + 1;
  without.splice(insertIdx, 0, moving);

  imageQueue.clear();
  for (const [id, item] of without) imageQueue.set(id, item);

  // Mirror the change in the DOM so the user sees the card move. Doing
  // this manually (rather than re-rendering all cards) preserves each
  // card's internal state — ongoing processing animations, thumbnail
  // blob URLs, edit toolbar wiring, selected class, etc.
  const draggedCard = document.getElementById(`card-${sourceId}`);
  const targetCard = document.getElementById(`card-${targetId}`);
  if (draggedCard && targetCard && draggedCard !== targetCard) {
    if (insertBefore) {
      targetCard.parentNode.insertBefore(draggedCard, targetCard);
    } else {
      targetCard.parentNode.insertBefore(draggedCard, targetCard.nextSibling);
    }
  }

  announce(t('announce.imageReordered'));
}

/**
 * Phase 3c a11y — keyboard reordering for users who can't drag.
 *
 * Moves the card with `id` one slot up or down. Delegates to `handleReorder`
 * so the queue + DOM mutation + announce logic stays in one place.
 *
 * Focus is deliberately restored to the card AFTER the DOM move (browsers
 * keep focus on the element across `insertBefore`, but we call `.focus()`
 * anyway to be defensive: some assistive tech drops focus when the element
 * is re-parented). The announcement is overridden here to include the
 * resulting 1-based position so screen readers know where the card landed.
 *
 * @param {string} id - Card id to move
 * @param {'up' | 'down'} direction
 */
function handleMoveCard(id, direction) {
  if (!imageQueue.has(id)) return;
  const ids = Array.from(imageQueue.keys());
  const idx = ids.indexOf(id);
  if (idx === -1) return;

  if (direction === 'up' && idx > 0) {
    handleReorder(id, ids[idx - 1], /* insertBefore: */ true);
  } else if (direction === 'down' && idx < ids.length - 1) {
    handleReorder(id, ids[idx + 1], /* insertBefore: */ false);
  } else {
    // Already at the edge — no-op but announce so screen-reader users get
    // feedback instead of silent nothing.
    announce(direction === 'up' ? t('announce.alreadyTop') : t('announce.alreadyBottom'));
    return;
  }

  // Re-announce with position (overrides the generic "Image reordered" from
  // handleReorder — aria-live reads the most recent update).
  const newIds = Array.from(imageQueue.keys());
  const newIdx = newIds.indexOf(id);
  announce(t('announce.movedToPosition', { pos: newIdx + 1, total: newIds.length }));

  // Restore focus to the moved card (defensive — most browsers preserve it).
  const card = document.getElementById(`card-${id}`);
  if (card) card.focus();
}

// --- preview-list delegated listeners (multi-select click + keyboard reorder) ---
//
// Delegates from the list root so newly-added cards participate automatically —
// no per-card listener installation needed.
//
// Multi-select uses CAPTURE phase for its click listener so it fires before
// the nested per-card handlers (buttons, thumbnail, edit toolbar): without
// this a Cmd-click on the thumbnail would still open the editor; we want
// modifier-clicks to always mean "select", never "activate". Plain clicks
// (no modifier) pass straight through untouched.
//
// Known limitations (acceptable for this pass):
//   - On macOS, Ctrl-click also fires the native `contextmenu` event. Our
//     handler still runs, which toggles selection — the context menu flashes
//     but the action is correct. Mac users typically use Cmd-click anyway.
//   - Keyboard-only multi-select (Shift+Space, etc.) is not wired here.
//     Cards ARE focusable as of Phase 3c (tabindex=0) so Alt+Arrow reorder
//     works; extending that to keyboard-range-select is a follow-up.
//     Select All / Deselect All / Delete Selected buttons cover the bulk
//     keyboard path in the meantime.
const previewListEl = document.getElementById('previewList');
if (previewListEl) {
  previewListEl.addEventListener(
    'click',
    (e) => {
      const card = e.target.closest('.preview-card');
      if (!card) return;

      const id = card.id.replace(/^card-/, '');
      // Accept both queues so PDF cards are selectable too (C4 mixed selection).
      if (!imageQueue.has(id) && !pdfQueue.has(id)) return;

      // The visible select checkbox toggles selection on a plain click (no
      // modifier needed) — this is the discoverable path. Shift still extends
      // a range from the anchor. We drive the checked state from selectedIds
      // via renderSelectionState, so cancel the input's native toggle.
      const viaCheckbox = e.target.closest('[data-action="select"]');
      const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!viaCheckbox && !hasModifier) return;

      // Block the rest of the propagation — this prevents the download /
      // edit / thumb handlers on descendants from running as well.
      e.stopPropagation();
      e.preventDefault();

      if (e.shiftKey && selectionAnchor) {
        selectRange(selectionAnchor, id);
      } else {
        toggleSelectOne(id);
      }
    },
    /* capture: */ true
  );

  // Phase 3c a11y — Alt+ArrowUp / Alt+ArrowDown on a focused card moves it
  // one slot. Scoped to the list (not global) so it only fires when focus
  // is inside a card; avoids clashing with Alt+Arrow shortcuts elsewhere.
  // We require the Alt modifier specifically so plain arrows still scroll
  // the page / navigate focus when they're meant to.
  previewListEl.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

    const card = e.target.closest('.preview-card');
    if (!card) return;

    const id = card.id.replace(/^card-/, '');
    if (!imageQueue.has(id)) return;

    e.preventDefault();
    e.stopPropagation();
    handleMoveCard(id, e.key === 'ArrowUp' ? 'up' : 'down');
  });
}

// --- Performance guards ---

/**
 * Check image dimensions and warn if above 30 megapixels
 * @param {File} file
 */
function checkImageSize(file) {
  // Skip HEIC and SVG — no quick way to read dims without decode/parse
  if (isHeicFile(file)) return;
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return;

  const img = new Image();
  const url = trackUrl(URL.createObjectURL(file));
  const timeout = setTimeout(() => {
    revokeUrl(url);
  }, 3000);

  img.onload = () => {
    clearTimeout(timeout);
    revokeUrl(url);
    const megapixels = (img.naturalWidth * img.naturalHeight) / 1_000_000;
    if (megapixels > MAX_MEGAPIXELS) {
      showToast(
        t('toast.megapixelWarn', { name: file.name, mp: megapixels.toFixed(0) }),
        'warning',
        8000
      );
    }
  };
  img.onerror = () => {
    clearTimeout(timeout);
    revokeUrl(url);
  };
  img.src = url;
}

// --- Handlers ---

/**
 * Show a toast when files are rejected (unsupported type)
 * @param {File[]} files
 */
function handleRejectedFiles(files) {
  const names = files.map((f) => f.name).slice(0, 3);
  const suffix = files.length > 3 ? ' ' + t('toast.andMore', { count: files.length - 3 }) : '';
  const nameList = names.join(', ') + suffix;
  showToast(t('toast.unsupportedType', { names: nameList }), 'error', 6000);
}

/** True for PDF files (by MIME or .pdf extension). */
function isPdfFile(file) {
  if (file.type === 'application/pdf') return true;
  return !!file.name && file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Confirm a file actually starts with the "%PDF-" signature. Catches a file that
 * merely *claims* to be a PDF (by .pdf extension or MIME) but isn't — so it fails
 * fast with a clear message instead of becoming a broken card that only reveals
 * its brokenness when clicked.
 * @param {File} file
 * @returns {Promise<boolean>}
 */
async function looksLikePdf(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    // "%PDF-" = 0x25 0x50 0x44 0x46 0x2d
    return (
      head.length === 5 &&
      head[0] === 0x25 &&
      head[1] === 0x50 &&
      head[2] === 0x44 &&
      head[3] === 0x46 &&
      head[4] === 0x2d
    );
  } catch {
    return false;
  }
}

/**
 * C1 unified intake — add a dropped PDF as a card in the shared preview list.
 * The page count + first-page thumbnail fill in asynchronously via the lazy
 * pdf-worker (mirrors the HEIC/GIF async pattern). Clicking the card opens the
 * existing PDF modal as the interim bridge until the C2 drill-in editor.
 * @param {File} file
 */
function addPdfCard(file) {
  const id = generateId();
  const item = { id, file, kind: 'pdf', pdfMeta: null };
  pdfQueue.set(id, item);
  dropZoneEl.classList.add('has-images');

  addPdfPreviewCard(
    id,
    file,
    (cardId) => removePdfCard(cardId),
    () => {
      // Open the drill-in on the card's CURRENT file (it may have been edited
      // already), and persist applied page edits back to the card (C2).
      const current = pdfQueue.get(id);
      if (!current) return;
      openPdfModal(current.file, {
        onApply: (editedFile) => {
          current.file = editedFile;
          getPdfCardMeta(editedFile)
            .then((meta) => {
              current.pdfMeta = meta;
              updatePdfCardMeta(id, meta);
            })
            .catch(() => {
              /* keep the existing card meta if re-reading fails */
            });
        },
      });
    },
    (cardId) => {
      // Per-card Download — saves the card's current (possibly edited/optimized) PDF (H4).
      const current = pdfQueue.get(cardId);
      if (current) downloadBlob(current.file, current.file.name);
    }
  );
  announce(t('announce.pdfAdded', { name: file.name }));

  // Reveal the multi-select pathway once 2+ cards exist across both queues.
  updateBatchControls();

  getPdfCardMeta(file)
    .then((meta) => {
      item.pdfMeta = meta;
      updatePdfCardMeta(id, meta);
    })
    .catch(() => {
      // Engine/read failure — leave the placeholder card; clicking it still
      // opens the modal, which surfaces its own error if the PDF is unreadable.
    });
}

/**
 * Remove a PDF card and its queue entry. Restores the empty-state hero only when
 * both queues are empty (removePreviewCard already brings the hero back by DOM
 * count; this also drops the drop-zone's has-images class).
 * @param {string} id
 */
function removePdfCard(id) {
  pdfQueue.delete(id);
  removePreviewCard(id);
  // Keep the selection + multi-select pathway in sync (the card may have been
  // selected, and dropping below 2 cards should retract the toolbar).
  removeFromSelection(id);
  updateBatchControls();
  if (imageQueue.size === 0 && pdfQueue.size === 0) {
    dropZoneEl.classList.remove('has-images');
  }
}

/**
 * Handle new files from drop zone or file picker
 * @param {File[]} files
 */
async function handleNewFiles(files) {
  // C1 unified intake — PDFs render as cards in the shared workspace (their own
  // queue), not the separate modal-on-drop. Clicking a PDF card opens the modal
  // (interim bridge) until the C2 in-place drill-in lands.
  const pdfs = files.filter(isPdfFile);
  if (pdfs.length > 0) {
    if (!isPdfSupported()) {
      showToast(t('pdf.errorUnsupported'), 'error', 6000);
    } else {
      // Validate the %PDF- signature before committing a card, so an extension-
      // spoofed or corrupt-header file is rejected up front rather than landing a
      // broken placeholder card.
      for (const file of pdfs) {
        if (await looksLikePdf(file)) {
          addPdfCard(file);
        } else {
          showToast(t('pdf.errorNotPdf', { name: file.name }), 'error', 6000);
        }
      }
    }
    const images = files.filter((f) => !isPdfFile(f));
    if (images.length === 0) return; // PDFs are handled as cards; nothing else to do
    files = images; // fall through to process the remaining images
  }

  // Performance guard: warn on large batches
  if (files.length > MAX_BATCH_SIZE) {
    showToast(t('toast.largeBatch', { count: files.length, max: MAX_BATCH_SIZE }), 'warning', 8000);
  }

  // Phase 3b — Drop a new batch always starts with a clean selection so the
  // user isn't applying old selection state to a freshly-loaded queue. "Keep
  // selection" across drops is a deferred enhancement per the plan.
  clearSelection();

  dropZoneEl.classList.add('has-images');

  const newItems = [];

  for (const file of files) {
    const id = generateId();
    const fileIsHeic = isHeicFile(file);

    /** @type {import('./modules/batch-manager.js').BatchItem} */
    const item = {
      id,
      file,
      result: null,
      status: 'pending',
      edits: createDefaultEdits(),
      // Slow-path flags consumed by the per-card progress bar in onItemStatus.
      // `isHeic` is known immediately; `isAnimatedGif` is filled in async by
      // the detection `.then()` below (races the batch start in the worst
      // case — degrades to "no progress bar" if it loses). Defaults to false.
      isHeic: fileIsHeic,
      isAnimatedGif: false,
    };
    imageQueue.set(id, item);
    newItems.push(item);

    if (fileIsHeic) {
      showToast(t('toast.decodingHeic', { name: file.name }), 'info', 6000);
    }

    // Warn about animated GIF frame stripping (only when output isn't GIF)
    if (isGifFile(file)) {
      const currentSettings = getProcessSettings();
      isAnimatedGif(file)
        .then((animated) => {
          if (animated) {
            item.isAnimatedGif = true;
            if (currentSettings.format !== 'gif') {
              showToast(t('toast.animatedGifWarn', { name: file.name }), 'warning', 6000);
            }
          }
        })
        .catch(() => {
          /* detection failed — silently proceed */
        });
    }

    // Phase 3a — Warn about APNG / animated WebP. The Canvas pipeline decodes
    // the first frame only for both formats, so the user would otherwise
    // silently get a static export from an animated source. No preserve-path
    // yet (unlike GIF), so the message is definitive: animation WILL be lost.
    if (isPngFile(file)) {
      isAnimatedPng(file)
        .then((animated) => {
          if (animated) {
            showToast(t('toast.apngWarn', { name: file.name }), 'warning', 6000);
          }
        })
        .catch(() => {
          /* detection failed — silently proceed */
        });
    } else if (isWebpFile(file)) {
      isAnimatedWebp(file)
        .then((animated) => {
          if (animated) {
            showToast(t('toast.animatedWebpWarn', { name: file.name }), 'warning', 6000);
          }
        })
        .catch(() => {
          /* detection failed — silently proceed */
        });
    }

    // Check for very large images (non-blocking — fire-and-forget warning)
    checkImageSize(file);

    // Await card creation before processing (race condition fix from Phase 1)
    await addPreviewCard(id, file, (i) => removeImagesWithUndo([i]), handleDownloadSingle, {
      onRotate: handleRotate,
      onFlip: handleFlip,
      onCrop: handleCrop,
      onCopy: handleCopy,
      onRevert: handleRevert,
    });

    // Show the center-crop overlay immediately if the active preset is exact-mode.
    updateCropOverlay(id, getProcessSettings());
  }

  if (imageQueue.size === 0) {
    dropZoneEl.classList.remove('has-images');

    return;
  }

  updateBatchControls();

  // Announce to screen readers
  announce(t('announce.imagesAdded', { count: newItems.length }));

  // Batch process all new items
  const settings = getProcessSettings();

  showProgress(0, newItems.length);

  try {
    await processBatch(newItems, settings, {
      onItemStatus: (id, status) => {
        const card = document.getElementById(`card-${id}`);
        if (card) {
          card.classList.toggle('processing', status === 'processing');
        }
        if (status === 'processing') {
          const item = imageQueue.get(id);
          if (item) {
            const hint = slowOpHint(item.file, item.isAnimatedGif);
            if (hint.show) startPseudoProgress(id, hint.label, hint.expectedMs);
          }
        }
      },
      onItemResult: (id, result) => {
        // Swap thumbnail to processed output when the user has applied edits
        // (crop/rotate/flip) so the preview matches what will actually export.
        // WYSIWYG: what you see in the preview is what lands in the download.
        const item = imageQueue.get(id);
        const refreshThumb = !!(item && item.edits && hasEdits(item.edits));
        stopPseudoProgress(id);
        updatePreviewCardResult(id, result, refreshThumb);
        if (item) setCardEditedState(id, hasEdits(item.edits));
      },
      onItemError: (id, message) => {
        stopPseudoProgress(id);
        updatePreviewCardError(id, message);
        const item = imageQueue.get(id);
        showToast(t('toast.failedItem', { name: item?.file.name || id, message }), 'error');
      },
      onProgress: (completed, total) => {
        showProgress(completed, total);
      },
      onBatchComplete: () => {
        hideProgress();
        updateExportMeta();
        const successCount = newItems.filter((i) => i.status === 'done').length;
        if (newItems.length > 1 && successCount > 0) {
          showToast(
            t('toast.processed', { success: successCount, total: newItems.length }),
            'success',
            3000
          );
        }
        announce(t('announce.processingComplete', { count: successCount }));
        // Analytics: activation signal — fires once per add-batch (not on the
        // settings-change reprocess path, which would flood). Content-free.
        if (successCount > 0) {
          trackImageProcessed({ count: successCount, format: settings.format });
        }
      },
    });
  } catch (err) {
    // Error boundary: catch unexpected errors so the app doesn't break
    console.error('PixelGnome: Batch processing error:', err);
    showToast(t('toast.unexpectedError'), 'error');
    hideProgress();
  }
}

/**
 * Re-process all images when settings change.
 *
 * @param {Set<string>} [idsFilter] - Optional subset of ids to reprocess.
 *   When omitted, the whole queue is reprocessed (settings-change path).
 *   When provided, only matching items run — used by the bulk-edit path
 *   (Phase 3b) so rotate/flip on a selection doesn't touch unselected cards.
 */
async function reprocessAll(idsFilter) {
  if (imageQueue.size === 0) return;
  if (isBatchProcessing()) return; // Don't interrupt a running batch

  const items = idsFilter
    ? Array.from(imageQueue.values()).filter((i) => idsFilter.has(i.id))
    : Array.from(imageQueue.values());
  if (items.length === 0) return;

  const settings = getProcessSettings();

  // Reset all cards to processing state
  for (const item of items) {
    item.status = 'pending';
    item.result = null;
    resetCardToProcessing(item.id);
  }

  // Results are now stale — reflect "calculating…" and disable export until the
  // reprocess finishes (onBatchComplete calls updateExportMeta again).
  updateExportMeta();

  showProgress(0, items.length);

  try {
    await processBatch(items, settings, {
      onItemStatus: (id, status) => {
        const card = document.getElementById(`card-${id}`);
        if (card) card.classList.toggle('processing', status === 'processing');
        if (status === 'processing') {
          const item = imageQueue.get(id);
          if (item) {
            const hint = slowOpHint(item.file, item.isAnimatedGif);
            if (hint.show) startPseudoProgress(id, hint.label, hint.expectedMs);
          }
        }
      },
      onItemResult: (id, result) => {
        // Mirror handleNewFiles: refresh the thumbnail when the item has
        // pending edits so settings changes don't revert the preview to the
        // unedited source.
        const item = imageQueue.get(id);
        const refreshThumb = !!(item && item.edits && hasEdits(item.edits));
        stopPseudoProgress(id);
        updatePreviewCardResult(id, result, refreshThumb);
        if (item) setCardEditedState(id, hasEdits(item.edits));
      },
      onItemError: (id, message) => {
        stopPseudoProgress(id);
        updatePreviewCardError(id, message);
      },
      onProgress: (completed, total) => {
        showProgress(completed, total);
      },
      onBatchComplete: () => {
        hideProgress();
        updateExportMeta();
      },
    });
  } catch (err) {
    console.error('PixelGnome: Re-process error:', err);
    showToast(t('toast.reprocessFailed'), 'error');
    hideProgress();
  }
}

/**
 * Copy a processed image to clipboard
 */
async function handleCopy(id) {
  const item = imageQueue.get(id);
  if (!item?.result?.blob) {
    showToast(t('toast.noImageCopy'), 'warning');
    return;
  }
  try {
    // Clipboard API requires image/png — convert if needed
    let pngBlob = item.result.blob;
    if (item.result.blob.type !== 'image/png') {
      const img = new Image();
      const url = trackUrl(URL.createObjectURL(item.result.blob));
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
      } finally {
        revokeUrl(url);
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    showToast(t('toast.copiedToClipboard', { name: item.file.name }), 'success', 3000);
  } catch (err) {
    showToast(t('toast.copyFailed'), 'error');
    console.error('Clipboard write error:', err);
  }
}

/**
 * Remove a single image from the queue
 */
function handleRemove(id) {
  // Revoke blob URL from the thumbnail before removing
  revokeCardBlobUrl(id);
  // And stop any pseudo-progress timer attached to this id
  stopPseudoProgress(id);

  imageQueue.delete(id);
  removePreviewCard(id);
  updateBatchControls();

  // Drop this id from the selection so the toolbar count stays accurate.
  // Safe to call whether or not the id was selected.
  removeFromSelection(id);

  if (imageQueue.size === 0) {
    dropZoneEl.classList.remove('has-images');
  }
}

/**
 * User-facing delete for one or more images, with a 6-second Undo affordance.
 * The low-level handleRemove() does the actual teardown; this wraps it with a
 * snapshot (queue order + the removed item objects) so the toast's Undo can
 * restore them in place. Used by the per-card remove button, the keyboard
 * delete path, and bulk delete.
 * @param {string[]} ids
 */
function removeImagesWithUndo(ids) {
  // Snapshot order + items BEFORE teardown so Undo can restore verbatim.
  const prevOrder = Array.from(imageQueue.keys());
  const removed = ids.map((id) => ({ id, item: imageQueue.get(id) })).filter((e) => e.item);
  if (removed.length === 0) return;

  for (const { id } of removed) handleRemove(id);

  const n = removed.length;
  showToast(t('toast.removed', { count: n }), 'info', 6000, {
    action: {
      label: t('toast.undo'),
      onClick: () => restoreRemovedImages(prevOrder, removed),
    },
  });
  announce(t('announce.removed', { count: n }));
}

/**
 * Restore images removed via removeImagesWithUndo(): re-insert them at their
 * original queue positions, recreate their cards in order, and reprocess them
 * so thumbnails/results regenerate. Surviving cards are moved (via appendChild)
 * rather than rebuilt — only the restored cards are recreated.
 * @param {string[]} prevOrder - queue id order captured at delete time
 * @param {{id:string,item:object}[]} removed
 */
async function restoreRemovedImages(prevOrder, removed) {
  const restoreMap = new Map(removed.map((e) => [e.id, e.item]));
  // Rebuild the queue order: keep every pre-deletion id that's either still
  // present (a survivor) or being restored, in the original sequence.
  const newOrder = prevOrder.filter((id) => imageQueue.has(id) || restoreMap.has(id));
  // Preserve any images added after the snapshot (not in prevOrder) — append
  // them at the end so an Undo doesn't discard newer work.
  for (const id of imageQueue.keys()) {
    if (!newOrder.includes(id)) newOrder.push(id);
  }
  const rebuilt = new Map();
  for (const id of newOrder) {
    rebuilt.set(id, imageQueue.has(id) ? imageQueue.get(id) : restoreMap.get(id));
  }
  imageQueue.clear();
  for (const [id, item] of rebuilt) imageQueue.set(id, item);

  dropZoneEl.classList.add('has-images');

  // Recreate cards for the restored items (reset transient processing state so
  // the reprocess below repopulates result + thumbnail).
  for (const { id, item } of removed) {
    item.result = null;
    item.status = 'pending';
    await addPreviewCard(id, item.file, (i) => removeImagesWithUndo([i]), handleDownloadSingle, {
      onRotate: handleRotate,
      onFlip: handleFlip,
      onCrop: handleCrop,
      onCopy: handleCopy,
      onRevert: handleRevert,
    });
    updateCropOverlay(id, getProcessSettings());
  }

  // Re-order all cards to match the rebuilt queue. appendChild moves existing
  // nodes, so survivors keep their generated thumbnails.
  const list = document.getElementById('previewList');
  if (list) {
    for (const id of newOrder) {
      const card = document.getElementById(`card-${id}`);
      if (card) list.appendChild(card);
    }
  }

  updateBatchControls();
  announce(t('announce.restored', { count: removed.length }));

  // Reprocess only the restored ids to regenerate results + thumbnails.
  await reprocessAll(new Set(removed.map((e) => e.id)));
}

/**
 * Download a single processed image and move to history
 */
function handleDownloadSingle(id) {
  const item = imageQueue.get(id);
  if (!item || !item.result) return;

  const settings = getProcessSettings();
  const pattern = getPattern();
  const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
    width: item.result.outputWidth,
    height: item.result.outputHeight,
    preset: settings.presetId,
  });
  downloadBlob(item.result.blob, filename);

  markPreviewCardExported(id);
  addToHistory(item, filename, settings);
  announce(t('announce.downloaded', { filename }));
  trackExport({ format: settings.format, count: 1, isZip: false });

  // Remove from active queue after checkmark animation
  setTimeout(() => {
    revokeCardBlobUrl(id);
    imageQueue.delete(id);
    removePreviewCard(id);
    updateBatchControls();
    if (imageQueue.size === 0) {
      dropZoneEl.classList.remove('has-images');
    }
  }, 1200);
}

/**
 * Download processed images individually and move to history.
 *
 * @param {Set<string>} [idsFilter] - When provided, only items whose id is
 *   in this set are considered. Used by the Phase 3b bulk "Download selected"
 *   path; when omitted, the full queue is exported (legacy "Download" button).
 */
function handleExportAll(idsFilter) {
  const settings = getProcessSettings();
  const pattern = getPattern();
  let saved = 0;
  const idsToRemove = [];

  // Tally errored items so we can surface them in the summary toast.
  // "Total" for the summary is the set of items that had a chance to run
  // (saved + errored) — items still pending are excluded so we don't report
  // misleading denominators.
  let errored = 0;

  // Resolve the iteration source from the optional filter. Missing ids are
  // dropped silently (e.g. selection is stale because a card was removed).
  const entries = idsFilter
    ? Array.from(idsFilter)
        .map((id) => [id, imageQueue.get(id)])
        .filter(([, item]) => item)
    : Array.from(imageQueue);

  for (const [id, item] of entries) {
    if (item.result) {
      const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
        width: item.result.outputWidth,
        height: item.result.outputHeight,
        preset: settings.presetId,
      });
      downloadBlob(item.result.blob, filename);
      markPreviewCardExported(id);
      addToHistory(item, filename, settings);
      idsToRemove.push(id);
      saved++;
    } else if (item.status === 'error') {
      errored++;
    }
  }

  if (saved === 0) {
    // Nothing downloadable — but still mention errors so the user knows why.
    // Messaging shifts slightly when we were running against a selection so
    // the user doesn't think the whole queue had no output.
    const subject = idsFilter ? t('toast.subjectSelected') : t('toast.subjectProcessed');
    if (errored > 0) {
      showToast(t('toast.noToDownloadErr', { subject, errored }), 'warning', 6000);
    } else {
      showToast(t('toast.noToDownload', { subject }), 'warning');
    }
    return;
  }

  trackExport({ format: settings.format, count: saved, isZip: false });

  // Build the summary toast. When any item errored, report both counts so the
  // user can tell at a glance whether the batch was partial. The "of M" form
  // only appears when there's a mixed outcome.
  const total = saved + errored;
  let message;
  let type;
  if (errored > 0) {
    message = t('toast.savedOfTotal', { saved, total, errored });
    type = 'warning';
  } else {
    message = t('toast.exported', { count: saved });
    type = 'success';
  }
  showToast(message, type, errored > 0 ? 6000 : 3500);
  announce(message);
  flashExportConfirm();

  setTimeout(() => {
    for (const id of idsToRemove) {
      imageQueue.delete(id);
      removePreviewCard(id);
    }
    // Prune exported ids from the selection in a single batch so the bulk
    // toolbar's count stays in sync after the animation delay.
    removeIdsFromSelection(idsToRemove);
    updateBatchControls();
    if (imageQueue.size === 0) {
      dropZoneEl.classList.remove('has-images');
    }
  }, 1200);
}

/**
 * Export processed images as a single ZIP file.
 *
 * @param {Set<string>} [idsFilter] - When provided, only items whose id is
 *   in this set are considered. Used by the Phase 3b bulk "ZIP selected"
 *   path; when omitted, the full queue is zipped (legacy "Download ZIP"
 *   button).
 */
async function handleExportZip(idsFilter) {
  const items = idsFilter
    ? Array.from(idsFilter)
        .map((id) => imageQueue.get(id))
        .filter(Boolean)
    : Array.from(imageQueue.values());
  const successItems = items.filter((i) => i.result);

  if (successItems.length === 0) {
    const subject = idsFilter ? t('toast.subjectSelected') : t('toast.subjectProcessed');
    showToast(t('toast.noToExport', { subject }), 'warning');
    return;
  }

  const settings = getProcessSettings();
  const pattern = getPattern();

  showToast(t('toast.zipping', { count: successItems.length }), 'info', 3000);
  announce(t('announce.creatingZip'));

  // Drive the global progress bar with JSZip's onUpdate. Start at 0% so the
  // bar appears immediately rather than waiting for the first update tick.
  showProgressPercent(0, t('progress.zipping', { pct: 0 }));

  try {
    await exportAsZip(successItems, pattern, settings.format, (pct) => {
      showProgressPercent(pct, t('progress.zipping', { pct: Math.round(pct) }));
    });
    hideProgress();

    // Mark all as exported and add to history
    const idsToRemove = [];
    for (const item of successItems) {
      markPreviewCardExported(item.id);
      const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
        width: item.result.outputWidth,
        height: item.result.outputHeight,
        preset: settings.presetId,
      });
      addToHistory(item, filename, settings);
      idsToRemove.push(item.id);
    }

    trackExport({ format: settings.format, count: successItems.length, isZip: true });

    showToast(t('toast.zipExported', { count: successItems.length }), 'success');
    announce(t('announce.zipDownloaded', { count: successItems.length }));
    flashExportConfirm();

    setTimeout(() => {
      for (const id of idsToRemove) {
        imageQueue.delete(id);
        removePreviewCard(id);
      }
      // Keep the bulk-toolbar count in sync after the animation delay.
      removeIdsFromSelection(idsToRemove);
      updateBatchControls();
      if (imageQueue.size === 0) {
        dropZoneEl.classList.remove('has-images');
      }
    }, 1200);
  } catch (err) {
    hideProgress();
    showToast(t('toast.zipFailed', { message: err.message }), 'error');
    console.error('PixelGnome: ZIP export failed:', err);
  }
}

/**
 * Combine all processed images into a single PDF (one image per page, in queue
 * order). Mirrors handleExportZip's lifecycle: build → download → mark exported
 * → history → remove from queue.
 * @param {Set<string>} [idsFilter]
 */
async function handleExportPdf(idsFilter) {
  const items = idsFilter
    ? Array.from(idsFilter)
        .map((id) => imageQueue.get(id))
        .filter(Boolean)
    : Array.from(imageQueue.values());
  const successItems = items.filter((i) => i.result);

  if (successItems.length === 0) {
    const subject = idsFilter ? t('toast.subjectSelected') : t('toast.subjectProcessed');
    showToast(t('toast.noToExport', { subject }), 'warning');
    return;
  }

  const settings = getProcessSettings();
  const pattern = getPattern();

  showToast(t('toast.pdfBuilding', { count: successItems.length }), 'info', 3000);
  announce(t('announce.creatingPdf'));

  try {
    const blob = await imagesToPdfBlob(successItems.map((i) => i.result.blob));

    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `pixelgnome-${timestamp}.pdf`);

    const idsToRemove = [];
    for (const item of successItems) {
      markPreviewCardExported(item.id);
      const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
        width: item.result.outputWidth,
        height: item.result.outputHeight,
        preset: settings.presetId,
      });
      addToHistory(item, filename, settings);
      idsToRemove.push(item.id);
    }

    trackExport({ format: 'pdf', count: successItems.length, isZip: true });

    showToast(t('toast.pdfExported', { count: successItems.length }), 'success');
    announce(t('announce.pdfDownloaded', { count: successItems.length }));
    flashExportConfirm();

    setTimeout(() => {
      for (const id of idsToRemove) {
        imageQueue.delete(id);
        removePreviewCard(id);
      }
      removeIdsFromSelection(idsToRemove);
      updateBatchControls();
      if (imageQueue.size === 0) {
        dropZoneEl.classList.remove('has-images');
      }
    }, 1200);
  } catch (err) {
    hideProgress();
    showToast(t('toast.pdfFailed', { message: err.message }), 'error');
    console.error('PixelGnome: PDF export failed:', err);
  }
}

/**
 * Export all images at multiple sizes as a responsive ZIP
 */
async function handleExportResponsive() {
  const items = Array.from(imageQueue.values()).filter((i) => i.file);

  if (items.length === 0) {
    showToast(t('toast.noImagesExport'), 'warning');
    return;
  }

  const responsive = getResponsiveSettings();
  if (!responsive.enabled || responsive.breakpoints.length === 0) {
    showToast(t('toast.noBreakpoints'), 'warning');
    return;
  }

  const settings = getProcessSettings();
  const pattern = getPattern();
  const totalVariants = items.length * responsive.breakpoints.length;

  showToast(
    t('toast.generatingVariants', {
      variants: totalVariants,
      sizes: responsive.breakpoints.length,
    }),
    'info',
    5000
  );
  announce(t('announce.creatingResponsive'));
  showProgress(0, totalVariants);

  try {
    const exportItems = items.map((item) => ({
      file: item.file,
      edits: item.edits,
      id: item.id,
    }));

    await exportMultiSizeZip(
      exportItems,
      settings,
      pattern,
      responsive.breakpoints,
      (completed, total) => showProgress(completed, total)
    );

    hideProgress();
    trackExport({ format: settings.format, count: items.length, isZip: true });
    showToast(
      t('toast.responsiveExported', {
        count: items.length,
        sizes: responsive.breakpoints.length,
      }),
      'success'
    );
    announce(t('announce.responsiveDownloaded', { count: totalVariants }));
  } catch (err) {
    hideProgress();
    showToast(t('toast.responsiveFailed', { message: err.message }), 'error');
    console.error('PixelGnome: Responsive export failed:', err);
  }
}

/**
 * Clear all images from the queue
 */
function handleClearAll() {
  // Revoke blob URLs from preview card thumbnails before clearing DOM
  revokePreviewBlobUrls();
  // Release all tracked blob URLs and canvases
  releaseAll();

  // Stop any in-flight pseudo-progress timers so they don't fire into a
  // detached card. stopPseudoProgress is safe to call for unknown ids.
  for (const id of Array.from(pseudoProgressTimers.keys())) {
    stopPseudoProgress(id);
  }

  imageQueue.clear();
  pdfQueue.clear();
  clearPreviews();
  hideProgress();
  updateBatchControls();
  // Clear any lingering selection/anchor — the ids no longer point at anything.
  clearSelection();
  dropZoneEl.classList.remove('has-images');
  announce(t('announce.allCleared'));
}

// --- Edit handlers ---

/**
 * Reprocess a single item after an edit change.
 * Resets the card to processing state, runs processImage, updates the card.
 */
async function reprocessSingleItem(id) {
  const item = imageQueue.get(id);
  if (!item) return;

  // Reset card to processing state
  item.status = 'processing';
  item.result = null;
  resetCardToProcessing(id);

  const settings = getProcessSettings();

  // Fire pseudo-progress if the reprocess touches a known-slow path (HEIC
  // decode or animated-GIF re-encode). Mirrors the batch path in handleNewFiles.
  const hint = slowOpHint(item.file, item.isAnimatedGif);
  if (hint.show) startPseudoProgress(id, hint.label, hint.expectedMs);

  try {
    const result = await processImage(item.file, settings, item.edits);
    result.originalSize = item.file.size;
    item.result = result;
    item.status = 'done';
    stopPseudoProgress(id);
    updatePreviewCardResult(id, result, true); // true = swap thumb to show edits
    setCardEditedState(id, hasEdits(item.edits));
  } catch (err) {
    item.status = 'error';
    item.errorMessage = err.message || 'Processing failed';
    item.result = null;
    stopPseudoProgress(id);
    updatePreviewCardError(id, item.errorMessage);
    showToast(t('toast.editFailed', { name: item.file.name, message: item.errorMessage }), 'error');
  }
}

/**
 * Handle rotate button click
 * @param {string} id
 * @param {string} direction - 'cw' or 'ccw'
 */
function handleRotate(id, direction) {
  const item = imageQueue.get(id);
  if (!item) return;

  item.edits = direction === 'cw' ? rotateCW(item.edits) : rotateCCW(item.edits);
  reprocessSingleItem(id);
}

/**
 * Revert a single image to its original — clears all applied edits (crop,
 * rotation, flip) and reprocesses from the source. Surfaced by the per-card
 * revert button, which only appears when the image has edits. The reset is
 * itself reversible via a "Reverted · Undo" toast that restores the prior edits.
 * @param {string} id
 */
function handleRevert(id) {
  const item = imageQueue.get(id);
  if (!item || !hasEdits(item.edits)) return;

  const prevEdits = item.edits; // snapshot for Undo
  item.edits = createDefaultEdits();
  reprocessSingleItem(id); // regenerates output + hides the revert button via setCardEditedState

  showToast(t('toast.revertedOriginal'), 'info', 6000, {
    action: {
      label: t('toast.undo'),
      onClick: () => {
        const it = imageQueue.get(id);
        if (!it) return;
        it.edits = prevEdits;
        reprocessSingleItem(id);
      },
    },
  });
  announce(t('announce.revertedOriginal'));
}

// --- Bulk edit handlers (Phase 3b) ---
//
// applyBulkEdit walks the current selection, applies the given pure transform
// to each item's edits object, then reprocesses just the selected subset via
// reprocessAll(idsFilter). The existing per-card processing state + pseudo-
// progress bar + global progress bar all fire for free because we're going
// through the same batch-runner path the settings-change flow uses.
//
// We snapshot `selectedIds` into a new Set before iteration so the user
// changing the selection mid-run (e.g. clicking while a bulk rotate is in
// flight) can't corrupt which items get the edit applied.
//
// @param {(edits: import('./modules/editor.js').Edits) => import('./modules/editor.js').Edits} transform
// @param {string} description - Human-readable verb used in the announcement
async function applyBulkEdit(transform, description) {
  if (selectedIds.size === 0) {
    showToast(t('toast.noneSelected'), 'warning', 2000);
    return;
  }
  if (isBatchProcessing()) {
    showToast(t('toast.stillProcessing'), 'warning', 2000);
    return;
  }

  const ids = new Set(selectedIds);
  let touched = 0;
  for (const id of ids) {
    const item = imageQueue.get(id);
    if (!item) continue;
    item.edits = transform(item.edits);
    touched++;
  }
  if (touched === 0) return;

  announce(t('announce.transformApplied', { description, count: touched }));
  await reprocessAll(ids);
}

function handleBulkRotate(direction) {
  const transform = direction === 'cw' ? rotateCW : rotateCCW;
  const verb = direction === 'cw' ? t('announce.verbRotateRight') : t('announce.verbRotateLeft');
  applyBulkEdit(transform, verb);
}

function handleBulkFlip(axis) {
  const transform = axis === 'h' ? toggleFlipH : toggleFlipV;
  const verb = axis === 'h' ? t('announce.verbFlipH') : t('announce.verbFlipV');
  applyBulkEdit(transform, verb);
}

/**
 * Delete every currently-selected card. Triggered by the toolbar "Delete
 * Selected" button and by the Delete / Backspace key when a selection exists.
 *
 * Snapshots the selection into a local array first so that each `handleRemove`
 * call (which mutates `selectedIds` via `removeFromSelection`) can't corrupt
 * the iteration.
 */
function handleBulkDelete() {
  if (selectedIds.size === 0) return;
  // Split the selection by kind: images route through removeImagesWithUndo (so
  // the Undo affordance restores them), PDFs through removePdfCard. PDFs don't
  // get an Undo here — image undo is the established affordance and PDFs carry
  // no reprocess state, so a single combined "Removed N" toast is enough.
  const selected = selectedInDomOrder();
  const imageIds = selected.filter((e) => e.kind === 'image').map((e) => e.id);
  const pdfIds = selected.filter((e) => e.kind === 'pdf').map((e) => e.id);
  // removeImagesWithUndo snapshots first, so capturing the ids up front (before
  // handleRemove mutates selectedIds) keeps the set intact for the Undo.
  if (imageIds.length > 0) removeImagesWithUndo(imageIds);
  for (const id of pdfIds) removePdfCard(id);
}

/**
 * Download-selected: each selected file in place. Images go through the existing
 * `handleExportAll` path (filename builder + history + animated cleanup, all
 * unchanged), PDFs are downloaded directly by their original `file`. An
 * all-image selection delegates entirely to `handleExportAll` so its behavior is
 * byte-for-byte unchanged from before C4.
 */
function handleBulkDownload() {
  if (selectedIds.size === 0) {
    showToast(t('toast.noneSelected'), 'warning', 2000);
    return;
  }
  const selected = selectedInDomOrder();
  const pdfs = selected.filter((e) => e.kind === 'pdf');
  const imageIds = selected.filter((e) => e.kind === 'image').map((e) => e.id);

  // All images → unchanged legacy path.
  if (pdfs.length === 0) {
    handleExportAll(new Set(imageIds));
    return;
  }

  // Mixed: download PDFs in place (their cards stay — PDFs carry no export
  // lifecycle), then let handleExportAll handle the image subset (toast +
  // history + card cleanup). When there are no images, surface a count toast.
  for (const { item } of pdfs) downloadBlob(item.file, item.file.name);
  if (imageIds.length > 0) {
    handleExportAll(new Set(imageIds));
  } else {
    trackExport({ format: 'pdf', count: pdfs.length, isZip: false });
    showToast(t('toast.exportedFiles', { count: pdfs.length }), 'success', 3500);
    announce(t('toast.exportedFiles', { count: pdfs.length }));
  }
}

/**
 * ZIP-selected: bundle the whole selection into one archive. Images ride the
 * existing `handleExportZip` path; PDFs are appended via `exportAsZip`'s new
 * `extraFiles` param (so everything lands in a single ZIP). An all-image
 * selection delegates entirely to `handleExportZip` — unchanged behavior.
 * @returns {Promise<void>}
 */
function handleBulkExportZip() {
  if (selectedIds.size === 0) {
    showToast(t('toast.noneSelected'), 'warning', 2000);
    return Promise.resolve();
  }
  const selected = selectedInDomOrder();
  const pdfs = selected.filter((e) => e.kind === 'pdf');
  const imageIds = selected.filter((e) => e.kind === 'image').map((e) => e.id);

  if (pdfs.length === 0) {
    return handleExportZip(new Set(imageIds));
  }
  return handleMixedExportZip(
    imageIds.map((id) => imageQueue.get(id)).filter(Boolean),
    pdfs.map((e) => ({ name: e.item.file.name, blob: e.item.file }))
  );
}

/**
 * Mixed ZIP: zip image BatchItems + pre-named PDF files into one archive via
 * `exportAsZip`'s `extraFiles`. Mirrors `handleExportZip`'s lifecycle (progress
 * bar, exported marks, history, post-download cleanup) for the image subset; the
 * PDF cards stay in place (PDFs carry no export lifecycle).
 * @param {import('./modules/batch-manager.js').BatchItem[]} imageItems
 * @param {{ name: string, blob: Blob }[]} extraFiles
 */
async function handleMixedExportZip(imageItems, extraFiles) {
  const successItems = imageItems.filter((i) => i.result);
  if (successItems.length === 0 && extraFiles.length === 0) {
    showToast(t('toast.noToExport', { subject: t('toast.subjectSelected') }), 'warning');
    return;
  }

  const settings = getProcessSettings();
  const pattern = getPattern();
  const total = successItems.length + extraFiles.length;

  showToast(t('toast.zipping', { count: total }), 'info', 3000);
  announce(t('announce.creatingZip'));
  showProgressPercent(0, t('progress.zipping', { pct: 0 }));

  try {
    await exportAsZip(
      successItems,
      pattern,
      settings.format,
      (pct) => showProgressPercent(pct, t('progress.zipping', { pct: Math.round(pct) })),
      extraFiles
    );
    hideProgress();

    const idsToRemove = [];
    for (const item of successItems) {
      markPreviewCardExported(item.id);
      const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
        width: item.result.outputWidth,
        height: item.result.outputHeight,
        preset: settings.presetId,
      });
      addToHistory(item, filename, settings);
      idsToRemove.push(item.id);
    }

    trackExport({ format: settings.format, count: total, isZip: true });

    showToast(t('toast.zipExported', { count: total }), 'success');
    announce(t('announce.zipDownloaded', { count: total }));
    flashExportConfirm();

    setTimeout(() => {
      for (const id of idsToRemove) {
        imageQueue.delete(id);
        removePreviewCard(id);
      }
      removeIdsFromSelection(idsToRemove);
      updateBatchControls();
      if (imageQueue.size === 0 && pdfQueue.size === 0) {
        dropZoneEl.classList.remove('has-images');
      }
    }, 1200);
  } catch (err) {
    hideProgress();
    showToast(t('toast.zipFailed', { message: err.message }), 'error');
    console.error('PixelGnome: ZIP export failed:', err);
  }
}

/**
 * Combine-selected to one PDF (C4): build ordered entries in DOM order (images →
 * pages, PDFs' pages inserted in place), call `combineMixedToPdf`, download the
 * result, and mirror handleExportPdf's lifecycle (toast / history / cleanup).
 * An all-image selection produces the same one-image-per-page PDF as before.
 * @returns {Promise<void>}
 */
async function handleBulkCombinePdf() {
  if (selectedIds.size === 0) {
    showToast(t('toast.noneSelected'), 'warning', 2000);
    return;
  }
  if (!isPdfSupported()) {
    showToast(t('pdf.errorUnsupported'), 'error', 6000);
    return;
  }

  // Build entries in DOM order. Images contribute only when they have a result;
  // PDFs always contribute their current file.
  const selected = selectedInDomOrder();
  const entries = [];
  const imageItemsExported = [];
  for (const e of selected) {
    if (e.kind === 'pdf') {
      entries.push({ type: 'pdf', blob: e.item.file });
    } else if (e.item.result) {
      entries.push({ type: 'image', blob: e.item.result.blob });
      imageItemsExported.push(e.item);
    }
  }

  if (entries.length === 0) {
    showToast(t('toast.noToExport', { subject: t('toast.subjectSelected') }), 'warning');
    return;
  }

  const settings = getProcessSettings();
  const pattern = getPattern();

  showToast(t('bulk.combineBuilding', { count: entries.length }), 'info', 3000);
  announce(t('announce.creatingPdf'));

  try {
    const blob = await combineMixedToPdf(entries);

    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `pixelgnome-${timestamp}.pdf`);

    // History is image-export-centric — record the image pages only (PDFs get
    // no history entry, per the C4 decisions).
    const idsToRemove = [];
    for (const item of imageItemsExported) {
      markPreviewCardExported(item.id);
      const filename = buildOutputFilename(item.file.name, pattern, settings.format, {
        width: item.result.outputWidth,
        height: item.result.outputHeight,
        preset: settings.presetId,
      });
      addToHistory(item, filename, settings);
      idsToRemove.push(item.id);
    }

    trackPdfMerged({ count: entries.length });

    showToast(t('bulk.combineDone', { count: entries.length }), 'success');
    announce(t('bulk.combineDone', { count: entries.length }));
    flashExportConfirm();

    // Mirror handleExportPdf: exported image cards are removed after the
    // checkmark animation. PDF cards stay (they were merged, not consumed —
    // and PDFs carry no export lifecycle), only dropped from the selection.
    setTimeout(() => {
      for (const id of idsToRemove) {
        imageQueue.delete(id);
        removePreviewCard(id);
      }
      removeIdsFromSelection(idsToRemove);
      removeIdsFromSelection(selected.filter((e) => e.kind === 'pdf').map((e) => e.id));
      updateBatchControls();
      if (imageQueue.size === 0 && pdfQueue.size === 0) {
        dropZoneEl.classList.remove('has-images');
      }
    }, 1200);
  } catch (err) {
    hideProgress();
    showToast(t('bulk.combineFailed', { message: err.message }), 'error');
    console.error('PixelGnome: Combine to PDF failed:', err);
  }
}

/**
 * Bulk "Optimize PDFs" (D6) — compress every selected PDF in place, one at a
 * time, using the engine's default structural-optimize settings. Cards are
 * updated to their smaller file (only when the engine actually beat the
 * original); a summary toast reports how many shrank and the total savings.
 * @returns {Promise<void>}
 */
async function handleBulkOptimizePdf() {
  if (!isPdfSupported()) {
    showToast(t('pdf.errorUnsupported'), 'error', 6000);
    return;
  }
  const pdfs = selectedInDomOrder().filter((e) => e.kind === 'pdf');
  if (pdfs.length === 0) {
    showToast(t('toast.noneSelected'), 'warning', 2000);
    return;
  }
  await optimizePdfItems(pdfs);
}

// Guards against overlapping PDF-optimize runs (bulk toolbar + Compress recipe
// both drive optimizePdfItems).
let pdfOptimizeBusy = false;

/**
 * Optimize a set of PDF cards in place, sequentially: swap each card's file when
 * the engine actually beats it, refresh its meta + savings line (H4), and report
 * a summary. Shared by the bulk "Optimize PDFs" button and the PDF-aware recipes
 * (H2). `options` is forwarded to optimizePdfBlob (e.g. a lower imageQuality for
 * the Email-safe recipe).
 * @param {{ id: string, item: { id: string, file: File, pdfMeta: object|null } }[]} items
 * @param {object} [options]
 */
async function optimizePdfItems(items, options = {}) {
  if (pdfOptimizeBusy || items.length === 0) return;
  pdfOptimizeBusy = true;

  let before = 0;
  let after = 0;
  let optimized = 0;
  let failed = 0;
  announce(t('bulk.optimizeStart', { count: items.length }));

  try {
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      showToast(t('bulk.optimizingN', { done: i + 1, total: items.length }), 'info', 2500);
      try {
        const r = await optimizePdfBlob(e.item.file, options);
        before += r.before;
        after += r.after;
        // Only swap the card's file when the engine actually produced a smaller one.
        if (r.after < r.before) {
          const newFile = new File([r.blob], e.item.file.name, { type: 'application/pdf' });
          e.item.file = newFile;
          try {
            const meta = await getPdfCardMeta(newFile);
            e.item.pdfMeta = meta;
            updatePdfCardMeta(e.id, meta);
          } catch {
            /* file already updated; keep existing card meta if re-read fails */
          }
          // Show the before→after savings on the card, mirroring image cards (H4).
          setPdfCardSavings(e.id, r.before, r.after);
          optimized++;
        }
      } catch (err) {
        failed++;
        console.error('PixelGnome: PDF optimize failed:', err);
      }
    }
  } finally {
    pdfOptimizeBusy = false;
  }

  if (optimized > 0) {
    const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    showToast(t('bulk.optimizeDone', { count: optimized, pct }), 'success', 5000);
    announce(t('bulk.optimizeDone', { count: optimized, pct }));
  } else if (failed > 0) {
    showToast(t('bulk.optimizeFailed'), 'error', 5000);
  } else {
    showToast(t('pdf.noReduction'), 'info', 4000);
  }
}

/**
 * Make the Step-2 recipes act on PDFs too (H2). Recipes set the image pipeline in
 * settings.js; this runs the PDF-side equivalent so a recipe isn't a silent no-op
 * when PDFs are present. Targets the selected PDFs, or all PDFs when none are
 * selected. Images are untouched here (settings.js handles them).
 * @param {'compress'|'email-safe'|'convert'} recipe
 */
function handleRecipeForPdfs(recipe) {
  if (!isPdfSupported() || pdfQueue.size === 0) return;
  const selectedPdfs = selectedInDomOrder().filter((e) => e.kind === 'pdf');
  const targets = selectedPdfs.length
    ? selectedPdfs
    : [...pdfQueue.entries()].map(([id, item]) => ({ id, kind: 'pdf', item }));
  if (targets.length === 0) return;

  if (recipe === 'compress') {
    optimizePdfItems(targets);
  } else if (recipe === 'email-safe') {
    // Match the PDF Email preset (more aggressive image recompression).
    optimizePdfItems(targets, { imageQuality: 0.5 });
  } else if (recipe === 'convert') {
    // Format conversion for a PDF is per-file (PDF → images) and lives in the
    // drill-in, so route the user there rather than acting silently.
    showToast(t('recipe.pdfConvertHint'), 'info', 5000);
  }
}

/**
 * Handle flip button click
 * @param {string} id
 * @param {string} axis - 'h' or 'v'
 */
function handleFlip(id, axis) {
  const item = imageQueue.get(id);
  if (!item) return;

  item.edits = axis === 'h' ? toggleFlipH(item.edits) : toggleFlipV(item.edits);
  reprocessSingleItem(id);
}

/**
 * Handle edit button click — opens full edit modal with rotate/flip/crop.
 * The modal receives the current edits and returns updated edits on Apply.
 * @param {string} id
 */
async function handleCrop(id) {
  const item = imageQueue.get(id);
  if (!item) return;

  // Generate a source URL for the edit modal
  // Use the original file (EXIF-corrected image is the baseline)
  let imageSrc;
  if (isHeicFile(item.file)) {
    showToast(t('toast.loadingEdit'), 'info', 3000);
    try {
      const { decodeHeic } = await import('./modules/heic-decoder.js');
      const decoded = await decodeHeic(item.file);
      imageSrc = trackUrl(URL.createObjectURL(decoded));
    } catch {
      showToast(t('toast.heicEditFailed'), 'error');
      return;
    }
  } else if (isSvgFile(item.file)) {
    // SVGs need pre-rasterization for the edit modal — raw SVGs may lack xmlns
    // or use currentColor, which breaks when loaded as a standalone <img> source
    try {
      const svgImg = await rasterizeSvg(item.file);
      const w = svgImg._svgWidth || svgImg.naturalWidth || svgImg.width || 1024;
      const h = svgImg._svgHeight || svgImg.naturalHeight || svgImg.height || 1024;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(svgImg, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      imageSrc = trackUrl(URL.createObjectURL(blob));
    } catch {
      showToast(t('toast.svgEditFailed'), 'error');
      return;
    }
  } else {
    imageSrc = trackUrl(URL.createObjectURL(item.file));
  }

  try {
    // Pass full edits to the modal — it returns updated edits or undefined.
    // The current sidebar sizing is passed so an exact-mode (center-crop)
    // preset opens the editor with the same crop framing the preview overlay
    // shows, rather than a full-frame crop.
    const updatedEdits = await openEditModal(
      imageSrc,
      item.edits,
      {
        name: item.file.name,
        type: item.file.type,
      },
      getProcessSettings()
    );

    if (updatedEdits === undefined) {
      // Cancelled — no change
      return;
    }

    // If the modal set an export size, apply it to global settings
    if (updatedEdits.exportSize) {
      applyExportSize(updatedEdits.exportSize.width, updatedEdits.exportSize.height);
      showToast(
        t('toast.outputSet', {
          w: updatedEdits.exportSize.width,
          h: updatedEdits.exportSize.height,
        }),
        'success',
        3000
      );
      delete updatedEdits.exportSize; // Don't persist this on the edits object
    }

    item.edits = updatedEdits;
    reprocessSingleItem(id);
  } finally {
    revokeUrl(imageSrc);
  }
}

// --- Helpers ---

/**
 * Add a processed item to history
 */
function addToHistory(item, filename, settings) {
  addHistoryEntry({
    filename: item.file.name,
    outputFilename: filename,
    originalSize: item.file.size,
    outputSize: item.result.outputSize,
    outputWidth: item.result.outputWidth,
    outputHeight: item.result.outputHeight,
    format: settings.format,
    quality: settings.quality,
    mode: settings.mode,
    preset: settings.presetId || 'custom',
  });
}

/**
 * Revoke blob URL from a single preview card's thumbnail.
 * @param {string} id
 */
function revokeCardBlobUrl(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const img = card.querySelector('.preview-card-thumb img');
  if (img && img.src && img.src.startsWith('blob:')) {
    revokeUrl(img.src);
  }
}

/**
 * Revoke blob URLs from all preview card thumbnails.
 */
function revokePreviewBlobUrls() {
  const imgs = document.querySelectorAll('.preview-card-thumb img');
  imgs.forEach((img) => {
    if (img.src && img.src.startsWith('blob:')) {
      revokeUrl(img.src);
    }
  });
}

/**
 * Reset a preview card's "new" column and show processing state.
 * Used by reprocessAll and reprocessSingleItem when re-running the pipeline.
 * @param {string} id
 */
function resetCardToProcessing(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.classList.add('processing');
  card.classList.remove('error', 'exported');

  // Clear "new" column values and hide arrows
  const grid = document.getElementById(`statgrid-${id}`);
  if (grid) grid.classList.remove('has-output');

  const newDim = document.getElementById(`new-dim-${id}`);
  if (newDim) newDim.textContent = '';
  const newRatio = document.getElementById(`new-ratio-${id}`);
  if (newRatio) newRatio.textContent = '';
  const newSize = document.getElementById(`new-size-${id}`);
  if (newSize) newSize.textContent = '';

  const arrowDim = document.getElementById(`arrow-dim-${id}`);
  if (arrowDim) arrowDim.textContent = '';
  const arrowRatio = document.getElementById(`arrow-ratio-${id}`);
  if (arrowRatio) arrowRatio.textContent = '';
  const arrowSize = document.getElementById(`arrow-size-${id}`);
  if (arrowSize) arrowSize.textContent = '';

  // Show processing indicator, hide savings
  const processingEl = document.getElementById(`processing-${id}`);
  if (processingEl) processingEl.hidden = false;
  const savingsEl = document.getElementById(`savings-${id}`);
  if (savingsEl) {
    savingsEl.hidden = true;
    savingsEl.className = 'stat-savings-row';
  }

  // Disable action buttons
  const dlBtn = card.querySelector('[data-action="download"]');
  if (dlBtn) dlBtn.disabled = true;
  const copyBtn = card.querySelector('[data-action="copy"]');
  if (copyBtn) copyBtn.disabled = true;
}
