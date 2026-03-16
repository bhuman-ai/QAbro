const STORAGE_ACTIVE_BRAND_KEY = "swarmtester.activeBrand";
const STORAGE_ACTIVE_PERSONA_KEY = "swarmtester.activePersona";
const STORAGE_ONBOARDING_COMPLETED_KEY_PREFIX = "swarmtester.onboarding.completed";
const STORAGE_THEME_MODE_KEY = "swarmtester.theme.mode";
const ADD_NEW_PROJECT_OPTION_VALUE = "__add_new__";
const DEFAULT_DASHBOARD_PERSONA = "General non-developer business user with moderate technical comfort.";
const DEFAULT_ONBOARDING_SCENARIO = "Clear signup, authentication, and onboarding to reach a usable in-product state.";
const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:$|[?#])/i;
const VIDEO_URL_PATTERN = /\.(mp4|webm|ogg|mov|m4v|m3u8)(?:$|[?#])/i;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const DATA_VIDEO_PATTERN = /^data:video\/[a-z0-9.+-]+;base64,/i;

const elements = {
  appDashboardRoot: document.getElementById("appQaDashboard"),
  topbarProjectShell: document.getElementById("topbarProjectShell"),
  appRunPicker: document.getElementById("appRunPicker"),
  recentIssuesItems: document.getElementById("recentIssuesItems"),
  testProgressItems: document.getElementById("testProgressItems"),
  appProgressMeta: document.getElementById("appProgressMeta"),
  appEvidencePanel: document.getElementById("appEvidencePanel"),
  appEvidenceMeta: document.getElementById("appEvidenceMeta"),
  appReportOnlyPanel: document.getElementById("appReportOnlyPanel"),
  dashboardRunMeta: document.getElementById("dashboardRunMeta"),
  dashboardStateBadge: document.getElementById("dashboardStateBadge"),
  dashboardStateMessage: document.getElementById("dashboardStateMessage"),
  riskCriticalLabel: document.getElementById("riskCriticalLabel"),
  riskCriticalCount: document.getElementById("riskCriticalCount"),
  riskMajorLabel: document.getElementById("riskMajorLabel"),
  riskMajorCount: document.getElementById("riskMajorCount"),
  riskJourneyLabel: document.getElementById("riskJourneyLabel"),
  riskBrokenJourneys: document.getElementById("riskBrokenJourneys"),
  riskSatisfactionLabel: document.getElementById("riskSatisfactionLabel"),
  riskAvgSatisfaction: document.getElementById("riskAvgSatisfaction"),
  dashboardPrimaryMeta: document.getElementById("dashboardPrimaryMeta"),
  dashboardPrimaryAction: document.getElementById("dashboardPrimaryAction"),
  dashboardOpenReport: document.getElementById("dashboardOpenReport"),
  dashboardCompareRuns: document.getElementById("dashboardCompareRuns"),
  dashboardShareAction: document.getElementById("dashboardShareAction"),
  healthHeroTitle: document.getElementById("healthHeroTitle"),
  dashboardPrimaryGoal: document.getElementById("dashboardPrimaryGoal"),
  dashboardPrimaryGoalText: document.getElementById("dashboardPrimaryGoalText"),
  dashboardPrimaryGoalMeta: document.getElementById("dashboardPrimaryGoalMeta"),
  dashboardPrimaryGoalPersona: document.getElementById("dashboardPrimaryGoalPersona"),
  personaSignalsTitle: document.getElementById("personaSignalsTitle"),
  personaSignalsItems: document.getElementById("personaSignalsItems"),
  personaSignalsMeta: document.getElementById("personaSignalsMeta"),
  environmentSwitcher: document.getElementById("environmentSwitcher"),
  liveMissionSection: document.getElementById("liveMissionSection"),
  liveMissionMeta: document.getElementById("liveMissionMeta"),
  liveStreamPanel: document.getElementById("liveStreamPanel"),
  liveActivityItems: document.getElementById("liveActivityItems"),
  topFixesTitle: document.getElementById("topFixesTitle"),
  topFixesItems: document.getElementById("topFixesItems"),
  topFixesMeta: document.getElementById("topFixesMeta"),
  appProgressTitle: document.getElementById("appProgressTitle"),
  regressionSignalsItems: document.getElementById("regressionSignalsItems"),
  regressionMeta: document.getElementById("regressionMeta"),
  recentRunsRows: document.getElementById("recentRunsRows"),
  recentRunsMeta: document.getElementById("recentRunsMeta"),
  activeSwarmNotice: document.getElementById("activeSwarmNotice"),
  launchSwarmButton: document.getElementById("launchSwarmButton"),
  appAuthHeader: document.getElementById("appAuthHeader"),
  dashboardLoadingOverlay: document.getElementById("dashboardLoadingOverlay"),
  dashboardSecondaryActions: document.getElementById("dashboardSecondaryActions"),
  onboardingSection: document.getElementById("qa-onboarding"),
  onboardingCloseButton: document.getElementById("onboardingCloseButton"),
  onboardingForm: document.getElementById("onboardingForm"),
  onboardingTargetUrl: document.getElementById("onboardingTargetUrl"),
  onboardingBrandKey: document.getElementById("onboardingBrandKey"),
  onboardingPersona: document.getElementById("onboardingPersona"),
  onboardingScopeMode: document.getElementById("onboardingScopeMode"),
  onboardingScenarios: document.getElementById("onboardingScenarios"),
  onboardingScenarioHint: document.getElementById("onboardingScenarioHint"),
  onboardingStepTitle: document.getElementById("onboardingStepTitle"),
  onboardingStepCount: document.getElementById("onboardingStepCount"),
  onboardingProgressBar: document.getElementById("onboardingProgressBar"),
  onboardingStepPills: document.getElementById("onboardingStepPills"),
  onboardingPreviewHost: document.getElementById("onboardingPreviewHost"),
  onboardingPreviewUrl: document.getElementById("onboardingPreviewUrl"),
  onboardingPreviewBrandName: document.getElementById("onboardingPreviewBrandName"),
  onboardingPreviewIcon: document.getElementById("onboardingPreviewIcon"),
  onboardingPersonaChoices: document.getElementById("onboardingPersonaChoices"),
  onboardingPersonaCustom: document.getElementById("onboardingPersonaCustom"),
  onboardingIntensityChoices: document.getElementById("onboardingIntensityChoices"),
  onboardingCriticalChoices: document.getElementById("onboardingCriticalChoices"),
  onboardingScenariosCustom: document.getElementById("onboardingScenariosCustom"),
  onboardingLaunchSummary: document.getElementById("onboardingLaunchSummary"),
  onboardingLaunchSequence: document.getElementById("onboardingLaunchSequence"),
  onboardingReviewSite: document.getElementById("onboardingReviewSite"),
  onboardingReviewSiteMeta: document.getElementById("onboardingReviewSiteMeta"),
  onboardingReviewPersonas: document.getElementById("onboardingReviewPersonas"),
  onboardingReviewGoals: document.getElementById("onboardingReviewGoals"),
  onboardingReviewCoverage: document.getElementById("onboardingReviewCoverage"),
  onboardingReviewCoverageMeta: document.getElementById("onboardingReviewCoverageMeta"),
  onboardingPrevButton: document.getElementById("onboardingPrevButton"),
  onboardingNextButton: document.getElementById("onboardingNextButton"),
  onboardingSubmitButton: document.getElementById("onboardingSubmitButton"),
  onboardingMessage: document.getElementById("onboardingMessage"),
  onboardingStatusText: document.getElementById("onboardingStatusText"),
  metricPersonas: document.getElementById("metricPersonas"),
  metricBugs: document.getElementById("metricBugs"),
  metricFriction: document.getElementById("metricFriction"),
  metricComplete: document.getElementById("metricComplete"),
  brandFilter: document.getElementById("brandFilter"),
  targetFilter: document.getElementById("targetFilter"),
  statusFilter: document.getElementById("statusFilter"),
  searchFilter: document.getElementById("searchFilter"),
  applyFilters: document.getElementById("applyFilters"),
  refreshReports: document.getElementById("refreshReports"),
  reportsCount: document.getElementById("reportsCount"),
  reportsItems: document.getElementById("reportsItems"),
  reportDetail: document.getElementById("reportDetail"),
  activeBrandLabel: document.getElementById("activeBrandLabel"),
  activeBrandMeta: document.getElementById("activeBrandMeta"),
  metricRuns: document.getElementById("metricRuns"),
  metricCompleted: document.getElementById("metricCompleted"),
  metricFindings: document.getElementById("metricFindings"),
  metricRisk: document.getElementById("metricRisk"),
  brandChips: document.getElementById("brandChips"),
  brandChipsCount: document.getElementById("brandChipsCount"),
  themeModeSwitcher: document.getElementById("themeModeSwitcher")
};

const REQUIRED_REPORTS_ELEMENTS = [
  "brandFilter",
  "targetFilter",
  "statusFilter",
  "searchFilter",
  "applyFilters",
  "refreshReports",
  "reportsCount",
  "reportsItems",
  "reportDetail",
  "activeBrandLabel",
  "activeBrandMeta",
  "metricRuns",
  "metricCompleted",
  "metricFindings",
  "metricRisk",
  "brandChips",
  "brandChipsCount"
];

const hasLegacyReportsUi = REQUIRED_REPORTS_ELEMENTS.every((key) => Boolean(elements[key]));
const hasAppDashboardUi = Boolean(
  elements.appDashboardRoot &&
    elements.appRunPicker &&
    elements.recentIssuesItems &&
    elements.testProgressItems &&
    elements.appEvidencePanel
);
const hasReportsUi = hasLegacyReportsUi || hasAppDashboardUi;
const onboardingGatedSections = Array.from(document.querySelectorAll("[data-onboarding-gated='true']"));
const ONBOARDING_STEP_META = {
  1: {
    title: "Choose the app",
    subtitle: "Start with the real product entry point your users see."
  },
  2: {
    title: "Choose the persona",
    subtitle: "Choose the ICPs the model should roleplay during the run."
  },
  3: {
    title: "Define the mission",
    subtitle: "Pick the post-onboarding outcomes the swarm must reach."
  },
  4: {
    title: "Review and launch",
    subtitle: "Confirm the app, persona, and goals before launch."
  }
};
const ONBOARDING_MAX_STEP = 4;
const ONBOARDING_MAX_PERSONALITIES = 3;
const ONBOARDING_SCOPE_META = {
  core_20m: {
    label: "Fast pass",
    description: "Quick confidence check on the highest-risk path."
  },
  deep_45m: {
    label: "Balanced run",
    description: "Broader coverage that keeps pushing after onboarding."
  },
  feature_targeted: {
    label: "Deep sweep",
    description: "Aggressive exploration focused on the goals you selected."
  }
};
const APP_VIEW_MODES = {
  DASHBOARD: "dashboard",
  LIVE: "live",
  REPORT: "report"
};
const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system"
};
const DASHBOARD_LOADING_FAILSAFE_MS = 4500;

let systemThemeMediaQuery = null;
let systemThemeListener = null;

function parseAppViewMode(params) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(window.location.search);
  const raw = String(query.get("view") || query.get("mode") || "").trim().toLowerCase();
  if (raw === "dashboard") {
    return APP_VIEW_MODES.DASHBOARD;
  }
  if (raw === "live" || raw === "watch" || raw === "mission") {
    return APP_VIEW_MODES.LIVE;
  }
  if (raw === "report" || raw === "report_only" || raw === "share") {
    return APP_VIEW_MODES.REPORT;
  }

  const requestedRun = String(query.get("run_id") || query.get("runId") || "").trim();
  return requestedRun ? APP_VIEW_MODES.REPORT : APP_VIEW_MODES.DASHBOARD;
}

const initialUrlParams = new URLSearchParams(window.location.search);

const state = {
  filters: {
    brand: "",
    persona: "",
    target: "",
    status: "",
    q: "",
    env: "production"
  },
  allRuns: [],
  runs: [],
  savedProjects: [],
  brandOptions: [],
  personaOptions: [],
  selectedRunId: null,
  requestedRunId: "",
  reportCache: new Map(),
  liveStatusCache: new Map(),
  optimisticRuns: new Map(),
  replayControllers: new Map(),
  livePollingTimer: null,
  livePollingInFlight: false,
  dashboardLoadingTimer: null,
  activeRenderedReport: null,
  activeRenderedRow: null,
  appViewMode: parseAppViewMode(initialUrlParams),
  onboarding: {
    completed: false,
    forceOpen: false,
    manualOverride: false,
    syncInFlight: null,
    hasAnyRuns: null,
    initialized: false,
    step: 1
  }
};
const dashboardProjects = window.SwarmDashboardProjects;
if (!dashboardProjects) {
  throw new Error("dashboard-projects.js failed to load");
}
const dashboardRuns = window.SwarmDashboardRuns;
if (!dashboardRuns) {
  throw new Error("dashboard-runs.js failed to load");
}
const dashboardReportRuntime = window.SwarmDashboardReportRuntime;
if (!dashboardReportRuntime) {
  throw new Error("dashboard-report-runtime.js failed to load");
}
const requiresDashboardAuth = Boolean(document.querySelector("[data-dashboard-auth-gate='true']"));

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hashSeed(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function parsePersonaHints(personaName) {
  const value = String(personaName || "").toLowerCase();
  const explicitAgeMatch =
    value.match(/(\d{1,3})\s*[-\s]?(?:year|yr)s?\s*[-\s]?old\b/i) || value.match(/(\d{1,3})\s*yo\b/i);
  const explicitAge = explicitAgeMatch ? Number(explicitAgeMatch[1]) : null;
  let ageGroup = "adult";
  if (explicitAge && explicitAge >= 60) {
    ageGroup = "senior";
  } else if (explicitAge && explicitAge <= 20) {
    ageGroup = "youth";
  } else if (/(senior|elderly|retired|grandma|grandmother|grandpa|grandfather|older|\bold\b)/i.test(value)) {
    ageGroup = "senior";
  } else if (/(teen|student|college|young)/i.test(value)) {
    ageGroup = "youth";
  }

  let gender = "neutral";
  if (/(woman|female|mom|mother|lady|girl|grandma|grandmother)/i.test(value)) {
    gender = "female";
  } else if (/(man|male|dad|father|guy|boy|grandpa|grandfather|gentleman)/i.test(value)) {
    gender = "male";
  }

  return { ageGroup, gender };
}

function buildPersonaAvatarDataUri(personaName) {
  const seed = hashSeed(personaName);
  const hints = parsePersonaHints(personaName);
  let emoji = "🙂";
  if (hints.ageGroup === "senior" && hints.gender === "female") {
    emoji = "👵";
  } else if (hints.ageGroup === "senior" && hints.gender === "male") {
    emoji = "👴";
  } else if (hints.ageGroup === "senior") {
    emoji = "🧓";
  } else if (hints.ageGroup === "youth" && hints.gender === "female") {
    emoji = "👧";
  } else if (hints.ageGroup === "youth" && hints.gender === "male") {
    emoji = "👦";
  } else if (hints.ageGroup === "youth") {
    emoji = "🧒";
  } else if (hints.gender === "female") {
    emoji = "👩";
  } else if (hints.gender === "male") {
    emoji = "👨";
  }

  const bgA = ["#0b1324", "#0f172a", "#111827", "#12243b"][(seed >>> 1) % 4];
  const bgB = ["#17335a", "#1d3f6a", "#214365", "#184f63"][(seed >>> 4) % 4];
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Personality avatar">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="76%">
      <stop offset="0%" stop-color="${bgB}"/>
      <stop offset="100%" stop-color="${bgA}"/>
    </radialGradient>
  </defs>
  <rect width="96" height="96" rx="24" fill="url(#bg)"/>
  <text x="48" y="64" font-size="54" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function buildPersonaAvatarUrl(personaName) {
  const params = new URLSearchParams({
    persona: String(personaName || "General QA personality").trim().slice(0, 280),
    v: "memoji-v4"
  });
  return `/api/qa/persona-avatar?${params.toString()}`;
}

function renderPersonaAvatar(personaName) {
  const fallbackSrc = buildPersonaAvatarDataUri(personaName);
  const generatedSrc = buildPersonaAvatarUrl(personaName);
  return `<img src="${escapeHtml(generatedSrc)}" data-fallback="${escapeHtml(fallbackSrc)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}" alt="${escapeHtml(personaName || "Personality avatar")}" loading="lazy" />`;
}

function formatDate(value) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleString();
}

function toExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (!/^https?:\/\//i.test(raw)) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    return "";
  }
}

function toMediaCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (DATA_IMAGE_PATTERN.test(raw) || DATA_VIDEO_PATTERN.test(raw)) {
    return raw;
  }

  if (isLikelyLocalMediaPath(raw)) {
    return raw;
  }

  return toExternalUrl(raw);
}

function isLikelyLocalMediaPath(value) {
  const raw = String(value || "").trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return false;
  }

  if (/^[a-zA-Z]:\\/.test(raw)) {
    return IMAGE_URL_PATTERN.test(raw) || VIDEO_URL_PATTERN.test(raw);
  }

  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return IMAGE_URL_PATTERN.test(raw) || VIDEO_URL_PATTERN.test(raw);
  }

  return false;
}

function cleanUrlList(links) {
  if (!Array.isArray(links)) {
    return [];
  }

  return links.map((link) => toMediaCandidate(link)).filter(Boolean);
}

function cleanReferenceList(links) {
  if (!Array.isArray(links)) {
    return [];
  }

  const seen = new Set();
  const references = [];

  for (const rawValue of links) {
    const value = String(rawValue || "").trim().slice(0, 160);
    if (!value || toMediaCandidate(value)) {
      continue;
    }

    const lookup = value.toLowerCase();
    if (seen.has(lookup)) {
      continue;
    }

    seen.add(lookup);
    references.push(value);
  }

  return references;
}

function redactVendorText(value) {
  return String(value || "")
    .replaceAll(/browserbase/gi, "session replay")
    .replaceAll(/debug trace/gi, "replay trace");
}

function isLikelyImageUrl(value) {
  const raw = String(value || "").trim();
  if (DATA_IMAGE_PATTERN.test(raw)) {
    return true;
  }

  if (isLikelyLocalMediaPath(raw) && IMAGE_URL_PATTERN.test(raw)) {
    return true;
  }

  const candidateUrl = /^https?:\/\//i.test(raw)
    ? toExternalUrl(raw)
    : raw.startsWith("/")
      ? new URL(raw, window.location.origin).toString()
      : "";
  if (!candidateUrl) {
    return false;
  }

  if (IMAGE_URL_PATTERN.test(candidateUrl)) {
    return true;
  }

  try {
    const parsed = new URL(candidateUrl);
    if (String(parsed.searchParams.get("kind") || "").toLowerCase() === "screenshot") {
      return true;
    }
    const hint = String(parsed.searchParams.get("format") || parsed.searchParams.get("type") || "").toLowerCase();
    if (hint.includes("image")) {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "assets.browserbase.com") {
      return true;
    }

    const path = parsed.pathname.toLowerCase();
    return path.includes("screenshot") || path.includes("image");
  } catch {
    return false;
  }
}

function isLikelyVideoUrl(value) {
  const raw = String(value || "").trim();
  if (DATA_VIDEO_PATTERN.test(raw)) {
    return true;
  }

  if (isLikelyLocalMediaPath(raw) && VIDEO_URL_PATTERN.test(raw)) {
    return true;
  }

  const candidateUrl = /^https?:\/\//i.test(raw)
    ? toExternalUrl(raw)
    : raw.startsWith("/")
      ? new URL(raw, window.location.origin).toString()
      : "";
  if (!candidateUrl) {
    return false;
  }

  if (VIDEO_URL_PATTERN.test(candidateUrl)) {
    return true;
  }

  try {
    const parsed = new URL(candidateUrl);
    if (String(parsed.searchParams.get("kind") || "").toLowerCase() === "video") {
      return true;
    }
    const hint = String(parsed.searchParams.get("format") || parsed.searchParams.get("type") || "").toLowerCase();
    if (hint.includes("video")) {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "assets.browserbase.com") {
      return true;
    }

    const path = parsed.pathname.toLowerCase();
    return path.includes("recording") || path.includes("video");
  } catch {
    return false;
  }
}

function parseBrandFromParams(params) {
  return String(
    params.get("brand") ||
      params.get("brand_key") ||
      params.get("brandKey") ||
      params.get("brand_id") ||
      ""
  ).trim();
}

function parseRunIdFromParams(params) {
  return String(params.get("run_id") || params.get("runId") || "").trim();
}

function normalizeBrandFilterValue(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === ADD_NEW_PROJECT_OPTION_VALUE) {
    return "";
  }

  let normalized = raw;
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    normalized = raw;
  }
  normalized = normalized.replace(/\(\d+\)\s*$/, "").trim();

  if (/^https?:\/\//i.test(normalized)) {
    try {
      normalized = new URL(normalized).hostname;
    } catch {
      normalized = normalized.replace(/^https?:\/\//i, "");
    }
  }

  normalized = normalized
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .trim();

  return sanitizeBrandKey(normalized);
}

function normalizeBrandQueryValue(value) {
  const normalized = normalizeBrandFilterValue(value);
  if (!normalized) {
    return "";
  }
  if (!normalized.includes(".")) {
    return normalized;
  }
  const rootToken = sanitizeBrandKey(pickBrandRootLabel(normalized));
  return rootToken || normalized;
}

function normalizeThemeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === THEME_MODES.LIGHT || normalized === THEME_MODES.DARK || normalized === THEME_MODES.SYSTEM) {
    return normalized;
  }
  return THEME_MODES.SYSTEM;
}

function persistThemeMode(mode) {
  try {
    localStorage.setItem(STORAGE_THEME_MODE_KEY, normalizeThemeMode(mode));
  } catch {
    return;
  }
}

function readStoredThemeMode() {
  try {
    return normalizeThemeMode(localStorage.getItem(STORAGE_THEME_MODE_KEY));
  } catch {
    return THEME_MODES.SYSTEM;
  }
}

function detachSystemThemeListener() {
  if (!systemThemeMediaQuery || !systemThemeListener) {
    return;
  }
  if (typeof systemThemeMediaQuery.removeEventListener === "function") {
    systemThemeMediaQuery.removeEventListener("change", systemThemeListener);
  } else if (typeof systemThemeMediaQuery.removeListener === "function") {
    systemThemeMediaQuery.removeListener(systemThemeListener);
  }
  systemThemeListener = null;
}

function applyThemeMode(mode) {
  const root = document.documentElement;
  if (!root) {
    return THEME_MODES.SYSTEM;
  }
  const normalized = normalizeThemeMode(mode);
  root.setAttribute("data-theme-mode", normalized);
  detachSystemThemeListener();
  if (normalized === THEME_MODES.SYSTEM) {
    if (typeof window.matchMedia === "function") {
      systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      const syncWithSystem = () => {
        root.setAttribute("data-theme", systemThemeMediaQuery.matches ? THEME_MODES.LIGHT : THEME_MODES.DARK);
      };
      syncWithSystem();
      systemThemeListener = () => {
        syncWithSystem();
      };
      if (typeof systemThemeMediaQuery.addEventListener === "function") {
        systemThemeMediaQuery.addEventListener("change", systemThemeListener);
      } else if (typeof systemThemeMediaQuery.addListener === "function") {
        systemThemeMediaQuery.addListener(systemThemeListener);
      }
    } else {
      root.setAttribute("data-theme", THEME_MODES.DARK);
    }
    return normalized;
  }

  root.setAttribute("data-theme", normalized);
  return normalized;
}

function initializeThemeModeSwitcher() {
  const mode = readStoredThemeMode();
  applyThemeMode(mode);
  const control = elements.themeModeSwitcher;
  if (!control) {
    return;
  }

  const syncThemeControl = (selectedMode) => {
    if (control.tagName === "SELECT") {
      control.value = selectedMode;
      return;
    }
    const buttons = Array.from(control.querySelectorAll("[data-theme-mode]"));
    for (const button of buttons) {
      const buttonMode = normalizeThemeMode(button.getAttribute("data-theme-mode"));
      const isActive = buttonMode === selectedMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  };

  syncThemeControl(mode);
  if (control.dataset.bound === "1") {
    return;
  }
  control.dataset.bound = "1";

  const onModeChange = (nextRawMode) => {
    const nextMode = normalizeThemeMode(nextRawMode || THEME_MODES.SYSTEM);
    persistThemeMode(nextMode);
    applyThemeMode(nextMode);
    syncThemeControl(nextMode);
  };

  if (control.tagName === "SELECT") {
    control.addEventListener("change", () => {
      onModeChange(control.value || THEME_MODES.SYSTEM);
    });
    return;
  }

  control.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-theme-mode]") : null;
    if (!target) {
      return;
    }
    onModeChange(target.getAttribute("data-theme-mode"));
  });
}

function parsePersonaFromParams(params) {
  return String(
    params.get("persona") ||
      params.get("persona_name") ||
      params.get("personality") ||
      ""
  ).trim();
}

function isReportViewMode() {
  return state.appViewMode === APP_VIEW_MODES.REPORT;
}

function isLiveViewMode() {
  return state.appViewMode === APP_VIEW_MODES.LIVE;
}

function getStoredBrand() {
  try {
    return String(localStorage.getItem(STORAGE_ACTIVE_BRAND_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setStoredBrand(brand) {
  try {
    const value = String(brand || "").trim();
    if (!value) {
      localStorage.removeItem(STORAGE_ACTIVE_BRAND_KEY);
      return;
    }
    localStorage.setItem(STORAGE_ACTIVE_BRAND_KEY, value);
  } catch {
    return;
  }
}

function getStoredPersona() {
  try {
    return String(localStorage.getItem(STORAGE_ACTIVE_PERSONA_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setStoredPersona(persona) {
  try {
    const value = String(persona || "").trim();
    if (!value) {
      localStorage.removeItem(STORAGE_ACTIVE_PERSONA_KEY);
      return;
    }
    localStorage.setItem(STORAGE_ACTIVE_PERSONA_KEY, value);
  } catch {
    return;
  }
}

function applyUrlFiltersToState() {
  const params = new URLSearchParams(window.location.search);
  state.appViewMode = parseAppViewMode(params);
  state.filters.brand = normalizeBrandFilterValue(parseBrandFromParams(params) || getStoredBrand());
  state.filters.persona = getStoredPersona();
  state.filters.target = String(params.get("target") || "").trim();
  state.filters.status = String(params.get("status") || "").trim();
  state.filters.q = String(params.get("q") || "").trim();
  state.filters.env = String(params.get("env") || state.filters.env || "production").trim().toLowerCase() || "production";
  state.requestedRunId = parseRunIdFromParams(params);
  if (state.requestedRunId) {
    state.selectedRunId = state.requestedRunId;
  }
}

function syncInputsFromState() {
  dashboardProjects.syncProjectFilterInput({
    selectElement: elements.brandFilter,
    selectedBrand: state.filters.brand,
    brandOptions: state.brandOptions,
    addNewProjectValue: ADD_NEW_PROJECT_OPTION_VALUE,
    normalizeBrandKey: normalizeBrandFilterValue,
    getProjectOptionLabel: getBrandOptionLabel,
    escapeHtml
  });
  elements.targetFilter.value = state.filters.target;
  elements.statusFilter.value = state.filters.status;
  elements.searchFilter.value = state.filters.q;
  if (elements.environmentSwitcher) {
    const desired = String(state.filters.env || "production").trim().toLowerCase();
    const hasValue = Array.from(elements.environmentSwitcher.options || []).some((option) => option.value === desired);
    elements.environmentSwitcher.value = hasValue ? desired : "production";
  }
}

function syncUrlFromState() {
  const params = new URLSearchParams();
  params.set("view", state.appViewMode || APP_VIEW_MODES.DASHBOARD);
  if (state.filters.brand) params.set("brand", state.filters.brand);
  if (state.filters.target) params.set("target", state.filters.target);
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.env) params.set("env", state.filters.env);
  if (state.selectedRunId) params.set("run_id", state.selectedRunId);
  const dashboardHash = document.getElementById("qa-dashboard") ? "#qa-dashboard" : "";

  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${dashboardHash}`;
  window.history.replaceState({}, "", next);
}

function buildReportShareUrl(runId, row = {}) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("view", APP_VIEW_MODES.REPORT);
  params.set("run_id", safeRunId);
  const brand = normalizeBrandFilterValue(row?.brand_key);
  if (brand) {
    params.set("brand", brand);
  }

  return `${window.location.origin}/dashboard?${params.toString()}`;
}

function buildDashboardRunUrl(runId, row = {}) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("view", APP_VIEW_MODES.DASHBOARD);
  params.set("run_id", safeRunId);
  const brand = normalizeBrandFilterValue(row?.brand_key || state.filters.brand);
  if (brand) {
    params.set("brand", brand);
  }
  const env = normalizeEnvironment(row?.environment || row?.env || state.filters.env || "production");
  if (env) {
    params.set("env", env);
  }
  const dashboardHash = document.getElementById("qa-dashboard") ? "#qa-dashboard" : "";
  return `${window.location.pathname}?${params.toString()}${dashboardHash}`;
}

async function copyTextToClipboard(value) {
  const text = String(value || "");
  if (!text) {
    return false;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy copy mechanism.
    }
  }

  try {
    const probe = document.createElement("textarea");
    probe.value = text;
    probe.setAttribute("readonly", "true");
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    document.body.appendChild(probe);
    probe.focus();
    probe.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(probe);
    return Boolean(copied);
  } catch {
    return false;
  }
}

function renderLlmLogo(model) {
  const target = String(model || "").trim().toLowerCase();
  if (target === "claude") {
    return '<span class="llm-logo llm-logo-claude" aria-hidden="true">✦</span>';
  }
  return '<span class="llm-logo llm-logo-codex" aria-hidden="true">◎</span>';
}

function renderLlmCopyButtons(scope, options = {}) {
  const safeScope = String(scope || "").trim().toLowerCase();
  const findingIndex = Number(options.findingIndex);
  const indexAttr = Number.isInteger(findingIndex) && findingIndex >= 0 ? ` data-llm-finding-index="${findingIndex}"` : "";
  const actionLabel = safeScope === "final" ? "Copy Final Fix" : "Copy Fix";
  return `
    <div class="llm-copy-actions">
      <button type="button" class="llm-copy-button claude" data-llm-scope="${escapeHtml(safeScope)}" data-llm-target="claude"${indexAttr}>
        ${renderLlmLogo("claude")}
        <span>${escapeHtml(actionLabel)} for Claude</span>
      </button>
      <button type="button" class="llm-copy-button codex" data-llm-scope="${escapeHtml(safeScope)}" data-llm-target="codex"${indexAttr}>
        ${renderLlmLogo("codex")}
        <span>${escapeHtml(actionLabel)} for GPT Codex</span>
      </button>
    </div>
  `;
}

function tokenizeRecommendationText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function deriveFindingRecommendation(report, finding, findingIndex = 0) {
  const fixHint = redactVendorText(String(finding?.fix_hint || "").trim());
  if (fixHint) {
    return fixHint;
  }

  const recommendations = Array.isArray(report?.recommendations)
    ? report.recommendations.map((item) => redactVendorText(item)).filter(Boolean)
    : [];
  if (!recommendations.length) {
    return "No concrete recommendation was captured for this issue yet.";
  }

  const type = String(finding?.type || "").trim().toLowerCase();
  const titleTokens = tokenizeRecommendationText(`${finding?.title || ""} ${finding?.observed_behavior || ""}`);
  const typeKeywords = {
    frustration_point: ["friction", "blocking", "path", "onboarding", "flow", "intercept", "modal", "navigation"],
    confusion_point: ["clarity", "guidance", "messaging", "otp", "label", "copy", "understand"],
    dead_end: ["blocking", "path", "fallback", "navigation", "submit", "complete"],
    bug: ["error", "script", "state", "event", "network", "logic", "retry"],
    performance_issue: ["performance", "delay", "load", "latency"],
    accessibility_issue: ["a11y", "accessibility", "contrast", "keyboard", "screen", "reader"],
    copy_issue: ["copy", "label", "message", "messaging", "text"]
  };

  let bestMatch = "";
  let bestScore = -1;
  for (let index = 0; index < recommendations.length; index += 1) {
    const candidate = recommendations[index];
    const candidateTokens = tokenizeRecommendationText(candidate);
    let score = 0;
    for (const token of titleTokens) {
      if (candidateTokens.includes(token)) {
        score += 2;
      }
    }
    for (const keyword of typeKeywords[type] || []) {
      if (candidateTokens.includes(keyword)) {
        score += 3;
      }
    }
    if (index === findingIndex) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch || recommendations[Math.min(Math.max(0, findingIndex), recommendations.length - 1)] || recommendations[0];
}

function getFindingTypeVisual(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "frustration_point") return { icon: "!", label: "Frustration point", toneClass: "finding-type-frustration" };
  if (type === "confusion_point") return { icon: "?", label: "Confusion point", toneClass: "finding-type-confusion" };
  if (type === "dead_end") return { icon: "×", label: "Dead end", toneClass: "finding-type-dead-end" };
  if (type === "bug") return { icon: "⚠", label: "Bug", toneClass: "finding-type-bug" };
  if (type === "performance_issue") return { icon: "↯", label: "Performance", toneClass: "finding-type-performance" };
  if (type === "accessibility_issue") return { icon: "♿", label: "Accessibility", toneClass: "finding-type-accessibility" };
  if (type === "copy_issue") return { icon: "Aa", label: "Copy", toneClass: "finding-type-copy" };
  return { icon: "•", label: formatFindingTypeLabel(type), toneClass: "finding-type-generic" };
}

function resolveActiveReportContext() {
  return dashboardReportRuntime.resolveActiveReportContext(
    getReportRuntimeContext(),
    getReportRuntimeHelpers()
  );
}

function buildFindingLlmPrompt(report, row, finding, findingIndex, targetModel) {
  const modelName = String(targetModel || "").trim().toLowerCase() === "claude" ? "Claude" : "GPT Codex";
  const safeReport = report && typeof report === "object" ? report : {};
  const safeRow = row && typeof row === "object" ? row : {};
  const safeFinding = finding && typeof finding === "object" ? finding : {};
  const recommendation = deriveFindingRecommendation(safeReport, safeFinding, findingIndex);
  const screenshots = Array.isArray(safeFinding?.evidence?.screenshots) ? safeFinding.evidence.screenshots.length : 0;
  const videos = Array.isArray(safeFinding?.evidence?.videos) ? safeFinding.evidence.videos.length : 0;
  const shareUrl = buildReportShareUrl(safeReport?.run_id || safeRow?.run_id, safeRow);
  const findingType = formatFindingTypeLabel(safeFinding.type);
  const priority = computeFindingPriorityScore(safeFinding);
  const title = String(safeFinding.title || safeFinding.id || `Finding ${findingIndex + 1}`).trim();

  return [
    `You are ${modelName}. Generate an implementation-ready fix for the issue below.`,
    "",
    "Context",
    `- Product: ${safeReport.target || safeRow.target || "Unknown target"}`,
    `- Run ID: ${safeReport.run_id || safeRow.run_id || "unknown"}`,
    `- Environment: ${getEnvironmentLabel(getActiveEnvironment())}`,
    shareUrl ? `- Report URL: ${shareUrl}` : "- Report URL: unavailable",
    "",
    "Issue",
    `- Title: ${title}`,
    `- Type: ${findingType}`,
    `- Severity: ${String(safeFinding.severity || "medium").toLowerCase()}`,
    `- Priority: ${priority}/100`,
    `- Confidence: ${safeFinding.confidence ?? "n/a"}`,
    `- Emotion: ${safeFinding?.emotional_reaction?.primary || "n/a"} (${safeFinding?.emotional_reaction?.intensity ?? "n/a"}/5)`,
    `- Expected behavior: ${safeFinding.expected_behavior || "n/a"}`,
    `- Observed behavior: ${redactVendorText(safeFinding.observed_behavior || "n/a")}`,
    `- Recommendation: ${recommendation || "n/a"}`,
    `- Supporting fix hint: ${redactVendorText(safeFinding.fix_hint || "n/a")}`,
    "",
    "Evidence",
    `- Screenshots attached: ${screenshots}`,
    `- Videos attached: ${videos}`,
    "",
    "Output requirements",
    "1. Root cause hypothesis tied to the observed behavior.",
    "2. Exact code-level patch plan with files/components to update.",
    "3. Final code changes (or pseudo-diff) for the fix.",
    "4. Regression tests to add.",
    "5. Validation checklist and manual QA steps."
  ].join("\n");
}

function buildFinalFixLlmPrompt(report, row, targetModel) {
  const modelName = String(targetModel || "").trim().toLowerCase() === "claude" ? "Claude" : "GPT Codex";
  const safeReport = report && typeof report === "object" ? report : {};
  const safeRow = row && typeof row === "object" ? row : {};
  const findings = sortFindingsByPriority(Array.isArray(safeReport.findings) ? safeReport.findings : []).slice(0, 6);
  const recommendations = Array.isArray(safeReport.recommendations) ? safeReport.recommendations.map((item) => redactVendorText(item)) : [];
  const shareUrl = buildReportShareUrl(safeReport?.run_id || safeRow?.run_id, safeRow);

  return [
    `You are ${modelName}. Produce a complete remediation plan for this QA report.`,
    "",
    "Context",
    `- Product: ${safeReport.target || safeRow.target || "Unknown target"}`,
    `- Run ID: ${safeReport.run_id || safeRow.run_id || "unknown"}`,
    `- Environment: ${getEnvironmentLabel(getActiveEnvironment())}`,
    shareUrl ? `- Report URL: ${shareUrl}` : "- Report URL: unavailable",
    "",
    "Top findings",
    ...(findings.length
      ? findings.map((finding, index) => {
          const priority = computeFindingPriorityScore(finding);
          return `${index + 1}. ${finding.title || finding.id || "Untitled finding"} | ${String(finding.severity || "medium").toUpperCase()} | Priority ${priority}/100 | Confidence ${finding.confidence ?? "n/a"} | Fix hint: ${redactVendorText(finding.fix_hint || "n/a")}`;
        })
      : ["1. No findings were captured."]),
    "",
    "Recommendations from QA report",
    ...(recommendations.length ? recommendations.map((item, index) => `${index + 1}. ${item}`) : ["1. No recommendations were captured."]),
    "",
    "Output requirements",
    "1. Prioritized fix order (P0/P1/P2).",
    "2. Concrete implementation plan per issue.",
    "3. Suggested pull-request breakdown.",
    "4. Test plan (unit/integration/e2e).",
    "5. Rollout + monitoring plan after deployment."
  ].join("\n");
}

function attachLlmCopyButtons(root = null) {
  const host = root || document;
  const buttons = Array.from(host.querySelectorAll("[data-llm-target][data-llm-scope]"));
  for (const button of buttons) {
    if (button.dataset.bound === "1") {
      continue;
    }
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const scope = String(button.getAttribute("data-llm-scope") || "").trim().toLowerCase();
      const targetModel = String(button.getAttribute("data-llm-target") || "codex").trim().toLowerCase();
      const baselineLabel = String(button.dataset.label || button.textContent || "Copy for LLM").trim();
      if (!button.dataset.label) {
        button.dataset.label = baselineLabel;
      }

      const context = resolveActiveReportContext();
      const report = context.report;
      const row = context.row;
      if (!report || typeof report !== "object") {
        button.textContent = "Unavailable";
        button.disabled = true;
        window.setTimeout(() => {
          button.textContent = baselineLabel;
          button.disabled = false;
        }, 1200);
        return;
      }

      let promptText = "";
      if (scope === "finding") {
        const findingIndex = Number(button.getAttribute("data-llm-finding-index"));
        const sortedFindings = sortFindingsByPriority(Array.isArray(report.findings) ? report.findings : []);
        const finding = Number.isInteger(findingIndex) && findingIndex >= 0 ? sortedFindings[findingIndex] : null;
        if (!finding) {
          button.textContent = "Unavailable";
          button.disabled = true;
          window.setTimeout(() => {
            button.textContent = baselineLabel;
            button.disabled = false;
          }, 1200);
          return;
        }
        promptText = buildFindingLlmPrompt(report, row, finding, findingIndex, targetModel);
      } else {
        promptText = buildFinalFixLlmPrompt(report, row, targetModel);
      }

      button.textContent = "Copying…";
      button.disabled = true;
      const copied = await copyTextToClipboard(promptText);
      button.textContent = copied ? "Copied" : "Copy failed";
      window.setTimeout(() => {
        button.textContent = baselineLabel;
        button.disabled = false;
      }, 1200);
    });
  }
}

function readFiltersFromInputs() {
  state.filters.brand = normalizeBrandFilterValue(elements.brandFilter.value);
  state.filters.target = String(elements.targetFilter.value || "").trim();
  state.filters.status = String(elements.statusFilter.value || "").trim();
  state.filters.q = String(elements.searchFilter.value || "").trim();
  state.filters.env = normalizeEnvironment(elements.environmentSwitcher?.value || state.filters.env || "production");
  setStoredBrand(state.filters.brand);
}

function buildReportParams(options = {}) {
  const includeBrand = options.includeBrand !== false;
  const params = new URLSearchParams();

  const brandFilter = includeBrand ? normalizeBrandQueryValue(state.filters.brand) : "";
  if (brandFilter) params.set("brand", brandFilter);
  if (state.filters.target) params.set("target", state.filters.target);
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.q) params.set("q", state.filters.q);
  params.set("limit", String(options.limit || 100));
  params.set("offset", String(options.offset || 0));

  return params;
}

function normalizeSavedProject(project) {
  return dashboardProjects.normalizeSavedProject(project, {
    normalizeBrandKey: normalizeBrandFilterValue
  });
}

function buildProjectOptions(savedProjects) {
  return dashboardProjects.buildProjectOptions(savedProjects, {
    normalizeProject: normalizeSavedProject
  });
}

function getBrandOptionBaseLabel(optionOrKey) {
  return dashboardProjects.getProjectOptionBaseLabel(optionOrKey, {
    findProjectOption: findBrandOption,
    toDisplayProjectName
  });
}

function rebuildProjectOptions() {
  state.brandOptions = buildProjectOptions(state.savedProjects);
}

function findBrandOption(brandKey) {
  const safeKey = normalizeBrandFilterValue(brandKey);
  if (!safeKey) {
    return null;
  }
  return state.brandOptions.find((option) => option.key === safeKey) || null;
}

function getBrandOptionLabel(optionOrKey) {
  return dashboardProjects.getProjectOptionLabel(optionOrKey, {
    brandOptions: state.brandOptions,
    findProjectOption: findBrandOption,
    toDisplayProjectName
  });
}

function toDisplayProjectName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const normalized = raw.replace(/\/+$/, "");
  try {
    const candidate = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    const parsed = new URL(candidate);
    return String(parsed.hostname || normalized).trim() || normalized;
  } catch {
    return normalized.replace(/^https?:\/\//i, "");
  }
}

function extractRunPersona(row) {
  const candidates = [row?.persona, row?.brand_persona, row?.personality, row?.bot_personality];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim().replace(/\s+/g, " ");
    if (value) {
      return value;
    }
  }
  return "";
}

function applyPersonaFilter(items) {
  const allItems = Array.isArray(items) ? items : [];
  const personaFilter = String(state.filters.persona || "").trim().toLowerCase();
  if (!personaFilter) {
    return allItems;
  }

  const filtered = allItems.filter((row) =>
    extractRunPersona(row).toLowerCase().includes(personaFilter)
  );
  const pinnedRunId = String(state.selectedRunId || state.requestedRunId || "").trim();
  if (!pinnedRunId || filtered.some((row) => row?.run_id === pinnedRunId)) {
    return filtered;
  }

  const pinnedRow = allItems.find((row) => String(row?.run_id || "") === pinnedRunId);
  if (!pinnedRow) {
    return filtered;
  }

  return [pinnedRow, ...filtered];
}

function reconcilePersonaFilterWithAvailableOptions() {
  const personaFilter = String(state.filters.persona || "").trim();
  if (!personaFilter) {
    return false;
  }
  const normalized = personaFilter.toLowerCase();
  const isKnownPersona = state.personaOptions.some((option) => String(option?.name || "").trim().toLowerCase() === normalized);
  if (isKnownPersona) {
    return false;
  }
  state.filters.persona = "";
  setStoredPersona("");
  return true;
}

function isDashboardAuthorized() {
  if (!requiresDashboardAuth) {
    return true;
  }
  if (!window.SwarmAuth || typeof window.SwarmAuth.isAuthorized !== "function") {
    return false;
  }
  return Boolean(window.SwarmAuth.isAuthorized());
}

function isDashboardAuthReady() {
  if (!requiresDashboardAuth) {
    return true;
  }
  if (!window.SwarmAuth || typeof window.SwarmAuth.isSessionChecked !== "function") {
    return false;
  }
  return Boolean(window.SwarmAuth.isSessionChecked());
}

async function waitForDashboardAuthReady() {
  if (!requiresDashboardAuth || isDashboardAuthReady()) {
    return;
  }
  if (window.SwarmAuth && typeof window.SwarmAuth.whenReady === "function") {
    await window.SwarmAuth.whenReady();
    return;
  }
  if (window.SwarmAuth && typeof window.SwarmAuth.refreshSession === "function") {
    await window.SwarmAuth.refreshSession().catch(() => null);
  }
}

function renderAuthRequiredState() {
  const message = "Sign in required to access dashboard reports.";
  if (elements.reportsItems) {
    elements.reportsItems.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
  if (elements.reportDetail) {
    elements.reportDetail.innerHTML = `<div class="empty-detail"><h2>Authentication required</h2><p>${escapeHtml(
      message
    )}</p></div>`;
  }
  if (elements.appReportOnlyPanel) {
    elements.appReportOnlyPanel.innerHTML = `<div class="empty-detail"><h2>Authentication required</h2><p>${escapeHtml(
      message
    )}</p></div>`;
  }
  if (hasAppDashboardUi) {
    if (elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(message)}</p></div>`;
    }
    if (elements.testProgressItems) {
      elements.testProgressItems.innerHTML = '<div class="app-empty"><p>Sign in to load progress.</p></div>';
    }
    if (elements.appEvidencePanel) {
      elements.appEvidencePanel.innerHTML = '<div class="app-empty"><p>Sign in to load evidence.</p></div>';
    }
    if (elements.topFixesItems) {
      elements.topFixesItems.innerHTML = '<div class="app-empty"><p>Sign in to load findings.</p></div>';
    }
    if (elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = '<div class="app-empty"><p>Sign in to load persona signals.</p></div>';
    }
    if (elements.personaSignalsMeta) {
      elements.personaSignalsMeta.textContent = "Auth required";
    }
    if (elements.regressionSignalsItems) {
      elements.regressionSignalsItems.innerHTML = '<div class="app-empty"><p>Sign in to compare runs.</p></div>';
    }
    if (elements.recentRunsRows) {
      elements.recentRunsRows.innerHTML = '<tr><td colspan="7"><div class="app-empty"><p>Sign in to load runs.</p></div></td></tr>';
    }
    if (elements.liveActivityItems) {
      elements.liveActivityItems.innerHTML = '<div class="app-empty"><p>Sign in to load live activity.</p></div>';
    }
    if (elements.liveStreamPanel) {
      elements.liveStreamPanel.innerHTML = '<div class="app-empty"><p>Sign in to watch live stream.</p></div>';
    }
    if (elements.liveMissionSection) {
      elements.liveMissionSection.hidden = true;
      elements.liveMissionSection.setAttribute("aria-hidden", "true");
    }
    if (elements.dashboardStateBadge) {
      elements.dashboardStateBadge.className = "issue-severity severity-low";
      elements.dashboardStateBadge.textContent = "Auth Required";
    }
    if (elements.dashboardStateMessage) {
      elements.dashboardStateMessage.textContent = message;
    }
    if (elements.healthHeroTitle) {
      elements.healthHeroTitle.textContent = `${getEnvironmentLabel(getActiveEnvironment())} Health`;
    }
  }

  setOnboardingMessage("", "");
}

function applyAppViewMode() {
  const reportMode = isReportViewMode();
  const liveMode = isLiveViewMode() && !reportMode;
  document.body.classList.toggle("report-view-mode", reportMode);
  document.body.classList.toggle("live-view-mode", liveMode);

  if (elements.appReportOnlyPanel) {
    elements.appReportOnlyPanel.hidden = !reportMode;
    elements.appReportOnlyPanel.setAttribute("aria-hidden", reportMode ? "false" : "true");
  }
}

function getRunCollectionContext(extra = {}) {
  return {
    optimisticRuns: state.optimisticRuns,
    allRuns: state.allRuns,
    runs: state.runs,
    selectedRunId: state.selectedRunId,
    requestedRunId: state.requestedRunId,
    ...extra
  };
}

function getRunCollectionHelpers(extra = {}) {
  return {
    extractRunPersona,
    getLiveStatus,
    normalizeRunStatus,
    isQueueActiveStatus,
    ...extra
  };
}

function getReportRuntimeContext(extra = {}) {
  return {
    liveStatusCache: state.liveStatusCache,
    reportCache: state.reportCache,
    activeRenderedReport: state.activeRenderedReport,
    activeRenderedRow: state.activeRenderedRow,
    selectedRunId: state.selectedRunId,
    runs: state.runs,
    allRuns: state.allRuns,
    ...extra
  };
}

function getReportRuntimeHelpers(extra = {}) {
  return {
    getPinnedRunRow,
    isQueueActiveStatus,
    fetchRunStatus,
    fetchReport,
    buildLiveFallbackReport,
    ...extra
  };
}

function buildPersonaOptions(items) {
  return dashboardRuns.buildPersonaOptions(items, {
    extractRunPersona
  });
}

function getCurrentAuthUserIdentity() {
  const user = window.SwarmAuth && typeof window.SwarmAuth.getUser === "function" ? window.SwarmAuth.getUser() : null;
  const id = String(user?.id || user?.email || "anonymous").trim().toLowerCase();
  return id || "anonymous";
}

function getOnboardingStorageKey() {
  return `${STORAGE_ONBOARDING_COMPLETED_KEY_PREFIX}:${getCurrentAuthUserIdentity()}`;
}

function getStoredOnboardingCompleted() {
  try {
    return String(localStorage.getItem(getOnboardingStorageKey()) || "").trim() === "1";
  } catch {
    return false;
  }
}

function setStoredOnboardingCompleted(completed) {
  try {
    if (completed) {
      localStorage.setItem(getOnboardingStorageKey(), "1");
    } else {
      localStorage.removeItem(getOnboardingStorageKey());
    }
  } catch {
    return;
  }
}

function ensureOnboardingStateInitialized() {
  if (state.onboarding.initialized) {
    return;
  }
  const authUser = window.SwarmAuth && typeof window.SwarmAuth.getUser === "function" ? window.SwarmAuth.getUser() : null;
  const remoteSeen = Boolean(authUser?.onboarding_seen);
  const localSeen = getStoredOnboardingCompleted();
  state.onboarding.completed = remoteSeen || localSeen;
  if (state.onboarding.completed && !localSeen) {
    setStoredOnboardingCompleted(true);
  }
  // Defer auto-open decisions until run history is loaded.
  state.onboarding.forceOpen = false;
  state.onboarding.manualOverride = false;
  state.onboarding.step = 1;
  state.onboarding.initialized = true;
}

function reconcileOnboardingStateWithRuns() {
  const hasExistingRuns =
    state.onboarding.hasAnyRuns === true || (Array.isArray(state.allRuns) && state.allRuns.length > 0);
  if (!hasExistingRuns) {
    return { hasExistingRuns: false, promotedCompleted: false };
  }
  let promotedCompleted = false;
  if (!state.onboarding.completed) {
    state.onboarding.completed = true;
    setStoredOnboardingCompleted(true);
    promotedCompleted = true;
  }
  if (state.onboarding.forceOpen) {
    state.onboarding.forceOpen = false;
  }
  state.onboarding.manualOverride = false;
  return { hasExistingRuns: true, promotedCompleted };
}

async function persistOnboardingSeen() {
  if (!isDashboardAuthorized()) {
    return false;
  }
  if (state.onboarding.syncInFlight) {
    return state.onboarding.syncInFlight;
  }

  state.onboarding.completed = true;
  setStoredOnboardingCompleted(true);

  const authUser = window.SwarmAuth && typeof window.SwarmAuth.getUser === "function" ? window.SwarmAuth.getUser() : null;
  if (authUser && authUser.onboarding_seen === true) {
    return true;
  }

  state.onboarding.syncInFlight = (async () => {
    try {
      const response = await fetch("/api/auth/onboarding-seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({ seen: true })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) {
        const nextUser = data.user && typeof data.user === "object" ? data.user : null;
        if (nextUser && authUser && typeof authUser === "object") {
          authUser.onboarding_seen = Boolean(nextUser.onboarding_seen);
        } else if (authUser && typeof authUser === "object") {
          authUser.onboarding_seen = true;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      state.onboarding.syncInFlight = null;
    }
  })();

  return state.onboarding.syncInFlight;
}

function shouldAutoOpenOnboarding() {
  if (state.onboarding.completed) {
    return false;
  }
  if (isLiveViewMode() || isReportViewMode()) {
    return false;
  }
  const hasRequestedRun = Boolean(String(state.requestedRunId || state.selectedRunId || "").trim());
  if (hasRequestedRun) {
    return false;
  }
  const hasExistingRuns =
    state.onboarding.hasAnyRuns === true || (Array.isArray(state.allRuns) && state.allRuns.length > 0);
  return !hasExistingRuns;
}

function setOnboardingMessage(message, status = "") {
  if (!elements.onboardingMessage) {
    return;
  }
  elements.onboardingMessage.textContent = String(message || "");
  elements.onboardingMessage.dataset.state = status || "";
}

function setOnboardingSubmitting(pending) {
  if (!elements.onboardingSubmitButton) {
    return;
  }
  if (!elements.onboardingSubmitButton.dataset.defaultLabel) {
    elements.onboardingSubmitButton.dataset.defaultLabel = elements.onboardingSubmitButton.textContent || "";
  }
  elements.onboardingSubmitButton.disabled = Boolean(pending);
  elements.onboardingSubmitButton.textContent = pending
    ? "Launching..."
    : elements.onboardingSubmitButton.dataset.defaultLabel;
  if (elements.onboardingPrevButton) {
    elements.onboardingPrevButton.disabled = Boolean(pending);
  }
  if (elements.onboardingNextButton) {
    elements.onboardingNextButton.disabled = Boolean(pending);
  }
}

function setOnboardingSubmitLabel(label) {
  if (!elements.onboardingSubmitButton) {
    return;
  }
  elements.onboardingSubmitButton.dataset.defaultLabel = String(label || "Launch Mission");
  elements.onboardingSubmitButton.textContent = elements.onboardingSubmitButton.dataset.defaultLabel;
}

function setDashboardStateMessage(message) {
  if (!elements.dashboardStateMessage) {
    return;
  }
  elements.dashboardStateMessage.textContent = String(message || "");
}

function focusOnboardingActiveControl() {
  window.setTimeout(() => {
    const step = clampOnboardingStep(state.onboarding.step || 1);
    if (step === 1) {
      elements.onboardingTargetUrl?.focus();
      return;
    }
    if (step === 2) {
      elements.onboardingPersonaCustom?.focus();
      return;
    }
    if (step === 3) {
      elements.onboardingScenariosCustom?.focus();
      return;
    }
    if (step === ONBOARDING_MAX_STEP) {
      elements.onboardingSubmitButton?.focus();
      return;
    }
    elements.onboardingNextButton?.focus();
  }, 80);
}

function getUserMissionScenariosFromValue(value) {
  return normalizeScenarioListInput(value).filter((item) => item !== DEFAULT_ONBOARDING_SCENARIO);
}

function prefillOnboardingFromConfig(config = {}) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const targetUrl = normalizeOnboardingTargetUrlInput(String(safeConfig.targetUrl || ""), { writeBack: false });
  const brandKey = sanitizeBrandKey(String(safeConfig.brandKey || inferBrandKeyFromTargetUrl(targetUrl) || ""));
  const shouldPrefillPersona = safeConfig.prefillPersona !== false;
  const persona = shouldPrefillPersona
    ? String(safeConfig.persona || DEFAULT_DASHBOARD_PERSONA).trim().slice(0, 500) || DEFAULT_DASHBOARD_PERSONA
    : "";
  const scopeMode = normalizeScopeModeInput(safeConfig.scopeMode || "deep_45m");
  const scenarios = getUserMissionScenariosFromValue(safeConfig.scenarios);

  if (elements.onboardingTargetUrl) {
    elements.onboardingTargetUrl.value = targetUrl ? formatOnboardingTargetInputValue(targetUrl) : "";
  }
  if (elements.onboardingBrandKey) {
    elements.onboardingBrandKey.value = brandKey;
  }
  if (elements.onboardingPersonaCustom) {
    elements.onboardingPersonaCustom.value = persona;
  }
  if (elements.onboardingScenariosCustom) {
    elements.onboardingScenariosCustom.value = "";
  }

  const personaButtons = elements.onboardingPersonaChoices
    ? Array.from(elements.onboardingPersonaChoices.querySelectorAll(".onboarding-choice"))
    : [];
  for (const button of personaButtons) {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  }

  const intensityButtons = elements.onboardingIntensityChoices
    ? Array.from(elements.onboardingIntensityChoices.querySelectorAll(".onboarding-intensity"))
    : [];
  let matchedIntensity = false;
  for (const button of intensityButtons) {
    const matches = String(button.getAttribute("data-scope-mode") || "").trim() === scopeMode;
    button.classList.toggle("active", matches);
    matchedIntensity = matchedIntensity || matches;
  }
  if (!matchedIntensity && intensityButtons[0]) {
    intensityButtons[0].classList.add("active");
  }

  const criticalInputs = elements.onboardingCriticalChoices
    ? Array.from(elements.onboardingCriticalChoices.querySelectorAll("input[type='checkbox']"))
    : [];
  const remainingScenarioSet = new Set(scenarios);
  for (const input of criticalInputs) {
    const scenarioValue = String(input.value || "").trim();
    const checked = remainingScenarioSet.has(scenarioValue);
    input.checked = checked;
    if (checked) {
      remainingScenarioSet.delete(scenarioValue);
    }
    const label = input.closest(".onboarding-toggle");
    if (label) {
      label.classList.toggle("active", checked);
    }
  }
  if (elements.onboardingScenariosCustom) {
    elements.onboardingScenariosCustom.value = Array.from(remainingScenarioSet).join("\n");
  }

  updateOnboardingScopeUi();
  syncOnboardingPersonaField();
  syncOnboardingScenariosField();
  maybePopulateBrandKeyFromTarget();
  refreshOnboardingPreview();
  refreshOnboardingLaunchSummary();
}

function buildDashboardRunPayload(config = {}, options = {}) {
  const targetUrl = normalizeOnboardingTargetUrlInput(String(config.targetUrl || ""), { writeBack: false });
  const brandKey = sanitizeBrandKey(String(config.brandKey || inferBrandKeyFromTargetUrl(targetUrl) || ""));
  const brandName =
    String(config.brandName || inferBrandNameFromTargetUrl(targetUrl) || toDisplayProjectName(brandKey) || "").trim() || null;
  const scopeMode = normalizeScopeModeInput(config.scopeMode);
  const scenarios = normalizeScenarioListInput(config.scenarios);
  const persona = String(config.persona || DEFAULT_DASHBOARD_PERSONA).trim().slice(0, 500) || DEFAULT_DASHBOARD_PERSONA;
  const goal = buildDashboardRunGoal({ ...config, targetUrl, brandName, scenarios, persona });
  const runId = buildDashboardRunId(brandKey);

  return {
    runId,
    payload: {
      run_id: runId,
      target_url: targetUrl,
      scope_mode: scopeMode,
      scenario_list: scenarios,
      brand_persona: persona,
      source: String(options.source || "dashboard_onboarding").trim() || "dashboard_onboarding",
      metadata: {
        brand_key: brandKey || null,
        brand_name: brandName,
        goal,
        launched_from: String(options.launchedFrom || options.source || "dashboard_onboarding").trim() || "dashboard_onboarding",
        retry_of_run_id: String(options.retryOfRunId || "").trim() || null
      }
    }
  };
}

async function queueDashboardRun(payload) {
  const response = await fetch("/api/qa/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Your session expired. Sign in again.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to launch swarm run");
  }
  return data;
}

function upsertRunCollection(collection, draftRow) {
  return dashboardRuns.upsertRunCollection(collection, draftRow);
}

function buildPinnedRunSnapshot(runId, candidate = null) {
  return dashboardRuns.buildPinnedRunSnapshot(runId, getRunCollectionContext({ candidate }), getRunCollectionHelpers());
}

function rememberPinnedRun(row) {
  return dashboardRuns.rememberPinnedRun(getRunCollectionContext({ row }), getRunCollectionHelpers());
}

function shouldKeepPinnedRun(runId, candidate = null) {
  return dashboardRuns.shouldKeepPinnedRun(runId, getRunCollectionContext({ candidate }), getRunCollectionHelpers());
}

function reconcilePinnedRunsWithFetched(items) {
  dashboardRuns.reconcilePinnedRunsWithFetched(
    getRunCollectionContext({ fetchedItems: items }),
    getRunCollectionHelpers()
  );
}

function mergePinnedRunsIntoCollection(collection) {
  return dashboardRuns.mergePinnedRunsIntoCollection(
    getRunCollectionContext({ collection }),
    getRunCollectionHelpers()
  );
}

function getPinnedRunRow(runId) {
  return dashboardRuns.getPinnedRunRow(getRunCollectionContext({ runId }), getRunCollectionHelpers());
}

function ensureSelectedRunVisibleInRuns() {
  const nextCollections = dashboardRuns.ensureSelectedRunVisibleInRuns(
    getRunCollectionContext(),
    getRunCollectionHelpers()
  );
  state.runs = nextCollections.runs;
  state.allRuns = nextCollections.allRuns;
}

function buildTargetLabelFromUrl(targetUrl) {
  const normalized = normalizeOnboardingTargetUrlInput(String(targetUrl || ""), { writeBack: false });
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).hostname;
  } catch {
    return String(targetUrl || "").trim();
  }
}

function buildDashboardRunGoal(config = {}) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const explicitGoal = String(safeConfig.goal || "").trim();
  if (explicitGoal) {
    return explicitGoal.slice(0, 1000);
  }

  const scenarios = normalizeScenarioListInput(safeConfig.scenarios);
  if (scenarios.length === 1) {
    return scenarios[0].slice(0, 1000);
  }
  if (scenarios.length > 1) {
    return `Complete these user goals in order: ${scenarios.join("; ")}`.slice(0, 1000);
  }

  const targetLabel =
    String(safeConfig.brandName || "").trim() ||
    buildTargetLabelFromUrl(safeConfig.targetUrl) ||
    "the product";
  return `Sign in, clear onboarding, and complete at least one meaningful in-product task inside ${targetLabel}.`.slice(
    0,
    1000
  );
}

function seedOptimisticRunState(runId, config = {}, queue = null) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return;
  }

  const safeConfig = config && typeof config === "object" ? config : {};
  const targetUrl = normalizeOnboardingTargetUrlInput(String(safeConfig.targetUrl || ""), { writeBack: false });
  const targetLabel = buildTargetLabelFromUrl(targetUrl);
  const deliveredAt = new Date().toISOString();
  const queueStatus = normalizeRunStatus(queue?.queue_status || queue?.status || "queued") || "queued";
  const brandKey = sanitizeBrandKey(String(safeConfig.brandKey || inferBrandKeyFromTargetUrl(targetUrl) || state.filters.brand || ""));
  const persona = String(safeConfig.persona || DEFAULT_DASHBOARD_PERSONA).trim().slice(0, 500) || DEFAULT_DASHBOARD_PERSONA;
  const scopeMode = normalizeScopeModeInput(safeConfig.scopeMode);
  const scenarioList = normalizeScenarioListInput(safeConfig.scenarios);
  const goal = buildDashboardRunGoal({
    goal: safeConfig.goal,
    targetUrl,
    brandName: safeConfig.brandName,
    scenarios: scenarioList
  });

  const draftRow = {
    run_id: safeRunId,
    brand_key: brandKey,
    brand_name: String(safeConfig.brandName || inferBrandNameFromTargetUrl(targetUrl) || "").trim() || null,
    owner_user_id: null,
    persona,
    goal,
    target_url: targetUrl,
    target: targetLabel,
    scope_mode: scopeMode,
    scenario_list: scenarioList,
    status: queueStatus,
    latest_report_status: queueStatus,
    queue_status: queueStatus,
    delivered_at: deliveredAt,
    source: "dashboard_retry",
    report_ready: false,
    summary_note: "Run queued and waiting for live updates.",
    risk_score: null,
    findings_count: 0,
    journeys_count: 0,
    recommendations_count: 0,
    counts: {}
  };

  rememberPinnedRun(draftRow);
  state.allRuns = mergePinnedRunsIntoCollection(upsertRunCollection(state.allRuns, draftRow));
  state.runs = mergePinnedRunsIntoCollection(upsertRunCollection(state.runs, draftRow));
  rebuildProjectOptions();
  state.personaOptions = buildPersonaOptions(state.allRuns);

  state.liveStatusCache.set(safeRunId, {
    ok: true,
    run_id: safeRunId,
    queue: {
      queue_status: queueStatus,
      status: queueStatus,
      enqueued_at: deliveredAt
    },
    report_ready: false,
    report_status: queueStatus,
    progress: {
      percent: 0,
      message: queueStatus === "processing" ? "QA worker picked up the run." : "Launching agents...",
      updated_at: deliveredAt
    },
    artifacts: {
      local_screenshots: []
    },
    run_log: [
      {
        event: queueStatus === "processing" ? "worker_started" : "queued",
        ts: deliveredAt,
        data: {
          target_url: targetUrl || null
        }
      }
    ],
    live_report: {
      status: queueStatus,
      target: targetLabel || targetUrl || "",
      summary: {
        note: queueStatus === "processing" ? "QA worker is exploring now." : "Run queued and waiting for worker pickup."
      },
      findings: [],
      tested_journeys: []
    }
  });
}

async function applyLaunchedRunState(runId, brandKey, config = {}, queue = null) {
  state.onboarding.completed = true;
  state.onboarding.forceOpen = false;
  state.onboarding.manualOverride = false;
  state.onboarding.hasAnyRuns = true;
  state.onboarding.step = 1;
  setStoredOnboardingCompleted(true);
  void persistOnboardingSeen();

  if (brandKey) {
    state.filters.brand = brandKey;
    setStoredBrand(brandKey);
  }
  state.selectedRunId = runId;
  state.requestedRunId = runId;
  state.appViewMode = APP_VIEW_MODES.LIVE;
  const savedProject = buildSavedProjectPayload({ ...config, brandKey }, { source: "dashboard_launch" });
  if (savedProject) {
    mergeSavedProjects([savedProject]);
  }
  seedOptimisticRunState(runId, { ...config, brandKey }, queue);
  syncInputsFromState();
  renderBrandSuggestions();
  syncProjectSwitcherVisibility();
  renderBrandSummary();
  renderBrandChips();
  renderRunsList();
  renderAppRunPicker();
  updateOnboardingVisibility();
  syncUrlFromState();
  applyAppViewMode();
  await renderSelectedReport();
  ensureLivePolling();
  if (savedProject) {
    void persistSavedProjects([savedProject]).catch(() => {
      // Optimistic project state keeps the switcher available if persistence is delayed.
    });
  }
  state.reportCache.clear();
  await loadAndRenderReports();
  openDashboardLiveView(runId);
}

async function launchDashboardRunFromConfig(config = {}, options = {}) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const built = buildDashboardRunPayload(safeConfig, options);
  if (!built.payload.target_url) {
    throw new Error("Target URL must be a valid site domain or URL.");
  }
  if (!built.payload.brand_persona) {
    throw new Error("Bot personality is required.");
  }
  if (built.payload.scope_mode === "feature_targeted" && !built.payload.scenario_list.length) {
    throw new Error("Add at least one scenario for feature-targeted scope.");
  }

  const queued = await queueDashboardRun(built.payload);
  await applyLaunchedRunState(built.runId, built.payload.metadata.brand_key, safeConfig, queued?.queue || null);
  return { runId: built.runId };
}

function updateOnboardingVisibility() {
  if (!hasAppDashboardUi || !elements.onboardingSection) {
    return;
  }

  ensureOnboardingStateInitialized();
  const hasRequestedRunInUrl = Boolean(String(state.requestedRunId || "").trim());
  if (hasRequestedRunInUrl) {
    state.onboarding.forceOpen = false;
    state.onboarding.manualOverride = false;
  }
  for (const section of onboardingGatedSections) {
    section.hidden = false;
    section.setAttribute("aria-hidden", "false");
  }

  const autoEligible = shouldAutoOpenOnboarding();
  if (!state.onboarding.manualOverride && !autoEligible) {
    state.onboarding.forceOpen = false;
  }
  const showOnboarding = Boolean(state.onboarding.forceOpen && (state.onboarding.manualOverride || autoEligible));
  elements.onboardingSection.hidden = !showOnboarding;
  elements.onboardingSection.setAttribute("aria-hidden", showOnboarding ? "false" : "true");
  document.body.classList.toggle("onboarding-open", showOnboarding);
  if (showOnboarding) {
    setOnboardingStep(state.onboarding.step || 1);
    refreshOnboardingPreview();
  }

  setOnboardingSubmitLabel("Launch Mission");
  if (elements.launchSwarmButton) {
    elements.launchSwarmButton.textContent = "New Run";
  }
}

function sanitizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 256);
}

function formatOnboardingTargetInputValue(targetUrl) {
  const normalized = String(targetUrl || "").trim();
  if (!normalized) {
    return "";
  }
  try {
    const parsed = new URL(normalized);
    const isDefaultPath = parsed.pathname === "/" && !parsed.search && !parsed.hash;
    return isDefaultPath ? `${parsed.protocol}//${parsed.host}` : parsed.toString();
  } catch {
    return normalized;
  }
}

function normalizeOnboardingTargetUrlInput(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const candidate = /^https?:\/\//i.test(compact) ? compact : `https://${compact.replace(/^\/+/, "")}`;
  const normalized = toExternalUrl(candidate);
  if (!normalized) {
    return "";
  }

  if (options.writeBack && elements.onboardingTargetUrl) {
    elements.onboardingTargetUrl.value = formatOnboardingTargetInputValue(normalized);
  }
  return normalized;
}

const COMPOUND_TLD_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "com.tr",
  "co.in",
  "com.sg",
  "co.jp"
]);

function pickBrandRootLabel(hostname) {
  const labels = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);

  if (!labels.length) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }

  const suffix = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  let domainIndex = labels.length - 2;
  if (labels.length >= 3 && COMPOUND_TLD_SUFFIXES.has(suffix)) {
    domainIndex = labels.length - 3;
  }

  return labels[Math.max(0, domainIndex)] || labels[0];
}

function toReadableBrandName(value) {
  const words = String(value || "")
    .trim()
    .split(/[-_]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!words.length) {
    return "";
  }

  return words
    .map((token) => {
      if (/^\d+$/.test(token)) {
        return token;
      }
      return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
    })
    .join(" ");
}

function inferBrandNameFromTargetUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const rootLabel = pickBrandRootLabel(parsed.hostname);
    const readable = toReadableBrandName(rootLabel);
    return readable || parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function inferBrandKeyFromTargetUrl(targetUrl) {
  const brandName = inferBrandNameFromTargetUrl(targetUrl);
  const fromName = sanitizeBrandKey(brandName);
  if (fromName) {
    return fromName;
  }

  try {
    const parsed = new URL(targetUrl);
    return sanitizeBrandKey(parsed.hostname);
  } catch {
    return "";
  }
}

function buildDashboardRunId(brandKey) {
  const slug = String(brandKey || "run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .slice(0, 40);
  return `dashboard_${slug || "run"}_${Date.now()}`;
}

function parseScenarioText(value) {
  const lines = String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);
  return lines;
}

function normalizeScopeModeInput(value) {
  const scopeMode = String(value || "").trim().toLowerCase();
  return scopeMode || "core_20m";
}

function normalizeScenarioListInput(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 25);
  }
  return parseScenarioText(value);
}

function buildRunLaunchConfig({ row = null, report = null } = {}) {
  const safeRow = row && typeof row === "object" ? row : {};
  const safeReport = report && typeof report === "object" ? report : {};
  const reportMetadata = safeReport.metadata && typeof safeReport.metadata === "object" ? safeReport.metadata : {};

  const targetUrl =
    normalizeOnboardingTargetUrlInput(
      String(
        safeRow.target_url ||
          reportMetadata.target_url ||
          safeReport.target_url ||
          safeReport.target ||
          safeRow.target ||
          state.filters.brand ||
          ""
      ),
      { writeBack: false }
    ) || "";
  const scopeMode = normalizeScopeModeInput(safeRow.scope_mode || reportMetadata.scope_mode || "core_20m");
  const scenarios = normalizeScenarioListInput(safeRow.scenario_list || reportMetadata.scenario_list || []);
  const goal = String(
    safeRow.goal ||
      safeRow.user_goal ||
      safeRow.objective ||
      reportMetadata.goal ||
      reportMetadata.user_goal ||
      reportMetadata.objective ||
      ""
  )
    .trim()
    .slice(0, 1000);
  const persona =
    String(
      safeRow.persona ||
        safeRow.brand_persona ||
        reportMetadata.brand_persona ||
        reportMetadata.persona ||
        DEFAULT_DASHBOARD_PERSONA
    )
      .trim()
      .slice(0, 500) || DEFAULT_DASHBOARD_PERSONA;
  const brandKey = sanitizeBrandKey(
    safeRow.brand_key || reportMetadata.brand_key || inferBrandKeyFromTargetUrl(targetUrl) || state.filters.brand || ""
  );
  const brandName =
    String(safeRow.brand_name || reportMetadata.brand_name || inferBrandNameFromTargetUrl(targetUrl) || "").trim() ||
    toDisplayProjectName(brandKey) ||
    "";

  return {
    targetUrl,
    scopeMode,
    scenarios,
    goal,
    persona,
    brandKey,
    brandName
  };
}

function findLatestRunForBrand(brandKey = "") {
  const safeBrandKey = sanitizeBrandKey(String(brandKey || ""));
  if (!safeBrandKey) {
    return null;
  }
  const collections = [state.runs, state.allRuns];
  for (const items of collections) {
    const match = (Array.isArray(items) ? items : []).find(
      (row) => sanitizeBrandKey(String(row?.brand_key || "")) === safeBrandKey
    );
    if (match) {
      return match;
    }
  }
  return null;
}

function buildFreshRunSeedConfig(options = {}) {
  const preferredBrandKey = sanitizeBrandKey(String(options.brandKey || state.filters.brand || ""));
  const preferredRunId = String(options.runId || state.selectedRunId || state.requestedRunId || "").trim();
  const preferredRow = preferredRunId
    ? state.runs.find((item) => item.run_id === preferredRunId) ||
      state.allRuns.find((item) => item.run_id === preferredRunId) ||
      getPinnedRunRow(preferredRunId) ||
      null
    : null;
  const brandRow =
    preferredRow && sanitizeBrandKey(String(preferredRow.brand_key || "")) === preferredBrandKey
      ? preferredRow
      : findLatestRunForBrand(preferredBrandKey);
  const targetUrl = normalizeOnboardingTargetUrlInput(
    String(brandRow?.target_url || brandRow?.target || preferredBrandKey || ""),
    { writeBack: false }
  );
  const brandName =
    String(brandRow?.brand_name || inferBrandNameFromTargetUrl(targetUrl) || toDisplayProjectName(preferredBrandKey) || "").trim() ||
    "";

  return {
    targetUrl,
    brandKey: preferredBrandKey || inferBrandKeyFromTargetUrl(targetUrl),
    brandName,
    persona: "",
    goal: "",
    scenarios: [],
    scopeMode: "deep_45m",
    prefillPersona: false
  };
}

function resolveRunMission(row, report) {
  const config = buildRunLaunchConfig({ row, report });
  return {
    config,
    goal: buildDashboardRunGoal(config),
    persona:
      String(config.persona || resolvePersonaName(row) || DEFAULT_DASHBOARD_PERSONA)
        .trim()
        .slice(0, 500) || DEFAULT_DASHBOARD_PERSONA
  };
}

function renderPrimaryGoalCard(goal, persona, options = {}) {
  const safeGoal =
    String(goal || "").trim() || "Reach the product, clear onboarding, and complete a meaningful in-product task.";
  const safePersona = String(persona || "").trim();
  const extraMeta = String(options.meta || "").trim();
  const metaParts = [];
  if (safePersona) {
    metaParts.push(`Persona: ${safePersona}`);
  }
  if (extraMeta) {
    metaParts.push(extraMeta);
  }

  return `
    <article class="primary-goal-card ${escapeHtml(String(options.className || "").trim())}">
      <div class="primary-goal-card-header">
        <span class="primary-goal-kicker">Primary goal</span>
        ${safePersona ? `<span class="inline-pill">${escapeHtml(safePersona)}</span>` : ""}
      </div>
      <p>${escapeHtml(safeGoal)}</p>
      ${metaParts.length ? `<small>${escapeHtml(metaParts.join(" · "))}</small>` : ""}
    </article>
  `;
}

function canLaunchFromConfig(config) {
  const safeConfig = config && typeof config === "object" ? config : {};
  if (!String(safeConfig.targetUrl || "").trim()) {
    return false;
  }
  if (!String(safeConfig.persona || "").trim()) {
    return false;
  }
  const scopeMode = normalizeScopeModeInput(safeConfig.scopeMode);
  if (scopeMode === "feature_targeted" && !normalizeScenarioListInput(safeConfig.scenarios).length) {
    return false;
  }
  return true;
}

function deriveOnboardingStepFromConfig(config) {
  const safeConfig = config && typeof config === "object" ? config : {};
  if (!String(safeConfig.targetUrl || "").trim()) {
    return 1;
  }
  if (!String(safeConfig.persona || "").trim()) {
    return 2;
  }
  if (!getUserMissionScenariosFromValue(safeConfig.scenarios).length) {
    return 3;
  }
  return ONBOARDING_MAX_STEP;
}

function setButtonPending(button, pending, pendingLabel = "Working…") {
  if (!(button instanceof HTMLElement)) {
    return;
  }
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }
  button.disabled = Boolean(pending);
  button.textContent = pending ? pendingLabel : button.dataset.defaultLabel;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function getOnboardingSteps() {
  if (!elements.onboardingForm) {
    return [];
  }
  return Array.from(elements.onboardingForm.querySelectorAll("[data-onboarding-step]"));
}

function clampOnboardingStep(value) {
  const step = Number(value) || 1;
  return Math.min(ONBOARDING_MAX_STEP, Math.max(1, step));
}

function getSelectedPersonaButtons() {
  if (!elements.onboardingPersonaChoices) {
    return [];
  }
  return Array.from(elements.onboardingPersonaChoices.querySelectorAll(".onboarding-choice.active"));
}

function getSelectedPersonaLabels() {
  return getSelectedPersonaButtons()
    .map((button) => String(button.querySelector("strong")?.textContent || button.textContent || "").trim())
    .filter(Boolean);
}

function getSelectedPersonaDescriptions() {
  return getSelectedPersonaButtons()
    .map((button) => String(button.getAttribute("data-persona-choice") || "").trim())
    .filter(Boolean);
}

function getSelectedCriticalInputs() {
  if (!elements.onboardingCriticalChoices) {
    return [];
  }
  return Array.from(elements.onboardingCriticalChoices.querySelectorAll("input[type='checkbox']:checked"));
}

function getSelectedMissionScenarios() {
  const selected = getSelectedCriticalInputs()
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
  const custom = parseScenarioText(elements.onboardingScenariosCustom?.value || "");
  return [...selected, ...custom]
    .filter((item) => item && item !== DEFAULT_ONBOARDING_SCENARIO)
    .slice(0, 24);
}

function getSelectedMissionLabels() {
  const selected = getSelectedCriticalInputs()
    .map((input) => {
      const label = input.closest(".onboarding-toggle");
      return String(label?.querySelector("strong")?.textContent || input.value || "").trim();
    })
    .filter(Boolean);
  const custom = parseScenarioText(elements.onboardingScenariosCustom?.value || "");
  return [...selected, ...custom].slice(0, 24);
}

function getActiveIntensityChoice() {
  if (!elements.onboardingIntensityChoices) {
    return null;
  }
  return elements.onboardingIntensityChoices.querySelector(".onboarding-intensity.active");
}

function syncOnboardingPersonaField() {
  const selected = getSelectedPersonaDescriptions();
  const labels = getSelectedPersonaLabels();
  const custom = String(elements.onboardingPersonaCustom?.value || "").trim();
  const personaValue =
    [
      selected.length ? `Roleplay these ICPs: ${selected.join(" ")}` : "",
      custom ? `Custom ICP guidance: ${custom}` : ""
    ]
      .filter(Boolean)
      .join(" ")
      .trim()
      .slice(0, 500) || DEFAULT_DASHBOARD_PERSONA;

  if (elements.onboardingPersona) {
    elements.onboardingPersona.value = personaValue;
  }
  return { selected, labels, custom, personaValue };
}

function syncOnboardingScenariosField() {
  const missions = getSelectedMissionScenarios();
  const combined = [DEFAULT_ONBOARDING_SCENARIO, ...missions].slice(0, 25);
  if (elements.onboardingScenarios) {
    elements.onboardingScenarios.value = combined.join("\n");
  }
  return { missions, combined };
}

function getOnboardingScopeMeta(scopeMode) {
  return ONBOARDING_SCOPE_META[normalizeScopeModeInput(scopeMode)] || ONBOARDING_SCOPE_META.deep_45m;
}

function buildOnboardingPrimaryGoal({ targetUrl = "", brandName = "", missions = [] } = {}) {
  const normalizedMissions = Array.isArray(missions)
    ? missions.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!normalizedMissions.length) {
    return "";
  }
  const targetLabel = String(brandName || "").trim() || buildTargetLabelFromUrl(targetUrl) || "the product";
  if (normalizedMissions.length === 1) {
    return `Clear onboarding in ${targetLabel}, then ${normalizedMissions[0]}`.slice(0, 1000);
  }
  return `Clear onboarding in ${targetLabel}, then complete these goals in order: ${normalizedMissions.join("; ")}`.slice(
    0,
    1000
  );
}

function renderOnboardingReviewList(container, values = [], emptyText = "Not set yet") {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const items = Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
  if (!items.length) {
    container.innerHTML = `<span class="onboarding-review-empty">${escapeHtml(emptyText)}</span>`;
    return;
  }
  container.innerHTML = items
    .map((item) => `<span class="onboarding-review-pill">${escapeHtml(item)}</span>`)
    .join("");
}

function updateOnboardingScopeUi() {
  const activeChoice = getActiveIntensityChoice();
  const scopeMode = String(activeChoice?.getAttribute("data-scope-mode") || "deep_45m").trim();
  if (elements.onboardingScopeMode) {
    elements.onboardingScopeMode.value = scopeMode;
  }
  const scopeMeta = getOnboardingScopeMeta(scopeMode);
  if (elements.onboardingScenarioHint) {
    elements.onboardingScenarioHint.textContent = `${scopeMeta.label}: pick at least one post-onboarding goal. Onboarding is always included automatically.`;
  }
}

function maybePopulateBrandKeyFromTarget() {
  if (!elements.onboardingTargetUrl) {
    return { brandKey: "", brandName: "", targetUrl: "" };
  }
  const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl.value || ""));
  if (!targetUrl) {
    if (elements.onboardingBrandKey) {
      elements.onboardingBrandKey.value = "";
    }
    if (elements.onboardingPreviewBrandName) {
      elements.onboardingPreviewBrandName.textContent = "Waiting for URL";
    }
    return { brandKey: "", brandName: "", targetUrl: "" };
  }
  const brandName = inferBrandNameFromTargetUrl(targetUrl);
  const brandKey = inferBrandKeyFromTargetUrl(targetUrl);
  if (elements.onboardingBrandKey) {
    elements.onboardingBrandKey.value = brandKey;
  }
  if (elements.onboardingPreviewBrandName) {
    elements.onboardingPreviewBrandName.textContent = brandName || "Unknown brand";
  }
  return { brandKey, brandName, targetUrl };
}

function refreshOnboardingPreview() {
  if (!elements.onboardingPreviewHost || !elements.onboardingPreviewUrl || !elements.onboardingPreviewIcon) {
    return;
  }
  const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""));
  if (!targetUrl) {
    elements.onboardingPreviewHost.textContent = "Waiting for your site";
    elements.onboardingPreviewUrl.textContent = "Type your domain and we will normalize the full URL.";
    if (elements.onboardingPreviewBrandName) {
      elements.onboardingPreviewBrandName.textContent = "Waiting for URL";
    }
    elements.onboardingPreviewIcon.removeAttribute("src");
    return;
  }

  try {
    const parsed = new URL(targetUrl);
    const brandName = inferBrandNameFromTargetUrl(targetUrl);
    elements.onboardingPreviewHost.textContent = parsed.hostname;
    elements.onboardingPreviewUrl.textContent = formatOnboardingTargetInputValue(targetUrl);
    if (elements.onboardingPreviewBrandName) {
      elements.onboardingPreviewBrandName.textContent = brandName || "Unknown brand";
    }
    elements.onboardingPreviewIcon.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(targetUrl)}`;
  } catch {
    elements.onboardingPreviewHost.textContent = "Waiting for your site";
    elements.onboardingPreviewUrl.textContent = "Type your domain and we will normalize the full URL.";
    if (elements.onboardingPreviewBrandName) {
      elements.onboardingPreviewBrandName.textContent = "Waiting for URL";
    }
    elements.onboardingPreviewIcon.removeAttribute("src");
  }
}

function refreshOnboardingLaunchSummary() {
  if (!elements.onboardingLaunchSummary) {
    return;
  }
  const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""));
  let host = "your app";
  if (targetUrl) {
    try {
      host = new URL(targetUrl).hostname;
    } catch {
      host = targetUrl;
    }
  }
  const brandName = targetUrl ? inferBrandNameFromTargetUrl(targetUrl) : "";
  const personaState = syncOnboardingPersonaField();
  const scenarioState = syncOnboardingScenariosField();
  const scopeMeta = getOnboardingScopeMeta(elements.onboardingScopeMode?.value || "deep_45m");
  const personaReviewItems = personaState.labels.length
    ? personaState.labels
    : personaState.custom
      ? [personaState.custom]
      : [];
  const goalReviewItems = getSelectedMissionLabels();

  if (elements.onboardingReviewSite) {
    elements.onboardingReviewSite.textContent = targetUrl ? `${brandName || host} (${host})` : "Waiting for site";
  }
  if (elements.onboardingReviewSiteMeta) {
    elements.onboardingReviewSiteMeta.textContent = targetUrl
      ? "We start from the public entry point, discover auth, and treat onboarding as part of the run."
      : "We will start at the public entry point and discover auth if needed.";
  }
  renderOnboardingReviewList(elements.onboardingReviewPersonas, personaReviewItems, "Choose at least one persona");
  renderOnboardingReviewList(elements.onboardingReviewGoals, goalReviewItems, "Choose at least one post-onboarding goal");
  if (elements.onboardingReviewCoverage) {
    elements.onboardingReviewCoverage.textContent = scopeMeta.label;
  }
  if (elements.onboardingReviewCoverageMeta) {
    elements.onboardingReviewCoverageMeta.textContent = scopeMeta.description;
  }

  const goalCount = scenarioState.missions.length;
  const personaCount = personaReviewItems.length;
  elements.onboardingLaunchSummary.textContent = targetUrl
    ? `We will test ${brandName || host} as ${
        personaCount ? `${personaCount} persona${personaCount === 1 ? "" : "s"}` : "the selected ICP"
      }, clear onboarding, then push on ${
        goalCount ? `${goalCount} real product goal${goalCount === 1 ? "" : "s"}` : "the goals you select"
      }.`
    : "Choose a site, a persona, and at least one goal to review the mission.";
}

function setOnboardingStep(stepValue) {
  state.onboarding.step = clampOnboardingStep(stepValue);
  const activeStep = state.onboarding.step;
  const steps = getOnboardingSteps();
  for (const section of steps) {
    const sectionStep = Number(section.getAttribute("data-onboarding-step"));
    const isActive = sectionStep === activeStep;
    section.hidden = !isActive;
    section.classList.toggle("active", isActive);
    section.setAttribute("aria-hidden", isActive ? "false" : "true");
  }

  if (elements.onboardingStepPills) {
    const pills = Array.from(elements.onboardingStepPills.querySelectorAll("[data-step-pill]"));
    for (const pill of pills) {
      const pillStep = Number(pill.getAttribute("data-step-pill"));
      pill.classList.toggle("active", pillStep === activeStep);
      pill.classList.toggle("complete", pillStep < activeStep);
    }
  }

  if (elements.onboardingProgressBar) {
    const percent = (activeStep / ONBOARDING_MAX_STEP) * 100;
    elements.onboardingProgressBar.style.width = `${percent}%`;
    elements.onboardingProgressBar.parentElement?.setAttribute("aria-valuenow", String(activeStep));
  }

  const meta = ONBOARDING_STEP_META[activeStep] || ONBOARDING_STEP_META[1];
  if (elements.onboardingStepTitle) {
    elements.onboardingStepTitle.textContent = meta.title;
  }
  if (elements.onboardingStepCount) {
    elements.onboardingStepCount.textContent = `${activeStep} of ${ONBOARDING_MAX_STEP}`;
  }
  if (elements.onboardingStatusText) {
    elements.onboardingStatusText.textContent = meta.subtitle;
  }

  if (elements.onboardingPrevButton) {
    elements.onboardingPrevButton.hidden = activeStep <= 1;
  }
  if (elements.onboardingNextButton) {
    elements.onboardingNextButton.hidden = activeStep >= ONBOARDING_MAX_STEP;
  }
  if (elements.onboardingSubmitButton) {
    elements.onboardingSubmitButton.hidden = activeStep < ONBOARDING_MAX_STEP;
  }

  if (activeStep === ONBOARDING_MAX_STEP) {
    refreshOnboardingLaunchSummary();
  }
}

function validateOnboardingStep(stepValue) {
  const step = clampOnboardingStep(stepValue);
  syncOnboardingPersonaField();
  syncOnboardingScenariosField();
  updateOnboardingScopeUi();
  maybePopulateBrandKeyFromTarget();

  if (step === 1) {
    const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""));
    if (!targetUrl) {
      setOnboardingMessage("Enter a valid site domain or URL first.", "error");
      elements.onboardingTargetUrl?.focus();
      return false;
    }
  }

  if (step === 2) {
    const selectedCount = getSelectedPersonaButtons().length;
    const customPersona = String(elements.onboardingPersonaCustom?.value || "").trim();
    if (!selectedCount && !customPersona) {
      setOnboardingMessage("Pick at least one persona for the swarm to roleplay.", "error");
      elements.onboardingPersonaCustom?.focus();
      return false;
    }
  }

  if (step === 3) {
    const scenarioState = syncOnboardingScenariosField();
    if (!scenarioState.missions.length) {
      setOnboardingMessage("Choose at least one post-onboarding goal to test.", "error");
      elements.onboardingScenariosCustom?.focus();
      return false;
    }
  }

  setOnboardingMessage("", "");
  return true;
}

async function playLaunchSequence() {
  if (!elements.onboardingLaunchSequence) {
    return;
  }
  const frames = [
    "Mission control online.",
    "Arming the swarm.",
    "3",
    "2",
    "1",
    "Launching agents..."
  ];
  for (const frame of frames) {
    elements.onboardingLaunchSequence.textContent = frame;
    await wait(170);
  }
}

async function resolveRunLaunchContext(runId = "") {
  const preferredRunId = String(runId || state.selectedRunId || state.requestedRunId || state.runs[0]?.run_id || "").trim();
  const row = preferredRunId
    ? state.runs.find((item) => item.run_id === preferredRunId) ||
      state.allRuns.find((item) => item.run_id === preferredRunId) ||
      getPinnedRunRow(preferredRunId) ||
      null
    : null;
  let report =
    state.activeRenderedReport && String(state.activeRenderedReport.run_id || "").trim() === preferredRunId
      ? state.activeRenderedReport
      : null;
  let config = buildRunLaunchConfig({ row, report });

  const rowScopeMode = normalizeScopeModeInput(row?.scope_mode);
  const rowHasExplicitTarget = Boolean(String(row?.target_url || row?.target || "").trim());
  const rowHasExplicitPersona = Boolean(String(row?.persona || row?.brand_persona || "").trim());
  const rowHasExplicitScope = Boolean(String(row?.scope_mode || "").trim());
  const rowHasExplicitScenarios = Array.isArray(row?.scenario_list) && row.scenario_list.length > 0;
  const needsReport =
    Boolean(preferredRunId) &&
    (!rowHasExplicitTarget ||
      !rowHasExplicitPersona ||
      !rowHasExplicitScope ||
      (rowScopeMode === "feature_targeted" && !rowHasExplicitScenarios));

  if (!report && needsReport) {
    try {
      const payload = await fetchReport(preferredRunId);
      report = payload?.report || null;
      config = buildRunLaunchConfig({ row, report });
    } catch {
      report = null;
    }
  }

  return {
    row,
    report,
    config
  };
}

async function openSmartLaunchFlow(event, options = {}) {
  const isTrusted = Boolean(event?.isTrusted);
  if (!isTrusted) {
    return;
  }
  const startFresh = Boolean(options.startFresh);
  const selectedBrandKey = sanitizeBrandKey(String(options.brandKey || state.filters.brand || ""));
  if (startFresh && selectedBrandKey) {
    const freshConfig = buildFreshRunSeedConfig({
      brandKey: selectedBrandKey,
      runId: options.runId
    });
    prefillOnboardingFromConfig(freshConfig);
    state.onboarding.step = freshConfig.targetUrl ? 2 : 1;
    openOnboardingModal({ resetStep: false, manual: true, trusted: true });
    return;
  }

  const preferredRunId = String(options.runId || state.selectedRunId || state.requestedRunId || "").trim();
  const context = await resolveRunLaunchContext(preferredRunId);
  prefillOnboardingFromConfig(context.config);
  state.onboarding.step = deriveOnboardingStepFromConfig(context.config);
  openOnboardingModal({ resetStep: false, manual: true, trusted: true });
}

async function retryRunFromContext(runId, event) {
  const isTrusted = Boolean(event?.isTrusted);
  if (!isTrusted) {
    return;
  }
  const trigger =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : event?.target instanceof HTMLElement
        ? event.target
        : null;
  setButtonPending(trigger, true, "Retrying…");
  setDashboardStateMessage("Retrying the last known run configuration...");

  try {
    const context = await resolveRunLaunchContext(runId);
    if (!canLaunchFromConfig(context.config)) {
      prefillOnboardingFromConfig(context.config);
      state.onboarding.step = deriveOnboardingStepFromConfig(context.config);
      openOnboardingModal({ resetStep: false, manual: true, trusted: true });
      setDashboardStateMessage("Review the prefilled run setup and relaunch when ready.");
      return;
    }

    await launchDashboardRunFromConfig(context.config, {
      source: "dashboard_retry",
      launchedFrom: "dashboard_retry",
      retryOfRunId: String(runId || context.row?.run_id || "").trim()
    });
  } catch (error) {
    setDashboardStateMessage(error.message || "Could not relaunch the run.");
  } finally {
    setButtonPending(trigger, false);
  }
}

async function submitOnboardingRun(event) {
  event.preventDefault();
  if (!elements.onboardingForm) {
    return;
  }
  if (!isDashboardAuthorized()) {
    setOnboardingMessage("Sign in required before launching a swarm.", "error");
    return;
  }

  if (!validateOnboardingStep(ONBOARDING_MAX_STEP)) {
    return;
  }

  maybePopulateBrandKeyFromTarget();
  updateOnboardingScopeUi();
  syncOnboardingPersonaField();
  const scenarioState = syncOnboardingScenariosField();
  const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""), { writeBack: true });
  const generatedBrand = maybePopulateBrandKeyFromTarget();
  const brandKey = sanitizeBrandKey(String(elements.onboardingBrandKey?.value || generatedBrand.brandKey || ""));
  const brandName = String(generatedBrand.brandName || inferBrandNameFromTargetUrl(targetUrl) || "").trim();
  const persona = String(elements.onboardingPersona?.value || "").trim().slice(0, 500);
  const scopeMode = String(elements.onboardingScopeMode?.value || "core_20m").trim();
  const scenarios = scenarioState.combined;
  const missions = scenarioState.missions;
  const goal = buildOnboardingPrimaryGoal({ targetUrl, brandName, missions });

  if (!targetUrl) {
    setOnboardingMessage("Target URL must be a valid site domain or URL.", "error");
    setOnboardingStep(1);
    elements.onboardingTargetUrl?.focus();
    return;
  }
  if (!persona) {
    setOnboardingMessage("Bot personality is required.", "error");
    setOnboardingStep(2);
    elements.onboardingPersonaCustom?.focus();
    return;
  }
  if (!missions.length) {
    setOnboardingMessage("Add at least one post-onboarding goal for the swarm.", "error");
    setOnboardingStep(3);
    elements.onboardingScenariosCustom?.focus();
    return;
  }

  setOnboardingSubmitting(true);
  setOnboardingMessage("Preparing launch sequence...", "");
  try {
    await playLaunchSequence();
    setOnboardingMessage("Queueing swarm run...", "");
    const launched = await launchDashboardRunFromConfig(
      {
        targetUrl,
        brandKey,
        brandName,
        persona,
        goal,
        scopeMode,
        scenarios
      },
      {
        source: "dashboard_onboarding",
        launchedFrom: "dashboard_onboarding"
      }
    );
    setOnboardingMessage("Swarm launched. Tracking your run now.", "ok");
    setDashboardStateMessage("Swarm launched. Tracking the new run now.");
    if (launched?.runId) {
      state.requestedRunId = launched.runId;
    }
  } catch (error) {
    setOnboardingMessage(error.message || "Could not launch swarm run.", "error");
  } finally {
    setOnboardingSubmitting(false);
  }
}

async function fetchRuns() {
  const response = await fetch(`/api/qa/reports?${buildReportParams({ includeBrand: true }).toString()}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to access dashboard reports.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load reports");
  }

  const fetchedItems = Array.isArray(data.items) ? data.items : [];
  reconcilePinnedRunsWithFetched(fetchedItems);
  state.allRuns = mergePinnedRunsIntoCollection(fetchedItems);
  state.personaOptions = buildPersonaOptions(state.allRuns);
  const resetPersonaFilter = reconcilePersonaFilterWithAvailableOptions();
  state.runs = applyPersonaFilter(state.allRuns);
  if (resetPersonaFilter) {
    state.runs = state.allRuns.slice();
  }
  ensureSelectedRunVisibleInRuns();
  if (state.allRuns.length > 0) {
    state.onboarding.hasAnyRuns = true;
  }
}

async function detectAnyHistoricalRuns() {
  if (state.onboarding.hasAnyRuns === true) {
    return true;
  }

  if (!isDashboardAuthorized()) {
    state.onboarding.hasAnyRuns = false;
    return false;
  }

  try {
    const response = await fetch("/api/qa/reports?limit=1&offset=0");
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      state.onboarding.hasAnyRuns = false;
      return false;
    }
    if (!response.ok || !data.ok) {
      const fallback = Array.isArray(state.allRuns) && state.allRuns.length > 0;
      state.onboarding.hasAnyRuns = fallback;
      return fallback;
    }
    const hasAnyRuns = Array.isArray(data.items) && data.items.length > 0;
    state.onboarding.hasAnyRuns = hasAnyRuns;
    return hasAnyRuns;
  } catch {
    const fallback = Array.isArray(state.allRuns) && state.allRuns.length > 0;
    state.onboarding.hasAnyRuns = fallback;
    return fallback;
  }
}

async function fetchBrandOptions() {
  const response = await fetch("/api/qa/projects");
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    state.savedProjects = [];
    rebuildProjectOptions();
    return state.savedProjects;
  }
  if (!response.ok || !data.ok) {
    state.savedProjects = [];
  } else {
    state.savedProjects = Array.isArray(data.items) ? data.items : [];
  }

  rebuildProjectOptions();
  return state.savedProjects;
}

function mergeSavedProjects(projects) {
  state.savedProjects = dashboardProjects.mergeSavedProjects(state.savedProjects, projects, {
    normalizeProject: normalizeSavedProject
  });
  rebuildProjectOptions();
}

function buildSavedProjectPayload(config = {}, metadata = {}) {
  return dashboardProjects.buildSavedProjectPayload(config, metadata, {
    normalizeTargetUrl: (value) => normalizeOnboardingTargetUrlInput(String(value || ""), { writeBack: false }),
    sanitizeBrandKey,
    inferBrandKeyFromTargetUrl,
    inferBrandNameFromTargetUrl
  });
}

async function persistSavedProjects(projects) {
  const payload = (Array.isArray(projects) ? projects : [projects]).filter(Boolean);
  if (!payload.length || !isDashboardAuthorized()) {
    return [];
  }

  const response = await fetch("/api/qa/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ projects: payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to save projects");
  }

  const savedItems = Array.isArray(data.items) ? data.items : payload;
  mergeSavedProjects(savedItems);
  return savedItems;
}

function renderBrandSuggestions() {
  dashboardProjects.renderProjectFilter({
    selectElement: elements.brandFilter,
    brandOptions: state.brandOptions,
    selectedBrand: state.filters.brand,
    addNewProjectValue: ADD_NEW_PROJECT_OPTION_VALUE,
    escapeHtml,
    getProjectOptionLabel: getBrandOptionLabel
  });
}

function syncProjectSwitcherVisibility() {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }

  const hasProjects = Array.isArray(state.brandOptions) && state.brandOptions.length > 0;
  elements.appDashboardRoot.setAttribute("data-has-projects", hasProjects ? "true" : "false");
  if (elements.topbarProjectShell) {
    elements.topbarProjectShell.setAttribute("data-has-projects", hasProjects ? "true" : "false");
  }
  if (elements.appAuthHeader) {
    elements.appAuthHeader.hidden = !hasProjects;
    elements.appAuthHeader.setAttribute("aria-hidden", hasProjects ? "false" : "true");
  }
}

function setDashboardLoading(isLoading) {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }
  const loading = Boolean(isLoading);
  const shellReady = elements.appDashboardRoot.getAttribute("data-shell-ready") === "true";
  const blockingOverlay = loading && !shellReady;
  elements.appDashboardRoot.setAttribute("data-loading", blockingOverlay ? "true" : "false");
  if (elements.dashboardLoadingOverlay) {
    elements.dashboardLoadingOverlay.hidden = !blockingOverlay;
    elements.dashboardLoadingOverlay.setAttribute("aria-hidden", blockingOverlay ? "false" : "true");
  }
  if (elements.brandFilter) {
    elements.brandFilter.disabled = loading;
  }
  if (elements.environmentSwitcher) {
    elements.environmentSwitcher.disabled = loading;
  }
  if (state.dashboardLoadingTimer) {
    window.clearTimeout(state.dashboardLoadingTimer);
    state.dashboardLoadingTimer = null;
  }
  if (blockingOverlay) {
    state.dashboardLoadingTimer = window.setTimeout(() => {
      setDashboardLoading(false);
    }, DASHBOARD_LOADING_FAILSAFE_MS);
  }
}

function markDashboardShellReady() {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }
  elements.appDashboardRoot.setAttribute("data-shell-ready", "true");
  setDashboardLoading(false);
}

function ensureSingleProjectSelection() {
  const nextSelection = dashboardProjects.ensureSingleProjectSelection({
    brandOptions: state.brandOptions,
    selectedBrand: state.filters.brand,
    normalizeBrandKey: normalizeBrandFilterValue
  });
  if (!nextSelection.changed) {
    return false;
  }
  state.filters.brand = nextSelection.selectedBrand;
  setStoredBrand(state.filters.brand);
  return true;
}

function renderBrandSummary() {
  if (!elements.activeBrandLabel || !elements.activeBrandMeta) {
    return;
  }
  const activeBrand = state.filters.brand ? getBrandOptionLabel(state.filters.brand) : "No project selected";
  const environment = getEnvironmentLabel(getActiveEnvironment());
  const runsCount = state.runs.length;
  const latestRun = state.runs[0] || null;
  const latestRunTime = latestRun?.delivered_at ? formatRelativeTime(latestRun.delivered_at) : "not tested yet";
  const completedCount = state.runs.filter((row) => getCanonicalRunStatus(null, row, null) === "completed").length;
  const findingsCount = state.runs.reduce((acc, row) => acc + (Number(row.findings_count) || 0), 0);
  const bugCount = state.runs.reduce(
    (acc, row) => acc + (Number(row.counts?.bug) || 0),
    0
  );
  const frictionCount = state.runs.reduce((acc, row) => {
    const counts = row.counts || {};
    return (
      acc +
      (Number(counts.frustration_point) || 0) +
      (Number(counts.confusion_point) || 0) +
      (Number(counts.dead_end) || 0)
    );
  }, 0);
  const completionPercent = runsCount ? Math.round((completedCount / runsCount) * 100) : 0;
  const personaCount = state.personaOptions.length;
  const riskValues = state.runs
    .map((row) => Number(row.risk_score))
    .filter((value) => Number.isFinite(value));
  const avgRisk = riskValues.length
    ? Math.round((riskValues.reduce((acc, value) => acc + value, 0) / riskValues.length) * 10) / 10
    : 0;

  elements.activeBrandLabel.textContent = `${activeBrand} / ${environment}`;
  const personaSuffix = runsCount > 0 && state.filters.persona ? ` Persona set: ${state.filters.persona}.` : "";
  elements.activeBrandMeta.textContent = `Last tested ${latestRunTime} · ${runsCount} run${runsCount === 1 ? "" : "s"} · ${findingsCount} finding${findingsCount === 1 ? "" : "s"}.${personaSuffix}`;
  elements.metricRuns.textContent = String(runsCount);
  elements.metricCompleted.textContent = String(completedCount);
  elements.metricFindings.textContent = String(findingsCount);
  elements.metricRisk.textContent = String(avgRisk);

  if (elements.metricPersonas) {
    elements.metricPersonas.textContent = String(personaCount);
  }
  if (elements.metricBugs) {
    elements.metricBugs.textContent = String(bugCount || findingsCount);
  }
  if (elements.metricFriction) {
    elements.metricFriction.textContent = String(frictionCount);
  }
  if (elements.metricComplete) {
    elements.metricComplete.textContent = `${completionPercent}%`;
  }
  if (elements.activeSwarmNotice) {
    const personaContext = state.filters.persona ? ` using "${state.filters.persona}"` : "";
    elements.activeSwarmNotice.textContent =
      runsCount > 0
        ? `Active swarm tracking ${runsCount} run${runsCount === 1 ? "" : "s"} for ${activeBrand}${personaContext}.`
        : "No active swarm — launch one to start testing.";
  }

  if (elements.dashboardRunMeta) {
    const selectedRow =
      state.runs.find((item) => item.run_id === state.selectedRunId) ||
      state.allRuns.find((item) => item.run_id === state.selectedRunId) ||
      getPinnedRunRow(state.selectedRunId) ||
      state.runs[0] ||
      null;
    if (!selectedRow) {
      elements.dashboardRunMeta.textContent = "No run selected";
    } else {
      const liveStatus = getLiveStatus(selectedRow.run_id);
      const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
      const status = queueStatus || String(selectedRow.queue_status || selectedRow.status || "unknown").toLowerCase();
      const findingsCount = Array.isArray(liveStatus?.live_report?.findings)
        ? liveStatus.live_report.findings.length
        : Number(selectedRow.findings_count) || 0;
      elements.dashboardRunMeta.textContent = `${selectedRow.run_id} · ${status} · ${findingsCount} findings`;
    }
  }
}

function renderBrandChips() {
  if (!elements.brandChips || !elements.brandChipsCount) {
    return;
  }
  if (hasAppDashboardUi) {
    const personas = state.personaOptions;
    elements.brandChipsCount.textContent = `${personas.length} personalit${personas.length === 1 ? "y" : "ies"}`;

    if (!personas.length) {
      elements.brandChips.innerHTML = '<div class="app-empty"><p>No bot personalities captured yet.</p></div>';
      return;
    }

    const allItem = `
      <button type="button" class="persona-item ${!state.filters.persona ? "active" : ""}" data-persona="">
        <span class="persona-avatar">${renderPersonaAvatar("General QA personality")}</span>
        <span class="persona-meta">
          <strong>All Personalities</strong>
          <small>Across current run filters</small>
        </span>
      </button>
    `;

    const personaItems = personas
      .map(
        (item) => `
          <button
            type="button"
            class="persona-item ${state.filters.persona === item.name ? "active" : ""}"
            data-persona="${escapeHtml(item.name)}"
          >
            <span class="persona-avatar">${renderPersonaAvatar(item.name)}</span>
            <span class="persona-meta">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(String(item.count))} runs using this personality</small>
            </span>
          </button>
        `
      )
      .join("");

    elements.brandChips.innerHTML = `${allItem}${personaItems}`;
    const nodes = Array.from(elements.brandChips.querySelectorAll("[data-persona]"));
    for (const node of nodes) {
      node.addEventListener("click", async () => {
        const persona = String(node.getAttribute("data-persona") || "").trim();
        state.filters.persona = persona;
        setStoredPersona(persona);
        state.runs = applyPersonaFilter(state.allRuns);
        state.personaOptions = buildPersonaOptions(state.allRuns);
        state.selectedRunId = null;
        state.requestedRunId = "";
        syncUrlFromState();
        renderBrandSummary();
        renderBrandChips();
        renderRunsList();
        renderAppRunPicker();
        await renderSelectedReport();
      });
    }
    return;
  }

  const chips = state.brandOptions;
  elements.brandChipsCount.textContent = `${chips.length} brand${chips.length === 1 ? "" : "s"}`;

  const allChip = `
    <button type="button" class="brand-chip ${!state.filters.brand ? "active" : ""}" data-brand="">
      All brands
    </button>
  `;

  const brandChips = chips
    .map(
      (item) => `
        <button
          type="button"
          class="brand-chip ${state.filters.brand === item.key ? "active" : ""}"
          data-brand="${escapeHtml(item.key)}"
        >
          ${escapeHtml(getBrandOptionLabel(item) || item.key)} (${escapeHtml(item.count)})
        </button>
      `
    )
    .join("");

  elements.brandChips.innerHTML = `${allChip}${brandChips}`;

  const nodes = Array.from(elements.brandChips.querySelectorAll("[data-brand]"));
  for (const node of nodes) {
    node.addEventListener("click", async () => {
      const brand = String(node.getAttribute("data-brand") || "").trim();
      elements.brandFilter.value = brand;
      readFiltersFromInputs();
      state.selectedRunId = null;
      state.requestedRunId = "";
      syncUrlFromState();
      state.reportCache.clear();
      await loadAndRenderReports();
    });
  }
}

function statusBadgeClass(status) {
  return `status-${String(status || "").toLowerCase()}`;
}

function renderRunPreview(run) {
  const screenshotUrl = toMediaCandidate(run.hero_screenshot);
  const hasImage = Boolean(screenshotUrl && isLikelyImageUrl(screenshotUrl));
  if (hasImage) {
    const proxiedSrc = buildEvidenceAssetUrl(run.run_id, "screenshot", 0);
    return `
      <span class="report-thumb">
        <img src="${escapeHtml(proxiedSrc)}" alt="Run preview for ${escapeHtml(run.run_id)}" loading="lazy" onerror="this.closest('.report-thumb').style.display='none'" />
      </span>
    `;
  }

  return `
    <span class="report-thumb">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16v11H4z" />
        <path d="m8 14 2-2 2 2 3-3 3 3" />
      </svg>
    </span>
  `;
}

function renderRunsList() {
  if (!elements.reportsItems || !elements.reportDetail || !elements.reportsCount) {
    return;
  }

  elements.reportsCount.textContent = String(state.runs.length);

  if (!state.runs.length) {
    elements.reportsItems.innerHTML = '<div class="empty-state">No reports found for these filters.</div>';
    elements.reportDetail.innerHTML = `
      <div class="empty-detail">
        <h2>No report selected</h2>
        <p>Try adjusting brand/target/status filters.</p>
      </div>
    `;
    return;
  }

  ensureSelectedRunVisibleInRuns();
  const nextSelection = dashboardRuns.ensureActiveRunSelection(getRunCollectionContext(), getRunCollectionHelpers());
  state.runs = nextSelection.runs;
  state.selectedRunId = nextSelection.selectedRunId;

  const html = state.runs
    .map((run) => {
      const active = run.run_id === state.selectedRunId ? "active" : "";
      const liveStatus = getLiveStatus(run.run_id);
      const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
      const displayStatus = getCanonicalRunStatus(null, run, liveStatus) || "unknown";
      const findingsCount = Array.isArray(liveStatus?.live_report?.findings)
        ? liveStatus.live_report.findings.length
        : run.findings_count;
      return `
        <article class="report-item ${active}" data-run-id="${escapeHtml(run.run_id)}">
          <div class="report-item-head">
            ${renderRunPreview(run)}
            <div>
              <div class="report-title-row">
                <h3>${escapeHtml(run.target || run.brand_key || run.run_id)}</h3>
                ${run.brand_key ? `<span class="report-brand-pill">${escapeHtml(run.brand_key)}</span>` : ""}
              </div>
              <p>${escapeHtml(run.run_id)}</p>
              <p>${escapeHtml(formatDate(run.delivered_at))}</p>
              <div class="badges">
                <span class="badge ${statusBadgeClass(displayStatus)}">${escapeHtml(displayStatus || "unknown")}</span>
                <span class="badge">findings ${escapeHtml(findingsCount)}</span>
                <span class="badge">risk ${escapeHtml(run.risk_score ?? "n/a")}</span>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  elements.reportsItems.innerHTML = html;
  attachRunClickHandlers();
}

function attachRunClickHandlers() {
  if (!elements.reportsItems) {
    return;
  }
  const nodes = Array.from(elements.reportsItems.querySelectorAll(".report-item"));
  for (const node of nodes) {
    node.addEventListener("click", () => {
      state.selectedRunId = node.getAttribute("data-run-id");
      state.requestedRunId = state.selectedRunId;
      syncUrlFromState();
      renderRunsList();
      renderSelectedReport().catch((error) => {
        elements.reportDetail.innerHTML = `<div class="empty-detail"><h2>Error</h2><p>${escapeHtml(error.message)}</p></div>`;
      });
    });
  }
}

function isQueueActiveStatus(value) {
  const status = normalizeRunStatus(value);
  return status === "queued" || status === "processing" || status === "retryable";
}

function getLiveStatus(runId) {
  return dashboardReportRuntime.getLiveStatus(state.liveStatusCache, runId);
}

function mergeUniqueMediaItems(primary = [], fallback = [], limit = 120) {
  const merged = [];
  const seen = new Set();
  const pushValue = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    merged.push(normalized);
  };

  for (const item of Array.isArray(primary) ? primary : []) {
    pushValue(item);
    if (merged.length >= limit) {
      return merged;
    }
  }
  for (const item of Array.isArray(fallback) ? fallback : []) {
    pushValue(item);
    if (merged.length >= limit) {
      return merged;
    }
  }

  return merged;
}

function buildLiveFallbackReport(runId, row, statusPayload) {
  const liveReport =
    statusPayload && statusPayload.live_report && typeof statusPayload.live_report === "object"
      ? statusPayload.live_report
      : {};
  const summary = liveReport.summary && typeof liveReport.summary === "object" ? liveReport.summary : {};
  const progress = statusPayload && typeof statusPayload.progress === "object" ? statusPayload.progress : null;
  const liveArtifacts =
    statusPayload && statusPayload.artifacts && typeof statusPayload.artifacts === "object" ? statusPayload.artifacts : {};
  const artifactScreenshots = Array.isArray(liveArtifacts.local_screenshots) ? liveArtifacts.local_screenshots : [];
  const artifactVideos = liveArtifacts.local_video_path ? [liveArtifacts.local_video_path] : [];
  const liveEvidenceGallery =
    liveReport.evidence_gallery && typeof liveReport.evidence_gallery === "object" ? liveReport.evidence_gallery : {};
  const evidenceGallery = {
    ...liveEvidenceGallery,
    screenshots: mergeUniqueMediaItems(liveEvidenceGallery.screenshots, artifactScreenshots),
    videos: mergeUniqueMediaItems(liveEvidenceGallery.videos, artifactVideos, 30)
  };

  return {
    schema_version: "1.1",
    run_id: String(runId || ""),
    target: liveReport.target || row?.target || "",
    status:
      String(liveReport.status || statusPayload?.report_status || row?.status || statusPayload?.queue?.queue_status || "processing")
        .trim()
        .toLowerCase(),
    delivered_at: row?.delivered_at || null,
    summary: {
      ...summary,
      note:
        summary.note ||
        (progress ? progress.message : "") ||
        "Run is still in progress."
    },
    metadata: {
      ...(liveReport.metadata && typeof liveReport.metadata === "object" ? liveReport.metadata : {}),
      goal: row?.goal || null,
      brand_persona: row?.persona || null,
      target_url: row?.target_url || null,
      brand_name: row?.brand_name || null,
      scope_mode: row?.scope_mode || null,
      scenario_list: Array.isArray(row?.scenario_list) ? row.scenario_list : []
    },
    findings: Array.isArray(liveReport.findings) ? liveReport.findings : [],
    tested_journeys: Array.isArray(liveReport.tested_journeys) ? liveReport.tested_journeys : [],
    recommendations: Array.isArray(liveReport.recommendations) ? liveReport.recommendations : [],
    evidence_gallery: evidenceGallery
  };
}

async function fetchRunStatus(runId) {
  const response = await fetch(`/api/qa/status?run_id=${encodeURIComponent(runId)}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to view run status.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load run status");
  }

  state.liveStatusCache.set(String(runId), data);
  if (state.optimisticRuns.has(String(runId))) {
    rememberPinnedRun(state.optimisticRuns.get(String(runId)));
    ensureSelectedRunVisibleInRuns();
  }
  return data;
}

async function fetchReport(runId) {
  const cached = dashboardReportRuntime.getCachedReport(state.reportCache, runId);
  if (cached) {
    return cached;
  }

  const response = await fetch(`/api/qa/report?run_id=${encodeURIComponent(runId)}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to view report details.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load report detail");
  }

  state.reportCache.set(runId, data);
  return data;
}

function renderLinkRow(links, label) {
  const safeLinks = cleanUrlList(links);
  const references = cleanReferenceList(links);

  if (!safeLinks.length && !references.length) {
    return `<p>${escapeHtml(label)}: none</p>`;
  }

  const parts = [];
  if (safeLinks.length) {
    parts.push(`${label.toLowerCase()} captured: ${safeLinks.length}`);
  }
  if (references.length) {
    parts.push(`${label.toLowerCase()} refs: ${references.length}`);
  }

  return `<p>${escapeHtml(parts.join(" | "))}</p>`;
}

function buildEvidenceAssetUrl(runId, kind, index) {
  const params = new URLSearchParams({
    run_id: String(runId || ""),
    kind: String(kind || ""),
    index: String(index)
  });

  return `/api/qa/evidence?${params.toString()}`;
}

function collectEvidenceValues(report, kind) {
  const gallery = report?.evidence_gallery && typeof report.evidence_gallery === "object" ? report.evidence_gallery : {};
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  const field = kind === "video" ? "videos" : "screenshots";
  const values = [];

  if (Array.isArray(gallery[field])) {
    values.push(...gallery[field]);
  }
  for (const finding of findings) {
    const evidence = finding && typeof finding.evidence === "object" ? finding.evidence : {};
    if (Array.isArray(evidence[field])) {
      values.push(...evidence[field]);
    }
  }
  for (const journey of journeys) {
    const evidence = journey && typeof journey.evidence === "object" ? journey.evidence : {};
    if (Array.isArray(evidence[field])) {
      values.push(...evidence[field]);
    }
  }

  return values;
}

function buildEvidenceSequence(report, kind) {
  const values = collectEvidenceValues(report, kind);
  const sequence = [];
  const seen = new Set();

  for (const rawValue of values) {
    const raw = String(rawValue || "").trim();
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    sequence.push({
      raw,
      value: toMediaCandidate(raw)
    });
  }

  return sequence;
}

function buildEvidenceView(report) {
  const runId = String(report?.run_id || "");
  const screenshotSequence = buildEvidenceSequence(report, "screenshot");
  const videoSequence = buildEvidenceSequence(report, "video");

  const screenshots = screenshotSequence
    .map((item, index) => ({ raw: item.raw, value: item.value, index }))
    .filter((item) => item.value && isLikelyImageUrl(item.value));

  const videos = videoSequence
    .map((item, index) => ({ raw: item.raw, value: item.value, index }))
    .filter((item) => item.value && isLikelyVideoUrl(item.value));

  return {
    runId,
    screenshots,
    videos,
    screenshotReferences: screenshotSequence
      .filter((item) => !item.value || !isLikelyImageUrl(item.value))
      .map((item) => item.raw),
    videoReferences: videoSequence
      .filter((item) => !item.value || !isLikelyVideoUrl(item.value))
      .map((item) => item.raw)
  };
}

function renderReplayPlayer(view, options = {}) {
  if (!view.screenshots.length) {
    return "";
  }

  const frameLimit = Math.max(4, Math.min(40, Number(options.frameLimit) || 16));
  const playerId = String(options.playerId || `replay-${toAnchorToken(view.runId || "run")}`);
  const frameItems = view.screenshots
    .filter((item) => isLikelyImageUrl(item.value))
    .slice(0, frameLimit);
  const frameSources = frameItems.map((item) => buildEvidenceAssetUrl(view.runId, "screenshot", item.index));
  const frameIndexes = frameItems.map((item) => item.index);
  if (!frameSources.length) {
    return "";
  }

  return `
    <div class="replay-player" id="${escapeHtml(playerId)}" data-player-id="${escapeHtml(
      playerId
    )}" data-frames="${escapeHtml(JSON.stringify(frameSources))}" data-frame-indexes="${escapeHtml(
      JSON.stringify(frameIndexes)
    )}">
      <img class="replay-frame" src="${escapeHtml(frameSources[0])}" alt="Session replay frame" loading="lazy" onerror="if(this.dataset.failed==='1'){return;}this.dataset.failed='1';this.style.display='none';const note=document.createElement('p');note.className='evidence-note';note.textContent='Replay frames unavailable for this run.';this.parentElement.appendChild(note);" />
      <div class="replay-controls">
        <button type="button" class="replay-toggle">Play</button>
        <input type="range" class="replay-seek" min="0" max="${frameSources.length - 1}" value="0" />
        <span class="replay-counter">1 / ${frameSources.length}</span>
      </div>
    </div>
  `;
}

function truncateText(value, maxLength = 180) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(10, maxLength - 1)).trim()}...`;
}

function resolvePersonaName(row) {
  return extractRunPersona(row) || "QA tester";
}

function getEmotionVisual(primaryEmotion) {
  const primary = String(primaryEmotion || "").trim().toLowerCase();
  if (primary === "frustration") return { emoji: "😤", label: "Frustrated" };
  if (primary === "confusion") return { emoji: "😵", label: "Confused" };
  if (primary === "uncertainty") return { emoji: "😕", label: "Unsure" };
  if (primary === "distrust") return { emoji: "🤨", label: "Distrustful" };
  if (primary === "delight") return { emoji: "😍", label: "Delighted" };
  if (primary === "confidence") return { emoji: "😎", label: "Confident" };
  if (primary === "trust") return { emoji: "🙂", label: "Trusting" };
  return { emoji: "🧐", label: "Observing" };
}

function buildFindingOpinion(finding) {
  const type = String(finding?.type || "").toLowerCase();
  const emotion = getEmotionVisual(finding?.emotional_reaction?.primary);
  const signals = Array.isArray(finding?.emotional_reaction?.signals)
    ? finding.emotional_reaction.signals.filter(Boolean)
    : [];
  const signalText = signals.length ? ` (${truncateText(signals[0], 80)})` : "";

  let quote = "I expected this step to be clear, but it was harder than it should be.";
  if (type === "dead_end") {
    quote = "I got stuck here and couldn't find the next button.";
  } else if (type === "confusion_point") {
    quote = "I wasn't sure what action to take next.";
  } else if (type === "frustration_point") {
    quote = "This interrupted my flow and felt frustrating.";
  } else if (type === "bug") {
    quote = "This looks broken from a user perspective.";
  } else if (type === "aha_moment") {
    quote = "This part finally clicked and felt clear.";
  }

  return `${emotion.emoji} ${quote}${signalText}`;
}

function buildJourneyOpinion(journey, relatedFindings = []) {
  const status = String(journey?.status || "completed").toLowerCase();
  if (status === "blocked" || status === "failed") {
    return "😤 I got stuck in this flow and could not complete it.";
  }
  if (status === "partial") {
    return "😕 I could do part of this flow, but a step felt unclear.";
  }
  const hasConfusion = relatedFindings.some((item) => {
    const type = String(item?.type || "").toLowerCase();
    return type === "confusion_point" || type === "frustration_point" || type === "dead_end";
  });
  if (hasConfusion) {
    return "🙂 I completed this flow, but there was noticeable friction.";
  }
  return "😎 This flow felt smooth and straightforward.";
}

function buildEvidenceIndexMap(report, kind) {
  const values = buildEvidenceSequence(report, kind).map((item) => item.raw);
  const map = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = String(values[index] || "").trim();
    if (key && !map.has(key)) {
      map.set(key, index);
    }
  }
  return map;
}

function resolveEvidenceDisplayUrl(report, kind, rawValue, evidenceIndexMap = null) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return "";
  }

  const candidate = toMediaCandidate(raw);
  if (candidate && (candidate.startsWith("data:") || /^https?:\/\//i.test(candidate))) {
    return candidate;
  }

  if (!isLikelyLocalMediaPath(raw)) {
    return candidate || "";
  }

  const lookup = evidenceIndexMap instanceof Map ? evidenceIndexMap : buildEvidenceIndexMap(report, kind);
  const index = lookup.get(raw);
  if (Number.isInteger(index) && index >= 0) {
    return buildEvidenceAssetUrl(report?.run_id, kind, index);
  }

  return "";
}

function renderEvidenceThumbnails(report, links, contextLabel, explanationText = "", options = {}) {
  const values = Array.isArray(links) ? links : [];
  if (!values.length) {
    return "";
  }

  const maxItems = Math.max(1, Math.min(6, Number(options?.maxItems) || 3));
  const showCaption = options?.showCaption !== false;
  const compact = options?.compact === true;
  const screenshotIndexMap = buildEvidenceIndexMap(report, "screenshot");
  const cards = [];

  for (let index = 0; index < values.length; index += 1) {
    const url = resolveEvidenceDisplayUrl(report, "screenshot", values[index], screenshotIndexMap);
    if (!url || !isLikelyImageUrl(url)) {
      continue;
    }
    const caption = truncateText(explanationText, 110) || "Captured during tester walkthrough.";
    cards.push(`
      <figure class="evidence-thumb-card ${compact ? "compact" : ""}">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(contextLabel)} screenshot ${index + 1}" loading="lazy" onerror="this.closest('.evidence-thumb-card').style.display='none'" />
        ${showCaption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
      </figure>
    `);
    if (cards.length >= maxItems) {
      break;
    }
  }

  if (!cards.length) {
    return `
      <p class="evidence-unavailable-note">
        Inline preview unavailable for this step.
      </p>
    `;
  }

  return `<div class="evidence-thumb-grid">${cards.join("")}</div>`;
}

function toAnchorToken(value, fallback = "item") {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 72);
  return token || fallback;
}

function formatFindingTypeLabel(value) {
  const type = String(value || "").trim().toLowerCase().replaceAll("_", " ");
  if (!type) {
    return "finding";
  }
  return type;
}

function findingSeverityWeight(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return 4;
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  return 1;
}

function computeFindingPriorityScore(finding) {
  const severityScore = findingSeverityWeight(finding?.severity) * 30;
  const confidenceScore = Math.round(Math.max(0, Math.min(1, Number(finding?.confidence) || 0.6)) * 30);
  const type = String(finding?.type || "").toLowerCase();
  const typeBonus = type === "dead_end" ? 28 : type === "bug" ? 22 : type === "frustration_point" ? 16 : 10;
  return Math.max(0, Math.min(100, severityScore + confidenceScore + typeBonus));
}

function sortFindingsByPriority(findings) {
  return [...(Array.isArray(findings) ? findings : [])].sort((a, b) => {
    const scoreDiff = computeFindingPriorityScore(b) - computeFindingPriorityScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const severityDiff = findingSeverityWeight(b?.severity) - findingSeverityWeight(a?.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return String(a?.title || a?.id || "").localeCompare(String(b?.title || b?.id || ""));
  });
}

function renderTesterVoice(personaName, opinionText, moodLabel = "") {
  const safePersona = String(personaName || "QA tester").trim() || "QA tester";
  const mood = String(moodLabel || "").trim();
  return `
    <div class="tester-voice">
      <span class="tester-voice-avatar">${renderPersonaAvatar(safePersona)}</span>
      <div class="tester-voice-copy">
        <p class="tester-voice-meta">${escapeHtml(safePersona)}${mood ? ` · ${escapeHtml(mood)}` : ""}</p>
        <blockquote>${escapeHtml(opinionText)}</blockquote>
      </div>
    </div>
  `;
}

function getRunTimestamp(value) {
  const raw = value && typeof value === "object" ? value.delivered_at : value;
  const timestamp = Date.parse(String(raw || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function findNewerRunForSelection(row, report) {
  const safeRow = row && typeof row === "object" ? row : {};
  const safeReport = report && typeof report === "object" ? report : {};
  const currentRunId = String(safeReport.run_id || safeRow.run_id || "").trim();
  const brandKey = normalizeBrandFilterValue(safeRow.brand_key || state.filters.brand);
  const currentTimestamp = getRunTimestamp(safeReport.delivered_at || safeRow.delivered_at);
  if (!currentRunId || !brandKey || !currentTimestamp) {
    return null;
  }

  return state.allRuns
    .filter((candidate) => {
      if (!candidate || candidate.run_id === currentRunId) {
        return false;
      }
      if (normalizeBrandFilterValue(candidate.brand_key) !== brandKey) {
        return false;
      }
      return getRunTimestamp(candidate.delivered_at) > currentTimestamp;
    })
    .sort((a, b) => getRunTimestamp(b.delivered_at) - getRunTimestamp(a.delivered_at))[0] || null;
}

function renderHistoricalRunBanner(newerRun) {
  if (!newerRun) {
    return "";
  }

  const openUrl = buildDashboardRunUrl(newerRun.run_id, newerRun);
  const status = formatStatusLabel(getCanonicalRunStatus(null, newerRun, getLiveStatus(newerRun.run_id)) || "run");
  return `
    <div class="detail-history-banner">
      <div class="detail-history-copy">
        <strong>Historical run</strong>
        <span>A newer ${escapeHtml(status)} run is available from ${escapeHtml(formatRelativeTime(newerRun.delivered_at))}.</span>
      </div>
      ${openUrl ? `<a href="${escapeHtml(openUrl)}">Open latest run</a>` : ""}
    </div>
  `;
}

function renderSelectedHeader(report, row) {
  const sessionUrl = toExternalUrl(row.session_url);
  const shareUrl = buildReportShareUrl(report?.run_id || row?.run_id, row);
  const mission = resolveRunMission(row, report);
  const personaName = mission.persona || resolvePersonaName(row);
  const newerRun = findNewerRunForSelection(row, report);
  const quickLinks = [
    sessionUrl ? '<span class="inline-pill">Replay available</span>' : "",
    shareUrl ? `<a href="${escapeHtml(shareUrl)}" target="_blank" rel="noreferrer">Open share URL</a>` : "",
    shareUrl
      ? `<button type="button" class="share-link-button" data-share-url="${escapeHtml(shareUrl)}">Copy share URL</button>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  return `
    ${renderHistoricalRunBanner(newerRun)}
    <h2>${escapeHtml(report.target || row.target || row.run_id)}</h2>
    <div class="detail-meta">
      <span>run_id: ${escapeHtml(report.run_id)}</span>
      <span>status: ${escapeHtml(report.status)}</span>
      <span>brand: ${escapeHtml(row.brand_key || "n/a")}</span>
      <span>delivered: ${escapeHtml(formatDate(report.delivered_at))}</span>
    </div>
    ${renderPrimaryGoalCard(mission.goal, personaName, { className: "detail-goal-card" })}
    <p>${escapeHtml(redactVendorText(report.summary?.note || "No summary note available."))}</p>
    ${renderTesterVoice(personaName, "🧭 I explored this flow like a real user and captured where things felt smooth or frustrating.")}
    ${quickLinks ? `<div class="detail-link-strip">${quickLinks}</div>` : ""}
  `;
}

function renderLiveWatch(runId, row) {
  const statusPayload = getLiveStatus(runId);
  if (!statusPayload || !statusPayload.queue) {
    return "";
  }

  const queueStatus = String(statusPayload.queue.queue_status || statusPayload.queue.status || "").toLowerCase();
  if (!isQueueActiveStatus(queueStatus)) {
    return "";
  }

  const progress = statusPayload.progress && typeof statusPayload.progress === "object" ? statusPayload.progress : null;
  const runLog = Array.isArray(statusPayload.run_log) ? statusPayload.run_log.slice(-8) : [];
  const liveReport = statusPayload.live_report && typeof statusPayload.live_report === "object" ? statusPayload.live_report : null;
  const liveArtifacts = statusPayload.artifacts && typeof statusPayload.artifacts === "object" ? statusPayload.artifacts : null;
  const liveScreenshots = Array.isArray(liveArtifacts?.local_screenshots) ? liveArtifacts.local_screenshots : [];
  const findingsCount = Array.isArray(liveReport?.findings) ? liveReport.findings.length : 0;
  const journeysCount = Array.isArray(liveReport?.tested_journeys) ? liveReport.tested_journeys.length : 0;
  const latestScreenshotIndex = liveScreenshots.length ? liveScreenshots.length - 1 : -1;
  const latestScreenshotUrl =
    latestScreenshotIndex >= 0
      ? `${buildEvidenceAssetUrl(runId, "screenshot", latestScreenshotIndex)}&live_tick=${encodeURIComponent(
          progress?.updated_at || Date.now()
        )}`
      : "";
  const previewMarkup = latestScreenshotUrl
    ? `
      <a class="live-preview" href="${escapeHtml(latestScreenshotUrl)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(latestScreenshotUrl)}" alt="Live browser preview" loading="lazy" />
        <small>Live browser preview · frame ${escapeHtml(String(latestScreenshotIndex + 1))}</small>
      </a>
    `
    : "<p>Capturing first browser frame...</p>";

  const eventsMarkup = runLog.length
    ? renderLiveActivityItems(runLog.slice().reverse(), row, { compact: true })
    : "<p>Waiting for first worker event...</p>";

  return `
    <div class="section-block">
      <h3>Live Watch</h3>
      <p>
        Queue status: <strong>${escapeHtml(queueStatus || "processing")}</strong>
        ${progress ? ` · ${escapeHtml(String(progress.percent ?? 0))}%` : ""}
      </p>
      <p>${escapeHtml(progress?.message || "QA worker is still exploring the product.")}</p>
      ${previewMarkup}
      <p>Draft findings: ${escapeHtml(String(findingsCount))} · Draft journeys: ${escapeHtml(String(journeysCount))}</p>
      ${eventsMarkup}
    </div>
  `;
}

function renderCounts(report) {
  const counts = report.summary?.counts || {};
  const coverage = report.summary?.coverage && typeof report.summary.coverage === "object" ? report.summary.coverage : {};
  const findingCount = Array.isArray(report.findings) ? report.findings.length : 0;
  const journeyCount = Array.isArray(report.tested_journeys) ? report.tested_journeys.length : 0;
  const pagesVisited = Math.max(0, Number(coverage.pages_visited) || 0);
  const riskScore = Number(report.summary?.risk_score) || 0;
  const riskBand = riskScore >= 70 ? "High" : riskScore >= 40 ? "Medium" : "Low";
  return `
    <div class="key-grid" id="section-metrics">
      <div class="key-card" title="Distinct product issues discovered during this run.">
        <strong>${escapeHtml(findingCount)}</strong>
        <span>Findings</span>
      </div>
      <div class="key-card" title="User journeys that were exercised end-to-end or partially.">
        <strong>${escapeHtml(journeyCount)}</strong>
        <span>Journeys</span>
      </div>
      <div class="key-card" title="Unique product pages or surfaces visited during this run.">
        <strong>${escapeHtml(pagesVisited)}</strong>
        <span>Pages Visited</span>
      </div>
      <div class="key-card" title="Estimated user risk for this run based on severity and journey impact.">
        <strong>${escapeHtml(riskScore)}</strong>
        <span>Risk Score · ${escapeHtml(riskBand)}</span>
      </div>
    </div>
    <div class="badges">
      <span class="badge">bugs ${escapeHtml(counts.bug || 0)}</span>
      <span class="badge">friction ${escapeHtml(counts.frustration_point || 0)}</span>
      <span class="badge">confusion ${escapeHtml(counts.confusion_point || 0)}</span>
      <span class="badge">dead_end ${escapeHtml(counts.dead_end || 0)}</span>
      <span class="badge">performance ${escapeHtml(counts.performance_issue || 0)}</span>
      <span class="badge">a11y ${escapeHtml(counts.accessibility_issue || 0)}</span>
      <span class="badge">copy ${escapeHtml(counts.copy_issue || 0)}</span>
    </div>
  `;
}

function renderQuickJumpNav() {
  return `
    <nav class="report-quick-nav" aria-label="Report sections">
      <a href="#section-priority">Top fixes</a>
      <a href="#section-replay">Replay</a>
      <a href="#section-findings">Findings</a>
      <a href="#section-journeys">Journeys</a>
    </nav>
  `;
}

function renderPrioritySummary(report) {
  const findings = sortFindingsByPriority(Array.isArray(report.findings) ? report.findings : []);
  const topFindings = findings.slice(0, 3);
  if (!topFindings.length) {
    return `
      <div class="section-block" id="section-priority">
        <h3>What To Fix First</h3>
        <p>No high-risk blockers were detected in this run.</p>
      </div>
    `;
  }

  return `
    <div class="section-block section-priority" id="section-priority">
      <h3>What To Fix First</h3>
      <ol class="priority-list">
        ${topFindings
          .map((finding) => {
            const anchor = `finding-${toAnchorToken(finding?.id || finding?.title || "finding")}`;
            const score = computeFindingPriorityScore(finding);
            return `
              <li>
                <a href="#${escapeHtml(anchor)}">${escapeHtml(finding.title || finding.id || "Untitled finding")}</a>
                <span>Priority ${escapeHtml(score)}/100 · ${escapeHtml(String(finding.severity || "medium").toUpperCase())} · ${escapeHtml(
                  formatFindingTypeLabel(finding.type)
                )}</span>
              </li>
            `;
          })
          .join("")}
      </ol>
    </div>
  `;
}

function findFirstEvidenceIndex(values, indexMap) {
  if (!(indexMap instanceof Map) || !Array.isArray(values)) {
    return -1;
  }
  for (const value of values) {
    const key = String(value || "").trim();
    if (!key) {
      continue;
    }
    const index = indexMap.get(key);
    if (Number.isInteger(index) && index >= 0) {
      return index;
    }
  }
  return -1;
}

function buildReplayFindingMarkers(report, options = {}) {
  const findings = sortFindingsByPriority(Array.isArray(report.findings) ? report.findings : []);
  const screenshotIndexMap = buildEvidenceIndexMap(report, "screenshot");
  const allowedIndexes = options.allowedIndexes instanceof Set ? options.allowedIndexes : null;
  const framePositionLookup = options.framePositionLookup instanceof Map ? options.framePositionLookup : null;
  const markers = [];

  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const evidenceScreenshots =
      finding && finding.evidence && Array.isArray(finding.evidence.screenshots) ? finding.evidence.screenshots : [];
    const frameIndex = findFirstEvidenceIndex(evidenceScreenshots, screenshotIndexMap);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      continue;
    }
    if (allowedIndexes && !allowedIndexes.has(frameIndex)) {
      continue;
    }

    markers.push({
      id: `finding-${toAnchorToken(finding?.id || finding?.title || `finding-${index + 1}`)}`,
      title: String(finding?.title || finding?.id || `Finding ${index + 1}`),
      severity: String(finding?.severity || "medium").toUpperCase(),
      score: computeFindingPriorityScore(finding),
      frameIndex,
      framePosition: framePositionLookup && framePositionLookup.has(frameIndex) ? framePositionLookup.get(frameIndex) : null
    });
  }

  return markers;
}

function renderReplayReview(report, playerId) {
  const view = buildEvidenceView(report);
  if (!view.screenshots.length) {
    return "";
  }

  const safePlayerId = String(playerId || `replay-${toAnchorToken(report?.run_id || "run")}`);
  const frameItems = view.screenshots.filter((item) => isLikelyImageUrl(item.value)).slice(0, 24);
  const allowedIndexes = new Set(frameItems.map((item) => item.index));
  const framePositionLookup = new Map();
  for (let idx = 0; idx < frameItems.length; idx += 1) {
    framePositionLookup.set(frameItems[idx].index, idx);
  }
  const markers = buildReplayFindingMarkers(report, { allowedIndexes, framePositionLookup }).slice(0, 12);
  const markersMarkup = markers.length
    ? `
      <ol class="replay-marker-list">
        ${markers
          .map(
            (marker) => `
              <li>
                <button type="button" data-replay-target="${escapeHtml(safePlayerId)}" data-frame-index="${escapeHtml(
                  marker.frameIndex
                )}">
                  <strong>${escapeHtml(marker.title)}</strong>
                  <span>${escapeHtml(marker.severity)} · Priority ${escapeHtml(marker.score)}/100 · Moment ${escapeHtml(
                    Number.isInteger(marker.framePosition) ? marker.framePosition + 1 : 1
                  )}</span>
                </button>
                <a href="#${escapeHtml(marker.id)}">Open finding</a>
              </li>
            `
          )
          .join("")}
      </ol>
    `
    : "<p class=\"evidence-note\">No finding-linked replay markers available for this run.</p>";

  return `
    <div class="section-block replay-review" id="section-replay">
      <h3>Replay Review</h3>
      <p>Jump to exact captured moments linked to findings.</p>
      <div class="replay-review-layout">
        <div class="replay-review-player">
          ${renderReplayPlayer(view, { playerId: safePlayerId, frameLimit: 24 })}
        </div>
        <aside class="replay-review-markers">
          <h4>Finding Markers</h4>
          ${markersMarkup}
        </aside>
      </div>
    </div>
  `;
}

function renderJourneys(report, row = {}) {
  const journeys = Array.isArray(report.tested_journeys) ? report.tested_journeys : [];
  if (!journeys.length) {
    return `<div class="section-block" id="section-journeys"><h3>Tested Journeys</h3><p>No journeys recorded.</p></div>`;
  }

  const personaName = resolvePersonaName(row);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  return `
    <div class="section-block" id="section-journeys">
      <h3>Tested Journeys</h3>
      ${journeys
        .map(
          (journey) => {
            const satisfaction = computeJourneySatisfactionScore(report, journey);
            const journeyStatus = String(journey?.status || "completed").toLowerCase();
            const journeyId = String(journey?.id || journey?.journey_id || journey?.journeyId || "").toLowerCase();
            const relatedFindings = findings.filter((finding) => {
              const findingJourneyId = String(finding?.journey_id || finding?.journeyId || finding?.journey || "").toLowerCase();
              return journeyId && findingJourneyId && findingJourneyId.includes(journeyId);
            });
            const voice = buildJourneyOpinion(journey, relatedFindings);
            const shouldShowVoice = journeyStatus !== "completed" || relatedFindings.length > 0;
            const anchorId = `journey-${toAnchorToken(journey.name || journey.id || journeyId || "journey")}`;
            const screenshotMarkup = renderEvidenceThumbnails(
              report,
              journey?.evidence?.screenshots || [],
              journey?.name || journey?.id || "Journey",
              journey?.summary || ""
            );
            return `
              <article id="${escapeHtml(anchorId)}">
                <h4>${escapeHtml(journey.name || journey.id || "Journey")}</h4>
                <p>Status: ${escapeHtml(journey.status || "completed")} · Satisfaction: ${escapeHtml(
                  String(satisfaction)
                )}/100</p>
                <p>${escapeHtml(redactVendorText(journey.summary || ""))}</p>
                ${shouldShowVoice ? renderTesterVoice(personaName, voice) : ""}
                ${screenshotMarkup}
                <ul>${(journey.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
                ${renderLinkRow(journey.evidence?.screenshots || [], "Screenshot")}
                ${renderLinkRow(journey.evidence?.videos || [], "Video")}
              </article>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function renderFindings(report, row = {}, replayPlayerId = "") {
  const findings = sortFindingsByPriority(Array.isArray(report.findings) ? report.findings : []);
  if (!findings.length) {
    return `<div class="section-block" id="section-findings"><h3>Findings</h3><p>No findings were recorded in this run.</p></div>`;
  }

  const personaName = resolvePersonaName(row);
  const screenshotIndexMap = buildEvidenceIndexMap(report, "screenshot");
  return `
    <div class="section-block" id="section-findings">
      <h3>Findings</h3>
      ${findings
        .map(
          (finding, findingIndex) => {
            const emotion = getEmotionVisual(finding?.emotional_reaction?.primary);
            const typeVisual = getFindingTypeVisual(finding?.type);
            const opinion = buildFindingOpinion(finding);
            const priorityScore = computeFindingPriorityScore(finding);
            const recommendation = deriveFindingRecommendation(report, finding, findingIndex);
            const findingAnchorId = `finding-${toAnchorToken(finding?.id || finding?.title || `finding-${findingIndex + 1}`)}`;
            const findingFrameIndex = findFirstEvidenceIndex(finding?.evidence?.screenshots || [], screenshotIndexMap);
            const jumpButtonMarkup =
              replayPlayerId && Number.isInteger(findingFrameIndex) && findingFrameIndex >= 0
                ? `<button type="button" class="finding-jump-button" data-replay-target="${escapeHtml(
                    replayPlayerId
                  )}" data-frame-index="${escapeHtml(findingFrameIndex)}">Jump To Replay Frame ${escapeHtml(
                    findingFrameIndex + 1
                  )}</button>`
                : "";
            const screenshotMarkup = renderEvidenceThumbnails(
              report,
              finding?.evidence?.screenshots || [],
              finding?.title || finding?.id || "Finding",
              finding?.observed_behavior || finding?.title || ""
            );
            return `
              <details class="finding-card" id="${escapeHtml(findingAnchorId)}" open>
                <summary>
                  <span class="finding-summary-title">
                    <span class="finding-type-chip ${escapeHtml(typeVisual.toneClass)}" aria-hidden="true">${escapeHtml(typeVisual.icon)}</span>
                    <span>${escapeHtml(finding.title || finding.id)}</span>
                  </span>
                  <span class="finding-summary-meta">
                    ${escapeHtml(typeVisual.label)} · Priority ${escapeHtml(priorityScore)}/100 · ${escapeHtml(String(finding.severity || "medium").toUpperCase())}
                  </span>
                </summary>
                <div class="finding-card-body">
                  ${jumpButtonMarkup}
                  ${renderTesterVoice(personaName, opinion, `${emotion.emoji} ${emotion.label}`)}
                  <div class="finding-section">
                    <span class="finding-section-label">Description</span>
                    <p><strong>Expected:</strong> ${escapeHtml(finding.expected_behavior)}</p>
                    <p><strong>Observed:</strong> ${escapeHtml(redactVendorText(finding.observed_behavior))}</p>
                  </div>
                  <div class="finding-section finding-section-recommendation">
                    <div class="finding-section-head">
                      <span class="finding-section-label">Recommendation</span>
                      ${renderLlmCopyButtons("finding", { findingIndex })}
                    </div>
                    <p>${escapeHtml(recommendation)}</p>
                  </div>
                  <div class="finding-section">
                    <span class="finding-section-label">Evidence</span>
                    ${screenshotMarkup}
                    ${renderLinkRow(finding.evidence?.screenshots || [], "Screenshot")}
                    ${renderLinkRow(finding.evidence?.videos || [], "Video")}
                  </div>
                  <div class="finding-section finding-section-meta">
                    <span class="finding-section-label">Confidence</span>
                    <p>Emotion: ${escapeHtml(finding.emotional_reaction?.primary)} (${escapeHtml(
                      finding.emotional_reaction?.intensity
                    )}/5) · Confidence: ${escapeHtml(finding.confidence)}</p>
                  </div>
                </div>
              </details>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function renderFeatureInventory(report) {
  const inventory = report && typeof report.feature_inventory === "object" ? report.feature_inventory : null;
  if (!inventory) {
    return "";
  }

  const discovered = Number(inventory.discovered_count) || 0;
  const attempted = Number(inventory.attempted_count) || 0;
  const visited = Number(inventory.visited_count) || 0;
  const blocked = Number(inventory.blocked_count) || 0;
  const visitedFeatures = Array.isArray(inventory.visited_features) ? inventory.visited_features.slice(0, 10) : [];
  const blockedFeatures = Array.isArray(inventory.blocked_features) ? inventory.blocked_features.slice(0, 10) : [];

  const visitedMarkup = visitedFeatures.length
    ? `<ul>${visitedFeatures
        .map((feature) => {
          const label = feature?.label || feature?.url || "Feature";
          const interactions = Number(feature?.interactions) || 0;
          const url = toExternalUrl(feature?.url);
          if (url) {
            return `<li>${escapeHtml(label)} (${escapeHtml(String(interactions))} interactions) · <a href="${escapeHtml(
              url
            )}" target="_blank" rel="noreferrer">open</a></li>`;
          }
          return `<li>${escapeHtml(label)} (${escapeHtml(String(interactions))} interactions)</li>`;
        })
        .join("")}</ul>`
    : "<p>No feature surfaces visited.</p>";

  const blockedMarkup = blockedFeatures.length
    ? `<ul>${blockedFeatures
        .map((feature) => `<li>${escapeHtml(feature?.label || "Feature")} · ${escapeHtml(feature?.reason || "blocked")}</li>`)
        .join("")}</ul>`
    : "<p>No blocked feature candidates.</p>";

  return `
    <div class="section-block">
      <h3>Feature Coverage</h3>
      <p>Discovered: ${escapeHtml(String(discovered))} · Attempted: ${escapeHtml(String(attempted))} · Visited: ${escapeHtml(
        String(visited)
      )} · Blocked: ${escapeHtml(String(blocked))}</p>
      <h4>Visited Features</h4>
      ${visitedMarkup}
      <h4>Blocked Features</h4>
      ${blockedMarkup}
    </div>
  `;
}

function formatRelativeTime(value) {
  const parsed = new Date(value || "");
  const diffMs = Date.now() - parsed.getTime();
  if (Number.isNaN(parsed.getTime()) || diffMs < 0) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatElapsedSince(value) {
  const parsed = new Date(value || "");
  const diffMs = Date.now() - parsed.getTime();
  if (Number.isNaN(parsed.getTime()) || diffMs <= 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function formatEtaDuration(secondsValue) {
  const seconds = Math.max(0, Math.round(Number(secondsValue) || 0));
  if (!seconds) {
    return "starting soon";
  }
  if (seconds < 60) {
    return `~${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const minsRemainder = mins % 60;
    return minsRemainder ? `~${hours}h ${minsRemainder}m` : `~${hours}h`;
  }
  if (rem < 15) {
    return `~${mins}m`;
  }
  return `~${mins}m ${String(rem).padStart(2, "0")}s`;
}

function formatDurationBetween(startValue, endValue) {
  const startedAt = new Date(startValue || "");
  const endedAt = new Date(endValue || "");
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return "";
  }

  const diffMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    const remSeconds = diffSeconds % 60;
    return remSeconds ? `${diffMinutes}m ${String(remSeconds).padStart(2, "0")}s` : `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return remMinutes ? `${diffHours}h ${remMinutes}m` : `${diffHours}h`;
}

function getRunLogEntries(liveStatus) {
  return Array.isArray(liveStatus?.run_log) ? liveStatus.run_log : [];
}

function getLatestRunLogEvent(liveStatus, eventName) {
  const targetEvent = String(eventName || "").trim();
  if (!targetEvent) {
    return null;
  }
  const entries = getRunLogEntries(liveStatus);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (String(entries[index]?.event || "").trim() === targetEvent) {
      return entries[index];
    }
  }
  return null;
}

function hasRunLogEvent(liveStatus, eventName) {
  return Boolean(getLatestRunLogEvent(liveStatus, eventName));
}

function humanizeFailureCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "LOGIN_TRIGGER_NOT_FOUND") {
    return "No login or sign-up entry point was found.";
  }
  if (normalized === "OTP_GATE_NOT_FOUND") {
    return "OTP verification could not be reached.";
  }
  if (normalized === "AUTH_MODAL_NOT_FOUND") {
    return "Authentication modal could not be opened.";
  }
  return normalized
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function extractRunFailureContext(report, liveStatus) {
  const safeReport = report && typeof report === "object" ? report : {};
  const metadata = safeReport.metadata && typeof safeReport.metadata === "object" ? safeReport.metadata : {};
  const failureEvent = getLatestRunLogEvent(liveStatus, "run_failed");
  const errorCode = String(failureEvent?.data?.error || metadata.failure_code || "").trim();
  const classification = String(failureEvent?.data?.classification || metadata.classification || "").trim();
  const excerpt = String(metadata.raw_agent_output_excerpt || "").trim();
  const summaryNote = String(safeReport.summary?.note || "").trim();

  let headline = humanizeFailureCode(errorCode);
  let detail = "";

  if (errorCode === "LOGIN_TRIGGER_NOT_FOUND") {
    detail =
      "The worker reached the landing page, dismissed overlays, and still could not find a visible path into login or sign-up.";
  } else if (excerpt && /no visible login\/sign up trigger found/i.test(excerpt)) {
    headline = "No login or sign-up entry point was found.";
    detail =
      "The worker reached the landing page but no visible authentication trigger was exposed strongly enough to continue.";
  } else if (summaryNote && /run_failed_pre_submit/i.test(summaryNote)) {
    headline = headline || "Run ended before signup or login could begin.";
    detail = detail || "The worker could not enter the target authenticated flow from the public landing experience.";
  }

  if (!headline) {
    headline = "Run ended before the requested flow could complete.";
  }
  if (!detail) {
    detail = excerpt || summaryNote || "The worker stopped before it could validate the target flow end to end.";
  }

  return {
    errorCode,
    classification,
    excerpt,
    headline,
    detail
  };
}

function buildLivePhaseItems(liveStatus, report, row) {
  const queueStatus = String(
    liveStatus?.queue?.queue_status || liveStatus?.queue?.status || row?.queue_status || row?.status || ""
  ).toLowerCase();
  const reportStatus = normalizeRunStatus(report?.status || liveStatus?.report_status || row?.status);
  const artifacts = liveStatus && liveStatus.artifacts && typeof liveStatus.artifacts === "object" ? liveStatus.artifacts : null;
  const screenshotCount = Array.isArray(artifacts?.local_screenshots) ? artifacts.local_screenshots.length : 0;
  const findingsCount = Array.isArray(report?.findings) ? report.findings.length : 0;
  const wasClaimed = Boolean(
    liveStatus?.queue?.started_at || hasRunLogEvent(liveStatus, "run_started") || hasRunLogEvent(liveStatus, "browser_context_ready")
  );
  const isProcessing = queueStatus === "processing";
  const isQueued = queueStatus === "queued" || queueStatus === "retryable";
  const isTerminal = !isQueueActiveStatus(queueStatus) && Boolean(reportStatus);

  return [
    { label: "Queued", state: isQueued ? "active" : "complete" },
    { label: "Worker pickup", state: wasClaimed ? "complete" : "pending" },
    { label: "Exploring site", state: isProcessing ? "active" : wasClaimed && (screenshotCount > 0 || isTerminal) ? "complete" : "pending" },
    { label: "First evidence", state: screenshotCount > 0 ? "complete" : isProcessing && wasClaimed ? "active" : "pending" },
    {
      label: reportStatus === "failed" ? "Failed" : reportStatus === "completed" ? "Completed" : reportStatus === "partial" ? "Partial" : "Verdict",
      state: reportStatus === "failed" ? "failed" : isTerminal ? "complete" : findingsCount > 0 ? "active" : "pending"
    }
  ];
}

function renderLivePhaseList(phases) {
  const safePhases = Array.isArray(phases) ? phases : [];
  if (!safePhases.length) {
    return "";
  }

  return `
    <div class="app-live-phase-list" aria-label="Run phases">
      ${safePhases
        .map((phase) => {
          const state = String(phase?.state || "pending").toLowerCase();
          const className =
            state === "complete"
              ? "is-complete"
              : state === "active"
                ? "is-active"
                : state === "failed"
                  ? "is-failed"
                  : "";
          return `<span class="app-live-phase ${className}">${escapeHtml(String(phase?.label || "Phase"))}</span>`;
        })
        .join("")}
    </div>
  `;
}

function buildLiveTerminalSummary(report, liveStatus, row) {
  const status = normalizeRunStatus(report?.status || liveStatus?.report_status || row?.status || "completed") || "completed";
  const failure = extractRunFailureContext(report, liveStatus);
  const startedAt =
    liveStatus?.queue?.started_at ||
    getLatestRunLogEvent(liveStatus, "local_runner_started")?.ts ||
    getLatestRunLogEvent(liveStatus, "run_started")?.ts ||
    null;
  const completedAt =
    liveStatus?.queue?.completed_at ||
    row?.delivered_at ||
    report?.delivered_at ||
    getLatestRunLogEvent(liveStatus, "local_runner_finished")?.ts ||
    null;

  return {
    status,
    durationLabel: startedAt && completedAt ? formatDurationBetween(startedAt, completedAt) : "",
    headline:
      status === "failed"
        ? failure.headline
        : status === "partial"
          ? "Run ended with partial coverage."
          : "Run completed.",
    detail:
      status === "failed"
        ? failure.detail
        : status === "partial"
          ? "Some journey evidence was captured, but the run ended before full validation completed."
          : String(report?.summary?.note || "The worker completed this run and the final report is ready."),
    failure
  };
}

function buildQueueExperience(liveStatus, row = null) {
  const queue = liveStatus && typeof liveStatus.queue === "object" ? liveStatus.queue : {};
  const queueStatus = String(queue.queue_status || queue.status || "").toLowerCase();
  const queueAhead = Number(queue.queue_ahead);
  const processingAhead = Number(queue.processing_ahead);
  const estimatedStartSeconds = Number(queue.estimated_start_seconds);
  const enqueuedAt = queue.enqueued_at || row?.delivered_at || null;
  const queueAgeLabel = enqueuedAt ? formatElapsedSince(enqueuedAt) : "just now";
  const queueAheadSafe = Number.isFinite(queueAhead) ? Math.max(0, queueAhead) : null;
  const processingAheadSafe = Number.isFinite(processingAhead) ? Math.max(0, processingAhead) : null;
  const etaLabel =
    Number.isFinite(estimatedStartSeconds) && estimatedStartSeconds > 0
      ? formatEtaDuration(estimatedStartSeconds)
      : "starting soon";

  let headline = "Agents are starting up.";
  let detail = "Live browser frames, findings, and persona reactions will appear as soon as the worker begins exploring.";

  if (queueStatus === "queued" || queueStatus === "retryable") {
    headline = "Waiting for the next worker slot.";
    if (queueAheadSafe === 0) {
      detail = "This run is next in line. It will start automatically as soon as the active worker frees up.";
    } else if (queueAheadSafe > 0) {
      detail = `${queueAheadSafe} run${queueAheadSafe === 1 ? "" : "s"} ahead in queue. This run will start automatically when earlier work clears.`;
    } else {
      detail = "This run is queued and will start automatically when a worker slot opens.";
    }
  } else if (queueStatus === "processing") {
    headline = "Run is now exploring the product.";
    detail = "The browser agent is live. The stream, findings, and persona thoughts will populate as coverage expands.";
  }

  return {
    queueStatus,
    queueAgeLabel,
    queueAhead: queueAheadSafe,
    processingAhead: processingAheadSafe,
    estimatedStartSeconds: Number.isFinite(estimatedStartSeconds) ? Math.max(0, estimatedStartSeconds) : null,
    etaLabel,
    headline,
    detail
  };
}

function normalizeSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low") {
    return severity;
  }
  return "low";
}

function toConfidencePercent(value, fallback = 68) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100);
}

function formatStatusLabel(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (!status) {
    return "unknown";
  }
  return status.replaceAll("_", " ");
}

function normalizeRunStatus(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (!status) {
    return "";
  }
  if (status === "queued_vision") {
    return "queued";
  }
  if (status === "retryable_vision") {
    return "retryable";
  }
  if (status === "failed_validation") {
    return "failed";
  }
  return status;
}

function getCanonicalRunStatus(report, row, liveStatus) {
  const queueStatus = normalizeRunStatus(liveStatus?.queue?.queue_status || liveStatus?.queue?.status);
  if (isQueueActiveStatus(queueStatus)) {
    return queueStatus;
  }

  const candidates = [
    report?.status,
    liveStatus?.report_status,
    liveStatus?.live_report?.status,
    row?.latest_report_status,
    row?.status,
    row?.queue_status
  ];

  for (const candidate of candidates) {
    const normalized = normalizeRunStatus(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function isIncompleteCoverageStatus(statusValue) {
  const status = normalizeRunStatus(statusValue);
  return status === "failed" || status === "partial";
}

function buildCoverageSnapshot(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  const coverage = report?.summary && typeof report.summary.coverage === "object" ? report.summary.coverage : {};
  const pagesVisited = Math.max(0, Number(coverage.pages_visited) || 0);
  const completedJourneys = journeys.filter((journey) => normalizeRunStatus(journey?.status) === "completed").length;
  const partialJourneys = journeys.filter((journey) => normalizeRunStatus(journey?.status) === "partial").length;
  const attemptedJourneys = journeys.length || Math.max(0, Number(coverage.flows_tested) || 0);

  return {
    findingsCount: findings.length,
    pagesVisited,
    attemptedJourneys,
    completedJourneys,
    partialJourneys
  };
}

function normalizeEnvironment(value) {
  const env = String(value || "").trim().toLowerCase();
  if (env === "staging" || env === "preview" || env === "local") {
    return env;
  }
  return "production";
}

function getActiveEnvironment() {
  return normalizeEnvironment(state.filters.env || elements.environmentSwitcher?.value || "production");
}

function getEnvironmentLabel(env) {
  const value = normalizeEnvironment(env);
  if (value === "staging") return "Staging";
  if (value === "preview") return "Preview";
  if (value === "local") return "Local";
  return "Production";
}

function isReleaseReadinessEnvironment(env) {
  return normalizeEnvironment(env) !== "production";
}

function getFindingJourneyLabel(finding) {
  const candidates = [finding?.journey, finding?.journey_id, finding?.journeyId, finding?.flow, finding?.flow_id, finding?.flowId];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) {
      return value;
    }
  }
  return "General flow";
}

function computeRiskSnapshot(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];

  const criticalCount = findings.filter((finding) => normalizeSeverity(finding?.severity) === "critical").length;
  const majorCount = findings.filter((finding) => {
    const severity = normalizeSeverity(finding?.severity);
    return severity === "high" || severity === "medium";
  }).length;

  const brokenJourneys = journeys.filter((journey) => {
    const status = String(journey?.status || "").toLowerCase();
    return status === "blocked" || status === "failed";
  }).length;

  const satisfactionValues = journeys.map((journey) => computeJourneySatisfactionScore(report, journey)).filter(Number.isFinite);
  const avgSatisfaction = satisfactionValues.length
    ? Math.round(satisfactionValues.reduce((sum, value) => sum + value, 0) / satisfactionValues.length)
    : String(report?.status || "").toLowerCase() === "completed"
      ? 82
      : 56;

  const confidenceValues = findings.map((finding) => toConfidencePercent(finding?.confidence)).filter(Number.isFinite);
  const confidence = confidenceValues.length
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : 64;

  return {
    criticalCount,
    majorCount,
    brokenJourneys,
    avgSatisfaction,
    confidence
  };
}

function deriveDashboardMode(report, row, liveStatus) {
  const status = getCanonicalRunStatus(report, row, liveStatus);
  if (isQueueActiveStatus(status)) {
    return "running";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "completed";
  }
  if (!row?.run_id) {
    return "no_runs";
  }
  return "completed";
}

function deriveRiskVerdict(mode, snapshot, report = null, liveStatus = null) {
  if (mode === "failed") return "failed";
  if (mode === "partial") return "partial";
  if (mode === "running") {
    const queueStatus = normalizeRunStatus(liveStatus?.queue?.queue_status || liveStatus?.queue?.status);
    const findingsCount = Array.isArray(report?.findings) ? report.findings.length : 0;
    const journeysCount = Array.isArray(report?.tested_journeys) ? report.tested_journeys.length : 0;
    if (queueStatus === "queued" || queueStatus === "retryable") {
      return "monitoring";
    }
    if (!findingsCount && !journeysCount && snapshot.criticalCount === 0 && snapshot.majorCount === 0) {
      return "monitoring";
    }
    if (snapshot.criticalCount > 0) return "blocked";
    if (snapshot.majorCount >= 2 || snapshot.avgSatisfaction < 68) return "risky";
    return "monitoring";
  }
  if (snapshot.criticalCount > 0 || snapshot.brokenJourneys >= 2) return "blocked";
  if (snapshot.majorCount >= 3 || snapshot.avgSatisfaction < 70) return "risky";
  return "healthy";
}

function buildVerdictMeta(verdict, environment = "production") {
  const normalized = String(verdict || "").toLowerCase();
  const releaseLens = isReleaseReadinessEnvironment(environment);
  if (normalized === "blocked") {
    return { label: releaseLens ? "BLOCKED" : "CRITICAL ISSUE", severityClass: "severity-critical" };
  }
  if (normalized === "risky") {
    return { label: releaseLens ? "RISKY" : "FRICTION DETECTED", severityClass: "severity-high" };
  }
  if (normalized === "failed") {
    return { label: releaseLens ? "FAILED" : "RUN FAILED", severityClass: "severity-critical" };
  }
  if (normalized === "partial") {
    return { label: "PARTIAL", severityClass: "severity-medium" };
  }
  if (normalized === "monitoring") {
    return { label: releaseLens ? "IN PROGRESS" : "MONITORING", severityClass: "severity-medium" };
  }
  return { label: releaseLens ? "READY" : "STABLE", severityClass: "severity-low" };
}

function buildLiveVerdictMeta(queueStatus) {
  const normalized = String(queueStatus || "").toLowerCase();
  if (normalized === "queued") {
    return { label: "QUEUED", severityClass: "severity-medium" };
  }
  if (normalized === "retryable") {
    return { label: "RETRYING", severityClass: "severity-medium" };
  }
  if (normalized === "processing") {
    return { label: "RUNNING", severityClass: "severity-medium" };
  }
  return { label: "MONITORING", severityClass: "severity-medium" };
}

function buildRiskSummaryMessage(mode, verdict, snapshot, environment = "production") {
  const releaseLens = isReleaseReadinessEnvironment(environment);
  if (mode === "no_runs") {
    return releaseLens
      ? "Run your first test to assess release readiness."
      : "Run your first test to assess production health.";
  }
  if (mode === "failed") {
    return releaseLens
      ? "Run execution failed before coverage completed. Retry before making release decisions. Any journey data below is incomplete coverage only."
      : "Run execution failed before coverage completed. Retry before trusting environment health. Any journey data below is incomplete coverage only.";
  }
  if (mode === "partial") {
    return "Partial coverage only. Findings below are directional until a full run completes.";
  }
  if (mode === "running") {
    return `${snapshot.criticalCount} critical signal${snapshot.criticalCount === 1 ? "" : "s"} detected so far. Final verdict may shift as agent coverage increases.`;
  }
  if (verdict === "blocked") {
    return releaseLens
      ? `${snapshot.criticalCount} critical blocker${snapshot.criticalCount === 1 ? "" : "s"} and ${snapshot.brokenJourneys} broken journey${snapshot.brokenJourneys === 1 ? "" : "s"} require fixes before release.`
      : `${snapshot.criticalCount} critical issue${snapshot.criticalCount === 1 ? "" : "s"} impacting ${snapshot.brokenJourneys} journey${snapshot.brokenJourneys === 1 ? "" : "s"} in production.`;
  }
  if (verdict === "risky") {
    return releaseLens
      ? "Release has notable friction. Fix top blockers before shipping."
      : "Friction detected across key flows. Prioritize top issues to protect production UX.";
  }
  return releaseLens ? "No high-risk blockers detected in this run." : "Environment looks stable. No high-risk blockers detected.";
}

function buildRunningSummaryMessage(liveStatus, row, snapshot) {
  const queueExperience = buildQueueExperience(liveStatus, row);
  if (queueExperience.queueStatus === "queued" || queueExperience.queueStatus === "retryable") {
    const etaCopy =
      queueExperience.estimatedStartSeconds && queueExperience.estimatedStartSeconds > 0
        ? `Estimated start ${queueExperience.etaLabel}.`
        : "Start time updates as soon as queue depth is known.";
    return `${queueExperience.headline} ${queueExperience.detail} ${etaCopy}`.trim();
  }
  const screenshotCount = Array.isArray(liveStatus?.artifacts?.local_screenshots) ? liveStatus.artifacts.local_screenshots.length : 0;
  if (screenshotCount > 0) {
    return `Worker is live. ${screenshotCount} browser frame${screenshotCount === 1 ? "" : "s"} captured so far while the agent explores the site.`;
  }
  if (snapshot.criticalCount > 0) {
    return `${snapshot.criticalCount} critical signal${snapshot.criticalCount === 1 ? "" : "s"} detected so far. Final verdict may shift as coverage expands.`;
  }
  return "Run is live. Findings, persona reactions, and browser frames will appear as soon as the first exploration steps complete.";
}

function buildHeroMetricModel(mode, report, snapshot, liveStatus = null, row = null) {
  if (mode === "running") {
    const queueExperience = buildQueueExperience(liveStatus, row);
    const queueStatus = queueExperience.queueStatus;
    const pagesVisited = buildCoverageSnapshot(report).pagesVisited;
    if (queueStatus === "queued" || queueStatus === "retryable") {
      return [
        { label: "Queue Status", value: queueStatus === "retryable" ? "Retrying" : "Queued" },
        { label: "Runs Ahead", value: queueExperience.queueAhead === null ? "—" : String(queueExperience.queueAhead) },
        { label: "Queue Age", value: queueExperience.queueAgeLabel },
        { label: "Est. Start", value: queueExperience.etaLabel }
      ];
    }

    const findingsCount = Array.isArray(report?.findings) ? report.findings.length : 0;
    const journeysCount = Array.isArray(report?.tested_journeys) ? report.tested_journeys.length : 0;
    return [
      { label: "Critical Signals", value: String(snapshot.criticalCount) },
      { label: "Draft Findings", value: String(findingsCount) },
      { label: "Journeys Started", value: String(journeysCount) },
      { label: "Pages Visited", value: String(pagesVisited) }
    ];
  }

  const coverage = buildCoverageSnapshot(report);
  if (mode === "failed") {
    return [
      { label: "Critical Findings", value: String(snapshot.criticalCount) },
      { label: "Findings Captured", value: String(coverage.findingsCount) },
      { label: "Journeys Attempted", value: String(coverage.attemptedJourneys) },
      { label: "Pages Visited", value: String(coverage.pagesVisited) }
    ];
  }

  if (mode === "partial") {
    const coveredJourneys = coverage.completedJourneys + coverage.partialJourneys;
    const coverageValue = coverage.attemptedJourneys ? `${coveredJourneys}/${coverage.attemptedJourneys}` : "0/0";
    return [
      { label: "Critical Findings", value: String(snapshot.criticalCount) },
      { label: "Major Findings", value: String(snapshot.majorCount) },
      { label: "Journeys Covered", value: coverageValue },
      { label: "Avg Satisfaction", value: `${snapshot.avgSatisfaction}/100` }
    ];
  }

  return [
    { label: "Critical", value: String(snapshot.criticalCount) },
    { label: "Major", value: String(snapshot.majorCount) },
    { label: "Journeys Impacted", value: String(snapshot.brokenJourneys) },
    { label: "Avg Satisfaction", value: `${snapshot.avgSatisfaction}/100` }
  ];
}

function renderTopFixes(report, row, mode = "completed") {
  const findings = sortFindingsByPriority(Array.isArray(report?.findings) ? report.findings : []);
  if (!findings.length) {
    let note = report?.summary?.note || "No major friction was detected.";
    if (mode === "failed") {
      note = "Run failed before blocker extraction completed. Retry this run before treating the absence of findings as a clean result.";
    } else if (mode === "partial") {
      note = "This run only captured partial coverage. Retry to confirm blockers and gaps with a full pass.";
    }
    return `
      <div class="app-empty">
        <p>${escapeHtml(mode === "failed" ? "No validated blockers were captured." : "No blockers were identified for this run.")}</p>
        <small>${escapeHtml(redactVendorText(note))}</small>
      </div>
    `;
  }

  const shareBaseUrl = buildReportShareUrl(report?.run_id || row?.run_id, row);
  const screenshotIndexMap = buildEvidenceIndexMap(report, "screenshot");
  const cards = findings
    .slice(0, 5)
    .map((finding, index) => {
      const title = finding?.title || finding?.observed_behavior || finding?.id || `Finding ${index + 1}`;
      const severity = normalizeSeverity(finding?.severity);
      const confidencePct = toConfidencePercent(finding?.confidence);
      const findingAnchorId = `finding-${toAnchorToken(finding?.id || finding?.title || `finding-${index + 1}`)}`;
      const findingUrl = shareBaseUrl ? `${shareBaseUrl}#${findingAnchorId}` : "";
      const journeyLabel = getFindingJourneyLabel(finding);
      const opinion = buildFindingOpinion(finding);
      const screenshotMarkup = renderEvidenceThumbnails(
        report,
        finding?.evidence?.screenshots || [],
        finding?.title || "Finding",
        finding?.observed_behavior || finding?.title || "",
        { maxItems: 1, showCaption: false, compact: true }
      );
      const replayFrame = findFirstEvidenceIndex(finding?.evidence?.screenshots || [], screenshotIndexMap);
      const hasScreenshot = Boolean(String(screenshotMarkup || "").trim());
      const priorityScore = computeFindingPriorityScore(finding);

      return `
        <article class="app-top-fix-item">
          <header>
            <div class="app-top-fix-title">
              <span class="app-top-fix-rank">${escapeHtml(String(index + 1))}</span>
              <strong>${escapeHtml(title)}</strong>
            </div>
            <span class="issue-severity ${escapeHtml(`severity-${severity}`)}">${escapeHtml(severity.toUpperCase())}</span>
          </header>
          <p class="app-top-fix-meta">
            Priority ${escapeHtml(String(priorityScore))}/100 · ${escapeHtml(journeyLabel)} · Confidence ${escapeHtml(String(confidencePct))}%
            ${Number.isInteger(replayFrame) && replayFrame >= 0 ? ` · Replay frame ${escapeHtml(String(replayFrame + 1))}` : ""}
          </p>
          <p class="app-top-fix-quote">${escapeHtml(opinion)}</p>
          <div class="app-top-fix-actions">
            ${hasScreenshot ? `<span class="app-inline-pill">Screenshot</span>` : ""}
            ${Number.isInteger(replayFrame) && replayFrame >= 0 ? `<span class="app-inline-pill">Replay ${escapeHtml(String(replayFrame + 1))}</span>` : ""}
            ${findingUrl ? `<a href="${escapeHtml(findingUrl)}" target="_blank" rel="noreferrer">Open Finding</a>` : ""}
            ${findingUrl ? `<button type="button" class="share-link-button" data-share-url="${escapeHtml(findingUrl)}">Copy Link</button>` : ""}
          </div>
          ${screenshotMarkup}
        </article>
      `;
    })
    .join("");

  if (mode === "failed" || mode === "partial") {
    return `
      <div class="app-empty">
        <p>These findings came from an incomplete run.</p>
        <small>Use them as directional evidence, then rerun to confirm.</small>
      </div>
      ${cards}
    `;
  }

  return cards;
}

function renderPersonaSignals(report, row, mode = "completed") {
  const findings = sortFindingsByPriority(Array.isArray(report?.findings) ? report.findings : []);
  const personaName = resolvePersonaName(row);
  if (!findings.length) {
    let message = "Signals from tester personas will appear after findings are captured.";
    if (mode === "failed") {
      message = "No persona signals were captured before the run failed.";
    } else if (mode === "partial") {
      message = "Persona signals are limited because this run ended with partial coverage.";
    }
    return `
      <div class="app-empty">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  return findings
    .slice(0, 4)
    .map((finding) => {
      const emotion = getEmotionVisual(finding?.emotional_reaction?.primary);
      const quote = buildFindingOpinion(finding).replace(/^(\S+\s)/, "");
      return `
        <article class="persona-signal-item">
          <span class="persona-signal-avatar">${renderPersonaAvatar(personaName)}</span>
          <div class="persona-signal-copy">
            <p class="persona-signal-meta">${escapeHtml(`${emotion.emoji} ${personaName}`)}</p>
            <blockquote>${escapeHtml(truncateText(quote, 120))}</blockquote>
          </div>
        </article>
      `;
    })
    .join("");
}

function severityPenalty(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return 28;
  if (normalized === "high") return 16;
  if (normalized === "medium") return 9;
  return 4;
}

function computeJourneyStatusProgress(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return 100;
  if (normalized === "partial") return 65;
  if (normalized === "blocked" || normalized === "failed") return 25;
  return 45;
}

function computeJourneySatisfactionScore(report, journey) {
  const status = String(journey?.status || "completed").toLowerCase();
  let score = status === "completed" ? 88 : status === "partial" ? 62 : status === "blocked" || status === "failed" ? 32 : 58;

  const journeyTokens = [
    journey?.id,
    journey?.journey_id,
    journey?.journeyId,
    journey?.name,
    journey?.flow,
    journey?.flow_id,
    journey?.flowId
  ]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const journeyPages = Array.isArray(journey?.pages)
    ? journey.pages.map((page) => String(page || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];

  for (const finding of findings) {
    const safeFinding = finding && typeof finding === "object" ? finding : {};
    const findingTokens = [
      safeFinding.journey_id,
      safeFinding.journeyId,
      safeFinding.journey,
      safeFinding.flow_id,
      safeFinding.flowId,
      safeFinding.flow
    ]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    const findingPage = String(safeFinding.page || safeFinding.route || "").trim().toLowerCase();
    const hasTokenMatch =
      Boolean(journeyTokens.length) &&
      findingTokens.some((token) => journeyTokens.some((journeyToken) => token.includes(journeyToken)));
    const hasPageMatch =
      Boolean(findingPage) &&
      journeyPages.some(
        (journeyPage) => findingPage.includes(journeyPage) || journeyPage.includes(findingPage)
      );

    if (!hasTokenMatch && !hasPageMatch) {
      continue;
    }

    score -= severityPenalty(safeFinding.severity);
    const findingType = String(safeFinding.type || "").toLowerCase();
    if (findingType === "dead_end") score -= 8;
    if (findingType === "frustration_point" || findingType === "confusion_point") score -= 5;
  }

  const summary = String(journey?.summary || "").toLowerCase();
  if (/smooth|clear|easy|successful|completed/.test(summary)) score += 4;
  if (/blocked|unable|failed|error|friction/.test(summary)) score -= 8;

  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function renderCoverageAttemptTable(report) {
  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  if (!journeys.length) {
    return '<div class="app-empty"><p>No coverage details were captured before the run ended.</p></div>';
  }

  const rows = journeys.slice(0, 8).map((journey) => {
    const status = normalizeRunStatus(journey?.status) || "blocked";
    let label = "Attempted";
    let severityClass = "severity-medium";
    if (status === "completed") {
      label = "Completed";
      severityClass = "severity-low";
    } else if (status === "partial") {
      label = "Partial";
      severityClass = "severity-medium";
    } else if (status === "blocked" || status === "failed") {
      label = "Not completed";
      severityClass = "severity-critical";
    }

    return `
      <div class="coverage-attempt-row">
        <span class="journey-name">${escapeHtml(journey?.name || journey?.id || "Journey")}</span>
        <span class="issue-severity ${escapeHtml(severityClass)}">${escapeHtml(label)}</span>
        <span>${escapeHtml(journey?.summary || "No additional details captured.")}</span>
      </div>
    `;
  });

  return `
    <div class="coverage-attempt-table">
      <div class="coverage-attempt-head">
        <span>Journey</span>
        <span>Coverage</span>
        <span>Observed before failure</span>
      </div>
      ${rows.join("")}
    </div>
  `;
}

function renderAppProgress(report, liveStatus, mode = "completed") {
  const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
  const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
  if (isQueueActiveStatus(queueStatus) && progress) {
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    return `
      <div class="app-progress-row">
        <div class="journey-health-live">
          <span>${escapeHtml(progress.message || "Processing run")}</span>
          <strong>${escapeHtml(String(percent))}%</strong>
          <div class="app-progress-track"><span style="width:${percent}%"></span></div>
        </div>
      </div>
    `;
  }

  const journeys = Array.isArray(report.tested_journeys) ? report.tested_journeys : [];
  if (!journeys.length) {
    return '<div class="app-empty"><p>No journey data captured yet.</p></div>';
  }

  if (mode === "failed") {
    return renderCoverageAttemptTable(report);
  }

  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const rows = journeys.slice(0, 8).map((journey) => {
    const journeyStatus = String(journey?.status || "completed").toLowerCase();
    const satisfaction = computeJourneySatisfactionScore(report, journey);
    const journeyName = journey.name || journey.id || "Journey";
    const journeyTokens = [
      journey?.id,
      journey?.journey_id,
      journey?.journeyId,
      journey?.name,
      journey?.flow,
      journey?.flow_id,
      journey?.flowId
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const issueCount = findings.filter((finding) => {
      const findingTokens = [finding?.journey_id, finding?.journeyId, finding?.journey, finding?.flow_id, finding?.flowId, finding?.flow]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      return findingTokens.some((token) => journeyTokens.some((journeyToken) => token.includes(journeyToken)));
    }).length;

    let healthLabel = "Healthy";
    let healthClass = "severity-low";
    if (journeyStatus === "blocked" || journeyStatus === "failed" || satisfaction < 45) {
      healthLabel = "Degraded";
      healthClass = "severity-critical";
    } else if (satisfaction < 75 || issueCount > 1 || journeyStatus === "partial") {
      healthLabel = "Risky";
      healthClass = "severity-medium";
    }
    const trendArrow = satisfaction >= 80 ? "↑" : satisfaction >= 60 ? "→" : "↓";
    return {
      journeyName,
      issueCount,
      satisfaction,
      healthLabel,
      healthClass,
      trendArrow
    };
  });

  return `
    <div class="journey-health-table">
      <div class="journey-health-head">
        <span>Journey</span>
        <span>Status</span>
        <span>Score</span>
        <span>Issues</span>
        <span>Trend</span>
      </div>
      ${rows
        .map(
          (row) => `
            <div class="journey-health-row">
              <span class="journey-name">${escapeHtml(row.journeyName)}</span>
              <span class="issue-severity ${escapeHtml(row.healthClass)}">${escapeHtml(row.healthLabel)}</span>
              <strong>${escapeHtml(String(row.satisfaction))}</strong>
              <span>${escapeHtml(String(row.issueCount))} issue${row.issueCount === 1 ? "" : "s"}</span>
              <span class="journey-trend">${escapeHtml(row.trendArrow)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function applyDashboardShareAction(report, row) {
  if (!elements.dashboardShareAction) {
    return;
  }

  const shareUrl = buildReportShareUrl(report?.run_id || row?.run_id, row);
  if (!shareUrl) {
    elements.dashboardShareAction.hidden = true;
    elements.dashboardShareAction.removeAttribute("data-share-url");
    return;
  }

  elements.dashboardShareAction.hidden = false;
  elements.dashboardShareAction.setAttribute("data-share-url", shareUrl);
  elements.dashboardShareAction.setAttribute("data-label", "Copy report link");
  elements.dashboardShareAction.setAttribute("aria-label", "Copy report link");
  elements.dashboardShareAction.setAttribute("title", "Copy report link");
}

function renderAppEvidencePanel(report, row) {
  const markup = renderAppEvidence(report, row);
  if (!elements.appEvidencePanel) {
    return;
  }

  elements.appEvidencePanel.innerHTML = markup;
  elements.appEvidencePanel.hidden = !String(markup || "").trim();
  attachShareButtons(elements.appDashboardRoot || document);
}

function renderAppEvidence(report, row) {
  return "";
}

function renderLiveIncomingFindings(report, row, liveStatus) {
  try {
    const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
    const terminalStatus = normalizeRunStatus(report?.status || liveStatus?.report_status || row?.status);
    if (queueStatus === "queued" || queueStatus === "retryable") {
      const queueExperience = buildQueueExperience(liveStatus, row);
      return `
        <div class="app-empty">
          <p>Findings will appear after exploration starts.</p>
          <small>${escapeHtml(queueExperience.detail)}</small>
        </div>
      `;
    }

    const liveReport = liveStatus && liveStatus.live_report && typeof liveStatus.live_report === "object" ? liveStatus.live_report : null;
    const findings = sortFindingsByPriority(Array.isArray(liveReport?.findings) ? liveReport.findings : report?.findings || []);
    if (!findings.length) {
      if (!isQueueActiveStatus(queueStatus) && terminalStatus === "failed") {
        const failure = extractRunFailureContext(report, liveStatus);
        return `
          <div class="app-empty">
            <p>No validated findings were captured before the run failed.</p>
            <small>${escapeHtml(`${failure.headline} ${failure.detail}`)}</small>
          </div>
        `;
      }
      if (!isQueueActiveStatus(queueStatus) && terminalStatus === "completed") {
        return '<div class="app-empty"><p>No findings were captured in this run.</p><small>The run completed without validated blockers.</small></div>';
      }
      return '<div class="app-empty"><p>No incoming findings yet.</p><small>Agents are still exploring flows.</small></div>';
    }

    return findings
      .slice(0, 6)
      .map((finding) => {
        const severity = normalizeSeverity(finding?.severity);
        const title = finding?.title || finding?.observed_behavior || finding?.id || "Untitled finding";
        const confidencePct = toConfidencePercent(finding?.confidence);
        return `
          <article class="app-issue-item">
            <span class="issue-severity ${escapeHtml(`severity-${severity}`)}">${escapeHtml(severity.toUpperCase())}</span>
            <div class="issue-copy">
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(getFindingJourneyLabel(finding))} · confidence ${escapeHtml(String(confidencePct))}% · ${escapeHtml(
                formatRelativeTime(row?.delivered_at)
              )}</span>
            </div>
          </article>
        `;
      })
      .join("");
  } catch {
    return '<div class="app-empty"><p>Findings will appear after the run starts collecting signals.</p></div>';
  }
}

function toSentenceCase(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function humanizeRunLogEventName(eventName) {
  return toSentenceCase(String(eventName || "progress").replaceAll("_", " "));
}

function describeLiveRunLogEntry(entry, row) {
  const eventName = String(entry?.event || "progress").trim();
  const data = entry?.data && typeof entry.data === "object" ? entry.data : {};
  const timestamp = formatRelativeTime(entry?.ts || row?.delivered_at);

  if (eventName === "vision_only_step_decision") {
    const step = Number(data.step);
    const action = toSentenceCase(String(data.action || "act").replaceAll("_", " "));
    const target = String(data.target || "").trim();
    const reason = String(data.reason || "").trim();
    return {
      tag: Number.isFinite(step) && step > 0 ? `Step ${step}` : "Thinking",
      title: target ? `${action}: ${target}` : action,
      detail: reason || "Planner selected the next action.",
      timestamp
    };
  }

  if (eventName === "agent_click_coordinate_fallback_started") {
    const describe = String(data.describe || data.target || "").trim();
    const localizationOrder = Array.isArray(data.localization_order)
      ? data.localization_order.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const orderLabel = localizationOrder.length ? localizationOrder.join(" -> ") : "ocr -> nano-banana";
    return {
      tag: "Locating",
      title: describe ? `Finding: ${describe}` : "Finding target from pixels",
      detail: `Using ${orderLabel} to place the click.`,
      timestamp
    };
  }

  if (eventName === "agent_click_coordinate_fallback_succeeded") {
    const describe = String(data.describe || data.target || "").trim();
    const strategy = String(data.strategy || "").trim();
    const judgeReason = String(data.metadata?.judge_reason || "").trim();
    const resolvedBy = strategy === "ocr_qwen" ? "OCR" : strategy ? strategy.replaceAll("_", " ") : "pixel localization";
    return {
      tag: "Action",
      title: describe ? `Clicked: ${describe}` : "Click executed",
      detail: judgeReason || `Resolved by ${resolvedBy}.`,
      timestamp
    };
  }

  if (eventName === "vision_only_step_failed") {
    const step = Number(data.step);
    const target = String(data.target || "").trim();
    const action = toSentenceCase(String(data.action || "act").replaceAll("_", " "));
    const message = String(data.message || data.reason || "").trim();
    return {
      tag: Number.isFinite(step) && step > 0 ? `Step ${step}` : "Blocked",
      title: target ? `${action} failed: ${target}` : `${action} failed`,
      detail: message || "The planner could not complete that action.",
      timestamp
    };
  }

  if (eventName === "inline_screenshot_captured") {
    const count = String(data.screenshot_count || "").trim();
    const label = String(data.label || "").trim();
    return {
      tag: "Capture",
      title: count ? `Browser frame ${count}` : "Browser frame captured",
      detail: label ? label.replaceAll("_", " ") : "Updated visual state from the current screen.",
      timestamp
    };
  }

  if (eventName === "browser_context_ready") {
    return {
      tag: "Browser",
      title: "Browser context ready",
      detail: "The live browser is open and ready for the first action.",
      timestamp
    };
  }

  if (eventName === "stagehand_page_primed") {
    const url = String(data.url || "").trim();
    return {
      tag: "Page",
      title: "Page primed",
      detail: url || "The target page is loaded and ready for planning.",
      timestamp
    };
  }

  if (eventName === "run_failed") {
    const detail = humanizeFailureCode(data?.error) || String(data?.classification || "").replaceAll("_", " ");
    return {
      tag: "Failure",
      title: "Run failed",
      detail: detail || "The worker exited before completing the run.",
      timestamp
    };
  }

  const fallbackDetail =
    String(data?.message || data?.reason || data?.classification || data?.status || "")
      .trim()
      .replaceAll("_", " ") || "";
  return {
    tag: "Event",
    title: humanizeRunLogEventName(eventName),
    detail: fallbackDetail || "Worker event recorded.",
    timestamp
  };
}

function renderLiveActivityItems(runLog, row, options = {}) {
  const items = Array.isArray(runLog) ? runLog : [];
  const compact = options.compact === true;
  if (!items.length) {
    return '<div class="app-empty"><p>Waiting for agent activity events.</p></div>';
  }

  return `
    <div class="app-activity-list ${compact ? "is-compact" : ""}">
      ${items
        .map((entry) => {
          const item = describeLiveRunLogEntry(entry, row);
          return `
            <article class="app-activity-item">
              <div class="app-activity-top">
                <span class="app-activity-tag">${escapeHtml(item.tag)}</span>
                <small>${escapeHtml(item.timestamp)}</small>
              </div>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLiveActivityFeed(liveStatus, row) {
  const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || "").toLowerCase();
  if (queueStatus === "queued" || queueStatus === "retryable") {
    const queueExperience = buildQueueExperience(liveStatus, row);
    return `
      <div class="app-empty">
        <p>${escapeHtml(queueExperience.queueAhead === 0 ? "Next in line." : "Waiting in queue.")}</p>
        <small>${escapeHtml(`Queued ${queueExperience.queueAgeLabel} ago · Estimated start ${queueExperience.etaLabel}`)}</small>
      </div>
    `;
  }

  const runLog = Array.isArray(liveStatus?.run_log) ? liveStatus.run_log.slice(-12).reverse() : [];
  return renderLiveActivityItems(runLog, row);
}

function isViewOnlyNoVncUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return true;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.searchParams.get("view_only") !== "0";
  } catch {
    return !/view_only=0\b/i.test(raw);
  }
}

function renderLiveBrowserFrameSlot(latestScreenshotUrl, latestScreenshotIndex) {
  if (!latestScreenshotUrl) {
    return `
      <div class="app-live-browser-frame-slot" data-live-browser-preview-slot="true">
        <div class="app-empty">
          <p>Capturing browser frame...</p>
          <small>The latest in-product frame will appear here even if the desktop stream goes idle.</small>
        </div>
      </div>
    `;
  }

  return `
    <div class="app-live-browser-frame-slot" data-live-browser-preview-slot="true">
      <a
        class="live-preview app-live-browser-preview"
        data-live-browser-preview-link="true"
        href="${escapeHtml(latestScreenshotUrl)}"
        target="_blank"
        rel="noreferrer"
      >
        <img
          data-live-browser-preview-image="true"
          src="${escapeHtml(latestScreenshotUrl)}"
          alt="Latest browser frame"
          loading="eager"
        />
        <small data-live-browser-preview-caption="true">Latest browser frame · ${escapeHtml(String(latestScreenshotIndex + 1))}</small>
      </a>
    </div>
  `;
}

function renderLiveStream(runId, liveStatus, report = null, row = null) {
  const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || row?.queue_status || row?.status || "").toLowerCase();
  if (!isQueueActiveStatus(queueStatus) && !isLiveViewMode()) {
    return '<div class="app-empty"><p>Live stream appears while a run is processing.</p></div>';
  }

  const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
  const liveArtifacts = liveStatus && typeof liveStatus.artifacts === "object" ? liveStatus.artifacts : null;
  const liveScreenshots = Array.isArray(liveArtifacts?.local_screenshots) ? liveArtifacts.local_screenshots : [];
  const liveSessionEmbedUrl = String(liveArtifacts?.live_stream_embed_url || "").trim();
  const liveSessionViewerUrl = String(liveArtifacts?.live_stream_viewer_url || liveSessionEmbedUrl || "").trim();
  const liveSessionViewerIsViewOnly = isViewOnlyNoVncUrl(liveSessionViewerUrl);
  const latestScreenshotIndex = liveScreenshots.length ? liveScreenshots.length - 1 : -1;
  const latestScreenshotUrl =
    latestScreenshotIndex >= 0
      ? `${buildEvidenceAssetUrl(runId, "screenshot", latestScreenshotIndex)}&live_tick=${encodeURIComponent(
          progress?.updated_at || Date.now()
        )}`
      : "";
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const queueExperience = buildQueueExperience(liveStatus);
  const phasesMarkup = renderLivePhaseList(buildLivePhaseItems(liveStatus, report, row));
  const browserFrameSlotMarkup = renderLiveBrowserFrameSlot(latestScreenshotUrl, latestScreenshotIndex);
  const liveVisualMarkup = liveSessionEmbedUrl
    ? `
        <div class="app-live-visual-grid">
          <div class="app-live-session">
            <div class="app-live-session-head">
              <strong>Actual browser session</strong>
              <div class="app-live-session-actions">
                ${
                  liveSessionViewerUrl
                    ? `<a class="btn" href="${escapeHtml(liveSessionViewerUrl)}" target="_blank" rel="noreferrer">${
                        liveSessionViewerIsViewOnly ? "Open live browser" : "Take control"
                      }</a>`
                    : ""
                }
              </div>
            </div>
            <div class="app-live-session-shell">
              <iframe
                class="app-live-session-frame"
                src="${escapeHtml(liveSessionEmbedUrl)}"
                title="Live browser session"
                loading="eager"
                allow="clipboard-read; clipboard-write; fullscreen"
                referrerpolicy="no-referrer"
              ></iframe>
            </div>
            <p class="app-live-session-note">${
              liveSessionViewerUrl
                ? escapeHtml(
                    liveSessionViewerIsViewOnly
                      ? "View-only desktop stream. Open it in a dedicated tab for a larger watch surface."
                      : "View-only panel here, interactive browser in the separate tab."
                  )
                : "Desktop stream is live."
            }</p>
          </div>
          <div class="app-live-browser-frame">
            <div class="app-live-session-head">
              <strong>Latest browser frame</strong>
              <span class="app-live-session-caption">Updates from the product surface even if the desktop stream goes idle.</span>
            </div>
            ${browserFrameSlotMarkup}
          </div>
        </div>
      `
    : latestScreenshotUrl
      ? `<a class="live-preview" href="${escapeHtml(latestScreenshotUrl)}" target="_blank" rel="noreferrer">
          <img src="${escapeHtml(latestScreenshotUrl)}" alt="Live browser preview" loading="lazy" />
          <small>Live frame ${escapeHtml(String(latestScreenshotIndex + 1))}</small>
        </a>`
      : '<div class="app-empty"><p>Capturing first browser frame...</p></div>';

  if (queueStatus === "queued" || queueStatus === "retryable") {
    return `
      <div class="app-live-queue-state">
        <div class="app-live-queue-head">
          <span class="app-live-state-pill">${escapeHtml(queueStatus === "retryable" ? "Retrying queue" : "Queued for start")}</span>
          <span class="app-live-eta">${escapeHtml(`Estimated start ${queueExperience.etaLabel}`)}</span>
        </div>
        <div class="app-live-queue-body">
          <div class="app-live-queue-spinner" aria-hidden="true"></div>
          <div class="app-live-queue-copy">
            <h4>${escapeHtml(queueExperience.headline)}</h4>
            <p>${escapeHtml(queueExperience.detail)}</p>
          </div>
        </div>
        <div class="app-live-queue-stats">
          <div class="app-live-queue-stat">
            <span>Queue Age</span>
            <strong>${escapeHtml(queueExperience.queueAgeLabel)}</strong>
          </div>
          <div class="app-live-queue-stat">
            <span>Runs Ahead</span>
            <strong>${escapeHtml(queueExperience.queueAhead === null ? "—" : String(queueExperience.queueAhead))}</strong>
          </div>
          <div class="app-live-queue-stat">
            <span>Worker Slots Busy</span>
            <strong>${escapeHtml(queueExperience.processingAhead === null ? "—" : String(queueExperience.processingAhead))}</strong>
          </div>
        </div>
        ${phasesMarkup}
      </div>
    `;
  }

  if (!isQueueActiveStatus(queueStatus)) {
    const terminal = buildLiveTerminalSummary(report, liveStatus, row);
    return `
      <div class="app-live-terminal-card">
        <div class="app-live-queue-head">
          <span class="app-live-state-pill ${escapeHtml(terminal.status === "failed" ? "is-danger" : "is-success")}">${escapeHtml(
            terminal.status === "failed" ? "Run failed" : terminal.status === "partial" ? "Partial run" : "Run completed"
          )}</span>
          <span class="app-live-eta">${escapeHtml(terminal.durationLabel ? `Finished in ${terminal.durationLabel}` : "Run finished")}</span>
        </div>
        <div class="app-live-terminal-copy">
          <h4>${escapeHtml(terminal.headline)}</h4>
          <p>${escapeHtml(terminal.detail)}</p>
          ${
            terminal.failure.errorCode || terminal.failure.classification
              ? `<small>${escapeHtml(
                  [
                    terminal.failure.errorCode ? `Code: ${terminal.failure.errorCode}` : "",
                    terminal.failure.classification ? `Classified as ${terminal.failure.classification}` : ""
                  ]
                    .filter(Boolean)
                    .join(" · ")
                )}</small>`
              : ""
          }
        </div>
        ${phasesMarkup}
        ${
          latestScreenshotUrl
            ? `<a class="live-preview" href="${escapeHtml(latestScreenshotUrl)}" target="_blank" rel="noreferrer">
                <img src="${escapeHtml(latestScreenshotUrl)}" alt="Final browser capture" loading="lazy" />
                <small>Final browser capture</small>
              </a>`
            : '<div class="app-empty"><p>No browser frame was captured before the run ended.</p></div>'
        }
      </div>
    `;
  }

  return `
      <div class="app-live-stream-card">
        <div class="app-live-queue-head">
          <span class="app-live-state-pill is-info">Worker exploring</span>
          <span class="app-live-eta">${escapeHtml(`${String(percent)}% complete`)}</span>
        </div>
      <p class="app-live-stream-meta">${escapeHtml(progress?.message || "QA worker is exploring the product right now.")}</p>
      ${phasesMarkup}
      ${liveVisualMarkup}
    </div>
  `;
}

function updateLiveStreamPanel(runId, liveStatus, report, row, showLiveMission) {
  if (!elements.liveStreamPanel) {
    return;
  }

  if (!showLiveMission) {
    elements.liveStreamPanel.innerHTML = '<div class="app-empty"><p>Live stream appears while a run is processing.</p></div>';
    return;
  }

  const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || row?.queue_status || row?.status || "").toLowerCase();
  const liveArtifacts = liveStatus && typeof liveStatus.artifacts === "object" ? liveStatus.artifacts : null;
  const liveSessionEmbedUrl = String(liveArtifacts?.live_stream_embed_url || "").trim();
  const liveSessionViewerUrl = String(liveArtifacts?.live_stream_viewer_url || liveSessionEmbedUrl || "").trim();
  const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
  const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  const liveScreenshots = Array.isArray(liveArtifacts?.local_screenshots) ? liveArtifacts.local_screenshots : [];
  const latestScreenshotIndex = liveScreenshots.length ? liveScreenshots.length - 1 : -1;
  const latestScreenshotUrl =
    latestScreenshotIndex >= 0
      ? `${buildEvidenceAssetUrl(runId, "screenshot", latestScreenshotIndex)}&live_tick=${encodeURIComponent(
          progress?.updated_at || Date.now()
        )}`
      : "";
  const liveSessionViewerIsViewOnly = isViewOnlyNoVncUrl(liveSessionViewerUrl);
  const nextPhasesMarkup = renderLivePhaseList(buildLivePhaseItems(liveStatus, report, row));
  const currentFrame = elements.liveStreamPanel.querySelector(".app-live-session-frame");
  const currentSrc = String(currentFrame?.getAttribute("src") || "").trim();
  const shouldPreserveFrame = Boolean(
    currentFrame &&
      queueStatus === "processing" &&
      liveSessionEmbedUrl &&
      currentSrc &&
      currentSrc === liveSessionEmbedUrl
  );

  if (!shouldPreserveFrame) {
    elements.liveStreamPanel.innerHTML = renderLiveStream(runId, liveStatus, report, row);
    return;
  }

  const etaNode = elements.liveStreamPanel.querySelector(".app-live-eta");
  if (etaNode) {
    etaNode.textContent = `${String(percent)}% complete`;
  }

  const metaNode = elements.liveStreamPanel.querySelector(".app-live-stream-meta");
  if (metaNode) {
    metaNode.textContent = progress?.message || "QA worker is exploring the product right now.";
  }

  const phaseList = elements.liveStreamPanel.querySelector(".app-live-phase-list");
  if (phaseList && nextPhasesMarkup) {
    phaseList.outerHTML = nextPhasesMarkup;
  }

  const viewerLink = elements.liveStreamPanel.querySelector(".app-live-session-head a");
  if (viewerLink && liveSessionViewerUrl) {
    viewerLink.setAttribute("href", liveSessionViewerUrl);
    viewerLink.textContent = liveSessionViewerIsViewOnly ? "Open live browser" : "Take control";
  }

  const sessionNote = elements.liveStreamPanel.querySelector(".app-live-session-note");
  if (sessionNote) {
    sessionNote.textContent = liveSessionViewerUrl
      ? liveSessionViewerIsViewOnly
        ? "View-only desktop stream. Open it in a dedicated tab for a larger watch surface."
        : "View-only panel here, interactive browser in the separate tab."
      : "Desktop stream is live.";
  }

  const previewSlot = elements.liveStreamPanel.querySelector("[data-live-browser-preview-slot='true']");
  if (previewSlot) {
    previewSlot.outerHTML = renderLiveBrowserFrameSlot(latestScreenshotUrl, latestScreenshotIndex);
  }
}

function estimateRunSatisfaction(row, statusOverride = "") {
  const risk = Number(row?.risk_score);
  if (Number.isFinite(risk)) {
    return Math.max(0, Math.min(100, Math.round(100 - risk)));
  }
  const status = normalizeRunStatus(statusOverride || row?.latest_report_status || row?.status);
  if (status === "completed") return 82;
  if (status === "partial") return 61;
  if (status === "failed") return 28;
  return 58;
}

function formatRunDuration(row) {
  const durationCandidates = [row?.duration_ms, row?.runtime_ms, row?.duration_seconds, row?.runtime_seconds];
  let seconds = null;
  for (const candidate of durationCandidates) {
    const value = Number(candidate);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    seconds = value > 10000 ? Math.round(value / 1000) : Math.round(value);
    break;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins <= 0) {
    return `${rem}s`;
  }
  return `${mins}m ${String(rem).padStart(2, "0")}s`;
}

function renderRegressionSignals(report, row) {
  const currentIndex = state.runs.findIndex((item) => item.run_id === row?.run_id);
  const previous = currentIndex >= 0 ? state.runs[currentIndex + 1] : null;
  if (!previous) {
    return {
      meta: "No baseline",
      markup: '<div class="app-empty"><p>No previous run to compare yet.</p></div>'
    };
  }

  const currentRisk = Number(row?.risk_score);
  const previousRisk = Number(previous?.risk_score);
  const currentFindings = Number(row?.findings_count) || 0;
  const previousFindings = Number(previous?.findings_count) || 0;
  const riskDelta = Number.isFinite(currentRisk) && Number.isFinite(previousRisk) ? currentRisk - previousRisk : null;
  const findingsDelta = currentFindings - previousFindings;

  const journeyRows = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  const brokenNow = journeyRows.filter((journey) => {
    const status = String(journey?.status || "").toLowerCase();
    return status === "failed" || status === "blocked";
  }).length;

  const compareUrl = buildReportShareUrl(previous?.run_id, previous);
  const deltaLabel = (value, inverse = false) => {
    if (!Number.isFinite(value) || value === 0) {
      return "no change";
    }
    const direction = value > 0 ? "+" : "";
    const raw = `${direction}${Math.round(value)}`;
    if (!inverse) {
      return raw;
    }
    return value > 0 ? `-${Math.round(value)}` : `+${Math.round(Math.abs(value))}`;
  };

  return {
    meta: `Vs ${previous.run_id}`,
    markup: `
      <ul>
        <li>Risk score delta: ${escapeHtml(deltaLabel(riskDelta))}</li>
        <li>Finding count delta: ${escapeHtml(deltaLabel(findingsDelta))}</li>
        <li>Broken journeys now: ${escapeHtml(String(brokenNow))}</li>
      </ul>
      ${
        compareUrl
          ? `<div class="app-top-fix-actions">
              <a href="${escapeHtml(compareUrl)}" target="_blank" rel="noreferrer">Open baseline report</a>
            </div>`
          : ""
      }
    `
  };
}

function renderRecentRunsTable() {
  const rows = Array.isArray(state.runs) ? state.runs.slice(0, 10) : [];
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
      const selected = state.selectedRunId === run.run_id ? "is-selected" : "";
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

function attachShareButtons(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const buttons = Array.from(host.querySelectorAll("[data-share-url]"));
  for (const button of buttons) {
    if (button.getAttribute("data-bound") === "1") {
      continue;
    }
    button.setAttribute("data-bound", "1");

    button.addEventListener("click", async () => {
      const shareUrl = String(button.getAttribute("data-share-url") || "").trim();
      const baselineLabel = String(button.getAttribute("data-label") || button.textContent || "Copy share URL").trim();
      const isIconButton = button.getAttribute("data-icon-button") === "1";
      if (!button.getAttribute("data-label")) {
        button.setAttribute("data-label", baselineLabel);
      }

      const ok = await copyTextToClipboard(shareUrl);
      if (isIconButton) {
        const statusLabel = ok ? "Link copied" : "Copy failed";
        button.classList.toggle("is-copied", ok);
        button.classList.toggle("is-error", !ok);
        button.setAttribute("aria-label", statusLabel);
        button.setAttribute("title", statusLabel);
      } else {
        button.textContent = ok ? "Copied" : "Copy failed";
      }
      window.setTimeout(() => {
        if (isIconButton) {
          button.classList.remove("is-copied", "is-error");
          button.setAttribute("aria-label", baselineLabel);
          button.setAttribute("title", baselineLabel);
        } else {
          button.textContent = baselineLabel;
        }
      }, 1500);
    });
  }
}

function renderAppPanels(report, row, liveStatus = null) {
  if (!hasAppDashboardUi) {
    return;
  }

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
    const currentIndex = state.runs.findIndex((item) => item.run_id === row?.run_id);
    const previous = currentIndex >= 0 ? state.runs[currentIndex + 1] : null;
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
        : "Partial coverage only — retry to validate blockers";
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
        elements.liveMissionMeta.textContent = `${formatStatusLabel(terminal.status)} · ${terminal.durationLabel || formatRelativeTime(row?.delivered_at)}`;
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

  renderRecentRunsTable();
}

function renderAppRunPicker() {
  if (!hasAppDashboardUi || !elements.appRunPicker) {
    return;
  }

  ensureSelectedRunVisibleInRuns();
  if (!state.runs.length) {
    elements.appRunPicker.innerHTML = '<option value="">No runs</option>';
    return;
  }

  elements.appRunPicker.innerHTML = state.runs
    .map((run) => {
      const liveStatus = getLiveStatus(run.run_id);
      const status = getCanonicalRunStatus(null, run, liveStatus) || "unknown";
      const label = `${run.target || run.brand_key || run.run_id} · ${status}`;
      const selected = state.selectedRunId === run.run_id ? "selected" : "";
      return `<option value="${escapeHtml(run.run_id)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function jumpReplayToFrame(playerId, frameIndex) {
  const safePlayerId = String(playerId || "").trim();
  const safeFrameIndex = Number(frameIndex);
  if (!safePlayerId || !Number.isFinite(safeFrameIndex)) {
    return false;
  }

  const controller = state.replayControllers.get(safePlayerId);
  if (!controller || typeof controller.setFrame !== "function") {
    return false;
  }

  controller.setFrame(Math.max(0, Math.round(safeFrameIndex)));
  return true;
}

function attachReplayJumpButtons(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const buttons = Array.from(host.querySelectorAll("[data-replay-target][data-frame-index]"));
  for (const button of buttons) {
    if (button.getAttribute("data-bound") === "1") {
      continue;
    }
    button.setAttribute("data-bound", "1");
    button.addEventListener("click", () => {
      const target = String(button.getAttribute("data-replay-target") || "").trim();
      const frameIndex = Number(button.getAttribute("data-frame-index"));
      const moved = jumpReplayToFrame(target, frameIndex);
      const playerElement = document.getElementById(target);
      if (moved && playerElement) {
        playerElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

function attachReplayPlayers(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }
  const players = Array.from(host.querySelectorAll(".replay-player"));
  for (const player of players) {
    if (player.getAttribute("data-bound") === "1") {
      continue;
    }

    const rawFrames = String(player.getAttribute("data-frames") || "");
    const rawFrameIndexes = String(player.getAttribute("data-frame-indexes") || "");
    let frames = [];
    let frameIndexes = [];
    try {
      frames = JSON.parse(rawFrames);
    } catch {
      frames = [];
    }
    try {
      frameIndexes = JSON.parse(rawFrameIndexes);
    } catch {
      frameIndexes = [];
    }

    if (!Array.isArray(frames) || !frames.length) {
      continue;
    }
    if (!Array.isArray(frameIndexes) || frameIndexes.length !== frames.length) {
      frameIndexes = frames.map((_, index) => index);
    }

    const frame = player.querySelector(".replay-frame");
    const toggle = player.querySelector(".replay-toggle");
    const seek = player.querySelector(".replay-seek");
    const counter = player.querySelector(".replay-counter");

    if (!frame || !toggle || !seek || !counter) {
      continue;
    }

    let cursor = 0;
    let timer = null;
    const playerId = String(player.getAttribute("data-player-id") || player.id || "").trim();

    const draw = () => {
      frame.src = String(frames[cursor] || frames[0]);
      seek.value = String(cursor);
      counter.textContent = `${cursor + 1} / ${frames.length}`;
    };

    const stop = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      toggle.textContent = "Play";
    };

    const setFrame = (requestedIndex) => {
      const requested = Math.max(0, Math.round(Number(requestedIndex) || 0));
      const exact = frameIndexes.indexOf(requested);
      if (exact >= 0) {
        cursor = exact;
      } else if (requested < frames.length) {
        cursor = requested;
      } else {
        let bestPos = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let idx = 0; idx < frameIndexes.length; idx += 1) {
          const distance = Math.abs(Number(frameIndexes[idx]) - requested);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestPos = idx;
          }
        }
        cursor = bestPos;
      }
      stop();
      draw();
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => {
        cursor = (cursor + 1) % frames.length;
        draw();
      }, 850);
      toggle.textContent = "Pause";
    };

    toggle.addEventListener("click", () => {
      if (timer) {
        stop();
      } else {
        start();
      }
    });

    seek.addEventListener("input", () => {
      cursor = Math.max(0, Math.min(frames.length - 1, Number(seek.value) || 0));
      draw();
    });

    draw();
    if (playerId) {
      state.replayControllers.set(playerId, {
        frameCount: frames.length,
        setFrame
      });
    }
    player.setAttribute("data-bound", "1");
  }
}

async function renderSelectedReport() {
  const runId = state.selectedRunId;
  if (!runId) {
    state.activeRenderedReport = null;
    state.activeRenderedRow = null;
    if (elements.reportDetail) {
      elements.reportDetail.innerHTML = `<div class="empty-detail"><h2>Select a run</h2></div>`;
    }
    if (elements.appReportOnlyPanel) {
      elements.appReportOnlyPanel.innerHTML = `<div class="empty-detail"><h2>Select a run</h2><p>Report details will appear here.</p></div>`;
    }
    if (hasAppDashboardUi) {
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
      if (elements.recentRunsRows) {
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
        const envLabel = getEnvironmentLabel(getActiveEnvironment());
        const releaseLens = isReleaseReadinessEnvironment(getActiveEnvironment());
        elements.healthHeroTitle.textContent = releaseLens ? `${envLabel} Release Readiness` : `${envLabel} Health`;
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
    markDashboardShellReady();
    return;
  }

  const runtime = await dashboardReportRuntime.resolveSelectedReportRuntime(
    getReportRuntimeContext(),
    getReportRuntimeHelpers()
  );
  const row = runtime.row || {};
  const statusPayload = runtime.statusPayload;
  const report = runtime.report;
  state.activeRenderedReport = report;
  state.activeRenderedRow = row;
  state.replayControllers.clear();
  const replayPlayerId = `replay-main-${toAnchorToken(report?.run_id || runId || "run")}`;
  const detailMarkup = `
    ${renderSelectedHeader(report, row)}
    ${renderLiveWatch(runId, row)}
    ${renderQuickJumpNav()}
    ${renderPrioritySummary(report)}
    ${renderReplayReview(report, replayPlayerId)}
    ${renderCounts(report)}
    ${renderFindings(report, row, replayPlayerId)}
    ${renderJourneys(report, row)}
    ${renderFeatureInventory(report)}
  `;

  if (elements.reportDetail) {
    elements.reportDetail.innerHTML = detailMarkup;
    attachReplayPlayers(elements.reportDetail);
    attachReplayJumpButtons(elements.reportDetail);
    attachShareButtons(elements.reportDetail);
    attachLlmCopyButtons(elements.reportDetail);
  }
  if (isReportViewMode() && elements.appReportOnlyPanel) {
    elements.appReportOnlyPanel.innerHTML = detailMarkup;
    attachReplayPlayers(elements.appReportOnlyPanel);
    attachReplayJumpButtons(elements.appReportOnlyPanel);
    attachShareButtons(elements.appReportOnlyPanel);
    attachLlmCopyButtons(elements.appReportOnlyPanel);
  }

  if (hasAppDashboardUi) {
    if (!isReportViewMode()) {
      renderAppPanels(report, row, statusPayload);
    }
    renderAppRunPicker();
  }
  markDashboardShellReady();
}

async function loadAndRenderReports() {
  ensureOnboardingStateInitialized();
  applyAppViewMode();
  setDashboardLoading(true);
  if (requiresDashboardAuth && !isDashboardAuthReady()) {
    await waitForDashboardAuthReady();
  }
  if (!isDashboardAuthorized()) {
    stopLivePolling();
    updateOnboardingVisibility();
    renderAuthRequiredState();
    syncProjectSwitcherVisibility();
    setDashboardLoading(false);
    return;
  }

  if (elements.reportsItems) {
    elements.reportsItems.innerHTML = '<div class="empty-state">Loading reports...</div>';
  }
  if (hasAppDashboardUi && elements.recentIssuesItems) {
    elements.recentIssuesItems.innerHTML = '<div class="app-empty"><p>Loading reports...</p></div>';
  }
  if (hasAppDashboardUi && elements.topFixesItems) {
    elements.topFixesItems.innerHTML = '<div class="app-empty"><p>Loading findings...</p></div>';
  }
  if (hasAppDashboardUi && elements.personaSignalsItems) {
    elements.personaSignalsItems.innerHTML = '<div class="app-empty"><p>Loading persona signals...</p></div>';
  }
  if (hasAppDashboardUi && elements.recentRunsRows) {
    elements.recentRunsRows.innerHTML = '<tr><td colspan="7"><div class="app-empty"><p>Loading runs...</p></div></td></tr>';
  }
  try {
    await fetchBrandOptions();
    ensureSingleProjectSelection();
    await fetchRuns();
    state.onboarding.hasAnyRuns =
      state.onboarding.hasAnyRuns === true ||
      (Array.isArray(state.savedProjects) && state.savedProjects.length > 0) ||
      (Array.isArray(state.allRuns) && state.allRuns.length > 0);
    const runReconcile = reconcileOnboardingStateWithRuns();
    const shouldAutoOpen = shouldAutoOpenOnboarding();
    if (shouldAutoOpen) {
      state.onboarding.manualOverride = true;
      state.onboarding.forceOpen = true;
      void persistOnboardingSeen();
    } else if (!state.onboarding.manualOverride) {
      state.onboarding.forceOpen = false;
    }
    if (runReconcile?.hasExistingRuns) {
      void persistOnboardingSeen();
    }
    ensureSelectedRunVisibleInRuns();
    if (state.requestedRunId && state.runs.some((item) => item.run_id === state.requestedRunId)) {
      state.selectedRunId = state.requestedRunId;
    }
    renderBrandSuggestions();
    syncProjectSwitcherVisibility();
    renderBrandSummary();
    renderBrandChips();
    renderRunsList();
    renderAppRunPicker();
    updateOnboardingVisibility();
    syncUrlFromState();
    markDashboardShellReady();
    await renderSelectedReport();
    ensureLivePolling();
  } catch (error) {
    if (elements.reportsItems) {
      elements.reportsItems.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Failed to load reports")}</div>`;
    }
    if (elements.reportDetail) {
      elements.reportDetail.innerHTML = `<div class="empty-detail"><h2>Error</h2><p>${escapeHtml(error.message || "Failed to load report detail")}</p></div>`;
    }
    if (hasAppDashboardUi && elements.recentIssuesItems) {
      elements.recentIssuesItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(error.message || "Failed to load dashboard data")}</p></div>`;
    }
    if (hasAppDashboardUi && elements.topFixesItems) {
      elements.topFixesItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(error.message || "Failed to load findings")}</p></div>`;
    }
    if (hasAppDashboardUi && elements.personaSignalsItems) {
      elements.personaSignalsItems.innerHTML = `<div class="app-empty"><p>${escapeHtml(error.message || "Failed to load persona signals")}</p></div>`;
    }
    stopLivePolling();
    updateOnboardingVisibility();
    syncProjectSwitcherVisibility();
    markDashboardShellReady();
  } finally {
    setDashboardLoading(false);
  }
}

function stopLivePolling() {
  if (state.livePollingTimer) {
    window.clearInterval(state.livePollingTimer);
    state.livePollingTimer = null;
  }
}

async function pollSelectedRunLiveStatus() {
  if (state.livePollingInFlight) {
    return;
  }
  if (!isDashboardAuthorized()) {
    stopLivePolling();
    return;
  }
  const pollState = dashboardReportRuntime.shouldPollSelectedRun(
    getReportRuntimeContext(),
    getReportRuntimeHelpers()
  );
  if (!pollState.shouldPoll) {
    return;
  }
  const runId = pollState.runId;

  state.livePollingInFlight = true;
  try {
    const statusPayload = await fetchRunStatus(runId);
    const queueStatus = String(statusPayload?.queue?.queue_status || statusPayload?.queue?.status || "").toLowerCase();
    state.runs = dashboardReportRuntime.applyLiveStatusToRunCollection({
      runs: state.runs,
      runId,
      statusPayload
    });
    state.allRuns = dashboardReportRuntime.applyLiveStatusToRunCollection({
      runs: state.allRuns,
      runId,
      statusPayload
    });

    if (statusPayload.report_ready) {
      state.reportCache.delete(runId);
    }

    renderRunsList();
    renderAppRunPicker();
    await renderSelectedReport();

    if (statusPayload.report_ready && !isQueueActiveStatus(queueStatus)) {
      state.reportCache.delete(runId);
      await fetchRuns();
      renderBrandSummary();
      renderBrandChips();
      renderRunsList();
      renderAppRunPicker();
      await renderSelectedReport();
    }
  } catch {
    // Polling errors are transient and should not break the dashboard.
  } finally {
    state.livePollingInFlight = false;
  }
}

function ensureLivePolling() {
  stopLivePolling();
  if (!isDashboardAuthorized()) {
    return;
  }
  pollSelectedRunLiveStatus();
  state.livePollingTimer = window.setInterval(() => {
    pollSelectedRunLiveStatus();
  }, 1200);
}

function installOnboardingInteractions() {
  if (!hasAppDashboardUi || !elements.onboardingForm) {
    return;
  }
  if (elements.onboardingForm.dataset.bound === "1") {
    return;
  }
  elements.onboardingForm.dataset.bound = "1";

  const personaButtons = elements.onboardingPersonaChoices
    ? Array.from(elements.onboardingPersonaChoices.querySelectorAll(".onboarding-choice"))
    : [];
  for (const button of personaButtons) {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const isActive = button.classList.contains("active");
      if (!isActive && getSelectedPersonaButtons().length >= ONBOARDING_MAX_PERSONALITIES) {
        setOnboardingMessage(`Choose up to ${ONBOARDING_MAX_PERSONALITIES} personalities for the first run.`, "error");
        return;
      }
      button.classList.toggle("active", !isActive);
      button.setAttribute("aria-pressed", isActive ? "false" : "true");
      syncOnboardingPersonaField();
      refreshOnboardingLaunchSummary();
      setOnboardingMessage("", "");
    });
  }

  const intensityButtons = elements.onboardingIntensityChoices
    ? Array.from(elements.onboardingIntensityChoices.querySelectorAll(".onboarding-intensity"))
    : [];
  for (const button of intensityButtons) {
    button.addEventListener("click", () => {
      for (const node of intensityButtons) {
        node.classList.toggle("active", node === button);
      }
      updateOnboardingScopeUi();
      syncOnboardingScenariosField();
      refreshOnboardingLaunchSummary();
      setOnboardingMessage("", "");
    });
  }

  const criticalInputs = elements.onboardingCriticalChoices
    ? Array.from(elements.onboardingCriticalChoices.querySelectorAll("input[type='checkbox']"))
    : [];
  for (const input of criticalInputs) {
    const label = input.closest(".onboarding-toggle");
    if (label) {
      label.classList.toggle("active", input.checked);
    }
    input.addEventListener("change", () => {
      if (label) {
        label.classList.toggle("active", input.checked);
      }
      syncOnboardingScenariosField();
      refreshOnboardingLaunchSummary();
      setOnboardingMessage("", "");
    });
  }

  elements.onboardingTargetUrl?.addEventListener("input", () => {
    refreshOnboardingPreview();
    maybePopulateBrandKeyFromTarget();
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingTargetUrl?.addEventListener("blur", () => {
    normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""), { writeBack: true });
    maybePopulateBrandKeyFromTarget();
    refreshOnboardingPreview();
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingPersonaCustom?.addEventListener("input", () => {
    syncOnboardingPersonaField();
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingScenariosCustom?.addEventListener("input", () => {
    syncOnboardingScenariosField();
    refreshOnboardingLaunchSummary();
  });

  elements.onboardingPrevButton?.addEventListener("click", () => {
    setOnboardingMessage("", "");
    setOnboardingStep((state.onboarding.step || 1) - 1);
  });

  elements.onboardingNextButton?.addEventListener("click", () => {
    const currentStep = state.onboarding.step || 1;
    if (!validateOnboardingStep(currentStep)) {
      return;
    }
    setOnboardingStep(currentStep + 1);
  });

  updateOnboardingScopeUi();
  syncOnboardingPersonaField();
  syncOnboardingScenariosField();
  refreshOnboardingPreview();
  refreshOnboardingLaunchSummary();
  setOnboardingStep(state.onboarding.step || 1);
}

function openOnboardingModal({ resetStep = true, manual = false, trusted = false } = {}) {
  if (!hasAppDashboardUi || !elements.onboardingSection) {
    return;
  }
  if (!manual || !trusted) {
    return;
  }
  if (isLiveViewMode() || isReportViewMode()) {
    state.appViewMode = APP_VIEW_MODES.DASHBOARD;
    applyAppViewMode();
  }
  state.requestedRunId = "";
  syncUrlFromState();
  state.onboarding.manualOverride = true;
  state.onboarding.forceOpen = true;
  if (resetStep) {
    state.onboarding.step = 1;
  }
  setOnboardingMessage("", "");
  updateOnboardingVisibility();
  focusOnboardingActiveControl();
}

function closeOnboardingModal() {
  if (!hasAppDashboardUi || !elements.onboardingSection) {
    return;
  }
  state.onboarding.manualOverride = false;
  state.onboarding.forceOpen = false;
  void persistOnboardingSeen();
  updateOnboardingVisibility();
}

function openAddProjectFlow(event) {
  const isTrusted = Boolean(event?.isTrusted);
  if (!isTrusted) {
    return;
  }
  state.filters.brand = "";
  setStoredBrand("");
  if (elements.brandFilter) {
    elements.brandFilter.value = "";
  }
  state.selectedRunId = null;
  state.requestedRunId = "";
  if (elements.onboardingTargetUrl) {
    elements.onboardingTargetUrl.value = "";
  }
  if (elements.onboardingBrandKey) {
    elements.onboardingBrandKey.value = "";
  }
  syncUrlFromState();
  refreshOnboardingPreview();
  refreshOnboardingLaunchSummary();
  openOnboardingModal({ resetStep: true, manual: true, trusted: true });
}

function openDashboardReportView(runId) {
  const safeRunId = String(runId || "").trim();
  if (!safeRunId) {
    return;
  }
  state.selectedRunId = safeRunId;
  state.requestedRunId = safeRunId;
  state.appViewMode = APP_VIEW_MODES.REPORT;
  syncUrlFromState();
  applyAppViewMode();
  renderSelectedReport().catch(() => {
    // Ignore transition rendering errors; list refresh will recover state.
  });
}

function openDashboardLiveView(runId, options = {}) {
  const settings = options && typeof options === "object" ? options : {};
  const safeRunId = String(runId || "").trim();
  if (safeRunId) {
    state.selectedRunId = safeRunId;
    state.requestedRunId = safeRunId;
  }
  state.appViewMode = APP_VIEW_MODES.LIVE;
  syncUrlFromState();
  applyAppViewMode();
  renderSelectedReport().catch(() => {
    // Ignore transition rendering errors; list refresh will recover state.
  });

  if (settings.focus !== false) {
    window.setTimeout(() => {
      if (elements.liveMissionSection && !elements.liveMissionSection.hidden) {
        elements.liveMissionSection.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        elements.appDashboardRoot?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }
}

function installDashboardActionHandlers() {
  if (!hasAppDashboardUi) {
    return;
  }

  if (elements.dashboardPrimaryAction && elements.dashboardPrimaryAction.dataset.bound !== "1") {
    elements.dashboardPrimaryAction.dataset.bound = "1";
    elements.dashboardPrimaryAction.addEventListener("click", async (event) => {
      const mode = String(elements.dashboardPrimaryAction?.getAttribute("data-action-mode") || "review");
      const runId = String(elements.dashboardPrimaryAction?.getAttribute("data-run-id") || state.selectedRunId || "");
      if (mode === "start" || mode === "retry") {
        if (mode === "retry") {
          await retryRunFromContext(runId, event);
          return;
        }
        await openSmartLaunchFlow(event, { runId });
        return;
      }
      if (mode === "watch") {
        openDashboardLiveView(runId);
        return;
      }
      openDashboardReportView(runId);
    });
  }

  if (elements.dashboardOpenReport && elements.dashboardOpenReport.dataset.bound !== "1") {
    elements.dashboardOpenReport.dataset.bound = "1";
    elements.dashboardOpenReport.addEventListener("click", () => {
      const runId = String(elements.dashboardOpenReport?.getAttribute("data-run-id") || state.selectedRunId || "");
      openDashboardReportView(runId);
    });
  }

  if (elements.dashboardCompareRuns && elements.dashboardCompareRuns.dataset.bound !== "1") {
    elements.dashboardCompareRuns.dataset.bound = "1";
    elements.dashboardCompareRuns.addEventListener("click", () => {
      const currentIndex = state.runs.findIndex((item) => item.run_id === state.selectedRunId);
      const previous = currentIndex >= 0 ? state.runs[currentIndex + 1] : null;
      if (previous?.run_id) {
        openDashboardReportView(previous.run_id);
      }
    });
  }

  if (elements.recentRunsRows && elements.recentRunsRows.dataset.bound !== "1") {
    elements.recentRunsRows.dataset.bound = "1";
    elements.recentRunsRows.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }
      const openRunId = String(target.getAttribute("data-open-run") || "").trim();
      if (openRunId) {
        state.selectedRunId = openRunId;
        state.requestedRunId = openRunId;
        state.appViewMode = APP_VIEW_MODES.DASHBOARD;
        syncUrlFromState();
        renderRunsList();
        renderAppRunPicker();
        await renderSelectedReport();
        return;
      }

      const compareRunId = String(target.getAttribute("data-compare-run") || "").trim();
      if (compareRunId) {
        openDashboardReportView(compareRunId);
        return;
      }

      const retryRunId = String(target.getAttribute("data-retry-run") || "").trim();
      if (retryRunId) {
        state.selectedRunId = retryRunId;
        state.requestedRunId = retryRunId;
        syncUrlFromState();
        await retryRunFromContext(retryRunId, event);
      }
    });
  }

  if (elements.onboardingCloseButton && elements.onboardingCloseButton.dataset.bound !== "1") {
    elements.onboardingCloseButton.dataset.bound = "1";
    elements.onboardingCloseButton.addEventListener("click", () => {
      closeOnboardingModal();
    });
  }

  if (!document.body.dataset.onboardingEscapeBound) {
    document.body.dataset.onboardingEscapeBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.onboardingSection?.hidden) {
        closeOnboardingModal();
      }
    });
  }
}

async function bootstrapDashboardContent() {
  if (requiresDashboardAuth && !isDashboardAuthReady()) {
    setDashboardLoading(true);
    await waitForDashboardAuthReady();
  }

  if (isDashboardAuthorized()) {
    await loadAndRenderReports();
    return;
  }

  renderAuthRequiredState();
  setDashboardLoading(false);
}

if (hasReportsUi) {
  initializeThemeModeSwitcher();

  if (elements.launchSwarmButton && hasAppDashboardUi) {
    elements.launchSwarmButton.addEventListener("click", async (event) => {
      event.preventDefault();
      await openSmartLaunchFlow(event, {
        runId: state.selectedRunId || state.requestedRunId || state.runs[0]?.run_id || "",
        brandKey: state.filters.brand,
        startFresh: true
      });
    });
  }

  if (elements.onboardingForm && hasAppDashboardUi) {
    elements.onboardingForm.addEventListener("submit", submitOnboardingRun);
  }
  installOnboardingInteractions();
  installDashboardActionHandlers();

  elements.applyFilters.addEventListener("click", async () => {
    readFiltersFromInputs();
    state.selectedRunId = null;
    state.requestedRunId = "";
    syncUrlFromState();
    await loadAndRenderReports();
  });

  elements.refreshReports.addEventListener("click", async (event) => {
    if (hasAppDashboardUi) {
      const retryRunId = String(state.selectedRunId || state.requestedRunId || state.runs[0]?.run_id || "").trim();
      if (retryRunId) {
        await retryRunFromContext(retryRunId, event);
        return;
      }
      await openSmartLaunchFlow(event, { runId: retryRunId });
      return;
    }
    state.reportCache.clear();
    await loadAndRenderReports();
  });

  ["targetFilter", "statusFilter", "searchFilter"].forEach((id) => {
    elements[id].addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        readFiltersFromInputs();
        state.selectedRunId = null;
        state.requestedRunId = "";
        syncUrlFromState();
        await loadAndRenderReports();
      }
    });
  });

  if (elements.brandFilter && elements.brandFilter.tagName === "SELECT") {
    elements.brandFilter.addEventListener("change", async (event) => {
      const selectedBrand = String(elements.brandFilter.value || "").trim();
      if (selectedBrand === ADD_NEW_PROJECT_OPTION_VALUE) {
        openAddProjectFlow(event);
        return;
      }
      readFiltersFromInputs();
      state.selectedRunId = null;
      state.requestedRunId = "";
      syncUrlFromState();
      state.reportCache.clear();
      await loadAndRenderReports();
    });
  }

  if (elements.appRunPicker) {
    elements.appRunPicker.addEventListener("change", async () => {
      const runId = String(elements.appRunPicker.value || "").trim();
      if (!runId) {
        return;
      }
      state.selectedRunId = runId;
      state.requestedRunId = runId;
      syncUrlFromState();
      renderRunsList();
      await renderSelectedReport();
    });
  }

  if (elements.environmentSwitcher) {
    elements.environmentSwitcher.addEventListener("change", async () => {
      state.filters.env = normalizeEnvironment(elements.environmentSwitcher.value);
      syncUrlFromState();
      renderBrandSummary();
      await renderSelectedReport();
    });
  }

  applyUrlFiltersToState();
  syncInputsFromState();
  applyAppViewMode();
  ensureOnboardingStateInitialized();
  updateOnboardingVisibility();
  void bootstrapDashboardContent();

  if (requiresDashboardAuth) {
    window.addEventListener("swarm:auth-state", async (event) => {
      const sessionChecked = Boolean(event?.detail?.sessionChecked);
      if (!sessionChecked) {
        return;
      }
      const authorized = Boolean(event?.detail?.authorized);
      if (!authorized) {
        stopLivePolling();
        state.reportCache.clear();
        state.liveStatusCache.clear();
        state.savedProjects = [];
        state.brandOptions = [];
        state.selectedRunId = null;
        state.requestedRunId = "";
        state.onboarding.completed = false;
        state.onboarding.forceOpen = false;
        state.onboarding.manualOverride = false;
        state.onboarding.hasAnyRuns = null;
        state.onboarding.initialized = false;
        renderAuthRequiredState();
        updateOnboardingVisibility();
        return;
      }
      state.savedProjects = [];
      state.brandOptions = [];
      state.onboarding.hasAnyRuns = null;
      state.onboarding.initialized = false;
      ensureOnboardingStateInitialized();
      updateOnboardingVisibility();
      await loadAndRenderReports();
    });
  }
}
