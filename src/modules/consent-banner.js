/**
 * consent-banner.js
 * Cookie-consent banner wired to Google Consent Mode v2, privacy-first variant.
 *
 * Posture: NOTHING is sent to Google until the visitor opts in — not even the
 * GTM library. Google Tag Manager is loaded here, on consent, rather than from
 * a static snippet in the page. Before consent there are zero `googletagmanager`
 * requests. This is the robust way to get "no beacons until consent" on a
 * single-page app: tag-level consent blocking would stop the GA4 config tag
 * (Initialization-triggered) from ever firing if the visitor accepts after load,
 * since a consent change doesn't re-fire that trigger.
 *
 * `window.gtag` and the default-denied Consent Mode state are established by the
 * inline snippet in index.html <head>. That snippet is stripped from the
 * portable single-file build, so `window.gtag` is absent there — we gate on it,
 * so the banner never shows and GTM never loads in the portable file.
 *
 * Choice is persisted in localStorage. Visuals reuse the shared `.btn` classes
 * and the app's design tokens.
 */

import { t } from './i18n.js';

const STORAGE_KEY = 'pixeldrop-consent'; // 'granted' | 'denied' | null (undecided)

let bannerEl = null;
let gtmLoaded = false;

/**
 * Initialize the consent banner.
 * @param {HTMLElement} [settingsTrigger] - Footer "Cookie settings" element that
 *   reopens the banner so the visitor can change their choice anytime.
 */
export function initConsentBanner(settingsTrigger) {
  // No analytics on this page (e.g. the portable single-file build) → nothing
  // to consent to and no GTM to load.
  if (typeof window.gtag !== 'function') return;

  if (settingsTrigger) {
    settingsTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      showBanner();
    });
  }

  const choice = loadChoice();
  if (choice === 'granted') {
    // Returning visitor who already opted in — honor it: load GTM now.
    grantConsent();
  } else if (choice === null) {
    // First visit — ask.
    showBanner();
  }
  // 'denied' → do nothing: no banner, no GTM.
}

function showBanner() {
  if (bannerEl) return;

  bannerEl = document.createElement('div');
  bannerEl.className = 'consent-banner';
  bannerEl.setAttribute('role', 'dialog');
  bannerEl.setAttribute('aria-label', t('consent.aria'));
  bannerEl.setAttribute('aria-live', 'polite');

  bannerEl.innerHTML = `
    <p class="consent-banner-text">
      ${t('consent.text')}
      <button type="button" class="consent-banner-learn" data-action="learn">${t('consent.learn')}</button>
    </p>
    <div class="consent-banner-actions">
      <button type="button" class="btn btn-secondary btn-sm" data-action="decline">${t('consent.decline')}</button>
      <button type="button" class="btn btn-primary btn-sm" data-action="accept">${t('consent.accept')}</button>
    </div>
  `;

  bannerEl.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'accept') grantConsent();
    else if (action === 'decline') declineConsent();
    else if (action === 'learn') {
      // Reuse the already-wired footer Privacy modal rather than coupling here.
      document.getElementById('privacyLink')?.click();
    }
  });

  document.body.appendChild(bannerEl);
}

function removeBanner() {
  if (bannerEl) {
    bannerEl.remove();
    bannerEl = null;
  }
}

/** Opt in: persist, update Consent Mode, and load GTM (once). */
function grantConsent() {
  storeChoice('granted');
  window.gtag('consent', 'update', { analytics_storage: 'granted' });
  loadGtm();
  removeBanner();
}

/** Opt out: persist and keep analytics denied. GTM is never loaded. */
function declineConsent() {
  storeChoice('denied');
  window.gtag('consent', 'update', { analytics_storage: 'denied' });
  removeBanner();
}

/**
 * Load the GTM container exactly once. The actual loader lives in the inline
 * head snippet (window.__pdLoadGtm) so the GTM URL/ID stay out of the JS bundle
 * and are stripped from the portable single-file build. Absent there → no-op.
 */
function loadGtm() {
  if (gtmLoaded) return;
  gtmLoaded = true;
  if (typeof window.__pdLoadGtm === 'function') window.__pdLoadGtm();
}

function storeChoice(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked — the choice still applies for this page load via the
    // Consent Mode update / GTM load; it just won't persist across reloads.
  }
}

function loadChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
