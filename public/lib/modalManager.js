/**
 * modalManager.js
 * ----------------------------------------------------------------------
 * Small, dependency-free utility for making any modal/overlay element
 * keyboard-accessible: it traps focus inside the modal while it is open,
 * restores focus to whatever triggered it on close, and closes on Escape.
 *
 * This module does NOT show/hide anything itself (no opinion on your
 * `.hidden` class, `hidden` attribute, or animation strategy) — call
 * `openModal()`/`closeModal()` alongside your own show/hide logic.
 *
 * Usage:
 *   import { openModal, closeModal } from "./modalManager.js";
 *
 *   function showThing() {
 *     const modal = document.getElementById("myModal");
 *     modal.hidden = false;
 *     modal.classList.add("active");
 *     openModal(modal, {
 *       onClose: () => {
 *         // called on Escape (or when something else calls closeModal
 *         // with no explicit close-your-own-UI step) — do your hide work
 *         // here AND call closeModal(modal) if you haven't already.
 *         modal.hidden = true;
 *         modal.classList.remove("active");
 *         closeModal(modal);
 *       }
 *     });
 *   }
 *
 *   function hideThingViaOwnButton() {
 *     const modal = document.getElementById("myModal");
 *     modal.hidden = true;
 *     modal.classList.remove("active");
 *     closeModal(modal); // always pair every openModal() with a closeModal()
 *   }
 *
 * Behavior:
 *   - openModal(modalEl, { onClose }): remembers document.activeElement,
 *     moves focus to the first focusable element inside modalEl (or to
 *     modalEl itself, given a tabindex="-1", if nothing focusable exists),
 *     and attaches a keydown listener scoped to modalEl that:
 *       (a) calls onClose() on Escape (falls back to closeModal(modalEl)
 *           if no onClose was supplied), and
 *       (b) cycles Tab / Shift+Tab focus between the first and last
 *           focusable elements inside modalEl so focus can never leave
 *           the modal while it is open.
 *   - closeModal(modalEl): removes the keydown listener added by
 *     openModal and restores focus to the element that was focused
 *     before the modal opened. Safe to call even if openModal was never
 *     called for that element (no-op).
 *
 * IMPORTANT: every openModal() call must be paired with a matching
 * closeModal() call whenever the modal is dismissed — including via
 * click-outside handlers or dedicated close buttons wired elsewhere —
 * otherwise the focus trap keeps listening on a hidden element.
 */

const registry = new WeakMap();

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusableElements(modalEl) {
  return Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * Open a modal: capture the currently focused element, move focus inside
 * the modal, and trap Tab/Shift+Tab + Escape within it.
 * @param {HTMLElement} modalEl
 * @param {{ onClose?: () => void }} [options]
 */
export function openModal(modalEl, { onClose } = {}) {
  if (!modalEl || typeof document === "undefined") return;

  if (registry.has(modalEl)) {
    closeModal(modalEl);
  }

  const lastFocused = document.activeElement;

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (typeof onClose === "function") {
        onClose();
      } else {
        closeModal(modalEl);
      }
      return;
    }

    if (event.key === "Tab") {
      const focusable = getFocusableElements(modalEl);
      if (!focusable.length) {
        event.preventDefault();
        modalEl.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  modalEl.addEventListener("keydown", handleKeydown);
  registry.set(modalEl, { lastFocused, handleKeydown });

  const focusable = getFocusableElements(modalEl);
  if (focusable.length) {
    focusable[0].focus();
  } else {
    if (!modalEl.hasAttribute("tabindex")) modalEl.setAttribute("tabindex", "-1");
    modalEl.focus();
  }
}

/**
 * Close a modal previously opened with openModal(): remove the trap
 * listener and restore focus to whatever was focused before it opened.
 * @param {HTMLElement} modalEl
 */
export function closeModal(modalEl) {
  if (!modalEl) return;
  const entry = registry.get(modalEl);
  if (!entry) return;

  modalEl.removeEventListener("keydown", entry.handleKeydown);
  registry.delete(modalEl);

  if (entry.lastFocused && typeof entry.lastFocused.focus === "function") {
    entry.lastFocused.focus();
  }
}

/**
 * @param {HTMLElement} modalEl
 * @returns {boolean} true if openModal() is currently tracking this element
 */
export function isModalOpen(modalEl) {
  return registry.has(modalEl);
}
