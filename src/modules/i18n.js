/**
 * i18n.js
 * Tiny, dependency-free internationalization runtime for PixelGnome.
 *
 * Design (see docs/i18n-Plan-2026-06.md):
 *  - Locale dictionaries are plain nested objects, bundled at build time
 *    (so the portable single-file build stays self-contained — no fetches).
 *  - t(key, vars) resolves a dotted key, interpolates {placeholders}, and
 *    supports simple pluralization via a { count } var + .one/.other branches.
 *  - Missing keys fall back to English, then to the raw key — a half-finished
 *    translation never shows a blank.
 *  - Language preference is stored in localStorage only (privacy-first); it is
 *    never sent anywhere. Detection reads navigator.language locally.
 *
 * Adding a language is intentionally trivial (planned for: es, de, fr, …):
 *  1. create src/locales/<code>.js with the same key tree as en.js
 *  2. import it here and add it to DICTS + LANGUAGES
 * No other code changes are required.
 */

import en from '../locales/en.js';
import it from '../locales/it.js';

const STORAGE_KEY = 'pixelgnome-lang';
const FALLBACK = 'en';

/** Registered dictionaries, keyed by language code. */
const DICTS = { en, it };

/**
 * Languages offered in the switcher, in display order.
 * `label` is the language's own endonym (shown the same in every UI language).
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
];

let currentLang = FALLBACK;
const listeners = new Set();

/* ------------------------------------------------------------------ */
/* Lookup + interpolation                                              */
/* ------------------------------------------------------------------ */

/** Walk a dotted path ("toast.copied") through a nested object. */
function resolve(dict, key) {
  if (!dict) return undefined;
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

/** Replace {name} tokens in `str` from `vars`. */
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
  );
}

/**
 * Translate a key.
 * @param {string} key   Dotted key, e.g. "size.heading".
 * @param {object} [vars] Interpolation vars. If `count` is present and the
 *                        resolved entry is an object with .one/.other, the
 *                        plural form is chosen automatically.
 * @returns {string}
 */
export function t(key, vars) {
  let entry = resolve(DICTS[currentLang], key);
  if (entry === undefined) entry = resolve(DICTS[FALLBACK], key);
  if (entry === undefined) return key; // last-resort: show the key, never blank

  // Plural: entry is { one, other } and a count was supplied.
  if (entry && typeof entry === 'object' && vars && typeof vars.count === 'number') {
    entry = vars.count === 1 ? entry.one : entry.other;
    if (entry === undefined) return key;
  }

  if (typeof entry !== 'string') return key;
  return interpolate(entry, vars);
}

/* ------------------------------------------------------------------ */
/* Locale state                                                       */
/* ------------------------------------------------------------------ */

export function getLocale() {
  return currentLang;
}

function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(DICTS, code);
}

function loadStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage blocked — language just won't be remembered */
  }
}

/**
 * Resolve the starting locale: stored choice → navigator.language → en.
 * @returns {string}
 */
export function detectLocale() {
  const stored = loadStored();
  if (stored && isSupported(stored)) return stored;

  const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const prefix = navLang.split('-')[0];
  if (isSupported(prefix)) return prefix;

  return FALLBACK;
}

/**
 * Subscribe to locale changes. Returns an unsubscribe fn.
 * @param {(code: string) => void} fn
 */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Set the active locale, persist it, update <html lang>, re-apply static
 * translations, and notify subscribers (so dynamic views can re-render).
 * @param {string} code
 */
export function setLocale(code) {
  if (!isSupported(code) || code === currentLang) {
    if (isSupported(code)) currentLang = code;
    document.documentElement.lang = currentLang;
    return;
  }
  currentLang = code;
  persist(code);
  document.documentElement.lang = code;
  applyStaticTranslations(document);
  listeners.forEach((fn) => {
    try {
      fn(code);
    } catch {
      /* a listener throwing must not break the switch */
    }
  });
}

/* ------------------------------------------------------------------ */
/* Static DOM translation                                             */
/* ------------------------------------------------------------------ */

/**
 * Translate static markup in `root`.
 *  - [data-i18n="key"]               → textContent
 *  - [data-i18n-html="key"]          → innerHTML (for copy that contains markup)
 *  - [data-i18n-attr="attr:key;..."] → setAttribute for each pair
 * The original English text stays in the HTML as the SEO/default content; this
 * overwrites it for the active locale (and harmlessly re-sets English for en).
 * @param {ParentNode} [root=document]
 */
export function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.getAttribute('data-i18n-attr')
      .split(';')
      .forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s && s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
  });
}

/**
 * One-time boot: resolve the locale and apply it. Call early in main.js.
 */
export function initI18n() {
  currentLang = detectLocale();
  document.documentElement.lang = currentLang;
  applyStaticTranslations(document);
  return currentLang;
}
