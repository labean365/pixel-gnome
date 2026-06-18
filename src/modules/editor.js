/**
 * editor.js
 * Per-image edit state and canvas transform helpers.
 *
 * Each image can have:
 *  - rotation: 0, 90, 180, 270 (degrees clockwise)
 *  - flipH: boolean (mirror horizontally)
 *  - flipV: boolean (mirror vertically)
 *  - crop: { x, y, w, h } as fractions 0-1 of the source image, or null
 *
 * Edits are applied in this order in the processing pipeline:
 *  1. EXIF orientation correction (already handled)
 *  2. Crop (extract region from the corrected image)
 *  3. Rotate
 *  4. Flip
 *  5. Resize to target dimensions
 */

/**
 * @typedef {Object} ImageEdits
 * @property {0|90|180|270} rotation - Clockwise degrees
 * @property {boolean} flipH
 * @property {boolean} flipV
 * @property {{ x: number, y: number, w: number, h: number } | null} crop
 *   x, y, w, h are fractions of the EXIF-corrected source (0-1)
 */

/**
 * Create a default (no-op) edits object
 * @returns {ImageEdits}
 */
export function createDefaultEdits() {
  return {
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: null,
  };
}

/**
 * Rotate edits clockwise by 90 degrees
 * @param {ImageEdits} edits
 * @returns {ImageEdits}
 */
export function rotateCW(edits) {
  return {
    ...edits,
    rotation: /** @type {0|90|180|270} */ ((edits.rotation + 90) % 360),
  };
}

/**
 * Rotate edits counter-clockwise by 90 degrees
 * @param {ImageEdits} edits
 * @returns {ImageEdits}
 */
export function rotateCCW(edits) {
  return {
    ...edits,
    rotation: /** @type {0|90|180|270} */ ((edits.rotation + 270) % 360),
  };
}

/**
 * Toggle horizontal flip
 * @param {ImageEdits} edits
 * @returns {ImageEdits}
 */
export function toggleFlipH(edits) {
  return { ...edits, flipH: !edits.flipH };
}

/**
 * Toggle vertical flip
 * @param {ImageEdits} edits
 * @returns {ImageEdits}
 */
export function toggleFlipV(edits) {
  return { ...edits, flipV: !edits.flipV };
}

/**
 * Check if any edits are applied
 * @param {ImageEdits} edits
 * @returns {boolean}
 */
export function hasEdits(edits) {
  return edits.rotation !== 0 || edits.flipH || edits.flipV || edits.crop !== null;
}

/**
 * Apply edits to a loaded HTMLImageElement, returning a new canvas.
 * The returned canvas has the edited pixels at the source's native resolution
 * (or cropped sub-region), ready for the resize step.
 *
 * Pipeline order: rotate → flip → crop → (resize happens later)
 * Crop coordinates are relative to the rotated/flipped image — what you
 * see in the edit modal is what you get.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img - The EXIF-corrected image
 * @param {number} srcWidth - Width after EXIF correction
 * @param {number} srcHeight - Height after EXIF correction
 * @param {ImageEdits} edits
 * @returns {HTMLCanvasElement} Canvas with edits applied at source resolution
 */
export function applyEditsToCanvas(img, srcWidth, srcHeight, edits) {
  // Step 1: Rotate + flip the full source image
  const rotSwaps = edits.rotation === 90 || edits.rotation === 270;
  const rotatedW = rotSwaps ? srcHeight : srcWidth;
  const rotatedH = rotSwaps ? srcWidth : srcHeight;

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = rotatedW;
  fullCanvas.height = rotatedH;
  const fullCtx = fullCanvas.getContext('2d');

  fullCtx.save();
  fullCtx.translate(rotatedW / 2, rotatedH / 2);

  // Visual order: rotate then flip
  // Canvas order (reversed): scale first, then rotate
  const scaleX = edits.flipH ? -1 : 1;
  const scaleY = edits.flipV ? -1 : 1;
  if (edits.flipH || edits.flipV) {
    fullCtx.scale(scaleX, scaleY);
  }
  if (edits.rotation !== 0) {
    fullCtx.rotate((edits.rotation * Math.PI) / 180);
  }

  fullCtx.drawImage(img, -srcWidth / 2, -srcHeight / 2);
  fullCtx.restore();

  // Step 2: Crop from the rotated+flipped image
  if (edits.crop) {
    const cx = Math.round(edits.crop.x * rotatedW);
    const cy = Math.round(edits.crop.y * rotatedH);
    const cw = Math.round(edits.crop.w * rotatedW);
    const ch = Math.round(edits.crop.h * rotatedH);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cw;
    cropCanvas.height = ch;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(fullCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return cropCanvas;
  }

  return fullCanvas;
}

/**
 * Get the effective source dimensions after edits (rotate + flip + crop).
 * Used by the resize step to know what dimensions it's working with.
 *
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {ImageEdits} edits
 * @returns {{ width: number, height: number }}
 */
export function getEditedDimensions(srcWidth, srcHeight, edits) {
  // After rotation (flip doesn't change dimensions)
  const rotSwaps = edits.rotation === 90 || edits.rotation === 270;
  let w = rotSwaps ? srcHeight : srcWidth;
  let h = rotSwaps ? srcWidth : srcHeight;

  // Crop is relative to the rotated/flipped image
  if (edits.crop) {
    w = Math.round(edits.crop.w * w);
    h = Math.round(edits.crop.h * h);
  }

  return { width: w, height: h };
}
