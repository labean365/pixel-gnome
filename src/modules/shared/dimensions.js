/**
 * shared/dimensions.js
 * Pure helpers safe to import from both the main thread and the Web Worker.
 * No DOM APIs, no canvas APIs — just math + lookup tables.
 *
 * Previously duplicated between image-processor.js and process-worker.js.
 * Single source of truth lives here.
 */

/**
 * Resolve target output dimensions from the source dimensions and the
 * user's resize settings. All modes preserve aspect ratio except 'exact'.
 *
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {{
 *   mode: 'original' | 'fit-within' | 'max-long-edge' | 'exact',
 *   width?: number,
 *   height?: number,
 *   neverUpscale?: boolean,
 * }} settings
 * @returns {{ width: number, height: number }}
 */
export function calculateDimensions(srcWidth, srcHeight, settings) {
  const { mode, width: targetW, height: targetH, neverUpscale } = settings;

  switch (mode) {
    case 'original': {
      // Convert & compress only — never touch the pixel dimensions.
      return { width: srcWidth, height: srcHeight };
    }

    case 'fit-within': {
      const tw = targetW || Infinity;
      const th = targetH || Infinity;

      if (srcWidth <= tw && srcHeight <= th) {
        return { width: srcWidth, height: srcHeight };
      }

      const ratio = Math.min(tw / srcWidth, th / srcHeight);
      return {
        width: Math.round(srcWidth * ratio),
        height: Math.round(srcHeight * ratio),
      };
    }

    case 'max-long-edge': {
      const maxEdge = targetW;
      const longEdge = Math.max(srcWidth, srcHeight);

      if (longEdge <= maxEdge) {
        return { width: srcWidth, height: srcHeight };
      }

      const ratio = maxEdge / longEdge;
      return {
        width: Math.round(srcWidth * ratio),
        height: Math.round(srcHeight * ratio),
      };
    }

    case 'exact': {
      let w = targetW;
      let h = targetH || targetW;

      // In exact mode with neverUpscale, clamp to source while maintaining
      // the target aspect ratio.
      if (neverUpscale && (w > srcWidth || h > srcHeight)) {
        const targetAspect = w / h;
        const srcAspect = srcWidth / srcHeight;
        if (srcAspect > targetAspect) {
          // Source is wider — height is the constraint
          h = Math.min(h, srcHeight);
          w = Math.round(h * targetAspect);
        } else {
          // Source is taller — width is the constraint
          w = Math.min(w, srcWidth);
          h = Math.round(w / targetAspect);
        }
      }

      return { width: w, height: h };
    }

    default:
      return { width: srcWidth, height: srcHeight };
  }
}

/**
 * Map a format key to a MIME type. Unknown formats fall back to JPEG.
 * @param {'jpeg' | 'png' | 'webp' | 'avif' | 'gif'} format
 * @returns {string}
 */
export function getMimeType(format) {
  const map = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
  };
  return map[format] || 'image/jpeg';
}

/**
 * Check whether a blob's MIME type already matches the target output format,
 * used for lossless pass-through detection when no resize is needed.
 *
 * @param {string} blobType  Pass `blob.type` or `file.type`
 * @param {string} format    Target format key ('jpeg', 'png', etc.)
 */
export function isFormatMatch(blobType, format) {
  const typeMap = {
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    avif: ['image/avif'],
    gif: ['image/gif'],
  };
  return (typeMap[format] || []).includes(blobType);
}
