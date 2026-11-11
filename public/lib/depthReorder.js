// Drag-to-reorder for depth chart rows. Pointer events cover mouse, pen and
// touch with one code path; the grip is a real button, so the keyboard path
// (arrow keys on the focused grip) needs no pointer at all.
//
// The module only reports the intended order. It never saves and never owns
// the list: the caller re-renders from its own state.

const ROW = "tr[data-depth-row]";

function rowIds(table) {
  return [...table.querySelectorAll(ROW)].map((row) => row.dataset.depthRow);
}

/**
 * @param {HTMLTableElement} table
 * @param {{ onReorder: (ids: string[], movedId: string) => void, onStep: (id: string, delta: number) => void }} handlers
 * @returns {() => void} unbind
 */
export function bindDepthReorder(table, { onReorder, onStep }) {
  let drag = null;

  function finish(commit) {
    if (!drag) return;
    const { row, grip, pointerId, startOrder } = drag;
    drag = null;
    row.classList.remove("depth-row--dragging");
    table.classList.remove("depth-board--dragging");
    if (grip.hasPointerCapture?.(pointerId)) grip.releasePointerCapture(pointerId);
    const order = rowIds(table);
    if (commit && order.join("|") !== startOrder.join("|")) onReorder(order, row.dataset.depthRow);
    else if (!commit) onReorder(startOrder, row.dataset.depthRow);
  }

  function onPointerDown(event) {
    const grip = event.target.closest?.("[data-depth-grip]");
    if (!grip || (event.pointerType === "mouse" && event.button !== 0)) return;
    const row = grip.closest(ROW);
    if (!row) return;
    event.preventDefault();
    grip.setPointerCapture?.(event.pointerId);
    drag = { row, grip, pointerId: event.pointerId, startOrder: rowIds(table) };
    row.classList.add("depth-row--dragging");
    table.classList.add("depth-board--dragging");
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const { row } = drag;
    // Move the dragged row past any sibling whose midpoint the pointer crossed.
    for (const other of table.querySelectorAll(ROW)) {
      if (other === row) continue;
      const box = other.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      const isAbove = Boolean(row.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING);
      if (isAbove && event.clientY < middle) {
        other.before(row);
        return;
      }
      if (!isAbove && event.clientY > middle) {
        other.after(row);
        // Keep scanning downward: a fast drag can cross several rows per event.
      }
    }
  }

  function onPointerUp(event) {
    if (drag && event.pointerId === drag.pointerId) finish(true);
  }

  function onPointerCancel(event) {
    if (drag && event.pointerId === drag.pointerId) finish(false);
  }

  function onKeyDown(event) {
    const grip = event.target.closest?.("[data-depth-grip]");
    if (!grip) return;
    if (event.key === "Escape" && drag) {
      finish(false);
      return;
    }
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    onStep(grip.dataset.depthGrip, delta);
  }

  table.addEventListener("pointerdown", onPointerDown);
  table.addEventListener("pointermove", onPointerMove);
  table.addEventListener("pointerup", onPointerUp);
  table.addEventListener("pointercancel", onPointerCancel);
  table.addEventListener("keydown", onKeyDown);
  return () => {
    table.removeEventListener("pointerdown", onPointerDown);
    table.removeEventListener("pointermove", onPointerMove);
    table.removeEventListener("pointerup", onPointerUp);
    table.removeEventListener("pointercancel", onPointerCancel);
    table.removeEventListener("keydown", onKeyDown);
  };
}

/** Put keyboard focus back on a player's grip after the table re-renders. */
export function focusDepthGrip(table, playerId) {
  for (const grip of table.querySelectorAll("[data-depth-grip]")) {
    if (grip.dataset.depthGrip === playerId) {
      grip.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}
