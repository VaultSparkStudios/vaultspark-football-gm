/**
 * CANON-041 Mobile Bottom Navigation
 *
 * Replaces the top-stacked side-menu on narrow viewports with a fixed
 * 5-section bottom tab bar + horizontal-scroll sub-tab tray.
 * Uses 100dvh so the layout accounts for mobile browser chrome correctly.
 */

const SECTIONS = {
  gameday: {
    label: "Gameday",
    icon: "🏈",
    tabs: ["overviewTab", "statsTab", "calendarTab"],
  },
  roster: {
    label: "Roster",
    icon: "👥",
    tabs: ["rosterTab", "faTab", "depthTab", "contractsTab"],
  },
  builds: {
    label: "Builds",
    icon: "🔄",
    tabs: ["transactionsTab", "scoutingTab", "draftTab"],
  },
  history: {
    label: "History",
    icon: "📜",
    tabs: ["logTab", "historyTab"],
  },
  config: {
    label: "Config",
    icon: "⚙️",
    tabs: ["rulesTab", "settingsTab"],
  },
};

const TAB_LABELS = {
  overviewTab: "Overview",
  statsTab: "Statistics",
  calendarTab: "Calendar",
  rosterTab: "Roster",
  faTab: "Free Agents",
  depthTab: "Depth Chart",
  contractsTab: "Contracts",
  transactionsTab: "Trades",
  scoutingTab: "Scouting",
  draftTab: "Draft",
  logTab: "League Log",
  historyTab: "Dynasty",
  rulesTab: "Rules",
  settingsTab: "Settings",
};

export function sectionForTab(tabId) {
  for (const [key, sec] of Object.entries(SECTIONS)) {
    if (sec.tabs.includes(tabId)) return key;
  }
  return "gameday";
}

export function initMobileTabBar(activateTabFn) {
  const bar = document.getElementById("mobileTabBar");
  const tray = document.getElementById("mobileTabTray");
  if (!bar || !tray) return null;

  const mq = window.matchMedia("(max-width: 640px)");

  let trayOpen = false;
  let openSection = null;

  function isActive(tabId) {
    return !!document.querySelector(`.menu-btn[data-tab="${tabId}"].active`);
  }

  function renderTray(sectionKey) {
    const sec = SECTIONS[sectionKey];
    tray.innerHTML = sec.tabs
      .map((tabId) => {
        const active = isActive(tabId);
        return `<button class="mob-tray-btn${active ? " active" : ""}" data-tab="${tabId}">${TAB_LABELS[tabId] || tabId}</button>`;
      })
      .join("");
    tray.querySelectorAll(".mob-tray-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateTabFn(btn.dataset.tab);
        closeTray();
      });
    });
  }

  function openTray(sectionKey) {
    openSection = sectionKey;
    renderTray(sectionKey);
    tray.classList.remove("mob-tray-hidden");
    trayOpen = true;
  }

  function closeTray() {
    tray.classList.add("mob-tray-hidden");
    trayOpen = false;
  }

  function setActiveSection(sectionKey) {
    bar.querySelectorAll(".mob-section-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionKey);
    });
  }

  // Section button clicks
  bar.querySelectorAll(".mob-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = btn.dataset.section;
      if (trayOpen && openSection === sec) {
        closeTray();
        return;
      }
      setActiveSection(sec);
      openTray(sec);
    });
  });

  // Clicking outside the bar closes the tray
  document.addEventListener("click", (e) => {
    if (trayOpen && !bar.contains(e.target)) closeTray();
  });

  // Listen for programmatic tab switches (e.g. deeplinks from Priority Inbox)
  document.addEventListener("vsfgm:tab-activated", (e) => {
    const tabId = e.detail?.tabId;
    if (!tabId) return;
    const secKey = sectionForTab(tabId);
    setActiveSection(secKey);
    if (trayOpen && openSection === secKey) renderTray(secKey);
    else if (trayOpen) closeTray();
  });

  // Show/hide on resize
  function applyVisibility() {
    bar.hidden = !mq.matches;
    if (!mq.matches && trayOpen) closeTray();
  }
  applyVisibility();
  mq.addEventListener("change", applyVisibility);

  // Expose sync for external callers
  return {
    syncTab(tabId) {
      const secKey = sectionForTab(tabId);
      setActiveSection(secKey);
      if (trayOpen && openSection === secKey) renderTray(secKey);
    },
  };
}
