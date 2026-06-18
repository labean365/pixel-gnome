/**
 * heic-decoder.js
 * HEIC/HEIF → JPEG/PNG conversion via heic-to.
 * Runs on the main thread (Phase 2). Phase 3 can optionally move this to a Web Worker.
 *
 * heic-to uses libheif 1.21.2 compiled to WASM — compatible with modern
 * iPhone HEIC files (iPhone 14/15/16, iOS 17+).
 *
 * Replaces heic2any which bundled an outdated libheif that failed on
 * newer HEIC containers with "ERR_LIBHEIF Heic doesn't contain valid images".
 *
 * Decode time: ~2-4 seconds per 12MP image on a mid-range laptop.
 * The WASM is loaded lazily on first use.
 */

import { heicTo, isHeic as heicToIsHeic } from 'heic-to';

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);

/**
 * Check if a file is HEIC/HEIF format (fast check by extension/MIME).
 * For ambiguous cases, use validateHeic() which reads the file header.
 * @param {File} file
 * @returns {boolean}
 */
export function isHeicFile(file) {
  if (HEIC_TYPES.has(file.type)) return true;
  // Some OSes (Windows, some Android) report empty MIME for HEIC — fall back to extension
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return HEIC_EXTENSIONS.has(ext);
}

/**
 * Decode a HEIC file to a JPEG Blob.
 *
 * @param {File|Blob} file - The HEIC file
 * @param {number} quality - JPEG quality (0-1), default 0.92 (high quality intermediate)
 * @returns {Promise<Blob>} Decoded JPEG blob
 */
export async function decodeHeic(file, quality = 0.92) {
  try {
    const result = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality,
    });

    // heicTo returns a single Blob
    if (!result || result.size === 0) {
      throw new Error('Decoder returned an empty result.');
    }

    return result;
  } catch (err) {
    const msg = err.message || 'unknown error';

    // Provide actionable error messages for common failures
    if (msg.includes('libheif') || msg.includes('ERR_')) {
      throw new Error(
        'HEIC decode failed — this file may use an unsupported codec. ' +
          "Try converting to JPEG with your phone's share menu or the macOS Preview app.",
        { cause: err }
      );
    }

    throw new Error(`HEIC decode failed: ${msg}`, { cause: err });
  }
}
