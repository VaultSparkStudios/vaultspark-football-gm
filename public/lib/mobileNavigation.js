import { resolveTabKeyboardIndex } from "./tabKeyboardNavigation.js";

export function bindMobileNav() {
  const toggle = document.getElementById("mobileNavToggle");
  const scrim = document.getElementById("mobileNavScrim");
  const sideMenu = document.getElementById("sideMenu");
  const groups = Array.from(sideMenu?.querySelectorAll(".menu-group") || []);
  if (!toggle || !scrim) return null;

  /** True when the hamburger is actually rendered, i.e. the drawer breakpoint is live. */
  const isDrawerActive = () => window.getComputedStyle(toggle).display !== "none";

  function setOpenGroup(openGroup = null) {
    for (const group of groups) {
      const isOpen = group === openGroup;
      group.classList.toggle("is-open", isOpen);
      group.querySelector(".menu-group-toggle")?.setAttribute("aria-expanded", String(isOpen));
      for (const tab of group.querySelectorAll(".menu-btn")) {
        tab.tabIndex = isDrawerActive() && isOpen ? 0 : tab.classList.contains("active") ? 0 : -1;
      }
    }
  }

  function closeNav({ restoreFocus = false } = {}) {
    const focusWasInDrawer = sideMenu?.contains(document.activeElement);
    document.body.classList.remove("mobile-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    // Move focus before the drawer becomes inert. Escape and scrim dismissal
    // must be as focus-safe as selecting a destination tab.
    if (restoreFocus || focusWasInDrawer) toggle.focus();
    setOpenGroup();
    // Keep the off-screen drawer out of the tab order and away from screen readers.
    if (sideMenu && isDrawerActive()) sideMenu.setAttribute("inert", "");
  }

  function openNav() {
    document.body.classList.add("mobile-nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    if (sideMenu) {
      sideMenu.removeAttribute("inert");
      setOpenGroup();
      sideMenu.querySelector(".menu-group-toggle")?.focus();
    }
  }

  function syncInert() {
    if (!sideMenu) return;
    if (!isDrawerActive() && document.body.classList.contains("mobile-nav-open")) closeNav();
    if (document.body.classList.contains("mobile-nav-open")) return;
    if (isDrawerActive()) sideMenu.setAttribute("inert", "");
    else sideMenu.removeAttribute("inert");
  }

  syncInert();
  window.addEventListener("resize", syncInert, { passive: true });

  toggle.addEventListener("click", () => {
    if (document.body.classList.contains("mobile-nav-open")) closeNav();
    else openNav();
  });
  scrim.addEventListener("click", () => closeNav({ restoreFocus: true }));
  for (const group of groups) {
    const groupToggle = group.querySelector(".menu-group-toggle");
    groupToggle?.addEventListener("click", () => setOpenGroup(group.classList.contains("is-open") ? null : group));
    groupToggle?.addEventListener("keydown", (event) => {
      const groupToggles = groups.map((item) => item.querySelector(".menu-group-toggle"));
      const nextIndex = resolveTabKeyboardIndex({ key: event.key, currentIndex: groupToggles.indexOf(groupToggle), count: groupToggles.length, orientation: "vertical" });
      if (nextIndex === null) return;
      event.preventDefault();
      groupToggles[nextIndex]?.focus();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("mobile-nav-open")) closeNav({ restoreFocus: true });
    if (event.key !== "Tab" || !document.body.classList.contains("mobile-nav-open") || !sideMenu) return;
    const focusable = Array.from(sideMenu.querySelectorAll("button:not([disabled])")).filter((button) => button.getClientRects().length);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  });

  return closeNav;
}

export function bindMenuTabs(activateTabFn, closeMobileNav) {
  const buttons = Array.from(document.querySelectorAll(".menu-btn"));
  const activateButton = (button, { keyboard = false } = {}) => {
    const drawerWasOpen = document.body.classList.contains("mobile-nav-open");
    activateTabFn(button.dataset.tab);
    // Selecting a section is the drawer's job done — get it off the screen.
    closeMobileNav?.();
    if (!drawerWasOpen && keyboard) button.focus();
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => activateButton(button));
    button.addEventListener("keydown", (event) => {
      const drawerWasOpen = document.body.classList.contains("mobile-nav-open");
      const candidates = drawerWasOpen ? Array.from(button.closest(".menu-group-links")?.querySelectorAll(".menu-btn") || []) : buttons;
      const orientation = button.closest('[role="tablist"]')?.getAttribute("aria-orientation") || "vertical";
      const nextIndex = resolveTabKeyboardIndex({
        key: event.key,
        currentIndex: candidates.indexOf(button),
        count: candidates.length,
        orientation
      });
      if (nextIndex === null) return;
      event.preventDefault();
      if (drawerWasOpen) candidates[nextIndex].focus();
      else activateButton(candidates[nextIndex], { keyboard: true });
    });
  });

  document.getElementById("mobileCommissionerNav")?.addEventListener("click", async () => {
    await Promise.resolve(activateTabFn("settingsTab"));
    closeMobileNav?.();
    const panel = document.getElementById("commissionerPanel");
    if (!panel) return;
    panel.scrollIntoView({ block: "start", behavior: "instant" });
    panel.setAttribute("tabindex", "-1");
    panel.focus({ preventScroll: true });
  });
}
