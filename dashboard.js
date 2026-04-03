document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("appQaDashboard");
  const navLinks = Array.from(document.querySelectorAll("#dashboardNav [data-panel]"));
  const params = new URLSearchParams(window.location.search || "");
  const rawView = String(params.get("view") || params.get("mode") || "").trim().toLowerCase();
  const panelMap = {
    runs: ["appAuthHeader", "projectPanelHeader", "runsPanel", "reportDetailPanel"],
    reports: ["appAuthHeader", "projectPanelHeader", "reportDetailPanel"],
    settings: ["appAuthHeader", "projectPanelHeader", "appShellSidebar"]
  };

  function applyActiveNav(panelId) {
    for (const link of navLinks) {
      const isActive = link.dataset.panel === panelId;
      link.classList.toggle("active", isActive);
      link.setAttribute("aria-current", isActive ? "page" : "false");
    }
  }

  function revealPanel(panelId, options = {}) {
    const nextPanel = Object.prototype.hasOwnProperty.call(panelMap, panelId) ? panelId : "runs";
    if (appRoot) {
      appRoot.setAttribute("data-active-panel", nextPanel);
    }
    const sidebar = document.getElementById("appShellSidebar");
    if (sidebar && sidebar.tagName === "DETAILS" && nextPanel === "settings") {
      sidebar.open = true;
    }
    applyActiveNav(nextPanel);

    if (options.scroll === false) {
      return;
    }

    const firstPanelId = panelMap[nextPanel]?.find((id) => {
      const node = document.getElementById(id);
      return node && !node.hidden;
    });
    const target = firstPanelId ? document.getElementById(firstPanelId) : null;
    if (target && window.innerWidth < 1100) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  for (const link of navLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      revealPanel(link.dataset.panel || "runs");
    });
  }

  window.SwarmDashboardShell = {
    revealPanel
  };

  const initialPanel =
    rawView === "live" || rawView === "watch" || rawView === "mission"
      ? "settings"
      : rawView === "report" || rawView === "report_only" || rawView === "share"
        ? "reports"
        : "runs";

  revealPanel(initialPanel, { scroll: false });
});
