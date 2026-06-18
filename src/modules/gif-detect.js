/**
 * gif-detect.js
 * Detects whether a GIF file contains multiple frames (is animated).
 *
 * Reads just enough of the binary to count Graphic Control Extension blocks
 * (0x21 0xF9), each of which precedes a frame. A GIF with 2+ frames is animated.
 * Only reads up to 256 KB to avoid blocking on very large files.
 */

/**
 * Check if a file is a GIF image
 * @param {File} file
 * @returns {boolean}
 */
export function isGifFile(file) {
  if (file.type === 'image/gif') return true;
  return file.name && file.name.toLowerCase().endsWith('.gif');
}

/**
 * Count GCE blocks in a GIF byte array.
 * Each Graphic Control Extension (0x21 0xF9) precedes a frame.
 * @param {Uint8Array} bytes
 * @param {boolean} [earlyExit=false] - If true, returns as soon as count >= 2
 * @returns {number} frame count
 */
function countGceBlocks(bytes, earlyExit = false) {
  let count = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
      count++;
      if (earlyExit && count >= 2) return count;
    }
  }
  return count;
}

/**
 * Detect whether a GIF file contains animation (multiple frames).
 * Scans for Graphic Control Extension markers (0x21 0xF9) in the binary.
 *
 * @param {File} file - A GIF file
 * @returns {Promise<boolean>} true if animated (2+ frames)
 */
export async function isAnimatedGif(file) {
  if (!isGifFile(file)) return false;

  // Read up to 256 KB — enough to detect animation in virtually all GIFs
  // without loading multi-MB files fully into memory.
  const maxBytes = 256 * 1024;
  const slice = file.slice(0, Math.min(file.size, maxBytes));
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Verify GIF signature (GIF87a or GIF89a)
  if (bytes.length < 6) return false;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (sig !== 'GIF') return false;

  return countGceBlocks(bytes, true) >= 2;
}

/**
 * Count the total number of frames in a GIF file.
 * Reads the full file (no early exit). Returns 0 for non-GIF or unreadable files.
 *
 * @param {File} file - A GIF file
 * @returns {Promise<number>} frame count
 */
export async function countGifFrames(file) {
  if (!isGifFile(file)) return 0;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 6) return 0;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (sig !== 'GIF') return 0;

  return countGceBlocks(bytes, false);
}
