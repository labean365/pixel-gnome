/**
 * preview.js
 * Renders preview cards for each image in the queue.
 * Shows thumbnail, original stats, and post-processing stats.
 *
 * Phase 6+: Color-coded stats, clickable thumbnails, high-visibility Edit button.
 */

import { generateThumbnail, isSvgFile, rasterizeSvg } from './image-processor.js';
import { isGifFile, isAnimatedGif, countGifFrames } from './gif-detect.js';
import { trackUrl, revokeUrl } from './resource-tracker.js';
import { t, formatNumber } from './i18n.js';

const previewArea = () => document.getElementById('previewArea');
const previewList = () => document.getElementById('previewList');
const contentEmpty = () => document.getElementById('contentEmpty');

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return formatNumber(bytes / 1024, 1) + ' KB';
  return formatNumber(bytes / (1024 * 1024), 2) + ' MB';
}

/**
 * Attributes for a translatable element: the current translation plus the
 * `data-i18n-attr` / `data-i18n-vars` markers that let applyStaticTranslations()
 * re-translate it in place on a language switch (LAB-28).
 * @param {Object<string,string>} pairs  attribute name → i18n key
 * @param {object} [vars]  interpolation vars
 * @returns {string}
 */
function l10nAttrs(pairs, vars) {
  const entries = Object.entries(pairs);
  const now = entries.map(([attr, key]) => `${attr}="${escapeAttr(t(key, vars))}"`).join(' ');
  const spec = entries.map(([attr, key]) => `${attr}:${key}`).join(';');
  const v = vars ? ` data-i18n-vars="${escapeAttr(JSON.stringify(vars))}"` : '';
  return `${now} data-i18n-attr="${spec}"${v}`;
}

/**
 * A text span that re-translates in place on a language switch (LAB-28).
 * @param {string} key
 * @param {object} [vars]
 * @param {string} [className]
 * @returns {string}
 */
function l10nText(key, vars, className) {
  const cls = className ? ` class="${className}"` : '';
  const v = vars ? ` data-i18n-vars="${escapeAttr(JSON.stringify(vars))}"` : '';
  return `<span${cls} data-i18n="${key}"${v}>${escapeHtml(t(key, vars))}</span>`;
}

/**
 * Show the preview area
 */
export function showPreviewArea() {
  previewArea().hidden = false;
  // Empty-state hero and the preview are mutually exclusive.
  const empty = contentEmpty();
  if (empty) empty.hidden = true;
}

/**
 * Hide the preview area
 */
export function hidePreviewArea() {
  previewArea().hidden = true;
  // Queue is empty again — bring the first-visit hero back.
  const empty = contentEmpty();
  if (empty) empty.hidden = false;
}

/**
 * Clear all preview cards
 */
export function clearPreviews() {
  previewList().innerHTML = '';
  hidePreviewArea();
}

/**
 * Add a preview card for a file
 * @param {string} id - Unique ID for this image entry
 * @param {File} file - The original file
 * @param {function(string): void} onRemove - Callback when user clicks remove
 * @param {function(string): void} onDownload - Callback when user clicks download
 * @param {Object} [editCallbacks] - Optional edit callbacks
 * @param {function(string, string): void} [editCallbacks.onRotate] - (id, direction) 'cw' or 'ccw'
 * @param {function(string, string): void} [editCallbacks.onFlip] - (id, axis) 'h' or 'v'
 * @param {function(string): void} [editCallbacks.onCrop] - (id) — opens full edit modal
 * @param {function(string): void} [editCallbacks.onCopy] - (id) — copies image to clipboard
 */
export async function addPreviewCard(id, file, onRemove, onDownload, editCallbacks) {
  showPreviewArea();

  const card = document.createElement('div');
  card.className = 'preview-card processing';
  card.id = `card-${id}`;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', t('card.ariaProcessing', { name: file.name }));
  card.setAttribute('data-i18n-attr', 'aria-label:card.ariaProcessing');
  card.setAttribute('data-i18n-vars', JSON.stringify({ name: file.name }));
  // Focusable so keyboard users can Tab to a card and use Alt+ArrowUp /
  // Alt+ArrowDown to reorder it. (Mouse drag-to-reorder was removed — it
  // conflicted with the full-window file-drop overlay.)
  card.setAttribute('tabindex', '0');
  // Vector input: the raster output is always larger, so the card shows a
  // neutral "Rasterized" row instead of a red "Larger +N%" (LAB-481).
  if (isSvgFile(file)) card.dataset.vector = 'svg';

  // Detect animated GIFs before thumbnail generation
  let animated = false;
  let frameCount = 0;
  if (isGifFile(file)) {
    try {
      animated = await isAnimatedGif(file);
      if (animated) {
        frameCount = await countGifFrames(file);
      }
    } catch {
      /* treat as static */
    }
  }

  // Generate thumbnail async
  // For animated GIFs, use the native file as thumbnail so the browser plays
  // the animation. Canvas-based thumbnails only capture the first frame.
  let thumbSrc = '';
  if (animated) {
    thumbSrc = trackUrl(URL.createObjectURL(file));
  } else {
    try {
      thumbSrc = await generateThumbnail(file);
    } catch {
      thumbSrc = '';
    }
  }

  // Get original dimensions by loading the image briefly
  let origWidth = '—';
  let origHeight = '—';
  try {
    const dims = await getImageDimensions(file);
    origWidth = dims.width;
    origHeight = dims.height;
  } catch {
    // leave as dashes
  }

  // Detect file type for display
  const ext = file.name.split('.').pop().toLowerCase();
  const typeLabel =
    ext === 'heic' || ext === 'heif' ? 'HEIC' : ext === 'svg' ? 'SVG' : ext.toUpperCase();

  // Build edit toolbar HTML (only if callbacks provided)
  const editToolbar = editCallbacks
    ? `
    <div class="edit-toolbar" role="toolbar" ${l10nAttrs({ 'aria-label': 'card.editAria' }, { name: file.name })}>
      <button class="btn btn-icon btn-sm" data-action="rotate-ccw" ${l10nAttrs({ 'data-tooltip': 'card.rotateLeftTip', title: 'card.rotateLeft', 'aria-label': 'card.rotateLeft' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button class="btn btn-icon btn-sm" data-action="rotate-cw" ${l10nAttrs({ 'data-tooltip': 'card.rotateRightTip', title: 'card.rotateRight', 'aria-label': 'card.rotateRight' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
      <button class="btn btn-icon btn-sm" data-action="flip-h" ${l10nAttrs({ 'data-tooltip': 'card.flipHTip', title: 'card.flipH', 'aria-label': 'card.flipH' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 16 3 12 7 8"/><polyline points="17 8 21 12 17 16"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
      </button>
      <button class="btn btn-icon btn-sm" data-action="flip-v" ${l10nAttrs({ 'data-tooltip': 'card.flipVTip', title: 'card.flipV', 'aria-label': 'card.flipV' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 7 12 3 16 7"/><polyline points="16 17 12 21 8 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
      </button>
      <button class="btn btn-icon btn-sm" data-action="crop" ${l10nAttrs({ 'data-tooltip': 'card.cropTip', title: 'card.crop', 'aria-label': 'card.crop' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>
      </button>
      <span class="edit-toolbar-sep" aria-hidden="true"></span>
      <button class="btn-edit" data-action="open-editor" ${l10nAttrs({ 'data-tooltip': 'card.editTip', title: 'card.editTitle', 'aria-label': 'card.editTitle' })}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        ${l10nText('card.edit')}
      </button>
      <button class="btn-revert card-revert" data-action="revert" ${l10nAttrs({ 'data-tooltip': 'card.revertTip', title: 'card.revertTitle', 'aria-label': 'card.revertTitle' })} hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a6 6 0 0 1 0 12h-3"/></svg>
        ${l10nText('card.revert')}
      </button>
    </div>
  `
    : '';

  // Compute aspect ratio for display
  const aspectStr =
    origWidth !== '—' && origHeight !== '—' ? getAspectRatioLabel(origWidth, origHeight) : '';

  card.innerHTML = `
    <div class="preview-card-gutter">
      <button type="button" class="preview-card-select" data-action="select" aria-pressed="false" ${l10nAttrs({ 'aria-label': 'card.selectAria', title: 'card.selectTitle' }, { name: file.name })}>
        <svg class="select-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>
    <div class="preview-card-thumb${editCallbacks ? ' clickable' : ''}" data-action="thumb-edit" ${l10nAttrs({ title: 'card.thumbTitle' })}${typeof origWidth === 'number' ? ` data-ow="${origWidth}" data-oh="${origHeight}"` : ''}>
      ${thumbSrc ? `<img src="${thumbSrc}" ${l10nAttrs({ alt: 'card.imgAlt' }, { name: file.name })} />` : ''}
      <div class="crop-overlay" id="cropov-${id}" hidden aria-hidden="true">
        <div class="crop-overlay-keep"></div>
      </div>
    </div>
    <div class="preview-card-info">
      <div class="preview-card-header">
        <span class="preview-card-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</span>
        <span class="preview-card-type" data-type="${typeLabel}">${typeLabel}</span>${animated ? `${frameCount ? l10nText('card.framesBadge', { count: frameCount }, 'preview-card-badge animated-badge') : l10nText('card.animatedBadge', undefined, 'preview-card-badge animated-badge')}` : ''}
      </div>
      <div class="preview-card-stats">
        <div class="stat-grid" id="statgrid-${id}">
          <!-- Row 1: Dimensions -->
          ${l10nText('card.statDimensions', undefined, 'stat-label')}
          <span class="stat-val stat-dim">${origWidth !== '—' ? `${origWidth} &times; ${origHeight}` : '—'}</span>
          <span class="stat-arrow" id="arrow-dim-${id}"></span>
          <span class="stat-val stat-dim stat-new" id="new-dim-${id}"></span>
          <!-- Row 2: Ratio -->
          ${l10nText('card.statRatio', undefined, 'stat-label')}
          <span class="stat-val stat-ratio"${typeof origWidth === 'number' ? ` data-ratio="${origWidth}:${origHeight}"` : ''}>${aspectStr || '—'}</span>
          <span class="stat-arrow" id="arrow-ratio-${id}"></span>
          <span class="stat-val stat-ratio stat-new" id="new-ratio-${id}"></span>
          <!-- Row 3: File size -->
          ${l10nText('card.statSize', undefined, 'stat-label')}
          <span class="stat-val stat-filesize" data-bytes="${file.size}">${formatBytes(file.size)}</span>
          <span class="stat-arrow" id="arrow-size-${id}"></span>
          <span class="stat-val stat-filesize stat-new" id="new-size-${id}"></span>
        </div>
        <!-- Processing indicator (shown while working) -->
        <div class="stat-processing-row" id="processing-${id}">
          <span class="stat-processing-indicator"></span>
          ${l10nText('card.processing', undefined, 'stat-processing-text')}
        </div>
        <!-- Card-level determinate progress (shown for slow ops: HEIC, animated GIF) -->
        <div class="card-progress" id="card-progress-${id}" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="card-progress-track">
            <div class="card-progress-fill" id="card-progress-fill-${id}" style="width: 0%"></div>
          </div>
          <span class="card-progress-label" id="card-progress-label-${id}"></span>
        </div>
        <!-- Savings row (shown after processing) -->
        <div class="stat-savings-row" id="savings-${id}" hidden></div>
      </div>
      ${editToolbar}
    </div>
    <div class="preview-card-actions">
      <button class="btn btn-icon" data-action="download" ${l10nAttrs({ 'data-tooltip': 'card.downloadTip', title: 'card.downloadTitle', 'aria-label': 'card.downloadAria' }, { name: file.name })} disabled>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      ${
        navigator.clipboard && navigator.clipboard.write
          ? `
      <button class="btn btn-icon" data-action="copy" ${l10nAttrs({ 'data-tooltip': 'card.copyTip', title: 'card.copyTitle', 'aria-label': 'card.copyAria' }, { name: file.name })} disabled>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      `
          : ''
      }
      <button class="btn btn-icon btn-danger" data-action="remove" ${l10nAttrs({ 'data-tooltip': 'card.removeTip', title: 'card.removeTitle', 'aria-label': 'card.removeAria' }, { name: file.name })}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  // Wire button events
  card.querySelector('[data-action="remove"]').addEventListener('click', () => onRemove(id));
  card.querySelector('[data-action="download"]').addEventListener('click', () => onDownload(id));

  const copyBtn = card.querySelector('[data-action="copy"]');
  if (copyBtn && editCallbacks && editCallbacks.onCopy) {
    copyBtn.addEventListener('click', () => editCallbacks.onCopy(id));
  }

  // Wire edit button events
  if (editCallbacks) {
    card
      .querySelector('[data-action="rotate-ccw"]')
      .addEventListener('click', () => editCallbacks.onRotate(id, 'ccw'));
    card
      .querySelector('[data-action="rotate-cw"]')
      .addEventListener('click', () => editCallbacks.onRotate(id, 'cw'));
    card
      .querySelector('[data-action="flip-h"]')
      .addEventListener('click', () => editCallbacks.onFlip(id, 'h'));
    card
      .querySelector('[data-action="flip-v"]')
      .addEventListener('click', () => editCallbacks.onFlip(id, 'v'));
    card
      .querySelector('[data-action="crop"]')
      .addEventListener('click', () => editCallbacks.onCrop(id));
    card
      .querySelector('[data-action="open-editor"]')
      .addEventListener('click', () => editCallbacks.onCrop(id));
    // Thumbnail click opens editor
    card
      .querySelector('[data-action="thumb-edit"]')
      .addEventListener('click', () => editCallbacks.onCrop(id));
    // Revert-to-original (hidden until the card has edits — see setCardEditedState)
    const revertBtn = card.querySelector('[data-action="revert"]');
    if (revertBtn && editCallbacks.onRevert) {
      revertBtn.addEventListener('click', () => editCallbacks.onRevert(id));
    }
  }

  previewList().appendChild(card);
}

/**
 * Add a PDF card to the shared preview list (C1 unified intake). A visual sibling
 * of the image card, minus the image-processing chrome: a first-page thumbnail
 * (filled in async), a "Np" page badge, a page/size meta line, and a single
 * "Edit pages" action. Page count + thumbnail arrive via updatePdfCardMeta once
 * the worker has read the file. PDFs live in their own queue (main.js), so the
 * image processing/export paths never see them.
 * @param {string} id
 * @param {File} file
 * @param {function(string): void} onRemove
 * @param {function(string): void} onOpen - opens the PDF (interim: the modal)
 * @param {function(string): void} [onDownload] - downloads the card's current PDF (H4)
 */
export function addPdfPreviewCard(id, file, onRemove, onOpen, onDownload) {
  showPreviewArea();

  const card = document.createElement('div');
  card.className = 'preview-card pdf-card';
  card.id = `card-${id}`;
  card.dataset.kind = 'pdf';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', t('card.pdfAria', { name: file.name }));
  card.setAttribute('data-i18n-attr', 'aria-label:card.pdfAria');
  card.setAttribute('data-i18n-vars', JSON.stringify({ name: file.name }));
  card.setAttribute('tabindex', '0');

  card.innerHTML = `
    <div class="preview-card-gutter">
      <button type="button" class="preview-card-select" data-action="select" aria-pressed="false" ${l10nAttrs({ 'aria-label': 'card.selectAria', title: 'card.selectTitle' }, { name: file.name })}>
        <svg class="select-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>
    <div class="preview-card-thumb clickable" data-action="open-pdf" ${l10nAttrs({ title: 'card.editPagesTitle' })}>
      <div class="pdf-thumb-placeholder" id="pdfthumb-${id}" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
    </div>
    <div class="preview-card-info">
      <div class="preview-card-header">
        <span class="preview-card-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</span>
        <span class="preview-card-type" data-type="PDF">PDF</span>
        <span class="preview-card-badge pdf-badge" id="pdfbadge-${id}" hidden></span>
      </div>
      <div class="preview-card-stats">
        <div class="pdf-meta-line" id="pdfmeta-${id}" data-bytes-total="${file.size}">${escapeHtml(t('card.pdfPagesLoading'))} &middot; ${formatBytes(file.size)}</div>
        <!-- Savings line, shown after an in-place optimize (H4 — parity with image cards) -->
        <div class="stat-savings-row" id="pdfsavings-${id}" hidden></div>
      </div>
      <div class="edit-toolbar">
        <button class="btn-edit" data-action="open-pdf" ${l10nAttrs({ 'data-tooltip': 'card.editPagesTitle', title: 'card.editPagesTitle', 'aria-label': 'card.editPagesTitle' })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          ${l10nText('card.editPages')}
        </button>
      </div>
    </div>
    <div class="preview-card-actions">
      <button class="btn btn-icon" data-action="download-pdf" ${l10nAttrs({ 'data-tooltip': 'card.downloadTip', title: 'card.downloadTitle', 'aria-label': 'card.downloadAria' }, { name: file.name })}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      <button class="btn btn-icon btn-danger" data-action="remove" ${l10nAttrs({ 'data-tooltip': 'card.removeTip', title: 'card.removeTitle', 'aria-label': 'card.removeAria' }, { name: file.name })}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  card.querySelector('[data-action="remove"]').addEventListener('click', () => onRemove(id));
  card
    .querySelectorAll('[data-action="open-pdf"]')
    .forEach((el) => el.addEventListener('click', () => onOpen(id)));
  const dlBtn = card.querySelector('[data-action="download-pdf"]');
  if (dlBtn && onDownload) dlBtn.addEventListener('click', () => onDownload(id));

  previewList().appendChild(card);
}

/**
 * Fill in a PDF card's page count, page/size line, and first-page thumbnail once
 * the worker has read the file (see addPdfPreviewCard / getPdfCardMeta). Safe to
 * call after the card was removed (no-ops if the node is gone).
 * @param {string} id
 * @param {{ pageCount: number, fileSize?: number, thumbnailUrl: string|null }} meta
 */
export function updatePdfCardMeta(id, meta) {
  const card = document.getElementById(`card-${id}`);
  if (!card || !meta) return;
  const n = meta.pageCount || 0;

  const badge = document.getElementById(`pdfbadge-${id}`);
  if (badge) {
    badge.setAttribute('data-i18n', 'card.pdfBadge');
    badge.setAttribute('data-i18n-vars', JSON.stringify({ count: n }));
    badge.textContent = t('card.pdfBadge', { count: n });
    badge.hidden = false;
  }

  const metaLine = document.getElementById(`pdfmeta-${id}`);
  if (metaLine) {
    metaLine.dataset.pages = String(n);
    metaLine.dataset.bytesTotal = String(meta.fileSize || 0);
    renderPdfMetaLine(metaLine);
  }

  if (meta.thumbnailUrl) {
    const thumb = card.querySelector('.preview-card-thumb');
    const placeholder = document.getElementById(`pdfthumb-${id}`);
    if (thumb) {
      if (placeholder) placeholder.remove();
      const img = document.createElement('img');
      img.src = meta.thumbnailUrl;
      img.alt = t('card.pdfThumbAlt');
      img.setAttribute('data-i18n-attr', 'alt:card.pdfThumbAlt');
      thumb.insertBefore(img, thumb.firstChild);
    }
  }
}

/**
 * Show a before→after savings line on a PDF card after an in-place optimize, so a
 * PDF card reads as alive as an image card (H4). Reuses the image card's savings
 * styling. Hides itself when there was no reduction.
 * @param {string} id
 * @param {number} before  byte size before optimize
 * @param {number} after   byte size after optimize
 */
export function setPdfCardSavings(id, before, after) {
  const el = document.getElementById(`pdfsavings-${id}`);
  if (!el) return;
  if (before && after < before) {
    el.className = 'stat-savings-row';
    el.dataset.savings = JSON.stringify({ before, after });
    renderSavingsRow(el);
  } else {
    delete el.dataset.savings;
    el.hidden = true;
  }
}

/**
 * Toggle a card's "edited" affordance: shows/hides the per-card revert button
 * and marks the card so styling can reflect that it differs from the original.
 * Called after any reprocess, since every edit path (crop/rotate/flip/bulk)
 * routes through one.
 * @param {string} id
 * @param {boolean} edited
 */
export function setCardEditedState(id, edited) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.classList.toggle('edited', edited);
  const revertBtn = card.querySelector('[data-action="revert"]');
  if (revertBtn) revertBtn.hidden = !edited;
}

/**
 * Update a preview card with processing results.
 * @param {string} id
 * @param {Object} result - { blob, outputWidth, outputHeight, outputSize }
 * @param {boolean} [updateThumb=false] - If true, swap the thumbnail to show
 *   the processed output (useful after user edits like rotate/flip/crop).
 *   Default false: keep the original thumbnail so the full source image stays
 *   visible even when the output is cropped or resized.
 */
/**
 * Compute the "keep" rectangle for an exact-mode center-crop, expressed as
 * fractions (0..1) of the THUMB CONTAINER. Accounts for `object-fit: contain`
 * letterboxing so the box lines up with the visible image, not the container.
 *
 * Returns null when nothing would be cropped (mode isn't exact, target or
 * source dimensions are unusable, or the aspect ratios already match).
 *
 * Pure ratio math — independent of the container's pixel size, so the same
 * percentages are correct at any responsive breakpoint.
 *
 * @param {number} srcW
 * @param {number} srcH
 * @param {{mode:string, width:number, height:number|null}} settings
 * @returns {{left:number, top:number, width:number, height:number}|null}
 */
export function computeCropKeepRect(srcW, srcH, settings) {
  if (!settings || settings.mode !== 'exact') return null;
  const targetW = settings.width;
  const targetH = settings.height || settings.width;
  if (!(srcW > 0 && srcH > 0 && targetW > 0 && targetH > 0)) return null;

  const srcAspect = srcW / srcH;
  const targetAspect = targetW / targetH;
  // Already the right shape — no crop, no overlay.
  if (Math.abs(srcAspect - targetAspect) < 0.001) return null;

  // Kept region within the SOURCE, as fractions (center-crop).
  let keepXFrac, keepYFrac, keepWFrac, keepHFrac;
  if (srcAspect > targetAspect) {
    // Source is wider — trim the sides.
    keepWFrac = targetAspect / srcAspect;
    keepHFrac = 1;
    keepXFrac = (1 - keepWFrac) / 2;
    keepYFrac = 0;
  } else {
    // Source is taller — trim top/bottom.
    keepWFrac = 1;
    keepHFrac = srcAspect / targetAspect;
    keepXFrac = 0;
    keepYFrac = (1 - keepHFrac) / 2;
  }

  // Displayed image rect within the container under `object-fit: contain`,
  // as fractions of the container. Container aspect is fixed (320x240 → 4/3),
  // but deriving it from ratios keeps this correct if that ever changes.
  const containerAspect = 320 / 240;
  let dispWFrac, dispHFrac, dispLeftFrac, dispTopFrac;
  if (srcAspect > containerAspect) {
    dispWFrac = 1;
    dispHFrac = containerAspect / srcAspect;
    dispLeftFrac = 0;
    dispTopFrac = (1 - dispHFrac) / 2;
  } else {
    dispHFrac = 1;
    dispWFrac = srcAspect / containerAspect;
    dispTopFrac = 0;
    dispLeftFrac = (1 - dispWFrac) / 2;
  }

  return {
    left: dispLeftFrac + keepXFrac * dispWFrac,
    top: dispTopFrac + keepYFrac * dispHFrac,
    width: keepWFrac * dispWFrac,
    height: keepHFrac * dispHFrac,
  };
}

/**
 * Show or hide the center-crop overlay on a card's thumbnail to preview what an
 * exact-mode preset will trim. Reads the source dimensions from the live thumb
 * image (so it reflects edits) and falls back to the card's data attributes.
 *
 * @param {string} id
 * @param {{mode:string, width:number, height:number|null}} settings
 */
export function updateCropOverlay(id, settings) {
  const overlay = document.getElementById(`cropov-${id}`);
  if (!overlay) return;
  const thumb = overlay.closest('.preview-card-thumb');

  let srcW = 0;
  let srcH = 0;
  const img = thumb && thumb.querySelector('img');
  if (img && img.naturalWidth > 0) {
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
  } else if (thumb && thumb.dataset.ow) {
    srcW = parseInt(thumb.dataset.ow, 10);
    srcH = parseInt(thumb.dataset.oh, 10);
  }

  const rect = computeCropKeepRect(srcW, srcH, settings);
  const keep = overlay.querySelector('.crop-overlay-keep');
  if (!rect || !keep) {
    overlay.hidden = true;
    return;
  }

  keep.style.left = `${(rect.left * 100).toFixed(2)}%`;
  keep.style.top = `${(rect.top * 100).toFixed(2)}%`;
  keep.style.width = `${(rect.width * 100).toFixed(2)}%`;
  keep.style.height = `${(rect.height * 100).toFixed(2)}%`;
  overlay.hidden = false;
}

export function updatePreviewCardResult(id, result, updateThumb = false) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.classList.remove('processing');
  // The processed label includes a formatted size, so it's re-rendered by
  // relocalizePreviewCards() rather than the static data-i18n markers.
  card.removeAttribute('data-i18n-attr');
  card.dataset.ariaOut = JSON.stringify({
    width: result.outputWidth,
    height: result.outputHeight,
    bytes: result.outputSize,
  });
  setProcessedAria(card);

  // Only swap the thumbnail when explicitly requested (after edits) or when
  // the initial thumbnail generation failed and there's no preview yet.
  const thumbContainer = card.querySelector('.preview-card-thumb');
  if (thumbContainer && result.blob) {
    let img = thumbContainer.querySelector('img');
    if (img && updateThumb) {
      // User applied edits — refresh thumbnail to reflect changes
      const oldSrc = img.src;
      if (oldSrc && oldSrc.startsWith('blob:')) {
        revokeUrl(oldSrc);
      }
      img.src = trackUrl(URL.createObjectURL(result.blob));
    } else if (!img) {
      // No img yet (thumbnail generation failed initially) — populate it
      img = document.createElement('img');
      img.src = trackUrl(URL.createObjectURL(result.blob));
      img.alt = 'Processed image preview';
      thumbContainer.appendChild(img);
    }
  }

  // Compute output aspect ratio
  const outAspect = getAspectRatioLabel(result.outputWidth, result.outputHeight);

  // Hide processing indicator
  const processingEl = document.getElementById(`processing-${id}`);
  if (processingEl) processingEl.hidden = true;

  // Hide the card-level progress bar (HEIC / animated GIF paths)
  clearCardProgress(id);

  // Populate grid "new" column — dimensions
  const newDim = document.getElementById(`new-dim-${id}`);
  if (newDim) newDim.innerHTML = `${result.outputWidth} &times; ${result.outputHeight}`;

  // Populate grid "new" column — ratio
  const newRatio = document.getElementById(`new-ratio-${id}`);
  if (newRatio) {
    newRatio.dataset.ratio = `${result.outputWidth}:${result.outputHeight}`;
    newRatio.textContent = outAspect;
  }

  // Populate grid "new" column — file size
  const newSize = document.getElementById(`new-size-${id}`);
  if (newSize) {
    newSize.dataset.bytes = String(result.outputSize);
    newSize.textContent = formatBytes(result.outputSize);
  }

  // Show arrows
  const arrowDim = document.getElementById(`arrow-dim-${id}`);
  const arrowRatio = document.getElementById(`arrow-ratio-${id}`);
  const arrowSize = document.getElementById(`arrow-size-${id}`);
  if (arrowDim) arrowDim.textContent = '\u2192';
  if (arrowRatio) arrowRatio.textContent = '\u2192';
  if (arrowSize) arrowSize.textContent = '\u2192';

  // Mark grid as having results (for CSS transitions / visibility)
  const grid = document.getElementById(`statgrid-${id}`);
  if (grid) grid.classList.add('has-output');

  // Savings row — the numbers are stored on the element so a language switch
  // can re-render it in place (relocalizePreviewCards, LAB-28).
  const savingsEl = document.getElementById(`savings-${id}`);
  if (savingsEl) {
    savingsEl.dataset.savings = JSON.stringify({
      before: result.originalSize || 0,
      after: result.outputSize,
      vector: card.dataset.vector ? rasterFormatLabel(result.blob && result.blob.type) : null,
    });
    renderSavingsRow(savingsEl);
  }

  // Enable download and copy buttons
  const dlBtn = card.querySelector('[data-action="download"]');
  if (dlBtn) dlBtn.disabled = false;

  const copyBtn = card.querySelector('[data-action="copy"]');
  if (copyBtn) copyBtn.disabled = false;
}

/**
 * Update a preview card with error state
 * @param {string} id
 * @param {string} message
 */
export function updatePreviewCardError(id, message) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.classList.remove('processing');
  card.classList.add('error');
  card.removeAttribute('data-i18n-attr');
  delete card.dataset.ariaOut;
  card.setAttribute('aria-label', t('card.errorPrefix', { message }));

  // Hide processing indicator
  const processingEl = document.getElementById(`processing-${id}`);
  if (processingEl) processingEl.hidden = true;

  // Also hide any in-flight per-card progress
  clearCardProgress(id);

  // Show error in savings row area
  const savingsEl = document.getElementById(`savings-${id}`);
  if (savingsEl) {
    delete savingsEl.dataset.savings;
    savingsEl.innerHTML = `<span class="preview-card-error">${message}</span>`;
    savingsEl.hidden = false;
    savingsEl.className = 'stat-error-row';
  }
}

/**
 * Mark a preview card as exported (checkmark state)
 * @param {string} id
 */
export function markPreviewCardExported(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  card.classList.add('exported');

  // Add checkmark badge to the card
  const nameEl = card.querySelector('.preview-card-name');
  if (nameEl && !nameEl.querySelector('.exported-badge')) {
    const badge = document.createElement('span');
    badge.className = 'exported-badge';
    badge.innerHTML = ` &#10003; ${l10nText('card.badgeSaved')}`;
    nameEl.appendChild(badge);
  }
}

/**
 * Show the per-card determinate progress bar.
 *
 * Used for operations that exceed the ~2s default-feels-snappy threshold:
 *  - HEIC decode (elapsed-time pseudo-progress — libheif is a WASM black box)
 *  - Animated GIF encode (also pseudo-progress; the encoder runs synchronously
 *    without per-frame callbacks, so we show elapsed vs. expected)
 *
 * Pct is clamped to [0, 100]. Label is optional — e.g. "Decoding HEIC…".
 *
 * @param {string} id
 * @param {number} pct   0-100
 * @param {string} [label]
 */
export function setCardProgress(id, pct, label) {
  const wrap = document.getElementById(`card-progress-${id}`);
  const fill = document.getElementById(`card-progress-fill-${id}`);
  const lbl = document.getElementById(`card-progress-label-${id}`);
  if (!wrap || !fill) return;

  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  wrap.hidden = false;
  fill.style.width = `${clamped}%`;
  wrap.setAttribute('aria-valuenow', String(clamped));
  if (lbl && typeof label === 'string') lbl.textContent = label;
}

/**
 * Hide and reset the per-card progress bar. Safe to call even if it was never
 * shown — e.g. standard JPEG/PNG paths never trigger it.
 * @param {string} id
 */
export function clearCardProgress(id) {
  const wrap = document.getElementById(`card-progress-${id}`);
  const fill = document.getElementById(`card-progress-fill-${id}`);
  const lbl = document.getElementById(`card-progress-label-${id}`);
  if (!wrap || !fill) return;
  wrap.hidden = true;
  fill.style.width = '0%';
  wrap.setAttribute('aria-valuenow', '0');
  if (lbl) lbl.textContent = '';
}

/**
 * Remove a preview card with fade-out animation
 * @param {string} id
 */
export function removePreviewCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;

  // Release any blob URLs held by the card's thumbnail before the node goes
  // away. Without this, per-card removes leak blob URLs until page unload
  // (only releaseAll on "Clear All" caught them before).
  const cardImg = card.querySelector('.preview-card-thumb img');
  if (cardImg && cardImg.src && cardImg.src.startsWith('blob:')) {
    revokeUrl(cardImg.src);
  }

  // Animate out if exported, otherwise just remove
  if (card.classList.contains('exported')) {
    card.classList.add('card-exit');
    card.addEventListener(
      'transitionend',
      () => {
        card.remove();
        if (previewList().children.length === 0) {
          hidePreviewArea();
        }
      },
      { once: true }
    );
    // Fallback if transition doesn't fire
    setTimeout(() => {
      if (card.parentNode) card.remove();
      if (previewList().children.length === 0) {
        hidePreviewArea();
      }
    }, 500);
  } else {
    card.remove();
    if (previewList().children.length === 0) {
      hidePreviewArea();
    }
  }
}

/**
 * Get image dimensions by loading it
 */
async function getImageDimensions(file) {
  // SVGs: the browser's naturalWidth is unreliable (Chrome reports its 300×150
  // default for percentage-sized SVGs), so use the size rasterizeSvg() parsed
  // from the markup — the same size the export uses.
  if (isSvgFile(file)) {
    const svgImg = await rasterizeSvg(file);
    return {
      width: svgImg._svgWidth || svgImg.naturalWidth,
      height: svgImg._svgHeight || svgImg.naturalHeight,
    };
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = trackUrl(URL.createObjectURL(file));
    img.onload = () => {
      revokeUrl(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      revokeUrl(url);
      reject(new Error('Could not read dimensions'));
    };
    img.src = url;
  });
}

/**
 * Render a savings row from the numbers stored in its `data-savings` JSON
 * ({ before, after, vector }). Shared by first render and language switches.
 *   - vector: SVG input → neutral "Rasterized · SVG → FMT" (LAB-481)
 *   - after < before → "Saved −X (−N%)"
 *   - after > before → "Larger +X (+N%)"
 *   - equal → hidden
 * @param {HTMLElement} el
 */
function renderSavingsRow(el) {
  let data;
  try {
    data = JSON.parse(el.dataset.savings || 'null');
  } catch {
    data = null;
  }
  if (!data) return;
  const { before, after, vector } = data;
  if (vector) {
    el.innerHTML = `
      <span class="stat-neutral-label">${t('card.rasterized')}</span>
      <span class="stat-neutral-value">SVG &rarr; ${vector}</span>
    `;
    el.title = t('card.rasterizedTip');
    el.hidden = false;
  } else if (before && after < before) {
    const saved = before - after;
    const pct = Math.round((saved / before) * 100);
    el.innerHTML = `
      <span class="stat-savings-label">${t('card.saved')}</span>
      <span class="stat-savings-value">&minus;${formatBytes(saved)} (&minus;${pct}%)</span>
    `;
    el.hidden = false;
  } else if (before && after > before) {
    // Strictly larger only — an identical size (e.g. the original passed
    // through untouched) used to read "Larger +0 B (+0%)".
    const added = after - before;
    const pct = Math.round((added / before) * 100);
    el.innerHTML = `
      <span class="stat-increase-label">${t('card.larger')}</span>
      <span class="stat-increase-value">+${formatBytes(added)} (+${pct}%)</span>
    `;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

/**
 * Set an image card's "processed" aria-label from its stored output numbers.
 * @param {HTMLElement} card
 */
function setProcessedAria(card) {
  try {
    const { width, height, bytes } = JSON.parse(card.dataset.ariaOut);
    card.setAttribute(
      'aria-label',
      t('card.ariaProcessed', { width, height, size: formatBytes(bytes) })
    );
  } catch {
    /* no stored output */
  }
}

/**
 * Render a PDF card's "N pages · size" line from its data attributes.
 * @param {HTMLElement} el
 */
function renderPdfMetaLine(el) {
  const size = formatBytes(Number(el.dataset.bytesTotal) || 0);
  const pages = el.dataset.pages;
  el.textContent =
    pages !== undefined
      ? `${t('card.pdfPages', { count: Number(pages) })} · ${size}`
      : `${t('card.pdfPagesLoading')} · ${size}`;
}

/**
 * Re-render the locale-dependent values on every preview card after a language
 * switch (LAB-28). Static labels, tooltips and aria text carry data-i18n markers
 * and are re-translated by applyStaticTranslations(); this handles what's
 * computed — file sizes, decimal ratios, savings rows and PDF page lines — from
 * the raw numbers stored on each element.
 */
export function relocalizePreviewCards() {
  const list = previewList();
  if (!list) return;
  list.querySelectorAll('[data-bytes]').forEach((el) => {
    el.textContent = formatBytes(Number(el.dataset.bytes) || 0);
  });
  list.querySelectorAll('[data-ratio]').forEach((el) => {
    const [w, h] = el.dataset.ratio.split(':').map(Number);
    if (w > 0 && h > 0) el.textContent = getAspectRatioLabel(w, h);
  });
  list.querySelectorAll('[data-savings]').forEach((el) => renderSavingsRow(el));
  list.querySelectorAll('[data-aria-out]').forEach((el) => setProcessedAria(el));
  list.querySelectorAll('.pdf-meta-line').forEach((el) => renderPdfMetaLine(el));
}

/**
 * Short display label for an output MIME type ("image/jpeg" → "JPG").
 * @param {string} [mime]
 * @returns {string}
 */
function rasterFormatLabel(mime) {
  const sub = String(mime || '').split('/')[1] || '';
  if (sub === 'jpeg') return 'JPG';
  return sub ? sub.toUpperCase() : 'PNG';
}

/**
 * Get a friendly aspect ratio label (e.g. "16:9", "4:3", "1:1")
 */
function getAspectRatioLabel(w, h) {
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  // Only show the ratio if it simplifies to something readable
  if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
  // Fall back to decimal ratio
  const ratio = w / h;
  return formatNumber(ratio, 2) + ':1';
}

function gcd(a, b) {
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Escape HTML entities for safe text-content interpolation.
 * Use when interpolating user-controlled values inside `>...<` text nodes.
 * Local copy matches the helper in history.js / toast.js — to be consolidated
 * into src/modules/shared/ in Phase 2.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Escape quotes for safe attribute-value interpolation.
 * Use when interpolating user-controlled values inside `"..."` attribute values.
 * Quote-only escaping is sufficient for quoted attribute contexts: `<`, `>`,
 * and other HTML metacharacters cannot break out of a correctly-quoted value.
 */
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
