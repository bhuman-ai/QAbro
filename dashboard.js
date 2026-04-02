document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.dashboard-nav a');
  const mainContent = document.querySelector('.dashboard-main-content');

  const panels = {
    runs: document.getElementById('runsPanel'),
    projects: document.getElementById('projectPanelHeader'),
    reports: document.getElementById('reportDetailPanel'),
    onboarding: document.getElementById('onboardingShell'),
  };

  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'settingsPanel';
  settingsPanel.className = 'app-panel';
  settingsPanel.hidden = true;
  settingsPanel.innerHTML = '<h2>Settings</h2><p>General settings and configurations will be available here.</p>';
  mainContent.appendChild(settingsPanel);
  panels.settings = settingsPanel;


  function switchPanel(panelId) {
    for (const id in panels) {
      if (panels[id]) panels[id].hidden = true;
    }

    const appShell = document.getElementById('dashboardAppShell');
    if (appShell) {
      appShell.hidden = !['runs', 'reports', 'projects'].includes(panelId);
    }
    
    const selectedPanel = panels[panelId];
    if (selectedPanel) selectedPanel.hidden = false;

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.dataset.panel === panelId) link.classList.add('active');
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchPanel(e.target.dataset.panel);
    });
  });

  switchPanel('projects'); 
});
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
    const buildDashboardMissionModel =
      typeof helpers.buildDashboardMissionModel === "function"
        ? helpers.buildDashboardMissionModel
        : () => ({ headline: "", steps: [], personaLabel: "Audience", personaDetail: "", metaPills: [] });
    const normalizeScopeModeInput =
      typeof helpers.normalizeScopeModeInput === "function" ? helpers.normalizeScopeModeInput : (value) => String(value || "");
    const formatRelativeTime = typeof helpers.formatRelativeTime === "function" ? helpers.formatRelativeTime : () => "";
    const formatStatusLabel = typeof helpers.formatStatusLabel === "function" ? helpers.formatStatusLabel : (value) => String(value || "");
    const escapeHtml = typeof helpers.escapeHtml === "function" ? helpers.escapeHtml : (value) => String(value || "");
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
    const missionModel = buildDashboardMissionModel(mission, row);
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
      const stepsMarkup = Array.isArray(missionModel.steps) && missionModel.steps.length
        ? `<ol class="primary-goal-steps">${missionModel.steps
            .map(
              (step, index) => `
                <li class="primary-goal-step">
                  <span class="primary-goal-step-index">${escapeHtml(String(index + 1))}</span>
                  <span class="primary-goal-step-text">${escapeHtml(step)}</span>
                </li>
              `
            )
            .join("")}</ol>`
        : "";
      elements.dashboardPrimaryGoalText.innerHTML = `
        <p class="primary-goal-headline">${escapeHtml(missionModel.headline || mission.goal || "Mission context updates with the selected run.")}</p>
        ${stepsMarkup}
      `;
    }
    if (elements.dashboardPrimaryGoalMeta) {
      const metaMarkup = Array.isArray(missionModel.metaPills) && missionModel.metaPills.length
        ? missionModel.metaPills
            .map((item) => `<span class="primary-goal-meta-pill">${escapeHtml(item)}</span>`)
            .join("")
        : '<span class="primary-goal-meta-note">Target, run mode, and task count appear here.</span>';
      elements.dashboardPrimaryGoalMeta.innerHTML = metaMarkup;
    }
    if (elements.dashboardPrimaryGoalPersona) {
      elements.dashboardPrimaryGoalPersona.textContent = missionModel.personaLabel || "Audience";
      if (missionModel.personaDetail) {
        elements.dashboardPrimaryGoalPersona.setAttribute("title", missionModel.personaDetail);
      } else {
        elements.dashboardPrimaryGoalPersona.removeAttribute("title");
      }
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
(function initSwarmDashboardProjects(globalScope) {
  function fallbackNormalizeBrandKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function fallbackToDisplayProjectName(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }

  function fallbackEscapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeProjectMetadata(value, depth = 0) {
    if (!value || typeof value !== "object") {
      return {};
    }

    if (depth >= 2) {
      return {};
    }

    const metadata = {};
    let count = 0;
    for (const [key, rawValue] of Object.entries(value)) {
      if (count >= 20) {
        break;
      }
      const safeKey = String(key || "").trim().slice(0, 128);
      if (!safeKey) {
        continue;
      }
      if (rawValue === null || ["string", "number", "boolean"].includes(typeof rawValue)) {
        metadata[safeKey] = typeof rawValue === "string" ? String(rawValue).trim().slice(0, 512) : rawValue;
        count += 1;
        continue;
      }
      if (Array.isArray(rawValue)) {
        metadata[safeKey] = rawValue
          .slice(0, 12)
          .map((item) => (typeof item === "string" ? String(item).trim().slice(0, 320) : item))
          .filter((item) => item !== undefined);
        count += 1;
        continue;
      }
      if (typeof rawValue === "object") {
        metadata[safeKey] = normalizeProjectMetadata(rawValue, depth + 1);
        count += 1;
      }
    }

    return metadata;
  }

  function normalizeSavedProject(project, helpers = {}) {
    const normalizeBrandKey =
      typeof helpers.normalizeBrandKey === "function" ? helpers.normalizeBrandKey : fallbackNormalizeBrandKey;
    const key = normalizeBrandKey(project?.brand_key || project?.brandKey);
    if (!key) {
      return null;
    }

    return {
      key,
      name: String(project?.brand_name || project?.brandName || "").trim(),
      targetUrl: String(project?.target_url || project?.targetUrl || "").trim(),
      lastUsedAt: String(project?.last_used_at || project?.lastUsedAt || "").trim(),
      createdAt: String(project?.created_at || project?.createdAt || "").trim(),
      runCount: Math.max(0, Number(project?.run_count || project?.runCount) || 0),
      latestRunAt: String(project?.latest_run_at || project?.latestRunAt || "").trim(),
      metadata: normalizeProjectMetadata(project?.metadata)
    };
  }

  function buildProjectOptions(savedProjects, helpers = {}) {
    const normalizeProject =
      typeof helpers.normalizeProject === "function"
        ? helpers.normalizeProject
        : (project) => normalizeSavedProject(project, helpers);
    const options = [];
    const seen = new Set();

    for (const project of Array.isArray(savedProjects) ? savedProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized || seen.has(normalized.key)) {
        continue;
      }
      options.push({
        key: normalized.key,
        count: normalized.runCount,
        name: normalized.name || "",
        targetUrl: normalized.targetUrl || "",
        lastUsedAt: normalized.lastUsedAt,
        createdAt: normalized.createdAt,
        latestRunAt: normalized.latestRunAt
      });
      seen.add(normalized.key);
    }

    return options;
  }

  function getProjectOptionBaseLabel(optionOrKey, helpers = {}) {
    const findProjectOption = typeof helpers.findProjectOption === "function" ? helpers.findProjectOption : null;
    const toDisplayProjectName =
      typeof helpers.toDisplayProjectName === "function" ? helpers.toDisplayProjectName : fallbackToDisplayProjectName;
    const option =
      optionOrKey && typeof optionOrKey === "object" ? optionOrKey : findProjectOption ? findProjectOption(optionOrKey) : null;
    if (!option) {
      return toDisplayProjectName(optionOrKey) || String(optionOrKey || "").trim();
    }

    const explicitName = String(option.name || "").trim();
    if (explicitName) {
      return explicitName;
    }
    const targetLabel = toDisplayProjectName(option.targetUrl);
    if (targetLabel) {
      return targetLabel;
    }
    return option.key;
  }

  function getProjectOptionLabel(optionOrKey, helpers = {}) {
    const brandOptions = Array.isArray(helpers.brandOptions) ? helpers.brandOptions : [];
    const findProjectOption = typeof helpers.findProjectOption === "function" ? helpers.findProjectOption : null;
    const toDisplayProjectName =
      typeof helpers.toDisplayProjectName === "function" ? helpers.toDisplayProjectName : fallbackToDisplayProjectName;
    const option =
      optionOrKey && typeof optionOrKey === "object" ? optionOrKey : findProjectOption ? findProjectOption(optionOrKey) : null;

    if (option) {
      const baseLabel = getProjectOptionBaseLabel(option, helpers);
      const duplicateCount = brandOptions.filter((candidate) => {
        return getProjectOptionBaseLabel(candidate, helpers).toLowerCase() === baseLabel.toLowerCase();
      }).length;
      if (duplicateCount <= 1) {
        return baseLabel;
      }

      const hostLabel = toDisplayProjectName(option.targetUrl);
      if (hostLabel && hostLabel.toLowerCase() !== baseLabel.toLowerCase()) {
        return `${baseLabel} · ${hostLabel}`;
      }

      const keyLabel = toDisplayProjectName(option.key) || option.key;
      if (keyLabel && keyLabel.toLowerCase() !== baseLabel.toLowerCase()) {
        return `${baseLabel} · ${keyLabel}`;
      }

      return `${baseLabel} · ${option.key}`;
    }

    return toDisplayProjectName(optionOrKey) || String(optionOrKey || "").trim();
  }

  function mergeSavedProjects(currentProjects, incomingProjects, helpers = {}) {
    const normalizeProject =
      typeof helpers.normalizeProject === "function"
        ? helpers.normalizeProject
        : (project) => normalizeSavedProject(project, helpers);
    const next = new Map();

    for (const project of Array.isArray(currentProjects) ? currentProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized) {
        continue;
      }
      next.set(normalized.key, {
        brand_key: normalized.key,
        brand_name: normalized.name || null,
        target_url: normalized.targetUrl || null,
        last_used_at: normalized.lastUsedAt || null,
        created_at: normalized.createdAt || null,
        run_count: normalized.runCount || 0,
        latest_run_at: normalized.latestRunAt || null,
        metadata: normalizeProjectMetadata(normalized.metadata)
      });
    }

    for (const project of Array.isArray(incomingProjects) ? incomingProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized) {
        continue;
      }
      next.set(normalized.key, {
        brand_key: normalized.key,
        brand_name: normalized.name || null,
        target_url: normalized.targetUrl || null,
        last_used_at: normalized.lastUsedAt || new Date().toISOString(),
        created_at: normalized.createdAt || null,
        run_count: normalized.runCount || 0,
        latest_run_at: normalized.latestRunAt || normalized.lastUsedAt || null,
        metadata: normalizeProjectMetadata(normalized.metadata)
      });
    }

    return Array.from(next.values()).sort((left, right) => {
      const leftTime = Date.parse(left.last_used_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.last_used_at || right.created_at || "") || 0;
      return rightTime - leftTime || String(left.brand_key || "").localeCompare(String(right.brand_key || ""));
    });
  }

  function buildSavedProjectPayload(config = {}, metadata = {}, helpers = {}) {
    const normalizeTargetUrl =
      typeof helpers.normalizeTargetUrl === "function" ? helpers.normalizeTargetUrl : (value) => String(value || "").trim();
    const sanitizeBrandKey =
      typeof helpers.sanitizeBrandKey === "function" ? helpers.sanitizeBrandKey : fallbackNormalizeBrandKey;
    const inferBrandKeyFromTargetUrl =
      typeof helpers.inferBrandKeyFromTargetUrl === "function" ? helpers.inferBrandKeyFromTargetUrl : () => "";
    const inferBrandNameFromTargetUrl =
      typeof helpers.inferBrandNameFromTargetUrl === "function" ? helpers.inferBrandNameFromTargetUrl : fallbackToDisplayProjectName;
    const safeConfig = config && typeof config === "object" ? config : {};
    const targetUrl = normalizeTargetUrl(safeConfig.targetUrl || "");
    const brandKey = sanitizeBrandKey(String(safeConfig.brandKey || inferBrandKeyFromTargetUrl(targetUrl) || ""));
    if (!brandKey) {
      return null;
    }

    const projectMetadata = normalizeProjectMetadata(metadata);
    const source = String(metadata.source || projectMetadata.source || "").trim();
    if (source) {
      projectMetadata.source = source;
    }

    return {
      brand_key: brandKey,
      brand_name: String(safeConfig.brandName || inferBrandNameFromTargetUrl(targetUrl) || "").trim() || null,
      target_url: targetUrl || null,
      metadata: projectMetadata,
      last_used_at: new Date().toISOString()
    };
  }

  function syncProjectFilterInput(config = {}) {
    const selectElement = config.selectElement;
    if (!selectElement) {
      return;
    }

    const normalizeBrandKey =
      typeof config.normalizeBrandKey === "function" ? config.normalizeBrandKey : fallbackNormalizeBrandKey;
    const resolveProjectOptionLabel =
      typeof config.getProjectOptionLabel === "function"
        ? config.getProjectOptionLabel
        : (value) => getProjectOptionLabel(value, config);
    const escapeHtml = typeof config.escapeHtml === "function" ? config.escapeHtml : fallbackEscapeHtml;
    const desiredBrand = normalizeBrandKey(config.selectedBrand);
    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const addNewProjectValue = String(config.addNewProjectValue || "__add_new__").trim();

    if (selectElement.tagName === "SELECT") {
      const hasDesiredBrand = Array.from(selectElement.options || []).some((option) => option.value === desiredBrand);
      if (desiredBrand && !hasDesiredBrand && brandOptions.length > 0) {
        selectElement.innerHTML = [
          `<option value="${escapeHtml(desiredBrand)}">${escapeHtml(resolveProjectOptionLabel(desiredBrand) || desiredBrand)}</option>`,
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ].join("");
      }
      selectElement.value = hasDesiredBrand || brandOptions.length > 0 ? desiredBrand : "";
      return;
    }

    selectElement.value = desiredBrand;
  }

  function renderProjectFilter(config = {}) {
    const selectElement = config.selectElement;
    if (!selectElement || selectElement.tagName !== "SELECT") {
      return;
    }

    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const selectedBrand = String(config.selectedBrand || "").trim();
    const loading = Boolean(config.loading);
    const escapeHtml = typeof config.escapeHtml === "function" ? config.escapeHtml : fallbackEscapeHtml;
    const resolveProjectOptionLabel =
      typeof config.getProjectOptionLabel === "function"
        ? config.getProjectOptionLabel
        : (value) => getProjectOptionLabel(value, config);
    const addNewProjectValue = String(config.addNewProjectValue || "__add_new__").trim();
    const loadingLabel = String(config.loadingLabel || "Loading projects...").trim() || "Loading projects...";
    const emptyLabel = String(config.emptyLabel || "No projects yet").trim() || "No projects yet";

    const options = loading
      ? [`<option value="" disabled selected>${escapeHtml(loadingLabel)}</option>`]
      : brandOptions.length
      ? [
          ...brandOptions.map(
            (brand) =>
              `<option value="${escapeHtml(brand.key)}">${escapeHtml(resolveProjectOptionLabel(brand) || brand.key)}</option>`
          ),
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ]
      : [
          `<option value="" disabled selected>${escapeHtml(emptyLabel)}</option>`,
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ];
    selectElement.innerHTML = options.join("");
    selectElement.disabled = loading;
    selectElement.setAttribute("aria-busy", loading ? "true" : "false");
    if (loading) {
      selectElement.value = "";
      return;
    }
    const hasSelectedBrand = brandOptions.some((brand) => brand.key === selectedBrand);
    if (brandOptions.length) {
      selectElement.value = hasSelectedBrand ? selectedBrand : brandOptions[0].key;
      return;
    }
    selectElement.value = "";
  }

  function ensureSingleProjectSelection(config = {}) {
    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const normalizeBrandKey =
      typeof config.normalizeBrandKey === "function" ? config.normalizeBrandKey : fallbackNormalizeBrandKey;
    const selectedBrand = normalizeBrandKey(config.selectedBrand);

    if (!brandOptions.length) {
      return {
        changed: Boolean(selectedBrand),
        selectedBrand: ""
      };
    }

    const availableProjects = new Set(
      brandOptions.map((brand) => normalizeBrandKey(brand?.key)).filter(Boolean)
    );
    if (availableProjects.has(selectedBrand)) {
      return {
        changed: false,
        selectedBrand
      };
    }

    return {
      changed: true,
      selectedBrand: normalizeBrandKey(brandOptions[0]?.key)
    };
  }

  globalScope.SwarmDashboardProjects = {
    normalizeSavedProject,
    buildProjectOptions,
    getProjectOptionBaseLabel,
    getProjectOptionLabel,
    mergeSavedProjects,
    buildSavedProjectPayload,
    syncProjectFilterInput,
    renderProjectFilter,
    ensureSingleProjectSelection
  };
})(window);
(function initSwarmDashboardRuns(globalScope) {
  function fallbackNormalizeRunStatus(value) {
    return String(value || "").trim().toLowerCase();
  }

  function fallbackIsQueueActiveStatus(value) {
    const status = fallbackNormalizeRunStatus(value);
    return status === "queued" || status === "processing" || status === "running" || status === "pending";
  }

  function normalizeRunId(value) {
    return String(value || "").trim();
  }

  function buildPersonaOptions(items, helpers = {}) {
    const extractRunPersona =
      typeof helpers.extractRunPersona === "function" ? helpers.extractRunPersona : (row) => String(row?.persona || "").trim();
    const counts = new Map();

    for (const row of Array.isArray(items) ? items : []) {
      const persona = String(extractRunPersona(row) || "").trim();
      if (!persona) {
        continue;
      }
      counts.set(persona, (counts.get(persona) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }

  function upsertRunCollection(collection, draftRow) {
    if (!draftRow || typeof draftRow !== "object" || !normalizeRunId(draftRow.run_id)) {
      return Array.isArray(collection) ? collection.slice() : [];
    }

    const items = Array.isArray(collection) ? collection.slice() : [];
    const existingIndex = items.findIndex((item) => item && item.run_id === draftRow.run_id);
    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        ...draftRow
      };
      const [existing] = items.splice(existingIndex, 1);
      items.unshift(existing);
      return items;
    }

    items.unshift(draftRow);
    return items;
  }

  function buildPinnedRunSnapshot(runId, config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId) {
      return null;
    }

    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : new Map();
    const allRuns = Array.isArray(config.allRuns) ? config.allRuns : [];
    const runs = Array.isArray(config.runs) ? config.runs : [];
    const candidate = config.candidate && typeof config.candidate === "object" ? config.candidate : null;
    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const normalizeRunStatus =
      typeof helpers.normalizeRunStatus === "function" ? helpers.normalizeRunStatus : fallbackNormalizeRunStatus;
    const base =
      candidate ||
      optimisticRuns.get(safeRunId) ||
      allRuns.find((item) => item?.run_id === safeRunId) ||
      runs.find((item) => item?.run_id === safeRunId) ||
      null;
    if (!base) {
      return null;
    }

    const liveStatus = getLiveStatus(safeRunId);
    const queueStatus = normalizeRunStatus(
      liveStatus?.queue?.queue_status || liveStatus?.queue?.status || base.queue_status || base.status
    );
    const reportStatus = normalizeRunStatus(
      liveStatus?.report_status || liveStatus?.live_report?.status || base.latest_report_status || base.status
    );
    const liveFindings = Array.isArray(liveStatus?.live_report?.findings) ? liveStatus.live_report.findings.length : null;
    const liveJourneys = Array.isArray(liveStatus?.live_report?.tested_journeys) ? liveStatus.live_report.tested_journeys.length : null;
    const deliveredAt =
      base.delivered_at ||
      liveStatus?.queue?.enqueued_at ||
      liveStatus?.progress?.updated_at ||
      new Date().toISOString();

    return {
      ...base,
      run_id: safeRunId,
      status: queueStatus || reportStatus || base.status,
      latest_report_status: reportStatus || base.latest_report_status || base.status,
      queue_status: queueStatus || base.queue_status || base.status,
      delivered_at: deliveredAt,
      report_ready: liveStatus?.report_ready ?? base.report_ready ?? false,
      findings_count: liveFindings ?? base.findings_count ?? 0,
      journeys_count: liveJourneys ?? base.journeys_count ?? 0,
      summary_note:
        liveStatus?.progress?.message ||
        liveStatus?.live_report?.summary?.note ||
        base.summary_note ||
        "Run queued and waiting for live updates."
    };
  }

  function rememberPinnedRun(config = {}, helpers = {}) {
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    const row = config.row && typeof config.row === "object" ? config.row : null;
    const snapshot = buildPinnedRunSnapshot(row?.run_id, { ...config, candidate: row }, helpers);
    if (!snapshot || !(optimisticRuns instanceof Map)) {
      return null;
    }
    optimisticRuns.set(snapshot.run_id, snapshot);
    return snapshot;
  }

  function shouldKeepPinnedRun(runId, config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId) {
      return false;
    }

    const candidate = config.candidate && typeof config.candidate === "object" ? config.candidate : null;
    const selectedRunId = normalizeRunId(config.selectedRunId);
    const requestedRunId = normalizeRunId(config.requestedRunId);
    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const normalizeRunStatus =
      typeof helpers.normalizeRunStatus === "function" ? helpers.normalizeRunStatus : fallbackNormalizeRunStatus;
    const isQueueActiveStatus =
      typeof helpers.isQueueActiveStatus === "function" ? helpers.isQueueActiveStatus : fallbackIsQueueActiveStatus;
    const liveStatus = getLiveStatus(safeRunId);
    const queueStatus = normalizeRunStatus(
      liveStatus?.queue?.queue_status ||
        liveStatus?.queue?.status ||
        candidate?.queue_status ||
        candidate?.status ||
        candidate?.latest_report_status
    );

    if (isQueueActiveStatus(queueStatus)) {
      return true;
    }
    return safeRunId === selectedRunId || safeRunId === requestedRunId;
  }

  function reconcilePinnedRunsWithFetched(config = {}, helpers = {}) {
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    if (!(optimisticRuns instanceof Map)) {
      return;
    }

    const fetchedItems = Array.isArray(config.fetchedItems) ? config.fetchedItems : [];
    const fetchedMap = new Map(
      fetchedItems
        .filter((item) => item && item.run_id)
        .map((item) => [String(item.run_id), item])
    );

    for (const [runId, pinnedRow] of optimisticRuns.entries()) {
      const fetchedRow = fetchedMap.get(runId) || null;
      if (fetchedRow) {
        rememberPinnedRun({ ...config, row: { ...pinnedRow, ...fetchedRow } }, helpers);
      }
      const candidate = fetchedRow || pinnedRow;
      if (!shouldKeepPinnedRun(runId, { ...config, candidate }, helpers)) {
        optimisticRuns.delete(runId);
      }
    }
  }

  function mergePinnedRunsIntoCollection(config = {}, helpers = {}) {
    let items = Array.isArray(config.collection) ? config.collection.slice() : [];
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : new Map();

    for (const [runId, pinnedRow] of optimisticRuns.entries()) {
      if (!shouldKeepPinnedRun(runId, { ...config, candidate: pinnedRow }, helpers)) {
        continue;
      }
      const snapshot = buildPinnedRunSnapshot(runId, { ...config, candidate: pinnedRow }, helpers);
      if (!snapshot) {
        continue;
      }
      items = upsertRunCollection(items, snapshot);
    }

    return items;
  }

  function getPinnedRunRow(config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(config.runId);
    if (!safeRunId) {
      return null;
    }

    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    const candidate = optimisticRuns instanceof Map ? optimisticRuns.get(safeRunId) : null;
    if (!candidate) {
      return null;
    }

    return buildPinnedRunSnapshot(safeRunId, { ...config, candidate }, helpers);
  }

  function ensureSelectedRunVisibleInRuns(config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(config.selectedRunId || config.requestedRunId);
    const runs = Array.isArray(config.runs) ? config.runs.slice() : [];
    const allRuns = Array.isArray(config.allRuns) ? config.allRuns.slice() : [];

    if (!safeRunId || runs.some((item) => item?.run_id === safeRunId)) {
      return { runs, allRuns };
    }

    const pinnedRow =
      getPinnedRunRow({ ...config, runId: safeRunId }, helpers) ||
      allRuns.find((item) => item?.run_id === safeRunId) ||
      null;
    if (!pinnedRow) {
      return { runs, allRuns };
    }

    return {
      runs: upsertRunCollection(runs, pinnedRow),
      allRuns: upsertRunCollection(allRuns, pinnedRow)
    };
  }

  function ensureActiveRunSelection(config = {}, helpers = {}) {
    let runs = Array.isArray(config.runs) ? config.runs.slice() : [];
    if (!runs.length) {
      return {
        runs,
        selectedRunId: ""
      };
    }

    const selectedRunId = normalizeRunId(config.selectedRunId);
    const requestedRunId = normalizeRunId(config.requestedRunId);
    if (selectedRunId && runs.some((item) => item?.run_id === selectedRunId)) {
      return {
        runs,
        selectedRunId
      };
    }

    const pinnedRow = getPinnedRunRow({ ...config, runId: selectedRunId || requestedRunId }, helpers);
    if (pinnedRow) {
      runs = upsertRunCollection(runs, pinnedRow);
      return {
        runs,
        selectedRunId: normalizeRunId(pinnedRow.run_id)
      };
    }

    return {
      runs,
      selectedRunId: normalizeRunId(runs[0]?.run_id)
    };
  }

  globalScope.SwarmDashboardRuns = {
    buildPersonaOptions,
    upsertRunCollection,
    buildPinnedRunSnapshot,
    rememberPinnedRun,
    shouldKeepPinnedRun,
    reconcilePinnedRunsWithFetched,
    mergePinnedRunsIntoCollection,
    getPinnedRunRow,
    ensureSelectedRunVisibleInRuns,
    ensureActiveRunSelection
  };
})(window);
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
