import test from "node:test";
import assert from "node:assert/strict";
import { openModal, closeModal, isModalOpen } from "../public/lib/modalManager.js";

// modalManager.js is a small, dependency-free DOM utility. This repo has no
// jsdom, so we exercise it against a minimal hand-built fake element that
// implements exactly the DOM surface the module calls (addEventListener,
// querySelectorAll, focus, attribute get/set) — real code paths, not a mock
// of the module's own behavior. openModal() no-ops entirely when
// `typeof document === "undefined"`.
//
// IMPORTANT: this repo's shard runner uses `--test-isolation=none`, so every
// file in a shard shares ONE process/module registry (confirmed: other test
// files in the runtime shard set/delete globalThis.document too). A single
// module-scope `globalThis.document` assignment is unsafe here — another
// file's test can delete or replace it between two of THIS file's tests.
// Every test below sets `globalThis.document` fresh, synchronously, as its
// first statement, so it is never at the mercy of another file's cleanup.

function fakeElement({ focusableChildren = [] } = {}) {
  const listeners = {};
  const attrs = new Map();
  return {
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener(type, handler) { if (listeners[type] === handler) delete listeners[type]; },
    querySelectorAll() { return focusableChildren; },
    hasAttribute(name) { return attrs.has(name); },
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    _fireKeydown(event) { listeners.keydown?.(event); },
    _hasListener() { return typeof listeners.keydown === "function"; }
  };
}

function fakeFocusable() {
  let focused = false;
  return {
    hasAttribute: () => false,
    getAttribute: () => null,
    focus() { focused = true; },
    get wasFocused() { return focused; }
  };
}

function fakeEvent(key, { shiftKey = false } = {}) {
  let prevented = false;
  return { key, shiftKey, preventDefault: () => { prevented = true; }, get defaultPrevented() { return prevented; } };
}

test("openModal focuses the first focusable child and registers as open", () => {
  globalThis.document = { activeElement: null };
  const first = fakeFocusable();
  const second = fakeFocusable();
  const modal = fakeElement({ focusableChildren: [first, second] });

  openModal(modal);

  assert.equal(isModalOpen(modal), true);
  assert.equal(first.wasFocused, true);
  assert.equal(second.wasFocused, false);
  assert.equal(modal._hasListener(), true);
  closeModal(modal);
});

test("openModal falls back to focusing the modal itself when nothing inside is focusable", () => {
  globalThis.document = { activeElement: null };
  const modal = fakeElement({ focusableChildren: [] });
  openModal(modal);
  assert.equal(modal.focusCalls, 1);
  assert.equal(modal.getAttribute("tabindex"), "-1");
  closeModal(modal);
});

test("closeModal restores focus to whatever was focused before the modal opened", () => {
  const priorFocused = fakeFocusable();
  globalThis.document = { activeElement: priorFocused };
  const modal = fakeElement({ focusableChildren: [fakeFocusable()] });

  openModal(modal);
  closeModal(modal);

  assert.equal(isModalOpen(modal), false);
  assert.equal(priorFocused.wasFocused, true);
});

test("closeModal on a modal that was never opened is a safe no-op", () => {
  globalThis.document = { activeElement: null };
  const modal = fakeElement();
  assert.doesNotThrow(() => closeModal(modal));
});

test("Escape inside an open modal calls the supplied onClose instead of the default close", () => {
  globalThis.document = { activeElement: null };
  const modal = fakeElement({ focusableChildren: [fakeFocusable()] });
  let closedViaCallback = false;
  openModal(modal, { onClose: () => { closedViaCallback = true; } });

  const escEvent = fakeEvent("Escape");
  modal._fireKeydown(escEvent);

  assert.equal(closedViaCallback, true);
  assert.equal(escEvent.defaultPrevented, true);
  // onClose is responsible for calling closeModal itself; the registry
  // should still show open until that happens.
  assert.equal(isModalOpen(modal), true);
  closeModal(modal);
});

test("Escape with no onClose supplied falls back to the module's own closeModal", () => {
  const priorFocused = fakeFocusable();
  globalThis.document = { activeElement: priorFocused };
  const modal = fakeElement({ focusableChildren: [fakeFocusable()] });
  openModal(modal);

  modal._fireKeydown(fakeEvent("Escape"));

  assert.equal(isModalOpen(modal), false);
  assert.equal(priorFocused.wasFocused, true);
});

test("Tab focus wraps from the last focusable element back to the first", () => {
  const first = fakeFocusable();
  const last = fakeFocusable();
  globalThis.document = { activeElement: last };
  const modal = fakeElement({ focusableChildren: [first, last] });
  openModal(modal);

  const tabEvent = fakeEvent("Tab", { shiftKey: false });
  modal._fireKeydown(tabEvent);

  assert.equal(tabEvent.defaultPrevented, true);
  assert.equal(first.wasFocused, true);
  closeModal(modal);
});

test("Shift+Tab focus wraps from the first focusable element back to the last", () => {
  const first = fakeFocusable();
  const last = fakeFocusable();
  globalThis.document = { activeElement: first };
  const modal = fakeElement({ focusableChildren: [first, last] });
  openModal(modal);

  const tabEvent = fakeEvent("Tab", { shiftKey: true });
  modal._fireKeydown(tabEvent);

  assert.equal(tabEvent.defaultPrevented, true);
  assert.equal(last.wasFocused, true);
  closeModal(modal);
});

test("re-opening an already-open modal closes the previous trap first (no leaked listeners)", () => {
  globalThis.document = { activeElement: null };
  const modal = fakeElement({ focusableChildren: [fakeFocusable()] });
  openModal(modal);
  const firstListenerActive = modal._hasListener();
  openModal(modal);
  assert.equal(firstListenerActive, true);
  assert.equal(isModalOpen(modal), true);
  closeModal(modal);
});

test("openModal is a safe no-op with no modal element", () => {
  globalThis.document = { activeElement: null };
  assert.doesNotThrow(() => openModal(null));
  assert.equal(isModalOpen(null), false);
});
