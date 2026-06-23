/**
 * crop-modal.js
 * Full-screen edit modal for interactive cropping, rotation, and flipping.
 *
 * Shows the image with current rotation/flip applied and a draggable crop
 * region overlay. Rotate/flip buttons update the view in real-time.
 *
 * Pipeline change (Phase 5+): crop coordinates are now relative to the
 * rotated/flipped image (what-you-see-is-what-you-get). The pipeline
 * order is: rotate → flip → crop → resize.
 *
 * Phase 7: Source properties in header bar, grid toggle + color picker.
 *
 * Returns the full edits object on Apply, or undefined on Cancel.
 */

import { createDefaultEdits } from './editor.js';
import { createColorController } from './crop-colors.js';
import { createHistoryController } from './crop-history.js';
import { createFocusTrap } from './shared/focus-trap.js';
import { t } from './i18n.js';
import {
  buildTransformedCanvas as engineBuildTransformedCanvas,
  computeLayout,
  getPointerAction as engineGetPointerAction,
  getEffectiveAR as engineGetEffectiveAR,
  applyLockedAspect,
  resolveDrag,
  cursorForAction,
  drawOverlay,
} from './crop-engine.js';

let modalEl = null;
let focusTrap = null; // keeps Tab within the modal; restores focus on close (H6)
let overlayCanvas = null;
let overlayCtx = null;
let sourceImg = null;
let transformedCanvas = null; // Pre-rendered rotated+flipped image
let imgRect = { x: 0, y: 0, w: 0, h: 0 }; // Image position within overlay canvas
let localEdits = null; // Working copy of edits
let crop = { x: 0, y: 0, w: 1, h: 1 }; // Fractional crop (relative to transformed image)
let dragState = null;
let resolveCallback = null;
let shiftHeld = false; // Shift key for aspect-ratio lock
let lockedAspectRatio = null; // null = free crop, number = enforced W/H ratio
let exportSize = null; // null = no export override, { width, height } = target output
let pendingSizingLock = null; // AR (w/h) to lock once the canvas builds — carries the sidebar's exact-mode framing into the editor

// Phase 10: Undo/redo ring lives in crop-history.js.
let historyController = null;

// Phase 8.5: Eyedropper + palette logic lives in crop-colors.js.
let colorController = null;

/** Common aspect ratio presets: label → [w, h] */
const ASPECT_PRESETS = [
  { label: 'Free', w: 0, h: 0 },
  { label: '1:1', w: 1, h: 1 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '16:9', w: 16, h: 9 },
  { label: '21:9', w: 21, h: 9 },
  { label: '5:4', w: 5, h: 4 },
  { label: '3:4', w: 3, h: 4 },
  { label: '2:3', w: 2, h: 3 },
  { label: '9:16', w: 9, h: 16 },
];

/** Quick-crop pixel size presets: curated for email / digital receipt workflows */
const SIZE_PRESETS = [
  // Squares — icons & item images
  { label: '50\u00d750', w: 50, h: 50 },
  { label: '80\u00d780', w: 80, h: 80 },
  { label: '100\u00d7100', w: 100, h: 100 },
  { label: '150\u00d7150', w: 150, h: 150 },
  { label: '200\u00d7200', w: 200, h: 200 },
  // Rectangles — email block sizes
  { label: '200\u00d760', w: 200, h: 60 }, // Merchant Logo
  { label: '200\u00d7150', w: 200, h: 150 }, // Loyalty Store
  { label: '300\u00d7100', w: 300, h: 100 }, // Hero Split
  { label: '520\u00d7173', w: 520, h: 173 }, // Coupon
  { label: '520\u00d7260', w: 520, h: 260 }, // Coupon Tall
  { label: '600\u00d7200', w: 600, h: 200 }, // Hero
  { label: '1200\u00d7630', w: 1200, h: 630 }, // OG / Link Preview
];

/** @type {{ name: string, type: string }} */
let sourceFileInfo = { name: '', type: '' };

// Grid state
let gridEnabled = true;
let gridColor = 'cyan'; // default to high-visibility cyan

/**
 * Open the edit modal for a given image.
 * @param {string} imageSrc - Object URL or data URL of the EXIF-corrected image
 * @param {import('./editor.js').ImageEdits} existingEdits - Current edits state
 * @param {{ name?: string, type?: string }} [fileInfo] - Optional file metadata
 * @returns {Promise<import('./editor.js').ImageEdits | undefined>}
 *   Resolves with updated edits, or undefined if cancelled
 */
export function openEditModal(imageSrc, existingEdits, fileInfo, sizing) {
  return new Promise((resolve) => {
    resolveCallback = resolve;
    localEdits = { ...existingEdits };
    crop = existingEdits.crop ? { ...existingEdits.crop } : { x: 0, y: 0, w: 1, h: 1 };
    sourceFileInfo = fileInfo || { name: '', type: '' };
    exportSize = null;

    // Carry the sidebar's sizing into the editor: when an exact-mode preset is
    // active (which center-crops) and the user hasn't already made a manual
    // crop, open with that aspect ratio locked and the crop centered/maximized
    // so the editor mirrors the crop overlay shown on the preview thumbnail.
    // Consumed once the transformed canvas exists (see loadSourceImage).
    pendingSizingLock = null;
    lockedAspectRatio = null;
    if (
      sizing &&
      sizing.mode === 'exact' &&
      sizing.width > 0 &&
      !existingEdits.crop &&
      !existingEdits.rotation
    ) {
      const h = sizing.height > 0 ? sizing.height : sizing.width;
      pendingSizingLock = sizing.width / h;
    }

    createModalDOM();
    // Phase 10: History controller is created inside createModalDOM once the
    // modal element exists (see the wiring block there). Record the initial
    // state immediately so the user can undo back to the starting point.
    if (historyController) historyController.reset();
    loadSourceImage(imageSrc);
  });
}

// Keep legacy export name for backward compatibility
export { openEditModal as openCropModal };

function createModalDOM() {
  if (modalEl) modalEl.remove();

  // Derive file extension for badge
  const fileExt = sourceFileInfo.name ? sourceFileInfo.name.split('.').pop().toUpperCase() : '';

  modalEl = document.createElement('div');
  modalEl.className = 'crop-modal';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-label', 'Edit image');
  modalEl.setAttribute('aria-modal', 'true');

  // Truncate filename for header display
  const displayName = sourceFileInfo.name
    ? sourceFileInfo.name.length > 40
      ? sourceFileInfo.name.slice(0, 37) + '...'
      : sourceFileInfo.name
    : '';

  modalEl.innerHTML = `
    <div class="crop-modal-header">
      <div class="crop-modal-title-group">
        <span class="crop-modal-title">${t('editor.title')}</span>
        ${displayName ? `<span class="crop-modal-filename" title="${sourceFileInfo.name}">${displayName}</span>` : ''}
        <div class="crop-modal-source-props">
          ${fileExt ? `<span class="prop-badge" id="editInfoType">${fileExt}</span>` : '<span class="prop-badge" id="editInfoType">—</span>'}
          <span class="prop-dim" id="editInfoSource">—</span>
          <span class="prop-aspect" id="editInfoAspect"></span>
        </div>
      </div>
      <div class="crop-modal-tools" role="toolbar" aria-label="${t('editor.toolsAria')}">
        <button class="btn btn-icon" data-action="rotate-ccw" data-tooltip="${t('editor.rotateLeftTip')}" title="${t('editor.rotateLeft')}" aria-label="${t('editor.rotateLeft')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button class="btn btn-icon" data-action="rotate-cw" data-tooltip="${t('editor.rotateRightTip')}" title="${t('editor.rotateRight')}" aria-label="${t('editor.rotateRight')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="btn btn-icon" data-action="flip-h" data-tooltip="${t('editor.flipHTip')}" title="${t('editor.flipH')}" aria-label="${t('editor.flipH')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
        </button>
        <button class="btn btn-icon" data-action="flip-v" data-tooltip="${t('editor.flipVTip')}" title="${t('editor.flipV')}" aria-label="${t('editor.flipV')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 7 12 3 16 7"/><polyline points="16 17 12 21 8 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="btn btn-icon" data-action="undo" data-tooltip="${t('editor.undoTip')}" title="${t('editor.undoTitle')}" aria-label="${t('editor.undoAria')}" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button class="btn btn-icon" data-action="redo" data-tooltip="${t('editor.redoTip')}" title="${t('editor.redoTitle')}" aria-label="${t('editor.redoAria')}" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="btn btn-icon" data-action="eyedropper" data-tooltip="${t('editor.eyedropperTip')}" title="${t('editor.eyedropperTitle')}" aria-label="${t('editor.eyedropperAria')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22l1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="M14.5 5.5l4-4a1.41 1.41 0 0 1 2 2l-4 4"/><path d="M12 8l4 4"/></svg>
        </button>
        <button class="btn btn-icon" data-action="extract-palette" data-tooltip="${t('editor.extractTip')}" title="${t('editor.extractTitle')}" aria-label="${t('editor.extractAria')}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12a10 10 0 0 0 5.012 8.662"/><path d="M6 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/></svg>
        </button>
      </div>
      <div class="crop-modal-actions">
        <button class="btn btn-secondary" data-action="reset" type="button">${t('editor.resetAll')}</button>
        <button class="btn btn-secondary" data-action="cancel" type="button">${t('editor.cancel')}</button>
        <button class="btn btn-primary" data-action="apply" type="button">${t('editor.apply')}</button>
      </div>
    </div>
    <div class="aspect-toolbar" id="aspectToolbar" hidden>
      <span class="aspect-toolbar-label">${t('editor.aspectRatio')}</span>
      <div class="aspect-toolbar-presets" id="aspectPresets">
        ${ASPECT_PRESETS.map((p, i) => `<button class="aspect-pill${i === 0 ? ' active' : ''}" data-ratio-w="${p.w}" data-ratio-h="${p.h}" type="button">${p.label === 'Free' ? t('editor.free') : p.label}</button>`).join('')}
      </div>
      <div class="aspect-toolbar-custom">
        <span class="aspect-input-label">W</span>
        <input type="number" class="aspect-custom-input" id="aspectCustomW" min="1" max="99999" aria-label="${t('editor.customRatioW')}" />
        <span class="aspect-toolbar-sep">:</span>
        <span class="aspect-input-label">H</span>
        <input type="number" class="aspect-custom-input" id="aspectCustomH" min="1" max="99999" aria-label="${t('editor.customRatioH')}" />
        <button class="aspect-pill aspect-pill-apply" id="aspectCustomApply" type="button" data-tooltip="${t('editor.setRatioTip')}">${t('editor.set')}</button>
      </div>
    </div>
    <div class="aspect-toolbar size-toolbar" id="sizeToolbar" hidden>
      <span class="aspect-toolbar-label">${t('editor.quickCrop')}</span>
      <div class="aspect-toolbar-presets" id="sizePresets">
        ${SIZE_PRESETS.map((p) => `<button class="aspect-pill size-pill" data-size-w="${p.w}" data-size-h="${p.h}" type="button">${p.label}</button>`).join('')}
      </div>
      <div class="aspect-toolbar-custom">
        <span class="aspect-input-label">W</span>
        <input type="number" class="aspect-custom-input" id="sizeCustomW" min="1" max="99999" aria-label="${t('editor.customCropW')}" />
        <span class="aspect-toolbar-sep">\u00d7</span>
        <span class="aspect-input-label">H</span>
        <input type="number" class="aspect-custom-input" id="sizeCustomH" min="1" max="99999" aria-label="${t('editor.customCropH')}" />
        <button class="aspect-pill aspect-pill-apply" id="sizeCustomApply" type="button" data-tooltip="${t('editor.cropExactTip')}">${t('editor.crop')}</button>
      </div>
    </div>
    <div class="aspect-toolbar export-toolbar" id="exportToolbar" hidden>
      <span class="aspect-toolbar-label">${t('editor.exportSizeLabel')}</span>
      <div class="aspect-toolbar-presets" id="exportPresets">
        ${SIZE_PRESETS.map((p) => `<button class="aspect-pill export-pill" data-export-w="${p.w}" data-export-h="${p.h}" type="button">${p.label}</button>`).join('')}
      </div>
      <div class="aspect-toolbar-custom">
        <span class="aspect-input-label">W</span>
        <input type="number" class="aspect-custom-input" id="exportCustomW" min="1" max="99999" aria-label="${t('editor.exportW')}" />
        <span class="aspect-toolbar-sep">\u00d7</span>
        <span class="aspect-input-label">H</span>
        <input type="number" class="aspect-custom-input" id="exportCustomH" min="1" max="99999" aria-label="${t('editor.exportH')}" />
        <button class="aspect-pill aspect-pill-apply" id="exportCustomApply" type="button" data-tooltip="${t('editor.setExportTip')}">${t('editor.set')}</button>
      </div>
      <button class="aspect-pill export-clear-pill" id="exportClear" type="button" style="display:none">${t('editor.clear')}</button>
    </div>
    <div class="crop-modal-body">
      <canvas class="crop-canvas" id="cropCanvas"></canvas>
    </div>
    <div class="color-panel" id="colorPanel" hidden>
      <div class="color-panel-header">
        <span class="color-panel-title">${t('editor.colorsTitle')}</span>
        <button class="btn btn-icon btn-xs" data-action="close-color-panel" title="${t('editor.closeColorTitle')}" aria-label="${t('editor.closeColorAria')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="color-panel-current" id="colorCurrentSection" hidden>
        <div class="color-swatch-large" id="colorSwatchLarge"></div>
        <div class="color-values" id="colorValues">
          <button class="color-value-row" data-copy-format="hex" title="${t('editor.clickToCopy')}"><span class="color-value-label">HEX</span><span class="color-value-text" id="colorHex">—</span></button>
          <button class="color-value-row" data-copy-format="rgb" title="${t('editor.clickToCopy')}"><span class="color-value-label">RGB</span><span class="color-value-text" id="colorRgb">—</span></button>
          <button class="color-value-row" data-copy-format="hsl" title="${t('editor.clickToCopy')}"><span class="color-value-label">HSL</span><span class="color-value-text" id="colorHsl">—</span></button>
          <button class="color-value-row" data-copy-format="cmyk" title="${t('editor.clickToCopy')}"><span class="color-value-label">CMYK</span><span class="color-value-text" id="colorCmyk">—</span></button>
        </div>
      </div>
      <div class="color-panel-history" id="colorHistorySection" hidden>
        <div class="color-history-header">
          <span class="color-history-label">${t('editor.recentPicks')}</span>
          <div class="color-header-actions">
            <button class="btn btn-secondary btn-xs" id="colorCopyAll" type="button" title="${t('editor.copyAllRecentTitle')}">${t('editor.copyAll')}</button>
            <button class="btn btn-secondary btn-xs" id="colorClearHistory" type="button" title="${t('editor.clearRecentTitle')}">${t('editor.clear')}</button>
          </div>
        </div>
        <div class="color-history-strip" id="colorHistoryStrip"></div>
      </div>
      <div class="color-panel-palette" id="colorPaletteSection" hidden>
        <div class="color-palette-header">
          <span class="color-palette-label">${t('editor.extractedPalette')}</span>
          <div class="color-header-actions">
            <button class="btn btn-secondary btn-xs" id="paletteCopyAll" type="button" title="${t('editor.copyPaletteTitle')}">${t('editor.copyAll')}</button>
            <button class="btn btn-secondary btn-xs" id="paletteClear" type="button" title="${t('editor.clearPaletteTitle')}">${t('editor.clear')}</button>
          </div>
        </div>
        <div class="color-palette-strip" id="colorPaletteStrip"></div>
      </div>
    </div>
    <div class="crop-modal-info">
      <span id="editInfoRotation">0\u00b0</span>
      <span id="editInfoFlip">\u2014</span>
      <span id="editInfoCrop">${t('editor.fullImage')}</span>
      <span class="crop-size-live" id="editCropSizeLive"></span>
      <div class="ratio-toolbar-toggle-wrap">
        <button class="ratio-calc-toggle" id="ratioToolbarToggle" type="button" data-tooltip="${t('editor.lockRatioTip')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          ${t('editor.ratio')}
        </button>
      </div>
      <div class="grid-controls">
        <label>
          <input type="checkbox" id="gridToggle" ${gridEnabled ? 'checked' : ''} />
          ${t('editor.grid')}
        </label>
        <span class="grid-color-swatch${gridColor === 'cyan' ? ' active' : ''}" data-color="cyan" title="${t('editor.gridCyan')}"></span>
        <span class="grid-color-swatch${gridColor === 'yellow' ? ' active' : ''}" data-color="yellow" title="${t('editor.gridYellow')}"></span>
        <span class="grid-color-swatch${gridColor === 'magenta' ? ' active' : ''}" data-color="magenta" title="${t('editor.gridMagenta')}"></span>
        <span class="grid-color-swatch${gridColor === 'red' ? ' active' : ''}" data-color="red" title="${t('editor.gridRed')}"></span>
        <span class="grid-color-swatch${gridColor === 'green' ? ' active' : ''}" data-color="green" title="${t('editor.gridGreen')}"></span>
        <span class="grid-color-swatch${gridColor === 'blue' ? ' active' : ''}" data-color="blue" title="${t('editor.gridBlue')}"></span>
        <span class="grid-color-swatch${gridColor === 'white' ? ' active' : ''}" data-color="white" title="${t('editor.gridWhite')}"></span>
        <span class="grid-color-swatch${gridColor === 'black' ? ' active' : ''}" data-color="black" title="${t('editor.gridBlack')}"></span>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  // Lock body scroll to prevent scrollbar behind the modal
  document.body.style.overflow = 'hidden';

  overlayCanvas = modalEl.querySelector('#cropCanvas');
  overlayCtx = overlayCanvas.getContext('2d');

  // Wire buttons
  modalEl.querySelector('[data-action="apply"]').addEventListener('click', handleApply);
  modalEl.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel);
  modalEl.querySelector('[data-action="reset"]').addEventListener('click', handleReset);
  modalEl
    .querySelector('[data-action="rotate-ccw"]')
    .addEventListener('click', () => handleRotate(-90));
  modalEl
    .querySelector('[data-action="rotate-cw"]')
    .addEventListener('click', () => handleRotate(90));
  modalEl.querySelector('[data-action="flip-h"]').addEventListener('click', () => handleFlip('h'));
  modalEl.querySelector('[data-action="flip-v"]').addEventListener('click', () => handleFlip('v'));

  // Phase 10: Undo/Redo controller — wires buttons + owns the ring buffer.
  // reset() is called by the opener after createModalDOM() returns.
  historyController = createHistoryController({
    modalEl,
    snapshot: () => ({
      edits: { ...localEdits },
      crop: { ...crop },
      lockedAR: lockedAspectRatio,
    }),
    restore: (snap) => {
      localEdits = { ...snap.edits };
      crop = { ...snap.crop };
      lockedAspectRatio = snap.lockedAR;
      buildTransformedCanvas();
      sizeCanvas();
      draw();
      updateInfoBar();
      updateActiveButtons();
    },
  });

  // Grid toggle
  modalEl.querySelector('#gridToggle').addEventListener('change', (e) => {
    gridEnabled = e.target.checked;
    draw();
  });

  // Grid color swatches
  modalEl.querySelectorAll('.grid-color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      gridColor = swatch.dataset.color;
      modalEl.querySelectorAll('.grid-color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      draw();
    });
  });

  // --- Phase 8.5: Eyedropper + palette (delegated to crop-colors.js) ---
  colorController = createColorController({
    modalEl,
    overlayCanvas,
    getTransformedCanvas: () => transformedCanvas,
    getImgRect: () => imgRect,
    getCrop: () => crop,
    requestDraw: () => draw(),
  });

  // Aspect ratio toolbar toggle (also toggles size + export toolbars)
  const ratioToolbarToggle = modalEl.querySelector('#ratioToolbarToggle');
  const aspectToolbar = modalEl.querySelector('#aspectToolbar');
  const sizeToolbar = modalEl.querySelector('#sizeToolbar');
  const exportToolbar = modalEl.querySelector('#exportToolbar');
  ratioToolbarToggle.addEventListener('click', () => {
    const isHidden = aspectToolbar.hidden;
    aspectToolbar.hidden = !isHidden;
    sizeToolbar.hidden = !isHidden;
    exportToolbar.hidden = !isHidden;
    ratioToolbarToggle.classList.toggle('active', isHidden);
  });

  // Aspect ratio preset pills (toggle-off on second click, cross-deselect Quick Crop)
  modalEl.querySelectorAll('.aspect-pill[data-ratio-w]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const rw = parseInt(pill.dataset.ratioW, 10);
      const rh = parseInt(pill.dataset.ratioH, 10);
      const wasActive = pill.classList.contains('active');

      // Deselect all aspect pills
      modalEl
        .querySelectorAll('.aspect-pill[data-ratio-w]')
        .forEach((p) => p.classList.remove('active'));
      // Cross-deselect: clear Quick Crop pills and custom inputs
      modalEl
        .querySelectorAll('.size-pill[data-size-w]')
        .forEach((p) => p.classList.remove('active'));
      const scw = modalEl.querySelector('#sizeCustomW');
      const sch = modalEl.querySelector('#sizeCustomH');
      if (scw) scw.value = '';
      if (sch) sch.value = '';

      // Clear aspect custom inputs
      const cw = modalEl.querySelector('#aspectCustomW');
      const ch = modalEl.querySelector('#aspectCustomH');
      if (cw) cw.value = '';
      if (ch) ch.value = '';

      if (wasActive) {
        // Toggle off — revert to Free (activate the Free pill)
        const freePill = modalEl.querySelector('.aspect-pill[data-ratio-w="0"]');
        if (freePill) freePill.classList.add('active');
        lockedAspectRatio = null;
      } else {
        pill.classList.add('active');
        if (rw === 0 || rh === 0) {
          lockedAspectRatio = null;
        } else {
          lockedAspectRatio = rw / rh;
          applyCropConstraint();
        }
      }
      draw();
      updateInfoBar();
    });
  });

  // Custom aspect ratio — shared apply logic
  function applyCustomRatio() {
    const cwVal = parseFloat(modalEl.querySelector('#aspectCustomW').value) || 0;
    const chVal = parseFloat(modalEl.querySelector('#aspectCustomH').value) || 0;
    if (cwVal > 0 && chVal > 0) {
      lockedAspectRatio = cwVal / chVal;
      // Deselect preset pills
      modalEl
        .querySelectorAll('.aspect-pill[data-ratio-w]')
        .forEach((p) => p.classList.remove('active'));
      applyCropConstraint();
      draw();
      updateInfoBar();
    }
  }

  const customApply = modalEl.querySelector('#aspectCustomApply');
  if (customApply) {
    customApply.addEventListener('click', applyCustomRatio);
  }

  // Typing in aspect custom inputs deselects aspect preset pills
  ['#aspectCustomW', '#aspectCustomH'].forEach((sel) => {
    const el = modalEl.querySelector(sel);
    if (el) {
      el.addEventListener('input', () => {
        modalEl
          .querySelectorAll('.aspect-pill[data-ratio-w]')
          .forEach((p) => p.classList.remove('active'));
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyCustomRatio();
        }
      });
    }
  });

  // ── Quick Crop (exact pixel size) presets (toggle-off, cross-deselect Aspect Ratio) ──
  modalEl.querySelectorAll('.size-pill[data-size-w]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const pw = parseInt(pill.dataset.sizeW, 10);
      const ph = parseInt(pill.dataset.sizeH, 10);
      const wasActive = pill.classList.contains('active');

      // Deselect all size pills
      modalEl
        .querySelectorAll('.size-pill[data-size-w]')
        .forEach((p) => p.classList.remove('active'));
      // Cross-deselect: clear Aspect Ratio pills (reset to Free) and custom inputs
      modalEl
        .querySelectorAll('.aspect-pill[data-ratio-w]')
        .forEach((p) => p.classList.remove('active'));
      const freePill = modalEl.querySelector('.aspect-pill[data-ratio-w="0"]');
      if (freePill) freePill.classList.add('active');
      lockedAspectRatio = null;
      const acw = modalEl.querySelector('#aspectCustomW');
      const ach = modalEl.querySelector('#aspectCustomH');
      if (acw) acw.value = '';
      if (ach) ach.value = '';

      // Clear size custom inputs
      const cw = modalEl.querySelector('#sizeCustomW');
      const ch = modalEl.querySelector('#sizeCustomH');
      if (cw) cw.value = '';
      if (ch) ch.value = '';

      if (wasActive) {
        // Toggle off — revert to free crop (full image)
        crop = { x: 0, y: 0, w: 1, h: 1 };
        draw();
        updateInfoBar();
      } else {
        pill.classList.add('active');
        applySizeCrop(pw, ph);
      }
    });
  });

  // Custom pixel size apply
  function applyCustomSize() {
    const pw = parseInt(modalEl.querySelector('#sizeCustomW').value, 10) || 0;
    const ph = parseInt(modalEl.querySelector('#sizeCustomH').value, 10) || 0;
    if (pw > 0 && ph > 0) {
      applySizeCrop(pw, ph);
      modalEl
        .querySelectorAll('.size-pill[data-size-w]')
        .forEach((p) => p.classList.remove('active'));
    }
  }

  const sizeCustomApply = modalEl.querySelector('#sizeCustomApply');
  if (sizeCustomApply) {
    sizeCustomApply.addEventListener('click', applyCustomSize);
  }

  // Typing in size custom inputs deselects size preset pills and cross-deselects aspect pills
  ['#sizeCustomW', '#sizeCustomH'].forEach((sel) => {
    const el = modalEl.querySelector(sel);
    if (el) {
      el.addEventListener('input', () => {
        modalEl
          .querySelectorAll('.size-pill[data-size-w]')
          .forEach((p) => p.classList.remove('active'));
        // Cross-deselect aspect pills (reset to Free)
        modalEl
          .querySelectorAll('.aspect-pill[data-ratio-w]')
          .forEach((p) => p.classList.remove('active'));
        const freePill = modalEl.querySelector('.aspect-pill[data-ratio-w="0"]');
        if (freePill) freePill.classList.add('active');
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyCustomSize();
        }
      });
    }
  });

  // ── Export Size (target output dimensions, toggle-off on second click) ──
  modalEl.querySelectorAll('.export-pill[data-export-w]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const ew = parseInt(pill.dataset.exportW, 10);
      const eh = parseInt(pill.dataset.exportH, 10);
      const wasActive = pill.classList.contains('active');

      modalEl
        .querySelectorAll('.export-pill[data-export-w]')
        .forEach((p) => p.classList.remove('active'));
      // Clear custom export inputs
      const cw = modalEl.querySelector('#exportCustomW');
      const ch = modalEl.querySelector('#exportCustomH');
      if (cw) cw.value = '';
      if (ch) ch.value = '';

      const clearBtn = modalEl.querySelector('#exportClear');
      if (wasActive) {
        // Toggle off — remove export size
        exportSize = null;
        if (clearBtn) clearBtn.style.display = 'none';
        draw();
        updateInfoBar();
      } else {
        pill.classList.add('active');
        applyExportSizeCrop(ew, eh);
        if (clearBtn) clearBtn.style.display = '';
      }
    });
  });

  function applyCustomExport() {
    const ew = parseInt(modalEl.querySelector('#exportCustomW').value, 10) || 0;
    const eh = parseInt(modalEl.querySelector('#exportCustomH').value, 10) || 0;
    if (ew > 0 && eh > 0) {
      applyExportSizeCrop(ew, eh);
      modalEl
        .querySelectorAll('.export-pill[data-export-w]')
        .forEach((p) => p.classList.remove('active'));
      const clearBtn = modalEl.querySelector('#exportClear');
      if (clearBtn) clearBtn.style.display = '';
    }
  }

  const exportCustomApply = modalEl.querySelector('#exportCustomApply');
  if (exportCustomApply) {
    exportCustomApply.addEventListener('click', applyCustomExport);
  }

  // Typing in export custom inputs deselects export preset pills
  ['#exportCustomW', '#exportCustomH'].forEach((sel) => {
    const el = modalEl.querySelector(sel);
    if (el) {
      el.addEventListener('input', () => {
        modalEl
          .querySelectorAll('.export-pill[data-export-w]')
          .forEach((p) => p.classList.remove('active'));
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyCustomExport();
        }
      });
    }
  });

  // Clear export size
  const exportClearBtn = modalEl.querySelector('#exportClear');
  if (exportClearBtn) {
    exportClearBtn.addEventListener('click', () => {
      exportSize = null;
      modalEl
        .querySelectorAll('.export-pill[data-export-w]')
        .forEach((p) => p.classList.remove('active'));
      const cw = modalEl.querySelector('#exportCustomW');
      const ch = modalEl.querySelector('#exportCustomH');
      if (cw) cw.value = '';
      if (ch) ch.value = '';
      exportClearBtn.style.display = 'none';
      draw();
      updateInfoBar();
    });
  }

  // Wire mouse/touch events on canvas
  overlayCanvas.addEventListener('mousedown', onPointerDown);
  overlayCanvas.addEventListener('mousemove', onPointerMove);
  overlayCanvas.addEventListener('mouseup', onPointerUp);
  overlayCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  overlayCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
  overlayCanvas.addEventListener('touchend', onPointerUp);

  // Keyboard: Escape to cancel, Shift tracking for aspect-ratio lock
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Focus the apply button
  modalEl.querySelector('[data-action="apply"]').focus();
  // Trap Tab within the modal; restore focus to the opener on close (H6).
  focusTrap = createFocusTrap(modalEl);
  focusTrap.activate();
}

function loadSourceImage(src) {
  sourceImg = new Image();
  sourceImg.onload = () => {
    buildTransformedCanvas();
    // Carry an exact-mode preset's framing in: lock the aspect ratio and
    // center/maximize the crop so the editor opens matching the preview's
    // crop overlay. Only fires when nothing would otherwise be cropped.
    if (pendingSizingLock && transformedCanvas) {
      const srcAR = transformedCanvas.width / transformedCanvas.height;
      // Skip if the source already matches the target ratio (no crop needed).
      if (Math.abs(srcAR - pendingSizingLock) > 0.001) {
        lockedAspectRatio = pendingSizingLock;
        applyCropConstraint();
        syncAspectPillToLock();
        if (historyController) historyController.reset();
      }
      pendingSizingLock = null;
    }
    sizeCanvas();
    draw();
    updateInfoBar();
    updateSourceInfo();
    updateActiveButtons();
    window.addEventListener('resize', onResize);
  };
  sourceImg.src = src;
}

/**
 * Populate the source image properties in the header
 */
function updateSourceInfo() {
  if (!modalEl || !sourceImg) return;

  const w = sourceImg.naturalWidth;
  const h = sourceImg.naturalHeight;

  const sourceEl = modalEl.querySelector('#editInfoSource');
  if (sourceEl) sourceEl.textContent = `${w} \u00d7 ${h} px`;

  const typeEl = modalEl.querySelector('#editInfoType');
  if (typeEl && !typeEl.textContent.trim()) {
    const ext = sourceFileInfo.name
      ? sourceFileInfo.name.split('.').pop().toUpperCase()
      : sourceFileInfo.type || '\u2014';
    typeEl.textContent = ext;
  }

  const aspectEl = modalEl.querySelector('#editInfoAspect');
  if (aspectEl) {
    const g = gcdHelper(w, h);
    const rw = w / g;
    const rh = h / g;
    aspectEl.textContent = rw <= 32 && rh <= 32 ? `${rw}:${rh}` : `${(w / h).toFixed(2)}:1`;
  }
}

function gcdHelper(a, b) {
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Build a pre-rendered canvas with rotation + flip applied to the source image.
 * This is what the user sees — crop coordinates are relative to this.
 */
function buildTransformedCanvas() {
  transformedCanvas = engineBuildTransformedCanvas(sourceImg, localEdits);
}

function sizeCanvas() {
  const body = modalEl.querySelector('.crop-modal-body');
  const layout = computeLayout(transformedCanvas, body);
  overlayCanvas.width = layout.canvasWidth;
  overlayCanvas.height = layout.canvasHeight;
  imgRect = layout.imgRect;
}

function draw() {
  drawOverlay(overlayCtx, {
    transformedCanvas,
    imgRect,
    crop,
    canvasWidth: overlayCanvas.width,
    canvasHeight: overlayCanvas.height,
    gridEnabled,
    gridColor,
    exportSize,
  });

  // Phase 8.5: Magnifier loupe (controller no-ops when eyedropper is off)
  if (colorController) colorController.drawLoupe(overlayCtx);
}

function canvasCoords(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

/**
 * Reset transient drag state after a handler throws. Keeps the modal usable
 * instead of leaving `dragState` stuck so subsequent clicks re-enter a
 * phantom drag. Called from the catch arm of every pointer handler below.
 */
function resetDragState() {
  dragState = null;
  if (overlayCanvas) {
    overlayCanvas.style.cursor = 'default';
  }
}

function onPointerDown(e) {
  try {
    const pos = canvasCoords(e);

    // Eyedropper mode (delegated): controller samples + updates panel
    if (colorController && colorController.handlePointerDown(pos)) return;

    const action = engineGetPointerAction(pos.x, pos.y, crop, imgRect);
    if (!action) return;

    if (historyController) historyController.push(); // Save state before crop drag begins
    dragState = {
      type: action,
      startX: pos.x,
      startY: pos.y,
      startCrop: { ...crop },
    };
  } catch (err) {
    console.error('PixelGnome: onPointerDown failed —', err);
    resetDragState();
  }
}

function onTouchStart(e) {
  try {
    e.preventDefault();
    if (e.touches.length === 1) {
      onPointerDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
  } catch (err) {
    console.error('PixelGnome: onTouchStart failed —', err);
    resetDragState();
  }
}

function onPointerMove(e) {
  try {
    const pos = canvasCoords(e);

    // Eyedropper mode (delegated): controller updates cursor + triggers draw
    if (colorController && colorController.handlePointerMove(pos)) return;

    // Update cursor
    const action = engineGetPointerAction(pos.x, pos.y, crop, imgRect);
    overlayCanvas.style.cursor = cursorForAction(action);

    if (!dragState) return;

    const effectiveAR = engineGetEffectiveAR(lockedAspectRatio, shiftHeld, crop, transformedCanvas);
    crop = resolveDrag(dragState, pos, imgRect, effectiveAR, transformedCanvas);

    draw();
    updateInfoBar();
  } catch (err) {
    console.error('PixelGnome: onPointerMove failed —', err);
    resetDragState();
  }
}

function onTouchMove(e) {
  try {
    e.preventDefault();
    if (e.touches.length === 1) {
      onPointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
  } catch (err) {
    console.error('PixelGnome: onTouchMove failed —', err);
    resetDragState();
  }
}

function onPointerUp() {
  dragState = null;
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    handleCancel();
  }
  if (e.key === 'Shift') {
    shiftHeld = true;
  }
  // Phase 10: Undo/Redo keyboard shortcuts
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (historyController) historyController.undo();
  }
  if (mod && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
    e.preventDefault();
    if (historyController) historyController.redo();
  }
  // Phase 10: Transform keyboard shortcuts (only when not in a text field)
  const tag = e.target?.tagName;
  if (!mod && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    if (e.key === 'r') {
      e.preventDefault();
      handleRotate(90);
    }
    if (e.key === 'R') {
      e.preventDefault();
      handleRotate(-90);
    } // Shift+R = CCW
    if (e.key === 'h') {
      e.preventDefault();
      handleFlip('h');
    }
    if (e.key === 'v') {
      e.preventDefault();
      handleFlip('v');
    }
  }
}

function onKeyUp(e) {
  if (e.key === 'Shift') {
    shiftHeld = false;
  }
}

function onResize() {
  if (!sourceImg || !sourceImg.complete || !transformedCanvas) return;
  sizeCanvas();
  draw();
}

// --- Transform handlers ---

function handleRotate(degrees) {
  if (historyController) historyController.push();
  localEdits.rotation = /** @type {0|90|180|270} */ ((localEdits.rotation + degrees + 360) % 360);
  // Reset crop when rotation changes (crop coords become invalid)
  crop = { x: 0, y: 0, w: 1, h: 1 };
  buildTransformedCanvas();
  // Re-apply aspect constraint if locked (image dims may have swapped)
  if (lockedAspectRatio) applyCropConstraint();
  sizeCanvas();
  draw();
  updateInfoBar();
  updateActiveButtons();
}

function handleFlip(axis) {
  if (historyController) historyController.push();
  if (axis === 'h') {
    localEdits.flipH = !localEdits.flipH;
    // Transform crop: mirror x position
    crop.x = 1 - crop.x - crop.w;
  } else {
    localEdits.flipV = !localEdits.flipV;
    // Transform crop: mirror y position
    crop.y = 1 - crop.y - crop.h;
  }
  buildTransformedCanvas();
  draw();
  updateInfoBar();
  updateActiveButtons();
}

function updateActiveButtons() {
  if (!modalEl) return;
  const flipH = modalEl.querySelector('[data-action="flip-h"]');
  const flipV = modalEl.querySelector('[data-action="flip-v"]');
  if (flipH) flipH.classList.toggle('active', localEdits.flipH);
  if (flipV) flipV.classList.toggle('active', localEdits.flipV);
}

function updateInfoBar() {
  if (!modalEl) return;
  const rotEl = modalEl.querySelector('#editInfoRotation');
  const flipEl = modalEl.querySelector('#editInfoFlip');
  const cropEl = modalEl.querySelector('#editInfoCrop');

  if (rotEl) rotEl.textContent = `${localEdits.rotation}\u00b0`;

  if (flipEl) {
    const flips = [];
    if (localEdits.flipH) flips.push('H');
    if (localEdits.flipV) flips.push('V');
    flipEl.textContent =
      flips.length > 0 ? `${t('editor.flipPrefix')}: ${flips.join('+')}` : '\u2014';
  }

  if (cropEl) {
    const isFull = crop.x < 0.01 && crop.y < 0.01 && crop.w > 0.99 && crop.h > 0.99;
    if (isFull) {
      cropEl.textContent = t('editor.fullImage');
    } else if (transformedCanvas) {
      const pw = Math.round(crop.w * transformedCanvas.width);
      const ph = Math.round(crop.h * transformedCanvas.height);
      const g = gcdHelper(pw, ph);
      const rw = pw / g;
      const rh = ph / g;
      const ratioStr = rw <= 32 && rh <= 32 ? ` (${rw}:${rh})` : '';
      cropEl.textContent = `${t('editor.cropPrefix')}: ${pw} \u00d7 ${ph}${ratioStr}`;
    }
  }

  // Live crop size badge (shown during active cropping)
  const liveEl = modalEl.querySelector('#editCropSizeLive');
  if (liveEl && transformedCanvas) {
    const isFull = crop.x < 0.01 && crop.y < 0.01 && crop.w > 0.99 && crop.h > 0.99;
    if (isFull && !exportSize) {
      liveEl.textContent = '';
    } else {
      const pw = Math.round(crop.w * transformedCanvas.width);
      const ph = Math.round(crop.h * transformedCanvas.height);
      const pct = Math.round(crop.w * crop.h * 100);
      let text = isFull ? '' : `${pw} \u00d7 ${ph} px (${pct}%)`;
      if (exportSize) {
        text += `${text ? ' \u2192 ' : ''}Export: ${exportSize.width}\u00d7${exportSize.height}`;
      }
      liveEl.textContent = text;
    }
  }
}

// --- Aspect ratio crop constraint ---

/**
 * Apply an exact pixel crop. Sets crop region to the requested pixel
 * dimensions (clamped to source size) and locks the aspect ratio.
 * The crop is centered on the image.
 *
 * @param {number} pw - Desired crop width in pixels
 * @param {number} ph - Desired crop height in pixels
 */
function applySizeCrop(pw, ph) {
  if (!transformedCanvas || pw <= 0 || ph <= 0) return;

  const srcW = transformedCanvas.width;
  const srcH = transformedCanvas.height;

  // Clamp to source dimensions
  const cropW = Math.min(pw, srcW);
  const cropH = Math.min(ph, srcH);

  // Convert to fractional coordinates
  crop.w = cropW / srcW;
  crop.h = cropH / srcH;
  crop.x = (1 - crop.w) / 2;
  crop.y = (1 - crop.h) / 2;

  // Lock the aspect ratio so dragging the handles preserves it
  lockedAspectRatio = cropW / cropH;

  // Deselect aspect-ratio pills (size crops are separate)
  if (modalEl) {
    modalEl
      .querySelectorAll('.aspect-pill[data-ratio-w]')
      .forEach((p) => p.classList.remove('active'));
    // Clear aspect custom inputs
    const cw = modalEl.querySelector('#aspectCustomW');
    const ch = modalEl.querySelector('#aspectCustomH');
    if (cw) cw.value = '';
    if (ch) ch.value = '';
  }

  if (historyController) historyController.push();
  draw();
  updateInfoBar();
}

/**
 * Set the export size and auto-lock the crop aspect ratio to match.
 * Unlike applySizeCrop (which crops to exact source pixels), this sets
 * the TARGET OUTPUT dimensions. The crop region is maximized at the
 * correct aspect ratio so the user can freely position it.
 *
 * @param {number} w - Target export width in pixels
 * @param {number} h - Target export height in pixels
 */
function applyExportSizeCrop(w, h) {
  if (!transformedCanvas || w <= 0 || h <= 0) return;

  exportSize = { width: w, height: h };

  // Lock aspect ratio to match export dimensions
  lockedAspectRatio = w / h;

  // Deselect aspect-ratio and size pills
  if (modalEl) {
    modalEl
      .querySelectorAll('.aspect-pill[data-ratio-w]')
      .forEach((p) => p.classList.remove('active'));
    modalEl
      .querySelectorAll('.size-pill[data-size-w]')
      .forEach((p) => p.classList.remove('active'));
  }

  // Maximize crop at the locked aspect ratio
  applyCropConstraint();

  if (historyController) historyController.push();
  draw();
  updateInfoBar();
}

/**
 * Apply the locked aspect ratio to the current crop region.
 * Thin wrapper around crop-engine's applyLockedAspect — the engine returns
 * a new crop and this reassigns it into modal state.
 */
function applyCropConstraint() {
  if (!lockedAspectRatio || !transformedCanvas) return;
  crop = applyLockedAspect(lockedAspectRatio, transformedCanvas, crop);
}

/**
 * Reflect the current lockedAspectRatio in the ratio-pill row: highlight the
 * preset pill whose ratio matches (within tolerance), otherwise leave none
 * highlighted. Used when the editor opens with a carried-in sizing lock so the
 * constraint is visually explained rather than feeling arbitrary.
 */
function syncAspectPillToLock() {
  if (!modalEl) return;
  const pills = modalEl.querySelectorAll('.aspect-pill[data-ratio-w]');
  pills.forEach((p) => p.classList.remove('active'));
  if (!lockedAspectRatio) return;
  for (const p of pills) {
    const w = parseFloat(p.dataset.ratioW);
    const h = parseFloat(p.dataset.ratioH);
    if (w > 0 && h > 0 && Math.abs(w / h - lockedAspectRatio) < 0.001) {
      p.classList.add('active');
      break;
    }
  }
}

// --- Modal actions ---

function handleApply() {
  const noCrop = crop.x < 0.01 && crop.y < 0.01 && crop.w > 0.99 && crop.h > 0.99;
  const finalEdits = {
    rotation: localEdits.rotation,
    flipH: localEdits.flipH,
    flipV: localEdits.flipV,
    crop: noCrop ? null : { ...crop },
  };
  // Attach export size if set (consumed by main.js to update output settings)
  if (exportSize) {
    finalEdits.exportSize = { ...exportSize };
  }
  closeModal();
  if (resolveCallback) resolveCallback(finalEdits);
}

function handleCancel() {
  closeModal();
  if (resolveCallback) resolveCallback(undefined);
}

function handleReset() {
  if (historyController) historyController.push();
  localEdits = createDefaultEdits();
  crop = { x: 0, y: 0, w: 1, h: 1 };
  lockedAspectRatio = null;
  exportSize = null;
  // Reset all toolbar UI if visible
  if (modalEl) {
    modalEl.querySelectorAll('.aspect-pill[data-ratio-w]').forEach((p, i) => {
      p.classList.toggle('active', i === 0); // Activate "Free"
    });
    modalEl
      .querySelectorAll('.size-pill[data-size-w]')
      .forEach((p) => p.classList.remove('active'));
    modalEl
      .querySelectorAll('.export-pill[data-export-w]')
      .forEach((p) => p.classList.remove('active'));
    const cw = modalEl.querySelector('#aspectCustomW');
    const ch = modalEl.querySelector('#aspectCustomH');
    if (cw) cw.value = '';
    if (ch) ch.value = '';
    const sw = modalEl.querySelector('#sizeCustomW');
    const sh = modalEl.querySelector('#sizeCustomH');
    if (sw) sw.value = '';
    if (sh) sh.value = '';
    const ew = modalEl.querySelector('#exportCustomW');
    const eh = modalEl.querySelector('#exportCustomH');
    if (ew) ew.value = '';
    if (eh) eh.value = '';
    const clearBtn = modalEl.querySelector('#exportClear');
    if (clearBtn) clearBtn.style.display = 'none';
  }
  buildTransformedCanvas();
  sizeCanvas();
  draw();
  updateInfoBar();
  updateActiveButtons();
}

function closeModal() {
  window.removeEventListener('resize', onResize);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  if (focusTrap) {
    focusTrap.release(); // restores focus to the opener
    focusTrap = null;
  }
  shiftHeld = false;
  lockedAspectRatio = null;
  exportSize = null;
  if (colorController) {
    colorController.destroy();
    colorController = null;
  }
  if (historyController) {
    historyController.destroy();
    historyController = null;
  }
  // Restore body scroll
  document.body.style.overflow = '';

  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
  overlayCanvas = null;
  overlayCtx = null;
  sourceImg = null;
  transformedCanvas = null;
  dragState = null;
  localEdits = null;
}
