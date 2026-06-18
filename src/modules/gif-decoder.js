/**
 * GIF89a Binary Decoder
 *
 * A self-contained, vanilla JavaScript decoder for GIF87a and GIF89a animations.
 * Extracts individual frames as fully-composited RGBA ImageData objects with metadata.
 *
 * No external dependencies. Works with ArrayBuffer/Uint8Array for binary parsing and
 * LZW decompression. Handles:
 * - Global and Local Color Tables
 * - Graphic Control Extensions (delays, disposal methods, transparency)
 * - Interlaced frames (de-interlacing on decode)
 * - Frame compositing with disposal methods
 * - LZW decompression with variable-width code expansion
 *
 * @module gif-decoder
 */

/**
 * Decode an animated GIF file and extract all frames as composited ImageData.
 *
 * @param {File} file - A File object representing a GIF file
 * @returns {Promise<{width: number, height: number, frames: Array}>}
 *          Canvas dimensions and array of frame objects with imageData, delay, disposalMethod
 */
export async function decodeGifFrames(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  return decodeGifBuffer(bytes);
}

/**
 * Internal function to decode a GIF from a Uint8Array buffer.
 */
function decodeGifBuffer(bytes) {
  let pos = 0;

  // Parse header
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  const version = String.fromCharCode(bytes[3], bytes[4], bytes[5]);

  if (signature !== 'GIF') {
    throw new Error('Invalid GIF signature');
  }
  if (version !== '87a' && version !== '89a') {
    throw new Error(`Unsupported GIF version: ${version}`);
  }

  pos = 6;

  // Logical Screen Descriptor
  const width = bytes[pos] | (bytes[pos + 1] << 8);
  const height = bytes[pos + 2] | (bytes[pos + 3] << 8);
  const packed = bytes[pos + 4];
  const globalColorTableFlag = (packed >> 7) & 1;
  const colorResolution = ((packed >> 4) & 7) + 1;
  const sortFlag = (packed >> 3) & 1;
  const globalColorTableSize = 1 << ((packed & 7) + 1);
  const bgColorIndex = bytes[pos + 5];
  const pixelAspectRatio = bytes[pos + 6];

  pos += 7;

  // Read Global Color Table if present
  let globalColorTable = null;
  if (globalColorTableFlag) {
    globalColorTable = new Uint8Array(globalColorTableSize * 3);
    for (let i = 0; i < globalColorTableSize * 3; i++) {
      globalColorTable[i] = bytes[pos++];
    }
  }

  // Parse extension and image blocks
  const frames = [];
  let currentGCE = null;

  while (pos < bytes.length) {
    const separator = bytes[pos];

    if (separator === 0x21) {
      // Extension
      const label = bytes[pos + 1];
      pos += 2;

      if (label === 0xf9) {
        // Graphic Control Extension
        const blockSize = bytes[pos];
        pos++;

        const packed = bytes[pos];
        const disposalMethod = (packed >> 2) & 7;
        const userInputFlag = (packed >> 1) & 1;
        const transparencyFlag = packed & 1;

        const delayTime = bytes[pos + 1] | (bytes[pos + 2] << 8);
        const transparencyIndex = bytes[pos + 3];

        pos += 4;

        const terminator = bytes[pos];
        pos++;

        currentGCE = {
          disposalMethod,
          delayTime: delayTime * 10, // Convert to milliseconds
          transparencyIndex: transparencyFlag ? transparencyIndex : -1,
        };
      } else if (label === 0xff) {
        // Application Extension (e.g., NETSCAPE for looping)
        const blockSize = bytes[pos];
        pos += blockSize + 1;

        // Skip data sub-blocks
        while (pos < bytes.length && bytes[pos] !== 0) {
          const size = bytes[pos];
          pos += size + 1;
        }
        if (pos < bytes.length && bytes[pos] === 0) pos++;
      } else if (label === 0xfe || label === 0x01) {
        // Comment Extension or Plain Text Extension
        // Skip data sub-blocks
        while (pos < bytes.length && bytes[pos] !== 0) {
          const size = bytes[pos];
          pos += size + 1;
        }
        if (pos < bytes.length && bytes[pos] === 0) pos++;
      } else {
        // Unknown extension, skip it
        while (pos < bytes.length && bytes[pos] !== 0) {
          const size = bytes[pos];
          pos += size + 1;
        }
        if (pos < bytes.length && bytes[pos] === 0) pos++;
      }
    } else if (separator === 0x2c) {
      // Image Descriptor
      pos++;

      const frameLeft = bytes[pos] | (bytes[pos + 1] << 8);
      const frameTop = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const frameWidth = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const frameHeight = bytes[pos + 6] | (bytes[pos + 7] << 8);

      const packed = bytes[pos + 8];
      const localColorTableFlag = (packed >> 7) & 1;
      const interlaceFlag = (packed >> 6) & 1;
      const sortFlag = (packed >> 5) & 1;
      const localColorTableSize = localColorTableFlag ? 1 << ((packed & 7) + 1) : 0;

      pos += 9;

      // Read Local Color Table if present
      let localColorTable = null;
      if (localColorTableFlag) {
        localColorTable = new Uint8Array(localColorTableSize * 3);
        for (let i = 0; i < localColorTableSize * 3; i++) {
          localColorTable[i] = bytes[pos++];
        }
      }

      // Choose color table for this frame
      const colorTable = localColorTable || globalColorTable;
      const colorTableSize = localColorTable
        ? localColorTableSize
        : globalColorTableFlag
          ? globalColorTableSize
          : 0;

      // Read image data
      const minCodeSize = bytes[pos];
      pos++;

      const imageData = [];
      while (pos < bytes.length && bytes[pos] !== 0) {
        const blockSize = bytes[pos];
        pos++;
        for (let i = 0; i < blockSize; i++) {
          imageData.push(bytes[pos++]);
        }
      }
      if (pos < bytes.length && bytes[pos] === 0) pos++;

      // Try to decode this frame
      try {
        const pixelIndices = lzwDecode(imageData, minCodeSize, frameWidth, frameHeight);

        // De-interlace if needed
        const deinterlacedIndices = interlaceFlag
          ? deinterlace(pixelIndices, frameWidth, frameHeight)
          : pixelIndices;

        // Create frame object with compositing
        frames.push({
          pixelIndices: deinterlacedIndices,
          colorTable,
          colorTableSize,
          transparencyIndex: currentGCE ? currentGCE.transparencyIndex : -1,
          frameLeft,
          frameTop,
          frameWidth,
          frameHeight,
          delay: currentGCE ? currentGCE.delayTime : 100,
          disposalMethod: currentGCE ? currentGCE.disposalMethod : 0,
        });

        currentGCE = null;
      } catch (err) {
        console.warn('Failed to decode GIF frame:', err);
        currentGCE = null;
      }
    } else if (separator === 0x3b) {
      // Trailer
      break;
    } else {
      pos++;
    }
  }

  // Now composite frames
  const composited = compositeFrames(frames, width, height);

  return {
    width,
    height,
    frames: composited,
  };
}

/**
 * Composite frames with disposal method handling.
 * Each returned frame is a fully composited RGBA ImageData object.
 */
function compositeFrames(frames, canvasWidth, canvasHeight) {
  // Start with transparent canvas
  let canvas = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
  const previous = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);

  const result = [];

  for (const frame of frames) {
    // Render this frame onto canvas
    renderFrame(canvas, frame, canvasWidth, canvasHeight);

    // Create ImageData for output
    const imageDataArray = new Uint8ClampedArray(canvas);
    const imageData = new ImageData(imageDataArray, canvasWidth, canvasHeight);

    result.push({
      imageData,
      delay: frame.delay,
      disposalMethod: frame.disposalMethod,
    });

    // Handle disposal for next frame
    if (frame.disposalMethod === 2) {
      // Restore to background
      canvas = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
    } else if (frame.disposalMethod === 3) {
      // Restore to previous
      canvas = new Uint8ClampedArray(previous);
    }

    // Save current state for restoration
    if (frame.disposalMethod === 3) {
      previous.set(canvas);
    }
  }

  return result;
}

/**
 * Render a single frame onto the canvas buffer.
 */
function renderFrame(canvas, frame, canvasWidth, canvasHeight) {
  const {
    pixelIndices,
    colorTable,
    transparencyIndex,
    frameLeft,
    frameTop,
    frameWidth,
    frameHeight,
  } = frame;

  let pixelIndex = 0;
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const colorIndex = pixelIndices[pixelIndex];
      pixelIndex++;

      // Skip transparent pixels
      if (colorIndex === transparencyIndex) {
        continue;
      }

      const canvasX = frameLeft + x;
      const canvasY = frameTop + y;

      // Bounds check
      if (canvasX < 0 || canvasX >= canvasWidth || canvasY < 0 || canvasY >= canvasHeight) {
        continue;
      }

      const canvasIdx = (canvasY * canvasWidth + canvasX) * 4;

      if (colorTable && colorIndex < colorTable.length / 3) {
        const colorIdx = colorIndex * 3;
        canvas[canvasIdx] = colorTable[colorIdx]; // R
        canvas[canvasIdx + 1] = colorTable[colorIdx + 1]; // G
        canvas[canvasIdx + 2] = colorTable[colorIdx + 2]; // B
        canvas[canvasIdx + 3] = 255; // A
      }
    }
  }
}

/**
 * LZW decompression for GIF image data.
 * Implements standard GIF LZW variant with variable-width codes.
 */
function lzwDecode(dataBytes, minCodeSize, width, height) {
  const clearCode = 1 << minCodeSize;
  const eofCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;

  const totalBits = dataBytes.length * 8;

  const output = [];

  // Helper: initialize / reset the code table
  let table = [];
  function resetTable() {
    table = [];
    for (let i = 0; i < clearCode; i++) {
      table[i] = [i];
    }
    // Reserve slots for clear and EOF codes
    table[clearCode] = [];
    table[eofCode] = [];
    codeSize = minCodeSize + 1;
    maxCode = (1 << codeSize) - 1;
  }

  resetTable();

  // Create bit reader
  let bitPos = 0;

  function readCode() {
    if (bitPos + codeSize > totalBits) return eofCode; // Ran out of data
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIndex = bitPos >> 3; // floor(bitPos / 8)
      const bitIndex = bitPos & 7; // bitPos % 8
      code |= ((dataBytes[byteIndex] >> bitIndex) & 1) << i;
      bitPos++;
    }
    return code;
  }

  // Read first code — should be a clear code, but tolerate if it isn't
  let code = readCode();
  let prevCode = -1;

  if (code === clearCode) {
    // Expected start — read the next real code
    code = readCode();
    if (code === eofCode) {
      return new Uint8Array(width * height); // Empty frame
    }
    if (code < table.length && table[code]) {
      for (const v of table[code]) output.push(v);
    }
    prevCode = code;
  } else if (code !== eofCode) {
    // Non-standard: first code isn't clear. Treat it as data.
    if (code < table.length && table[code]) {
      for (const v of table[code]) output.push(v);
    }
    prevCode = code;
  }

  // Main decode loop
  const expectedLength = width * height;

  while (output.length < expectedLength) {
    code = readCode();

    if (code === eofCode) break;

    if (code === clearCode) {
      resetTable();
      prevCode = -1;
      continue;
    }

    let sequence;

    if (code < table.length && table[code]) {
      sequence = table[code];
    } else if (code === table.length && prevCode !== -1 && table[prevCode]) {
      // Special case: code not yet in table
      sequence = table[prevCode].slice();
      sequence.push(table[prevCode][0]);
    } else {
      // Invalid code — skip it instead of crashing
      prevCode = -1;
      continue;
    }

    for (const value of sequence) {
      output.push(value);
    }

    // Add new entry to table
    if (prevCode !== -1 && table[prevCode] && table.length < 4096) {
      const newSequence = table[prevCode].slice();
      newSequence.push(sequence[0]);
      table.push(newSequence);

      if (table.length > maxCode && codeSize < 12) {
        codeSize++;
        maxCode = (1 << codeSize) - 1;
      }
    }

    prevCode = code;
  }

  // Validate output length
  if (output.length !== expectedLength) {
    if (output.length < expectedLength) {
      while (output.length < expectedLength) output.push(0);
    } else {
      output.length = expectedLength;
    }
  }

  return new Uint8Array(output);
}

/**
 * De-interlace a frame according to GIF interlace pattern.
 * GIF interlace uses 4 passes with specific row patterns.
 */
function deinterlace(indices, width, height) {
  const result = new Uint8Array(indices.length);

  const passes = [
    { startRow: 0, rowIncrement: 8 },
    { startRow: 4, rowIncrement: 8 },
    { startRow: 2, rowIncrement: 4 },
    { startRow: 1, rowIncrement: 2 },
  ];

  let srcIndex = 0;

  for (const pass of passes) {
    for (let row = pass.startRow; row < height; row += pass.rowIncrement) {
      for (let col = 0; col < width; col++) {
        const destIndex = row * width + col;
        result[destIndex] = indices[srcIndex];
        srcIndex++;
      }
    }
  }

  return result;
}
