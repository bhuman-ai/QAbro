document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("appQaDashboard");
  const navLinks = Array.from(document.querySelectorAll("#dashboardNav [data-panel]"));
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

  revealPanel("runs", { scroll: false });
});
