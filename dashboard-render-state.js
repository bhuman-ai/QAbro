(function initSwarmDashboardRenderState(globalScope) {
  function setDetailEmptyState(panel, isEmpty) {
    if (!panel) {
      return;
    }
    panel.classList.toggle("is-empty", Boolean(isEmpty));
  }

  function renderLoadingState(config = {}) {
    const { elements = {}, hasAppDashboardUi = false } = config;

    const updatePanel = (panel, message) => {
      if (panel) {
        panel.innerHTML = `<div class="app-empty"><p>${message}</p></div>`;
      }
    };

    updatePanel(elements.runsPanelContent, 'Loading tests...');
    if (hasAppDashboardUi) {
      setDetailEmptyState(elements.reportDetailPanel, true);
      updatePanel(elements.reportDetailPanel, 'Loading details...');
      updatePanel(elements.topFixesItems, 'Loading problems...');
      updatePanel(elements.personaSignalsItems, 'Loading user notes...');
    }
  }

  function renderErrorState(config = {}) {
    const { elements = {}, hasAppDashboardUi = false, escapeHtml = (val) => val, message = 'Failed to load data' } = config;

    const updatePanelWithError = (panel, defaultMessage) => {
      if (panel) {
        panel.innerHTML = `<div class="app-empty"><p>${escapeHtml(message || defaultMessage)}</p></div>`;
      }
    };

    updatePanelWithError(elements.runsPanelContent, 'Failed to load tests');
    if (hasAppDashboardUi) {
      setDetailEmptyState(elements.reportDetailPanel, true);
      updatePanelWithError(elements.reportDetailPanel, 'Failed to load details');
      updatePanelWithError(elements.topFixesItems, 'Failed to load problems');
      updatePanelWithError(elements.personaSignalsItems, 'Failed to load user notes');
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
        setDetailEmptyState(elements.reportDetailPanel, true);
        elements.reportDetailPanel.innerHTML = '<div class="empty-detail"><h2>Pick a test</h2><p>The report will open here.</p></div>';
    }

    if (hasAppDashboardUi) {
      updatePanelWithPlaceholder(elements.runsPanelContent, '<h3>No tests yet</h3><p>Your recent tests will appear here.</p>');
      updatePanelWithPlaceholder(elements.topFixesItems, '<h3>Fix first</h3><p>Pick a test to see the biggest problems.</p>');
      updatePanelWithPlaceholder(elements.personaSignalsItems, '<h3>What felt hard</h3><p>Pick a test to see where the user got stuck.</p>');
      
      if (renderRecentRunsTable && elements.runsPanelContent) {
        renderRecentRunsTable();
      }
    }
  }

  function mountReportDetail(config = {}) {
    const { elements = {}, detailMarkup = "", attachReplayPlayers = () => {}, attachShareButtons = () => {} } = config;

    if (elements.reportDetailPanel) {
      setDetailEmptyState(elements.reportDetailPanel, false);
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
