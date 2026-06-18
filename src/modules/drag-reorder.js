/**
 * drag-reorder.js
 * HTML5 drag-and-drop reordering for preview cards (Phase 3c).
 *
 * Responsibilities:
 *  - Treat every `.preview-card` inside `previewListEl` as a draggable item.
 *  - Paint a horizontal drop indicator at the nearest card edge during drag.
 *  - When the user drops, report the source/target ids + whether the drop
 *    lands before or after the target so `main.js` can rebuild the queue
 *    order and the DOM to match.
 *
 * Deliberately dumb: this module owns none of the queue state — it only
 * knows DOM ids. The `onReorder(sourceId, targetId, insertBefore)` callback
 * is the single integration point with the rest of the app.
 *
 * Known limitations (acceptable for v1 per the update plan):
 *  - Does not auto-scroll when dragging near the viewport edges; large
 *    queues require manual scroll mid-drag.
 *  - Drop on the list background (not on any card) is a no-op. Drop-at-end
 *    works by dropping on the bottom half of the last card.
 */

/**
 * Wire drag-reorder handlers on the preview list root. Safe to call once at
 * boot — the same listeners remain live across queue mutations since they're
 * delegated from the parent.
 *
 * @param {HTMLElement} previewListEl - The `.preview-list` container
 * @param {(sourceId: string, targetId: string, insertBefore: boolean) => void} onReorder
 *   Called when the user completes a drop. `insertBefore === true` means
 *   the source should land directly above the target; `false` means directly
 *   below.
 */
export function initDragReorder(previewListEl, onReorder) {
  if (!previewListEl) return;

  /** @type {string | null} */
  let draggedId = null;

  previewListEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.preview-card');
    // Abort drags initiated from elements that aren't cards (safety net —
    // shouldn't happen since only cards have `draggable="true"`, but Firefox
    // occasionally fires dragstart from descendants).
    if (!card || !previewListEl.contains(card)) {
      e.preventDefault();
      return;
    }

    draggedId = card.id.replace(/^card-/, '');
    card.classList.add('dragging');

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox requires non-empty payload to initiate a drag. The value
      // itself is unused — drop target logic reads `draggedId` from closure.
      e.dataTransfer.setData('text/plain', draggedId);
    }
  });

  previewListEl.addEventListener('dragend', () => {
    // Best-effort cleanup — dragend fires whether or not the drop succeeded.
    clearIndicators(previewListEl);
    draggedId = null;
  });

  previewListEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    // preventDefault is required to mark the element as a valid drop target;
    // without it the `drop` event never fires.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    const card = e.target.closest('.preview-card');
    if (!card) return;
    // Don't show an indicator on the card being dragged — it's the source.
    if (card.id === `card-${draggedId}`) {
      clearIndicators(previewListEl);
      return;
    }

    // Split each card into top / bottom halves for the drop position.
    const rect = card.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;

    clearIndicators(previewListEl);
    card.classList.add(insertBefore ? 'drop-before' : 'drop-after');
  });

  previewListEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const source = draggedId;
    if (!source) return;

    const targetCard = e.target.closest('.preview-card');
    clearIndicators(previewListEl);
    if (!targetCard) return;

    const targetId = targetCard.id.replace(/^card-/, '');
    if (targetId === source) return;

    // Re-read where the indicator landed — the dragover handler stashed this
    // via the drop-before / drop-after class on the target card.
    const insertBefore = targetCard.classList.contains('drop-before');
    // Fallback: if neither class was applied (edge case when the cursor
    // teleports), recompute from the current pointer position.
    let finalInsertBefore = insertBefore;
    if (!insertBefore && !targetCard.classList.contains('drop-after')) {
      const rect = targetCard.getBoundingClientRect();
      finalInsertBefore = e.clientY < rect.top + rect.height / 2;
    }

    onReorder(source, targetId, finalInsertBefore);
  });
}

/**
 * Strip every transient drag indicator from the list. Called both during
 * dragover (before applying the next one) and on drop/dragend so the UI
 * never keeps a stale blue line after the gesture ends.
 * @param {HTMLElement} previewListEl
 */
function clearIndicators(previewListEl) {
  for (const el of previewListEl.querySelectorAll('.drop-before, .drop-after')) {
    el.classList.remove('drop-before', 'drop-after');
  }
}
