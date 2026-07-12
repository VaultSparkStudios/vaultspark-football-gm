/**
 * Mobile Bottom Navigation — CANON-041 scrollable 100dvh mobile nav
 *
 * On ≤640px "full view" (mobile-loop-overlay hidden), this replaces the
 * sidebar with a fixed bottom bar of 5 buckets and a scrollable sub-tab
 * strip above it. Uses 100dvh so the bar never hides behind mobile browser
 * chrome.
 */

export const BUCKETS = [
  {
    id: "gameday",
    icon: "🏈",
    label: "Gameday",
    tabs: ["overviewTab", "statsTab", "calendarTab"],
    tabLabels: ["Overview", "Stats", "Calendar"]
  },
  {
    id: "roster",
    icon: "👥",
    label: "Roster",
    tabs: ["rosterTab", "faTab", "depthTab", "contractsTab"],
    tabLabels: ["Roster", "Free Agents", "Depth", "Contracts"]
  },
  {
    id: "builds",
    icon: "🔧",
    label: "Builds",
    tabs: ["transactionsTab", "scoutingTab", "draftTab"],
    tabLabels: ["Trades", "Scouting", "Draft"]
  },
  {
    id: "history",
    icon: "🏆",
    label: "History",
    tabs: ["logTab", "historyTab"],
    tabLabels: ["Log", "Dynasty"]
  },
  {
    id: "config",
    icon: "⚙️",
    label: "Config",
    tabs: ["rulesTab", "settingsTab"],
    tabLabels: ["Rules", "Settings"]
  }
];

/** Returns the bucket containing the given tabId, or undefined. */
export function bucketForTab(tabId) {
  return BUCKETS.find((b) => b.tabs.includes(tabId));
}

/**
 * Wire up the bottom nav and sub-tab strip.
 * @param {(tabId: string) => void} onTabActivate — called when user picks a tab
 */
export function initMobileNav(onTabActivate) {
  const bottomNav = document.getElementById("mobileBottomNav");
  const strip = document.getElementById("mobileSubtabStrip");
  if (!bottomNav || !strip) return;

  bottomNav.querySelectorAll("[data-bucket]").forEach((btn) => {
    btn.addEventListener("click", () => {
      _selectBucket(btn.dataset.bucket, bottomNav, strip, onTabActivate);
    });
  });
}

/**
 * Sync bottom nav visual state to match the newly active tab.
 * Call after any activateTab() call so the nav stays in sync when tabs
 * change from other sources (deeplinks, Priority Inbox actions, etc.).
 */
export function syncMobileNavToTab(tabId) {
  const bottomNav = document.getElementById("mobileBottomNav");
  const strip = document.getElementById("mobileSubtabStrip");
  if (!bottomNav) return;

  const bucket = bucketForTab(tabId);
  if (!bucket) return;

  _markActiveBucket(bucket.id, bottomNav);
  _renderSubtabStrip(bucket, tabId, strip, null);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _selectBucket(bucketId, bottomNav, strip, onTabActivate) {
  const bucket = BUCKETS.find((b) => b.id === bucketId);
  if (!bucket) return;

  _markActiveBucket(bucketId, bottomNav);

  // If the current active tab is already in this bucket, just refresh the strip.
  // Otherwise auto-activate the first tab in the bucket.
  const currentTab = document.querySelector(".menu-btn.active")?.dataset.tab;
  const targetTab = bucket.tabs.includes(currentTab) ? currentTab : bucket.tabs[0];

  _renderSubtabStrip(bucket, targetTab, strip, onTabActivate);

  if (!bucket.tabs.includes(currentTab)) {
    // Trigger the sidebar button to fire all side-effect handlers
    const sidebarBtn = document.querySelector(`.menu-btn[data-tab="${_escAttr(targetTab)}"]`);
    if (sidebarBtn) {
      sidebarBtn.click();
    } else if (typeof onTabActivate === "function") {
      onTabActivate(targetTab);
    }
  }
}

function _markActiveBucket(bucketId, bottomNav) {
  bottomNav.querySelectorAll("[data-bucket]").forEach((btn) => {
    const isActive = btn.dataset.bucket === bucketId;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function _renderSubtabStrip(bucket, activeTabId, strip, onTabActivate) {
  if (!strip) return;
  strip.innerHTML = bucket.tabs
    .map(
      (tabId, i) =>
        `<button class="mbn-subtab${tabId === activeTabId ? " active" : ""}" data-tab="${_escAttr(tabId)}" aria-label="${_escAttr(bucket.tabLabels[i])}">${_esc(bucket.tabLabels[i])}</button>`
    )
    .join("");

  strip.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      strip.querySelectorAll(".mbn-subtab").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      // Trigger the hidden sidebar button so all bound side-effect handlers fire
      // (.click() works on display:none elements — fires event listeners regardless).
      const sidebarBtn = document.querySelector(`.menu-btn[data-tab="${_escAttr(btn.dataset.tab)}"]`);
      if (sidebarBtn) {
        sidebarBtn.click();
      } else if (typeof onTabActivate === "function") {
        onTabActivate(btn.dataset.tab);
      }
    });
  });
}

function _esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
