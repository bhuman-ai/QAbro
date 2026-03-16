(function initSwarmDashboardPanels(globalScope) {
  function renderRecentRunsTable(config = {}, helpers = {}) {
    const elements = config.elements || {};
    const rows = Array.isArray(config.runs) ? config.runs.slice(0, 10) : [];
    if (!elements.recentRunsRows) {
      return;
    }

    if (!rows.length) {
      elements.recentRunsRows.innerHTML = '<tr><td colspan="7"><div class="app-empty"><p>No runs match current filters.</p></div></td></tr>';
      if (elements.recentRunsMeta) {
        elements.recentRunsMeta.textContent = "0 runs";
      }
      return;
    }

    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const getCanonicalRunStatus =
      typeof helpers.getCanonicalRunStatus === "function" ? helpers.getCanonicalRunStatus : () => "unknown";
    const formatStatusLabel = typeof helpers.formatStatusLabel === "function" ? helpers.formatStatusLabel : (value) => String(value || "");
    const statusBadgeClass = typeof helpers.statusBadgeClass === "function" ? helpers.statusBadgeClass : () => "";
    const estimateRunSatisfaction =
      typeof helpers.estimateRunSatisfaction === "function" ? helpers.estimateRunSatisfaction : () => 0;
    const formatRunDuration = typeof helpers.formatRunDuration === "function" ? helpers.formatRunDuration : () => "-";
    const buildReportShareUrl = typeof helpers.buildReportShareUrl === "function" ? helpers.buildReportShareUrl : () => "";
    const escapeHtml = typeof helpers.escapeHtml === "function" ? helpers.escapeHtml : (value) => String(value || "");
    const selectedRunId = String(config.selectedRunId || "").trim();

    elements.recentRunsRows.innerHTML = rows
      .map((run) => {
        const liveStatus = getLiveStatus(run.run_id);
        const status = getCanonicalRunStatus(null, run, liveStatus) || "unknown";
        const statusLabel = formatStatusLabel(status);
        const blockers = (Number(run?.counts?.bug) || 0) + (Number(run?.counts?.dead_end) || 0);
        const brokenJourneys = Number(run?.counts?.dead_end) || 0;
        const satisfaction = estimateRunSatisfaction(run, status);
        const duration = formatRunDuration(run);
        const shareUrl = buildReportShareUrl(run.run_id, run);
        const selected = selectedRunId === run.run_id ? "is-selected" : "";
        return `
          <tr class="${escapeHtml(selected)}">
            <td>${escapeHtml(run.run_id)}</td>
            <td><span class="badge ${escapeHtml(statusBadgeClass(status))}">${escapeHtml(statusLabel)}</span></td>
            <td>${escapeHtml(String(blockers))}</td>
            <td>${escapeHtml(String(brokenJourneys))}</td>
            <td>${escapeHtml(String(satisfaction))}</td>
            <td>${escapeHtml(duration)}</td>
            <td>
              <div class="app-table-actions">
                <button type="button" class="table-action" data-open-run="${escapeHtml(run.run_id)}">Open</button>
                <button type="button" class="table-action" data-compare-run="${escapeHtml(run.run_id)}">Compare</button>
                ${shareUrl ? `<a href="${escapeHtml(shareUrl)}" target="_blank" rel="noreferrer">Share</a>` : ""}
                ${status === "failed" || status === "partial" ? `<button type="button" class="table-action" data-retry-run="${escapeHtml(run.run_id)}">Retry</button>` : ""}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    if (elements.recentRunsMeta) {
      elements.recentRunsMeta.textContent = `${rows.length} run${rows.length === 1 ? "" : "s"}`;
    }
  }

  function renderAppRunPicker(config = {}, helpers = {}) {
    const hasAppDashboardUi = Boolean(config.hasAppDashboardUi);
    const elements = config.elements || {};
    if (!hasAppDashboardUi || !elements.appRunPicker) {
      return;
    }

    const runs = Array.isArray(config.runs) ? config.runs : [];
    if (!runs.length) {
      elements.appRunPicker.innerHTML = '<option value="">No runs</option>';
      return;
    }

    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const getCanonicalRunStatus =
      typeof helpers.getCanonicalRunStatus === "function" ? helpers.getCanonicalRunStatus : () => "unknown";
    const escapeHtml = typeof helpers.escapeHtml === "function" ? helpers.escapeHtml : (value) => String(value || "");
    const selectedRunId = String(config.selectedRunId || "").trim();

    elements.appRunPicker.innerHTML = runs
      .map((run) => {
        const liveStatus = getLiveStatus(run.run_id);
        const status = getCanonicalRunStatus(null, run, liveStatus) || "unknown";
        const label = `${run.target || run.brand_key || run.run_id} · ${status}`;
        const selected = selectedRunId === run.run_id ? "selected" : "";
        return `<option value="${escapeHtml(run.run_id)}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function renderAppPanels(config = {}, helpers = {}) {
    const hasAppDashboardUi = Boolean(config.hasAppDashboardUi);
    if (!hasAppDashboardUi) {
      return;
    }

    const elements = config.elements || {};
    const report = config.report;
    const row = config.row;
    const liveStatus = config.liveStatus;
    const runs = Array.isArray(config.runs) ? config.runs : [];
    const selectedRunId = String(config.selectedRunId || "").trim();

    const deriveDashboardMode = typeof helpers.deriveDashboardMode === "function" ? helpers.deriveDashboardMode : () => "completed";
    const computeRiskSnapshot = typeof helpers.computeRiskSnapshot === "function" ? helpers.computeRiskSnapshot : () => ({});
    const deriveRiskVerdict = typeof helpers.deriveRiskVerdict === "function" ? helpers.deriveRiskVerdict : () => "stable";
    const getActiveEnvironment = typeof helpers.getActiveEnvironment === "function" ? helpers.getActiveEnvironment : () => "production";
    const getEnvironmentLabel = typeof helpers.getEnvironmentLabel === "function" ? helpers.getEnvironmentLabel : (value) => String(value || "");
    const isReleaseReadinessEnvironment =
      typeof helpers.isReleaseReadinessEnvironment === "function" ? helpers.isReleaseReadinessEnvironment : () => false;
    const getCanonicalRunStatus =
      typeof helpers.getCanonicalRunStatus === "function" ? helpers.getCanonicalRunStatus : () => "unknown";
    const isQueueActiveStatus =
      typeof helpers.isQueueActiveStatus === "function" ? helpers.isQueueActiveStatus : () => false;
    const isLiveViewMode = typeof helpers.isLiveViewMode === "function" ? helpers.isLiveViewMode : () => false;
    const resolveRunMission = typeof helpers.resolveRunMission === "function" ? helpers.resolveRunMission : () => ({ config: {}, goal: "", persona: "" });
    const buildLiveVerdictMeta = typeof helpers.buildLiveVerdictMeta === "function" ? helpers.buildLiveVerdictMeta : () => ({ severityClass: "", label: "" });
    const buildVerdictMeta = typeof helpers.buildVerdictMeta === "function" ? helpers.buildVerdictMeta : () => ({ severityClass: "", label: "" });
    const buildHeroMetricModel = typeof helpers.buildHeroMetricModel === "function" ? helpers.buildHeroMetricModel : () => [];
    const buildRunningSummaryMessage =
      typeof helpers.buildRunningSummaryMessage === "function" ? helpers.buildRunningSummaryMessage : () => "";
    const extractRunFailureContext =
      typeof helpers.extractRunFailureContext === "function" ? helpers.extractRunFailureContext : () => ({ headline: "", detail: "" });
    const buildRiskSummaryMessage =
      typeof helpers.buildRiskSummaryMessage === "function" ? helpers.buildRiskSummaryMessage : () => "";
    const buildTargetLabelFromUrl =
      typeof helpers.buildTargetLabelFromUrl === "function" ? helpers.buildTargetLabelFromUrl : () => "";
    const normalizeScopeModeInput =
      typeof helpers.normalizeScopeModeInput === "function" ? helpers.normalizeScopeModeInput : (value) => String(value || "");
    const formatRelativeTime = typeof helpers.formatRelativeTime === "function" ? helpers.formatRelativeTime : () => "";
    const formatStatusLabel = typeof helpers.formatStatusLabel === "function" ? helpers.formatStatusLabel : (value) => String(value || "");
    const applyDashboardShareAction =
      typeof helpers.applyDashboardShareAction === "function" ? helpers.applyDashboardShareAction : () => {};
    const renderAppEvidencePanel =
      typeof helpers.renderAppEvidencePanel === "function" ? helpers.renderAppEvidencePanel : () => {};
    const renderTopFixes = typeof helpers.renderTopFixes === "function" ? helpers.renderTopFixes : () => "";
    const attachShareButtons = typeof helpers.attachShareButtons === "function" ? helpers.attachShareButtons : () => {};
    const renderPersonaSignals = typeof helpers.renderPersonaSignals === "function" ? helpers.renderPersonaSignals : () => "";
    const renderAppProgress = typeof helpers.renderAppProgress === "function" ? helpers.renderAppProgress : () => "";
    const renderRegressionSignals =
      typeof helpers.renderRegressionSignals === "function" ? helpers.renderRegressionSignals : () => ({ meta: "", markup: "" });
    const buildQueueExperience = typeof helpers.buildQueueExperience === "function" ? helpers.buildQueueExperience : () => ({});
    const buildLiveTerminalSummary =
      typeof helpers.buildLiveTerminalSummary === "function" ? helpers.buildLiveTerminalSummary : () => ({ status: "", durationLabel: "" });
    const updateLiveStreamPanel = typeof helpers.updateLiveStreamPanel === "function" ? helpers.updateLiveStreamPanel : () => {};
    const renderLiveIncomingFindings =
      typeof helpers.renderLiveIncomingFindings === "function" ? helpers.renderLiveIncomingFindings : () => "";
    const renderLiveActivityFeed =
      typeof helpers.renderLiveActivityFeed === "function" ? helpers.renderLiveActivityFeed : () => "";
    const renderRecentRunsTableHelper =
      typeof helpers.renderRecentRunsTable === "function" ? helpers.renderRecentRunsTable : () => {};

    const mode = deriveDashboardMode(report, row, liveStatus);
    const snapshot = computeRiskSnapshot(report);
    const verdict = deriveRiskVerdict(mode, snapshot, report, liveStatus);
    const environment = getActiveEnvironment();
    const environmentLabel = getEnvironmentLabel(environment);
    const releaseLens = isReleaseReadinessEnvironment(environment);
    const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
    const canonicalStatus = getCanonicalRunStatus(report, row, liveStatus);
    const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
    const isLive = isQueueActiveStatus(queueStatus);
    const showLiveMission = isLive || isLiveViewMode();
    const mission = resolveRunMission(row, report);
    const verdictMeta = isLive ? buildLiveVerdictMeta(queueStatus) : buildVerdictMeta(verdict, environment);
    const heroMetrics = buildHeroMetricModel(mode, report, snapshot, liveStatus, row);
    const findingsCount = Array.isArray(report?.findings) ? report.findings.length : 0;
    const journeysCount = Array.isArray(report?.tested_journeys) ? report.tested_journeys.length : 0;

    if (elements.healthHeroTitle) {
      elements.healthHeroTitle.textContent = releaseLens ? `${environmentLabel} Release Readiness` : `${environmentLabel} Health`;
    }
    if (elements.dashboardStateBadge) {
      elements.dashboardStateBadge.className = `issue-severity ${verdictMeta.severityClass}`;
      elements.dashboardStateBadge.textContent = verdictMeta.label;
    }
    if (elements.dashboardStateMessage) {
      if (isLive) {
        elements.dashboardStateMessage.textContent = buildRunningSummaryMessage(liveStatus, row, snapshot);
      } else if (isLiveViewMode() && mode === "failed") {
        const failure = extractRunFailureContext(report, liveStatus);
        elements.dashboardStateMessage.textContent = `${failure.headline} ${failure.detail}`;
      } else {
        elements.dashboardStateMessage.textContent = buildRiskSummaryMessage(mode, verdict, snapshot, environment);
      }
    }
    if (elements.dashboardPrimaryGoal) {
      elements.dashboardPrimaryGoal.hidden = false;
    }
    if (elements.dashboardPrimaryGoalText) {
      elements.dashboardPrimaryGoalText.textContent = mission.goal;
    }
    if (elements.dashboardPrimaryGoalMeta) {
      const targetLabel = String(mission.config.brandName || buildTargetLabelFromUrl(mission.config.targetUrl) || row?.target || "")
        .trim()
        .slice(0, 320);
      const scopeLabel = normalizeScopeModeInput(mission.config.scopeMode).replaceAll("_", " ");
      const metaParts = [];
      if (targetLabel) {
        metaParts.push(`Target: ${targetLabel}`);
      }
      if (scopeLabel) {
        metaParts.push(`Mode: ${scopeLabel}`);
      }
      elements.dashboardPrimaryGoalMeta.textContent = metaParts.join(" · ") || "Goal context updates with the selected run.";
    }
    if (elements.dashboardPrimaryGoalPersona) {
      elements.dashboardPrimaryGoalPersona.textContent = mission.persona || "No persona selected";
    }
    if (elements.riskCriticalLabel) {
      elements.riskCriticalLabel.textContent = heroMetrics[0]?.label || "Critical";
    }
    if (elements.riskCriticalCount) {
      elements.riskCriticalCount.textContent = heroMetrics[0]?.value || "0";
    }
    if (elements.riskMajorLabel) {
      elements.riskMajorLabel.textContent = heroMetrics[1]?.label || "Major";
    }
    if (elements.riskMajorCount) {
      elements.riskMajorCount.textContent = heroMetrics[1]?.value || "0";
    }
    if (elements.riskJourneyLabel) {
      elements.riskJourneyLabel.textContent = heroMetrics[2]?.label || "Journeys Impacted";
    }
    if (elements.riskBrokenJourneys) {
      elements.riskBrokenJourneys.textContent = heroMetrics[2]?.value || "0";
    }
    if (elements.riskSatisfactionLabel) {
      elements.riskSatisfactionLabel.textContent = heroMetrics[3]?.label || "Avg Satisfaction";
    }
    if (elements.riskAvgSatisfaction) {
      elements.riskAvgSatisfaction.textContent = heroMetrics[3]?.value || "0";
    }

    let primaryActionLabel = "Review Findings";
    let primaryActionMode = "review";
    if (mode === "no_runs") {
      primaryActionLabel = "Start First Test";
      primaryActionMode = "start";
    } else if (mode === "running") {
      primaryActionLabel = queueStatus === "queued" || queueStatus === "retryable" ? "Queued for Start" : "Watching Live";
      primaryActionMode = "watch";
    } else if (mode === "partial" || mode === "failed") {
      primaryActionLabel = "Retry Run";
      primaryActionMode = "retry";
    }

    if (elements.dashboardPrimaryMeta) {
      const statusLabel = isLive ? queueStatus || "processing" : canonicalStatus || "unknown";
      const deliveredAt = row?.delivered_at || report?.delivered_at || "";
      const recency = deliveredAt ? formatRelativeTime(deliveredAt) : "no run yet";
      elements.dashboardPrimaryMeta.textContent = `${row?.run_id || report?.run_id || "no-run"} · ${formatStatusLabel(statusLabel)} · ${recency}`;
    }
    if (elements.dashboardPrimaryAction) {
      elements.dashboardPrimaryAction.textContent = primaryActionLabel;
      elements.dashboardPrimaryAction.setAttribute("data-action-mode", primaryActionMode);
      elements.dashboardPrimaryAction.setAttribute("data-run-id", String(row?.run_id || report?.run_id || ""));
    }
    if (elements.dashboardSecondaryActions) {
      elements.dashboardSecondaryActions.hidden = mode === "no_runs" || mode === "running" || isLiveViewMode();
    }
    if (elements.dashboardOpenReport) {
      elements.dashboardOpenReport.disabled = !row?.run_id;
      elements.dashboardOpenReport.setAttribute("data-run-id", String(row?.run_id || report?.run_id || ""));
    }
    if (elements.dashboardCompareRuns) {
      const currentIndex = runs.findIndex((item) => item.run_id === row?.run_id);
      const previous = currentIndex >= 0 ? runs[currentIndex + 1] : null;
      elements.dashboardCompareRuns.disabled = !previous?.run_id;
      elements.dashboardCompareRuns.setAttribute("data-run-id", String(previous?.run_id || ""));
    }
    applyDashboardShareAction(report, row);

    renderAppEvidencePanel(report, row);

    if (elements.topFixesTitle) {
      elements.topFixesTitle.textContent = mode === "failed" ? "Validated Blockers" : "Needs Attention";
    }
    if (elements.topFixesItems) {
      elements.topFixesItems.innerHTML = renderTopFixes(report, row, mode);
      attachShareButtons(elements.topFixesItems);
    }
    if (elements.topFixesMeta) {
      if (mode === "failed") {
        elements.topFixesMeta.textContent = findingsCount
          ? `${Math.min(5, findingsCount)} partial finding${findingsCount === 1 ? "" : "s"} from incomplete run`
          : "Run failed before blockers were validated";
      } else if (mode === "partial") {
        elements.topFixesMeta.textContent = findingsCount
          ? `${Math.min(5, findingsCount)} partial finding${findingsCount === 1 ? "" : "s"} shown`
          : "Partial coverage only - retry to validate blockers";
      } else {
        elements.topFixesMeta.textContent = findingsCount
          ? `${Math.min(5, findingsCount)} of ${findingsCount} findings shown`
          : "No blockers identified in selected run";
      }
    }
    if (elements.personaSignalsTitle) {
      elements.personaSignalsTitle.textContent = mode === "failed" ? "Signals Before Failure" : "What users struggled with";
    }
    if (elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = renderPersonaSignals(report, row, mode);
    }
    if (elements.personaSignalsMeta) {
      if (mode === "failed") {
        elements.personaSignalsMeta.textContent = findingsCount
          ? `${Math.min(4, findingsCount)} partial signal${findingsCount === 1 ? "" : "s"}`
          : "No validated persona signals";
      } else {
        elements.personaSignalsMeta.textContent = findingsCount
          ? `${Math.min(4, findingsCount)} live user signal${findingsCount === 1 ? "" : "s"}`
          : "No persona signals yet";
      }
    }

    if (elements.appProgressTitle) {
      if (mode === "failed") {
        elements.appProgressTitle.textContent = "Coverage Before Failure";
      } else if (mode === "partial") {
        elements.appProgressTitle.textContent = "Partial Journey Coverage";
      } else {
        elements.appProgressTitle.textContent = "Journey Health";
      }
    }
    if (elements.testProgressItems) {
      elements.testProgressItems.innerHTML = renderAppProgress(report, liveStatus, mode);
    }
    if (elements.appProgressMeta) {
      if (isLive && progress) {
        elements.appProgressMeta.textContent = `${String(progress.percent ?? 0)}% · ${progress.message || "Processing"}`;
      } else if (mode === "failed") {
        elements.appProgressMeta.textContent = `${journeysCount} attempted journey${journeysCount === 1 ? "" : "s"} before failure`;
      } else if (mode === "partial") {
        elements.appProgressMeta.textContent = `${journeysCount} journey${journeysCount === 1 ? "" : "s"} tracked · partial confidence`;
      } else {
        elements.appProgressMeta.textContent = `${journeysCount} journey${journeysCount === 1 ? "" : "s"} tracked`;
      }
    }

    const regression = renderRegressionSignals(report, row);
    if (elements.regressionMeta) {
      elements.regressionMeta.textContent = regression.meta;
    }
    if (elements.regressionSignalsItems) {
      elements.regressionSignalsItems.innerHTML = regression.markup;
    }

    if (elements.liveMissionSection) {
      elements.liveMissionSection.hidden = !showLiveMission;
      elements.liveMissionSection.setAttribute("aria-hidden", showLiveMission ? "false" : "true");
    }
    if (elements.liveMissionMeta) {
      if (showLiveMission) {
        if (isLive) {
          const queueExperience = buildQueueExperience(liveStatus, row);
          elements.liveMissionMeta.textContent =
            queueStatus === "queued" || queueStatus === "retryable"
              ? `queued · ${queueExperience.queueAhead === null ? "waiting for worker" : `${queueExperience.queueAhead} ahead`} · ${queueExperience.etaLabel}`
              : `${queueStatus || "processing"} · ${String(progress?.percent ?? 0)}%`;
        } else {
          const terminal = buildLiveTerminalSummary(report, liveStatus, row);
          elements.liveMissionMeta.textContent = `${formatStatusLabel(terminal.status)} · ${
            terminal.durationLabel || formatRelativeTime(row?.delivered_at)
          }`;
        }
      } else {
        elements.liveMissionMeta.textContent = "Awaiting live run";
      }
    }
    updateLiveStreamPanel(report?.run_id || row?.run_id, liveStatus, report, row, showLiveMission);
    if (elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = showLiveMission
        ? renderLiveIncomingFindings(report, row, liveStatus)
        : '<div class="app-empty"><p>Incoming findings appear while a run is live.</p></div>';
    }
    if (elements.liveActivityItems) {
      elements.liveActivityItems.innerHTML = showLiveMission
        ? renderLiveActivityFeed(liveStatus, row)
        : '<div class="app-empty"><p>Live agent activity appears during processing.</p></div>';
    }

    renderRecentRunsTableHelper();
  }

  globalScope.SwarmDashboardPanels = {
    renderRecentRunsTable,
    renderAppRunPicker,
    renderAppPanels
  };
})(window);
