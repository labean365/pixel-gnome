/**
 * crop-engine.js
 * Pure-geometry helpers for the edit modal's crop overlay:
 *   • Handle hit-testing
 *   • Canvas sizing / zoom-to-fit
 *   • Transformed-source canvas (rotation + flip) construction
 *   • Aspect-ratio lock + constraint math
 *   • Drag resolution for every handle type (tl/tr/bl/br/move)
 *   • Overlay painting (dim-outside + crop region + grid + handles + badge)
 *
 * Everything here is a pure function — no module-scope mutable state, no DOM
 * queries beyond what's passed in. The modal owns `crop`, `imgRect`,
 * `transformedCanvas`, etc. and feeds them in. Drag helpers return a new
 * crop object; the caller assigns it into its own state.
 *
 * This makes the geometry unit-testable in isolation and collapses ~250 lines
 * of overlay plumbing out of crop-modal.js.
 */

// ── Constants ─────────────────────────────────────────────────

export const HANDLE_SIZE = 10;
export const MIN_CROP_FRAC = 0.05;

export const GRID_COLORS = {
  cyan: 'rgba(0, 255, 255, 0.6)',
  yellow: 'rgba(255, 255, 0, 0.6)',
  magenta: 'rgba(255, 0, 255, 0.6)',
  red: 'rgba(255, 69, 58, 0.6)',
  green: 'rgba(48, 209, 88, 0.6)',
  blue: 'rgba(10, 132, 255, 0.6)',
  white: 'rgba(255, 255, 255, 0.5)',
  black: 'rgba(0, 0, 0, 0.6)',
};

// ── Small math ────────────────────────────────────────────────

export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// ── Transformed source canvas (rotation + flip) ───────────────

/**
 * Build a pre-rendered canvas with rotation + flip applied to `sourceImg`.
 * Crop coordinates in the modal are relative to this canvas, so this is
 * what the user sees before the crop rectangle is overlaid.
 *
 * @param {HTMLImageElement} sourceImg
 * @param {{ rotation: 0|90|180|270, flipH: boolean, flipV: boolean }} edits
 * @returns {HTMLCanvasElement}
 */
export function buildTransformedCanvas(sourceImg, edits) {
  const w = sourceImg.naturalWidth;
  const h = sourceImg.naturalHeight;
  const rot = edits.rotation;
  const swaps = rot === 90 || rot === 270;
  const outW = swaps ? h : w;
  const outH = swaps ? w : h;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  // willReadFrequently hints the browser to use the CPU software renderer.
  // Eyedropper + palette extraction do per-pixel getImageData reads against
  // this canvas; the flag is a significant perf win on Safari with zero
  // downside on other browsers. Must be set on the FIRST getContext call.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  // Visual order: rotate then flip.
  // Canvas op order (reversed): scale first, then rotate.
  const sx = edits.flipH ? -1 : 1;
  const sy = edits.flipV ? -1 : 1;
  if (edits.flipH || edits.flipV) ctx.scale(sx, sy);
  if (rot !== 0) ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(sourceImg, -w / 2, -h / 2);
  ctx.restore();

  return canvas;
}

// ── Canvas sizing / zoom-to-fit ───────────────────────────────

/**
 * Compute overlay canvas dimensions + image placement rect so the transformed
 * image fits inside `container` with `pad` pixels of padding on each side,
 * centered, never upscaled beyond 1×.
 *
 * @param {HTMLCanvasElement} transformedCanvas
 * @param {{ clientWidth: number, clientHeight: number }} container
 * @param {number} [pad=32]  Total padding (subtracted from both width and height)
 * @returns {{
 *   canvasWidth: number, canvasHeight: number,
 *   imgRect: { x: number, y: number, w: number, h: number }
 * }}
 */
export function computeLayout(transformedCanvas, container, pad = 32) {
  const maxW = container.clientWidth - pad;
  const maxH = container.clientHeight - pad;

  const imgW = transformedCanvas.width;
  const imgH = transformedCanvas.height;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);

  const drawW = Math.round(imgW * scale);
  const drawH = Math.round(imgH * scale);

  return {
    canvasWidth: maxW,
    canvasHeight: maxH,
    imgRect: {
      x: Math.round((maxW - drawW) / 2),
      y: Math.round((maxH - drawH) / 2),
      w: drawW,
      h: drawH,
    },
  };
}

// ── Handle hit-testing ────────────────────────────────────────

/**
 * Corner-handle positions in canvas space for a crop rectangle.
 * @param {number} cx  Crop x in canvas space
 * @param {number} cy  Crop y in canvas space
 * @param {number} cw  Crop width in canvas space
 * @param {number} ch  Crop height in canvas space
 */
export function getHandlePositions(cx, cy, cw, ch) {
  return [
    { x: cx, y: cy, type: 'tl' },
    { x: cx + cw, y: cy, type: 'tr' },
    { x: cx, y: cy + ch, type: 'bl' },
    { x: cx + cw, y: cy + ch, type: 'br' },
  ];
}

/**
 * Given a pointer position in canvas space and the current crop+imgRect,
 * return the action kind under that pointer: 'tl' | 'tr' | 'bl' | 'br' |
 * 'move' | null.
 */
export function getPointerAction(px, py, crop, imgRect) {
  const cx = imgRect.x + crop.x * imgRect.w;
  const cy = imgRect.y + crop.y * imgRect.h;
  const cw = crop.w * imgRect.w;
  const ch = crop.h * imgRect.h;

  const hitRadius = HANDLE_SIZE + 4;
  const handles = getHandlePositions(cx, cy, cw, ch);

  for (const h of handles) {
    if (Math.abs(px - h.x) < hitRadius && Math.abs(py - h.y) < hitRadius) {
      return h.type;
    }
  }
  if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch) {
    return 'move';
  }
  return null;
}

// ── Aspect ratio ──────────────────────────────────────────────

/**
 * Resolve the *effective* aspect ratio (W/H in pixels) to enforce during
 * a drag. Returns null when the crop is free.
 *
 * @param {number|null} lockedAspectRatio  Explicit ratio from toolbar, or null
 * @param {boolean} shiftHeld              Shift key → lock to current crop ratio
 * @param {{ w: number, h: number }} crop  Current fractional crop
 * @param {HTMLCanvasElement|null} transformedCanvas
 */
export function getEffectiveAR(lockedAspectRatio, shiftHeld, crop, transformedCanvas) {
  if (lockedAspectRatio) return lockedAspectRatio;
  if (shiftHeld && crop.w > 0 && crop.h > 0 && transformedCanvas) {
    return (crop.w * transformedCanvas.width) / (crop.h * transformedCanvas.height);
  }
  return null;
}

/**
 * Maximize a centered crop at `lockedAspectRatio` within the image bounds.
 * Returns a new crop {x,y,w,h}; caller assigns it.
 * When the lock is null, returns the current crop unchanged.
 */
export function applyLockedAspect(lockedAspectRatio, transformedCanvas, crop) {
  if (!lockedAspectRatio || !transformedCanvas) return { ...crop };

  const imgAR = transformedCanvas.width / transformedCanvas.height;
  const targetAR = lockedAspectRatio;

  let newW, newH;
  if (targetAR > imgAR) {
    newW = 1;
    newH = imgAR / targetAR;
  } else {
    newH = 1;
    newW = targetAR / imgAR;
  }

  return {
    w: newW,
    h: newH,
    x: (1 - newW) / 2,
    y: (1 - newH) / 2,
  };
}

// ── Drag resolution ───────────────────────────────────────────

/**
 * Resolve a drag delta into a new fractional crop for the given handle type.
 * Returns a new crop object; the caller assigns it into its own state.
 *
 * @param {{ type: string, startX: number, startY: number, startCrop: object }} dragState
 * @param {{ x: number, y: number }} pointer  Current pointer position in canvas space
 * @param {{ w: number, h: number }} imgRect
 * @param {number|null} effectiveAR  Pixel-space aspect ratio to enforce, or null
 * @param {HTMLCanvasElement|null} transformedCanvas
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function resolveDrag(dragState, pointer, imgRect, effectiveAR, transformedCanvas) {
  const dx = (pointer.x - dragState.startX) / imgRect.w;
  const dy = (pointer.y - dragState.startY) / imgRect.h;
  const sc = dragState.startCrop;

  // Convert pixel-space effectiveAR to fractional h/w multiplier:
  //   (crop.w * imgW) / (crop.h * imgH) = effectiveAR
  //   => crop.h = crop.w * (imgW / (effectiveAR * imgH))
  //   => fracAR = imgW / (effectiveAR * imgH)
  const fracAR =
    effectiveAR && transformedCanvas
      ? transformedCanvas.width / (effectiveAR * transformedCanvas.height)
      : null;

  const next = { x: sc.x, y: sc.y, w: sc.w, h: sc.h };

  if (dragState.type === 'move') {
    next.x = clamp(sc.x + dx, 0, 1 - sc.w);
    next.y = clamp(sc.y + dy, 0, 1 - sc.h);
  } else if (dragState.type === 'br') {
    next.w = clamp(sc.w + dx, MIN_CROP_FRAC, 1 - sc.x);
    next.h = fracAR
      ? clamp(next.w * fracAR, MIN_CROP_FRAC, 1 - sc.y)
      : clamp(sc.h + dy, MIN_CROP_FRAC, 1 - sc.y);
  } else if (dragState.type === 'tl') {
    const newX = clamp(sc.x + dx, 0, sc.x + sc.w - MIN_CROP_FRAC);
    next.w = sc.w + (sc.x - newX);
    if (fracAR) {
      next.h = clamp(next.w * fracAR, MIN_CROP_FRAC, sc.y + sc.h);
      next.y = sc.y + sc.h - next.h;
    } else {
      const newY = clamp(sc.y + dy, 0, sc.y + sc.h - MIN_CROP_FRAC);
      next.h = sc.h + (sc.y - newY);
      next.y = newY;
    }
    next.x = newX;
  } else if (dragState.type === 'tr') {
    next.w = clamp(sc.w + dx, MIN_CROP_FRAC, 1 - sc.x);
    if (fracAR) {
      next.h = clamp(next.w * fracAR, MIN_CROP_FRAC, sc.y + sc.h);
      next.y = sc.y + sc.h - next.h;
    } else {
      const newY = clamp(sc.y + dy, 0, sc.y + sc.h - MIN_CROP_FRAC);
      next.h = sc.h + (sc.y - newY);
      next.y = newY;
    }
  } else if (dragState.type === 'bl') {
    const newX = clamp(sc.x + dx, 0, sc.x + sc.w - MIN_CROP_FRAC);
    next.w = sc.w + (sc.x - newX);
    next.x = newX;
    next.h = fracAR
      ? clamp(next.w * fracAR, MIN_CROP_FRAC, 1 - sc.y)
      : clamp(sc.h + dy, MIN_CROP_FRAC, 1 - sc.y);
  }

  return next;
}

/**
 * Map `action` (getPointerAction result) to a CSS cursor string.
 */
export function cursorForAction(action) {
  switch (action) {
    case 'move':
      return 'move';
    case 'tl':
    case 'br':
      return 'nwse-resize';
    case 'tr':
    case 'bl':
      return 'nesw-resize';
    default:
      return 'crosshair';
  }
}

// ── Overlay painting ──────────────────────────────────────────

/**
 * Paint the full crop overlay onto `ctx`:
 *   1. Draw transformed image in-place
 *   2. Dim everything outside the crop (semi-transparent black)
 *   3. Re-draw the crop region at full brightness
 *   4. Crop border
 *   5. Rule-of-thirds grid (if enabled)
 *   6. Corner handles
 *   7. Export size badge (if set)
 *
 * The caller is responsible for any further overlays (e.g. the eyedropper
 * loupe) that should paint on top.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.transformedCanvas
 * @param {{ x: number, y: number, w: number, h: number }} opts.imgRect
 * @param {{ x: number, y: number, w: number, h: number }} opts.crop
 * @param {number} opts.canvasWidth
 * @param {number} opts.canvasHeight
 * @param {boolean} opts.gridEnabled
 * @param {string} opts.gridColor   Key into GRID_COLORS
 * @param {{ width: number, height: number }|null} opts.exportSize
 */
export function drawOverlay(ctx, opts) {
  const {
    transformedCanvas,
    imgRect,
    crop,
    canvasWidth,
    canvasHeight,
    gridEnabled,
    gridColor,
    exportSize,
  } = opts;

  // 1. Clear + draw transformed image
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(transformedCanvas, imgRect.x, imgRect.y, imgRect.w, imgRect.h);

  // 2. Dim everything
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 3. Re-draw crop region bright
  const cx = imgRect.x + crop.x * imgRect.w;
  const cy = imgRect.y + crop.y * imgRect.h;
  const cWidth = crop.w * imgRect.w;
  const cHeight = crop.h * imgRect.h;

  ctx.clearRect(cx, cy, cWidth, cHeight);
  ctx.drawImage(
    transformedCanvas,
    crop.x * transformedCanvas.width,
    crop.y * transformedCanvas.height,
    crop.w * transformedCanvas.width,
    crop.h * transformedCanvas.height,
    cx,
    cy,
    cWidth,
    cHeight
  );

  // 4. Crop border
  ctx.strokeStyle = '#0a84ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cWidth, cHeight);

  // 5. Rule-of-thirds grid
  if (gridEnabled) {
    ctx.strokeStyle = GRID_COLORS[gridColor] || GRID_COLORS.white;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      const vx = cx + (cWidth / 3) * i;
      ctx.beginPath();
      ctx.moveTo(vx, cy);
      ctx.lineTo(vx, cy + cHeight);
      ctx.stroke();

      const hy = cy + (cHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(cx, hy);
      ctx.lineTo(cx + cWidth, hy);
      ctx.stroke();
    }
  }

  // 6. Corner handles
  ctx.fillStyle = '#0a84ff';
  const handles = getHandlePositions(cx, cy, cWidth, cHeight);
  for (const h of handles) {
    ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  }

  // 7. Export size badge
  if (exportSize && cWidth > 80 && cHeight > 30) {
    const label = `Export: ${exportSize.width}\u00d7${exportSize.height}`;
    ctx.save();
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
    const textW = ctx.measureText(label).width;
    const badgeW = textW + 14;
    const badgeH = 20;
    const badgeX = cx + cWidth - badgeW - 6;
    const badgeY = cy + cHeight - badgeH - 6;
    ctx.fillStyle = 'rgba(48, 209, 88, 0.9)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + 7, badgeY + badgeH / 2);
    ctx.restore();
  }
}
