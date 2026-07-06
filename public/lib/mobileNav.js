/**
 * Mobile Nav Drawer — CANON-041
 *
 * Converts the side-menu into a 100dvh slide-in drawer on narrow viewports.
 * Desktop layout (>980px) is completely unaffected.
 */

const DRAWER_BREAKPOINT = 980;

function _isDrawerMode() {
  return window.innerWidth <= DRAWER_BREAKPOINT;
}

function _activeLabel(sideMenu) {
  const btn = sideMenu.querySelector(".menu-btn.active");
  return btn ? btn.textContent.trim() : "";
}

export function initMobileNav() {
  const sideMenu = document.getElementById("sideMenu");
  const toggle   = document.getElementById("navDrawerToggle");
  const scrim    = document.getElementById("navDrawerScrim");
  const label    = document.getElementById("navActiveLabel");

  if (!sideMenu || !toggle || !scrim) return;

  function openDrawer() {
    sideMenu.classList.add("drawer-open");
    scrim.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    document.body.classList.add("nav-drawer-lock");
    sideMenu.querySelector(".menu-btn.active")?.focus();
  }

  function closeDrawer() {
    sideMenu.classList.remove("drawer-open");
    scrim.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("nav-drawer-lock");
    toggle.focus();
  }

  toggle.addEventListener("click", () => {
    if (sideMenu.classList.contains("drawer-open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  scrim.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sideMenu.classList.contains("drawer-open")) {
      closeDrawer();
    }
  });

  // Close drawer and sync label on tab select (mobile only)
  document.querySelectorAll(".menu-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!_isDrawerMode()) return;
      if (sideMenu.classList.contains("drawer-open")) closeDrawer();
      if (label) label.textContent = btn.textContent.trim();
    });
  });

  // Reset on resize to desktop
  window.addEventListener("resize", () => {
    if (!_isDrawerMode()) {
      sideMenu.classList.remove("drawer-open");
      scrim.hidden = true;
      document.body.classList.remove("nav-drawer-lock");
    }
  }, { passive: true });

  // Seed the label with the currently active tab
  if (label) label.textContent = _activeLabel(sideMenu);
}

export function updateMobileNavLabel(tabId) {
  const label = document.getElementById("navActiveLabel");
  if (!label) return;
  const btn = document.querySelector(`.menu-btn[data-tab="${CSS.escape(tabId)}"]`);
  if (btn) label.textContent = btn.textContent.trim();
}
