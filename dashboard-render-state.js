(function initSwarmDashboardRenderState(globalScope) {
  function renderLoadingState(config = {}) {
    const elements = config.elements || {};
    const hasAppDashboardUi = Boolean(config.hasAppDashboardUi);

    if (elements.reportsItems) {
      elements.reportsItems.innerHTML = '<div class="empty-state">Loading reports...</div>';
    }
    if (!hasAppDashboardUi) {
      return;
    }
    if (elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = '<div class="app-empty"><p>Loading reports...</p></div>';
    }
    if (elements.topFixesItems) {
      elements.topFixesItems.innerHTML = '<div class="app-empty"><p>Loading findings...</p></div>';
    }
    if (elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = '<div class="app-empty"><p>Loading persona signals...</p></div>';
    }
    if (elements.recentRunsRows) {
      elements.recentRunsRows.innerHTML = '<tr><td colspan="7"><div class="app-empty"><p>Loading runs...</p></div></td></tr>';
    }
  }

  function renderErrorState(config = {}) {
    const elements = config.elements || {};
    const hasAppDashboardUi = Boolean(config.hasAppDashboardUi);
    const escapeHtml = typeof config.escapeHtml === "function" ? config.escapeHtml : (value) => String(value || "");
    const message = String(config.message || "Failed to load reports");

    if (elements.reportsItems) {
      elements.reportsItems.innerHTML = `<div class="empty-state">${escapeHtml(message || "Failed to load reports")}</div>`;
    }
    if (elements.reportDetail) {
      elements.reportDetail.innerHTML = `<div class="empty-detail"><h2>Error</h2><p>${escapeHtml(
        message || "Failed to load report detail"
      )}</p></div>`;
    }
    if (!hasAppDashboardUi) {
      return;
    }
    if (elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(message || "Failed to load dashboard data")}</p></div>`;
    }
    if (elements.topFixesItems) {
      elements.topFixesItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(message || "Failed to load findings")}</p></div>`;
    }
    if (elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(message || "Failed to load persona signals")}</p></div>`;
    }
  }

  function renderNoSelectionState(config = {}) {
    const elements = config.elements || {};
    const hasAppDashboardUi = Boolean(config.hasAppDashboardUi);
    const renderRecentRunsTable = typeof config.renderRecentRunsTable === "function" ? config.renderRecentRunsTable : null;
    const environmentLabel = String(config.environmentLabel || "Production").trim();
    const releaseLens = Boolean(config.releaseLens);

    if (elements.reportDetail) {
      elements.reportDetail.innerHTML = '<div class="empty-detail"><h2>Select a run</h2></div>';
    }
    if (elements.appReportOnlyPanel) {
      elements.appReportOnlyPanel.innerHTML = '<div class="empty-detail"><h2>Select a run</h2><p>Report details will appear here.</p></div>';
    }
    if (!hasAppDashboardUi) {
      return;
    }

    if (elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = '<div class="app-empty"><p>Select a run to view issues.</p></div>';
    }
    if (elements.testProgressItems) {
      elements.testProgressItems.innerHTML = '<div class="app-empty"><p>Progress will appear after selecting a run.</p></div>';
    }
    if (elements.appEvidencePanel) {
      elements.appEvidencePanel.innerHTML = '<div class="app-empty"><p>Select a run to view evidence.</p></div>';
    }
    if (elements.topFixesItems) {
      elements.topFixesItems.innerHTML = '<div class="app-empty"><p>Select a run to view prioritized blockers.</p></div>';
    }
    if (elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = '<div class="app-empty"><p>Persona reactions appear after findings are captured.</p></div>';
    }
    if (elements.personaSignalsMeta) {
      elements.personaSignalsMeta.textContent = "No signals yet";
    }
    if (elements.regressionSignalsItems) {
      elements.regressionSignalsItems.innerHTML = '<div class="app-empty"><p>Select a run to view regression signals.</p></div>';
    }
    if (renderRecentRunsTable && elements.recentRunsRows) {
      renderRecentRunsTable();
    }
    if (elements.dashboardStateBadge) {
      elements.dashboardStateBadge.className = "issue-severity severity-low";
      elements.dashboardStateBadge.textContent = "No Run";
    }
    if (elements.dashboardStateMessage) {
      elements.dashboardStateMessage.textContent = "Run your first swarm test to see environment health and prioritized issues.";
    }
    if (elements.healthHeroTitle) {
      elements.healthHeroTitle.textContent = releaseLens ? `${environmentLabel} Release Readiness` : `${environmentLabel} Health`;
    }
    if (elements.dashboardPrimaryGoal) {
      elements.dashboardPrimaryGoal.hidden = false;
    }
    if (elements.dashboardPrimaryGoalText) {
      elements.dashboardPrimaryGoalText.textContent = "Start a run to show the exact job this persona is trying to complete.";
    }
    if (elements.dashboardPrimaryGoalMeta) {
      elements.dashboardPrimaryGoalMeta.textContent = "Goal context updates with the selected run.";
    }
    if (elements.dashboardPrimaryGoalPersona) {
      elements.dashboardPrimaryGoalPersona.textContent = "No persona selected";
    }
    if (elements.riskCriticalCount) elements.riskCriticalCount.textContent = "0";
    if (elements.riskMajorCount) elements.riskMajorCount.textContent = "0";
    if (elements.riskBrokenJourneys) elements.riskBrokenJourneys.textContent = "0";
    if (elements.riskAvgSatisfaction) elements.riskAvgSatisfaction.textContent = "0/100";
    if (elements.dashboardPrimaryMeta) elements.dashboardPrimaryMeta.textContent = "Waiting for first run";
    if (elements.dashboardPrimaryAction) {
      elements.dashboardPrimaryAction.textContent = "Start First Test";
      elements.dashboardPrimaryAction.setAttribute("data-action-mode", "start");
      elements.dashboardPrimaryAction.setAttribute("data-run-id", "");
    }
    if (elements.dashboardSecondaryActions) {
      elements.dashboardSecondaryActions.hidden = true;
    }
    if (elements.liveMissionSection) {
      elements.liveMissionSection.hidden = true;
      elements.liveMissionSection.setAttribute("aria-hidden", "true");
    }
  }

  function mountReportDetail(config = {}) {
    const elements = config.elements || {};
    const detailMarkup = String(config.detailMarkup || "");
    const isReportViewMode = Boolean(config.isReportViewMode);
    const attachReplayPlayers = typeof config.attachReplayPlayers === "function" ? config.attachReplayPlayers : null;
    const attachReplayJumpButtons =
      typeof config.attachReplayJumpButtons === "function" ? config.attachReplayJumpButtons : null;
    const attachShareButtons = typeof config.attachShareButtons === "function" ? config.attachShareButtons : null;
    const attachLlmCopyButtons = typeof config.attachLlmCopyButtons === "function" ? config.attachLlmCopyButtons : null;

    if (elements.reportDetail) {
      elements.reportDetail.innerHTML = detailMarkup;
      if (attachReplayPlayers) attachReplayPlayers(elements.reportDetail);
      if (attachReplayJumpButtons) attachReplayJumpButtons(elements.reportDetail);
      if (attachShareButtons) attachShareButtons(elements.reportDetail);
      if (attachLlmCopyButtons) attachLlmCopyButtons(elements.reportDetail);
    }

    if (isReportViewMode && elements.appReportOnlyPanel) {
      elements.appReportOnlyPanel.innerHTML = detailMarkup;
      if (attachReplayPlayers) attachReplayPlayers(elements.appReportOnlyPanel);
      if (attachReplayJumpButtons) attachReplayJumpButtons(elements.appReportOnlyPanel);
      if (attachShareButtons) attachShareButtons(elements.appReportOnlyPanel);
      if (attachLlmCopyButtons) attachLlmCopyButtons(elements.appReportOnlyPanel);
    }
  }

  globalScope.SwarmDashboardRenderState = {
    renderLoadingState,
    renderErrorState,
    renderNoSelectionState,
    mountReportDetail
  };
})(window);
