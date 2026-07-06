import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Unit-test the drawer open/close controller logic without browser globals.
function makeDrawerController() {
  const sideMenu = {
    classList: {
      _s: new Set(),
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); }
    },
    querySelector() { return { focus: () => {} }; }
  };

  const toggle = {
    _attrs: { "aria-expanded": "false", "aria-label": "Open navigation" },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    focus: () => {}
  };

  const scrim = { hidden: true };
  const label = { textContent: "Overview" };

  const body = {
    classList: {
      _s: new Set(),
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); }
    }
  };

  function openDrawer() {
    sideMenu.classList.add("drawer-open");
    scrim.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    body.classList.add("nav-drawer-lock");
  }

  function closeDrawer() {
    sideMenu.classList.remove("drawer-open");
    scrim.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    body.classList.remove("nav-drawer-lock");
    toggle.focus();
  }

  function onTabClick(btn) {
    if (sideMenu.classList.contains("drawer-open")) closeDrawer();
    if (label) label.textContent = btn.textContent.trim();
  }

  return { sideMenu, toggle, scrim, label, body, openDrawer, closeDrawer, onTabClick };
}

describe("mobile-nav-drawer", () => {
  it("openDrawer adds drawer-open class and unhides scrim", () => {
    const c = makeDrawerController();
    c.openDrawer();
    assert.equal(c.sideMenu.classList.contains("drawer-open"), true);
    assert.equal(c.scrim.hidden, false);
    assert.equal(c.toggle.getAttribute("aria-expanded"), "true");
    assert.equal(c.body.classList.contains("nav-drawer-lock"), true);
  });

  it("closeDrawer removes drawer-open and hides scrim", () => {
    const c = makeDrawerController();
    c.openDrawer();
    c.closeDrawer();
    assert.equal(c.sideMenu.classList.contains("drawer-open"), false);
    assert.equal(c.scrim.hidden, true);
    assert.equal(c.toggle.getAttribute("aria-expanded"), "false");
    assert.equal(c.toggle.getAttribute("aria-label"), "Open navigation");
    assert.equal(c.body.classList.contains("nav-drawer-lock"), false);
  });

  it("onTabClick closes the drawer and updates the active label", () => {
    const c = makeDrawerController();
    c.openDrawer();
    c.onTabClick({ textContent: "  Roster  " });
    assert.equal(c.sideMenu.classList.contains("drawer-open"), false);
    assert.equal(c.label.textContent, "Roster");
  });

  it("onTabClick when drawer is closed does not reopen it", () => {
    const c = makeDrawerController();
    c.onTabClick({ textContent: "Draft" });
    assert.equal(c.sideMenu.classList.contains("drawer-open"), false);
    assert.equal(c.label.textContent, "Draft");
  });

  it("open → close → open cycle is symmetric", () => {
    const c = makeDrawerController();
    c.openDrawer();
    assert.equal(c.scrim.hidden, false);
    c.closeDrawer();
    assert.equal(c.scrim.hidden, true);
    c.openDrawer();
    assert.equal(c.scrim.hidden, false);
    assert.equal(c.toggle.getAttribute("aria-expanded"), "true");
  });
});
