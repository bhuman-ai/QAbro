(function initSwarmDashboardRenderState(globalScope) {
  function renderLoadingState(config = {}) {
    const { elements = {}, hasAppDashboardUi = false } = config;

    const updatePanel = (panel, message) => {
      if (panel) {
        panel.innerHTML = `<div class="app-empty"><p>${message}</p></div>`;
      }
    };

    updatePanel(elements.runsPanelContent, 'Loading runs...');
    if (hasAppDashboardUi) {
      updatePanel(elements.reportDetailPanel, 'Loading reports...');
      updatePanel(elements.topFixesItems, 'Loading findings...');
      updatePanel(elements.personaSignalsItems, 'Loading persona signals...');
    }
  }

  function renderErrorState(config = {}) {
    const { elements = {}, hasAppDashboardUi = false, escapeHtml = (val) => val, message = 'Failed to load data' } = config;

    const updatePanelWithError = (panel, defaultMessage) => {
      if (panel) {
        panel.innerHTML = `<div class="app-empty"><p>${escapeHtml(message || defaultMessage)}</p></div>`;
      }
    };

    updatePanelWithError(elements.runsPanelContent, 'Failed to load runs');
    if (hasAppDashboardUi) {
      updatePanelWithError(elements.reportDetailPanel, 'Failed to load report details');
      updatePanelWithError(elements.topFixesItems, 'Failed to load findings');
      updatePanelWithError(elements.personaSignalsItems, 'Failed to load persona signals');
    }
  }

  function renderNoSelectionState(config = {}) {
    const { elements = {}, hasAppDashboardUi = false, renderRecentRunsTable = () => {} } = config;

    const updatePanelWithPlaceholder = (panel, content) => {
      if (panel) {
        panel.innerHTML = `<div class="app-empty">${content}</div>`;
      }
    };
    
    if (elements.reportDetailPanel) {
        elements.reportDetailPanel.innerHTML = '<div class="empty-detail"><h2>Select a run</h2><p>Report details will appear here.</p></div>';
    }

    if (hasAppDashboardUi) {
      updatePanelWithPlaceholder(elements.runsPanelContent, '<h3>No runs yet</h3><p>Your recent test runs will appear here.</p>');
      updatePanelWithPlaceholder(elements.topFixesItems, '<h3>Prioritized Blockers</h3><p>Select a run to see the most critical issues.</p>');
      updatePanelWithPlaceholder(elements.personaSignalsItems, '<h3>Persona Signals</h3><p>See how different user personas reacted to your app.</p>');
      
      if (renderRecentRunsTable && elements.runsPanelContent) {
        renderRecentRunsTable();
      }
    }
  }

  function mountReportDetail(config = {}) {
    const { elements = {}, detailMarkup = "", attachReplayPlayers = () => {}, attachShareButtons = () => {} } = config;

    if (elements.reportDetailPanel) {
      elements.reportDetailPanel.innerHTML = detailMarkup;
      attachReplayPlayers(elements.reportDetailPanel);
      attachShareButtons(elements.reportDetailPanel);
    }
  }

  globalScope.SwarmDashboardRenderState = {
    renderLoadingState,
    renderErrorState,
    renderNoSelectionState,
    mountReportDetail
  };
})(window);
