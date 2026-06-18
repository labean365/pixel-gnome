/**
 * crop-history.js
 * Phase 10 undo/redo ring for the edit modal.
 *
 * The modal owns the *content* of each snapshot (edits, crop, locked aspect
 * ratio, etc.) — this controller only owns the ring-buffer mechanics and the
 * undo/redo button state. It doesn't care what's inside a snapshot.
 *
 * Integration contract:
 *   const history = createHistoryController({
 *     modalEl,         // root modal element (for button lookup)
 *     snapshot(),      // return a plain { ... } capturing current edit state
 *     restore(snap),   // apply a snapshot back to the modal
 *     maxDepth: 50,    // optional — defaults to DEFAULT_MAX_HISTORY
 *   });
 *
 *   history.reset();   // record initial state; call on modal open
 *   history.push();    // call BEFORE any transform
 *   history.undo();    // Ctrl+Z
 *   history.redo();    // Ctrl+Y / Ctrl+Shift+Z
 *   history.destroy(); // on modal close — clears the ring
 *
 * The controller wires click handlers on `[data-action="undo"]` and
 * `[data-action="redo"]` inside `modalEl` automatically. Those listeners
 * are GC'd when modalEl is removed from the DOM.
 */

const DEFAULT_MAX_HISTORY = 50;

export function createHistoryController(deps) {
  const { modalEl, snapshot, restore, maxDepth = DEFAULT_MAX_HISTORY } = deps;

  let stack = []; // Array of snapshots
  let index = -1; // Points to the current state

  const undoBtn = modalEl.querySelector('[data-action="undo"]');
  const redoBtn = modalEl.querySelector('[data-action="redo"]');

  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);

  /**
   * Record the current state as the single entry on the stack.
   * Call when the modal opens, so the user can undo back to their starting point.
   */
  function reset() {
    stack = [snapshot()];
    index = 0;
    updateButtons();
  }

  /**
   * Snapshot the current state. Truncates any redo tail past the current index.
   * Call BEFORE applying a transform so the pre-transform state is preserved.
   */
  function push() {
    stack = stack.slice(0, index + 1);
    stack.push(snapshot());
    if (stack.length > maxDepth) stack.shift();
    index = stack.length - 1;
    updateButtons();
  }

  function undo() {
    if (index <= 0) return;
    // If we're at the tip, save current state first so redo can restore it
    if (index === stack.length - 1) {
      stack.push(snapshot());
    }
    index--;
    restore(stack[index]);
    updateButtons();
  }

  function redo() {
    if (index >= stack.length - 1) return;
    index++;
    restore(stack[index]);
    updateButtons();
  }

  function updateButtons() {
    if (undoBtn) undoBtn.disabled = index <= 0;
    if (redoBtn) redoBtn.disabled = index >= stack.length - 1;
  }

  function destroy() {
    stack = [];
    index = -1;
    // Button listeners are GC'd with modalEl.remove().
  }

  return {
    reset,
    push,
    undo,
    redo,
    updateButtons,
    destroy,
  };
}
