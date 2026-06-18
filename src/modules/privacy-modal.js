/**
 * privacy-modal.js
 * Standalone Privacy & Use modal, triggered by the footer "Privacy" link.
 * Mirrors the changelog modal: reuses the shared `.help-modal-*` styles,
 * closes on the X button, backdrop click, or Escape.
 */

import { t } from './i18n.js';

let modalBackdrop = null;

/**
 * Initialize the privacy modal — wire the footer trigger.
 * @param {HTMLElement} triggerEl - The "Privacy" link/button in the footer
 */
export function initPrivacyModal(triggerEl) {
  if (triggerEl) {
    triggerEl.addEventListener('click', openPrivacyModal);
  }
}

function openPrivacyModal() {
  if (modalBackdrop) return;

  modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'help-modal-backdrop';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-label', t('privacy.title'));
  modalBackdrop.setAttribute('aria-modal', 'true');

  modalBackdrop.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-header">
        <span class="help-modal-title">${t('privacy.title')}</span>
        <button class="btn btn-icon" data-action="close-privacy" title="${t('privacy.close')}" aria-label="${t('privacy.closeAria')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="help-modal-body">
        ${getPrivacyContent()}
      </div>
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  modalBackdrop
    .querySelector('[data-action="close-privacy"]')
    .addEventListener('click', closePrivacyModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closePrivacyModal();
  });

  document.addEventListener('keydown', onPrivacyKeyDown);
  modalBackdrop.querySelector('[data-action="close-privacy"]').focus();
}

function closePrivacyModal() {
  document.removeEventListener('keydown', onPrivacyKeyDown);
  if (modalBackdrop) {
    modalBackdrop.remove();
    modalBackdrop = null;
  }
}

function onPrivacyKeyDown(e) {
  if (e.key === 'Escape') closePrivacyModal();
}

function getPrivacyContent() {
  return t('privacy.content');
}
