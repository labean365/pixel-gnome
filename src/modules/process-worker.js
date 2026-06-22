/**
 * process-worker.js
 * Web Worker for off-main-thread image processing.
 *
 * Phase 9: Uses OffscreenCanvas + createImageBitmap for resize and encode.
 * SVG and HEIC files are NOT supported in the worker (they need DOM APIs)
 * and must fall back to main-thread processing.
 *
 * Message protocol:
 *   IN:  { type: 'process', id, blob, settings, edits }
 *   OUT: { type: 'result', id, blob, outputWidth, outputHeight, outputSize }
 *   OUT: { type: 'error', id, message }
 *
 * Pure helpers (calculateDimensions, getMimeType, isFormatMatch) are shared
 * with the main thread via src/modules/shared/dimensions.js.
 * Smart compression reuses smart-compress.js, which feature-detects
 * OffscreenCanvas.convertToBlob so the same module works in both runtimes.
 */

import { calculateDimensions, getMimeType, isFormatMatch } from './shared/dimensions.js';
import { compressToTarget } from './smart-compress.js';

// Worker globals (`self`, `OffscreenCanvas`, `createImageBitmap`, etc.) come
// from the flat ESLint config's worker-globals override for *-worker.js files.

self.onmessage = async function (e) {
  const { type, id, blob, settings } = e.data;

  if (type !== 'process') return;

  try {
    const result = await processInWorker(blob, settings);
    self.postMessage(
      { type: 'result', id, ...result },
      [result.blob] // transfer the blob's underlying buffer if possible
    );
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || 'Worker processing failed' });
  }
};

/**
 * Process a single image blob in the worker context.
 * Simplified pipeline — no EXIF correction, no edits, no SVG/HEIC.
 * Those are handled on the main thread before dispatching to the worker.
 */
async function processInWorker(blob, settings) {
  // 1. Decode image to bitmap
  const bitmap = await createImageBitmap(blob);

  // Bitmap gets explicitly closed after drawImage (below) to free pixel memory
  // during encode. The finally guarantees close on any thrown path — ImageBitmap
  // buffers can be 100+ MB on high-megapixel photos and leak fast at 50-file batches.
  let bitmapClosed = false;
  const closeBitmap = () => {
    if (!bitmapClosed) {
      bitmap.close();
      bitmapClosed = true;
    }
  };

  try {
    const srcWidth = bitmap.width;
    const srcHeight = bitmap.height;

    // 2. Calculate target dimensions
    const target = calculateDimensions(srcWidth, srcHeight, settings);

    // 3. Lossless pass-through: no resize needed and same format
    if (
      target.width === srcWidth &&
      target.height === srcHeight &&
      isFormatMatch(blob.type, settings.format)
    ) {
      return {
        blob,
        outputWidth: srcWidth,
        outputHeight: srcHeight,
        outputSize: blob.size,
        lossless: true,
      };
    }

    // 4. Resize via OffscreenCanvas
    const canvas = new OffscreenCanvas(target.width, target.height);
    const ctx = canvas.getContext('2d');

    // JPEG has no alpha channel: encoding a transparent source would otherwise
    // fill the transparent areas with BLACK. Composite onto white first so
    // transparency flattens to white (as every other image tool does). Alpha-
    // capable outputs (PNG/WebP/AVIF) keep their transparency, so no fill there.
    if (settings.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.width, target.height);
    }

    if (settings.mode === 'exact' && (srcWidth !== target.width || srcHeight !== target.height)) {
      // Center-crop for exact mode
      const srcAspect = srcWidth / srcHeight;
      const targetAspect = target.width / target.height;
      let cropX, cropY, cropW, cropH;

      if (srcAspect > targetAspect) {
        cropH = srcHeight;
        cropW = srcHeight * targetAspect;
        cropX = (srcWidth - cropW) / 2;
        cropY = 0;
      } else {
        cropW = srcWidth;
        cropH = srcWidth / targetAspect;
        cropX = 0;
        cropY = (srcHeight - cropH) / 2;
      }

      ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, target.width, target.height);
    } else {
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    }

    // Early close: free pixel buffer before encode runs (saves memory per frame in batches)
    closeBitmap();

    // 5. Encode
    const mimeType = getMimeType(settings.format);

    // Smart compression (target size mode)
    if (settings.targetSizeKB && settings.targetSizeKB > 0 && settings.format !== 'png') {
      const targetBytes = settings.targetSizeKB * 1024;
      const result = await compressToTarget(canvas, mimeType, targetBytes);
      return {
        blob: result.blob,
        outputWidth: target.width,
        outputHeight: target.height,
        outputSize: result.blob.size,
        achievedQuality: result.quality,
        smartCompress: true,
        belowTarget: result.belowTarget !== false,
      };
    }

    const quality = settings.format === 'png' ? undefined : settings.quality;
    const outputBlob = await canvas.convertToBlob({ type: mimeType, quality });

    return {
      blob: outputBlob,
      outputWidth: target.width,
      outputHeight: target.height,
      outputSize: outputBlob.size,
    };
  } finally {
    // Safety net: any early return or thrown error still releases the bitmap.
    closeBitmap();
  }
}

// Helpers are imported from shared/dimensions.js and smart-compress.js.
