// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 321Enterprise
/**
 * error-reporter.js
 * Surfaces UNCAUGHT runtime errors so failures aren't silent, and offers a
 * one-click email report. Handled failures (processing / PDF / ZIP) already show
 * toasts; this catches the gap — `window.onerror` and unhandled promise
 * rejections — and shows a small, dismissible strip at the bottom of the page.
 *
 * Privacy: the email report (a `mailto:` draft the user reviews before sending —
 * no backend) includes only the error text, a trimmed stack, and environment
 * (app version + browser). It never includes file names or file contents.
 */

import { t } from './i18n.js';

const CONTACT = 'office@321enterprise.com';
const MAX_ERRORS = 10; // keep only the most recent
const MAX_MSG = 500;
const MAX_STACK = 1200;

/** @type {{message:string, stack:string, where:string, at:string}[]} */
const errors = [];
let strip = null;
let detailsOpen = false;

/** Install the global handlers. Call once, as early as possible. */
export function initErrorReporter() {
  window.addEventListener('error', (e) => {
    // Ignore resource-load errors (img/script) — those have no .message and the
    // target is an element; we only want actual JS exceptions.
    if (!e || !e.message) return;
    record(e.message, e.error?.stack, joinWhere(e.filename, e.lineno, e.colno));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    const message = r?.message || (typeof r === 'string' ? r : 'Unhandled promise rejection');
    record(message, r?.stack, '');
  });
}

function joinWhere(file, line, col) {
  if (!file) return '';
  const base = String(file).split('/').pop();
  return line ? `${base}:${line}:${col || 0}` : base;
}

function record(message, stack, where) {
  errors.push({
    message: String(message).slice(0, MAX_MSG),
    stack: stack ? String(stack).slice(0, MAX_STACK) : '',
    where: where || '',
    at: new Date().toISOString(),
  });
  if (errors.length > MAX_ERRORS) errors.shift();
  try {
    renderStrip();
  } catch {
    /* never let the reporter throw */
  }
}

function renderStrip() {
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'error-strip';
    strip.setAttribute('role', 'alert');
    strip.setAttribute('aria-live', 'assertive');
    strip.innerHTML = `
      <div class="error-strip-bar">
        <span class="error-strip-msg" id="errStripMsg"></span>
        <div class="error-strip-actions">
          <button type="button" class="error-strip-btn" data-act="details" id="errStripDetailsBtn"></button>
          <button type="button" class="error-strip-btn error-strip-report" data-act="report"></button>
          <button type="button" class="error-strip-close" data-act="dismiss" aria-label="${escapeAttr(t('errs.dismiss'))}">&times;</button>
        </div>
      </div>
      <pre class="error-strip-details" id="errStripDetails" hidden></pre>`;
    // Mount in-flow at the bottom of the content area (not a fixed full-width
    // bar), so it reads as a quiet notice rather than a loud banner.
    const mount = document.getElementById('contentArea') || document.body;
    mount.appendChild(strip);
    strip.addEventListener('click', onStripClick);
  }
  strip.hidden = false;
  setText('#errStripMsg', t('errs.summary', { count: errors.length }));
  setText('#errStripDetailsBtn', detailsOpen ? t('errs.hideDetails') : t('errs.details'));
  strip.querySelector('[data-act="report"]').textContent = t('errs.report');
  if (detailsOpen) renderDetails();
}

function onStripClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'details') {
    detailsOpen = !detailsOpen;
    const d = strip.querySelector('#errStripDetails');
    if (d) d.hidden = !detailsOpen;
    setText('#errStripDetailsBtn', detailsOpen ? t('errs.hideDetails') : t('errs.details'));
    if (detailsOpen) renderDetails();
  } else if (act === 'report') {
    openReport();
  } else if (act === 'dismiss') {
    strip.hidden = true;
    detailsOpen = false;
    const d = strip.querySelector('#errStripDetails');
    if (d) d.hidden = true;
  }
}

function renderDetails() {
  const d = strip.querySelector('#errStripDetails');
  if (!d) return;
  d.textContent = errors
    .map((e, i) => `#${i + 1} ${e.message}${e.where ? ` (${e.where})` : ''}`)
    .join('\n');
}

/** App version from the footer (no build-time constant needed). */
function appVersion() {
  return document.getElementById('footerVersion')?.textContent?.trim() || 'unknown';
}

/** Open a prefilled mailto draft. The user reviews/edits before sending. */
function openReport() {
  const version = appVersion();
  const recent = errors.slice(-5); // cap so the mailto URL stays manageable
  const body = [
    'Describe what you were doing when this happened (optional):',
    '',
    '',
    '--- technical details (no file names or contents) ---',
    `App: PixelGnome ${version}`,
    `Page: ${location.origin}${location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    `Time: ${new Date().toISOString()}`,
    '',
    ...recent.map(
      (e, i) =>
        `#${i + 1} ${e.message}${e.where ? ` (${e.where})` : ''}${e.stack ? `\n${e.stack.slice(0, 600)}` : ''}`
    ),
  ].join('\n');
  const href = `mailto:${CONTACT}?subject=${encodeURIComponent(
    `PixelGnome error report (${version})`
  )}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

function setText(sel, text) {
  const el = strip.querySelector(sel);
  if (el) el.textContent = text;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
