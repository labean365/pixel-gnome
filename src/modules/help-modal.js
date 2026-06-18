/**
 * help-modal.js
 * Help & Changelog modal with tabbed interface.
 * Shows a quick-start guide and recent changelog entries.
 */

import { MAX_MEGAPIXELS, MAX_BATCH_SIZE } from './constants.js';
import { getChangelogContent } from './changelog-modal.js';
import { t } from './i18n.js';

let modalBackdrop = null;

// Maps each tab key to its label key (resolved at render time via t() so the
// active locale is respected) and the content generator.
const TABS = {
  guide: { labelKey: 'help.tabGuide', content: getGuideContent },
  shortcuts: { labelKey: 'help.tabTips', content: getTipsContent },
  changelog: { labelKey: 'help.tabChangelog', content: getChangelogContent },
};

/**
 * Initialize the help modal — wire the help button.
 * @param {HTMLElement} triggerBtn - The help button in the header
 */
export function initHelpModal(triggerBtn) {
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => openHelpModal());
  }
}

/**
 * Open the Help modal, optionally on a specific tab.
 * @param {'guide'|'shortcuts'|'changelog'} [initialTab='guide']
 */
export function openHelpModal(initialTab = 'guide') {
  if (modalBackdrop) return; // Already open
  const startTab = TABS[initialTab] ? initialTab : 'guide';

  modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'help-modal-backdrop';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-label', t('help.dialogAria'));
  modalBackdrop.setAttribute('aria-modal', 'true');

  modalBackdrop.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-header">
        <span class="help-modal-title">${t('help.title')}</span>
        <button class="btn btn-icon" data-action="close-help" title="${t('help.close')}" aria-label="${t('help.closeAria')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="help-modal-tabs">
        ${Object.entries(TABS)
          .map(
            ([key, { labelKey }]) =>
              `<button class="help-modal-tab${key === startTab ? ' active' : ''}" data-tab="${key}">${t(labelKey)}</button>`
          )
          .join('')}
      </div>
      <div class="help-modal-body" id="helpModalBody">
        ${TABS[startTab].content()}
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  // Wire events
  modalBackdrop
    .querySelector('[data-action="close-help"]')
    .addEventListener('click', closeHelpModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeHelpModal();
  });

  // Tab switching
  const tabs = modalBackdrop.querySelectorAll('.help-modal-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const body = modalBackdrop.querySelector('#helpModalBody');
      const def = TABS[tab.dataset.tab];
      if (def) body.innerHTML = def.content();
    });
  });

  // Escape to close
  document.addEventListener('keydown', onHelpKeyDown);

  // Focus close button
  modalBackdrop.querySelector('[data-action="close-help"]').focus();
}

function closeHelpModal() {
  document.removeEventListener('keydown', onHelpKeyDown);
  if (modalBackdrop) {
    modalBackdrop.remove();
    modalBackdrop = null;
  }
}

function onHelpKeyDown(e) {
  if (e.key === 'Escape') closeHelpModal();
}

// --- Tab content generators ---

function getGuideContent() {
  return t('help.guideContent');
}

function getTipsContent() {
  return t('help.tipsContent', { max: MAX_MEGAPIXELS, batch: MAX_BATCH_SIZE });
}
