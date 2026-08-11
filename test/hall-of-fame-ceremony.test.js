import test from "node:test";
import assert from "node:assert/strict";
import { closeHallOfFameCeremony, openHallOfFameCeremony } from "../public/lib/hallOfFameCeremony.js";

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = "";
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelectorAll() { return this.focusables || []; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { globalThis.document.activeElement = this; }
}

function canvasContext() {
  const noop = () => {};
  return {
    clearRect: noop, createLinearGradient: () => ({ addColorStop: noop }), fillRect: noop,
    strokeRect: noop, fillText: noop, set fillStyle(_value) {}, set strokeStyle(_value) {},
    set lineWidth(_value) {}, set font(_value) {}
  };
}

test("Hall of Fame ceremony traps/restores focus and reports copy/download outcomes", async () => {
  const ids = [
    "hofCeremonyOverlay", "hofCeremonyCanvas", "hofCeremonyTitle", "hofCeremonyCopy",
    "hofCeremonyStatus", "hofCeremonyCloseBtn", "hofCeremonyCopyBtn", "hofCeremonyDownloadBtn"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const trigger = new FakeElement("trigger");
  elements.hofCeremonyOverlay.hidden = true;
  elements.hofCeremonyOverlay.focusables = [
    elements.hofCeremonyCloseBtn,
    elements.hofCeremonyCopyBtn,
    elements.hofCeremonyDownloadBtn
  ];
  elements.hofCeremonyCanvas.width = 1200;
  elements.hofCeremonyCanvas.height = 630;
  elements.hofCeremonyCanvas.getContext = () => canvasContext();
  elements.hofCeremonyCanvas.toDataURL = () => "data:image/png;base64,receipt";
  let downloaded = "";
  globalThis.document = {
    activeElement: trigger,
    getElementById: (id) => elements[id] || null,
    createElement: () => ({ click() { downloaded = this.download; } })
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } }
  });
  const entry = { playerId: "p1", player: "A.J. Legend", pos: "QB", careerAv: 144, championships: 2, teams: ["BUF"] };

  openHallOfFameCeremony(entry);
  assert.equal(elements.hofCeremonyOverlay.hidden, false);
  assert.equal(document.activeElement, elements.hofCeremonyCloseBtn);
  assert.equal(elements.hofCeremonyStatus.dataset.tone, "success");
  await elements.hofCeremonyCopyBtn.onclick();
  assert.equal(elements.hofCeremonyStatus.textContent, "Share text copied.");
  elements.hofCeremonyDownloadBtn.onclick();
  assert.equal(downloaded, "franchise-architect-hof-a-j-legend.png");
  assert.equal(elements.hofCeremonyStatus.textContent, "Ceremony card downloaded.");

  navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  await elements.hofCeremonyCopyBtn.onclick();
  assert.equal(elements.hofCeremonyStatus.dataset.tone, "error");
  assert.match(elements.hofCeremonyStatus.textContent, /Copy failed/);
  elements.hofCeremonyCanvas.toDataURL = () => { throw new Error("tainted"); };
  elements.hofCeremonyDownloadBtn.onclick();
  assert.match(elements.hofCeremonyStatus.textContent, /Download failed/);

  const escape = elements.hofCeremonyOverlay.listeners.get("keydown");
  escape({ key: "Escape", preventDefault() {} });
  assert.equal(elements.hofCeremonyOverlay.hidden, true);
  assert.equal(document.activeElement, trigger);

  document.activeElement = trigger;
  openHallOfFameCeremony(entry);
  elements.hofCeremonyOverlay.onclick({ target: elements.hofCeremonyOverlay });
  assert.equal(elements.hofCeremonyOverlay.hidden, true);
  assert.equal(document.activeElement, trigger);

  elements.hofCeremonyCanvas.getContext = () => null;
  openHallOfFameCeremony(entry);
  assert.equal(elements.hofCeremonyStatus.dataset.tone, "error");
  assert.match(elements.hofCeremonyStatus.textContent, /preview unavailable/i);
  elements.hofCeremonyDownloadBtn.onclick();
  assert.match(elements.hofCeremonyStatus.textContent, /Download failed/);
  closeHallOfFameCeremony();
});
