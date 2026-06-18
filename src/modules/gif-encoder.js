/**
 * GIF89a Binary Encoder
 *
 * A pure JavaScript implementation of the GIF89a image format specification.
 * Encodes animated GIF files from a series of frames without external dependencies.
 *
 * Features:
 * - GIF89a format with proper headers and application extensions
 * - Median-cut color quantization to 256-color palettes per frame
 * - LZW compression for image data
 * - Netscape looping extension
 * - Per-frame transparency support
 *
 * @module gif-encoder
 */

/**
 * Encodes an array of frames into an animated GIF89a file
 * @param {Array<{imageData: ImageData, delay: number}>} frames - Array of frame objects
 * @param {number} width - Output canvas width in pixels
 * @param {number} height - Output canvas height in pixels
 * @param {Object} options - Configuration options
 * @param {number} [options.loop=0] - Loop count (0 = infinite, N = loop N times)
 * @returns {Blob} GIF89a file as a Blob with type 'image/gif'
 */
export function encodeAnimatedGif(frames, width, height, options = {}) {
  const { loop = 0 } = options;

  if (!frames || frames.length === 0) {
    throw new Error('encodeAnimatedGif: at least one frame is required');
  }

  const encoder = new GifEncoder(width, height, loop);
  frames.forEach((frame) => {
    encoder.addFrame(frame.imageData, frame.delay);
  });

  return encoder.render();
}

class GifEncoder {
  constructor(width, height, loop) {
    this.width = width;
    this.height = height;
    this.loop = loop;
    this.frames = [];
  }

  addFrame(imageData, delay) {
    this.frames.push({
      imageData,
      delay: Math.max(2, Math.round(delay / 10)), // Convert ms to centiseconds, min 20ms
      palette: null,
      transparencyIndex: -1,
      indexedPixels: null,
    });
  }

  render() {
    if (this.frames.length === 0) {
      throw new Error('GifEncoder: no frames added');
    }

    // Process each frame: quantize colors and LZW-compress
    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      const { palette, transparencyIndex, indexedPixels } = this._quantizeFrame(frame.imageData);
      frame.palette = palette;
      frame.transparencyIndex = transparencyIndex;
      frame.indexedPixels = indexedPixels;
    }

    // Build the full GIF binary using a dynamic byte buffer
    const out = new ByteStream();

    // ── Header ──
    out.writeString('GIF89a');

    // ── Logical Screen Descriptor ──
    this._writeLogicalScreenDescriptor(out);

    // ── Netscape Application Extension (looping) ──
    if (this.frames.length > 1) {
      this._writeNetscapeExtension(out);
    }

    // ── Frames ──
    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i];
      this._writeGraphicControlExtension(out, frame);
      this._writeImageDescriptor(out, frame);
      this._writeImageData(out, frame);
    }

    // ── Trailer ──
    out.writeByte(0x3b);

    return new Blob([out.toUint8Array()], { type: 'image/gif' });
  }

  // ─── Logical Screen Descriptor + Global Color Table ───────────────────

  _writeLogicalScreenDescriptor(out) {
    // Canvas dimensions (little-endian)
    out.writeUint16LE(this.width);
    out.writeUint16LE(this.height);

    // Packed field:
    //   bit 7     = Global Color Table Flag (1)
    //   bits 6-4  = Color Resolution - 1 (7 → 8 bits per primary)
    //   bit 3     = Sort Flag (0)
    //   bits 2-0  = Size of GCT (7 → 2^(7+1) = 256 entries)
    out.writeByte(0xf7);

    // Background color index
    out.writeByte(0);

    // Pixel aspect ratio (0 = not specified)
    out.writeByte(0);

    // Global Color Table — 256 RGB entries from first frame's palette
    const palette = this.frames[0].palette;
    for (let i = 0; i < 256; i++) {
      if (i < palette.length) {
        const c = palette[i];
        out.writeByte((c >> 16) & 0xff);
        out.writeByte((c >> 8) & 0xff);
        out.writeByte(c & 0xff);
      } else {
        out.writeByte(0);
        out.writeByte(0);
        out.writeByte(0);
      }
    }
  }

  // ─── Netscape 2.0 Application Extension (loop control) ───────────────

  _writeNetscapeExtension(out) {
    out.writeByte(0x21); // Extension Introducer
    out.writeByte(0xff); // Application Extension Label
    out.writeByte(11); // Block Size

    out.writeString('NETSCAPE2.0');

    out.writeByte(3); // Sub-block size
    out.writeByte(1); // Sub-block index
    out.writeUint16LE(this.loop); // Loop count (0 = infinite)
    out.writeByte(0); // Block Terminator
  }

  // ─── Graphic Control Extension ────────────────────────────────────────

  _writeGraphicControlExtension(out, frame) {
    out.writeByte(0x21); // Extension Introducer
    out.writeByte(0xf9); // Graphic Control Label
    out.writeByte(4); // Block Size

    const hasTransparency = frame.transparencyIndex >= 0;
    // Packed: disposal method 2 (restore to background) + transparency flag
    const packed = (2 << 2) | (hasTransparency ? 1 : 0);
    out.writeByte(packed);

    // Delay time in centiseconds (little-endian)
    out.writeUint16LE(frame.delay);

    // Transparent color index
    out.writeByte(hasTransparency ? frame.transparencyIndex : 0);

    out.writeByte(0); // Block Terminator
  }

  // ─── Image Descriptor + Local Color Table ────────────────────────────

  _writeImageDescriptor(out, frame) {
    out.writeByte(0x2c); // Image Separator
    out.writeUint16LE(0); // Left
    out.writeUint16LE(0); // Top
    out.writeUint16LE(this.width);
    out.writeUint16LE(this.height);

    // Packed field:
    //   bit 7     = Local Color Table Flag (1 = present)
    //   bit 6     = Interlace Flag (0)
    //   bit 5     = Sort Flag (0)
    //   bits 4-3  = Reserved (0)
    //   bits 2-0  = Size of LCT (7 → 2^(7+1) = 256 entries)
    out.writeByte(0x87); // 10000111 = LCT present, 256 entries

    // Local Color Table — 256 RGB entries from this frame's palette
    const palette = frame.palette;
    for (let i = 0; i < 256; i++) {
      if (i < palette.length) {
        const c = palette[i];
        out.writeByte((c >> 16) & 0xff);
        out.writeByte((c >> 8) & 0xff);
        out.writeByte(c & 0xff);
      } else {
        out.writeByte(0);
        out.writeByte(0);
        out.writeByte(0);
      }
    }
  }

  // ─── Image Data (LZW Minimum Code Size + Sub-blocks) ──────────────────

  _writeImageData(out, frame) {
    const minCodeSize = 8; // Always 8 for 256-color palette
    out.writeByte(minCodeSize);

    // LZW compress the indexed pixel data
    const compressed = this._lzwCompress(frame.indexedPixels, minCodeSize);

    // Write as sub-blocks (max 255 bytes each)
    let offset = 0;
    while (offset < compressed.length) {
      const blockSize = Math.min(255, compressed.length - offset);
      out.writeByte(blockSize);
      for (let i = 0; i < blockSize; i++) {
        out.writeByte(compressed[offset + i]);
      }
      offset += blockSize;
    }

    out.writeByte(0); // Block Terminator
  }

  // ─── LZW Compression ──────────────────────────────────────────────────

  _lzwCompress(indexedPixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eofCode = clearCode + 1;

    const bitWriter = new BitWriter();

    let codeSize = minCodeSize + 1;
    let nextCode = eofCode + 1;

    // Dictionary: maps sequences of pixel indices to codes.
    // Keys use comma-separated indices to avoid collision
    // (e.g., "1,0" vs "10" are distinct).
    const dict = new Map();

    // Initialize with single-pixel entries
    for (let i = 0; i < clearCode; i++) {
      dict.set(String(i), i);
    }

    // Emit clear code to start
    bitWriter.write(clearCode, codeSize);

    if (indexedPixels.length === 0) {
      bitWriter.write(eofCode, codeSize);
      return new Uint8Array(bitWriter.flush());
    }

    let w = String(indexedPixels[0]);

    for (let i = 1; i < indexedPixels.length; i++) {
      const k = String(indexedPixels[i]);
      const wk = w + ',' + k;

      if (dict.has(wk)) {
        w = wk;
      } else {
        // Emit code for w
        bitWriter.write(dict.get(w), codeSize);

        if (nextCode < 4096) {
          dict.set(wk, nextCode);
          // Check if we need to increase code size AFTER adding
          if (nextCode >= 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          // Dictionary full — emit clear code and reset
          bitWriter.write(clearCode, codeSize);
          dict.clear();
          for (let j = 0; j < clearCode; j++) {
            dict.set(String(j), j);
          }
          nextCode = eofCode + 1;
          codeSize = minCodeSize + 1;
        }

        w = k;
      }
    }

    // Emit code for remaining sequence
    if (w.length > 0) {
      bitWriter.write(dict.get(w), codeSize);
    }

    // Emit EOF code
    bitWriter.write(eofCode, codeSize);

    return new Uint8Array(bitWriter.flush());
  }

  // ─── Color Quantization (Median Cut) ──────────────────────────────────

  _quantizeFrame(imageData) {
    const pixels = imageData.data;
    const pixelCount = imageData.width * imageData.height;

    // Collect unique opaque colors and detect transparency
    let hasTransparency = false;
    const colorSet = new Map(); // key → {r,g,b,count}

    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (a < 128) {
        hasTransparency = true;
        continue;
      }
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const key = (r << 16) | (g << 8) | b;
      if (colorSet.has(key)) {
        colorSet.get(key).count++;
      } else {
        colorSet.set(key, { r, g, b, count: 1 });
      }
    }

    // Build color array for quantization
    const colors = [];
    for (const c of colorSet.values()) {
      colors.push(c);
    }

    // Reserve index 0 for transparency if needed
    const maxPaletteColors = hasTransparency ? 255 : 256;
    const quantized = this._medianCut(colors, maxPaletteColors);

    // Build final 256-entry palette
    const palette = new Array(256).fill(0x000000);
    const startIdx = hasTransparency ? 1 : 0;
    for (let i = 0; i < quantized.length && startIdx + i < 256; i++) {
      palette[startIdx + i] = quantized[i];
    }

    // Build a lookup cache for nearest-color matching
    const nearestCache = new Map();

    // Map each pixel to a palette index
    const indexedPixels = new Uint8Array(pixelCount);
    let pi = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (a < 128) {
        indexedPixels[pi++] = 0; // Transparent index
        continue;
      }

      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const colorKey = (r << 16) | (g << 8) | b;

      let idx;
      if (nearestCache.has(colorKey)) {
        idx = nearestCache.get(colorKey);
      } else {
        idx = this._findNearest(r, g, b, palette, startIdx);
        nearestCache.set(colorKey, idx);
      }
      indexedPixels[pi++] = idx;
    }

    return {
      palette,
      transparencyIndex: hasTransparency ? 0 : -1,
      indexedPixels,
    };
  }

  _findNearest(r, g, b, palette, startIdx) {
    let bestIdx = startIdx;
    let bestDist = Infinity;

    for (let i = startIdx; i < palette.length; i++) {
      const c = palette[i];
      const pr = (c >> 16) & 0xff;
      const pg = (c >> 8) & 0xff;
      const pb = c & 0xff;
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist === 0) return i; // Exact match — early exit
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  _medianCut(colors, maxColors) {
    if (colors.length === 0) {
      return [0x000000];
    }

    if (colors.length <= maxColors) {
      return colors.map((c) => (c.r << 16) | (c.g << 8) | c.b);
    }

    // Start with all colors in one bucket
    let buckets = [colors.slice()];

    while (buckets.length < maxColors) {
      // Find the bucket with the largest color range that can be split
      let bestIdx = -1;
      let bestRange = 0;

      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].length <= 1) continue;
        const range = this._bucketRange(buckets[i]);
        if (range > bestRange) {
          bestRange = range;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break; // No splittable buckets left

      // Determine which channel has the widest range
      const bucket = buckets[bestIdx];
      const { rRange, gRange, bRange } = this._bucketRanges(bucket);

      let axis;
      if (rRange >= gRange && rRange >= bRange) axis = 'r';
      else if (gRange >= bRange) axis = 'g';
      else axis = 'b';

      // Sort by that axis and split at median
      bucket.sort((a, b) => a[axis] - b[axis]);
      const mid = Math.floor(bucket.length / 2);
      const left = bucket.slice(0, mid);
      const right = bucket.slice(mid);

      buckets[bestIdx] = left;
      buckets.push(right);
    }

    // Average each bucket to get the palette color
    return buckets.map((bucket) => {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        total = 0;
      for (const c of bucket) {
        const w = c.count || 1;
        rSum += c.r * w;
        gSum += c.g * w;
        bSum += c.b * w;
        total += w;
      }
      const r = Math.round(rSum / total);
      const g = Math.round(gSum / total);
      const b = Math.round(bSum / total);
      return (r << 16) | (g << 8) | b;
    });
  }

  _bucketRange(bucket) {
    const { rRange, gRange, bRange } = this._bucketRanges(bucket);
    return Math.max(rRange, gRange, bRange);
  }

  _bucketRanges(bucket) {
    let minR = 255,
      maxR = 0;
    let minG = 255,
      maxG = 0;
    let minB = 255,
      maxB = 0;

    for (const c of bucket) {
      if (c.r < minR) minR = c.r;
      if (c.r > maxR) maxR = c.r;
      if (c.g < minG) minG = c.g;
      if (c.g > maxG) maxG = c.g;
      if (c.b < minB) minB = c.b;
      if (c.b > maxB) maxB = c.b;
    }

    return {
      rRange: maxR - minR,
      gRange: maxG - minG,
      bRange: maxB - minB,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Variable-width bit packer for LZW output.
 * Packs codes at varying bit widths into a byte stream.
 */
class BitWriter {
  constructor() {
    this.bytes = [];
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  write(value, numBits) {
    this.bitBuffer |= (value & ((1 << numBits) - 1)) << this.bitCount;
    this.bitCount += numBits;

    while (this.bitCount >= 8) {
      this.bytes.push(this.bitBuffer & 0xff);
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  flush() {
    if (this.bitCount > 0) {
      this.bytes.push(this.bitBuffer & 0xff);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return this.bytes;
  }
}

/**
 * Growable byte buffer for building the GIF binary.
 */
class ByteStream {
  constructor() {
    this.chunks = [];
    this.current = new Uint8Array(4096);
    this.pos = 0;
  }

  writeByte(b) {
    if (this.pos >= this.current.length) this._flush();
    this.current[this.pos++] = b & 0xff;
  }

  writeUint16LE(val) {
    this.writeByte(val & 0xff);
    this.writeByte((val >> 8) & 0xff);
  }

  writeString(str) {
    for (let i = 0; i < str.length; i++) {
      this.writeByte(str.charCodeAt(i));
    }
  }

  _flush() {
    this.chunks.push(this.current.slice(0, this.pos));
    this.current = new Uint8Array(4096);
    this.pos = 0;
  }

  toUint8Array() {
    this._flush();
    const totalLen = this.chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
