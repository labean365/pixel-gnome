/**
 * lang-switcher.js
 * Globe-icon dropdown that lets the visitor change the UI language.
 *
 * Markup lives in index.html (#langSwitcher / #langToggle / #langMenu); this
 * module builds the menu items from i18n's LANGUAGES list and wires the
 * open/close + selection behavior. Keyboard- and screen-reader-friendly.
 */

import { LANGUAGES, getLocale, setLocale, onLocaleChange } from './i18n.js';

export function initLangSwitcher() {
  const wrap = document.getElementById('langSwitcher');
  const toggle = document.getElementById('langToggle');
  const menu = document.getElementById('langMenu');
  if (!wrap || !toggle || !menu) return;

  // Build one menu item per supported language.
  menu.innerHTML = '';
  LANGUAGES.forEach((lang) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-menu-item';
    btn.setAttribute('role', 'menuitemradio');
    btn.dataset.lang = lang.code;
    btn.textContent = lang.label;
    btn.addEventListener('click', () => {
      setLocale(lang.code);
      close();
      toggle.focus();
    });

    li.appendChild(btn);
    menu.appendChild(li);
  });

  function markActive() {
    const active = getLocale();
    menu.querySelectorAll('.lang-menu-item').forEach((el) => {
      const on = el.dataset.lang === active;
      el.classList.toggle('active', on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function open() {
    menu.hidden = false;
    wrap.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    markActive();
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onKey);
  }

  function close() {
    menu.hidden = true;
    wrap.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onKey);
  }

  function onOutside(e) {
    if (!wrap.contains(e.target)) close();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      toggle.focus();
    }
  }

  toggle.addEventListener('click', () => {
    if (menu.hidden) open();
    else close();
  });

  // Keep the active checkmark in sync if the locale changes elsewhere.
  onLocaleChange(markActive);
  markActive();
}
