/**
 * en.js — English locale (source of truth for the key tree).
 *
 * Keys are stable identifiers; only the string VALUES get translated in other
 * locales. Plural entries use { one, other } and are selected by a `count` var
 * passed to t(). Keep this tree and it.js (and any future locale) in sync.
 */
export default {
  header: {
    tagline: 'Private, in-browser image & PDF tools — nothing leaves your device.',
    helpTitle: 'Help & Changelog',
    helpAria: 'Help and changelog',
    themeTitle: 'Toggle dark mode',
    themeAria: 'Toggle dark mode',
    langTitle: 'Language',
    langAria: 'Choose language',
  },

  errs: {
    summary: {
      one: 'Something went wrong — {count} error logged.',
      other: 'Something went wrong — {count} errors logged.',
    },
    details: 'Details',
    hideDetails: 'Hide',
    report: 'Email report',
    dismiss: 'Dismiss',
  },

  step1: { title: 'Add images' },

  dropzone: {
    aria: 'Drop images or PDFs here or click to browse. Accepts JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF, and PDF files.',
    text: 'Drop images or PDFs here',
    hint: 'or click to browse',
    formats: 'JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF, PDF',
    fileInputAria: 'Choose image or PDF files',
  },

  pdf: {
    dialogAria: 'PDF optimization',
    title: 'Optimize PDF',
    close: 'Close',
    closeAria: 'Close PDF optimizer',
    loading: 'Reading PDF…',
    pages: { one: '{count} page', other: '{count} pages' },
    textPreserved: 'Text preserved',
    textPreservedHint: 'This PDF has a text layer — it stays selectable after optimizing.',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    pageOf: 'Page {n} of {total}',
    previewAlt: 'Preview of page {n}',
    previewFail: 'Preview unavailable',
    presetsAria: 'Compression preset',
    preset: { email: 'Email', web: 'Web', max: 'Max quality' },
    advanced: 'Advanced',
    quality: 'Image quality',
    opt: {
      recompress: 'Recompress images',
      stripMeta: 'Strip metadata',
      subsetFonts: 'Subset fonts',
      garbage: 'Garbage-collect',
    },
    optimize: 'Optimize',
    optimizing: 'Optimizing…',
    progress: 'Optimizing images… {done}/{total}',
    download: 'Download',
    result: '{from} → {to} · {pct}% smaller',
    noReduction: 'Already optimized — no further reduction.',
    onePerRun: 'One PDF at a time — optimizing the first; others were skipped.',
    errorRead: "Couldn't read that PDF file.",
    errorEngine: 'The PDF engine failed to load.',
    errorGeneric: 'Something went wrong optimizing the PDF.',
    errorUnsupported: 'PDF optimization isn’t available in this build.',
    modeAria: 'Choose what to do with this PDF',
    mode: { compress: 'Compress', organize: 'Organize', merge: 'Merge', toImages: 'To Images' },
    org: {
      operation: 'Operation',
      opExtract: 'Extract selected pages',
      opRemove: 'Remove selected pages',
      opSplit: 'Split into multiple files',
      hint: {
        extract: 'Select the pages to include in the new PDF.',
        remove: 'Select the pages to remove — the rest are kept.',
        split: 'Choose how to split the file below.',
      },
      selectAll: 'Select all',
      clear: 'Clear',
      selectedCount: { one: '{count} page selected', other: '{count} pages selected' },
      pageLabel: 'Page {n}',
      splitMode: 'Split',
      splitEach: 'Each page separately',
      splitRanges: 'Custom ranges',
      ranges: 'Ranges',
      rangesHint: 'e.g. 1-3, 5, 8-10',
      build: 'Build',
      buildOp: { extract: 'Extract pages', remove: 'Remove pages', split: 'Split PDF' },
      building: 'Building…',
      doneSingle: { one: 'Done — {count} page · {size}', other: 'Done — {count} pages · {size}' },
      doneSplit: { one: 'Done — {count} file · {size}', other: 'Done — {count} files · {size}' },
      errNoSelection: 'Select at least one page first.',
      errRemoveAll: 'That would remove every page — keep at least one.',
      errSplitOne: 'This PDF has only one page — nothing to split.',
      errRanges: 'Enter ranges like “1-3, 5, 8-10”.',
      errRangeOob: 'Ranges must be between 1 and {total}.',
    },
    merge: {
      hint: 'Add PDFs and arrange them — they’ll be combined top to bottom into one file.',
      summary: 'Combining {files} PDFs · {pages} pages total.',
      add: '+ Add PDFs',
      build: 'Merge PDFs',
      building: 'Merging…',
      moveUp: 'Move up',
      moveDown: 'Move down',
      remove: 'Remove {name}',
      removeShort: 'Remove',
      reading: 'Reading PDFs…',
      done: { one: 'Merged — {count} page · {size}', other: 'Merged — {count} pages · {size}' },
      errFile: 'Couldn’t add “{name}” — not a readable PDF.',
    },
    img: {
      errNone: 'No processed images to combine into a PDF.',
    },
    img2: {
      hint: 'Render every page to an image. Pick a format and resolution.',
      format: 'Format',
      resolution: 'Resolution',
      dpiScreen: 'Screen',
      dpiStandard: 'Standard',
      dpiPrint: 'Print',
      downloadZip: 'Download ZIP',
      sendToEditor: 'Send to editor',
      rendering: 'Rendering pages… {done}/{total}',
      zipping: 'Packaging…',
      done: { one: 'Rendered {count} page.', other: 'Rendered {count} pages.' },
      sent: {
        one: 'Sent {count} page to the editor.',
        other: 'Sent {count} pages to the editor.',
      },
      noEditor: 'Can’t send to the editor right now.',
    },
  },

  privacyNote: 'Images are processed locally in your browser — nothing is uploaded or stored.',

  svgPaste: {
    toggle: 'Paste SVG Code',
    placeholder: 'Paste SVG markup here, e.g. <svg viewBox="0 0 24 24">...</svg>',
    convert: 'Convert to Image',
    clear: 'Clear',
  },

  step2: { title: 'Choose a size' },

  preset: {
    label: 'Preset',
    groupWeb: 'Web',
    groupSocial: 'Social',
    groupEmail: 'Email',
    fullHd: 'Full HD — 1920 × 1080',
    largeWeb: 'Large Web — 1600 px',
    thumbnail: 'Thumbnail — 800 × 800 (fit)',
    squareSocial: 'Social Square — 1080 × 1080 · 1:1',
    portraitSocial: 'Social Portrait — 1080 × 1350 · 4:5',
    storySocial: 'Story / Reel — 1080 × 1920 · 9:16',
    landscapeSocial: 'Social Landscape — 1200 × 675 · 16:9',
    openGraph: 'Open Graph / Link Preview — 1200 × 630 · 1.90:1',
    youtubeThumb: 'YouTube Thumbnail — 1280 × 720 · 16:9',
    pinterestPin: 'Pinterest Pin — 1000 × 1500 · 2:3',
    profileAvatar: 'Profile Avatar — 800 × 800 (crop) · 1:1',
    emailHero: 'Email Hero — 600 px wide',
    emailRetina: 'Email Retina — 1200 px wide',
    custom: 'Custom',
    save: 'Save Preset',
    saveTitle: 'Save current settings as a preset',
    deleteTitle: 'Delete saved preset',
    deleteAria: 'Delete preset',
    exportTitle: 'Export presets as JSON',
    exportAria: 'Export presets',
    importTitle: 'Import presets from JSON',
    importAria: 'Import presets',
  },

  customize: { summary: 'Customize size, format & quality' },

  mode: {
    legend: 'Mode',
    original: 'Keep original size (no resize)',
    originalTip:
      'Keeps the original pixel dimensions — only converts format and reduces file weight',
    fit: 'Fit within box',
    fitTip: 'Scales image to fit inside the target width and height, preserving aspect ratio',
    longEdge: 'Max long edge',
    longEdgeTip: 'Scales the longest side to the target value, preserving aspect ratio',
    exact: 'Exact dimensions (crop)',
    exactTip: 'Resizes and center-crops to exact target dimensions',
  },

  dimensions: {
    label: 'Width / Height (px)',
    w: 'W',
    h: 'H',
    widthAria: 'Target width in pixels',
    heightAria: 'Target height in pixels',
  },

  output: {
    heading: 'Output',
    formatLabel: 'Format',
    qualityLabel: 'Quality:',
    targetSize: 'Target file size',
    targetSizeTip: 'Iteratively adjusts quality to hit a target file size (JPEG/WebP/AVIF only)',
    targetSizeAria: 'Target file size in KB',
    filenameLabel: 'Filename Pattern',
    filenameTokens: 'Tokens: {name} {width} {height} {preset} {format} {breakpoint}',
    multiSize: 'Multi-size export',
    multiSizeTip: 'Generate multiple size variants from each image, bundled as a ZIP',
    breakpointLabel: 'Breakpoint set',
    bpWebStandard: 'Web Standard (320, 640, 1024, 1920)',
    bpRetina: 'Retina Web (640, 1280, 1920, 2560)',
    bpThumbnails: 'Thumbnails (100, 200, 400, 800)',
    bpSocial: 'Social Media (400, 800, 1080, 1200)',
    bpCustom: 'Custom',
    customSizesPlaceholder: 'e.g. 320, 640, 1024, 1920',
    customSizesAria: 'Custom breakpoint sizes',
  },

  processing: {
    heading: 'Processing',
    stripExif: 'Strip EXIF metadata',
    stripExifTip: 'Removes camera info, GPS, and other metadata from output',
    neverUpscale: 'Never upscale images',
    neverUpscaleTip: 'Prevents output from exceeding source dimensions',
    reset: 'Reset to Defaults',
    resetTip: 'Clear saved settings and revert to defaults',
  },

  step3: {
    title: 'Export',
    download: 'Download',
    downloadTip: 'Download all processed images',
    zip: 'ZIP',
    zipTip: 'Download all images as a single ZIP',
    meta: 'Ready after step 1',
  },

  empty: {
    aria: 'Get started',
    dropAria: 'Drop images or PDFs here or click to choose files',
    title: 'Drop images to resize, or a PDF to optimize',
    sub: 'They never leave your browser. Or press <kbd class="content-empty-kbd">⌘O</kbd> to choose files.',
    chipsAria: 'Start with a preset',
    chipPdf: 'Optimize a PDF',
    chipConvert: 'Convert & compress',
    chipFullHd: 'Full HD',
    chipSquare: 'Social Square',
    chipEmail: 'Email Hero',
  },

  preview: {
    aria: 'Processed images',
    heading: 'Preview',
    actionsAria: 'Image actions',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    clearAll: 'Clear All',
    clearAllTip: 'Remove all images from the queue',
    responsiveZip: 'Responsive ZIP',
    responsiveZipTip: 'Export all images at multiple sizes as a ZIP',
    downloadZip: 'Download ZIP',
    downloadZipTip: 'Export all images as a single ZIP archive',
    downloadPdf: 'PDF',
    downloadPdfTip: 'Combine all images into one PDF (one image per page)',
    download: 'Download',
    downloadTip: 'Download all processed images individually',
    progressAria: 'Batch processing progress',
  },

  bulk: {
    aria: 'Bulk actions for selected images',
    rotateLeft: 'Rotate Left',
    rotateLeftTip: 'Rotate selected images 90° counter-clockwise',
    rotateLeftAria: 'Rotate selected left',
    rotateRight: 'Rotate Right',
    rotateRightTip: 'Rotate selected images 90° clockwise',
    rotateRightAria: 'Rotate selected right',
    flipH: 'Flip H',
    flipHTip: 'Mirror selected images horizontally',
    flipHAria: 'Flip selected horizontally',
    flipV: 'Flip V',
    flipVTip: 'Mirror selected images vertically',
    flipVAria: 'Flip selected vertically',
    download: 'Download',
    downloadTip: 'Download selected images individually',
    downloadAria: 'Download selected images',
    zip: 'ZIP',
    zipTip: 'Bundle selected images into a single ZIP archive',
    zipAria: 'Download selected images as ZIP',
    delete: 'Delete',
    deleteTip: 'Remove selected images from the queue (Delete / Backspace)',
    deleteAria: 'Delete selected images',
    deselect: 'Deselect',
  },

  footer: {
    privacy: 'Privacy',
    support: 'Support',
    feedback: 'Feedback',
    source: 'Source',
    cookies: 'Cookie settings',
    versionTitle: 'View changelog',
    versionAria: 'View changelog',
    credit:
      'A tool by <a href="https://321enterprise.com/" target="_blank" rel="noopener noreferrer">321Enterprise</a>. Need a custom browser tool like this? <a href="https://321enterprise.com/index.html#contact" target="_blank" rel="noopener noreferrer">Get in touch</a>.',
  },

  // ---- Dynamic strings (toasts, screen-reader announcements) ----
  toast: {
    copied: 'Copied!',
    storageUnavailable:
      'Storage is unavailable in this browser mode — your settings, presets, and history will not persist between visits.',
    presetSaved: 'Preset "{name}" saved.',
    presetDeleted: 'Preset "{name}" deleted.',
    noPresetsExport: 'No custom presets to export.',
    noValidPresets: 'No valid presets found in file.',
    presetsExported: { one: 'Exported {count} preset.', other: 'Exported {count} presets.' },
    presetsImported: { one: 'Imported {count} preset.', other: 'Imported {count} presets.' },
    importFailed: 'Failed to import presets. Invalid JSON file.',
    settingsReset: 'Settings reset to defaults.',
    settingsRestored: 'Settings restored.',
    pasteSvgFirst: 'Paste SVG code first.',
    noSvgTag: 'No <svg> tag found in the pasted code.',
    svgConverted: 'SVG converted and added to queue.',
    svgFailed: 'Failed to process SVG code.',
    decodingHeic: 'Decoding "{name}" — HEIC files take a few seconds...',
    failedItem: 'Failed: {name} — {message}',
    processed: 'Processed {success} of {total} images.',
    reprocessFailed: 'Re-processing failed. Try clearing and re-adding images.',
    noImageCopy: 'No processed image to copy.',
    copiedToClipboard: 'Copied "{name}" to clipboard.',
    copyFailed: 'Failed to copy — browser may not support clipboard images.',
    removed: { one: 'Removed {count} image.', other: 'Removed {count} images.' },
    noToDownload: 'No {subject} images to download.',
    noToExport: 'No {subject} images to export.',
    zipFailed: 'ZIP export failed: {message}',
    noImagesExport: 'No images to export.',
    noBreakpoints: 'No breakpoints configured for responsive export.',
    responsiveFailed: 'Responsive export failed: {message}',
    editFailed: 'Edit failed: {name} — {message}',
    revertedOriginal: 'Reverted to original.',
    noneSelected: 'No images selected.',
    stillProcessing: 'Still processing — try again in a moment.',
    loadingEdit: 'Loading image for editing...',
    heicEditFailed: 'Could not load HEIC image for editing.',
    svgEditFailed: 'Could not load SVG image for editing.',
    undo: 'Undo',
    subjectSelected: 'selected',
    subjectProcessed: 'processed',
    megapixelWarn: '"{name}" is {mp}MP — this may be slow or use a lot of memory.',
    unsupportedType:
      'Unsupported file type: {names}. Accepted formats: JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF.',
    andMore: 'and {count} more',
    largeBatch: '{count} files dropped — batches over {max} may be slow. Processing anyway.',
    animatedGifWarn: '"{name}" is animated — set output format to GIF to preserve animation.',
    apngWarn:
      '"{name}" is an animated PNG (APNG) — animation will be lost; only the first frame will be exported.',
    animatedWebpWarn:
      '"{name}" is an animated WebP — animation will be lost; only the first frame will be exported.',
    unexpectedError: 'An unexpected error occurred during processing. Try again or clear images.',
    noToDownloadErr: 'No {subject} images to download — {errored} failed to process.',
    savedOfTotal: 'Saved {saved} of {total} — {errored} failed.',
    exported: { one: 'Exported {count} image.', other: 'Exported {count} images.' },
    zipping: { one: 'Zipping {count} image...', other: 'Zipping {count} images...' },
    zipExported: {
      one: 'ZIP exported with {count} image.',
      other: 'ZIP exported with {count} images.',
    },
    pdfBuilding: {
      one: 'Building PDF from {count} image…',
      other: 'Building PDF from {count} images…',
    },
    pdfExported: {
      one: 'PDF exported with {count} page.',
      other: 'PDF exported with {count} pages.',
    },
    pdfFailed: 'PDF export failed: {message}',
    generatingVariants: 'Generating {variants} variants across {sizes} sizes...',
    responsiveExported: {
      one: 'Responsive ZIP exported: {count} image × {sizes} sizes.',
      other: 'Responsive ZIP exported: {count} images × {sizes} sizes.',
    },
    outputSet: 'Output set to {w}×{h} (Exact dimensions)',
  },

  progress: {
    zipping: 'Zipping… {pct}%',
  },

  announce: {
    allSelected: 'All {count} images selected.',
    selectionCleared: 'Selection cleared.',
    imageReordered: 'Image reordered.',
    alreadyTop: 'Already at top.',
    alreadyBottom: 'Already at bottom.',
    movedToPosition: 'Moved to position {pos} of {total}.',
    imagesAdded: {
      one: '{count} image added. Processing.',
      other: '{count} images added. Processing.',
    },
    processingComplete: {
      one: 'Processing complete. {count} image ready.',
      other: 'Processing complete. {count} images ready.',
    },
    removed: { one: 'Removed {count} image.', other: 'Removed {count} images.' },
    restored: { one: 'Restored {count} image.', other: 'Restored {count} images.' },
    downloaded: 'Downloaded {filename}',
    creatingZip: 'Creating ZIP archive.',
    zipDownloaded: 'ZIP downloaded with {count} images.',
    creatingPdf: 'Creating PDF.',
    pdfDownloaded: 'PDF downloaded with {count} pages.',
    creatingResponsive: 'Creating responsive export.',
    responsiveDownloaded: 'Responsive ZIP downloaded with {count} variants.',
    allCleared: 'All images cleared.',
    revertedOriginal: 'Reverted to original.',
    transformApplied: {
      one: '{description} applied to {count} image.',
      other: '{description} applied to {count} images.',
    },
    verbRotateRight: 'Rotate right',
    verbRotateLeft: 'Rotate left',
    verbFlipH: 'Flip horizontal',
    verbFlipV: 'Flip vertical',
  },

  // ---- Preview card (built in preview.js) ----
  card: {
    editAria: 'Edit {name}',
    rotateLeftTip: 'Rotate 90° counter-clockwise',
    rotateLeft: 'Rotate left',
    rotateRightTip: 'Rotate 90° clockwise',
    rotateRight: 'Rotate right',
    flipHTip: 'Mirror horizontally',
    flipH: 'Flip horizontal',
    flipVTip: 'Mirror vertically',
    flipV: 'Flip vertical',
    cropTip: 'Crop selection',
    crop: 'Crop',
    editTip: 'Open full image editor',
    editTitle: 'Edit image',
    edit: 'Edit',
    revertTip: 'Discard edits and restore the original',
    revertTitle: 'Revert to original',
    revert: 'Revert',
    selectAria: 'Select {name} for bulk actions',
    selectTitle: 'Select for bulk actions',
    thumbTitle: 'Click to open editor',
    imgAlt: 'Preview of {name}',
    framesBadge: '{count} frames',
    animatedBadge: 'Animated',
    statDimensions: 'Dimensions',
    statRatio: 'Ratio',
    statSize: 'Size',
    processing: 'Processing…',
    downloadTip: 'Download processed image',
    downloadTitle: 'Download',
    downloadAria: 'Download {name}',
    copyTip: 'Copy to clipboard',
    copyTitle: 'Copy',
    copyAria: 'Copy {name}',
    removeTip: 'Remove from queue',
    removeTitle: 'Remove',
    removeAria: 'Remove {name}',
    saved: 'Saved',
    larger: 'Larger',
    errorPrefix: 'Error: {message}',
    badgeSaved: 'Saved',
  },

  // ---- Crop / image editor modal (crop-modal.js) ----
  editor: {
    title: 'Edit Image',
    toolsAria: 'Transform tools',
    rotateLeftTip: 'Rotate 90° counter-clockwise (Shift+R)',
    rotateLeft: 'Rotate left',
    rotateRightTip: 'Rotate 90° clockwise (R)',
    rotateRight: 'Rotate right',
    flipHTip: 'Mirror horizontally (H)',
    flipH: 'Flip horizontal',
    flipVTip: 'Mirror vertically (V)',
    flipV: 'Flip vertical',
    undoTip: 'Undo last edit (Ctrl+Z)',
    undoTitle: 'Undo (Ctrl+Z)',
    undoAria: 'Undo',
    redoTip: 'Redo edit (Ctrl+Y or Ctrl+Shift+Z)',
    redoTitle: 'Redo (Ctrl+Y)',
    redoAria: 'Redo',
    eyedropperTip: 'Eyedropper — sample a pixel color; magnifier loupe helps precision',
    eyedropperTitle: 'Eyedropper — pick colors from image',
    eyedropperAria: 'Eyedropper color picker',
    extractTip: 'Extract the 5 dominant colors from the image or current crop',
    extractTitle: 'Extract dominant colors from image',
    extractAria: 'Extract color palette',
    resetAll: 'Reset All',
    cancel: 'Cancel',
    apply: 'Apply',
    aspectRatio: 'Aspect Ratio',
    free: 'Free',
    customRatioW: 'Custom ratio width',
    customRatioH: 'Custom ratio height',
    setRatioTip: 'Apply custom ratio to crop',
    set: 'Set',
    quickCrop: 'Quick Crop',
    customCropW: 'Custom crop width in pixels',
    customCropH: 'Custom crop height in pixels',
    cropExactTip: 'Crop to exact pixel size',
    crop: 'Crop',
    exportSizeLabel: 'Export Size',
    exportW: 'Export width in pixels',
    exportH: 'Export height in pixels',
    setExportTip: 'Set export output size',
    clear: 'Clear',
    colorsTitle: 'Colors',
    closeColorTitle: 'Close color panel',
    closeColorAria: 'Close color panel',
    clickToCopy: 'Click to copy',
    recentPicks: 'Recent Picks',
    copyAll: 'Copy All',
    copyAllRecentTitle: 'Copy all as comma-separated hex values',
    clearRecentTitle: 'Clear all picked colors',
    extractedPalette: 'Extracted Palette',
    copyPaletteTitle: 'Copy palette hex values',
    clearPaletteTitle: 'Clear extracted palette',
    lockRatioTip: 'Lock crop to a preset aspect ratio',
    ratio: 'Ratio',
    grid: 'Grid',
    gridCyan: 'Cyan grid',
    gridYellow: 'Yellow grid',
    gridMagenta: 'Magenta grid',
    gridRed: 'Red grid',
    gridGreen: 'Green grid',
    gridBlue: 'Blue grid',
    gridWhite: 'White grid',
    gridBlack: 'Black grid',
    fullImage: 'Full image',
    flipPrefix: 'Flip',
    cropPrefix: 'Crop',
  },

  // ---- Help modal (help-modal.js). *Content blocks are HTML.* ----
  help: {
    title: 'PixelGnome Help',
    dialogAria: 'Help and changelog',
    close: 'Close',
    closeAria: 'Close help',
    tabGuide: 'Quick Start',
    tabTips: 'Tips',
    tabChangelog: 'Changelog',
    guideContent: `
    <div class="help-section">
      <h3>Getting Started</h3>
      <p>PixelGnome is a browser-based image resizer that runs entirely in your browser — no uploads, no servers. Your images never leave your device.</p>
    </div>
    <div class="help-section">
      <h3>Basic Workflow</h3>
      <ul>
        <li><strong>Drop or browse</strong> — Drag images onto the drop zone, or click to browse. Supports JPEG, PNG, WebP, GIF, HEIC, and SVG.</li>
        <li><strong>Choose settings</strong> — Pick a preset or set custom dimensions, format, and quality in the sidebar.</li>
        <li><strong>Edit per image</strong> — Use the rotate, flip, and crop buttons below each preview to fine-tune individual images. Click the crop icon to open the full editor.</li>
        <li><strong>Download</strong> — Export a single image, all images, or a ZIP archive.</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Settings Overview</h3>
      <ul>
        <li><strong>Preset</strong> — Pre-configured dimension sets for common use cases (Full HD, Email Hero, etc.). Save your own custom presets.</li>
        <li><strong>Resize Mode</strong> — "Fit within" keeps aspect ratio inside a box. "Max long edge" scales to a single dimension. "Exact" center-crops to precise dimensions.</li>
        <li><strong>Never upscale</strong> — When checked, output will never exceed the source image dimensions. Prevents blurry enlargements.</li>
        <li><strong>Strip EXIF</strong> — Removes camera info, GPS coordinates, and other metadata from the output file.</li>
        <li><strong>Filename pattern</strong> — Customize output names using tokens: {name}, {width}, {height}, {preset}, {format}.</li>
      </ul>
    </div>
  `,
    tipsContent: `
    <div class="help-section">
      <h3>Keyboard Shortcuts</h3>
      <ul>
        <li><strong>Escape</strong> — Close the editor or any modal</li>
        <li><strong>Tab</strong> — Navigate between controls</li>
        <li><strong>Enter / Space</strong> — Activate focused button or drop zone</li>
        <li><strong><kbd>Ctrl/Cmd</kbd> + <kbd>O</kbd></strong> — Open the file picker</li>
        <li><strong><kbd>Delete</kbd> / <kbd>Backspace</kbd></strong> — Remove the focused card (or every selected card)</li>
        <li><strong><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></strong> — Move the focused card up or down in the queue</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Pro Tips</h3>
      <ul>
        <li><strong>Drop anywhere</strong> — drag files anywhere on the window, not just the sidebar drop zone. <kbd>Ctrl+O</kbd> also opens the file picker.</li>
        <li><strong>Crop editor</strong> — drag corner handles to resize, drag inside to move. Hold <kbd>Shift</kbd> to lock the aspect ratio, or click <strong>Ratio</strong> to lock to a preset (1:1, 16:9, etc.).</li>
        <li><strong>Undo / Redo</strong> in the editor — <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> (or <kbd>Ctrl+Shift+Z</kbd>). Up to 50 steps back.</li>
        <li><strong>Editor keyboard shortcuts</strong> — <kbd>R</kbd> / <kbd>Shift+R</kbd> rotate CW/CCW, <kbd>H</kbd> / <kbd>V</kbd> flip horizontal/vertical.</li>
        <li><strong>Target file size</strong> (Output section) — compress JPEG/WebP/AVIF to a specific KB limit. PixelGnome finds the best quality automatically.</li>
        <li><strong>Multi-size export</strong> — generate responsive image sets in one pass. Use the <code>{breakpoint}</code> token in your filename pattern to include the size in the output name.</li>
      </ul>
      <p class="help-section-footnote">Hover any button in the toolbar or editor for a tooltip explaining what it does.</p>
    </div>
    <div class="help-section">
      <h3>Performance Notes</h3>
      <ul>
        <li>Images over {max} megapixels will trigger a warning — they may be slow to process.</li>
        <li>Batches over {batch} files will also show a warning but will process normally.</li>
        <li>Large images are processed in a Web Worker when possible; some formats (HEIC, SVG, animated GIF) stay on the main thread and yield between frames to keep the UI responsive.</li>
      </ul>
    </div>
  `,
  },

  // ---- Privacy modal (privacy-modal.js). *Content block is HTML.* ----
  privacy: {
    title: 'Privacy & Use',
    close: 'Close',
    closeAria: 'Close privacy',
    content: `
    <div class="help-section">
      <h3>Local processing</h3>
      <p>PixelGnome resizes, compresses, and converts your images entirely inside your web browser. All processing happens on your own device — there is no server doing the work.</p>
    </div>
    <div class="help-section">
      <h3>No uploads, no storage</h3>
      <p>Your images are never uploaded or sent anywhere, and they are never stored by us. When you close or refresh the page, they are cleared from memory.</p>
      <p>The only things saved are your own preferences — settings, theme, any presets you create, and your analytics choice — which are kept in your browser's local storage, on your device. You can clear them anytime with "Reset to Defaults" or by clearing your browser data.</p>
    </div>
    <div class="help-section">
      <h3>No account</h3>
      <p>PixelGnome requires no sign-up, login, or personal information to use.</p>
    </div>
    <div class="help-section">
      <h3>Analytics</h3>
      <p>This site uses Google Analytics (via Google Tag Manager) to understand aggregate, anonymous traffic — such as how many people visit and which features get used. It measures page visits and a few in-app actions, like when images are processed or exported. It counts those actions only; it never sees, receives, or transmits the images themselves — your images always stay on your device.</p>
      <p>Google Analytics sets cookies and processes this data on Google's servers. IP addresses are truncated, the data is not used to identify you, and we don't use it for advertising. Analytics runs only after you opt in via the cookie banner — until then, nothing is sent. You can change your choice anytime using <strong>Cookie settings</strong> in the footer.</p>
      <p>The portable single-file version of PixelGnome contains no analytics at all and makes no network requests.</p>
    </div>
    <div class="help-section">
      <h3>External links</h3>
      <p>PixelGnome links to a few external services — Ko-fi (for optional support) and 321Enterprise (the studio behind the tool). Those sites have their own privacy practices, which we don't control.</p>
    </div>
    <div class="help-section">
      <h3>Use at your own risk</h3>
      <p>PixelGnome is provided free and "as is," without warranty of any kind. Always keep backups of important original files before processing. We are not liable for any loss of or damage to your images.</p>
    </div>
    <div class="help-section">
      <p style="color: var(--color-text-muted);">Last updated: May 2026.</p>
    </div>
  `,
  },

  // ---- Cookie-consent banner (consent-banner.js) ----
  consent: {
    aria: 'Analytics cookie consent',
    text: 'PixelGnome uses Google Analytics to measure anonymous, aggregate traffic — page visits only. Nothing is loaded or sent until you accept. Your images are always processed locally and are never uploaded.',
    learn: 'Learn more',
    decline: 'Decline',
    accept: 'Accept',
  },

  // ---- History drawer (history.js) ----
  history: {
    heading: 'History',
    clearTitle: 'Clear history',
    clearAria: 'Clear history',
    timeJustNow: 'just now',
    timeSeconds: '{n}s ago',
    timeMinutes: '{n}m ago',
    timeHours: '{n}h ago',
    timeDays: '{n}d ago',
  },
};
