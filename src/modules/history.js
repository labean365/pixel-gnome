/**
 * history.js
 * Processing history drawer with localStorage persistence.
 * Stores metadata only (no image blobs) — filename, sizes, settings, timestamp.
 */

import { formatBytes } from './preview.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'pixeldrop-history';
const MAX_HISTORY_ENTRIES = 100;
const SCHEMA_VERSION = 1;
// Session-scoped flag: true after we have auto-expanded the drawer once in
// this tab/session. Used to avoid re-opening the drawer on every single
// export (Phase 3 — 3a polish).
const SESSION_AUTO_EXPANDED_KEY = 'pixeldrop-history-auto-expanded';

let historyData = [];
let containerEl = null;
let listEl = null;
let toggleBtn = null;
let clearBtn = null;
let countEl = null;
let isExpanded = true;

/**
 * Initialize the history drawer — creates DOM and loads from localStorage
 */
export function initHistory() {
  loadFromStorage();
  createHistoryDOM();
  renderHistory();
}

/**
 * Add an entry to history
 * @param {Object} entry
 * @param {string} entry.filename - Original filename
 * @param {string} entry.outputFilename - Output filename
 * @param {number} entry.originalSize - Original file size (bytes)
 * @param {number} entry.outputSize - Output file size (bytes)
 * @param {number} entry.outputWidth
 * @param {number} entry.outputHeight
 * @param {string} entry.format - Output format
 * @param {number} entry.quality - Quality setting
 * @param {string} entry.mode - Resize mode
 * @param {string} entry.preset - Preset ID used
 */
export function addHistoryEntry(entry) {
  const record = {
    ...entry,
    timestamp: Date.now(),
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  historyData.unshift(record);

  // Cap history length
  if (historyData.length > MAX_HISTORY_ENTRIES) {
    historyData = historyData.slice(0, MAX_HISTORY_ENTRIES);
  }

  saveToStorage();
  renderHistory();

  // Auto-expand the drawer ONCE per browser session so first-time / returning
  // users discover it without re-opening it on every subsequent export.
  // sessionStorage scope is per-tab and clears on tab close — exactly what
  // we want. Wrapped in try/catch so Safari file:// (where sessionStorage
  // can be blocked) doesn't throw on persistence.
  if (!isExpanded) {
    let autoExpandedThisSession = false;
    try {
      autoExpandedThisSession = sessionStorage.getItem(SESSION_AUTO_EXPANDED_KEY) === '1';
    } catch {
      // sessionStorage unavailable — fall through and skip the once-per-session
      // gate. A lost drawer-open on incognito/file:// is an acceptable
      // degradation.
      autoExpandedThisSession = true;
    }
    if (!autoExpandedThisSession) {
      toggleExpanded();
      try {
        sessionStorage.setItem(SESSION_AUTO_EXPANDED_KEY, '1');
      } catch {
        // Non-fatal; drawer stays open for this export.
      }
    }
  }
}

/**
 * Clear all history
 */
export function clearHistory() {
  historyData = [];
  saveToStorage();
  renderHistory();
}

// --- localStorage ---

function migrateHistory(data, fromVersion) {
  void fromVersion;
  if (!Array.isArray(data)) return [];
  // Keep any entry that's at least an object with a filename — render layer
  // already renders missing fields as "—". Cap at MAX_HISTORY_ENTRIES.
  return data
    .filter((e) => e && typeof e === 'object' && typeof e.filename === 'string')
    .slice(0, MAX_HISTORY_ENTRIES);
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      historyData = [];
      return;
    }
    const parsed = JSON.parse(raw);

    // Legacy blob (pre-envelope) — bare array.
    if (Array.isArray(parsed)) {
      historyData = migrateHistory(parsed, 0);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
      historyData = [];
      return;
    }

    // Future version — preserve, fall back to empty.
    if (parsed.schemaVersion > SCHEMA_VERSION) {
      try {
        localStorage.setItem(`${STORAGE_KEY}.backup`, raw);
      } catch {
        /* best-effort */
      }
      console.warn(
        `PixelGnome: ${STORAGE_KEY} has unsupported schemaVersion ${parsed.schemaVersion}; preserved blob in ${STORAGE_KEY}.backup`
      );
      historyData = [];
      return;
    }

    historyData = migrateHistory(parsed.data, parsed.schemaVersion);
  } catch {
    historyData = [];
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: historyData })
    );
  } catch {
    console.warn('PixelGnome: Failed to save history to localStorage');
  }
}

// --- DOM ---

function createHistoryDOM() {
  // Find the content area to append to
  const contentArea = document.querySelector('.content-area');
  if (!contentArea) return;

  containerEl = document.createElement('div');
  containerEl.className = 'history-drawer';
  containerEl.id = 'historyDrawer';

  containerEl.innerHTML = `
    <div class="history-header">
      <button class="history-toggle" id="historyToggle" type="button" aria-expanded="true">
        <svg class="history-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span class="panel-heading">${t('history.heading')}</span>
        <span class="history-count" id="historyCount">0</span>
      </button>
      <button class="btn btn-icon btn-danger" id="historyClearBtn" type="button" title="${t('history.clearTitle')}" aria-label="${t('history.clearAria')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
    <div class="history-list" id="historyList"></div>
  `;

  contentArea.appendChild(containerEl);

  // Wire events
  toggleBtn = containerEl.querySelector('#historyToggle');
  clearBtn = containerEl.querySelector('#historyClearBtn');
  listEl = containerEl.querySelector('#historyList');
  countEl = containerEl.querySelector('#historyCount');

  toggleBtn.addEventListener('click', toggleExpanded);
  clearBtn.addEventListener('click', () => {
    clearHistory();
  });
}

function toggleExpanded() {
  isExpanded = !isExpanded;
  toggleBtn.setAttribute('aria-expanded', isExpanded);
  containerEl.classList.toggle('collapsed', !isExpanded);
}

function renderHistory() {
  if (!listEl || !countEl) return;

  countEl.textContent = historyData.length;

  // Hide the drawer entirely if no history
  if (historyData.length === 0) {
    containerEl.style.display = 'none';
    return;
  }

  containerEl.style.display = '';

  listEl.innerHTML = historyData
    .map(
      (entry) => `
    <div class="history-entry">
      <div class="history-entry-main">
        <span class="history-entry-name" title="${escapeAttr(entry.outputFilename)}">${escapeHtml(entry.outputFilename)}</span>
        <span class="history-entry-time">${relativeTime(entry.timestamp)}</span>
      </div>
      <div class="history-entry-details">
        <span>${entry.outputWidth} &times; ${entry.outputHeight}</span>
        <span>${entry.format.toUpperCase()} ${Math.round(entry.quality * 100)}%</span>
        <span>${formatBytes(entry.originalSize)} &rarr; ${formatBytes(entry.outputSize)}</span>
        <span class="history-entry-savings">${calcSavings(entry.originalSize, entry.outputSize)}</span>
      </div>
    </div>
  `
    )
    .join('');
}

// --- Helpers ---

function relativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return t('history.timeJustNow');
  if (seconds < 60) return t('history.timeSeconds', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('history.timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('history.timeHours', { n: hours });
  const days = Math.floor(hours / 24);
  return t('history.timeDays', { n: days });
}

function calcSavings(originalSize, outputSize) {
  if (originalSize === 0) return '';
  const pct = Math.round((1 - outputSize / originalSize) * 100);
  if (pct <= 0) return '';
  return `(-${pct}%)`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
