/**
 * theme.js
 * Manual dark/light mode toggle with system-preference fallback.
 * Stores user preference in localStorage. If no preference is set,
 * defaults to the system's prefers-color-scheme on first load.
 *
 * Two-state toggle: light ↔ dark. Each click always produces a
 * visible change, avoiding the "silent" third state (system) that
 * made the previous three-state cycle appear broken on one out of
 * every three clicks.
 */

const STORAGE_KEY = 'pixeldrop-theme';

let currentTheme = null; // 'light' or 'dark'

/**
 * Initialize the theme toggle
 * @param {HTMLButtonElement} toggleBtn - The toggle button element
 */
export function initTheme(toggleBtn) {
  // Load saved preference, or fall back to system preference
  const saved = loadPreference();

  if (saved === 'light' || saved === 'dark') {
    currentTheme = saved;
  } else {
    // First visit — adopt the system preference as the starting point
    currentTheme = getSystemTheme();
  }

  applyTheme(currentTheme);

  // Simple two-state toggle: light ↔ dark
  toggleBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
    savePreference(currentTheme);
  });

  // Listen for system theme changes — only update if user hasn't saved a preference
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!loadPreference()) {
      currentTheme = e.matches ? 'dark' : 'light';
      applyTheme(currentTheme);
    }
  });
}

/**
 * Apply theme to the document
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Get the system's preferred color scheme
 */
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function savePreference(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // silent
  }
}
