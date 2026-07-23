/**
 * Mobile bottom nav bar + full-height scrollable drawer (CANON-041).
 *
 * Activates on viewports ≤ 640px (matching the existing mobile breakpoint).
 * Replaces the scroll-past side-menu pattern with a fixed bottom bar that
 * surfaces the five most-used sections and a "More" button that opens a
 * 100dvh scrollable drawer containing all sections grouped exactly as the
 * desktop sidebar.
 *
 * Tab activation delegates to the existing .menu-btn click path so all
 * existing state, ARIA, and deep-link logic continues to work unchanged.
 * A MutationObserver on the side-menu keeps the mobile bar in sync when
 * tabs are activated from other parts of the app (mobile loop, deep links).
 */

export const MOBILE_NAV_BREAKPOINT = 640;

let _drawerOpen = false;
let _moreBtn = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initMobileNav() {
  const bar      = document.getElementById("mobileNavBar");
  const drawer   = document.getElementById("mobileNavDrawer");
  const backdrop = document.getElementById("mobileNavBackdrop");
  _moreBtn       = document.getElementById("mobileNavMoreBtn");
  const closeBtn = document.getElementById("mobileNavCloseBtn");

  if (!bar || !drawer || !backdrop) return;

  // Quick-access bar buttons
  bar.querySelectorAll(".mobile-nav-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _delegateTabClick(btn.dataset.tab);
      _syncActiveStates(btn.dataset.tab);
    });
  });

  // Drawer section items
  drawer.querySelectorAll(".mobile-nav-drawer-item[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _delegateTabClick(btn.dataset.tab);
      _syncActiveStates(btn.dataset.tab);
      _closeDrawer(drawer, backdrop);
    });
  });

  _moreBtn?.addEventListener("click", () => {
    if (_drawerOpen) _closeDrawer(drawer, backdrop);
    else _openDrawer(drawer, backdrop);
  });

  closeBtn?.addEventListener("click", () => _closeDrawer(drawer, backdrop));
  backdrop.addEventListener("click", () => _closeDrawer(drawer, backdrop));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _drawerOpen) {
      e.preventDefault();
      _closeDrawer(drawer, backdrop);
    }
  });

  // Mirror active-tab changes originating elsewhere (mobile loop nav, deep links)
  const sideMenu = document.querySelector(".side-menu");
  if (sideMenu) {
    new MutationObserver(() => {
      const activeBtn = sideMenu.querySelector(".menu-btn.active");
      if (activeBtn?.dataset.tab) _syncActiveStates(activeBtn.dataset.tab);
    }).observe(sideMenu, { subtree: true, attributeFilter: ["class"] });
  }

  // Viewport-change handler
  const mq = window.matchMedia(`(max-width: ${MOBILE_NAV_BREAKPOINT}px)`);
  const onMqChange = (e) => {
    bar.hidden = !e.matches;
    document.body.classList.toggle("has-mobile-nav", e.matches);
    if (!e.matches && _drawerOpen) _closeDrawer(drawer, backdrop);
  };
  mq.addEventListener("change", onMqChange);
  onMqChange(mq);

  // Sync initial active state
  const initialActive = sideMenu?.querySelector(".menu-btn.active");
  if (initialActive?.dataset.tab) _syncActiveStates(initialActive.dataset.tab);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _delegateTabClick(tabId) {
  document.querySelector(`.menu-btn[data-tab="${CSS.escape(tabId)}"]`)?.click();
}

function _syncActiveStates(tabId) {
  document.querySelectorAll(".mobile-nav-btn[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".mobile-nav-drawer-item[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
}

function _openDrawer(drawer, backdrop) {
  _drawerOpen = true;
  drawer.classList.add("open");
  drawer.removeAttribute("aria-hidden");
  backdrop.classList.add("open");
  _moreBtn?.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    (drawer.querySelector(".mobile-nav-drawer-item.active") ||
      drawer.querySelector(".mobile-nav-drawer-item"))?.focus();
  }, 60);
}

function _closeDrawer(drawer, backdrop) {
  _drawerOpen = false;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  backdrop.classList.remove("open");
  _moreBtn?.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  _moreBtn?.focus();
}
