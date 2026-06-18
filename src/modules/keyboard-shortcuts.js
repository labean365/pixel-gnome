/**
 * keyboard-shortcuts.js
 * Global keyboard shortcuts for PixelGnome (Phase 10).
 *
 * Shortcuts:
 *   Ctrl/Cmd + O — Open file picker
 *   Delete / Backspace — Remove the focused preview card
 *   Escape — Close any open modal (if none, deselect)
 *
 * Shortcuts are disabled while a modal (edit, help) is open or focus is
 * inside a text field to avoid conflicting with normal typing.
 */

/**
 * Initialize global keyboard shortcuts.
 * @param {object} opts
 * @param {HTMLInputElement} opts.fileInput — the hidden file input element
 * @param {function(string): void} opts.onRemove — callback to remove an image by id
 * @param {function(): number} opts.queueSize — returns current queue size
 * @param {function(): boolean} [opts.hasSelection] — true when ≥ 1 card is multi-selected (Phase 3b)
 * @param {function(): void} [opts.onDeleteSelection] — remove every currently-selected card (Phase 3b)
 */
export function initKeyboardShortcuts({
  fileInput,
  onRemove,
  queueSize,
  hasSelection,
  onDeleteSelection,
}) {
  document.addEventListener('keydown', (e) => {
    // Skip if a modal is open (edit modal or help modal)
    if (document.querySelector('.crop-modal') || document.querySelector('.help-modal-backdrop')) {
      return;
    }

    // Skip if focus is in a text input, textarea, or select
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const mod = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + O — open file picker
    if (mod && e.key === 'o') {
      e.preventDefault();
      fileInput.click();
      return;
    }

    // Delete / Backspace behavior:
    //  1. If the user has a multi-selection, delete every selected card. This
    //     takes precedence over the focused-card path so pressing Delete after
    //     Shift/Cmd-clicking a range does what you expect.
    //  2. Otherwise, fall back to removing the focused preview card (legacy
    //     single-card path from Phase 10).
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (hasSelection && hasSelection() && onDeleteSelection) {
        e.preventDefault();
        onDeleteSelection();
        return;
      }
      const focusedCard = document.activeElement?.closest('.preview-card');
      if (focusedCard) {
        const id = focusedCard.id.replace('card-', '');
        if (id) {
          e.preventDefault();
          onRemove(id);
        }
      }
    }
  });
}
