/**
 * crop-colors.js
 * Phase 8.5 color tooling for the edit modal — eyedropper sampling,
 * magnifier loupe, recent-picks history, and auto-extracted palette.
 *
 * Exported as a controller factory so the modal can own a single instance
 * scoped to the modal's lifetime. All state lives in closure vars, not at
 * module scope, so repeat modal opens don't carry over state between
 * images.
 *
 * Integration contract:
 *   const ctrl = createColorController({
 *     modalEl,                // root modal element (already in DOM)
 *     overlayCanvas,          // overlay canvas used for pointer coords + cursor
 *     getTransformedCanvas(), // returns current rotated/flipped source canvas
 *     getImgRect(),           // returns { x, y, w, h } of image in overlay space
 *     getCrop(),              // returns current fractional crop { x, y, w, h }
 *     requestDraw(),          // ask the modal to repaint the overlay
 *   });
 *
 *   ctrl.handlePointerDown(pos)  → true if consumed (skip crop drag)
 *   ctrl.handlePointerMove(pos)  → true if consumed (skip crop hover)
 *   ctrl.drawLoupe(ctx)          → paint magnifier onto overlay ctx
 *   ctrl.isEyedropperActive()    → boolean
 *   ctrl.destroy()               → clear state (DOM listeners are GC'd with modalEl)
 */

import { sampleColorAt, isInsideImage, drawMagnifier, extractPalette } from './color-tools.js';
import { t } from './i18n.js';

const MAX_HISTORY = 10;

export function createColorController(deps) {
  const { modalEl, overlayCanvas, getTransformedCanvas, getImgRect, getCrop, requestDraw } = deps;

  // --- Closure-scoped state ---
  let eyedropperMode = false;
  const eyedropperPointer = { x: 0, y: 0 };
  let pickedColors = []; // Recent picks, most-recent first (max MAX_HISTORY)
  let extractedPalette = []; // Auto-extracted palette for the current crop/image

  // --- DOM references (resolved once at construction) ---
  const eyedropperBtn = modalEl.querySelector('[data-action="eyedropper"]');
  const extractPaletteBtn = modalEl.querySelector('[data-action="extract-palette"]');
  const colorPanel = modalEl.querySelector('#colorPanel');
  const closeColorPanelBtn = modalEl.querySelector('[data-action="close-color-panel"]');

  // --- Button wiring ---
  if (eyedropperBtn) {
    eyedropperBtn.addEventListener('click', () => {
      eyedropperMode = !eyedropperMode;
      eyedropperBtn.classList.toggle('active', eyedropperMode);
      if (eyedropperMode && colorPanel) colorPanel.hidden = false;
      requestDraw();
    });
  }

  if (extractPaletteBtn) {
    extractPaletteBtn.addEventListener('click', () => {
      const transformedCanvas = getTransformedCanvas();
      if (!transformedCanvas) return;
      const crop = getCrop();
      const isFull = crop.x < 0.01 && crop.y < 0.01 && crop.w > 0.99 && crop.h > 0.99;
      extractedPalette = extractPalette(transformedCanvas, 5, isFull ? null : crop);
      if (colorPanel) colorPanel.hidden = false;
      renderPaletteStrip();
    });
  }

  if (closeColorPanelBtn) {
    closeColorPanelBtn.addEventListener('click', () => {
      if (colorPanel) colorPanel.hidden = true;
      eyedropperMode = false;
      if (eyedropperBtn) eyedropperBtn.classList.remove('active');
      requestDraw();
    });
  }

  // Copy individual format buttons — show "Copied!" feedback
  modalEl.querySelectorAll('[data-copy-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const textEl = btn.querySelector('.color-value-text');
      if (!textEl) return;
      const txt = textEl.textContent;
      if (txt === '—' || txt === t('toast.copied')) return;
      navigator.clipboard
        .writeText(txt)
        .then(() => {
          textEl.textContent = t('toast.copied');
          btn.classList.add('copied');
          setTimeout(() => {
            textEl.textContent = txt;
            btn.classList.remove('copied');
          }, 1000);
        })
        .catch(() => {});
    });
  });

  // Copy All (picked history)
  const copyAllBtn = modalEl.querySelector('#colorCopyAll');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', () => {
      if (pickedColors.length === 0) return;
      const hexList = pickedColors.map((c) => c.hex).join(', ');
      const orig = copyAllBtn.textContent;
      navigator.clipboard
        .writeText(hexList)
        .then(() => {
          copyAllBtn.textContent = t('toast.copied');
          setTimeout(() => {
            copyAllBtn.textContent = orig;
          }, 1000);
        })
        .catch(() => {});
    });
  }

  // Copy All (palette)
  const paletteCopyAllBtn = modalEl.querySelector('#paletteCopyAll');
  if (paletteCopyAllBtn) {
    paletteCopyAllBtn.addEventListener('click', () => {
      if (extractedPalette.length === 0) return;
      const hexList = extractedPalette.map((c) => c.hex).join(', ');
      const orig = paletteCopyAllBtn.textContent;
      navigator.clipboard
        .writeText(hexList)
        .then(() => {
          paletteCopyAllBtn.textContent = t('toast.copied');
          setTimeout(() => {
            paletteCopyAllBtn.textContent = orig;
          }, 1000);
        })
        .catch(() => {});
    });
  }

  // Clear picked-color history
  const clearHistoryBtn = modalEl.querySelector('#colorClearHistory');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      pickedColors = [];
      renderHistoryStrip();
      const currentSection = modalEl.querySelector('#colorCurrentSection');
      if (currentSection) currentSection.hidden = true;
    });
  }

  // Clear palette
  const clearPaletteBtn = modalEl.querySelector('#paletteClear');
  if (clearPaletteBtn) {
    clearPaletteBtn.addEventListener('click', () => {
      extractedPalette = [];
      renderPaletteStrip();
    });
  }

  // --- Pointer handlers (invoked by crop-modal's onPointerDown/Move) ---

  function handlePointerDown(pos) {
    if (!eyedropperMode) return false;
    const imgRect = getImgRect();
    if (isInsideImage(imgRect, pos.x, pos.y)) {
      const transformedCanvas = getTransformedCanvas();
      const color = sampleColorAt(transformedCanvas, imgRect, pos.x, pos.y);
      if (color) {
        addPickedColor(color);
        updateColorPanel(color);
      }
    }
    return true; // Consumed — don't start a crop drag
  }

  function handlePointerMove(pos) {
    if (!eyedropperMode) return false;
    eyedropperPointer.x = pos.x;
    eyedropperPointer.y = pos.y;
    const imgRect = getImgRect();
    overlayCanvas.style.cursor = isInsideImage(imgRect, pos.x, pos.y) ? 'crosshair' : 'default';
    requestDraw();
    return true; // Consumed — skip crop hover/resize logic
  }

  // --- Overlay rendering ---

  function drawLoupe(ctx) {
    if (!eyedropperMode) return;
    const imgRect = getImgRect();
    if (!isInsideImage(imgRect, eyedropperPointer.x, eyedropperPointer.y)) return;
    const transformedCanvas = getTransformedCanvas();
    if (!transformedCanvas) return;
    drawMagnifier(ctx, transformedCanvas, imgRect, eyedropperPointer.x, eyedropperPointer.y);
  }

  // --- Panel rendering helpers ---

  function addPickedColor(color) {
    // Prepend, dedup by hex, cap at MAX_HISTORY
    pickedColors = [color, ...pickedColors.filter((c) => c.hex !== color.hex)].slice(
      0,
      MAX_HISTORY
    );
  }

  function updateColorPanel(color) {
    const currentSection = modalEl.querySelector('#colorCurrentSection');
    if (currentSection) currentSection.hidden = false;

    const swatch = modalEl.querySelector('#colorSwatchLarge');
    if (swatch) swatch.style.background = color.hex;

    const hexEl = modalEl.querySelector('#colorHex');
    const rgbEl = modalEl.querySelector('#colorRgb');
    const hslEl = modalEl.querySelector('#colorHsl');
    const cmykEl = modalEl.querySelector('#colorCmyk');
    if (hexEl) hexEl.textContent = color.hex;
    if (rgbEl) rgbEl.textContent = color.rgb;
    if (hslEl) hslEl.textContent = color.hsl;
    if (cmykEl) cmykEl.textContent = color.cmyk;

    renderHistoryStrip();
  }

  function renderHistoryStrip() {
    const section = modalEl.querySelector('#colorHistorySection');
    const strip = modalEl.querySelector('#colorHistoryStrip');
    if (!strip || !section) return;

    if (pickedColors.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    strip.innerHTML = pickedColors
      .map(
        (c) =>
          `<button class="color-history-swatch" style="background: ${c.hex}" title="${c.hex}" data-hex="${c.hex}" data-rgb="${c.rgb}" data-hsl="${c.hsl}" data-cmyk="${c.cmyk}"></button>`
      )
      .join('');

    strip.querySelectorAll('.color-history-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        updateColorPanel({
          hex: sw.dataset.hex,
          rgb: sw.dataset.rgb,
          hsl: sw.dataset.hsl,
          cmyk: sw.dataset.cmyk,
        });
      });
    });
  }

  function renderPaletteStrip() {
    const section = modalEl.querySelector('#colorPaletteSection');
    const strip = modalEl.querySelector('#colorPaletteStrip');
    if (!strip || !section) return;

    if (extractedPalette.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    strip.innerHTML = extractedPalette
      .map(
        (c) =>
          `<button class="color-palette-swatch" style="background: ${c.hex}" title="${c.hex}" data-hex="${c.hex}" data-rgb="${c.rgb}" data-hsl="${c.hsl}" data-cmyk="${c.cmyk}"><span class="palette-hex-label">${c.hex}</span></button>`
      )
      .join('');

    strip.querySelectorAll('.color-palette-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const color = {
          hex: sw.dataset.hex,
          rgb: sw.dataset.rgb,
          hsl: sw.dataset.hsl,
          cmyk: sw.dataset.cmyk,
        };
        const currentSection = modalEl.querySelector('#colorCurrentSection');
        if (currentSection) currentSection.hidden = false;
        if (colorPanel) colorPanel.hidden = false;
        updateColorPanel(color);
        addPickedColor(color);
        renderHistoryStrip();
      });
    });
  }

  // --- Lifecycle ---

  function isEyedropperActive() {
    return eyedropperMode;
  }

  function destroy() {
    // DOM listeners are GC'd with modalEl.remove(). Just reset local state
    // so any stray references don't keep data alive.
    eyedropperMode = false;
    pickedColors = [];
    extractedPalette = [];
  }

  return {
    handlePointerDown,
    handlePointerMove,
    drawLoupe,
    isEyedropperActive,
    destroy,
  };
}
