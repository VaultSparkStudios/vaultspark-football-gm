function normalizedOrientation(value) {
  return value === "horizontal" ? "horizontal" : "vertical";
}

/**
 * Resolve the next roving-tab index for an ARIA tablist. Returning null means
 * the key is not owned by the tablist and must remain available to the page.
 */
export function resolveTabKeyboardIndex({ key, currentIndex, count, orientation = "vertical" } = {}) {
  const size = Number(count);
  const index = Number(currentIndex);
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(index) || index < 0 || index >= size) return null;
  if (key === "Home") return 0;
  if (key === "End") return size - 1;

  const axis = normalizedOrientation(orientation);
  const forward = axis === "vertical" ? "ArrowDown" : "ArrowRight";
  const backward = axis === "vertical" ? "ArrowUp" : "ArrowLeft";
  if (key === forward) return (index + 1) % size;
  if (key === backward) return (index - 1 + size) % size;
  return null;
}
