/**
 * color-tools.js
 * Phase 8.5: Eyedropper color sampling, magnifier loupe, palette extraction.
 *
 * Pure utility module — no DOM state. The edit modal owns the UI;
 * this module provides the math and rendering helpers.
 */

// ── Color Conversion ──────────────────────────────────────────

/**
 * RGBA pixel → { hex, rgb, hsl, cmyk } object.
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} [a=255] 0-255
 * @returns {{ hex: string, rgb: string, hsl: string, cmyk: string, r: number, g: number, b: number }}
 */
export function rgbaToColorInfo(r, g, b, a = 255) {
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

  const rgb = `rgb(${r}, ${g}, ${b})`;

  // HSL
  const rf = r / 255,
    gf = g / 255,
    bf = b / 255;
  const max = Math.max(rf, gf, bf),
    min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
    else if (max === gf) h = ((bf - rf) / d + 2) / 6;
    else h = ((rf - gf) / d + 4) / 6;
  }
  const hsl = `hsl(${Math.round(h * 360)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

  // CMYK (naive subtractive — no ICC)
  const k = 1 - max;
  let c = 0,
    m = 0,
    y = 0;
  if (k < 1) {
    c = (1 - rf - k) / (1 - k);
    m = (1 - gf - k) / (1 - k);
    y = (1 - bf - k) / (1 - k);
  }
  const cmyk = `C${Math.round(c * 100)} M${Math.round(m * 100)} Y${Math.round(y * 100)} K${Math.round(k * 100)}`;

  return { hex, rgb, hsl, cmyk, r, g, b };
}

// ── Pixel Sampling ────────────────────────────────────────────

/**
 * Sample the pixel color at a canvas-space coordinate.
 * Reads from the *transformedCanvas* (full-resolution, rotation+flip applied).
 *
 * @param {HTMLCanvasElement} transformedCanvas
 * @param {{ x: number, y: number, w: number, h: number }} imgRect
 * @param {number} canvasX  Pointer X in overlay-canvas space
 * @param {number} canvasY  Pointer Y in overlay-canvas space
 * @returns {{ hex: string, rgb: string, hsl: string, cmyk: string, r: number, g: number, b: number } | null}
 */
export function sampleColorAt(transformedCanvas, imgRect, canvasX, canvasY) {
  // Map canvas coords → transformed image coords
  const imgX = Math.round(((canvasX - imgRect.x) / imgRect.w) * transformedCanvas.width);
  const imgY = Math.round(((canvasY - imgRect.y) / imgRect.h) * transformedCanvas.height);

  if (imgX < 0 || imgY < 0 || imgX >= transformedCanvas.width || imgY >= transformedCanvas.height) {
    return null;
  }

  const ctx = transformedCanvas.getContext('2d');
  const pixel = ctx.getImageData(imgX, imgY, 1, 1).data;
  return rgbaToColorInfo(pixel[0], pixel[1], pixel[2], pixel[3]);
}

/**
 * Check whether a canvas-space coordinate is within the image bounds.
 */
export function isInsideImage(imgRect, canvasX, canvasY) {
  return (
    canvasX >= imgRect.x &&
    canvasX <= imgRect.x + imgRect.w &&
    canvasY >= imgRect.y &&
    canvasY <= imgRect.y + imgRect.h
  );
}

// ── Magnifier Loupe ───────────────────────────────────────────

const LOUPE_RADIUS = 50; // CSS pixels
const LOUPE_ZOOM = 8; // Magnification factor
const LOUPE_OFFSET_Y = -70; // Offset above cursor so hand doesn't obscure

/**
 * Draw a circular magnifier centered near the pointer.
 *
 * @param {CanvasRenderingContext2D} ctx  Overlay canvas context
 * @param {HTMLCanvasElement} transformedCanvas
 * @param {{ x: number, y: number, w: number, h: number }} imgRect
 * @param {number} cx  Pointer X in overlay-canvas space
 * @param {number} cy  Pointer Y in overlay-canvas space
 */
export function drawMagnifier(ctx, transformedCanvas, imgRect, cx, cy) {
  // Map pointer to source-image pixel coords
  const srcX = ((cx - imgRect.x) / imgRect.w) * transformedCanvas.width;
  const srcY = ((cy - imgRect.y) / imgRect.h) * transformedCanvas.height;

  // How many source pixels the loupe covers
  const srcRadius = ((LOUPE_RADIUS / imgRect.w) * transformedCanvas.width) / LOUPE_ZOOM;

  // Position loupe above cursor; flip below if near top edge
  let loupeX = cx;
  let loupeY = cy + LOUPE_OFFSET_Y;
  if (loupeY - LOUPE_RADIUS < 0) {
    loupeY = cy + 70; // Below cursor instead
  }

  ctx.save();

  // Circular clip
  ctx.beginPath();
  ctx.arc(loupeX, loupeY, LOUPE_RADIUS, 0, Math.PI * 2);
  ctx.clip();

  // Draw magnified image region
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    transformedCanvas,
    srcX - srcRadius,
    srcY - srcRadius,
    srcRadius * 2,
    srcRadius * 2,
    loupeX - LOUPE_RADIUS,
    loupeY - LOUPE_RADIUS,
    LOUPE_RADIUS * 2,
    LOUPE_RADIUS * 2
  );

  // Crosshair in center
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(loupeX - 8, loupeY);
  ctx.lineTo(loupeX + 8, loupeY);
  ctx.moveTo(loupeX, loupeY - 8);
  ctx.lineTo(loupeX, loupeY + 8);
  ctx.stroke();

  ctx.restore();

  // Border ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(loupeX, loupeY, LOUPE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Outer shadow ring
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(loupeX, loupeY, LOUPE_RADIUS + 2, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Palette Extraction (Median Cut) ───────────────────────────

/**
 * Extract the N most dominant colors from a canvas using the median cut algorithm.
 * Downsamples to ~100×100 for speed.
 *
 * @param {HTMLCanvasElement} sourceCanvas  The transformed canvas (or a crop sub-canvas)
 * @param {number} [numColors=5]  Number of palette colors to extract
 * @param {{ x: number, y: number, w: number, h: number } | null} [cropRegion]  Optional fractional crop
 * @returns {Array<{ hex: string, rgb: string, hsl: string, cmyk: string, r: number, g: number, b: number, population: number }>}
 */
export function extractPalette(sourceCanvas, numColors = 5, cropRegion = null) {
  // Determine source region
  const region = cropRegion || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(region.x * sourceCanvas.width);
  const sy = Math.round(region.y * sourceCanvas.height);
  const sw = Math.round(region.w * sourceCanvas.width);
  const sh = Math.round(region.h * sourceCanvas.height);

  // Downsample to ~100×100
  const maxDim = 100;
  const scale = Math.min(maxDim / sw, maxDim / sh, 1);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = dw;
  tmpCanvas.height = dh;
  // willReadFrequently: the sole purpose of this scratch canvas is a single
  // getImageData call below for median-cut quantization. Flag is free on modern
  // browsers and a measurable perf win on Safari.
  const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  tmpCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, dw, dh);

  const imgData = tmpCtx.getImageData(0, 0, dw, dh).data;

  // Build pixel array (skip near-transparent pixels)
  const pixels = [];
  for (let i = 0; i < imgData.length; i += 4) {
    if (imgData[i + 3] < 128) continue; // Skip transparent
    pixels.push([imgData[i], imgData[i + 1], imgData[i + 2]]);
  }

  if (pixels.length === 0) return [];

  // Median cut
  const buckets = medianCut(pixels, numColors);

  // Average each bucket → palette color
  const palette = buckets
    .map((bucket) => {
      let rSum = 0,
        gSum = 0,
        bSum = 0;
      for (const p of bucket) {
        rSum += p[0];
        gSum += p[1];
        bSum += p[2];
      }
      const n = bucket.length;
      const r = Math.round(rSum / n);
      const g = Math.round(gSum / n);
      const b = Math.round(bSum / n);
      return { ...rgbaToColorInfo(r, g, b), population: n };
    })
    .sort((a, b) => b.population - a.population);

  return palette;
}

/**
 * Recursive median cut: split pixel array into N buckets along the axis
 * with the greatest color range.
 *
 * @param {number[][]} pixels  Array of [r, g, b]
 * @param {number} depth       Target number of buckets
 * @returns {number[][][]}     Array of pixel buckets
 */
function medianCut(pixels, depth) {
  if (depth <= 1 || pixels.length < 2) return [pixels];

  // Find channel with greatest range
  let rMin = 255,
    rMax = 0,
    gMin = 255,
    gMax = 0,
    bMin = 255,
    bMax = 0;
  for (const p of pixels) {
    if (p[0] < rMin) rMin = p[0];
    if (p[0] > rMax) rMax = p[0];
    if (p[1] < gMin) gMin = p[1];
    if (p[1] > gMax) gMax = p[1];
    if (p[2] < bMin) bMin = p[2];
    if (p[2] > bMax) bMax = p[2];
  }

  const rRange = rMax - rMin;
  const gRange = gMax - gMin;
  const bRange = bMax - bMin;

  let channel;
  if (rRange >= gRange && rRange >= bRange) channel = 0;
  else if (gRange >= rRange && gRange >= bRange) channel = 1;
  else channel = 2;

  // Sort by the widest channel and split at median
  pixels.sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(pixels.length / 2);

  const left = pixels.slice(0, mid);
  const right = pixels.slice(mid);

  const leftDepth = Math.ceil((depth - 1) / 2);
  const rightDepth = depth - 1 - leftDepth + 1; // Ensure total ≈ depth

  // Recur: split remaining depth between halves
  const half = Math.ceil(depth / 2);
  return [...medianCut(left, half), ...medianCut(right, depth - half)];
}
