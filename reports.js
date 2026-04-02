const STORAGE_ACTIVE_BRAND_KEY = "swarmtester.activeBrand";
const STORAGE_ACTIVE_PERSONA_KEY = "swarmtester.activePersona";
const STORAGE_ONBOARDING_COMPLETED_KEY_PREFIX = "swarmtester.onboarding.completed";
const STORAGE_THEME_MODE_KEY = "swarmtester.theme.mode";
const STORAGE_GITHUB_APP_RETURN_KEY = "swarmtester.githubAppReturn";
const ADD_NEW_PROJECT_OPTION_VALUE = "__add_new__";
const DEFAULT_DASHBOARD_PERSONA = "General non-developer business user with moderate technical comfort.";
const DEFAULT_ONBOARDING_SCENARIO = "Clear signup, authentication, and onboarding to reach a usable in-product state.";
const DEFAULT_SHARED_REPORT_PROMO = Object.freeze({
  enabled: true,
  headline: "Try Swarm Tester for your own product.",
  body: "Start the Team plan, run Swarm Tester on your site, and get replay, proof, and AI-ready fixes your team can act on. The first month is free with the team code.",
  ctaLabel: "Start free month",
  ctaUrl: "/dashboard",
  couponCode: "TEAMREPORT",
  couponLabel: "Team code",
  note: "Team plan is $99/month after the free first month. The code works during sign-up and is also applied at checkout."
});
const IMAGE_URL_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:$|[?#])/i;
const VIDEO_URL_PATTERN = /\.(mp4|webm|ogg|mov|m4v|m3u8)(?:$|[?#])/i;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const DATA_VIDEO_PATTERN = /^data:video\/[a-z0-9.+-]+;base64,/i;
const DISTRIBUTION_MAILBOX_PROVIDER_PRESETS = Object.freeze({
  gmail: Object.freeze({
    domains: ["gmail.com", "googlemail.com"],
    imapHost: "imap.gmail.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    smtpSecure: true
  }),
  outlook: Object.freeze({
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    imapHost: "outlook.office365.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.office365.com",
    smtpPort: "587",
    smtpSecure: false
  }),
  yahoo: Object.freeze({
    domains: ["yahoo.com", "ymail.com", "rocketmail.com"],
    imapHost: "imap.mail.yahoo.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: "465",
    smtpSecure: true
  }),
  zoho: Object.freeze({
    domains: ["zoho.com", "zohomail.com"],
    imapHost: "imap.zoho.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.zoho.com",
    smtpPort: "465",
    smtpSecure: true
  }),
  icloud: Object.freeze({
    domains: ["icloud.com", "me.com", "mac.com"],
    imapHost: "imap.mail.me.com",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: "587",
    smtpSecure: false
  }),
  mailpool: Object.freeze({
    domains: [],
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false
  }),
  forwardemail: Object.freeze({
    domains: ["forwardemail.net"],
    imapHost: "imap.forwardemail.net",
    imapPort: "993",
    imapSecure: true,
    smtpHost: "smtp.forwardemail.net",
    smtpPort: "465",
    smtpSecure: true
  })
});

const elements = {
  appDashboardRoot: document.getElementById("appQaDashboard"),
  topbarProjectShell: document.getElementById("topbarProjectShell"),
  workerHealthChip: document.getElementById("workerHealthChip"),
  workerHealthText: document.getElementById("workerHealthText"),
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
  qaScheduleForm: document.getElementById("qaScheduleForm"),
  qaScheduleMeta: document.getElementById("qaScheduleMeta"),
  qaScheduleStateBadge: document.getElementById("qaScheduleStateBadge"),
  qaScheduleFrequency: document.getElementById("qaScheduleFrequency"),
  qaScheduleScopeMode: document.getElementById("qaScheduleScopeMode"),
  qaSchedulePersona: document.getElementById("qaSchedulePersona"),
  qaScheduleMission: document.getElementById("qaScheduleMission"),
  qaScheduleEmail: document.getElementById("qaScheduleEmail"),
  qaScheduleEmailHint: document.getElementById("qaScheduleEmailHint"),
  qaScheduleWebhook: document.getElementById("qaScheduleWebhook"),
  qaScheduleSaveAction: document.getElementById("qaScheduleSaveAction"),
  qaScheduleRunNowAction: document.getElementById("qaScheduleRunNowAction"),
  qaScheduleToggleAction: document.getElementById("qaScheduleToggleAction"),
  qaScheduleMessage: document.getElementById("qaScheduleMessage"),
  qaAlertsMeta: document.getElementById("qaAlertsMeta"),
  qaAlertsItems: document.getElementById("qaAlertsItems"),
  personaSignalsTitle: document.getElementById("personaSignalsTitle"),
  personaSignalsItems: document.getElementById("personaSignalsItems"),
  personaSignalsMeta: document.getElementById("personaSignalsMeta"),
  environmentSwitcher: document.getElementById("environmentSwitcher"),
  liveMissionSection: document.getElementById("liveMissionSection"),
  liveMissionMeta: document.getElementById("liveMissionMeta"),
  liveStreamPanel: document.getElementById("liveStreamPanel"),
  liveActivityItems: document.getElementById("liveActivityItems"),
  distributionPacksSection: document.getElementById("distributionPacksSection"),
  distributionPacksMeta: document.getElementById("distributionPacksMeta"),
  distributionTrackSwitcher: document.getElementById("distributionTrackSwitcher"),
  distributionPacksGrid: document.getElementById("distributionPacksGrid"),
  distributionScorecardSummary: document.getElementById("distributionScorecardSummary"),
  distributionScorecardList: document.getElementById("distributionScorecardList"),
  distributionLauncherForm: document.getElementById("distributionLauncherForm"),
  distributionLauncherState: document.getElementById("distributionLauncherState"),
  distributionLauncherMessage: document.getElementById("distributionLauncherMessage"),
  distributionBrandSelect: document.getElementById("distributionBrandSelect"),
  distributionPackSelect: document.getElementById("distributionPackSelect"),
  distributionSubmitLive: document.getElementById("distributionSubmitLive"),
  distributionNoHumanActions: document.getElementById("distributionNoHumanActions"),
  distributionPrepareAction: document.getElementById("distributionPrepareAction"),
  distributionPreflightAction: document.getElementById("distributionPreflightAction"),
  distributionQueueAction: document.getElementById("distributionQueueAction"),
  distributionBrandMeta: document.getElementById("distributionBrandMeta"),
  distributionBrandSummary: document.getElementById("distributionBrandSummary"),
  distributionBrandSaveMeta: document.getElementById("distributionBrandSaveMeta"),
  distributionIdentityMode: document.getElementById("distributionIdentityMode"),
  distributionMailboxProvider: document.getElementById("distributionMailboxProvider"),
  distributionMailboxEmail: document.getElementById("distributionMailboxEmail"),
  distributionMailboxUsername: document.getElementById("distributionMailboxUsername"),
  distributionMailboxAuthMethod: document.getElementById("distributionMailboxAuthMethod"),
  distributionMailboxHost: document.getElementById("distributionMailboxHost"),
  distributionMailboxPort: document.getElementById("distributionMailboxPort"),
  distributionMailboxSecure: document.getElementById("distributionMailboxSecure"),
  distributionMailboxSmtpHost: document.getElementById("distributionMailboxSmtpHost"),
  distributionMailboxSmtpPort: document.getElementById("distributionMailboxSmtpPort"),
  distributionMailboxSmtpSecure: document.getElementById("distributionMailboxSmtpSecure"),
  distributionMailboxPassword: document.getElementById("distributionMailboxPassword"),
  distributionMailboxReady: document.getElementById("distributionMailboxReady"),
  distributionSaveBrandAction: document.getElementById("distributionSaveBrandAction"),
  distributionBrandSaveMessage: document.getElementById("distributionBrandSaveMessage"),
  distributionManifestMeta: document.getElementById("distributionManifestMeta"),
  distributionManifestSummary: document.getElementById("distributionManifestSummary"),
  distributionPreflightMeta: document.getElementById("distributionPreflightMeta"),
  distributionPreflightSummary: document.getElementById("distributionPreflightSummary"),
  distributionQueueMeta: document.getElementById("distributionQueueMeta"),
  distributionQueueSummary: document.getElementById("distributionQueueSummary"),
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
  findingDetailModal: document.getElementById("findingDetailModal"),
  findingDetailModalBody: document.getElementById("findingDetailModalBody"),
  findingDetailCloseButton: document.getElementById("findingDetailCloseButton"),
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
  onboardingReviewRepoTriage: document.getElementById("onboardingReviewRepoTriage"),
  onboardingReviewRepoTriageMeta: document.getElementById("onboardingReviewRepoTriageMeta"),
  onboardingRepoTriageEnabled: document.getElementById("onboardingRepoTriageEnabled"),
  onboardingRepoConnectionLabel: document.getElementById("onboardingRepoConnectionLabel"),
  onboardingRepoConnectionMeta: document.getElementById("onboardingRepoConnectionMeta"),
  onboardingRepoConnectionSelectWrap: document.getElementById("onboardingRepoConnectionSelectWrap"),
  onboardingRepoConnectionSelect: document.getElementById("onboardingRepoConnectionSelect"),
  onboardingRepoTriageConnect: document.getElementById("onboardingRepoTriageConnect"),
  onboardingRepoTriageDisconnect: document.getElementById("onboardingRepoTriageDisconnect"),
  onboardingRepoTriageRepo: document.getElementById("onboardingRepoTriageRepo"),
  onboardingRepoTriagePaths: document.getElementById("onboardingRepoTriagePaths"),
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
const PROJECT_CATALOG_STATES = {
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  ERROR: "error"
};
const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system"
};
const DASHBOARD_LOADING_FAILSAFE_MS = 4500;
const DASHBOARD_BOOT_FETCH_RETRIES = 2;
const LIVE_STATUS_POLL_INTERVAL_MS = 5000;
const WORKER_HEALTH_POLL_INTERVAL_MS = 30000;

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
const dashboardDebugEnabled = initialUrlParams.has("smoke") || initialUrlParams.has("debug_dashboard");

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
  repoConnections: new Map(),
  repoConnectionLoadingBrand: "",
  brandOptions: [],
  personaOptions: [],
  selectedRunId: null,
  requestedRunId: "",
  shareKey: parseShareKeyFromParams(initialUrlParams),
  reportCache: new Map(),
  liveStatusCache: new Map(),
  optimisticRuns: new Map(),
  replayControllers: new Map(),
  journeyCanvasPositions: new Map(),
  livePollingTimer: null,
  livePollingInFlight: false,
  workerHealth: null,
  workerHealthPollingTimer: null,
  dashboardLoadingTimer: null,
  dashboardPendingLoads: 0,
  dashboardLoadRequestId: 0,
  dashboardBootstrapComplete: false,
  projectCatalogStatus: PROJECT_CATALOG_STATES.IDLE,
  activeRenderedReport: null,
  activeRenderedRow: null,
  findingModalTrigger: null,
  appViewMode: parseAppViewMode(initialUrlParams),
  submissionCatalog: {
    activeTrack: "startup",
    loading: false,
    error: "",
    trackData: {
      startup: null,
      physical_local: null
    }
  },
  submissionLauncher: {
    brands: [],
    loadingBrands: false,
    brandsError: "",
    selectedBrandProfileId: "",
    selectedPackId: "",
    latestManifest: null,
    loadingManifest: false,
    manifestError: "",
    prepareJob: null,
    prepareJobTimer: null,
    preparing: false,
    preflight: null,
    preflighting: false,
    queueBatch: null,
    queueStatuses: {},
    queuePollTimer: null,
    queueing: false,
    brandForm: {
      sourceBrandProfileId: "",
      identityMode: "client_owned",
      mailboxProvider: "",
      mailboxEmail: "",
      mailboxUsername: "",
      mailboxAuthMethod: "unknown",
      mailboxHost: "",
      mailboxPort: "993",
      mailboxSecure: true,
      mailboxSmtpHost: "",
      mailboxSmtpPort: "465",
      mailboxSmtpSecure: true,
      mailboxPassword: "",
      mailboxReady: false
    },
    savingBrand: false,
    brandSaveMessage: "Mailbox setup is stored on the submission brand and used for new-account verification flows.",
    brandSaveTone: "",
    message: "Choose a submission brand and a product pack to start.",
    messageTone: "",
    lastAction: "idle"
  },
  qaAutomation: {
    schedules: [],
    alerts: [],
    loading: false,
    saving: false,
    running: false,
    emailConfigured: null,
    defaultAlertEmail: "",
    message: "Save a schedule and Swarm Tester will keep checking this project for you.",
    tone: ""
  },
  onboarding: {
    completed: false,
    forceOpen: false,
    manualOverride: false,
    syncInFlight: null,
    hasAnyRuns: null,
    initialized: false,
    step: 1,
    githubRedirectHandled: false,
    pendingRepoSelectionFocus: false
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
const dashboardRenderState = window.SwarmDashboardRenderState;
if (!dashboardRenderState) {
  throw new Error("dashboard-render-state.js failed to load");
}
const dashboardPanels = window.SwarmDashboardPanels;
if (!dashboardPanels) {
  throw new Error("dashboard-panels.js failed to load");
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

function sanitizeOptionalString(value, maxLength = 4000) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return text.slice(0, Math.max(1, Number(maxLength) || 1));
}

function sanitizeString(value, maxLength = 4000) {
  return sanitizeOptionalString(value, maxLength);
}

function debugDashboardLog(...parts) {
  if (!dashboardDebugEnabled) {
    return;
  }
  console.debug("[dashboard]", ...parts);
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

function parseShareKeyFromParams(params) {
  return String(params.get("share_key") || params.get("shareKey") || "").trim();
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

function storeGitHubAppReturnState(config = {}) {
  try {
    const payload = JSON.stringify(config && typeof config === "object" ? config : {});
    localStorage.setItem(STORAGE_GITHUB_APP_RETURN_KEY, payload);
  } catch {
    return;
  }
}

function readGitHubAppReturnState() {
  try {
    const raw = String(localStorage.getItem(STORAGE_GITHUB_APP_RETURN_KEY) || "").trim();
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearGitHubAppReturnState() {
  try {
    localStorage.removeItem(STORAGE_GITHUB_APP_RETURN_KEY);
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
  state.shareKey = parseShareKeyFromParams(params);
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
  if (state.shareKey) params.set("share_key", state.shareKey);
  const dashboardHash = document.getElementById("qa-dashboard") ? "#qa-dashboard" : "";

  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${dashboardHash}`;
  window.history.replaceState({}, "", next);
}

function appendActiveShareKey(params) {
  if (!(params instanceof URLSearchParams)) {
    return params;
  }
  const shareKey = String(state.shareKey || "").trim();
  if (shareKey) {
    params.set("share_key", shareKey);
  }
  return params;
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
  if (state.shareKey) {
    params.set("share_key", state.shareKey);
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
  if (state.shareKey) {
    params.set("share_key", state.shareKey);
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

function canManageReportSharing() {
  return isDashboardAuthorized();
}

async function requestSharedReportLink(runId) {
  const params = new URLSearchParams({ run_id: String(runId || "").trim() });
  const response = await fetch(`/api/qa/share?${params.toString()}`, {
    method: "POST",
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to manage shared links.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to create shared link");
  }
  return data;
}

async function requestPromoRedemption(code, shareRunId = "") {
  const response = await fetch("/api/promo/redeem", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: String(code || "").trim(),
      share_run_id: String(shareRunId || "").trim()
    })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in to redeem this team code.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not redeem team code");
  }
  return data;
}

async function requestShareOfferCheckout(code, shareRunId = "") {
  const user = window.SwarmAuth && typeof window.SwarmAuth.getUser === "function" ? window.SwarmAuth.getUser() : null;
  const response = await fetch("/api/stripe/share-offer", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: String(code || "").trim(),
      share_run_id: String(shareRunId || "").trim(),
      email: String(user?.email || "").trim()
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = String(data?.error || "").trim() || "Could not start checkout";
    const normalizedError = error.toLowerCase();
    if (response.status === 409 || normalizedError.includes("not configured")) {
      return { ok: false, unavailable: true, error };
    }
    throw new Error(error);
  }
  return {
    ok: true,
    checkoutUrl: String(data.checkout_url || "").trim()
  };
}

function userHasRedeemedPromoCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode || !window.SwarmAuth || typeof window.SwarmAuth.getUser !== "function") {
    return false;
  }
  const user = window.SwarmAuth.getUser();
  const offers = Array.isArray(user?.redeemed_offers) ? user.redeemed_offers : [];
  return offers.some((item) => String(item?.code || "").trim().toUpperCase() === normalizedCode);
}

function buildPromoRedeemUrl(code, options = {}) {
  const baseUrl = String(options.baseUrl || "/dashboard").trim() || "/dashboard";
  const url = new URL(baseUrl, window.location.origin);
  const promoCode = String(code || "").trim().toUpperCase();
  const shareRunId = String(options.shareRunId || "").trim();
  if (promoCode) {
    url.searchParams.set("promo", promoCode);
    url.searchParams.set("mode", "signup");
  }
  if (shareRunId) {
    url.searchParams.set("share_run_id", shareRunId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function readWindowPromoConfig() {
  const candidate = window.SwarmReportSharePromo;
  return candidate && typeof candidate === "object" ? candidate : {};
}

function getSharedReportPromotionConfig() {
  const source = {
    ...DEFAULT_SHARED_REPORT_PROMO,
    ...readWindowPromoConfig()
  };
  return {
    enabled: source.enabled !== false,
    headline: String(source.headline || DEFAULT_SHARED_REPORT_PROMO.headline).trim(),
    body: String(source.body || DEFAULT_SHARED_REPORT_PROMO.body).trim(),
    ctaLabel: String(source.ctaLabel || source.cta_label || DEFAULT_SHARED_REPORT_PROMO.ctaLabel).trim(),
    ctaUrl: String(source.ctaUrl || source.cta_url || DEFAULT_SHARED_REPORT_PROMO.ctaUrl).trim(),
    couponCode: String(source.couponCode || source.coupon_code || "").trim(),
    couponLabel: String(source.couponLabel || source.coupon_label || DEFAULT_SHARED_REPORT_PROMO.couponLabel).trim(),
    note: String(source.note || "").trim()
  };
}

function renderSharedReportPromotionBanner(report, row = {}) {
  if (!hasSharedReportAccess()) {
    return "";
  }

  const promo = getSharedReportPromotionConfig();
  if (!promo.enabled || !promo.ctaUrl) {
    return "";
  }

  const targetName = String(
    report?.target ||
      row?.target ||
      row?.brand_name ||
      toDisplayProjectName(row?.brand_key || "") ||
      "this product"
  ).trim();
  const shareRunId = String(report?.run_id || row?.run_id || state.selectedRunId || state.requestedRunId || "").trim();
  const hasRedeemed = promo.couponCode ? userHasRedeemedPromoCode(promo.couponCode) : false;
  const redeemUrl = promo.couponCode ? buildPromoRedeemUrl(promo.couponCode, { baseUrl: promo.ctaUrl, shareRunId }) : "";

  const couponMarkup = promo.couponCode
    ? `
      <div class="report-share-banner-code">
        <span class="report-share-banner-code-label">${escapeHtml(promo.couponLabel || "Team code")}</span>
        <code>${escapeHtml(promo.couponCode)}</code>
        <button
          type="button"
          class="report-action-button"
          data-copy-text="${escapeHtml(promo.couponCode)}"
          data-label="Copy code"
        >
          Copy code
        </button>
      </div>
    `
    : "";

  const actionMarkup = promo.couponCode
    ? `
      <button
        type="button"
        class="report-action-button report-action-button-primary"
        data-redeem-promo-code="${escapeHtml(promo.couponCode)}"
        data-redeem-url="${escapeHtml(redeemUrl)}"
        data-redeem-share-run="${escapeHtml(shareRunId)}"
        data-label="${escapeHtml(hasRedeemed ? "Offer redeemed" : promo.ctaLabel || "Redeem team offer")}"
      >
        ${escapeHtml(hasRedeemed ? "Offer redeemed" : promo.ctaLabel || "Redeem team offer")}
      </button>
    `
    : `<a class="report-action-button report-action-button-primary" href="${escapeHtml(promo.ctaUrl)}" target="_blank" rel="noreferrer">${escapeHtml(promo.ctaLabel || "Try Swarm Tester")}</a>`;

  return `
    <section class="report-share-banner" aria-label="Shared report promotion">
      <div class="report-share-banner-copy">
        <p class="report-share-banner-kicker">Shared report</p>
        <h2>${escapeHtml(promo.headline)}</h2>
        <p>${escapeHtml(promo.body.replaceAll("your site", targetName === "this product" ? "your site" : `${targetName}`))}</p>
        ${promo.note ? `<p class="report-share-banner-note">${escapeHtml(promo.note)}</p>` : ""}
      </div>
      <div class="report-share-banner-actions">
        ${couponMarkup}
        ${actionMarkup}
      </div>
    </section>
  `;
}

let reportToastTimerId = 0;

function showReportToast(message, tone = "success") {
  const safeMessage = String(message || "").trim();
  if (!safeMessage || typeof document === "undefined") {
    return;
  }

  let host = document.querySelector("[data-report-toast-host='true']");
  if (!host) {
    host = document.createElement("div");
    host.className = "report-toast-host";
    host.setAttribute("data-report-toast-host", "true");
    document.body.appendChild(host);
  }

  let toast = host.querySelector(".report-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "report-toast";
    host.appendChild(toast);
  }

  toast.className = `report-toast report-toast--${tone === "error" ? "error" : "success"}`;
  toast.textContent = safeMessage;
  window.clearTimeout(reportToastTimerId);
  window.requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });
  reportToastTimerId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function renderLlmCopyButtons(scope, options = {}) {
  const safeScope = String(scope || "").trim().toLowerCase();
  const findingIndex = Number(options.findingIndex);
  const indexAttr = Number.isInteger(findingIndex) && findingIndex >= 0 ? ` data-llm-finding-index="${findingIndex}"` : "";
  const findingToken = String(options.findingToken || "").trim();
  const tokenAttr = findingToken ? ` data-llm-finding-token="${escapeHtml(findingToken)}"` : "";
  const actionLabel = safeScope === "final" ? "Copy Full Fix for AI Dev" : "Copy Fix for AI Dev";
  return `
    <div class="llm-copy-actions">
      <button type="button" class="llm-copy-button llm-copy-button-unified" data-llm-copy="1" data-llm-scope="${escapeHtml(safeScope)}"${indexAttr}${tokenAttr}>
        <span>${escapeHtml(actionLabel)}</span>
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

function buildFindingModalToken(finding, findingIndex = 0) {
  return toAnchorToken(
    finding?.id || finding?.title || finding?.observed_behavior || `finding-${findingIndex + 1}`,
    `finding-${findingIndex + 1}`
  );
}

function buildFindingModalDataAttributes(finding, findingIndex = 0) {
  return [
    `data-open-finding-modal="1"`,
    `data-finding-index="${escapeHtml(String(Math.max(0, findingIndex)))}"`,
    `data-finding-token="${escapeHtml(buildFindingModalToken(finding, findingIndex))}"`,
    `aria-haspopup="dialog"`
  ].join(" ");
}

function formatFindingAttemptForPrompt(attempt, index = 0) {
  const safeAttempt = attempt && typeof attempt === "object" ? attempt : {};
  const step = Number.isFinite(Number(safeAttempt?.step)) ? Math.round(Number(safeAttempt.step)) : index + 1;
  const action = redactVendorText(String(safeAttempt?.action || "").trim()) || "inspect";
  const target = redactVendorText(String(safeAttempt?.target || "").trim()) || "affected area";
  const outcome = redactVendorText(String(safeAttempt?.outcome || "").trim()) || "state observed";
  const extras = [
    redactVendorText(String(safeAttempt?.ts || "").trim()) ? `At: ${redactVendorText(String(safeAttempt.ts).trim())}` : "",
    redactVendorText(String(safeAttempt?.url || "").trim()) ? `URL: ${redactVendorText(String(safeAttempt.url).trim())}` : "",
    redactVendorText(String(safeAttempt?.note || "").trim()) ? `Note: ${redactVendorText(String(safeAttempt.note).trim())}` : ""
  ].filter(Boolean);
  return `${step}. ${action} -> ${target} -> ${outcome}${extras.length ? ` (${extras.join(" | ")})` : ""}`;
}

function collectFindingEvidenceBundle(report, finding, options = {}) {
  const safeReport = report && typeof report === "object" ? report : {};
  const safeFinding = finding && typeof finding === "object" ? finding : {};
  const maxMediaItems = Math.max(1, Math.min(8, Number(options?.maxMediaItems) || 6));
  const maxLogs = Math.max(1, Math.min(12, Number(options?.maxLogs) || 8));
  const maxAttempts = Math.max(1, Math.min(16, Number(options?.maxAttempts) || 10));
  const diagnostics = getFindingDiagnosticDetails(safeFinding);
  const screenshotRefs = getRelevantFindingScreenshotRefs(safeReport, safeFinding, { maxItems: maxMediaItems });
  const videoRefs = Array.isArray(safeFinding?.evidence?.videos) ? safeFinding.evidence.videos : [];
  const screenshotSummary = getEvidenceAttachmentSummary(safeReport, "screenshot", screenshotRefs);
  const videoSummary = getEvidenceAttachmentSummary(safeReport, "video", videoRefs);
  const screenshotItems = resolveEvidenceImageItems(safeReport, screenshotRefs, { maxItems: maxMediaItems });
  const videoItems = resolveEvidenceVideoItems(safeReport, videoRefs, { maxItems: maxMediaItems });
  const proofModel = buildFindingProofModel(safeReport, safeFinding, {
    maxItems: maxMediaItems,
    preferVideo: true,
    requireVideo: false
  });
  const mediaItems = [];
  const seenMediaUrls = new Set();
  const pushMediaItem = (kind, item, source = "finding") => {
    const url = String(item?.url || "").trim();
    if (!url || seenMediaUrls.has(url)) {
      return;
    }
    seenMediaUrls.add(url);
    mediaItems.push({ kind, url, source });
  };

  if (proofModel?.primaryAsset?.url) {
    pushMediaItem(String(proofModel.primaryAsset.kind || "").trim().toLowerCase() === "video" ? "video" : "screenshot", proofModel.primaryAsset, proofModel.state === "fallback" ? "run fallback" : "primary");
  }
  videoItems.forEach((item) => pushMediaItem("video", item));
  screenshotItems.forEach((item) => pushMediaItem("screenshot", item));

  const consoleLogs = Array.isArray(safeFinding?.evidence?.console_logs)
    ? safeFinding.evidence.console_logs.map((item) => redactVendorText(String(item || "").trim())).filter(Boolean).slice(0, maxLogs)
    : [];
  const networkLogs = Array.isArray(safeFinding?.evidence?.network_logs)
    ? safeFinding.evidence.network_logs.map((item) => redactVendorText(String(item || "").trim())).filter(Boolean).slice(0, maxLogs)
    : [];
  const attemptedActions = Array.isArray(diagnostics?.attempted_actions)
    ? diagnostics.attempted_actions.slice(0, maxAttempts).map((attempt, index) => formatFindingAttemptForPrompt(attempt, index))
    : [];

  return {
    diagnostics,
    proofModel,
    screenshotSummary,
    videoSummary,
    mediaItems,
    screenshotReferences: screenshotSummary.references.slice(0, maxMediaItems),
    videoReferences: videoSummary.references.slice(0, maxMediaItems),
    consoleLogs,
    networkLogs,
    attemptedActions
  };
}

function buildFindingEvidencePromptLines(report, finding, options = {}) {
  const bundle = collectFindingEvidenceBundle(report, finding, options);
  const diagnostics = bundle.diagnostics && typeof bundle.diagnostics === "object" ? bundle.diagnostics : {};
  const lines = [
    "Diagnostics",
    `- Current URL: ${redactVendorText(String(diagnostics?.current_url || finding?.page?.url || "n/a").trim()) || "n/a"}`,
    `- Current state: ${redactVendorText(String(diagnostics?.current_state || "n/a").trim()) || "n/a"}`,
    `- Last good step: ${redactVendorText(String(diagnostics?.last_successful_step || "n/a").trim()) || "n/a"}`,
    `- Why this was reported: ${redactVendorText(String(diagnostics?.failure_reason || finding?.observed_behavior || "n/a").trim()) || "n/a"}`
  ];

  if (Number.isFinite(Number(diagnostics?.repeated_state_count)) && Number(diagnostics.repeated_state_count) > 0) {
    lines.push(`- Same-state repeats: ${Math.round(Number(diagnostics.repeated_state_count))}`);
  }

  lines.push("", "Evidence");
  lines.push(`- Proof state: ${bundle.proofModel?.label || "Unknown"}`);
  lines.push(`- Screenshot proof: ${bundle.screenshotSummary.text || "None"}`);
  lines.push(`- Video proof: ${bundle.videoSummary.text || "None"}`);

  if (bundle.mediaItems.length) {
    lines.push("- Renderable proof URLs:");
    bundle.mediaItems.forEach((item, index) => {
      const label = item.kind === "video" ? "Video" : "Screenshot";
      const sourceSuffix = item.source && item.source !== "finding" ? ` (${item.source})` : "";
      lines.push(`  ${index + 1}. ${label}${sourceSuffix}: ${item.url}`);
    });
  }

  if (bundle.screenshotReferences.length) {
    lines.push("- Screenshot references without inline preview:");
    bundle.screenshotReferences.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item}`);
    });
  }

  if (bundle.videoReferences.length) {
    lines.push("- Video references without inline preview:");
    bundle.videoReferences.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item}`);
    });
  }

  lines.push("", "Actions tried");
  if (bundle.attemptedActions.length) {
    bundle.attemptedActions.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- No exact action trail was saved.");
  }

  lines.push("", "Relevant logs");
  if (bundle.consoleLogs.length) {
    lines.push("- Console:");
    bundle.consoleLogs.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push("- Console: no nearby console events were saved.");
  }

  if (bundle.networkLogs.length) {
    lines.push("- Network:");
    bundle.networkLogs.forEach((item) => lines.push(`  - ${item}`));
  } else {
    lines.push("- Network: no nearby network events were saved.");
  }

  return lines;
}

function dedupeProblemRefs(values, maxItems = 8) {
  const source = Array.isArray(values) ? values : [];
  const unique = [];
  const seen = new Set();
  for (const value of source) {
    const raw = String(value || "").trim();
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    unique.push(raw);
    if (unique.length >= maxItems) {
      break;
    }
  }
  return unique;
}

function normalizeProblemSignature(...parts) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" | ");
}

function buildTimelineProblemAttempt(stepValue, span, index = 0) {
  const pageUrl = redactVendorText(String(span?.page?.url || "").trim());
  const fallbackOutcome =
    redactVendorText(String(span?.summary || span?.label || "This part of the flow felt rough.").trim()) ||
    "This part of the flow felt rough.";
  const raw = redactVendorText(String(stepValue || "").trim());
  if (!raw) {
    return {
      step: index + 1,
      action: "inspect",
      target: redactVendorText(String(span?.label || "affected area").trim()) || "affected area",
      outcome: fallbackOutcome,
      url: pageUrl || ""
    };
  }

  const arrowParts = raw
    .split(/\s*->\s*/g)
    .map((part) => redactVendorText(part).trim())
    .filter(Boolean);
  if (arrowParts.length >= 3) {
    return {
      step: index + 1,
      action: arrowParts[0],
      target: arrowParts[1],
      outcome: arrowParts.slice(2).join(" -> "),
      url: pageUrl || ""
    };
  }

  const colonMatch = raw.match(/^([a-z][a-z0-9_ ]{1,40})\s*:\s*(.+)$/i);
  if (colonMatch) {
    return {
      step: index + 1,
      action: colonMatch[1].trim().toLowerCase(),
      target: colonMatch[2].trim(),
      outcome: fallbackOutcome,
      url: pageUrl || ""
    };
  }

  return {
    step: index + 1,
    action: /^\d+$/.test(raw) ? "step" : "inspect",
    target: /^\d+$/.test(raw) ? `Step ${raw}` : raw,
    outcome: fallbackOutcome,
    url: pageUrl || ""
  };
}

function buildTimelineProblemEntry(report, span, index = 0) {
  const safeSpan = span && typeof span === "object" ? span : {};
  const specificCopy = buildExperienceTimelineSpecificCopy(
    report,
    safeSpan,
    redactVendorText(String(safeSpan.label || "").trim()) || `Friction point ${index + 1}`,
    redactVendorText(String(safeSpan.summary || safeSpan.label || "This part of the flow slowed the tester down.").trim()) ||
      "This part of the flow slowed the tester down."
  );
  const label = specificCopy.label;
  const summary = specificCopy.summary;
  const pageUrl = redactVendorText(String(safeSpan?.page?.url || "").trim());
  const pageTitle = redactVendorText(String(safeSpan?.page?.title || "").trim());
  const metrics = safeSpan?.metrics && typeof safeSpan.metrics === "object" ? safeSpan.metrics : {};
  const evidence = safeSpan?.evidence && typeof safeSpan.evidence === "object" ? safeSpan.evidence : {};
  const resolvedAttempts = resolveExperienceTimelineAttempts(report, safeSpan);
  const attemptedActions = resolvedAttempts.length
    ? resolvedAttempts.slice(0, 6).map((attempt, actionIndex) => ({
        step: Number.isFinite(Number(attempt?.step)) ? Math.round(Number(attempt.step)) : actionIndex + 1,
        action: redactVendorText(String(attempt?.action || "inspect").trim()) || "inspect",
        target: redactVendorText(String(attempt?.target || label).trim()) || label,
        outcome: redactVendorText(String(attempt?.outcome || summary).trim()) || summary,
        url: pageUrl || redactVendorText(String(attempt?.url || "").trim())
      }))
    : [
        {
          step: 1,
          action: "inspect",
          target: label,
          outcome: summary,
          url: pageUrl || ""
        }
      ];
  const lastSuccessfulStep = attemptedActions.length
    ? formatExperienceTimelineAttemptLine(attemptedActions[0]).replace(/\s+—.*$/, "")
    : `Reached ${label}`;
  const screenshotRefs = dedupeProblemRefs([...(Array.isArray(evidence.screenshot_ids) ? evidence.screenshot_ids : []), ...(Array.isArray(evidence.frame_ids) ? evidence.frame_ids : [])], 8);
  const videoItem = resolveExperienceTimelineVideoItem(report);
  const videoRef = String(videoItem?.raw || videoItem?.url || "").trim();
  const priorityScore = Math.max(48, Math.min(89, Math.round(Number(safeSpan.score) || 62)));

  return {
    id: `timeline-${toAnchorToken(String(safeSpan.id || `span-${index + 1}`), `timeline-${index + 1}`)}`,
    title: label,
    type: "frustration_point",
    severity: "medium",
    confidence: Math.max(0.35, Math.min(0.95, Number(safeSpan.confidence) || 0.74)),
    expected_behavior: `${label} should stay smooth and keep the tester moving forward.`,
    observed_behavior: summary,
    fix_hint:
      redactVendorText(String(safeSpan.fix_direction || "").trim()) ||
      "Reduce the friction in this step so the user can keep moving without hesitation.",
    journey: pageTitle || "General flow",
    page: pageUrl ? { url: pageUrl } : {},
    emotional_reaction: {
      primary: "frustration",
      intensity: 2,
      signals: summary ? [summary] : []
    },
    evidence: {
      proof_source: videoRef ? "run_fallback" : "none",
      screenshots: screenshotRefs,
      videos: videoRef ? [videoRef] : [],
      console_logs: Array.isArray(evidence.console_logs) ? evidence.console_logs.slice(0, 6) : [],
      network_logs: Array.isArray(evidence.network_logs) ? evidence.network_logs.slice(0, 6) : []
    },
    diagnostic_details: {
      page_loaded: Boolean(pageUrl),
      current_url: pageUrl || "",
      current_state: summary,
      last_successful_step: lastSuccessfulStep,
      failure_reason: summary,
      attempted_actions: attemptedActions,
      ...(Number(metrics.same_state_count) > 0 ? { repeated_state_count: Math.round(Number(metrics.same_state_count)) } : {})
    },
    _problemPriorityScore: priorityScore,
    _problemSource: "experience_timeline",
    _timelineSpanId: String(safeSpan.id || `span-${index + 1}`),
    _timelineLevel: "friction"
  };
}

function getDisplayProblemPriorityScore(problem) {
  const explicit = Number(problem?._problemPriorityScore);
  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.min(100, Math.round(explicit)));
  }
  return computeFindingPriorityScore(problem);
}

function buildDisplayProblemEntries(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const timeline = getExperienceTimeline(report);
  const syntheticProblems = [];
  const seen = new Set(
    findings.map((finding) =>
      normalizeProblemSignature(finding?.title, finding?.observed_behavior, finding?.page?.url)
    )
  );

  if (timeline?.spans?.length) {
    const frictionSpans = timeline.spans.filter((span) => String(span?.level || "").trim().toLowerCase() === "friction");
    frictionSpans.forEach((span, index) => {
      const candidate = buildTimelineProblemEntry(report, span, index);
      const signature = normalizeProblemSignature(candidate?.title, candidate?.observed_behavior, candidate?.page?.url);
      if (!signature || seen.has(signature)) {
        return;
      }
      seen.add(signature);
      syntheticProblems.push(candidate);
    });
  }

  return [...findings, ...syntheticProblems].sort((left, right) => {
    const scoreDiff = getDisplayProblemPriorityScore(right) - getDisplayProblemPriorityScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const severityDiff = findingSeverityWeight(right?.severity) - findingSeverityWeight(left?.severity);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""));
  });
}

function resolveActiveFindingContext(trigger) {
  const target = trigger instanceof HTMLElement ? trigger : null;
  const { report, row } = resolveActiveReportContext();
  const findings = buildDisplayProblemEntries(report);
  if (!report || !findings.length) {
    return { report, row, finding: null, findingIndex: -1 };
  }

  const requestedIndex = Number(target?.getAttribute("data-finding-index"));
  const requestedToken = String(target?.getAttribute("data-finding-token") || "").trim();
  let findingIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : -1;
  let finding = findingIndex >= 0 ? findings[findingIndex] || null : null;

  if ((!finding || (requestedToken && buildFindingModalToken(finding, findingIndex) !== requestedToken)) && requestedToken) {
    findingIndex = findings.findIndex((item, index) => buildFindingModalToken(item, index) === requestedToken);
    finding = findingIndex >= 0 ? findings[findingIndex] : null;
  }

  return {
    report,
    row,
    finding: finding || null,
    findingIndex: finding ? findingIndex : -1
  };
}

function summarizeEvidenceLinks(report, kind, links, options = {}) {
  const values = Array.isArray(links) ? links : [];
  if (!values.length) {
    return {
      items: [],
      renderableCount: 0,
      references: [],
      referenceCount: 0
    };
  }

  const normalizedKind = String(kind || "").trim().toLowerCase() === "video" ? "video" : "screenshot";
  const maxItems = Math.max(1, Math.min(24, Number(options?.maxItems) || values.length || 1));
  const evidenceIndexMap = buildEvidenceIndexMap(report, normalizedKind);
  const mediaMatcher = normalizedKind === "video" ? isLikelyVideoUrl : isLikelyImageUrl;
  const items = [];
  const seenUrls = new Set();
  const references = [];
  const seenReferences = new Set();

  for (let index = 0; index < values.length; index += 1) {
    const raw = values[index];
    const url = resolveEvidenceDisplayUrl(report, normalizedKind, raw, evidenceIndexMap);
    if (url && mediaMatcher(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      items.push({ raw, url, index });
      if (items.length >= maxItems) {
        break;
      }
      continue;
    }

    const reference = String(raw || "").trim().slice(0, 160);
    if (!reference) {
      continue;
    }

    const lookup = reference.toLowerCase();
    if (seenReferences.has(lookup)) {
      continue;
    }

    seenReferences.add(lookup);
    references.push(reference);
  }

  return {
    items,
    renderableCount: items.length,
    references,
    referenceCount: references.length
  };
}

function findingNeedsRelevantScreenshotTail(finding) {
  const diagnostics = getFindingDiagnosticDetails(finding);
  const repeatedStateCount = Number(diagnostics?.repeated_state_count);
  if (Number.isFinite(repeatedStateCount) && repeatedStateCount > 0) {
    return true;
  }

  const message = String(
    [
      finding?.observed_behavior,
      diagnostics?.current_state,
      diagnostics?.failure_reason
    ]
      .filter(Boolean)
      .join(" ")
  )
    .trim()
    .slice(0, 4000)
    .toLowerCase();

  return /timed out|timeout|stalled|same waiting state|same state|never advanced|did not advance|did not progress|spinner|generating/.test(message);
}

function getRecentEvidenceRefs(values, maxItems = 6) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) {
    return [];
  }

  const recent = [];
  const seen = new Set();
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const raw = String(source[index] || "").trim();
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    recent.push(raw);
    if (recent.length >= maxItems) {
      break;
    }
  }

  return recent;
}

function isLikelyAuthCheckpointRef(value) {
  const raw = String(value || "").trim().toLowerCase();
  return Boolean(
    raw &&
      /(auth[-_]|authentry|login|sign-?in|otp|magic[-_]?link|verification|submit-attempted|auth-flow|email)/.test(raw)
  );
}

function filterMixedAuthCheckpointRefs(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) {
    return [];
  }

  const hasNonAuth = list.some((item) => !isLikelyAuthCheckpointRef(item));
  if (!hasNonAuth) {
    return list;
  }

  return list.filter((item) => !isLikelyAuthCheckpointRef(item));
}

function getRelevantFindingScreenshotRefs(report, finding, options = {}) {
  const screenshots = Array.isArray(finding?.evidence?.screenshots) ? finding.evidence.screenshots : [];
  if (!findingNeedsRelevantScreenshotTail(finding)) {
    return screenshots;
  }

  const repeatedStateCount = Number(getFindingDiagnosticDetails(finding)?.repeated_state_count);
  const recentWindow = Math.max(
    4,
    Math.min(8, Number.isFinite(repeatedStateCount) && repeatedStateCount > 0 ? Math.round(repeatedStateCount) + 1 : Number(options?.maxItems) || 6)
  );
  const galleryScreenshots =
    report?.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.screenshots)
      ? report.evidence_gallery.screenshots
      : [];

  const merged = [];
  const seen = new Set();
  for (const ref of [...getRecentEvidenceRefs(screenshots, recentWindow), ...getRecentEvidenceRefs(galleryScreenshots, recentWindow)]) {
    const raw = String(ref || "").trim();
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    merged.push(raw);
  }

  const filtered = filterMixedAuthCheckpointRefs(merged);
  return filtered.length ? filtered : merged.length ? merged : screenshots;
}

function resolveEvidenceImageItems(report, links, options = {}) {
  return summarizeEvidenceLinks(report, "screenshot", links, options).items;
}

function resolveEvidenceVideoItems(report, links, options = {}) {
  return summarizeEvidenceLinks(report, "video", links, options).items;
}

function getEvidenceAttachmentSummary(report, kind, links) {
  const normalizedKind = String(kind || "").trim().toLowerCase() === "video" ? "video" : "screenshot";
  const summary = summarizeEvidenceLinks(report, normalizedKind, links, { maxItems: 24 });
  const parts = [];

  if (summary.renderableCount) {
    parts.push(
      normalizedKind === "video"
        ? `${summary.renderableCount} video${summary.renderableCount === 1 ? "" : "s"}`
        : `${summary.renderableCount} screenshot proof${summary.renderableCount === 1 ? "" : "s"}`
    );
  } else if (normalizedKind === "screenshot") {
    parts.push("No screenshot proof");
  }

  if (summary.referenceCount) {
    parts.push(
      `${summary.referenceCount} ${normalizedKind} ref${summary.referenceCount === 1 ? "" : "s"}`
    );
  }

  return {
    ...summary,
    text: parts.join(" · ")
  };
}

function getFindingProofState(report, finding, screenshotSummary = null, videoSummary = null) {
  const source = String(finding?.evidence?.proof_source || "").trim().toLowerCase();
  const resolvedScreenshotSummary =
    screenshotSummary && typeof screenshotSummary === "object"
      ? screenshotSummary
      : summarizeEvidenceLinks(report, "screenshot", finding?.evidence?.screenshots || [], { maxItems: 24 });
  const resolvedVideoSummary =
    videoSummary && typeof videoSummary === "object"
      ? videoSummary
      : summarizeEvidenceLinks(report, "video", finding?.evidence?.videos || [], { maxItems: 24 });
  const screenshotCount = Number.isInteger(resolvedScreenshotSummary?.renderableCount)
    ? resolvedScreenshotSummary.renderableCount
    : 0;
  const videoCount = Number.isInteger(resolvedVideoSummary?.renderableCount)
    ? resolvedVideoSummary.renderableCount
    : 0;
  const totalRenderable = screenshotCount + videoCount;
  if (source === "run_fallback" && totalRenderable) {
    return "fallback";
  }
  if (source === "none") {
    return "missing";
  }
  if (totalRenderable) {
    return "verified";
  }
  return "missing";
}

function buildFindingProofModel(report, finding, options = {}) {
  const screenshots = getRelevantFindingScreenshotRefs(report, finding, { maxItems: 12 });
  const videos = Array.isArray(finding?.evidence?.videos) ? finding.evidence.videos : [];
  const screenshotSummary = summarizeEvidenceLinks(report, "screenshot", screenshots, { maxItems: 24 });
  const videoSummary = summarizeEvidenceLinks(report, "video", videos, { maxItems: 24 });
  const images = screenshotSummary.items.slice(0, Math.max(1, Math.min(12, Number(options?.maxItems) || 1)));
  const videoItems = videoSummary.items.slice(0, Math.max(1, Math.min(6, Number(options?.maxItems) || 1)));
  const requireVideo = options?.requireVideo !== false;
  const preferVideo = options?.preferVideo !== false;
  const state = requireVideo
    ? videoSummary.renderableCount
      ? getFindingProofState(report, finding, { renderableCount: 0, referenceCount: 0 }, videoSummary)
      : "missing"
    : getFindingProofState(report, finding, screenshotSummary, videoSummary);
  const source = String(finding?.evidence?.proof_source || "").trim().toLowerCase();
  const proofLabels = {
    verified: "Proof Attached",
    fallback: "Run Proof",
    missing: "Proof Missing"
  };
  const primaryAsset = requireVideo
    ? videoItems[0]
      ? { kind: "video", ...videoItems[0] }
      : null
    : preferVideo
      ? videoItems[0]
        ? { kind: "video", ...videoItems[0] }
        : images[0]
          ? { kind: "screenshot", ...images[0] }
          : null
      : images[0]
        ? { kind: "screenshot", ...images[0] }
        : videoItems[0]
          ? { kind: "video", ...videoItems[0] }
          : null;
  const totalRenderable = screenshotSummary.renderableCount + videoSummary.renderableCount;
  const totalReferences = screenshotSummary.referenceCount + videoSummary.referenceCount;
  let note = requireVideo ? "Video captured for this finding." : "Proof captured for this finding.";
  if (state === "fallback" && primaryAsset?.kind === "screenshot") {
    note = "No claim-specific screenshot was attached. Showing the closest run-level picture for context.";
  } else if (state === "fallback" && primaryAsset?.kind === "video") {
    note = "No claim-specific screenshot was attached. Showing the closest run-level video for context.";
  } else if (requireVideo && !videoSummary.renderableCount && screenshotSummary.renderableCount) {
    note = "Video proof is required for this finding. Saved pictures exist separately, but no playable video was attached.";
  } else if (requireVideo && !videoSummary.renderableCount && videoSummary.referenceCount) {
    note = "Video proof references exist, but no playable video is available for this finding.";
  } else if (!totalRenderable && totalReferences) {
    note = "Proof references exist, but no renderable screenshot or video is available for this finding.";
  } else if (primaryAsset?.kind === "video") {
    note = "Video captured for this finding.";
  } else if (primaryAsset?.kind === "screenshot") {
    note = "Screenshot captured for this finding.";
  } else if (state === "missing") {
    note = "This finding does not yet have screenshot or video proof attached.";
  }

  return {
    state,
    label: proofLabels[state] || proofLabels.missing,
    note,
    primaryAsset,
    images,
    videos: videoItems,
    imageCount: screenshotSummary.renderableCount,
    videoCount: videoSummary.renderableCount,
    renderableCount: totalRenderable,
    referenceCount: totalReferences,
    screenshotCount: screenshots.length,
    videoReferenceCount: videos.length,
    screenshotSummary,
    videoSummary
  };
}

function renderFindingProofCard(report, finding, title, options = {}) {
  const model = buildFindingProofModel(report, finding, {
    maxItems: options.maxItems || 1,
    preferVideo: options.preferVideo !== false,
    requireVideo: options.requireVideo !== false
  });
  const toneClass = String(options.toneClass || getFindingIssueToneClass(finding) || "severity-low").trim();
  const replayFrame = Number.isInteger(options.replayFrame) && options.replayFrame >= 0 ? options.replayFrame : -1;
  const replayTarget = String(options.replayTarget || "").trim();
  const primaryAsset = model.primaryAsset || null;
  const actions = [];

  if (primaryAsset) {
    actions.push(
      `<a href="${escapeHtml(primaryAsset.url)}" target="_blank" rel="noreferrer">Open ${escapeHtml(primaryAsset.kind)}</a>`
    );
  }
  if (replayTarget && replayFrame >= 0) {
    actions.push(
      `<button type="button" class="finding-proof-action-button" data-replay-target="${escapeHtml(
        replayTarget
      )}" data-frame-index="${escapeHtml(String(replayFrame))}">Jump to replay frame ${escapeHtml(
        String(replayFrame + 1)
      )}</button>`
    );
  }

  return `
    <div class="finding-proof-card is-${escapeHtml(model.state)} tone-${escapeHtml(toneClass)}">
      <div class="finding-proof-head">
        <span class="finding-section-label">${escapeHtml(options.kicker || "Proof")}</span>
        <span class="finding-proof-badge is-${escapeHtml(model.state)} tone-${escapeHtml(toneClass)}">${escapeHtml(model.label)}</span>
      </div>
      ${
        primaryAsset?.kind === "screenshot"
          ? `<a class="finding-proof-media" href="${escapeHtml(primaryAsset.url)}" target="_blank" rel="noreferrer">
              <img src="${escapeHtml(primaryAsset.url)}" alt="${escapeHtml(title)} screenshot proof" loading="lazy" onerror="this.closest('.finding-proof-media').style.display='none'" />
            </a>`
          : primaryAsset?.kind === "video"
            ? `<div class="finding-proof-media">
                <video src="${escapeHtml(primaryAsset.url)}" controls preload="metadata" playsinline onerror="this.closest('.finding-proof-media').style.display='none'"></video>
              </div>`
          : `<div class="finding-proof-empty">
              <strong>${escapeHtml(model.label)}</strong>
              <p>${escapeHtml(model.note)}</p>
            </div>`
      }
      <p class="finding-proof-note">${escapeHtml(model.note)}</p>
      ${
        model.referenceCount > 0 && model.renderableCount
          ? `<p class="finding-proof-count">${escapeHtml(
              [
                model.screenshotSummary.referenceCount
                  ? `${model.screenshotSummary.referenceCount} screenshot ref${model.screenshotSummary.referenceCount === 1 ? "" : "s"}`
                  : "",
                model.videoSummary.referenceCount
                  ? `${model.videoSummary.referenceCount} video ref${model.videoSummary.referenceCount === 1 ? "" : "s"}`
                  : ""
              ]
                .filter(Boolean)
                .join(" · ")
            )}</p>`
          : ""
      }
      ${
        actions.length
          ? `<div class="finding-proof-actions">${actions.join("")}</div>`
          : ""
      }
      ${
        (!primaryAsset && model.referenceCount) || model.videoCount > 0
          ? `<div class="finding-proof-supporting">
              ${renderLinkRow(report, finding?.evidence?.screenshots || [], "Screenshot")}
              ${renderLinkRow(report, finding?.evidence?.videos || [], "Video")}
            </div>`
          : ""
      }
    </div>
  `;
}

function renderFindingScreenshotGallery(report, finding, title) {
  const screenshots = getRelevantFindingScreenshotRefs(report, finding, { maxItems: 6 });
  if (!screenshots.length) {
    return '<p class="evidence-unavailable-note">No screenshots were captured for this finding.</p>';
  }

  const imageItems = resolveEvidenceImageItems(report, screenshots, { maxItems: 6 });
  const cards = [];
  for (let index = 0; index < imageItems.length; index += 1) {
    const resolvedUrl = imageItems[index].url;
    const caption =
      truncateText(
        findingNeedsRelevantScreenshotTail(finding)
          ? simplifyReportNarrative(
              getFindingDiagnosticDetails(finding)?.failure_reason || finding?.observed_behavior || finding?.title
            )
          : simplifyReportNarrative(finding?.observed_behavior || finding?.title || "Captured during the tester walkthrough."),
        110
      ) ||
      "Captured during the tester walkthrough.";
    cards.push(`
      <a class="finding-detail-shot" href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(title)} screenshot ${index + 1}" loading="lazy" onerror="this.closest('.finding-detail-shot').style.display='none'" />
        <span>${escapeHtml(caption)}</span>
      </a>
    `);
    if (cards.length >= 6) {
      break;
    }
  }

  if (!cards.length) {
    return '<p class="evidence-unavailable-note">Screenshot references were captured, but inline previews are unavailable for this finding.</p>';
  }

  return `<div class="finding-detail-shot-grid">${cards.join("")}</div>`;
}

function getFindingDiagnosticDetails(finding) {
  const raw = finding && typeof finding === "object" ? finding.diagnostic_details : null;
  return raw && typeof raw === "object" ? raw : {};
}

function hasDiagnosticDetails(diagnostics) {
  return Boolean(
    diagnostics &&
      typeof diagnostics === "object" &&
      (diagnostics.current_url ||
        diagnostics.current_state ||
        diagnostics.failure_reason ||
        diagnostics.last_successful_step ||
        (Array.isArray(diagnostics.attempted_actions) && diagnostics.attempted_actions.length))
  );
}

function renderDiagnosticDetailsMarkup(diagnostics, fallback = {}) {
  const safeDiagnostics = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  const attemptedActions = Array.isArray(diagnostics?.attempted_actions) ? diagnostics.attempted_actions : [];
  const actionMarkup = attemptedActions.length
    ? `<ol>${attemptedActions
        .map((attempt, index) => {
          const step = Number.isFinite(Number(attempt?.step)) ? `${Math.round(Number(attempt.step))}. ` : `${index + 1}. `;
          const action = redactVendorText(String(attempt?.action || "").trim()) || "inspect";
          const target = redactVendorText(String(attempt?.target || "").trim()) || "affected area";
          const outcome = redactVendorText(String(attempt?.outcome || "").trim()) || "state observed";
          const extras = [
            redactVendorText(String(attempt?.ts || "").trim()) ? `At: ${redactVendorText(String(attempt.ts).trim())}` : "",
            redactVendorText(String(attempt?.url || "").trim()) ? `URL: ${redactVendorText(String(attempt.url).trim())}` : "",
            redactVendorText(String(attempt?.note || "").trim()) ? `Note: ${redactVendorText(String(attempt.note).trim())}` : ""
          ].filter(Boolean);
          return `<li>${escapeHtml(`${step}${action} -> ${target} -> ${outcome}${extras.length ? ` (${extras.join(" | ")})` : ""}`)}</li>`;
        })
        .join("")}</ol>`
    : "<p>We did not save the exact action sequence for this finding.</p>";

  const repeatedStateCount = Number(diagnostics?.repeated_state_count);

  return `
    <div class="finding-detail-copy">
      <p><strong>Page loaded</strong> ${escapeHtml(safeDiagnostics?.page_loaded === true ? "Yes" : safeDiagnostics?.page_loaded === false ? "No" : "Unknown")}</p>
      <p><strong>Current URL</strong> ${escapeHtml(redactVendorText(safeDiagnostics?.current_url || fallback.current_url || "We did not save this part."))}</p>
      <p><strong>Current state</strong> ${escapeHtml(redactVendorText(safeDiagnostics?.current_state || fallback.current_state || "We did not save this part."))}</p>
      <p><strong>Last good step</strong> ${escapeHtml(redactVendorText(safeDiagnostics?.last_successful_step || fallback.last_successful_step || "We did not save this part."))}</p>
      <p><strong>Why this was reported</strong> ${escapeHtml(simplifyReportNarrative(safeDiagnostics?.failure_reason || fallback.failure_reason || "We did not save this part."))}</p>
      ${
        Number.isFinite(repeatedStateCount) && repeatedStateCount > 0
          ? `<p><strong>Same-state repeats</strong> ${escapeHtml(String(Math.round(repeatedStateCount)))}</p>`
          : ""
      }
    </div>
    <div class="finding-detail-copy">
      <p><strong>Actions tried</strong></p>
      ${actionMarkup}
    </div>
  `;
}

function renderFindingDiagnosticDetails(finding) {
  const diagnostics = getFindingDiagnosticDetails(finding);
  return renderDiagnosticDetailsMarkup(diagnostics, {
    current_url: finding?.page?.url || "",
    failure_reason: finding?.observed_behavior || ""
  });
}

function renderFindingTimelineSection(finding) {
  const diagnostics = getFindingDiagnosticDetails(finding);
  const attemptedActions = Array.isArray(diagnostics?.attempted_actions) ? diagnostics.attempted_actions.slice(0, 8) : [];
  const blockerAction = attemptedActions.length ? attemptedActions[attemptedActions.length - 1] : null;
  const repeatedStateCount = Number(diagnostics?.repeated_state_count);
  const blockerStepLabel = blockerAction
    ? `${redactVendorText(String(blockerAction.action || "inspect"))} -> ${redactVendorText(
        String(blockerAction.target || "affected area")
      )}`
    : "We did not save this part.";
  const timelineMarkup = attemptedActions.length
    ? `<ol>${attemptedActions
        .map((attempt, index) => {
          const step = Number.isFinite(Number(attempt?.step)) ? `${Math.round(Number(attempt.step))}. ` : `${index + 1}. `;
          const action = redactVendorText(String(attempt?.action || "").trim()) || "inspect";
          const target = redactVendorText(String(attempt?.target || "").trim()) || "affected area";
          const outcome = redactVendorText(String(attempt?.outcome || "").trim()) || "state observed";
          const timing = redactVendorText(String(attempt?.ts || "").trim());
          return `<li>${escapeHtml(`${step}${action} -> ${target} -> ${outcome}${timing ? ` (${timing})` : ""}`)}</li>`;
        })
        .join("")}</ol>`
    : "<p>We did not save the step-by-step list for this finding.</p>";

  return `
    <section class="finding-detail-section">
      <div class="finding-detail-section-head">
        <h3>What happened in order</h3>
      </div>
      <div class="finding-detail-copy">
        <p><strong>Last good step</strong> ${escapeHtml(redactVendorText(diagnostics?.last_successful_step || "We did not save this part."))}</p>
        <p><strong>Blocker step</strong> ${escapeHtml(blockerStepLabel)}</p>
        <p><strong>Current URL</strong> ${escapeHtml(redactVendorText(diagnostics?.current_url || finding?.page?.url || "We did not save this part."))}</p>
        <p><strong>Exact blocker</strong> ${escapeHtml(simplifyReportNarrative(diagnostics?.failure_reason || finding?.observed_behavior || "We did not save this part."))}</p>
        ${
          Number.isFinite(repeatedStateCount) && repeatedStateCount > 0
            ? `<p><strong>Repeated waits / retries</strong> ${escapeHtml(String(Math.round(repeatedStateCount)))}</p>`
            : ""
        }
      </div>
      <div class="finding-detail-copy">
        ${timelineMarkup}
      </div>
    </section>
  `;
}

function renderRelevantLogList(logs, emptyLabel) {
  const items = Array.isArray(logs)
    ? logs
        .map((item) => redactVendorText(String(item || "").trim()))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  if (!items.length) {
    return `<p>${escapeHtml(emptyLabel)}</p>`;
  }

  return `<ol>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ol>`;
}

function renderFindingRelevantLogsSection(finding) {
  const consoleLogs = Array.isArray(finding?.evidence?.console_logs) ? finding.evidence.console_logs : [];
  const networkLogs = Array.isArray(finding?.evidence?.network_logs) ? finding.evidence.network_logs : [];

  if (!consoleLogs.length && !networkLogs.length) {
    return "";
  }

  return `
    <section class="finding-detail-section">
      <div class="finding-detail-section-head">
        <h3>Relevant logs</h3>
        <p>The closest saved console and network events around this blocker.</p>
      </div>
      <div class="finding-detail-copy">
        <p><strong>Console</strong></p>
        ${renderRelevantLogList(consoleLogs, "No nearby console events were saved for this finding.")}
      </div>
      <div class="finding-detail-copy">
        <p><strong>Network</strong></p>
        ${renderRelevantLogList(networkLogs, "No nearby network events were saved for this finding.")}
      </div>
    </section>
  `;
}

function getReportFailureDiagnostics(report) {
  const raw = report && typeof report === "object" ? report.failure_diagnostics : null;
  return raw && typeof raw === "object" ? raw : {};
}

function renderReportFailureDiagnosticsSection(report) {
  const diagnostics = getReportFailureDiagnostics(report);
  if (!hasDiagnosticDetails(diagnostics)) {
    return "";
  }

  const targetUrl = String(report?.metadata?.target_url || report?.target || "").trim();
  const failureReason = String(
    diagnostics.failure_reason || report?.metadata?.failure_message || report?.summary?.note || ""
  ).trim();
  const galleryConsoleLogs =
    report && report.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.console_logs)
      ? report.evidence_gallery.console_logs.slice(-8)
      : [];
  const galleryNetworkLogs =
    report && report.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.network_logs)
      ? report.evidence_gallery.network_logs.slice(-10)
      : [];

  return `
    <section class="report-findings-ledger" id="section-failure-diagnostics">
      <div class="report-section-head">
        <h3>Failure diagnostics</h3>
        <p>This run failed before normal blocker extraction finished. These are the concrete details we saved anyway.</p>
      </div>
      <article class="finding-ledger-item">
        <div class="finding-ledger-body">
          ${renderDiagnosticDetailsMarkup(diagnostics, {
            current_url: targetUrl,
            failure_reason: failureReason,
            current_state: failureReason
          })}
          ${
            galleryConsoleLogs.length || galleryNetworkLogs.length
              ? `
                <section class="finding-detail-section">
                  <div class="finding-detail-section-head">
                    <h3>Relevant logs</h3>
                    <p>The closest saved browser events from the failed run.</p>
                  </div>
                  <div class="finding-detail-copy">
                    <p><strong>Console</strong></p>
                    ${renderRelevantLogList(galleryConsoleLogs, "No nearby console events were saved for this run.")}
                  </div>
                  <div class="finding-detail-copy">
                    <p><strong>Network</strong></p>
                    ${renderRelevantLogList(galleryNetworkLogs, "No nearby network events were saved for this run.")}
                  </div>
                </section>
              `
              : ""
          }
        </div>
      </article>
    </section>
  `;
}

function renderFindingDetailModalContent(report, row, finding, findingIndex) {
  const safeReport = report && typeof report === "object" ? report : {};
  const safeRow = row && typeof row === "object" ? row : {};
  const safeFinding = finding && typeof finding === "object" ? finding : {};
  const title = safeFinding.title || safeFinding.observed_behavior || safeFinding.id || `Finding ${findingIndex + 1}`;
  const typeVisual = getFindingTypeVisual(safeFinding.type);
  const severity = normalizeSeverity(safeFinding.severity);
  const priorityScore = getDisplayProblemPriorityScore(safeFinding);
  const confidencePct = toConfidencePercent(safeFinding.confidence);
  const journeyLabel = getFindingJourneyLabel(safeFinding);
  const recommendation = deriveFindingRecommendation(safeReport, safeFinding, findingIndex);
  const opinion = buildFindingOpinion(safeFinding);
  const emotion = getEmotionVisual(safeFinding?.emotional_reaction?.primary);
  const personaName = resolvePersonaName(safeRow);
  const findingAnchorId = `finding-${toAnchorToken(safeFinding?.id || safeFinding?.title || `finding-${findingIndex + 1}`)}`;
  const shareBaseUrl = buildReportShareUrl(safeReport?.run_id || safeRow?.run_id, safeRow);
  const findingUrl = shareBaseUrl ? `${shareBaseUrl}#${findingAnchorId}` : "";
  const fixHint = redactVendorText(safeFinding.fix_hint || "");
  const replayFrame = findFirstEvidenceIndex(
    safeFinding?.evidence?.screenshots || [],
    buildEvidenceIndexMap(safeReport, "screenshot")
  );
  const proofModel = buildFindingProofModel(safeReport, safeFinding, { maxItems: 1 });
  const screenshotSummary = getEvidenceAttachmentSummary(
    safeReport,
    "screenshot",
    safeFinding?.evidence?.screenshots || []
  );
  const videoSummary = getEvidenceAttachmentSummary(safeReport, "video", safeFinding?.evidence?.videos || []);
  const targetLabel = safeReport?.target || safeRow?.target || "Unknown target";
  const deliveredAt = safeRow?.delivered_at ? formatRelativeTime(safeRow.delivered_at) : "";
  const evidenceSummaryText =
    [screenshotSummary.text, videoSummary.text].filter(Boolean).join(" · ") || "No evidence attached";

  return `
    <div class="finding-detail-header">
      <div class="finding-detail-title-row">
        <span class="finding-type-chip ${escapeHtml(typeVisual.toneClass)}" aria-hidden="true">${escapeHtml(typeVisual.icon)}</span>
        <div class="finding-detail-heading">
          <h2 id="findingDetailModalTitle">${escapeHtml(title)}</h2>
          <p class="finding-detail-meta">
            ${escapeHtml(typeVisual.label)} · ${escapeHtml(journeyLabel)} · sure ${escapeHtml(String(confidencePct))}%${deliveredAt ? ` · ${escapeHtml(deliveredAt)}` : ""}
          </p>
        </div>
      </div>
      <div class="finding-detail-actions">
        ${findingUrl ? `<a href="${escapeHtml(findingUrl)}" target="_blank" rel="noreferrer">Open full report</a>` : ""}
        ${findingUrl ? `<button type="button" data-share-url="${escapeHtml(findingUrl)}" data-label="Copy finding link">Copy link</button>` : ""}
      </div>
      <div class="finding-detail-facts">
        <div class="finding-detail-fact">
          <span>Size</span>
          <strong>${escapeHtml(severity.toUpperCase())}</strong>
        </div>
        <div class="finding-detail-fact">
          <span>Fix first score</span>
          <strong>${escapeHtml(String(priorityScore))}/100</strong>
        </div>
        <div class="finding-detail-fact">
          <span>Proof</span>
          <strong>${escapeHtml(evidenceSummaryText)}</strong>
        </div>
        <div class="finding-detail-fact">
          <span>Page</span>
          <strong>${escapeHtml(targetLabel)}</strong>
        </div>
      </div>
    </div>
    <div class="finding-detail-grid">
      <section class="finding-detail-section finding-detail-section-proof">
        <div class="finding-detail-section-head">
          <h3>Proof</h3>
        </div>
        ${renderFindingProofCard(safeReport, safeFinding, title, {
          maxItems: 1,
          replayFrame
        })}
        ${
          screenshotSummary.renderableCount > 1
            ? `<div class="finding-detail-supporting">
                <p class="finding-detail-supporting-label">Relevant pictures around where it got stuck</p>
                ${renderFindingScreenshotGallery(safeReport, safeFinding, title)}
              </div>`
            : ""
        }
        <div class="finding-detail-supporting">
          ${renderLinkRow(safeReport, safeFinding?.evidence?.screenshots || [], "Screenshot")}
          ${renderLinkRow(safeReport, safeFinding?.evidence?.videos || [], "Video")}
        </div>
      </section>
      ${renderFindingTimelineSection(safeFinding)}
      ${renderFindingRelevantLogsSection(safeFinding)}
      <section class="finding-detail-section finding-detail-section-emphasis">
        <h3>What happened</h3>
        ${renderTesterVoice(personaName, opinion, `${emotion.emoji} ${emotion.label}`)}
        <div class="finding-detail-copy">
          <p><strong>Should have happened</strong> ${escapeHtml(safeFinding.expected_behavior || "We did not save this part.")}</p>
          <p><strong>What happened</strong> ${escapeHtml(simplifyReportNarrative(safeFinding.observed_behavior || "We did not save this part."))}</p>
        </div>
      </section>
      <section class="finding-detail-section">
        <h3>Diagnostic details</h3>
        ${renderFindingDiagnosticDetails(safeFinding)}
      </section>
      <section class="finding-detail-section">
        <div class="finding-detail-section-head">
          <h3>Fix idea</h3>
          ${renderLlmCopyButtons("finding", { findingIndex })}
        </div>
        <p>${escapeHtml(recommendation)}</p>
        ${fixHint ? `<p class="finding-detail-subnote"><strong>Helpful hint</strong> ${escapeHtml(fixHint)}</p>` : ""}
      </section>
      ${renderFindingEngineeringTriageSection(safeReport, safeFinding)}
      <section class="finding-detail-section">
        <h3>More facts</h3>
        <div class="finding-detail-facts finding-detail-facts-compact">
          <div class="finding-detail-fact">
            <span>Problem type</span>
            <strong>${escapeHtml(typeVisual.label)}</strong>
          </div>
          <div class="finding-detail-fact">
            <span>Proof status</span>
            <strong>${escapeHtml(proofModel.label)}</strong>
          </div>
          <div class="finding-detail-fact">
            <span>Tester reaction</span>
            <strong>${escapeHtml(emotion.label)}</strong>
          </div>
          <div class="finding-detail-fact">
            <span>Test</span>
            <strong>${escapeHtml(safeReport?.run_id || safeRow?.run_id || "Unknown")}</strong>
          </div>
          <div class="finding-detail-fact">
            <span>Saved proof</span>
            <strong>${
              proofModel.primaryAsset
                ? proofModel.primaryAsset.kind === "video"
                  ? "Video"
                  : Number.isInteger(replayFrame) && replayFrame >= 0
                    ? `Picture ${escapeHtml(String(replayFrame + 1))}`
                    : "Picture"
                : "No saved proof"
            }</strong>
          </div>
        </div>
      </section>
    </div>
  `;
}

function openFindingDetailModal(trigger) {
  if (!elements.findingDetailModal || !elements.findingDetailModalBody) {
    return;
  }

  const context = resolveActiveFindingContext(trigger);
  if (!context.report || !context.finding || context.findingIndex < 0) {
    return;
  }

  elements.findingDetailModalBody.innerHTML = renderFindingDetailModalContent(
    context.report,
    context.row,
    context.finding,
    context.findingIndex
  );
  elements.findingDetailModal.hidden = false;
  elements.findingDetailModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("finding-modal-open");
  state.findingModalTrigger = trigger instanceof HTMLElement ? trigger : null;
  attachShareButtons(elements.findingDetailModalBody);
  attachLlmCopyButtons(elements.findingDetailModalBody);
  window.requestAnimationFrame(() => {
    elements.findingDetailCloseButton?.focus();
  });
}

function closeFindingDetailModal(options = {}) {
  if (!elements.findingDetailModal) {
    return;
  }

  const restoreFocus = options?.restoreFocus !== false;
  const previousTrigger = state.findingModalTrigger;
  state.findingModalTrigger = null;
  elements.findingDetailModal.hidden = true;
  elements.findingDetailModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("finding-modal-open");

  if (restoreFocus && previousTrigger instanceof HTMLElement && document.contains(previousTrigger)) {
    previousTrigger.focus({ preventScroll: true });
  }
}

function buildFindingLlmPrompt(report, row, finding, findingIndex) {
  const safeReport = report && typeof report === "object" ? report : {};
  const safeRow = row && typeof row === "object" ? row : {};
  const safeFinding = finding && typeof finding === "object" ? finding : {};
  const recommendation = deriveFindingRecommendation(safeReport, safeFinding, findingIndex);
  const evidenceLines = buildFindingEvidencePromptLines(safeReport, safeFinding, {
    maxMediaItems: 6,
    maxLogs: 8,
    maxAttempts: 12
  });
  const shareUrl = buildReportShareUrl(safeReport?.run_id || safeRow?.run_id, safeRow);
  const findingType = formatFindingTypeLabel(safeFinding.type);
  const priority = getDisplayProblemPriorityScore(safeFinding);
  const title = String(safeFinding.title || safeFinding.id || `Finding ${findingIndex + 1}`).trim();

  return [
    "You are an LLM dev assistant. Generate an implementation-ready fix for the issue below.",
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
    ...evidenceLines,
    "Output requirements",
    "1. Root cause hypothesis tied to the observed behavior.",
    "2. Exact code-level patch plan with files/components to update.",
    "3. Final code changes (or pseudo-diff) for the fix.",
    "4. Regression tests to add.",
    "5. Validation checklist and manual QA steps."
  ].join("\n");
}

function buildFinalFixLlmPrompt(report, row) {
  const safeReport = report && typeof report === "object" ? report : {};
  const safeRow = row && typeof row === "object" ? row : {};
  const findings = buildDisplayProblemEntries(safeReport).slice(0, 4);
  const recommendations = Array.isArray(safeReport.recommendations) ? safeReport.recommendations.map((item) => redactVendorText(item)) : [];
  const shareUrl = buildReportShareUrl(safeReport?.run_id || safeRow?.run_id, safeRow);

  return [
    "You are an LLM dev assistant. Produce a complete remediation plan for this QA report.",
    "",
    "Context",
    `- Product: ${safeReport.target || safeRow.target || "Unknown target"}`,
    `- Run ID: ${safeReport.run_id || safeRow.run_id || "unknown"}`,
    `- Environment: ${getEnvironmentLabel(getActiveEnvironment())}`,
    shareUrl ? `- Report URL: ${shareUrl}` : "- Report URL: unavailable",
    "",
    "Top findings",
    ...(findings.length
      ? findings.flatMap((finding, index) => {
          const priority = getDisplayProblemPriorityScore(finding);
          const evidenceLines = buildFindingEvidencePromptLines(safeReport, finding, {
            maxMediaItems: 3,
            maxLogs: 4,
            maxAttempts: 6
          });
          return [
            `${index + 1}. ${finding.title || finding.id || "Untitled finding"} | ${String(finding.severity || "medium").toUpperCase()} | Priority ${priority}/100 | Confidence ${finding.confidence ?? "n/a"} | Fix hint: ${redactVendorText(finding.fix_hint || "n/a")}`,
            ...evidenceLines.map((line) => `   ${line}`)
          ];
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
  const buttons = Array.from(host.querySelectorAll("[data-llm-copy='1'][data-llm-scope]"));
  for (const button of buttons) {
    if (button.dataset.bound === "1") {
      continue;
    }
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const scope = String(button.getAttribute("data-llm-scope") || "").trim().toLowerCase();
      const findingToken = String(button.getAttribute("data-llm-finding-token") || "").trim();
      const baselineHtml = String(button.dataset.labelHtml || button.innerHTML || "Copy Fix for AI Dev").trim();
      if (!button.dataset.labelHtml) {
        button.dataset.labelHtml = baselineHtml;
      }

      const context = resolveActiveReportContext();
      const report = context.report;
      const row = context.row;
      if (!report || typeof report !== "object") {
        button.textContent = "Unavailable";
        button.disabled = true;
        window.setTimeout(() => {
          button.innerHTML = baselineHtml;
          button.disabled = false;
        }, 1200);
        return;
      }

      let promptText = "";
      if (scope === "finding") {
        const findingIndex = Number(button.getAttribute("data-llm-finding-index"));
        const displayProblems = buildDisplayProblemEntries(report);
        let finding = findingToken
          ? displayProblems.find((item, index) => buildFindingModalToken(item, index) === findingToken) || null
          : null;
        if (!finding && Number.isInteger(findingIndex) && findingIndex >= 0) {
          finding = displayProblems[findingIndex] || null;
        }
        if (!finding) {
          button.textContent = "Unavailable";
          button.disabled = true;
          window.setTimeout(() => {
            button.innerHTML = baselineHtml;
            button.disabled = false;
          }, 1200);
          return;
        }
        const resolvedIndex = displayProblems.indexOf(finding);
        promptText = buildFindingLlmPrompt(report, row, finding, resolvedIndex >= 0 ? resolvedIndex : Math.max(0, findingIndex));
      } else {
        promptText = buildFinalFixLlmPrompt(report, row);
      }

      button.textContent = "Copying…";
      button.disabled = true;
      const copied = await copyTextToClipboard(promptText);
      button.textContent = copied ? "Copied" : "Copy failed";
      showReportToast(copied ? "Copied fix plus evidence for your LLM dev." : "Copy failed.", copied ? "success" : "error");
      window.setTimeout(() => {
        button.innerHTML = baselineHtml;
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

function hasSharedReportAccess() {
  return Boolean(String(state.shareKey || "").trim() && String(state.selectedRunId || state.requestedRunId || "").trim());
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

function ensureRequestedRunFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const runIdFromUrl = parseRunIdFromParams(params);
  if (runIdFromUrl) {
    state.requestedRunId = runIdFromUrl;
    if (!state.selectedRunId) {
      state.selectedRunId = runIdFromUrl;
    }
  }
  return runIdFromUrl;
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
    resetQaAutomationState();
    if (elements.qaScheduleMeta) {
      elements.qaScheduleMeta.textContent = "Sign in to set up regular QA.";
    }
    if (elements.qaScheduleStateBadge) {
      elements.qaScheduleStateBadge.className = "issue-severity severity-low";
      elements.qaScheduleStateBadge.textContent = "Auth Required";
    }
    if (elements.qaScheduleSaveAction) {
      elements.qaScheduleSaveAction.disabled = true;
    }
    if (elements.qaScheduleRunNowAction) {
      elements.qaScheduleRunNowAction.disabled = true;
    }
    if (elements.qaScheduleToggleAction) {
      elements.qaScheduleToggleAction.disabled = true;
    }
    if (elements.qaAlertsMeta) {
      elements.qaAlertsMeta.textContent = "Sign in to load alerts.";
    }
    if (elements.qaAlertsItems) {
      elements.qaAlertsItems.innerHTML = '<div class="app-empty"><p>Sign in to load alerts.</p></div>';
    }
  }

  renderDistributionPacksPanel({
    error: "Sign in to load distribution packs.",
    clearData: true
  });
  resetDistributionLauncher();
  setDistributionLauncherMessage("Sign in to load submission brands and queue distribution packs.", "error");
  renderDistributionLauncher();

  setOnboardingMessage("", "");
  renderWorkerHealthIndicator();
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
    requestedRunId: state.requestedRunId,
    runs: state.runs,
    allRuns: state.allRuns,
    ...extra
  };
}

function getReportRuntimeHelpers(extra = {}) {
  return {
    getPinnedRunRow,
    isQueueActiveStatus,
    isRepoTriageActiveStatus,
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
  if (!state.onboarding.manualOverride && state.onboarding.forceOpen) {
    state.onboarding.forceOpen = false;
  }
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
      const connection = getCachedRepoConnection(getOnboardingBrandKey());
      const repoSelectionRequired =
        Boolean(connection.installation_id) &&
        Array.isArray(connection.repositories) &&
        connection.repositories.length > 0 &&
        !connection.selected_repo_full_name;
      if (repoSelectionRequired && !elements.onboardingRepoConnectionSelectWrap?.hidden) {
        elements.onboardingRepoConnectionSelect?.focus();
        elements.onboardingRepoConnectionSelect?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      elements.onboardingSubmitButton?.focus();
      return;
    }
    elements.onboardingNextButton?.focus();
  }, 80);
}

function maybeFocusOnboardingRepoConnectionSelection(options = {}) {
  if (!state.onboarding.pendingRepoSelectionFocus) {
    return;
  }
  const safeBrandKey = sanitizeBrandKey(options.brandKey || getOnboardingBrandKey());
  const connection = getCachedRepoConnection(safeBrandKey);
  const shouldFocus =
    clampOnboardingStep(state.onboarding.step || 1) === ONBOARDING_MAX_STEP &&
    state.onboarding.forceOpen === true &&
    Boolean(connection.installation_id) &&
    Array.isArray(connection.repositories) &&
    connection.repositories.length > 0 &&
    !connection.selected_repo_full_name &&
    !elements.onboardingRepoConnectionSelectWrap?.hidden;
  if (!shouldFocus) {
    return;
  }
  state.onboarding.pendingRepoSelectionFocus = false;
  window.setTimeout(() => {
    elements.onboardingRepoConnectionSelect?.focus();
    elements.onboardingRepoConnectionSelect?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 40);
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
  applyOnboardingRepoTriageConfig(safeConfig.repoTriage || safeConfig.repo_triage || {});

  updateOnboardingScopeUi();
  syncOnboardingPersonaField();
  syncOnboardingScenariosField();
  maybePopulateBrandKeyFromTarget();
  renderOnboardingRepoConnectionUi();
  void loadOnboardingRepoConnection(brandKey || getOnboardingBrandKey(), { force: true, includeRepositories: true });
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
  const repoTriage = normalizeRepoTriageConfigInput(config.repoTriage || config.repo_triage);

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
        repo_triage: repoTriage,
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

function normalizeMissionCopy(value, maxLength = 220) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
  if (!normalized) {
    return "";
  }
  return maxLength > 0 ? normalized.slice(0, maxLength).trim() : normalized;
}

function trimLeadingArticle(value) {
  return String(value || "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();
}

function buildMissionPersonaDisplay(persona) {
  const full = normalizeMissionCopy(
    String(persona || "")
      .replace(/^roleplay these icps:\s*/i, "")
      .replace(/^custom icp guidance:\s*/i, "")
      .replace(/^persona:\s*/i, ""),
    500
  );
  if (!full) {
    return {
      label: "Audience",
      detail: ""
    };
  }

  const labelCandidate = String(
    full.split(/\b(?:trying to|looking to|wanting to|evaluating whether|who|with|using|for)\b/i)[0] || ""
  ).trim();
  const cleaned = trimLeadingArticle(labelCandidate || full).replace(/[.:;,\-]+$/g, "").trim();
  const labelSource = cleaned || full;
  const label = labelSource.length > 44 ? truncateText(labelSource, 44) : labelSource;

  return {
    label: label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Audience",
    detail: full
  };
}

function normalizeMissionStep(step) {
  const normalized = normalizeMissionCopy(step, 220);
  if (!normalized) {
    return "";
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function buildDashboardMissionModel(mission = {}, row = null) {
  const safeMission = mission && typeof mission === "object" ? mission : {};
  const config = safeMission.config && typeof safeMission.config === "object" ? safeMission.config : {};
  const targetLabel = String(config.brandName || buildTargetLabelFromUrl(config.targetUrl) || row?.target || "")
    .trim()
    .slice(0, 120);
  const scopeMeta = getOnboardingScopeMeta(config.scopeMode);
  const steps = getUserMissionScenariosFromValue(config.scenarios).map(normalizeMissionStep).filter(Boolean).slice(0, 4);
  const persona = buildMissionPersonaDisplay(safeMission.persona);

  let headline = "";
  if (targetLabel && steps.length > 1) {
    headline = `Finish onboarding in ${targetLabel} and complete ${steps.length} follow-up tasks.`;
  } else if (targetLabel && steps.length === 1) {
    headline = `Finish onboarding in ${targetLabel} and complete the core task.`;
  } else if (steps.length > 1) {
    headline = `Finish onboarding and complete ${steps.length} follow-up tasks.`;
  } else if (steps.length === 1) {
    headline = `Finish onboarding and complete the core task.`;
  } else {
    headline =
      normalizeMissionCopy(safeMission.goal, 200) ||
      "Finish onboarding and complete a meaningful in-product task.";
  }

  const metaPills = [targetLabel, scopeMeta?.label, steps.length ? `${steps.length} task${steps.length === 1 ? "" : "s"}` : ""]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    headline,
    steps,
    personaLabel: persona.label,
    personaDetail: persona.detail,
    metaPills
  };
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

function parseLineListInput(value, maxItems = 8) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return String(value || "")
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeRepoConnectionRepository(value) {
  const repo = value && typeof value === "object" ? value : {};
  const owner = String(repo.owner || "").trim().slice(0, 200);
  const name = String(repo.name || "").trim().slice(0, 200);
  const fullName = String(repo.full_name || repo.fullName || "").trim().slice(0, 320) || (owner && name ? `${owner}/${name}` : "");
  return {
    id: Number.isFinite(Number(repo.id)) ? Number(repo.id) : null,
    owner: owner || null,
    name: name || null,
    full_name: fullName || null,
    default_branch: String(repo.default_branch || repo.defaultBranch || "").trim().slice(0, 128) || null,
    html_url: String(repo.html_url || repo.htmlUrl || "").trim().slice(0, 4096) || null
  };
}

function buildEmptyRepoConnection(brandKey = "") {
  return {
    brand_key: sanitizeBrandKey(brandKey),
    provider: "github",
    app_configured: true,
    connection_status: "disconnected",
    installation_id: null,
    installation_account_login: null,
    installation_account_type: null,
    selected_repo_id: null,
    selected_repo_owner: null,
    selected_repo_name: null,
    selected_repo_full_name: null,
    default_branch: null,
    path_allowlist: [],
    repositories: [],
    warning: "",
    updated_at: null
  };
}

function normalizeRepoConnectionPayload(payload, brandKey = "") {
  const source = payload && typeof payload === "object" ? payload : {};
  const connection = source.connection && typeof source.connection === "object" ? source.connection : {};
  const base = buildEmptyRepoConnection(brandKey || connection.brand_key || connection.brandKey);
  const repositoriesSource = Array.isArray(source.repositories)
    ? source.repositories
    : Array.isArray(connection.repositories)
      ? connection.repositories
      : [];
  return {
    ...base,
    brand_key: sanitizeBrandKey(connection.brand_key || connection.brandKey || base.brand_key),
    app_configured: source.app_configured !== false,
    connection_status: String(connection.connection_status || connection.connectionStatus || base.connection_status).trim() || base.connection_status,
    installation_id: Number.isFinite(Number(connection.installation_id || connection.installationId))
      ? Number(connection.installation_id || connection.installationId)
      : null,
    installation_account_login:
      String(connection.installation_account_login || connection.installationAccountLogin || "").trim().slice(0, 200) || null,
    installation_account_type:
      String(connection.installation_account_type || connection.installationAccountType || "").trim().slice(0, 64) || null,
    selected_repo_id: Number.isFinite(Number(connection.selected_repo_id || connection.selectedRepoId))
      ? Number(connection.selected_repo_id || connection.selectedRepoId)
      : null,
    selected_repo_owner:
      String(connection.selected_repo_owner || connection.selectedRepoOwner || "").trim().slice(0, 200) || null,
    selected_repo_name:
      String(connection.selected_repo_name || connection.selectedRepoName || "").trim().slice(0, 200) || null,
    selected_repo_full_name:
      String(connection.selected_repo_full_name || connection.selectedRepoFullName || "").trim().slice(0, 320) || null,
    default_branch:
      String(connection.default_branch || connection.defaultBranch || "").trim().slice(0, 128) || null,
    path_allowlist: parseLineListInput(connection.path_allowlist || connection.pathAllowlist || base.path_allowlist, 8),
    repositories: repositoriesSource.map(normalizeRepoConnectionRepository).filter((repo) => repo.full_name),
    warning: String(source.warning || "").trim().slice(0, 320),
    updated_at: String(connection.updated_at || connection.updatedAt || "").trim().slice(0, 128) || null
  };
}

function getCachedRepoConnection(brandKey = "") {
  const safeBrandKey = sanitizeBrandKey(brandKey);
  if (!safeBrandKey) {
    return buildEmptyRepoConnection();
  }
  return state.repoConnections.get(safeBrandKey) || buildEmptyRepoConnection(safeBrandKey);
}

function setCachedRepoConnection(brandKey = "", payload = null) {
  const safeBrandKey = sanitizeBrandKey(brandKey);
  if (!safeBrandKey) {
    return buildEmptyRepoConnection();
  }
  const normalized = normalizeRepoConnectionPayload(payload, safeBrandKey);
  state.repoConnections.set(safeBrandKey, normalized);
  return normalized;
}

function getOnboardingBrandKey() {
  const explicit = sanitizeBrandKey(String(elements.onboardingBrandKey?.value || ""));
  if (explicit) {
    return explicit;
  }
  const targetUrl = normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""), { writeBack: false });
  const inferred = sanitizeBrandKey(inferBrandKeyFromTargetUrl(targetUrl || ""));
  return inferred || sanitizeBrandKey(state.filters.brand || "");
}

function normalizeRepoTriageConfigInput(value) {
  const source = value && typeof value === "object" ? value : {};
  const provider = String(source.provider || "").trim().toLowerCase() === "github" ? "github" : "workspace";
  const refStrategy = String(source.ref_strategy || source.refStrategy || "").trim().toLowerCase();
  return {
    enabled: source.enabled === true,
    provider,
    repo: String(source.repo || "").trim().slice(0, 320) || null,
    ref_strategy:
      refStrategy === "deploy_sha" || refStrategy === "branch_fallback" || refStrategy === "workspace"
        ? refStrategy
        : provider === "github"
          ? "branch_fallback"
          : "workspace",
    branch_fallback: String(source.branch_fallback || source.branchFallback || "").trim().slice(0, 128) || null,
    path_allowlist: parseLineListInput(source.path_allowlist || source.pathAllowlist || source.paths || "", 8),
    mode: "high_signal_only"
  };
}

function getRepoTriageConfigFromProject(project) {
  const metadata = project && typeof project.metadata === "object" ? project.metadata : {};
  return normalizeRepoTriageConfigInput(metadata.repo_triage || metadata.repoTriage || {});
}

function readOnboardingRepoTriageConfig() {
  const connection = getCachedRepoConnection(getOnboardingBrandKey());
  const connectedRepo = connection.connection_status === "connected" ? connection.selected_repo_full_name : "";
  return normalizeRepoTriageConfigInput({
    enabled: elements.onboardingRepoTriageEnabled?.checked === true,
    provider: connectedRepo ? "github" : "workspace",
    repo: connectedRepo || elements.onboardingRepoTriageRepo?.value || "",
    ref_strategy: connectedRepo ? "branch_fallback" : "workspace",
    branch_fallback: connectedRepo ? connection.default_branch : "",
    path_allowlist: elements.onboardingRepoTriagePaths?.value || connection.path_allowlist || ""
  });
}

function applyOnboardingRepoTriageConfig(config = {}) {
  const normalized = normalizeRepoTriageConfigInput(config);
  if (elements.onboardingRepoTriageEnabled) {
    elements.onboardingRepoTriageEnabled.checked = normalized.enabled;
  }
  if (elements.onboardingRepoTriageRepo) {
    elements.onboardingRepoTriageRepo.value = normalized.repo || "";
  }
  if (elements.onboardingRepoTriagePaths) {
    elements.onboardingRepoTriagePaths.value = normalized.path_allowlist.join("\n");
  }
}

function buildRepoTriageReviewModel(config = {}) {
  const normalized = normalizeRepoTriageConfigInput(config);
  if (!normalized.enabled) {
    return {
      title: "Blind-only report",
      meta: "Repo access is off, so this run stays purely blind."
    };
  }

  const repoLabel = normalized.repo || "current workspace";
  const pathLabel = normalized.path_allowlist.length
    ? ` Scoped to ${normalized.path_allowlist.join(", ")}.`
    : "";
  if (normalized.provider === "github") {
    const branchLabel = normalized.branch_fallback ? ` Default branch fallback: ${normalized.branch_fallback}.` : "";
    return {
      title: `GitHub triage on ${repoLabel}`,
      meta: `After blind QA finds a real bug or dead end, inspect ${repoLabel} for likely files, causes, and tests.${branchLabel}${pathLabel}`
    };
  }
  return {
    title: `Enabled for ${repoLabel}`,
    meta: `After blind QA finds a real bug or dead end, scan ${repoLabel} for likely files, causes, and tests.${pathLabel}`
  };
}

async function requestBrandRepoConnection(brandKey, options = {}) {
  const params = new URLSearchParams({
    brand_key: sanitizeBrandKey(brandKey)
  });
  if (options.includeRepositories !== false) {
    params.set("include_repositories", "1");
  }
  const response = await fetch(`/api/qa/github-app/connection?${params.toString()}`, {
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to manage GitHub repo connections.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load GitHub repo connection");
  }
  return data;
}

async function requestGitHubAppInstallUrl(brandKey) {
  const response = await fetch("/api/qa/github-app/install-url", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      brand_key: sanitizeBrandKey(brandKey)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to connect GitHub.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to start GitHub App install");
  }
  return data;
}

async function requestSaveBrandRepoConnectionSelection(payload = {}) {
  const response = await fetch("/api/qa/github-app/connection", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to save the connected repository.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to save the connected repository");
  }
  return data;
}

async function requestDeleteBrandRepoConnection(brandKey) {
  const params = new URLSearchParams({
    brand_key: sanitizeBrandKey(brandKey)
  });
  const response = await fetch(`/api/qa/github-app/connection?${params.toString()}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to disconnect GitHub.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to disconnect GitHub");
  }
  return data;
}

function captureCurrentOnboardingConfig() {
  syncOnboardingPersonaField();
  syncOnboardingScenariosField();
  return {
    targetUrl: normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""), { writeBack: false }),
    brandKey: getOnboardingBrandKey(),
    persona: String(elements.onboardingPersona?.value || elements.onboardingPersonaCustom?.value || "").trim(),
    scopeMode: normalizeScopeModeInput(elements.onboardingScopeMode?.value || "deep_45m"),
    scenarios: normalizeScenarioListInput(elements.onboardingScenarios?.value || elements.onboardingScenariosCustom?.value || ""),
    repoTriage: readOnboardingRepoTriageConfig()
  };
}

function applyRepoConnectionToOnboardingFields(connection) {
  const normalized = normalizeRepoConnectionPayload({ connection }, connection?.brand_key || "");
  if (elements.onboardingRepoTriageRepo) {
    if (normalized.connection_status === "connected" && normalized.selected_repo_full_name) {
      elements.onboardingRepoTriageRepo.value = normalized.selected_repo_full_name;
    }
    elements.onboardingRepoTriageRepo.readOnly = normalized.connection_status === "connected";
  }
  if (
    elements.onboardingRepoTriagePaths &&
    normalized.path_allowlist.length &&
    document.activeElement !== elements.onboardingRepoTriagePaths
  ) {
    elements.onboardingRepoTriagePaths.value = normalized.path_allowlist.join("\n");
  }
}

function renderOnboardingRepoConnectionUi() {
  const brandKey = getOnboardingBrandKey();
  const connection = getCachedRepoConnection(brandKey);
  const loading = Boolean(brandKey) && state.repoConnectionLoadingBrand === brandKey;
  const repoSelect = elements.onboardingRepoConnectionSelect;

  if (elements.onboardingRepoConnectionLabel) {
    if (!brandKey) {
      elements.onboardingRepoConnectionLabel.textContent = "Enter the product URL first so this brand has a repo connection target.";
    } else if (loading) {
      elements.onboardingRepoConnectionLabel.textContent = "Loading GitHub repo connection…";
    } else if (connection.app_configured === false) {
      elements.onboardingRepoConnectionLabel.textContent = "GitHub App is not configured on this deployment yet.";
    } else if (connection.connection_status === "connected" && connection.selected_repo_full_name) {
      elements.onboardingRepoConnectionLabel.textContent = `Connected to ${connection.selected_repo_full_name}.`;
    } else if (connection.installation_id) {
      elements.onboardingRepoConnectionLabel.textContent = `GitHub App installed on ${
        connection.installation_account_login || "this account"
      }. Choose the repo below.`;
    } else {
      elements.onboardingRepoConnectionLabel.textContent = "No GitHub repo connected for this brand yet.";
    }
  }

  if (elements.onboardingRepoConnectionMeta) {
    const warning = String(connection.warning || "").trim();
    if (warning) {
      elements.onboardingRepoConnectionMeta.textContent = warning;
    } else if (connection.connection_status === "connected" && connection.default_branch) {
      elements.onboardingRepoConnectionMeta.textContent = `Repo-aware diagnosis will snapshot ${connection.selected_repo_full_name} with ${connection.default_branch} as the branch fallback.`;
    } else {
      elements.onboardingRepoConnectionMeta.textContent =
        "Connect a repo per brand. Blind QA stays blind until the run has already found something worth diagnosing.";
    }
  }

  if (elements.onboardingRepoTriageConnect) {
    elements.onboardingRepoTriageConnect.disabled = !brandKey || loading || !isDashboardAuthorized();
    elements.onboardingRepoTriageConnect.textContent = loading
      ? "Loading…"
      : connection.installation_id
        ? "Reconnect GitHub"
        : "Connect GitHub";
  }

  if (elements.onboardingRepoTriageDisconnect) {
    elements.onboardingRepoTriageDisconnect.hidden = !connection.installation_id;
    elements.onboardingRepoTriageDisconnect.disabled = loading || !connection.installation_id;
  }

  if (elements.onboardingRepoConnectionSelectWrap) {
    const shouldShowSelect = Boolean(connection.installation_id) && connection.repositories.length > 0;
    elements.onboardingRepoConnectionSelectWrap.hidden = !shouldShowSelect;
  }

  if (repoSelect) {
    const repositories = Array.isArray(connection.repositories) ? connection.repositories : [];
    if (repositories.length) {
      repoSelect.innerHTML = repositories
        .map((repo) => {
          const fullName = repo.full_name || "";
          const defaultBranch = repo.default_branch ? ` · ${repo.default_branch}` : "";
          return `<option value="${escapeHtml(fullName)}">${escapeHtml(fullName + defaultBranch)}</option>`;
        })
        .join("");
      const selectedValue =
        connection.selected_repo_full_name && repositories.some((repo) => repo.full_name === connection.selected_repo_full_name)
          ? connection.selected_repo_full_name
          : repositories[0].full_name || "";
      repoSelect.value = selectedValue;
      repoSelect.disabled = loading;
    } else {
      repoSelect.innerHTML = "";
      repoSelect.disabled = true;
    }
  }

  if (elements.onboardingRepoTriageRepo) {
    elements.onboardingRepoTriageRepo.readOnly = connection.connection_status === "connected";
    elements.onboardingRepoTriageRepo.placeholder =
      connection.installation_id && !connection.selected_repo_full_name
        ? "Choose the connected repository below"
        : "org/repo or current workspace";
  }
}

async function loadOnboardingRepoConnection(brandKey, options = {}) {
  const safeBrandKey = sanitizeBrandKey(brandKey);
  if (!safeBrandKey || !isDashboardAuthorized()) {
    renderOnboardingRepoConnectionUi();
    return buildEmptyRepoConnection(safeBrandKey);
  }

  const cached = getCachedRepoConnection(safeBrandKey);
  if (options.force !== true && (cached.installation_id || cached.connection_status !== "disconnected")) {
    renderOnboardingRepoConnectionUi();
    return cached;
  }

  state.repoConnectionLoadingBrand = safeBrandKey;
  renderOnboardingRepoConnectionUi();
  try {
    const payload = await requestBrandRepoConnection(safeBrandKey, {
      includeRepositories: options.includeRepositories !== false
    });
    const normalized = setCachedRepoConnection(safeBrandKey, payload);
    if (getOnboardingBrandKey() === safeBrandKey) {
      applyRepoConnectionToOnboardingFields(normalized);
    }
    refreshOnboardingLaunchSummary();
    if (getOnboardingBrandKey() === safeBrandKey) {
      maybeFocusOnboardingRepoConnectionSelection({ brandKey: safeBrandKey });
    }
    return normalized;
  } catch (error) {
    const existing = getCachedRepoConnection(safeBrandKey);
    state.repoConnections.set(safeBrandKey, {
      ...existing,
      brand_key: safeBrandKey,
      warning: error.message || "Failed to load GitHub repo connection"
    });
    return state.repoConnections.get(safeBrandKey);
  } finally {
    if (state.repoConnectionLoadingBrand === safeBrandKey) {
      state.repoConnectionLoadingBrand = "";
    }
    renderOnboardingRepoConnectionUi();
  }
}

function loadOnboardingRepoConnectionForCurrentBrand(options = {}) {
  return loadOnboardingRepoConnection(getOnboardingBrandKey(), options);
}

async function persistOnboardingRepoConnectionSelection(options = {}) {
  const safeBrandKey = sanitizeBrandKey(options.brandKey || getOnboardingBrandKey());
  const repoFullName =
    String(options.repoFullName || elements.onboardingRepoConnectionSelect?.value || "").trim() ||
    getCachedRepoConnection(safeBrandKey).selected_repo_full_name;
  if (!safeBrandKey || !repoFullName) {
    return null;
  }

  const saved = await requestSaveBrandRepoConnectionSelection({
    brand_key: safeBrandKey,
    repo_full_name: repoFullName,
    path_allowlist: parseLineListInput(elements.onboardingRepoTriagePaths?.value || "", 8)
  });
  const normalized = setCachedRepoConnection(safeBrandKey, saved);
  state.onboarding.pendingRepoSelectionFocus = false;
  applyRepoConnectionToOnboardingFields(normalized);
  renderOnboardingRepoConnectionUi();
  refreshOnboardingLaunchSummary();
  return normalized;
}

function consumeGitHubAppRedirectState() {
  if (state.onboarding.githubRedirectHandled) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const status = sanitizeOptionalString(params.get("github_app_status"), 64);
  const errorCode = sanitizeOptionalString(params.get("github_app_error"), 64);
  const brandKey = sanitizeBrandKey(params.get("github_app_brand") || "");
  if (!status && !errorCode) {
    return;
  }

  state.onboarding.githubRedirectHandled = true;

  const storedConfig = readGitHubAppReturnState();
  clearGitHubAppReturnState();

  if (brandKey) {
    state.filters.brand = brandKey;
    setStoredBrand(brandKey);
  }

  const restoreConfig =
    storedConfig && typeof storedConfig === "object"
      ? {
          ...storedConfig,
          brandKey: brandKey || storedConfig.brandKey || storedConfig.brand_key
        }
      : { brandKey };

  prefillOnboardingFromConfig(restoreConfig);
  state.onboarding.step = ONBOARDING_MAX_STEP;
  state.onboarding.pendingRepoSelectionFocus = status === "repo_selection_required";
  openOnboardingModal({ resetStep: false, manual: true, trusted: true });
  void loadOnboardingRepoConnectionForCurrentBrand({ force: true, includeRepositories: true });

  let message = "";
  let tone = "success";
  if (errorCode) {
    tone = "error";
    if (errorCode === "auth_required") {
      message = "Sign in again to finish connecting the GitHub App.";
    } else if (errorCode === "expired_state") {
      message = "The GitHub install session expired. Start the repo connection again.";
    } else {
      message = "GitHub repo connection did not finish cleanly.";
    }
  } else if (status === "repo_selection_required") {
    tone = "success";
    message = "GitHub App connected. Pick the repository for this brand.";
  } else if (status === "connected") {
    message = "GitHub App connected for this brand.";
  }

  if (message) {
    window.setTimeout(() => {
      showReportToast(message, tone);
    }, 80);
  }

  ["github_app_status", "github_app_error", "github_app_brand"].forEach((key) => params.delete(key));
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function buildRunLaunchConfig({ row = null, report = null } = {}) {
  const safeRow = row && typeof row === "object" ? row : {};
  const safeReport = report && typeof report === "object" ? report : {};
  const reportMetadata = safeReport.metadata && typeof safeReport.metadata === "object" ? safeReport.metadata : {};
  const rowRepoTriage =
    safeRow.repo_triage && typeof safeRow.repo_triage === "object"
      ? safeRow.repo_triage
      : safeRow.repo_triage_config && typeof safeRow.repo_triage_config === "object"
        ? safeRow.repo_triage_config
        : {};

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
    brandName,
    repoTriage: normalizeRepoTriageConfigInput(reportMetadata.repo_triage || rowRepoTriage)
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
  const savedProject =
    state.savedProjects.find((project) => sanitizeBrandKey(project?.brand_key) === preferredBrandKey) || null;
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
    repoTriage: normalizeRepoTriageConfigInput(
      brandRow?.repo_triage || getRepoTriageConfigFromProject(savedProject)
    ),
    prefillPersona: false
  };
}

function getCurrentQaScheduleBrandKey() {
  return sanitizeBrandKey(String(state.filters.brand || state.brandOptions[0]?.key || ""));
}

function getQaScheduleForBrand(brandKey = "") {
  const safeBrandKey = sanitizeBrandKey(String(brandKey || ""));
  if (!safeBrandKey) {
    return null;
  }
  return state.qaAutomation.schedules.find((schedule) => sanitizeBrandKey(schedule?.brand_key) === safeBrandKey) || null;
}

function getCurrentQaScheduleContext() {
  const brandKey = getCurrentQaScheduleBrandKey();
  const savedProject =
    state.savedProjects.find((project) => sanitizeBrandKey(project?.brand_key) === brandKey) || null;
  const latestRun = findLatestRunForBrand(brandKey);
  const latestReport =
    latestRun && latestRun.run_id === state.activeRenderedRow?.run_id ? state.activeRenderedReport : null;
  const launchConfig =
    latestRun || latestReport
      ? buildRunLaunchConfig({ row: latestRun, report: latestReport })
      : buildFreshRunSeedConfig({ brandKey });
  const targetUrl =
    sanitizeOptionalString(savedProject?.target_url, 4096) ||
    sanitizeOptionalString(launchConfig.targetUrl, 4096) ||
    "";
  const brandName =
    sanitizeOptionalString(savedProject?.brand_name, 256) ||
    sanitizeOptionalString(launchConfig.brandName, 256) ||
    sanitizeOptionalString(getBrandOptionLabel(brandKey), 256) ||
    "";
  const mission =
    sanitizeOptionalString(launchConfig.goal, 1000) ||
    sanitizeOptionalString(Array.isArray(launchConfig.scenarios) ? launchConfig.scenarios[0] : "", 1000) ||
    DEFAULT_ONBOARDING_SCENARIO;

  return {
    brandKey,
    brandName,
    targetUrl,
    persona: sanitizeOptionalString(launchConfig.persona, 500) || DEFAULT_DASHBOARD_PERSONA,
    mission,
    scopeMode: normalizeScopeModeInput(launchConfig.scopeMode || "deep_45m")
  };
}

function resetQaAutomationState() {
  state.qaAutomation.schedules = [];
  state.qaAutomation.alerts = [];
  state.qaAutomation.loading = false;
  state.qaAutomation.saving = false;
  state.qaAutomation.running = false;
  state.qaAutomation.emailConfigured = null;
  state.qaAutomation.defaultAlertEmail = "";
  state.qaAutomation.message = "Save a schedule and Swarm Tester will keep checking this project for you.";
  state.qaAutomation.tone = "";
}

function setQaAutomationMessage(message, tone = "") {
  state.qaAutomation.message = String(message || "");
  state.qaAutomation.tone = String(tone || "");
  if (elements.qaScheduleMessage) {
    elements.qaScheduleMessage.textContent = state.qaAutomation.message;
    elements.qaScheduleMessage.dataset.state = state.qaAutomation.tone;
  }
}

function formatQaScheduleCadence(frequencyHours) {
  const hours = Math.max(1, Number(frequencyHours) || 24);
  if (hours === 24) {
    return "Daily";
  }
  if (hours === 168) {
    return "Weekly";
  }
  if (hours % 24 === 0) {
    const days = Math.round(hours / 24);
    return `Every ${days} day${days === 1 ? "" : "s"}`;
  }
  return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
}

async function requestQaSchedules() {
  const response = await fetch("/api/qa/schedules");
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in to manage regular QA.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load QA schedules");
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    emailConfigured: data.email_alerts_configured === true,
    defaultAlertEmail: sanitizeOptionalString(data.default_alert_email, 320) || ""
  };
}

async function requestQaAlerts() {
  const response = await fetch("/api/qa/alerts?status=open");
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in to load QA alerts.");
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to load QA alerts");
  }
  return Array.isArray(data.items) ? data.items : [];
}

async function saveQaScheduleRequest(schedule) {
  const response = await fetch("/api/qa/schedules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ schedule })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to save QA schedule");
  }
  return {
    item: data.item || (Array.isArray(data.items) ? data.items[0] : null),
    emailConfigured: data.email_alerts_configured === true,
    defaultAlertEmail: sanitizeOptionalString(data.default_alert_email, 320) || ""
  };
}

async function triggerQaScheduleNow(scheduleId) {
  const response = await fetch("/api/qa/schedules/trigger", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ schedule_id: scheduleId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to queue scheduled run");
  }
  return data;
}

async function acknowledgeQaAlertRequest(alertId) {
  const response = await fetch("/api/qa/alerts", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: alertId, status: "acknowledged" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to acknowledge alert");
  }
  return data.item || null;
}

function getVisibleQaAlerts() {
  const currentBrandKey = getCurrentQaScheduleBrandKey();
  const alerts = Array.isArray(state.qaAutomation.alerts) ? state.qaAutomation.alerts : [];
  if (!currentBrandKey) {
    return alerts;
  }
  const matching = alerts.filter((alert) => sanitizeBrandKey(alert?.brand_key) === currentBrandKey);
  return matching.length ? matching : alerts;
}

function renderQaSchedulePanel() {
  if (!elements.qaScheduleMeta || !elements.qaScheduleStateBadge) {
    return;
  }
  const context = getCurrentQaScheduleContext();
  const schedule = getQaScheduleForBrand(context.brandKey);
  const hasProject = Boolean(context.brandKey && context.targetUrl);
  const frequencyValue = String(schedule?.frequency_hours || 24);
  const scopeModeValue = normalizeScopeModeInput(schedule?.scope_mode || context.scopeMode || "deep_45m");
  const personaValue = sanitizeOptionalString(schedule?.persona, 500) || context.persona || DEFAULT_DASHBOARD_PERSONA;
  const missionValue = sanitizeOptionalString(schedule?.mission, 1000) || context.mission || DEFAULT_ONBOARDING_SCENARIO;
  const alertEmailValue =
    sanitizeOptionalString(schedule?.alert_email_to, 320) ||
    state.qaAutomation.defaultAlertEmail ||
    "";
  const webhookValue = sanitizeOptionalString(schedule?.alert_webhook_url, 4096);

  if (elements.qaScheduleFrequency) {
    elements.qaScheduleFrequency.value = frequencyValue;
  }
  if (elements.qaScheduleScopeMode) {
    elements.qaScheduleScopeMode.value = scopeModeValue;
  }
  if (elements.qaSchedulePersona) {
    elements.qaSchedulePersona.value = personaValue;
  }
  if (elements.qaScheduleMission) {
    elements.qaScheduleMission.value = missionValue;
  }
  if (elements.qaScheduleEmail) {
    elements.qaScheduleEmail.value = alertEmailValue;
  }
  if (elements.qaScheduleEmailHint) {
    elements.qaScheduleEmailHint.textContent = state.qaAutomation.emailConfigured === false
      ? "Email alerts are saved here, but server email delivery is not configured yet."
      : "Leave blank to send alerts to your signed-in owner email.";
  }
  if (elements.qaScheduleWebhook) {
    elements.qaScheduleWebhook.value = webhookValue;
  }

  if (!hasProject) {
    elements.qaScheduleMeta.textContent = "Pick a saved project to set up regular QA.";
    elements.qaScheduleStateBadge.className = "issue-severity severity-low";
    elements.qaScheduleStateBadge.textContent = "No Project";
    if (elements.qaScheduleSaveAction) elements.qaScheduleSaveAction.disabled = true;
    if (elements.qaScheduleRunNowAction) elements.qaScheduleRunNowAction.disabled = true;
    if (elements.qaScheduleToggleAction) elements.qaScheduleToggleAction.disabled = true;
    setQaAutomationMessage("Pick a project with a real target URL first.", "");
    return;
  }

  const metaParts = [];
  if (schedule) {
    metaParts.push(formatQaScheduleCadence(schedule.frequency_hours));
    if (schedule.next_run_at) {
      metaParts.push(`Next run ${formatRelativeTime(schedule.next_run_at)}`);
    }
    if (schedule.last_alert_at) {
      metaParts.push(`Last alert ${formatRelativeTime(schedule.last_alert_at)}`);
    }
    if (alertEmailValue) {
      metaParts.push(`Emails to ${alertEmailValue}`);
    }
  } else {
    metaParts.push(`No schedule yet for ${context.brandName || context.brandKey}`);
    if (alertEmailValue) {
      metaParts.push(`Will email ${alertEmailValue}`);
    }
  }

  elements.qaScheduleMeta.textContent = metaParts.join(" · ");
  elements.qaScheduleStateBadge.className = `issue-severity ${schedule?.active === false ? "severity-medium" : "severity-low"}`;
  elements.qaScheduleStateBadge.textContent = schedule ? (schedule.active === false ? "Paused" : "Scheduled") : "Draft";
  if (elements.qaScheduleSaveAction) {
    elements.qaScheduleSaveAction.disabled = state.qaAutomation.saving || state.qaAutomation.loading;
    elements.qaScheduleSaveAction.textContent = state.qaAutomation.saving ? "Saving..." : schedule ? "Save changes" : "Save schedule";
  }
  if (elements.qaScheduleRunNowAction) {
    elements.qaScheduleRunNowAction.disabled = state.qaAutomation.running || state.qaAutomation.saving || state.qaAutomation.loading || !hasProject;
    elements.qaScheduleRunNowAction.textContent = state.qaAutomation.running ? "Queueing..." : "Run now";
  }
  if (elements.qaScheduleToggleAction) {
    elements.qaScheduleToggleAction.disabled = state.qaAutomation.saving || state.qaAutomation.loading || !schedule;
    elements.qaScheduleToggleAction.textContent = schedule ? (schedule.active === false ? "Resume" : "Pause") : "Pause";
  }
  const defaultMessage =
    alertEmailValue && state.qaAutomation.emailConfigured === false
      ? "Email alerts will start sending as soon as SMTP is configured on the server. Webhook alerts still work now."
      : "Save a schedule and Swarm Tester will keep checking this project for you.";
  setQaAutomationMessage(
    state.qaAutomation.message || defaultMessage,
    state.qaAutomation.tone || ""
  );
}

function renderQaAlertsPanel() {
  if (!elements.qaAlertsItems || !elements.qaAlertsMeta) {
    return;
  }
  const alerts = getVisibleQaAlerts();
  const currentBrandKey = getCurrentQaScheduleBrandKey();
  const scopedAlerts = currentBrandKey ? alerts.filter((alert) => sanitizeBrandKey(alert?.brand_key) === currentBrandKey) : alerts;
  elements.qaAlertsMeta.textContent = scopedAlerts.length
    ? `${scopedAlerts.length} open alert${scopedAlerts.length === 1 ? "" : "s"}`
    : "No open alerts.";

  if (!scopedAlerts.length) {
    elements.qaAlertsItems.innerHTML = '<div class="app-empty"><p>No open alerts for this project.</p></div>';
    return;
  }

  elements.qaAlertsItems.innerHTML = scopedAlerts
    .slice(0, 8)
    .map((alert) => {
      const severity = normalizeRunStatus(alert?.severity) || "high";
      const severityClass =
        severity === "critical" ? "severity-critical" : severity === "high" ? "severity-high" : "severity-medium";
      const openUrl = sanitizeOptionalString(alert?.ui_report_url, 4096) || sanitizeOptionalString(alert?.report_url, 4096);
      return `
        <article class="app-alert-item">
          <header class="app-alert-head">
            <div>
              <strong>${escapeHtml(alert?.title || "Scheduled QA found a problem")}</strong>
              <p>${escapeHtml(alert?.message || "A scheduled QA run needs attention.")}</p>
            </div>
            <span class="issue-severity ${escapeHtml(severityClass)}">${escapeHtml(severity.toUpperCase())}</span>
          </header>
          <div class="app-alert-meta">
            <span>${escapeHtml(sanitizeOptionalString(alert?.brand_key, 120) || "project")}</span>
            <span>${escapeHtml(formatRelativeTime(alert?.created_at))}</span>
            ${alert?.run_id ? `<span>${escapeHtml(alert.run_id)}</span>` : ""}
          </div>
          <div class="app-alert-actions">
            ${openUrl ? `<a class="btn btn-ghost" href="${escapeHtml(openUrl)}" target="_blank" rel="noreferrer">Open report</a>` : ""}
            <button class="btn btn-ghost" type="button" data-qa-alert-ack="${escapeHtml(alert?.id || "")}">Acknowledge</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadQaAutomationPanels() {
  if (!hasAppDashboardUi) {
    return;
  }
  if (!isDashboardAuthorized()) {
    resetQaAutomationState();
    renderQaSchedulePanel();
    renderQaAlertsPanel();
    return;
  }
  state.qaAutomation.loading = true;
  try {
    const [schedulePayload, alerts] = await Promise.all([requestQaSchedules(), requestQaAlerts()]);
    state.qaAutomation.schedules = Array.isArray(schedulePayload.items) ? schedulePayload.items : [];
    state.qaAutomation.alerts = alerts;
    state.qaAutomation.emailConfigured = schedulePayload.emailConfigured;
    state.qaAutomation.defaultAlertEmail = schedulePayload.defaultAlertEmail || "";
    if (!state.qaAutomation.message) {
      state.qaAutomation.message = "Save a schedule and Swarm Tester will keep checking this project for you.";
    }
    if (!state.qaAutomation.tone) {
      state.qaAutomation.tone = "";
    }
  } catch (error) {
    setQaAutomationMessage(error?.message || "Could not load regular QA settings.", "error");
  } finally {
    state.qaAutomation.loading = false;
    renderQaSchedulePanel();
    renderQaAlertsPanel();
  }
}

async function saveCurrentQaSchedule(overrides = {}) {
  const context = getCurrentQaScheduleContext();
  if (!context.brandKey || !context.targetUrl) {
    throw new Error("Choose a project with a real target URL before saving a schedule.");
  }
  const existing = getQaScheduleForBrand(context.brandKey);
  const alertEmailTo = sanitizeOptionalString(
    overrides.alert_email_to !== undefined ? overrides.alert_email_to : elements.qaScheduleEmail?.value,
    320
  );
  const metadata =
    existing?.metadata && typeof existing.metadata === "object" ? { ...existing.metadata } : {};
  if (alertEmailTo) {
    metadata.alert_email_to = alertEmailTo;
  } else {
    delete metadata.alert_email_to;
  }
  const payload = {
    ...(existing?.id ? { id: existing.id } : {}),
    brand_key: context.brandKey,
    brand_name: context.brandName || null,
    target_url: context.targetUrl,
    active: overrides.active !== undefined ? overrides.active : existing?.active !== false,
    frequency_hours:
      overrides.frequency_hours !== undefined
        ? overrides.frequency_hours
        : Number(elements.qaScheduleFrequency?.value || existing?.frequency_hours || 24),
    scope_mode:
      overrides.scope_mode !== undefined
        ? overrides.scope_mode
        : normalizeScopeModeInput(elements.qaScheduleScopeMode?.value || existing?.scope_mode || context.scopeMode),
    persona:
      overrides.persona !== undefined
        ? overrides.persona
        : sanitizeOptionalString(elements.qaSchedulePersona?.value, 500) || existing?.persona || context.persona,
    mission:
      overrides.mission !== undefined
        ? overrides.mission
        : sanitizeOptionalString(elements.qaScheduleMission?.value, 1000) || existing?.mission || context.mission,
    metadata,
    alert_webhook_url:
      overrides.alert_webhook_url !== undefined
        ? overrides.alert_webhook_url
        : sanitizeOptionalString(elements.qaScheduleWebhook?.value, 4096) || existing?.alert_webhook_url || "",
    next_run_at:
      overrides.next_run_at !== undefined
        ? overrides.next_run_at
        : existing?.next_run_at || new Date().toISOString()
  };

  state.qaAutomation.saving = true;
  renderQaSchedulePanel();
  const saved = await saveQaScheduleRequest(payload);
  state.qaAutomation.saving = false;
  state.qaAutomation.emailConfigured = saved.emailConfigured;
  state.qaAutomation.defaultAlertEmail = saved.defaultAlertEmail || state.qaAutomation.defaultAlertEmail;
  if (saved?.item?.id) {
    state.qaAutomation.schedules = state.qaAutomation.schedules.filter(
      (item) => item.id !== saved.item.id && sanitizeBrandKey(item?.brand_key) !== sanitizeBrandKey(saved.item.brand_key)
    );
    state.qaAutomation.schedules.unshift(saved.item);
  }
  renderQaSchedulePanel();
  renderQaAlertsPanel();
  return saved.item || null;
}

async function handleQaScheduleSave() {
  try {
    const schedule = await saveCurrentQaSchedule();
    setQaAutomationMessage(
      `Saved ${formatQaScheduleCadence(schedule?.frequency_hours)} QA for ${schedule?.brand_name || schedule?.brand_key}.`,
      "success"
    );
    renderQaSchedulePanel();
    showReportToast("Regular QA saved", "success");
  } catch (error) {
    state.qaAutomation.saving = false;
    setQaAutomationMessage(error?.message || "Could not save the schedule.", "error");
    renderQaSchedulePanel();
    showReportToast(error?.message || "Could not save the schedule.", "error");
  }
}

async function handleQaScheduleToggle() {
  const context = getCurrentQaScheduleContext();
  const existing = getQaScheduleForBrand(context.brandKey);
  if (!existing) {
    setQaAutomationMessage("Save a schedule first.", "error");
    renderQaSchedulePanel();
    return;
  }
  try {
    const nextActive = existing.active === false;
    const schedule = await saveCurrentQaSchedule({
      active: nextActive,
      next_run_at: nextActive ? new Date().toISOString() : existing.next_run_at
    });
    setQaAutomationMessage(nextActive ? "Regular QA resumed." : "Regular QA paused.", "success");
    renderQaSchedulePanel();
    showReportToast(nextActive ? "Regular QA resumed" : "Regular QA paused", "success");
    return schedule;
  } catch (error) {
    state.qaAutomation.saving = false;
    setQaAutomationMessage(error?.message || "Could not update the schedule.", "error");
    renderQaSchedulePanel();
    showReportToast(error?.message || "Could not update the schedule.", "error");
    return null;
  }
}

async function handleQaScheduleRunNow() {
  try {
    let schedule = getQaScheduleForBrand(getCurrentQaScheduleBrandKey());
    if (!schedule) {
      schedule = await saveCurrentQaSchedule();
    }
    if (!schedule?.id) {
      throw new Error("Save the schedule first.");
    }
    state.qaAutomation.running = true;
    renderQaSchedulePanel();
    const queued = await triggerQaScheduleNow(schedule.id);
    state.qaAutomation.running = false;
    state.selectedRunId = queued.run_id;
    state.requestedRunId = queued.run_id;
    syncUrlFromState();
    setQaAutomationMessage("Queued a scheduled QA run right now.", "success");
    showReportToast("Scheduled QA queued", "success");
    await loadAndRenderReports();
  } catch (error) {
    state.qaAutomation.running = false;
    setQaAutomationMessage(error?.message || "Could not queue the scheduled run.", "error");
    renderQaSchedulePanel();
    showReportToast(error?.message || "Could not queue the scheduled run.", "error");
  }
}

async function handleQaAlertAcknowledge(alertId) {
  try {
    const updated = await acknowledgeQaAlertRequest(alertId);
    if (updated?.id) {
      state.qaAutomation.alerts = state.qaAutomation.alerts.filter((item) => item.id !== updated.id);
    }
    renderQaAlertsPanel();
    showReportToast("Alert acknowledged", "success");
  } catch (error) {
    showReportToast(error?.message || "Could not acknowledge alert", "error");
  }
}

function bindQaAutomationInteractions() {
  if (!hasAppDashboardUi || !elements.qaScheduleForm) {
    return;
  }
  if (elements.qaScheduleForm.dataset.bound === "1") {
    return;
  }

  elements.qaScheduleForm.dataset.bound = "1";
  elements.qaScheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleQaScheduleSave();
  });

  if (elements.qaScheduleSaveAction) {
    elements.qaScheduleSaveAction.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleQaScheduleSave();
    });
  }

  if (elements.qaScheduleRunNowAction) {
    elements.qaScheduleRunNowAction.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleQaScheduleRunNow();
    });
  }

  if (elements.qaScheduleToggleAction) {
    elements.qaScheduleToggleAction.addEventListener("click", async (event) => {
      event.preventDefault();
      await handleQaScheduleToggle();
    });
  }

  if (elements.qaAlertsItems) {
    elements.qaAlertsItems.addEventListener("click", async (event) => {
      const trigger = event.target.closest("[data-qa-alert-ack]");
      if (!trigger) {
        return;
      }
      event.preventDefault();
      const alertId = sanitizeOptionalString(trigger.getAttribute("data-qa-alert-ack"), 128);
      if (!alertId) {
        return;
      }
      await handleQaAlertAcknowledge(alertId);
    });
  }
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
  const repoTriageReview = buildRepoTriageReviewModel(readOnboardingRepoTriageConfig());
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
  if (elements.onboardingReviewRepoTriage) {
    elements.onboardingReviewRepoTriage.textContent = repoTriageReview.title;
  }
  if (elements.onboardingReviewRepoTriageMeta) {
    elements.onboardingReviewRepoTriageMeta.textContent = repoTriageReview.meta;
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
  const repoTriage = readOnboardingRepoTriageConfig();

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
        scenarios,
        repoTriage
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

function beginDashboardLoadRequest() {
  state.dashboardLoadRequestId += 1;
  return state.dashboardLoadRequestId;
}

function isDashboardLoadRequestCurrent(requestId) {
  return Number(requestId) > 0 && Number(requestId) === state.dashboardLoadRequestId;
}

function isProjectCatalogResolved() {
  return (
    state.projectCatalogStatus === PROJECT_CATALOG_STATES.READY ||
    state.projectCatalogStatus === PROJECT_CATALOG_STATES.EMPTY
  );
}

function setProjectCatalogStatus(status) {
  const nextStatus = Object.values(PROJECT_CATALOG_STATES).includes(status)
    ? status
    : PROJECT_CATALOG_STATES.IDLE;
  state.projectCatalogStatus = nextStatus;
}

function waitForDashboardRetry(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
  });
}

function isRetryableDashboardFetch(response, error) {
  if (error) {
    return true;
  }
  const status = Number(response?.status) || 0;
  return status >= 500 || status === 429;
}

async function requestProjectCatalogOnce() {
  const response = await fetch("/api/qa/projects");
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error("Sign in required to access dashboard projects.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load projects");
    error.status = response.status || 500;
    throw error;
  }

  return Array.isArray(data.items) ? data.items : [];
}

async function requestProjectCatalog() {
  let lastError = null;

  for (let attempt = 0; attempt < DASHBOARD_BOOT_FETCH_RETRIES; attempt += 1) {
    try {
      return await requestProjectCatalogOnce();
    } catch (error) {
      lastError = error;
      if (!isRetryableDashboardFetch({ status: error?.status }, error) || attempt === DASHBOARD_BOOT_FETCH_RETRIES - 1) {
        throw error;
      }
      await waitForDashboardRetry(180 * (attempt + 1));
    }
  }

  throw lastError || new Error("Failed to load projects");
}

function applyProjectCatalog(projects, options = {}) {
  const deferEmpty = Boolean(options.deferEmpty);
  state.savedProjects = Array.isArray(projects) ? projects : [];
  rebuildProjectOptions();
  if (state.brandOptions.length) {
    setProjectCatalogStatus(PROJECT_CATALOG_STATES.READY);
    return;
  }
  setProjectCatalogStatus(deferEmpty ? PROJECT_CATALOG_STATES.LOADING : PROJECT_CATALOG_STATES.EMPTY);
}

function deriveSavedProjectsFromRuns(items) {
  const entries = new Map();

  for (const row of Array.isArray(items) ? items : []) {
    const brandKey = normalizeBrandFilterValue(row?.brand_key);
    if (!brandKey) {
      continue;
    }

    const deliveredAt = String(row?.delivered_at || "").trim();
    const current = entries.get(brandKey) || {
      brand_key: brandKey,
      brand_name: String(row?.brand_name || "").trim() || null,
      target_url: String(row?.target_url || "").trim() || null,
      metadata: {
        repo_triage: normalizeRepoTriageConfigInput(row?.repo_triage)
      },
      last_used_at: deliveredAt || null,
      latest_run_at: deliveredAt || null,
      run_count: 0
    };

    const currentTimestamp = Date.parse(current.latest_run_at || current.last_used_at || "") || 0;
    const candidateTimestamp = Date.parse(deliveredAt || "") || 0;
    entries.set(brandKey, {
      ...current,
      brand_name: current.brand_name || String(row?.brand_name || "").trim() || null,
      target_url: current.target_url || String(row?.target_url || "").trim() || null,
      metadata:
        current.metadata && Object.keys(current.metadata).length
          ? current.metadata
          : {
              repo_triage: normalizeRepoTriageConfigInput(row?.repo_triage)
            },
      run_count: Number(current.run_count || 0) + 1,
      last_used_at: candidateTimestamp > currentTimestamp ? deliveredAt || current.last_used_at : current.last_used_at,
      latest_run_at: candidateTimestamp > currentTimestamp ? deliveredAt || current.latest_run_at : current.latest_run_at
    });
  }

  return Array.from(entries.values());
}

async function requestRunCollectionOnce() {
  const response = await fetch(`/api/qa/reports?${buildReportParams({ includeBrand: true }).toString()}`);
  const data = await response.json().catch(() => ({}));
  debugDashboardLog("run collection payload", data);
  if (response.status === 401) {
    throw new Error("Sign in required to access dashboard reports.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load reports");
    error.status = response.status || 500;
    throw error;
  }

  return Array.isArray(data.items) ? data.items : [];
}

async function requestRunCollection() {
  let lastError = null;

  for (let attempt = 0; attempt < DASHBOARD_BOOT_FETCH_RETRIES; attempt += 1) {
    try {
      return await requestRunCollectionOnce();
    } catch (error) {
      lastError = error;
      if (!isRetryableDashboardFetch({ status: error?.status }, error) || attempt === DASHBOARD_BOOT_FETCH_RETRIES - 1) {
        throw error;
      }
      await waitForDashboardRetry(180 * (attempt + 1));
    }
  }

  throw lastError || new Error("Failed to load reports");
}

function applyRunCollection(fetchedItems) {
  reconcilePinnedRunsWithFetched(fetchedItems);
  state.allRuns = mergePinnedRunsIntoCollection(fetchedItems);
  state.personaOptions = buildPersonaOptions(state.allRuns);
  const resetPersonaFilter = reconcilePersonaFilterWithAvailableOptions();
  state.runs = applyPersonaFilter(state.allRuns);
  if (resetPersonaFilter) {
    state.runs = state.allRuns.slice();
  }
  ensureSelectedRunVisibleInRuns();
  const requestedRunId = String(state.requestedRunId || "").trim();

  const nextSelection = dashboardRuns.ensureActiveRunSelection(getRunCollectionContext(), getRunCollectionHelpers());
  state.runs = nextSelection.runs;
  state.selectedRunId = nextSelection.selectedRunId || null;
  if (!nextSelection.selectedRunId) {
    if (requestedRunId) {
      state.selectedRunId = requestedRunId;
    } else {
      state.requestedRunId = "";
      state.activeRenderedReport = null;
      state.activeRenderedRow = null;
    }
  }

  if (state.allRuns.length > 0) {
    state.onboarding.hasAnyRuns = true;
  }
}

async function fetchRuns() {
  const fetchedItems = await requestRunCollection();
  applyRunCollection(fetchedItems);
  return state.allRuns;
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

async function fetchBrandOptions(options = {}) {
  const projects = await requestProjectCatalog();
  applyProjectCatalog(projects, options);
  return state.savedProjects;
}

function normalizeDistributionTrack(track) {
  const value = String(track || "").trim().toLowerCase();
  return value === "physical_local" ? "physical_local" : "startup";
}

function formatDistributionTrackLabel(track) {
  return normalizeDistributionTrack(track) === "physical_local" ? "Local Presence" : "Startup";
}

function formatDistributionSupportTier(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "manual_only") {
    return "Manual only";
  }
  if (safeValue === "recon_needed") {
    return "Needs recon";
  }
  if (safeValue === "supported") {
    return "Supported";
  }
  return safeValue ? safeValue.replaceAll("_", " ") : "Custom";
}

function formatDistributionPolicy(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (!safeValue) {
    return "Assist";
  }
  return safeValue.replaceAll("_", " ");
}

function buildDistributionPolicySummary(policyInput = {}) {
  const explicitSummary = Array.isArray(policyInput?.policy_summary)
    ? policyInput.policy_summary.map((value) => sanitizeOptionalString(value, 160)).filter(Boolean)
    : [];
  if (explicitSummary.length) {
    return explicitSummary.slice(0, 4);
  }

  const executionPolicy =
    policyInput && policyInput.execution_policy && typeof policyInput.execution_policy === "object"
      ? policyInput.execution_policy
      : null;
  const runtimePolicy =
    policyInput && policyInput.runtime_policy && typeof policyInput.runtime_policy === "object"
      ? policyInput.runtime_policy
      : null;
  const parts = [];

  const sessionMode = String(executionPolicy?.session_mode || "").trim().toLowerCase();
  if (sessionMode === "ephemeral_submitter") {
    parts.push("Ephemeral session");
  } else if (sessionMode === "persistent_owner") {
    parts.push("Persistent owner session");
  } else if (sessionMode === "founder_personal") {
    parts.push("Founder identity");
  }

  const ownershipModel = String(executionPolicy?.ownership_model || "").trim().toLowerCase();
  if (ownershipModel === "client_owned_mailbox") {
    parts.push("Client mailbox");
  } else if (ownershipModel === "founder_personal") {
    parts.push("Founder-owned account");
  }

  const proxyPolicy = String(executionPolicy?.proxy_policy || "").trim().toLowerCase();
  if (proxyPolicy === "geo_recommended") {
    parts.push("Geo proxy recommended");
  } else if (proxyPolicy === "same_country_required") {
    parts.push("Same-country proxy");
  } else if (proxyPolicy === "founder_geo_recommended") {
    parts.push("Founder-geo proxy");
  }

  const captchaExpectation = String(executionPolicy?.captcha_expectation || "").trim().toLowerCase();
  if (captchaExpectation === "expected") {
    parts.push("Captcha expected");
  } else if (captchaExpectation === "possible") {
    parts.push("Captcha possible");
  }

  const captchaTimeoutMs = Number(runtimePolicy?.twocaptcha_timeout_ms || 0);
  if (captchaTimeoutMs >= 240000) {
    parts.push("Extended solve window");
  }

  return parts.slice(0, 4);
}

function getDistributionStatusClass(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "green" || safeValue === "yellow" || safeValue === "red") {
    return `is-${safeValue}`;
  }
  return "is-yellow";
}

function getDistributionOperationalClass(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "healthy") {
    return "is-green";
  }
  if (safeValue === "blocked") {
    return "is-red";
  }
  if (safeValue === "watch") {
    return "is-yellow";
  }
  return "is-neutral";
}

function getDistributionEligibilityClass(site = {}) {
  return getDistributionStatusClass(site?.effective_product_status || site?.product_status || "yellow");
}

function formatDistributionEligibilityLabel(site = {}) {
  const tier = String(site?.eligibility_tier || "").trim().toLowerCase();
  if (tier === "starter") {
    return "Starter Ready";
  }
  if (tier === "booster") {
    return "Booster Only";
  }
  if (tier === "manual") {
    return "Manual Only";
  }
  if (tier === "assisted") {
    return "Assisted";
  }

  const track = String(site?.track || "").trim().toLowerCase();
  if (track === "startup") {
    return "Booster Only";
  }
  if (track === "physical_local") {
    return "Assisted";
  }
  return "Eligible";
}

function formatDistributionOperationalStatus(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "healthy") {
    return "Live Healthy";
  }
  if (safeValue === "blocked") {
    return "Live Blocked";
  }
  if (safeValue === "watch") {
    return "Live Watch";
  }
  return "Untested";
}

function formatDistributionPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0%";
  }
  return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
}

function resetDistributionCatalog(options = {}) {
  const clearData = options.clearData !== false;
  state.submissionCatalog.loading = false;
  state.submissionCatalog.error = "";
  if (clearData) {
    state.submissionCatalog.trackData = {
      startup: null,
      physical_local: null
    };
  }
}

function setDistributionCatalogLoading(isLoading) {
  state.submissionCatalog.loading = Boolean(isLoading);
}

function buildDistributionSummaryMarkup(summary = {}) {
  const greenCount = Number(summary.green_count || 0);
  const yellowCount = Number(summary.yellow_count || 0);
  const redCount = Number(summary.red_count || 0);
  return `
    <span class="distribution-summary-pill is-green">${greenCount} green</span>
    <span class="distribution-summary-pill is-yellow">${yellowCount} yellow</span>
    <span class="distribution-summary-pill is-red">${redCount} red</span>
  `;
}

function renderDistributionPackCards(catalog) {
  const packs = Array.isArray(catalog?.effective_product_packs) && catalog.effective_product_packs.length
    ? catalog.effective_product_packs
    : Array.isArray(catalog?.product_packs)
      ? catalog.product_packs
      : [];
  const scorecardMap = new Map(
    (Array.isArray(catalog?.scorecard) ? catalog.scorecard : [])
      .map((site) => [String(site?.site_id || "").trim().toLowerCase(), site])
      .filter((entry) => entry[0])
  );
  if (!packs.length) {
    return `
      <article class="distribution-pack-card distribution-pack-card-loading">
        <strong>No product packs yet</strong>
        <p>Add product-facing packs to the catalog to surface them here.</p>
      </article>
    `;
  }

  const recommendedPackId = String(catalog?.recommended_pack?.pack_id || "").trim().toLowerCase();
  return packs
    .map((pack) => {
      const packId = String(pack?.pack_id || "").trim().toLowerCase();
      const summary = pack?.product_summary || {};
      const sites = Array.isArray(pack?.sites) ? pack.sites : [];
      const siteMarkup = sites.length
        ? sites
            .map((site) => {
              const scorecardSite = scorecardMap.get(String(site?.site_id || "").trim().toLowerCase()) || site;
              const statusClass = getDistributionEligibilityClass(scorecardSite);
              const statusLabel = formatDistributionEligibilityLabel(scorecardSite).toUpperCase();
              const notes = Array.isArray(site?.product_notes) && site.product_notes.length
                ? site.product_notes[0]
                : Array.isArray(site?.notes) && site.notes.length
                  ? site.notes[0]
                  : "";
              const eligibilityNote = String(scorecardSite?.eligibility_note || "").trim();
              return `
                <li>
                  <span class="distribution-site-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
                  <div>
                    <strong>${escapeHtml(site?.site_name || site?.site_id || "Connector")}</strong>
                    <span>${escapeHtml(
                      eligibilityNote ||
                        notes ||
                        `${formatDistributionSupportTier(site?.support_tier)} · ${formatDistributionPolicy(site?.default_policy)}`
                    )}</span>
                  </div>
                </li>
              `;
            })
            .join("")
        : `<li><div><strong>No connectors</strong><span>This pack is still empty.</span></div></li>`;

      return `
        <article class="distribution-pack-card">
          <div class="distribution-pack-card-head">
            <div>
              <div class="distribution-pack-title-row">
                <h4>${escapeHtml(pack?.pack_name || packId || "Pack")}</h4>
                ${packId === recommendedPackId ? '<span class="distribution-pack-recommended">Recommended</span>' : ""}
              </div>
              <p>${escapeHtml(pack?.description || "Product-facing distribution bundle.")}</p>
            </div>
            <div class="distribution-pack-status">
              ${buildDistributionSummaryMarkup(summary)}
            </div>
          </div>
          <ul class="distribution-pack-sites">
            ${siteMarkup}
          </ul>
        </article>
      `;
    })
    .join("");
}

function renderDistributionScorecardItems(catalog) {
  const scorecard = Array.isArray(catalog?.scorecard) ? catalog.scorecard : [];
  if (!scorecard.length) {
    return `
      <article class="distribution-scorecard-item distribution-scorecard-item-loading">
        <strong>No scorecard data</strong>
        <p>Connector viability appears here after the catalog loads.</p>
      </article>
    `;
  }

  return scorecard
    .map((site) => {
      const notes = Array.isArray(site?.product_notes) && site.product_notes.length
        ? site.product_notes[0]
        : Array.isArray(site?.notes) && site.notes.length
          ? site.notes[0]
          : "";
      const telemetry = site?.telemetry && typeof site.telemetry === "object" ? site.telemetry : {};
      const totalRuns = Number(telemetry.total_runs || 0);
      const liveStatus = String(site?.live_status || telemetry.operational_status || "untested").trim().toLowerCase();
      const liveNote = String(site?.live_note || telemetry.operational_note || "").trim();
      const policySummary = buildDistributionPolicySummary(site);
      const eligibilityLabel = formatDistributionEligibilityLabel(site);
      const eligibilityNote = String(site?.eligibility_note || "").trim();
      const catalogStatus = String(site?.product_status || "yellow").trim().toLowerCase();
      const effectiveStatus = String(site?.effective_product_status || catalogStatus || "yellow").trim().toLowerCase();
      const liveMetricsMarkup = totalRuns
        ? `
          <div class="distribution-scorecard-live">
            <div class="distribution-scorecard-live-metrics">
              <span><strong>${escapeHtml(String(totalRuns))}</strong><em>runs</em></span>
              <span><strong>${escapeHtml(formatDistributionPercent(telemetry.success_rate_percent))}</strong><em>success</em></span>
              <span><strong>${escapeHtml(String(Number(telemetry.captcha_count || 0)))}</strong><em>captcha</em></span>
              <span><strong>${escapeHtml(String(Number(telemetry.auth_count || 0)))}</strong><em>auth</em></span>
            </div>
            <div class="distribution-scorecard-live-note">
              <span>${escapeHtml(liveNote || "Recent live telemetry is available.")}</span>
              <span>Last status: ${escapeHtml(String(telemetry.last_submission_status || "unknown").replaceAll("_", " "))}</span>
              <span>Last run: ${escapeHtml(formatDate(telemetry.last_run_at))}</span>
            </div>
          </div>
        `
        : `
          <div class="distribution-scorecard-live distribution-scorecard-live-empty">
            <div class="distribution-scorecard-live-note">
              <span>${escapeHtml(liveNote || "No recent live runs recorded yet.")}</span>
            </div>
          </div>
        `;
      const eligibilityMarkup = eligibilityNote
        ? `
          <div class="distribution-scorecard-eligibility-note">
            <span>${escapeHtml(eligibilityNote)}</span>
          </div>
        `
        : "";
      const policyMarkup = policySummary.length
        ? `
          <div class="distribution-scorecard-policy">
            ${policySummary.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        `
        : "";
      return `
        <article class="distribution-scorecard-item">
          <div class="distribution-scorecard-top">
            <div>
              <strong>${escapeHtml(site?.site_name || site?.site_id || "Connector")}</strong>
              <p>${escapeHtml(notes || "Connector metadata available.")}</p>
            </div>
            <div class="distribution-scorecard-badges">
              <span class="distribution-scorecard-badge ${getDistributionStatusClass(effectiveStatus)}">${escapeHtml(
                eligibilityLabel.toUpperCase()
              )}</span>
              <span class="distribution-scorecard-badge ${getDistributionOperationalClass(liveStatus)}">${escapeHtml(
                formatDistributionOperationalStatus(liveStatus).toUpperCase()
              )}</span>
            </div>
          </div>
          <div class="distribution-scorecard-meta">
            <span>${escapeHtml(`Catalog ${catalogStatus.toUpperCase()}`)}</span>
            <span>${escapeHtml(formatDistributionSupportTier(site?.support_tier))}</span>
            <span>${escapeHtml(formatDistributionPolicy(site?.default_policy))}</span>
            <span>${escapeHtml(String(site?.category || "custom").replaceAll("_", " "))}</span>
          </div>
          ${policyMarkup}
          ${eligibilityMarkup}
          ${liveMetricsMarkup}
        </article>
      `;
    })
    .join("");
}

function renderDistributionPacksPanel(options = {}) {
  if (!hasAppDashboardUi || !elements.distributionPacksSection) {
    return;
  }

  const clearData = options.clearData === true;
  if (clearData) {
    state.submissionCatalog.trackData = {
      startup: null,
      physical_local: null
    };
  }
  const errorMessage = String(options.error || "").trim();
  if (typeof options.loading === "boolean") {
    state.submissionCatalog.loading = options.loading;
  }
  if (errorMessage || options.clearError === true) {
    state.submissionCatalog.error = errorMessage;
  }

  const activeTrack = normalizeDistributionTrack(state.submissionCatalog.activeTrack);
  const catalog = state.submissionCatalog.trackData[activeTrack];
  const isLoading = state.submissionCatalog.loading && !catalog;
  const error = !catalog ? String(state.submissionCatalog.error || "").trim() : "";

  if (elements.distributionTrackSwitcher) {
    const buttons = Array.from(elements.distributionTrackSwitcher.querySelectorAll("[data-distribution-track]"));
    for (const button of buttons) {
      const buttonTrack = normalizeDistributionTrack(button.getAttribute("data-distribution-track"));
      const isActive = buttonTrack === activeTrack;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }

  if (elements.distributionPacksMeta) {
    if (error) {
      elements.distributionPacksMeta.textContent = error;
    } else if (catalog) {
      const packCount = Array.isArray(catalog.effective_product_packs) && catalog.effective_product_packs.length
        ? catalog.effective_product_packs.length
        : Array.isArray(catalog.product_packs)
          ? catalog.product_packs.length
          : 0;
      const summary = catalog.scorecard_effective_summary || catalog.scorecard_summary || {};
      const eligibilitySummary = catalog.scorecard_eligibility_summary || {};
      const telemetrySummary = catalog.scorecard_telemetry_summary || {};
      const liveSites = Number(telemetrySummary.sites_with_live_runs || 0);
      const sampledJobs = Number(telemetrySummary.sampled_jobs || 0);
      const captchaCount = Number(telemetrySummary.captcha_count || 0);
      const starterCount = Number(eligibilitySummary.starter_count || 0);
      const boosterCount = Number(eligibilitySummary.booster_count || 0);
      const manualCount = Number(eligibilitySummary.manual_count || 0);
      const telemetrySuffix = liveSites
        ? ` · ${liveSites} live connector${liveSites === 1 ? "" : "s"} · ${sampledJobs} recent run${
            sampledJobs === 1 ? "" : "s"
          } · ${captchaCount} captcha pause${captchaCount === 1 ? "" : "s"}`
        : "";
      elements.distributionPacksMeta.textContent = `${formatDistributionTrackLabel(activeTrack)} packs: ${packCount} product bundle${
        packCount === 1 ? "" : "s"
      } · ${starterCount} starter · ${boosterCount} booster · ${manualCount} manual · ${Number(
        summary.red_count || 0
      )} red-risk connectors.${telemetrySuffix}`;
    } else if (isLoading) {
      elements.distributionPacksMeta.textContent = `Loading ${formatDistributionTrackLabel(activeTrack).toLowerCase()} packs…`;
    } else {
      elements.distributionPacksMeta.textContent = "Sellable launch and presence bundles, classified by real connector viability.";
    }
  }

  if (elements.distributionPacksGrid) {
    if (error) {
      elements.distributionPacksGrid.innerHTML = `
        <article class="distribution-pack-card distribution-pack-card-loading">
          <strong>Could not load packs</strong>
          <p>${escapeHtml(error)}</p>
        </article>
      `;
    } else if (isLoading) {
      elements.distributionPacksGrid.innerHTML = `
        <article class="distribution-pack-card distribution-pack-card-loading">
          <strong>Loading packs…</strong>
          <p>Fetching product-facing distribution bundles.</p>
        </article>
      `;
    } else {
      elements.distributionPacksGrid.innerHTML = renderDistributionPackCards(catalog);
    }
  }

  if (elements.distributionScorecardSummary) {
    elements.distributionScorecardSummary.innerHTML = buildDistributionSummaryMarkup(
      error ? {} : catalog?.scorecard_effective_summary || catalog?.scorecard_summary || {}
    );
  }

  if (elements.distributionScorecardList) {
    if (error) {
      elements.distributionScorecardList.innerHTML = `
        <article class="distribution-scorecard-item distribution-scorecard-item-loading">
          <strong>Could not load scorecard</strong>
          <p>${escapeHtml(error)}</p>
        </article>
      `;
    } else if (isLoading) {
      elements.distributionScorecardList.innerHTML = `
        <article class="distribution-scorecard-item distribution-scorecard-item-loading">
          <strong>Loading scorecard…</strong>
          <p>Connector viability appears here.</p>
        </article>
      `;
    } else {
      elements.distributionScorecardList.innerHTML = renderDistributionScorecardItems(catalog);
    }
  }

  renderDistributionLauncher();
}

async function requestDistributionCatalogOnce(track) {
  const safeTrack = normalizeDistributionTrack(track);
  const params = new URLSearchParams({ track: safeTrack });
  const response = await fetch(`/api/submissions/packs?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to access distribution packs.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load distribution packs");
    error.status = response.status || 500;
    throw error;
  }
  return data;
}

async function requestDistributionCatalog(track) {
  let lastError = null;
  for (let attempt = 0; attempt < DASHBOARD_BOOT_FETCH_RETRIES; attempt += 1) {
    try {
      return await requestDistributionCatalogOnce(track);
    } catch (error) {
      lastError = error;
      if (!isRetryableDashboardFetch({ status: error?.status }, error) || attempt === DASHBOARD_BOOT_FETCH_RETRIES - 1) {
        throw error;
      }
      await waitForDashboardRetry(180 * (attempt + 1));
    }
  }
  throw lastError || new Error("Failed to load distribution packs");
}

async function loadDistributionCatalog(track, options = {}) {
  if (!hasAppDashboardUi || !elements.distributionPacksSection) {
    return null;
  }
  const safeTrack = normalizeDistributionTrack(track || state.submissionCatalog.activeTrack);
  const force = options.force === true;
  if (!force && state.submissionCatalog.trackData[safeTrack]) {
    renderDistributionPacksPanel({ clearError: true });
    return state.submissionCatalog.trackData[safeTrack];
  }

  const shouldShowLoading = options.renderLoading !== false;
  if (shouldShowLoading) {
    setDistributionCatalogLoading(true);
    renderDistributionPacksPanel({ loading: true, clearError: true });
  }

  try {
    const catalog = await requestDistributionCatalog(safeTrack);
    state.submissionCatalog.trackData[safeTrack] = catalog;
    state.submissionCatalog.error = "";
    return catalog;
  } catch (error) {
    state.submissionCatalog.error = error.message || "Failed to load distribution packs";
    throw error;
  } finally {
    if (shouldShowLoading) {
      setDistributionCatalogLoading(false);
      renderDistributionPacksPanel({ loading: false });
    }
  }
}

function prefetchDistributionCatalog(track) {
  const safeTrack = normalizeDistributionTrack(track);
  if (state.submissionCatalog.trackData[safeTrack]) {
    return;
  }
  loadDistributionCatalog(safeTrack, { renderLoading: false }).catch(() => {
    // Prefetch failures should not interrupt the main dashboard.
  });
}

function isDistributionActiveJobStatus(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  return safeValue === "queued" || safeValue === "processing" || safeValue === "retryable";
}

function getDistributionDecisionClass(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "ready_auto" || safeValue === "completed" || safeValue === "approved") {
    return "is-green";
  }
  if (safeValue === "blocked" || safeValue === "failed" || safeValue === "cancelled" || safeValue === "rejected") {
    return "is-red";
  }
  return "is-yellow";
}

function formatDistributionDecisionLabel(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (!safeValue) {
    return "unknown";
  }
  return safeValue.replaceAll("_", " ");
}

function stopDistributionPreparePolling() {
  if (state.submissionLauncher.prepareJobTimer) {
    window.clearTimeout(state.submissionLauncher.prepareJobTimer);
    state.submissionLauncher.prepareJobTimer = null;
  }
}

function stopDistributionQueuePolling() {
  if (state.submissionLauncher.queuePollTimer) {
    window.clearTimeout(state.submissionLauncher.queuePollTimer);
    state.submissionLauncher.queuePollTimer = null;
  }
}

function resetDistributionLauncher(options = {}) {
  const preserveBrands = options.preserveBrands === true;
  const preserveSelection = options.preserveSelection === true;
  stopDistributionPreparePolling();
  stopDistributionQueuePolling();
  state.submissionLauncher.loadingBrands = false;
  state.submissionLauncher.brandsError = "";
  if (!preserveBrands) {
    state.submissionLauncher.brands = [];
  }
  if (!preserveSelection) {
    state.submissionLauncher.selectedBrandProfileId = "";
    state.submissionLauncher.selectedPackId = "";
  }
  state.submissionLauncher.latestManifest = null;
  state.submissionLauncher.loadingManifest = false;
  state.submissionLauncher.manifestError = "";
  state.submissionLauncher.prepareJob = null;
  state.submissionLauncher.preparing = false;
  state.submissionLauncher.preflight = null;
  state.submissionLauncher.preflighting = false;
  state.submissionLauncher.queueBatch = null;
  state.submissionLauncher.queueStatuses = {};
  state.submissionLauncher.queueing = false;
  state.submissionLauncher.brandForm = {
    sourceBrandProfileId: "",
    identityMode: "client_owned",
    mailboxEmail: "",
    mailboxAuthMethod: "unknown",
    mailboxHost: "",
    mailboxPort: "993",
    mailboxPassword: "",
    mailboxReady: false
  };
  state.submissionLauncher.savingBrand = false;
  state.submissionLauncher.brandSaveMessage = "Mailbox setup is stored on the submission brand and used for new-account verification flows.";
  state.submissionLauncher.brandSaveTone = "";
  state.submissionLauncher.message = "Choose a submission brand and a product pack to start.";
  state.submissionLauncher.messageTone = "";
  state.submissionLauncher.lastAction = "idle";
}

function getActiveDistributionCatalog() {
  return state.submissionCatalog.trackData[normalizeDistributionTrack(state.submissionCatalog.activeTrack)] || null;
}

function getActiveDistributionPacks() {
  const catalog = getActiveDistributionCatalog();
  if (Array.isArray(catalog?.effective_product_packs) && catalog.effective_product_packs.length) {
    return catalog.effective_product_packs;
  }
  return Array.isArray(catalog?.product_packs) ? catalog.product_packs : [];
}

function getActiveDistributionBrands() {
  const activeTrack = normalizeDistributionTrack(state.submissionCatalog.activeTrack);
  return state.submissionLauncher.brands.filter((brand) => normalizeDistributionTrack(brand.track) === activeTrack);
}

function getSelectedDistributionBrand() {
  const brands = getActiveDistributionBrands();
  return brands.find((brand) => brand.brand_profile_id === state.submissionLauncher.selectedBrandProfileId) || null;
}

function getSelectedDistributionPack() {
  const packs = getActiveDistributionPacks();
  return packs.find((pack) => String(pack?.pack_id || "").trim().toLowerCase() === state.submissionLauncher.selectedPackId) || null;
}

function getDistributionPackAvailableSiteCount(pack) {
  const explicitCount = Number(pack?.effective_site_count);
  if (Number.isFinite(explicitCount) && explicitCount >= 0) {
    return explicitCount;
  }
  return Array.isArray(pack?.sites) ? pack.sites.length : 0;
}

function deriveDistributionWebsiteKey(value) {
  return normalizeBrandFilterValue(value);
}

function pickDefaultDistributionBrand(brands) {
  const candidates = Array.isArray(brands) ? brands : [];
  if (!candidates.length) {
    return "";
  }
  const currentBrandKey = normalizeBrandFilterValue(state.filters.brand);
  if (currentBrandKey) {
    const matchingBrand =
      candidates.find((brand) => normalizeBrandFilterValue(brand.brand_key) === currentBrandKey) ||
      candidates.find((brand) => deriveDistributionWebsiteKey(brand.website_url) === currentBrandKey);
    if (matchingBrand?.brand_profile_id) {
      return matchingBrand.brand_profile_id;
    }
  }
  return sanitizeOptionalString(candidates[0]?.brand_profile_id, 128) || "";
}

function syncDistributionLauncherSelections() {
  const brands = getActiveDistributionBrands();
  const packs = getActiveDistributionPacks();
  const activeTrack = normalizeDistributionTrack(state.submissionCatalog.activeTrack);
  const catalog = getActiveDistributionCatalog();
  let brandChanged = false;
  let packChanged = false;

  if (!brands.some((brand) => brand.brand_profile_id === state.submissionLauncher.selectedBrandProfileId)) {
    state.submissionLauncher.selectedBrandProfileId = pickDefaultDistributionBrand(brands);
    brandChanged = true;
  }

  const selectedPackStillAvailable = packs.some((pack) => {
    const packId = String(pack?.pack_id || "").trim().toLowerCase();
    return packId === state.submissionLauncher.selectedPackId && getDistributionPackAvailableSiteCount(pack) > 0;
  });

  if (!selectedPackStillAvailable) {
    const recommendedPackId = String(catalog?.recommended_pack?.pack_id || "").trim().toLowerCase();
    const selectablePacks = packs.filter((pack) => getDistributionPackAvailableSiteCount(pack) > 0);
    state.submissionLauncher.selectedPackId =
      (
        selectablePacks.find((pack) => String(pack?.pack_id || "").trim().toLowerCase() === recommendedPackId)?.pack_id ||
        selectablePacks[0]?.pack_id ||
        packs[0]?.pack_id ||
        ""
      )
        .toLowerCase();
    packChanged = true;
  }

  const selectedBrand = getSelectedDistributionBrand();
  if (selectedBrand && normalizeDistributionTrack(selectedBrand.track) !== activeTrack) {
    state.submissionLauncher.selectedBrandProfileId = pickDefaultDistributionBrand(brands);
    brandChanged = true;
  }

  return { brandChanged, packChanged };
}

function setDistributionLauncherMessage(message, tone = "") {
  state.submissionLauncher.message = sanitizeOptionalString(message, 400) || "Choose a submission brand and a product pack to start.";
  state.submissionLauncher.messageTone = sanitizeString(tone, 24).toLowerCase();
}

function setDistributionBrandSaveMessage(message, tone = "") {
  state.submissionLauncher.brandSaveMessage =
    sanitizeOptionalString(message, 400) ||
    "Mailbox setup is stored on the submission brand and used for new-account verification flows.";
  state.submissionLauncher.brandSaveTone = sanitizeString(tone, 24).toLowerCase();
}

function inferDistributionMailboxProvider(email) {
  const safeEmail = sanitizeOptionalString(email, 320) || "";
  const domain = safeEmail.includes("@") ? safeEmail.split("@").pop().toLowerCase() : "";
  if (!domain) {
    return "";
  }
  for (const [providerKey, preset] of Object.entries(DISTRIBUTION_MAILBOX_PROVIDER_PRESETS)) {
    if (Array.isArray(preset.domains) && preset.domains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))) {
      return providerKey;
    }
  }
  return "";
}

function resolveDistributionMailboxPreset(provider, email) {
  const explicitProvider = sanitizeOptionalString(provider, 120) || "";
  const providerKey = explicitProvider || inferDistributionMailboxProvider(email);
  if (!providerKey) {
    return null;
  }
  return DISTRIBUTION_MAILBOX_PROVIDER_PRESETS[providerKey] || null;
}

function applyDistributionMailboxDefaults(options = {}) {
  const force = options.force === true;
  const form = state.submissionLauncher.brandForm;
  if (!form || typeof form !== "object") {
    return;
  }
  const inferredProvider = inferDistributionMailboxProvider(form.mailboxEmail);
  if ((!form.mailboxProvider || form.mailboxProvider === "unknown") && inferredProvider) {
    form.mailboxProvider = inferredProvider;
  }
  const preset = resolveDistributionMailboxPreset(form.mailboxProvider, form.mailboxEmail);
  if (!preset) {
    return;
  }

  if (!form.mailboxUsername) {
    form.mailboxUsername = form.mailboxEmail || "";
  }
  if (force || !form.mailboxHost) {
    form.mailboxHost = preset.imapHost || form.mailboxHost || "";
  }
  if (force || !form.mailboxPort || form.mailboxPort === "993") {
    form.mailboxPort = preset.imapPort || form.mailboxPort || "993";
  }
  if (force || form.mailboxSecure === undefined || form.mailboxSecure === null) {
    form.mailboxSecure = preset.imapSecure === true;
  }
  if (force || !form.mailboxSmtpHost) {
    form.mailboxSmtpHost = preset.smtpHost || form.mailboxSmtpHost || "";
  }
  if (force || !form.mailboxSmtpPort || form.mailboxSmtpPort === "465" || form.mailboxSmtpPort === "587") {
    form.mailboxSmtpPort = preset.smtpPort || form.mailboxSmtpPort || "587";
  }
  if (force || form.mailboxSmtpSecure === undefined || form.mailboxSmtpSecure === null) {
    form.mailboxSmtpSecure = preset.smtpSecure === true;
  }
}

function buildDistributionBrandFormState(brand) {
  const identity =
    brand?.profile && typeof brand.profile === "object" && brand.profile.identity && typeof brand.profile.identity === "object"
      ? brand.profile.identity
      : null;
  const mailbox = identity && identity.mailbox && typeof identity.mailbox === "object" ? identity.mailbox : null;
  const hasMailboxSecure = mailbox && mailbox.secure !== undefined && mailbox.secure !== null;
  const hasMailboxSmtpSecure = mailbox && mailbox.smtp_secure !== undefined && mailbox.smtp_secure !== null;
  const formState = {
    sourceBrandProfileId: sanitizeOptionalString(brand?.brand_profile_id, 128) || "",
    identityMode: sanitizeOptionalString(identity?.mode, 64) || "client_owned",
    mailboxProvider: sanitizeOptionalString(mailbox?.provider, 120) || "",
    mailboxEmail: sanitizeOptionalString(mailbox?.email, 320) || "",
    mailboxUsername: sanitizeOptionalString(mailbox?.username, 320) || "",
    mailboxAuthMethod: sanitizeOptionalString(mailbox?.auth_method, 64) || "unknown",
    mailboxHost: sanitizeOptionalString(mailbox?.host, 320) || "",
    mailboxPort: sanitizeOptionalString(mailbox?.port, 16) || "993",
    mailboxSecure: hasMailboxSecure ? mailbox?.secure !== false : null,
    mailboxSmtpHost: sanitizeOptionalString(mailbox?.smtp_host, 320) || "",
    mailboxSmtpPort: sanitizeOptionalString(mailbox?.smtp_port, 16) || "465",
    mailboxSmtpSecure: hasMailboxSmtpSecure ? mailbox?.smtp_secure === true : null,
    mailboxPassword: "",
    mailboxReady: mailbox?.inbox_ready === true
  };
  state.submissionLauncher.brandForm = formState;
  applyDistributionMailboxDefaults();
  return state.submissionLauncher.brandForm;
}

function syncDistributionBrandFormState(selectedBrand, force = false) {
  const sourceBrandProfileId = sanitizeOptionalString(selectedBrand?.brand_profile_id, 128) || "";
  if (!force && state.submissionLauncher.brandForm.sourceBrandProfileId === sourceBrandProfileId) {
    return;
  }
  state.submissionLauncher.brandForm = buildDistributionBrandFormState(selectedBrand);
  setDistributionBrandSaveMessage("", "");
}

function formatDistributionTrackShort(value) {
  const safeValue = normalizeDistributionTrack(value);
  return safeValue === "physical_local" ? "Local presence" : "Startup";
}

function buildDistributionLauncherStateLabel() {
  if (state.submissionLauncher.preparing) {
    return "Preparing";
  }
  if (state.submissionLauncher.preflighting) {
    return "Preflight";
  }
  if (state.submissionLauncher.queueing) {
    return "Queueing";
  }
  if (state.submissionLauncher.queueBatch) {
    return "Queued";
  }
  if (state.submissionLauncher.preflight) {
    return "Checked";
  }
  if (state.submissionLauncher.prepareJob) {
    return "Prepared";
  }
  return "Idle";
}

function buildDistributionBrandSummaryMarkup(brand, manifestRow) {
  if (!brand) {
    return "<p>Select a submission brand to see website, track, and current manifest coverage.</p>";
  }
  const websiteUrl = toExternalUrl(brand.website_url);
  const manifestStatus = sanitizeOptionalString(manifestRow?.status, 64) || "No manifest";
  const identity =
    brand?.profile && typeof brand.profile === "object" && brand.profile.identity && typeof brand.profile.identity === "object"
      ? brand.profile.identity
      : null;
  const mailbox = identity && identity.mailbox && typeof identity.mailbox === "object" ? identity.mailbox : null;
  const identityMode = sanitizeOptionalString(identity?.mode, 64) || "Not set";
  const mailboxEmail = sanitizeOptionalString(mailbox?.email, 320) || "Not set";
  const mailboxProvider =
    sanitizeOptionalString(mailbox?.provider, 120) ||
    inferDistributionMailboxProvider(mailboxEmail) ||
    "Auto";
  const preset = resolveDistributionMailboxPreset(mailboxProvider, mailboxEmail);
  const mailboxAuth = sanitizeOptionalString(mailbox?.auth_method, 64) || "unknown";
  const inboxReady = mailbox?.inbox_ready === true ? "Ready" : "Needs setup";
  const imapHost = sanitizeOptionalString(mailbox?.host, 320) || preset?.imapHost || "";
  const imapPort = sanitizeOptionalString(mailbox?.port, 16) || preset?.imapPort || "993";
  const imapSecure =
    mailbox?.secure === undefined || mailbox?.secure === null
      ? preset?.imapSecure !== false
      : mailbox?.secure !== false;
  const smtpHost = sanitizeOptionalString(mailbox?.smtp_host, 320) || preset?.smtpHost || "";
  const smtpPort = sanitizeOptionalString(mailbox?.smtp_port, 16) || preset?.smtpPort || "587";
  const smtpSecure =
    mailbox?.smtp_secure === undefined || mailbox?.smtp_secure === null
      ? preset?.smtpSecure === true
      : mailbox?.smtp_secure === true;
  const imapRoute = imapHost
    ? `${imapHost}:${imapPort} · ${imapSecure ? "SSL" : "plain"}`
    : "Not set";
  const smtpRoute = smtpHost
    ? `${smtpHost}:${smtpPort} · ${smtpSecure ? "SSL" : "STARTTLS/plain"}`
    : "Not set";
  return `
    <dl class="distribution-result-facts">
      <div><dt>Name</dt><dd>${escapeHtml(brand.display_name || brand.brand_profile_id)}</dd></div>
      <div><dt>Track</dt><dd>${escapeHtml(formatDistributionTrackShort(brand.track))}</dd></div>
      <div><dt>Brand key</dt><dd>${escapeHtml(brand.brand_key || "Not set")}</dd></div>
      <div><dt>Manifest</dt><dd>${escapeHtml(manifestStatus.replaceAll("_", " "))}</dd></div>
      <div><dt>Identity</dt><dd>${escapeHtml(identityMode.replaceAll("_", " "))}</dd></div>
      <div><dt>Provider</dt><dd>${escapeHtml(mailboxProvider.replaceAll("_", " "))}</dd></div>
      <div><dt>Mailbox</dt><dd>${escapeHtml(mailboxEmail)}</dd></div>
      <div><dt>Inbox auth</dt><dd>${escapeHtml(`${mailboxAuth.replaceAll("_", " ")} · ${inboxReady}`)}</dd></div>
      <div><dt>IMAP</dt><dd>${escapeHtml(imapRoute)}</dd></div>
      <div><dt>SMTP</dt><dd>${escapeHtml(smtpRoute)}</dd></div>
    </dl>
    ${
      websiteUrl
        ? `<p><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(websiteUrl)}</a></p>`
        : "<p>No website URL stored on this brand profile.</p>"
    }
  `;
}

function buildDistributionManifestSummaryMarkup(manifestRow, options = {}) {
  if (options.loading) {
    return "<p>Loading the latest asset manifest…</p>";
  }
  if (options.error) {
    return `<p>${escapeHtml(options.error)}</p>`;
  }
  if (!manifestRow) {
    return "<p>No asset manifest exists for this brand yet. Run asset preparation to generate one.</p>";
  }

  const manifest = manifestRow?.manifest && typeof manifestRow.manifest === "object" ? manifestRow.manifest : {};
  const missingItems = Array.isArray(manifest.missing_items) ? manifest.missing_items : [];
  const approvalItems = Array.isArray(manifest.approval_items) ? manifest.approval_items : [];
  const siteManifests = Array.isArray(manifest.site_manifests) ? manifest.site_manifests : [];

  const topMissing = missingItems.slice(0, 3).map((item) => sanitizeOptionalString(item?.message || item?.label || item, 240)).filter(Boolean);
  return `
    <div class="distribution-result-summary-row">
      <span class="distribution-summary-pill ${getDistributionDecisionClass(manifestRow.status)}">${escapeHtml(
        String(manifestRow.status || "pending").replaceAll("_", " ")
      )}</span>
      <span class="distribution-inline-meta">v${escapeHtml(String(manifestRow.version || 1))}</span>
      <span class="distribution-inline-meta">${escapeHtml(String(siteManifests.length))} sites</span>
      <span class="distribution-inline-meta">${escapeHtml(String(missingItems.length))} missing</span>
      <span class="distribution-inline-meta">${escapeHtml(String(approvalItems.length))} approvals</span>
    </div>
    ${
      topMissing.length
        ? `<ul class="distribution-inline-list">${topMissing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "<p>No manifest gaps are currently flagged.</p>"
    }
  `;
}

function buildDistributionPreflightSummaryMarkup(preflight) {
  if (!preflight) {
    return "<p>Run preflight to see which connectors are ready, assisted, or blocked.</p>";
  }

  const items = Array.isArray(preflight.items) ? preflight.items : [];
  const nextSteps = Array.isArray(preflight.next_steps) ? preflight.next_steps.slice(0, 3) : [];
  const livePackSelection =
    preflight && preflight.live_pack_selection && typeof preflight.live_pack_selection === "object"
      ? preflight.live_pack_selection
      : null;
  const degradedCount = Number(livePackSelection?.degraded_count || 0);
  const telemetryError = sanitizeOptionalString(preflight?.telemetry_error || livePackSelection?.telemetry_error, 220) || "";
  return `
    <div class="distribution-result-summary-row">
      <span class="distribution-summary-pill ${getDistributionDecisionClass(preflight.overall_decision)}">${escapeHtml(
        formatDistributionDecisionLabel(preflight.overall_decision)
      )}</span>
      <span class="distribution-inline-meta">${escapeHtml(String(preflight.summary?.ready_auto_count || 0))} auto</span>
      <span class="distribution-inline-meta">${escapeHtml(String(preflight.summary?.ready_assist_count || 0))} assist</span>
      <span class="distribution-inline-meta">${escapeHtml(String(preflight.summary?.blocked_count || 0))} blocked</span>
      ${degradedCount ? `<span class="distribution-inline-meta">${escapeHtml(String(degradedCount))} downgraded</span>` : ""}
    </div>
    ${
      items.length
        ? `<ul class="distribution-inline-list">${items
            .slice(0, 5)
            .map((item) => {
              const reason = Array.isArray(item.reasons) && item.reasons[0] ? item.reasons[0].message : "No reason logged.";
              const policySummary = buildDistributionPolicySummary(item);
              return `<li><strong>${escapeHtml(item.site_name || item.site_id)}</strong> · ${escapeHtml(
                formatDistributionDecisionLabel(item.decision)
              )}${policySummary.length ? ` · ${escapeHtml(policySummary.join(" / "))}` : ""} · ${escapeHtml(reason)}</li>`;
            })
            .join("")}</ul>`
        : "<p>No site decisions returned.</p>"
    }
    ${
      telemetryError
        ? `<p>${escapeHtml(`Live telemetry fallback: ${telemetryError}`)}</p>`
        : ""
    }
    ${
      nextSteps.length
        ? `<p>${escapeHtml(nextSteps.join(" "))}</p>`
        : ""
    }
  `;
}

function buildDistributionQueueSummaryMarkup(batch, statusMap = {}) {
  if (!batch) {
    return "<p>Queued submit jobs and their current state will appear here.</p>";
  }

  const queuedJobs = Array.isArray(batch.queued_jobs) ? batch.queued_jobs : [];
  const skippedSites = Array.isArray(batch.skipped_sites) ? batch.skipped_sites : [];
  const failedSites = Array.isArray(batch.failed_sites) ? batch.failed_sites : [];
  return `
    <div class="distribution-result-summary-row">
      <span class="distribution-inline-meta">${escapeHtml(String(batch.summary?.queued_count || queuedJobs.length))} queued</span>
      <span class="distribution-inline-meta">${escapeHtml(String(batch.summary?.skipped_count || skippedSites.length))} skipped</span>
      <span class="distribution-inline-meta">${escapeHtml(String(batch.summary?.failed_count || failedSites.length))} failed</span>
      ${
        Number(batch.summary?.static_requested_site_count || 0) > Number(batch.summary?.requested_site_count || 0)
          ? `<span class="distribution-inline-meta">${escapeHtml(
              `${Number(batch.summary?.static_requested_site_count || 0) - Number(batch.summary?.requested_site_count || 0)} excluded`
            )}</span>`
          : ""
      }
      <span class="distribution-inline-meta">${escapeHtml(batch.dry_run ? "Dry run" : "Worker queue")}</span>
    </div>
    ${
      queuedJobs.length
        ? `<ul class="distribution-inline-list">${queuedJobs
            .map((job) => {
              const latest = statusMap[job.job_id] || null;
              const jobStatus = sanitizeOptionalString(latest?.job?.status, 64) || sanitizeOptionalString(job.status, 64) || "queued";
              const liveStatus = sanitizeOptionalString(latest?.live_report?.status, 64) || sanitizeOptionalString(latest?.live_report?.summary?.note, 220) || "";
              return `<li><strong>${escapeHtml(job.site_name || job.site_id)}</strong> · <span class="distribution-site-badge ${getDistributionDecisionClass(
                jobStatus
              )}">${escapeHtml(jobStatus.replaceAll("_", " "))}</span>${liveStatus ? ` <span>${escapeHtml(liveStatus)}</span>` : ""}</li>`;
            })
            .join("")}</ul>`
        : "<p>No submit jobs were queued for this run.</p>"
    }
  `;
}

function renderDistributionLauncher() {
  if (!hasAppDashboardUi || !elements.distributionLauncherForm) {
    return;
  }

  const { brandChanged, packChanged } = syncDistributionLauncherSelections();
  const brands = getActiveDistributionBrands();
  const selectedBrand = getSelectedDistributionBrand();
  const packs = getActiveDistributionPacks();
  const selectedPack = getSelectedDistributionPack();
  syncDistributionBrandFormState(selectedBrand, brandChanged);

  if (brandChanged) {
    state.submissionLauncher.latestManifest = null;
    state.submissionLauncher.manifestError = "";
    state.submissionLauncher.preflight = null;
    state.submissionLauncher.queueBatch = null;
    state.submissionLauncher.queueStatuses = {};
  }
  if (packChanged) {
    state.submissionLauncher.preflight = null;
    state.submissionLauncher.queueBatch = null;
    state.submissionLauncher.queueStatuses = {};
  }

  if (elements.distributionBrandSelect) {
    if (state.submissionLauncher.loadingBrands && !brands.length) {
      elements.distributionBrandSelect.innerHTML = '<option value="">Loading brands…</option>';
    } else if (!brands.length) {
      elements.distributionBrandSelect.innerHTML = `<option value="">${escapeHtml(
        state.submissionLauncher.brandsError || `No ${formatDistributionTrackShort(state.submissionCatalog.activeTrack).toLowerCase()} submission brands yet`
      )}</option>`;
    } else {
      elements.distributionBrandSelect.innerHTML = brands
        .map((brand) => {
          const value = sanitizeOptionalString(brand.brand_profile_id, 128) || "";
          const label = [brand.display_name || value, brand.brand_key || "", brand.website_url ? deriveDistributionWebsiteKey(brand.website_url) : ""]
            .filter(Boolean)
            .slice(0, 2)
            .join(" · ");
          return `<option value="${escapeHtml(value)}">${escapeHtml(label || value)}</option>`;
        })
        .join("");
      elements.distributionBrandSelect.value = state.submissionLauncher.selectedBrandProfileId || brands[0]?.brand_profile_id || "";
    }
    elements.distributionBrandSelect.disabled = state.submissionLauncher.loadingBrands || !brands.length;
  }

  if (elements.distributionPackSelect) {
    if (!packs.length) {
      elements.distributionPackSelect.innerHTML = '<option value="">No product packs on this track</option>';
    } else {
      const selectablePacks = packs.filter((pack) => getDistributionPackAvailableSiteCount(pack) > 0);
      elements.distributionPackSelect.innerHTML = packs
        .map((pack) => {
          const availableCount = getDistributionPackAvailableSiteCount(pack);
          const label = availableCount > 0
            ? `${pack.pack_name || pack.pack_id} (${availableCount})`
            : `${pack.pack_name || pack.pack_id} (unavailable)`;
          return `<option value="${escapeHtml(pack.pack_id)}"${availableCount > 0 ? "" : " disabled"}>${escapeHtml(label)}</option>`;
        })
        .join("");
      elements.distributionPackSelect.value =
        state.submissionLauncher.selectedPackId || selectablePacks[0]?.pack_id || packs[0]?.pack_id || "";
    }
    elements.distributionPackSelect.disabled = !packs.length || !packs.some((pack) => getDistributionPackAvailableSiteCount(pack) > 0);
  }

  const liveEnabled = Boolean(elements.distributionSubmitLive?.checked);
  if (elements.distributionNoHumanActions) {
    elements.distributionNoHumanActions.disabled = !liveEnabled;
    if (!liveEnabled) {
      elements.distributionNoHumanActions.checked = false;
    }
  }

  const disabled = !selectedBrand || !selectedPack || state.submissionLauncher.loadingBrands;
  const actionsBusy = state.submissionLauncher.preparing || state.submissionLauncher.preflighting || state.submissionLauncher.queueing;
  elements.distributionPrepareAction && (elements.distributionPrepareAction.disabled = disabled || actionsBusy);
  elements.distributionPreflightAction && (elements.distributionPreflightAction.disabled = disabled || actionsBusy);
  elements.distributionQueueAction && (elements.distributionQueueAction.disabled = disabled || actionsBusy);

  if (elements.distributionLauncherState) {
    elements.distributionLauncherState.textContent = buildDistributionLauncherStateLabel();
    elements.distributionLauncherState.className = `distribution-launcher-state ${getDistributionDecisionClass(
      state.submissionLauncher.queueBatch
        ? "ready_assist"
        : state.submissionLauncher.preflight?.overall_decision || (state.submissionLauncher.preparing ? "ready_assist" : "yellow")
    )}`;
  }

  if (elements.distributionLauncherMessage) {
    elements.distributionLauncherMessage.textContent = state.submissionLauncher.message;
    elements.distributionLauncherMessage.dataset.state = state.submissionLauncher.messageTone || "";
  }

  if (elements.distributionBrandMeta) {
    elements.distributionBrandMeta.textContent = selectedBrand
      ? `${formatDistributionTrackShort(selectedBrand.track)} · ${selectedBrand.brand_key || "submission brand"}`
      : "No brand selected";
  }
  if (elements.distributionBrandSummary) {
    elements.distributionBrandSummary.innerHTML = buildDistributionBrandSummaryMarkup(
      selectedBrand,
      state.submissionLauncher.latestManifest
    );
  }
  if (elements.distributionBrandSaveMeta) {
    elements.distributionBrandSaveMeta.textContent = selectedBrand
      ? `${state.submissionLauncher.brandForm.mailboxProvider || inferDistributionMailboxProvider(state.submissionLauncher.brandForm.mailboxEmail) || "custom"} · ${
          state.submissionLauncher.brandForm.mailboxEmail || "No mailbox"
        } · ${
          state.submissionLauncher.brandForm.mailboxReady ? "ready" : "setup needed"
        }`
      : "Client-owned inbox";
  }
  if (elements.distributionIdentityMode) {
    elements.distributionIdentityMode.value = state.submissionLauncher.brandForm.identityMode || "client_owned";
    elements.distributionIdentityMode.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxProvider) {
    const providerValue = sanitizeOptionalString(state.submissionLauncher.brandForm.mailboxProvider, 120) || "";
    const hasProviderOption = Array.from(elements.distributionMailboxProvider.options || []).some(
      (option) => String(option?.value || "") === providerValue
    );
    elements.distributionMailboxProvider.value =
      providerValue && hasProviderOption
        ? providerValue
        : providerValue
          ? "custom"
          : "";
    elements.distributionMailboxProvider.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxEmail) {
    elements.distributionMailboxEmail.value = state.submissionLauncher.brandForm.mailboxEmail || "";
    elements.distributionMailboxEmail.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxUsername) {
    elements.distributionMailboxUsername.value = state.submissionLauncher.brandForm.mailboxUsername || "";
    elements.distributionMailboxUsername.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxAuthMethod) {
    elements.distributionMailboxAuthMethod.value = state.submissionLauncher.brandForm.mailboxAuthMethod || "unknown";
    elements.distributionMailboxAuthMethod.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxHost) {
    elements.distributionMailboxHost.value = state.submissionLauncher.brandForm.mailboxHost || "";
    elements.distributionMailboxHost.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxPort) {
    elements.distributionMailboxPort.value = state.submissionLauncher.brandForm.mailboxPort || "993";
    elements.distributionMailboxPort.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxSecure) {
    elements.distributionMailboxSecure.checked = state.submissionLauncher.brandForm.mailboxSecure !== false;
    elements.distributionMailboxSecure.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxSmtpHost) {
    elements.distributionMailboxSmtpHost.value = state.submissionLauncher.brandForm.mailboxSmtpHost || "";
    elements.distributionMailboxSmtpHost.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxSmtpPort) {
    elements.distributionMailboxSmtpPort.value = state.submissionLauncher.brandForm.mailboxSmtpPort || "587";
    elements.distributionMailboxSmtpPort.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxSmtpSecure) {
    elements.distributionMailboxSmtpSecure.checked = state.submissionLauncher.brandForm.mailboxSmtpSecure === true;
    elements.distributionMailboxSmtpSecure.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxPassword) {
    elements.distributionMailboxPassword.value = state.submissionLauncher.brandForm.mailboxPassword || "";
    elements.distributionMailboxPassword.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionMailboxReady) {
    elements.distributionMailboxReady.checked = state.submissionLauncher.brandForm.mailboxReady === true;
    elements.distributionMailboxReady.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
  }
  if (elements.distributionSaveBrandAction) {
    elements.distributionSaveBrandAction.disabled = !selectedBrand || state.submissionLauncher.savingBrand;
    elements.distributionSaveBrandAction.textContent = state.submissionLauncher.savingBrand ? "Saving…" : "Save Mailbox";
  }
  if (elements.distributionBrandSaveMessage) {
    elements.distributionBrandSaveMessage.textContent = state.submissionLauncher.brandSaveMessage;
    elements.distributionBrandSaveMessage.dataset.state = state.submissionLauncher.brandSaveTone || "";
  }

  if (elements.distributionManifestMeta) {
    if (state.submissionLauncher.loadingManifest) {
      elements.distributionManifestMeta.textContent = "Loading manifest";
    } else if (state.submissionLauncher.latestManifest) {
      elements.distributionManifestMeta.textContent = `${String(state.submissionLauncher.latestManifest.status || "pending").replaceAll(
        "_",
        " "
      )} · v${state.submissionLauncher.latestManifest.version || 1}`;
    } else if (state.submissionLauncher.manifestError) {
      elements.distributionManifestMeta.textContent = "Manifest unavailable";
    } else {
      elements.distributionManifestMeta.textContent = "No manifest loaded";
    }
  }
  if (elements.distributionManifestSummary) {
    elements.distributionManifestSummary.innerHTML = buildDistributionManifestSummaryMarkup(state.submissionLauncher.latestManifest, {
      loading: state.submissionLauncher.loadingManifest,
      error: state.submissionLauncher.manifestError
    });
  }

  if (elements.distributionPreflightMeta) {
    if (state.submissionLauncher.preflighting) {
      elements.distributionPreflightMeta.textContent = "Running preflight";
    } else if (state.submissionLauncher.preflight) {
      elements.distributionPreflightMeta.textContent = `${formatDistributionDecisionLabel(
        state.submissionLauncher.preflight.overall_decision
      )} · ${state.submissionLauncher.preflight.summary?.site_count || 0} sites`;
    } else {
      elements.distributionPreflightMeta.textContent = "Not run";
    }
  }
  if (elements.distributionPreflightSummary) {
    elements.distributionPreflightSummary.innerHTML = buildDistributionPreflightSummaryMarkup(
      state.submissionLauncher.preflight
    );
  }

  if (elements.distributionQueueMeta) {
    if (state.submissionLauncher.queueing) {
      elements.distributionQueueMeta.textContent = "Queueing jobs";
    } else if (state.submissionLauncher.queueBatch) {
      const summary = state.submissionLauncher.queueBatch.summary || {};
      elements.distributionQueueMeta.textContent = `${summary.queued_count || 0} queued · ${summary.skipped_count || 0} skipped`;
    } else {
      elements.distributionQueueMeta.textContent = "Nothing queued";
    }
  }
  if (elements.distributionQueueSummary) {
    elements.distributionQueueSummary.innerHTML = buildDistributionQueueSummaryMarkup(
      state.submissionLauncher.queueBatch,
      state.submissionLauncher.queueStatuses
    );
  }
}

async function requestSubmissionBrandsOnce() {
  const response = await fetch("/api/submissions/brands?limit=100");
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to access submission brands.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load submission brands");
    error.status = response.status || 500;
    throw error;
  }
  return Array.isArray(data.brand_profiles) ? data.brand_profiles : [];
}

async function requestSaveSubmissionBrand(payload) {
  const response = await fetch("/api/submissions/brands", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to update submission brands.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to update submission brand");
    error.status = response.status || 500;
    throw error;
  }
  return data.brand_profile || null;
}

async function loadSubmissionBrands(options = {}) {
  if (!hasAppDashboardUi || !elements.distributionLauncherForm) {
    return [];
  }
  if (state.submissionLauncher.brands.length && options.force !== true) {
    renderDistributionLauncher();
    return state.submissionLauncher.brands;
  }

  state.submissionLauncher.loadingBrands = true;
  state.submissionLauncher.brandsError = "";
  renderDistributionLauncher();
  try {
    const rows = await requestSubmissionBrandsOnce();
    state.submissionLauncher.brands = rows;
    state.submissionLauncher.brandsError = "";
    renderDistributionLauncher();
    const selectedBrandProfileId = getSelectedDistributionBrand()?.brand_profile_id || pickDefaultDistributionBrand(getActiveDistributionBrands());
    if (selectedBrandProfileId) {
      state.submissionLauncher.selectedBrandProfileId = selectedBrandProfileId;
      void loadDistributionManifest(selectedBrandProfileId, { force: true });
    }
    return rows;
  } catch (error) {
    state.submissionLauncher.brandsError = error.message || "Failed to load submission brands";
    renderDistributionLauncher();
    throw error;
  } finally {
    state.submissionLauncher.loadingBrands = false;
    renderDistributionLauncher();
  }
}

async function requestDistributionManifest(brandProfileId) {
  const params = new URLSearchParams({
    brand_profile_id: sanitizeString(brandProfileId, 128),
    latest: "true"
  });
  const response = await fetch(`/api/submissions/assets/manifest?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) {
    return null;
  }
  if (response.status === 401) {
    throw new Error("Sign in required to access asset manifests.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load asset manifest");
    error.status = response.status || 500;
    throw error;
  }
  return data.asset_manifest || null;
}

async function loadDistributionManifest(brandProfileId, options = {}) {
  const safeBrandProfileId = sanitizeString(brandProfileId, 128);
  if (!safeBrandProfileId) {
    state.submissionLauncher.latestManifest = null;
    state.submissionLauncher.manifestError = "";
    state.submissionLauncher.loadingManifest = false;
    renderDistributionLauncher();
    return null;
  }
  if (
    options.force !== true &&
    state.submissionLauncher.latestManifest &&
    state.submissionLauncher.latestManifest.brand_profile_id === safeBrandProfileId
  ) {
    renderDistributionLauncher();
    return state.submissionLauncher.latestManifest;
  }

  state.submissionLauncher.loadingManifest = true;
  state.submissionLauncher.manifestError = "";
  if (options.clearExisting === true) {
    state.submissionLauncher.latestManifest = null;
  }
  renderDistributionLauncher();
  try {
    const manifest = await requestDistributionManifest(safeBrandProfileId);
    if (
      options.allowStale !== true &&
      state.submissionLauncher.selectedBrandProfileId &&
      state.submissionLauncher.selectedBrandProfileId !== safeBrandProfileId
    ) {
      return manifest;
    }
    state.submissionLauncher.latestManifest = manifest;
    state.submissionLauncher.manifestError = "";
    return manifest;
  } catch (error) {
    state.submissionLauncher.latestManifest = null;
    state.submissionLauncher.manifestError = error.message || "Failed to load asset manifest";
    throw error;
  } finally {
    state.submissionLauncher.loadingManifest = false;
    renderDistributionLauncher();
  }
}

async function requestDistributionJobStatus(jobId) {
  const params = new URLSearchParams({
    job_id: sanitizeString(jobId, 128)
  });
  const response = await fetch(`/api/submissions/status?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to inspect submission jobs.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load submission job status");
    error.status = response.status || 500;
    throw error;
  }
  return data;
}

async function pollDistributionPrepareJob(jobId) {
  const safeJobId = sanitizeString(jobId, 128);
  if (!safeJobId || state.submissionLauncher.prepareJob?.job_id !== safeJobId) {
    return;
  }
  stopDistributionPreparePolling();
  try {
    const status = await requestDistributionJobStatus(safeJobId);
    if (state.submissionLauncher.prepareJob?.job_id !== safeJobId) {
      return;
    }
    state.submissionLauncher.prepareJob = {
      job_id: safeJobId,
      status: sanitizeOptionalString(status?.job?.status, 64) || "queued",
      payload: status
    };
    renderDistributionLauncher();
    if (isDistributionActiveJobStatus(status?.job?.status)) {
      state.submissionLauncher.prepareJobTimer = window.setTimeout(() => {
        void pollDistributionPrepareJob(safeJobId);
      }, 2500);
      return;
    }

    state.submissionLauncher.preparing = false;
    const finalStatus = sanitizeOptionalString(status?.job?.status, 64) || "completed";
    if (finalStatus === "completed") {
      await loadDistributionManifest(state.submissionLauncher.selectedBrandProfileId, { force: true, clearExisting: true }).catch(() => null);
      setDistributionLauncherMessage("Asset manifest updated. Run preflight to check the selected pack.", "ok");
      state.submissionLauncher.lastAction = "prepared";
      return;
    }

    setDistributionLauncherMessage(
      sanitizeOptionalString(status?.live_report?.summary?.note, 320) ||
        `Asset preparation ended with status ${finalStatus.replaceAll("_", " ")}.`,
      finalStatus === "failed" ? "error" : "warn"
    );
    state.submissionLauncher.lastAction = "prepare_failed";
  } catch (error) {
    state.submissionLauncher.preparing = false;
    setDistributionLauncherMessage(error.message || "Could not track asset preparation.", "error");
  } finally {
    renderDistributionLauncher();
  }
}

async function pollDistributionQueueJobs() {
  stopDistributionQueuePolling();
  const batch = state.submissionLauncher.queueBatch;
  const queuedJobs = Array.isArray(batch?.queued_jobs) ? batch.queued_jobs : [];
  if (!queuedJobs.length) {
    state.submissionLauncher.queueing = false;
    renderDistributionLauncher();
    return;
  }

  let hasActive = false;
  await Promise.all(
    queuedJobs.map(async (job) => {
      const safeJobId = sanitizeString(job?.job_id, 128);
      if (!safeJobId) {
        return;
      }
      try {
        const status = await requestDistributionJobStatus(safeJobId);
        state.submissionLauncher.queueStatuses[safeJobId] = status;
        if (isDistributionActiveJobStatus(status?.job?.status)) {
          hasActive = true;
        }
      } catch {
        state.submissionLauncher.queueStatuses[safeJobId] = {
          job: {
            job_id: safeJobId,
            status: "unavailable"
          }
        };
      }
    })
  );

  state.submissionLauncher.queueing = hasActive;
  if (hasActive) {
    state.submissionLauncher.queuePollTimer = window.setTimeout(() => {
      void pollDistributionQueueJobs();
    }, 3000);
    setDistributionLauncherMessage("Submission jobs are moving through the worker queue.", "");
  } else if (queuedJobs.length) {
    setDistributionLauncherMessage("Queued jobs settled. Review the per-site status below.", "ok");
  }
  renderDistributionLauncher();
}

function buildDistributionJobId(prefix, brandProfileId, packId) {
  const safePrefix = sanitizeString(prefix, 24).toLowerCase() || "submission";
  const safeBrand = toAnchorToken(brandProfileId || "brand", "brand");
  const safePack = toAnchorToken(packId || "pack", "pack");
  return `${safePrefix}-${safeBrand}-${safePack}-${Date.now()}`;
}

async function runDistributionAssetPrepare() {
  const brand = getSelectedDistributionBrand();
  const pack = getSelectedDistributionPack();
  if (!brand || !pack) {
    setDistributionLauncherMessage("Choose a submission brand and product pack first.", "error");
    renderDistributionLauncher();
    return;
  }

  stopDistributionPreparePolling();
  state.submissionLauncher.preparing = true;
  state.submissionLauncher.prepareJob = {
    job_id: buildDistributionJobId("asset-prepare", brand.brand_profile_id, pack.pack_id),
    status: "queued",
    payload: null
  };
  state.submissionLauncher.preflight = null;
  state.submissionLauncher.queueBatch = null;
  state.submissionLauncher.queueStatuses = {};
  setDistributionLauncherMessage(`Preparing assets for ${brand.display_name} across ${pack.pack_name}.`, "");
  renderDistributionLauncher();

  try {
    const response = await fetch("/api/submissions/assets/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        job_id: state.submissionLauncher.prepareJob.job_id,
        brand_profile_id: brand.brand_profile_id,
        brand_key: brand.brand_key || null,
        track: normalizeDistributionTrack(state.submissionCatalog.activeTrack),
        site_ids: (Array.isArray(pack.sites) ? pack.sites : []).map((site) => site.site_id).filter(Boolean),
        metadata: {
          pack_id: pack.pack_id,
          pack_name: pack.pack_name,
          launched_from: "dashboard_distribution_launcher"
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to queue asset preparation");
    }
    state.submissionLauncher.prepareJob.payload = data;
    void pollDistributionPrepareJob(state.submissionLauncher.prepareJob.job_id);
  } catch (error) {
    state.submissionLauncher.preparing = false;
    setDistributionLauncherMessage(error.message || "Could not prepare assets.", "error");
    renderDistributionLauncher();
  }
}

async function runDistributionPreflight() {
  const brand = getSelectedDistributionBrand();
  const pack = getSelectedDistributionPack();
  if (!brand || !pack) {
    setDistributionLauncherMessage("Choose a submission brand and product pack first.", "error");
    renderDistributionLauncher();
    return;
  }

  state.submissionLauncher.preflighting = true;
  setDistributionLauncherMessage(`Running preflight for ${pack.pack_name}.`, "");
  renderDistributionLauncher();
  try {
    const response = await fetch("/api/submissions/pack-preflight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        brand_profile_id: brand.brand_profile_id,
        pack_id: pack.pack_id,
        track: normalizeDistributionTrack(state.submissionCatalog.activeTrack)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to run pack preflight");
    }
    state.submissionLauncher.preflight = data;
    state.submissionLauncher.lastAction = "preflight";
    setDistributionLauncherMessage(
      `Preflight returned ${data.summary?.ready_auto_count || 0} auto, ${data.summary?.ready_assist_count || 0} assist, ${data.summary?.blocked_count || 0} blocked.`,
      data.overall_decision === "blocked" ? "warn" : "ok"
    );
  } catch (error) {
    setDistributionLauncherMessage(error.message || "Could not run preflight.", "error");
  } finally {
    state.submissionLauncher.preflighting = false;
    renderDistributionLauncher();
  }
}

async function queueDistributionPack() {
  const brand = getSelectedDistributionBrand();
  const pack = getSelectedDistributionPack();
  if (!brand || !pack) {
    setDistributionLauncherMessage("Choose a submission brand and product pack first.", "error");
    renderDistributionLauncher();
    return;
  }

  stopDistributionQueuePolling();
  state.submissionLauncher.queueing = true;
  state.submissionLauncher.queueBatch = null;
  state.submissionLauncher.queueStatuses = {};
  const submitLive = Boolean(elements.distributionSubmitLive?.checked);
  const noHumanActions = submitLive && Boolean(elements.distributionNoHumanActions?.checked);
  setDistributionLauncherMessage(
    submitLive
      ? `Queueing live ${pack.pack_name} jobs for ${brand.display_name}.`
      : `Running a dry-run queue preview for ${pack.pack_name}.`,
    ""
  );
  renderDistributionLauncher();

  try {
    const response = await fetch("/api/submissions/pack-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        brand_profile_id: brand.brand_profile_id,
        pack_id: pack.pack_id,
        track: normalizeDistributionTrack(state.submissionCatalog.activeTrack),
        dry_run: !submitLive,
        stop_before_submit: !submitLive,
        no_human_actions: noHumanActions,
        include_auto: true,
        include_assist: true,
        include_manual: false,
        metadata: {
          pack_id: pack.pack_id,
          pack_name: pack.pack_name,
          launched_from: "dashboard_distribution_launcher"
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to queue pack submit");
    }
    state.submissionLauncher.queueBatch = data;
    state.submissionLauncher.lastAction = "queue";
    setDistributionLauncherMessage(
      data.dry_run
        ? `Dry run produced ${data.summary?.queued_count || 0} queueable jobs.`
        : `Queued ${data.summary?.queued_count || 0} submission jobs for ${pack.pack_name}.`,
      "ok"
    );
    if (!data.dry_run && Array.isArray(data.queued_jobs) && data.queued_jobs.length) {
      void pollDistributionQueueJobs();
    } else {
      state.submissionLauncher.queueing = false;
    }
  } catch (error) {
    state.submissionLauncher.queueing = false;
    setDistributionLauncherMessage(error.message || "Could not queue the selected pack.", "error");
  } finally {
    renderDistributionLauncher();
  }
}

async function saveDistributionBrandMailbox() {
  const brand = getSelectedDistributionBrand();
  if (!brand) {
    setDistributionBrandSaveMessage("Choose a submission brand first.", "error");
    renderDistributionLauncher();
    return;
  }

  const form = state.submissionLauncher.brandForm;
  const mailboxEmail = sanitizeOptionalString(form.mailboxEmail, 320) || "";
  if (!mailboxEmail) {
    setDistributionBrandSaveMessage("Mailbox email is required for client-owned inbox setup.", "error");
    renderDistributionLauncher();
    return;
  }

  state.submissionLauncher.savingBrand = true;
  applyDistributionMailboxDefaults();
  setDistributionBrandSaveMessage(`Saving mailbox setup for ${brand.display_name || brand.brand_profile_id}.`, "");
  renderDistributionLauncher();

  try {
    const savedBrand = await requestSaveSubmissionBrand({
      brand_profile_id: brand.brand_profile_id,
      brand_key: brand.brand_key,
      track: brand.track,
      display_name: brand.display_name,
      legal_name: brand.legal_name || null,
      website_url: brand.website_url || null,
      profile: brand.profile && typeof brand.profile === "object" ? brand.profile : {},
      identity_mode: sanitizeOptionalString(form.identityMode, 64) || "client_owned",
      mailbox_provider: sanitizeOptionalString(form.mailboxProvider, 120) || null,
      mailbox_email: mailboxEmail,
      mailbox_username: sanitizeOptionalString(form.mailboxUsername, 320) || null,
      mailbox_auth_method: sanitizeOptionalString(form.mailboxAuthMethod, 64) || "unknown",
      mailbox_host: sanitizeOptionalString(form.mailboxHost, 320) || null,
      mailbox_port: sanitizeOptionalString(form.mailboxPort, 16) || null,
      mailbox_secure: form.mailboxSecure !== false,
      mailbox_smtp_host: sanitizeOptionalString(form.mailboxSmtpHost, 320) || null,
      mailbox_smtp_port: sanitizeOptionalString(form.mailboxSmtpPort, 16) || null,
      mailbox_smtp_secure: form.mailboxSmtpSecure === true,
      mailbox_password: sanitizeOptionalString(form.mailboxPassword, 1024) || undefined,
      inbox_ready: form.mailboxReady === true,
      app_password_configured:
        sanitizeOptionalString(form.mailboxAuthMethod, 64) === "app_password"
          ? form.mailboxReady === true || Boolean(sanitizeOptionalString(form.mailboxPassword, 1024))
          : undefined
    });
    if (savedBrand && savedBrand.brand_profile_id) {
      state.submissionLauncher.brands = state.submissionLauncher.brands.map((item) =>
        item.brand_profile_id === savedBrand.brand_profile_id ? savedBrand : item
      );
      syncDistributionBrandFormState(savedBrand, true);
    }
    setDistributionBrandSaveMessage("Mailbox setup saved on the submission brand.", "ok");
  } catch (error) {
    setDistributionBrandSaveMessage(error.message || "Could not save mailbox setup.", "error");
  } finally {
    state.submissionLauncher.savingBrand = false;
    state.submissionLauncher.brandForm.mailboxPassword = "";
    renderDistributionLauncher();
  }
}

function mergeSavedProjects(projects) {
  state.savedProjects = dashboardProjects.mergeSavedProjects(state.savedProjects, projects, {
    normalizeProject: normalizeSavedProject
  });
  rebuildProjectOptions();
}

function buildSavedProjectPayload(config = {}, metadata = {}) {
  const projectMetadata = {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    repo_triage: normalizeRepoTriageConfigInput(config.repoTriage || config.repo_triage || metadata.repo_triage || {})
  };
  return dashboardProjects.buildSavedProjectPayload(config, projectMetadata, {
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
    loading: state.projectCatalogStatus === PROJECT_CATALOG_STATES.LOADING,
    addNewProjectValue: ADD_NEW_PROJECT_OPTION_VALUE,
    escapeHtml,
    getProjectOptionLabel: getBrandOptionLabel
  });
}

function syncProjectSwitcherVisibility() {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }

  const authorized = isDashboardAuthorized();
  const hasProjects = Array.isArray(state.brandOptions) && state.brandOptions.length > 0;
  const catalogResolved = isProjectCatalogResolved();
  const shouldShowProjectShell = authorized && catalogResolved;
  const shouldShowAppHeader = authorized && catalogResolved && hasProjects;
  elements.appDashboardRoot.setAttribute("data-has-projects", hasProjects ? "true" : "false");
  elements.appDashboardRoot.setAttribute("data-project-catalog-status", state.projectCatalogStatus);
  if (elements.topbarProjectShell) {
    elements.topbarProjectShell.setAttribute("data-has-projects", hasProjects ? "true" : "false");
    elements.topbarProjectShell.setAttribute("data-project-catalog-status", state.projectCatalogStatus);
    elements.topbarProjectShell.hidden = !shouldShowProjectShell;
    elements.topbarProjectShell.setAttribute("aria-hidden", shouldShowProjectShell ? "false" : "true");
  }
  if (elements.appAuthHeader) {
    elements.appAuthHeader.hidden = !shouldShowAppHeader;
    elements.appAuthHeader.setAttribute("aria-hidden", shouldShowAppHeader ? "false" : "true");
  }
  renderWorkerHealthIndicator();
}

function setDashboardLoading(isLoading, options = {}) {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }
  const loading = Boolean(isLoading);
  const allowPendingHide = Boolean(options.allowPendingHide);
  if (!loading && state.dashboardPendingLoads > 0 && !allowPendingHide) {
    return;
  }
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
      setDashboardLoading(false, { allowPendingHide: true });
    }, DASHBOARD_LOADING_FAILSAFE_MS);
  }
}

function beginDashboardLoad() {
  state.dashboardPendingLoads += 1;
  setDashboardLoading(true);
}

function finishDashboardLoad() {
  state.dashboardPendingLoads = Math.max(0, state.dashboardPendingLoads - 1);
  if (state.dashboardPendingLoads === 0) {
    setDashboardLoading(false);
  }
}

function markDashboardShellReady(options = {}) {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }
  const force = Boolean(options.force);
  if (state.dashboardPendingLoads > 0 && !force) {
    return;
  }
  elements.appDashboardRoot.setAttribute("data-shell-ready", "true");
  setDashboardLoading(false, { allowPendingHide: force });
}

function resetDashboardShellReady() {
  if (!hasAppDashboardUi || !elements.appDashboardRoot) {
    return;
  }
  elements.appDashboardRoot.setAttribute("data-shell-ready", "false");
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

async function hydrateProjectCatalogInBackground(loadRequestId) {
  if (!isDashboardAuthorized()) {
    return;
  }

  try {
    const projects = await requestProjectCatalog();
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }

    if (Array.isArray(projects) && projects.length) {
      mergeSavedProjects(projects);
      setProjectCatalogStatus(PROJECT_CATALOG_STATES.READY);
    } else if (!state.brandOptions.length) {
      setProjectCatalogStatus(PROJECT_CATALOG_STATES.EMPTY);
    } else {
      setProjectCatalogStatus(PROJECT_CATALOG_STATES.READY);
    }
  } catch {
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }
    setProjectCatalogStatus(state.brandOptions.length ? PROJECT_CATALOG_STATES.READY : PROJECT_CATALOG_STATES.ERROR);
  }

  if (!isDashboardLoadRequestCurrent(loadRequestId)) {
    return;
  }

  if (state.filters.brand) {
    ensureSingleProjectSelection();
  }
  renderBrandSuggestions();
  syncProjectSwitcherVisibility();
  renderBrandSummary();
  renderBrandChips();
}

function resetDashboardCollections() {
  state.savedProjects = [];
  state.brandOptions = [];
  state.allRuns = [];
  state.runs = [];
  state.personaOptions = [];
  state.selectedRunId = null;
  state.requestedRunId = "";
  state.activeRenderedReport = null;
  state.activeRenderedRow = null;
  setProjectCatalogStatus(PROJECT_CATALOG_STATES.IDLE);
  resetDistributionCatalog();
  resetDistributionLauncher();
  resetQaAutomationState();
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
    const requestedRunId = String(state.requestedRunId || state.selectedRunId || "").trim();
    if (!requestedRunId) {
      state.selectedRunId = null;
      state.requestedRunId = "";
      state.activeRenderedReport = null;
      state.activeRenderedRow = null;
    }
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

function isRepoTriageActiveStatus(value) {
  const status = normalizeRunStatus(value);
  return status === "queued" || status === "processing";
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
  const params = appendActiveShareKey(new URLSearchParams({ run_id: String(runId || "") }));
  const response = await fetch(`/api/qa/status?${params.toString()}`);
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

  const params = appendActiveShareKey(
    new URLSearchParams({
      run_id: String(runId || ""),
      skip_markdown: "1"
    })
  );
  const response = await fetch(`/api/qa/report?${params.toString()}`);
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

async function requestWorkerHealthOnce() {
  const response = await fetch("/api/qa/workers");
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("Sign in required to view worker health.");
  }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Failed to load worker health");
    error.status = response.status || 500;
    throw error;
  }

  return data;
}

function renderWorkerHealthIndicator() {
  if (!elements.workerHealthChip || !elements.workerHealthText) {
    return;
  }

  if (!isDashboardAuthorized()) {
    elements.workerHealthChip.hidden = true;
    elements.workerHealthChip.setAttribute("aria-hidden", "true");
    elements.workerHealthChip.dataset.health = "checking";
    elements.workerHealthChip.removeAttribute("title");
    elements.workerHealthText.textContent = "Checking workers…";
    return;
  }

  const summary = state.workerHealth && typeof state.workerHealth.summary === "object" ? state.workerHealth.summary : null;
  const health = String(summary?.overall_status || "")
    .trim()
    .slice(0, 32)
    .toLowerCase() || "checking";
  const label = String(summary?.label || "").trim().slice(0, 140) || "Checking workers…";
  const detail = String(summary?.detail || "").trim().slice(0, 280) || "Waiting for worker heartbeat.";

  elements.workerHealthChip.hidden = false;
  elements.workerHealthChip.setAttribute("aria-hidden", "false");
  elements.workerHealthChip.dataset.health = health;
  elements.workerHealthChip.setAttribute("title", detail);
  elements.workerHealthText.textContent = label;
}

async function refreshWorkerHealth(options = {}) {
  if (!elements.workerHealthChip) {
    return null;
  }

  if (!isDashboardAuthorized()) {
    state.workerHealth = null;
    renderWorkerHealthIndicator();
    return null;
  }

  try {
    const payload = await requestWorkerHealthOnce();
    state.workerHealth = payload;
  } catch (error) {
    if (!options.silent || !state.workerHealth) {
      state.workerHealth = {
        summary: {
          overall_status: "stale",
          label: "Worker unknown",
          detail: error?.message || "Could not load worker health."
        },
        items: []
      };
    }
  }

  renderWorkerHealthIndicator();
  return state.workerHealth;
}

function stopWorkerHealthPolling() {
  if (state.workerHealthPollingTimer) {
    window.clearInterval(state.workerHealthPollingTimer);
    state.workerHealthPollingTimer = null;
  }
}

function ensureWorkerHealthPolling() {
  if (!elements.workerHealthChip) {
    return;
  }

  if (!isDashboardAuthorized()) {
    stopWorkerHealthPolling();
    state.workerHealth = null;
    renderWorkerHealthIndicator();
    return;
  }

  if (state.workerHealthPollingTimer) {
    return;
  }

  void refreshWorkerHealth();
  state.workerHealthPollingTimer = window.setInterval(() => {
    if (!isDashboardAuthorized()) {
      stopWorkerHealthPolling();
      state.workerHealth = null;
      renderWorkerHealthIndicator();
      return;
    }
    void refreshWorkerHealth({ silent: true });
  }, WORKER_HEALTH_POLL_INTERVAL_MS);
}

function renderLinkRow(report, links, label) {
  const normalizedKind = String(label || "").trim().toLowerCase() === "video" ? "video" : "screenshot";
  const summary = summarizeEvidenceLinks(report, normalizedKind, links, { maxItems: 24 });

  if (!summary.renderableCount && !summary.referenceCount) {
    return `<p>${escapeHtml(label)}: none</p>`;
  }

  const parts = [];
  if (summary.renderableCount) {
    parts.push(
      normalizedKind === "video"
        ? `${label.toLowerCase()} attached: ${summary.renderableCount}`
        : `${label.toLowerCase()} proof: ${summary.renderableCount}`
    );
  }
  if (summary.referenceCount) {
    parts.push(`${label.toLowerCase()} refs: ${summary.referenceCount}`);
  }

  return `<p>${escapeHtml(parts.join(" | "))}</p>`;
}

function buildEvidenceAssetUrl(runId, kind, index) {
  const params = appendActiveShareKey(new URLSearchParams({
    run_id: String(runId || ""),
    kind: String(kind || ""),
    index: String(index)
  }));

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

function collectEvidenceLookupValues(report, kind) {
  const values = collectEvidenceValues(report, kind);
  if (kind !== "video") {
    return values;
  }

  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  for (const journey of journeys) {
    const clips = Array.isArray(journey?.step_video_clips) ? journey.step_video_clips : [];
    for (const clip of clips) {
      const ref = String(clip?.video || clip?.video_url || clip?.videoUrl || clip?.source || clip?.url || clip?.path || "").trim();
      if (ref) {
        values.push(ref);
      }
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
    return "😤 I got stuck here and could not finish it.";
  }
  if (status === "partial") {
    return "😕 I could do some of this, but one step was unclear.";
  }
  const hasConfusion = relatedFindings.some((item) => {
    const type = String(item?.type || "").toLowerCase();
    return type === "confusion_point" || type === "frustration_point" || type === "dead_end";
  });
  if (hasConfusion) {
    return "🙂 I finished this, but part of it felt rough.";
  }
  return "😎 This part felt easy and clear.";
}

function simplifyJourneyTitle(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Thing the tester tried";
  }

  const normalized = raw.toLowerCase();
  if (normalized === "primary public flow") {
    return "Main public path";
  }
  if (normalized === "recon and validation sweep") {
    return "Quick site check";
  }
  if (normalized === "authenticated boundary check") {
    return "Login wall check";
  }

  return raw
    .replace(/\bauthenticated\b/gi, "logged-in")
    .replace(/\bauth\b/gi, "login")
    .replace(/\bboundary\b/gi, "wall")
    .replace(/\brecon\b/gi, "quick")
    .replace(/\bvalidation\b/gi, "check")
    .replace(/\bsweep\b/gi, "check");
}

function simplifyJourneyText(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const exactMatches = new Map([
    [
      "The run failed before the requested flow completed",
      "The tester got stuck before finishing the thing they were trying to do."
    ],
    [
      "The requested flow stopped before it finished",
      "The tester got stuck before finishing the thing they were trying to do."
    ],
    [
      "The auth flow stalled before product access",
      "The tester got stuck during account setup and never got into the product."
    ],
    [
      "Primary public navigation and conversion surfaces were exercised to validate the core public user journey.",
      "The tester looked at the main public pages and tried the main button a new visitor would click."
    ],
    [
      "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions.",
      "The tester quickly checked the main pages, buttons, and forms to see if anything felt broken or confusing."
    ],
    [
      "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied.",
      "The tester reached the login wall but could not go farther because no login was provided."
    ],
    [
      "Auth flow did not resolve to an authenticated surface",
      "The tester submitted the login or sign-up form, but the site kept showing the same login screen."
    ],
    [
      "Authenticated flows were not tested because no credentials were provided.",
      "The tester never got into the logged-in part of the product."
    ],
    [
      "Milestone screenshot captured.",
      "The tester reached the last visible screen before the blocker."
    ],
    ["Open the target entry page.", "Open the first page."],
    ["Traverse the main navigation and primary CTA path.", "Click through the main menu and the main button."],
    [
      "Complete the highest-value public flow available without credentials.",
      "Finish the main thing a visitor can do without logging in."
    ],
    ["Map major navigation surfaces and modal entry points.", "Look at the main pages, menus, and popups."],
    ["Probe visible forms, validation states, and CTA affordances.", "Try the visible forms and buttons."],
    [
      "Confirm whether the flow stays coherent without hidden prerequisites.",
      "Check whether it still makes sense without hidden setup steps."
    ],
    ["Identify the primary sign-in or account gate.", "Find where login starts."],
    [
      "Confirm the app exposes additional authenticated-only areas.",
      "Check if there are more pages after login."
    ],
    [
      "Record the auth boundary as untested rather than forcing invalid coverage.",
      "Mark the logged-in part as not tested instead of guessing."
    ]
  ]);
  if (exactMatches.has(raw)) {
    return exactMatches.get(raw);
  }

  return raw
    .replace(/\bworker\b/gi, "tester")
    .replace(/\bagent\b/gi, "tester")
    .replace(/\bauthenticated flows\b/gi, "logged-in pages")
    .replace(/\bauth boundary\b/gi, "login wall")
    .replace(/\bcredentials were supplied\b/gi, "a login was provided")
    .replace(/\bcredentials\b/gi, "login details")
    .replace(/\bdid not resolve to an authenticated surface\b/gi, "kept showing the same login screen instead of getting into the product")
    .replace(/\bauth flow stalled before product access\b/gi, "got stuck during account setup and never got into the product")
    .replace(/\bpublic navigation and conversion surfaces\b/gi, "main public pages and buttons")
    .replace(/\bwere exercised to validate\b/gi, "were checked to see")
    .replace(/\bcore public user journey\b/gi, "if a new visitor could use them")
    .replace(/\bsurface-level navigation, button states, and form affordances\b/gi, "main pages, buttons, and forms")
    .replace(/\bidentify blockers or unclear transitions\b/gi, "see if anything felt broken or confusing")
    .replace(/\bmajor navigation surfaces and modal entry points\b/gi, "main pages, menus, and popups")
    .replace(/\bvalidation states\b/gi, "error messages")
    .replace(/\bCTA affordances\b/gi, "buttons")
    .replace(/\bhidden prerequisites\b/gi, "hidden setup steps")
    .replace(/\bprimary sign-in or account gate\b/gi, "main login step")
    .replace(/\badditional authenticated-only areas\b/gi, "more pages after login")
    .replace(/\brecord the auth boundary as untested rather than forcing invalid coverage\b/gi, "mark the logged-in part as not tested instead of guessing")
    .replace(/\bmilestone screenshot captured\b/gi, "the tester reached the last visible screen before the blocker")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyReportNarrative(value) {
  const raw = redactVendorText(String(value || "").trim());
  if (!raw) {
    return "";
  }
  return simplifyJourneyText(raw);
}

function simplifyJourneySummary(value, title = "") {
  const simplified = simplifyJourneyText(redactVendorText(value || "").trim());
  if (simplified) {
    return simplified;
  }

  const titleHint = simplifyJourneyTitle(title).toLowerCase();
  if (titleHint.includes("main public")) {
    return "The tester checked the main public pages and tried the main thing a visitor would do first.";
  }
  if (titleHint.includes("quick site check")) {
    return "The tester quickly looked around the site to see if the main parts made sense.";
  }
  if (titleHint.includes("login wall")) {
    return "The tester reached the login area but could not go farther without a login.";
  }
  return "The tester tried this part of the site and saved what happened.";
}

function buildEvidenceIndexMap(report, kind) {
  const values = collectEvidenceLookupValues(report, kind);
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

function buildVideoClipUrl(rawUrl, clipStartMs, clipEndMs) {
  const source = String(rawUrl || "").trim();
  if (!source || DATA_VIDEO_PATTERN.test(source)) {
    return source;
  }

  const startSeconds = Math.max(0, Number(clipStartMs) || 0) / 1000;
  const endSeconds = Math.max(startSeconds + 0.35, Number(clipEndMs) || 0) / 1000;
  const toFragmentSeconds = (value) => {
    const rounded = Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/g, "").replace(/\.$/g, "");
  };
  const fragment = `t=${toFragmentSeconds(startSeconds)},${toFragmentSeconds(endSeconds)}`;

  try {
    const parsed = new URL(source, window.location.origin);
    parsed.hash = fragment;
    return parsed.toString();
  } catch {
    const [base] = source.split("#");
    return `${base}#${fragment}`;
  }
}

function renderEvidenceThumbnails(report, links, contextLabel, explanationText = "", options = {}) {
  const values = Array.isArray(links) ? links : [];
  if (!values.length) {
    return "";
  }

  const maxItems = Math.max(1, Math.min(6, Number(options?.maxItems) || 3));
  const showCaption = options?.showCaption !== false;
  const compact = options?.compact === true;
  const imageItems = resolveEvidenceImageItems(report, values, { maxItems });
  const cards = [];

  for (let index = 0; index < imageItems.length; index += 1) {
    const url = imageItems[index].url;
    const caption = truncateText(explanationText, 110) || "Captured during tester walkthrough.";
    cards.push(`
      <figure class="evidence-thumb-card ${compact ? "compact" : ""}">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(contextLabel)} screenshot ${index + 1}" loading="lazy" onerror="const card=this.closest('.evidence-thumb-card'); if(!card){return;} card.innerHTML='<p class=&quot;evidence-unavailable-note&quot;>Picture preview unavailable for this step.</p>';" />
        ${showCaption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
      </figure>
    `);
    if (cards.length >= maxItems) {
      break;
    }
  }

  if (!cards.length) {
    if (Object.prototype.hasOwnProperty.call(options, "emptyMarkup")) {
      return String(options.emptyMarkup || "");
    }
    return `
      <p class="evidence-unavailable-note">
        No picture preview for this step.
      </p>
    `;
  }

  return `<div class="evidence-thumb-grid">${cards.join("")}</div>`;
}

function renderEvidencePreview(report, evidence = {}, contextLabel, explanationText = "", options = {}) {
  const screenshots = Array.isArray(evidence?.screenshots) ? evidence.screenshots : [];
  const videos = Array.isArray(evidence?.videos) ? evidence.videos : [];
  const fallbackReportVideos =
    report && report.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.videos)
      ? report.evidence_gallery.videos
      : [];
  const maxItems = Math.max(1, Math.min(6, Number(options?.maxItems) || 3));
  const showCaption = options?.showCaption !== false;
  const compact = options?.compact === true;
  const preferVideo = options?.preferVideo !== false;
  const imageItems = resolveEvidenceImageItems(report, screenshots, { maxItems });
  const videoSources = videos.length ? videos : fallbackReportVideos;
  const videoItems = resolveEvidenceVideoItems(report, videoSources, { maxItems });

  if (preferVideo && videoItems.length) {
    const primaryVideo = videoItems[0];
    const caption = truncateText(explanationText, 110) || "Short clip from this test.";
    return `
      <div class="evidence-thumb-grid evidence-thumb-grid--video">
        <figure class="evidence-thumb-card evidence-thumb-card--video ${compact ? "compact" : ""}">
          <video src="${escapeHtml(primaryVideo.url)}" controls playsinline preload="metadata" onerror="const card=this.closest('.evidence-thumb-card'); if(!card){return;} card.innerHTML='<p class=&quot;evidence-unavailable-note&quot;>Video preview unavailable for this step.</p>';"></video>
          ${showCaption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
      </div>
    `;
  }

  if (videoItems.length) {
    const primaryVideo = videoItems[0];
    const caption = truncateText(explanationText, 110) || "Short clip from this test.";
    return `
      <div class="evidence-thumb-grid evidence-thumb-grid--video">
        <figure class="evidence-thumb-card evidence-thumb-card--video ${compact ? "compact" : ""}">
          <video src="${escapeHtml(primaryVideo.url)}" controls playsinline preload="metadata" onerror="const card=this.closest('.evidence-thumb-card'); if(!card){return;} card.innerHTML='<p class=&quot;evidence-unavailable-note&quot;>Video preview unavailable for this step.</p>';"></video>
          ${showCaption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
      </div>
    `;
  }

  if (Object.prototype.hasOwnProperty.call(options, "emptyMarkup")) {
    return String(options.emptyMarkup || "");
  }

  return `
    <p class="evidence-unavailable-note">
      No playable video was attached to this step.
    </p>
  `;
}

function formatExperienceTimelineClock(value) {
  const totalMs = Math.max(0, Math.round(Number(value) || 0));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatExperienceTimelineDuration(value) {
  const totalMs = Math.max(0, Math.round(Number(value) || 0));
  const totalSeconds = Math.floor(totalMs / 1000);
  if (!totalSeconds) {
    return "0s";
  }
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getExperienceTimeline(report) {
  const raw = report && typeof report === "object" ? report.experience_timeline : null;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const spans = Array.isArray(raw.spans)
    ? raw.spans.filter((span) => span && typeof span === "object" && Number.isFinite(Number(span.start_ms)) && Number.isFinite(Number(span.end_ms)))
    : [];
  if (!spans.length) {
    return null;
  }
  return {
    ...raw,
    spans
  };
}

function getExperienceTimelineDurationMs(timeline) {
  const explicit = Math.max(0, Math.round(Number(timeline?.video_duration_ms) || 0));
  if (explicit > 0) {
    return explicit;
  }
  const spans = Array.isArray(timeline?.spans) ? timeline.spans : [];
  return spans.reduce((maxValue, span) => Math.max(maxValue, Math.round(Number(span?.end_ms) || 0)), 0);
}

function resolveExperienceTimelineVideoItem(report) {
  const galleryVideos =
    report && report.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.videos)
      ? report.evidence_gallery.videos
      : [];
  const findingVideos = Array.isArray(report?.findings)
    ? report.findings.flatMap((finding) => (Array.isArray(finding?.evidence?.videos) ? finding.evidence.videos : []))
    : [];
  const journeyVideos = Array.isArray(report?.tested_journeys)
    ? report.tested_journeys.flatMap((journey) => (Array.isArray(journey?.evidence?.videos) ? journey.evidence.videos : []))
    : [];
  const videoItems = resolveEvidenceVideoItems(report, [...galleryVideos, ...findingVideos, ...journeyVideos], { maxItems: 1 });
  return videoItems[0] || null;
}

function resolveExperienceTimelineFindingAnchor(report, span) {
  const linkedIds = Array.isArray(span?.linked_finding_ids) ? span.linked_finding_ids : [];
  if (!linkedIds.length) {
    return "";
  }
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  for (const linkedId of linkedIds) {
    const normalizedId = String(linkedId || "").trim();
    if (!normalizedId) {
      continue;
    }
    const finding = findings.find((item) => String(item?.id || "").trim() === normalizedId);
    if (finding) {
      return `finding-${toAnchorToken(finding?.id || finding?.title || normalizedId)}`;
    }
    return `finding-${toAnchorToken(normalizedId)}`;
  }
  return "";
}

function resolveExperienceTimelineLinkedFinding(report, span) {
  const linkedIds = Array.isArray(span?.linked_finding_ids) ? span.linked_finding_ids : [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  for (const linkedId of linkedIds) {
    const normalizedId = String(linkedId || "").trim();
    if (!normalizedId) {
      continue;
    }
    const finding = findings.find((item) => String(item?.id || "").trim() === normalizedId);
    if (finding) {
      return finding;
    }
  }
  return null;
}

function cleanExperienceTimelineTarget(value, fallback = "this step") {
  let safeValue = redactVendorText(String(value || "").trim());
  if (!safeValue) {
    return fallback;
  }
  safeValue = safeValue
    .replace(/^"(.*)"$/, "$1")
    .replace(/^(click(?:ed)?|tap(?:ped)?|type(?:d)?|enter(?:ed)?|submit(?:ted)?|open(?:ed)?|wait(?:ed)?)\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!safeValue) {
    return fallback;
  }
  if (/(verification code|otp)/i.test(safeValue)) {
    return "the verification code step";
  }
  if (/email input|email field|email step/i.test(safeValue)) {
    return "the email step";
  }
  if (/send code/i.test(safeValue)) {
    return "Send code";
  }
  if (/generate presenter/i.test(safeValue)) {
    return "Generate presenter";
  }
  const normalized = safeValue.toLowerCase();
  if (normalized === "current screen" || normalized === "affected area") {
    return fallback;
  }
  return safeValue;
}

function formatExperienceTimelineAttemptLine(attempt) {
  const safeAttempt = attempt && typeof attempt === "object" ? attempt : {};
  const action = String(safeAttempt?.action || "inspect").trim().toLowerCase();
  const target = cleanExperienceTimelineTarget(safeAttempt?.target, "this step");
  const outcome = redactVendorText(String(safeAttempt?.outcome || "").trim())
    .replace(/\s+at\s+\(\d+\s*,\s*\d+\)\s*$/i, "")
    .trim();
  let line = "";
  if (action === "click" || action === "clicked" || action === "tap" || action === "tapped") {
    line = `Clicked ${target}`;
  } else if (action === "type" || action === "typed" || action === "enter" || action === "entered") {
    line = `Entered ${target}`;
  } else if (action === "wait" || action === "waited") {
    line = `Waited on ${target}`;
  } else if (action === "submit" || action === "submitted") {
    line = `Submitted ${target}`;
  } else if (action === "open" || action === "opened") {
    line = `Opened ${target}`;
  } else {
    line = `${action.charAt(0).toUpperCase()}${action.slice(1)} ${target}`.trim();
  }
  if (outcome && !/^(state observed|done|completed|clicked|typed|entered)$/i.test(outcome)) {
    line = `${line} — ${outcome}`;
  }
  return line;
}

function resolveExperienceTimelineAttempts(report, span) {
  const evidence = span?.evidence && typeof span.evidence === "object" ? span.evidence : {};
  const rawSteps = Array.isArray(evidence.action_steps) ? evidence.action_steps : [];
  const linkedFinding = resolveExperienceTimelineLinkedFinding(report, span);
  const diagnosticAttempts = Array.isArray(linkedFinding?.diagnostic_details?.attempted_actions)
    ? linkedFinding.diagnostic_details.attempted_actions
    : [];
  const attemptsByStep = new Map();
  diagnosticAttempts.forEach((attempt, index) => {
    const stepNumber = Number.isFinite(Number(attempt?.step)) ? Math.round(Number(attempt.step)) : index + 1;
    attemptsByStep.set(stepNumber, attempt);
  });

  const resolved = [];
  rawSteps.forEach((stepValue, index) => {
    const numericStep = Number(stepValue);
    if (Number.isFinite(numericStep) && attemptsByStep.has(Math.round(numericStep))) {
      resolved.push(attemptsByStep.get(Math.round(numericStep)));
      return;
    }
    const rawText = redactVendorText(String(stepValue || "").trim());
    if (!rawText || /^\d+$/.test(rawText)) {
      return;
    }
    resolved.push({
      step: index + 1,
      action: "inspect",
      target: rawText,
      outcome: redactVendorText(String(span?.summary || span?.label || "").trim())
    });
  });

  if (resolved.length) {
    return resolved;
  }

  return diagnosticAttempts.slice(0, 4);
}

function buildExperienceTimelineSpecificCopy(report, span, fallbackLabel = "", fallbackSummary = "") {
  const level = String(span?.level || "good").trim().toLowerCase();
  const attempts = resolveExperienceTimelineAttempts(report, span);
  const metrics = span?.metrics && typeof span.metrics === "object" ? span.metrics : {};
  const durationText = formatExperienceTimelineDuration(
    Math.max(0, Math.round(Number(span?.end_ms || 0) - Number(span?.start_ms || 0)))
  );
  const lastAttempt = attempts[attempts.length - 1] || null;
  const focusAttempt =
    attempts.find((attempt) => !/^(wait|waited|inspect)$/i.test(String(attempt?.action || "").trim())) ||
    lastAttempt;
  const focusTarget = cleanExperienceTimelineTarget(
    focusAttempt?.target || lastAttempt?.target || fallbackLabel || "this step",
    "this step"
  );
  const sameStateCount = Math.max(0, Math.round(Number(metrics.same_state_count) || 0));
  const waitCount = Math.max(0, Math.round(Number(metrics.wait_count) || 0));
  const retryCount = Math.max(0, Math.round(Number(metrics.retry_count) || 0));
  const actionLines = attempts.map((attempt) => formatExperienceTimelineAttemptLine(attempt)).filter(Boolean);

  if ((sameStateCount > 1 || waitCount > 1) && level !== "good") {
    const repeatCount = Math.max(sameStateCount, waitCount);
    actionLines.push(`Stayed on the same ${focusTarget} state ${repeatCount} times before ${level === "blocker" ? "the run stopped" : "the flow recovered"}`);
  } else if (retryCount > 1 && level !== "good") {
    actionLines.push(`Needed ${retryCount} tries on ${focusTarget} before the flow changed`);
  }

  let label =
    simplifyReportNarrative(redactVendorText(String(fallbackLabel || span?.label || "").trim())) || `Span ${focusTarget}`;
  let summary =
    simplifyReportNarrative(redactVendorText(String(fallbackSummary || span?.summary || "").trim())) ||
    "We did not save a summary for this part.";

  if (level === "friction") {
    if (/(verification code|otp)/i.test(focusTarget) && (sameStateCount > 0 || waitCount > 0)) {
      label = "Waiting for the verification code slowed the flow";
      summary = `After sending the code, the run stayed on the verification code step for ${durationText} and repeated the same state ${Math.max(1, sameStateCount || waitCount)} times before it recovered.`;
    } else if (sameStateCount > 0 || waitCount > 0) {
      label = `${focusTarget.charAt(0).toUpperCase()}${focusTarget.slice(1)} slowed the flow`;
      summary = `The run paused on ${focusTarget} for ${durationText} and repeated the same state ${Math.max(1, sameStateCount || waitCount)} times before it recovered.`;
    } else if (retryCount > 1) {
      label = `${focusTarget.charAt(0).toUpperCase()}${focusTarget.slice(1)} needed extra tries`;
      summary = `The tester needed ${retryCount} tries on ${focusTarget} before the flow moved forward again.`;
    }
  } else if (level === "blocker") {
    if (sameStateCount > 0 || waitCount > 0) {
      label = `${focusTarget.charAt(0).toUpperCase()}${focusTarget.slice(1)} stalled`;
      summary = `The run stayed on ${focusTarget} for ${durationText} and repeated the same state ${Math.max(1, sameStateCount || waitCount)} times without recovering.`;
    }
  }

  return {
    label,
    summary,
    actionLines: dedupeProblemRefs(actionLines, 5),
    focusTarget
  };
}

function renderExperienceTimelineLogGroup(title, logs) {
  const items = Array.isArray(logs)
    ? logs
        .map((item) => redactVendorText(String(item || "").trim()))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  if (!items.length) {
    return "";
  }
  return `
    <div class="experience-timeline-log-group">
      <span>${escapeHtml(title)}</span>
      <ul>
        ${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}
      </ul>
    </div>
  `;
}

function getExperienceTimelineReactionVisual(level) {
  const normalized = String(level || "good").trim().toLowerCase();
  if (normalized === "blocker") {
    return {
      emoji: "😤",
      mood: "blocked",
      whyLabel: "Why this was red",
      explainer: "This stretch stopped making meaningful progress, so the run ended here."
    };
  }
  if (normalized === "friction") {
    return {
      emoji: "😕",
      mood: "a bit frustrated",
      whyLabel: "Why this was yellow",
      explainer: "This stretch slowed the tester down or made the flow rough, but the run still recovered."
    };
  }
  return {
    emoji: "🙂",
    mood: "comfortable",
    whyLabel: "Why this was green",
    explainer: "This stretch kept moving without obvious friction or confusion."
  };
}

function buildExperienceTimelineReactionReason(summaryText, label) {
  const fallback = simplifyReportNarrative(redactVendorText(String(label || "").trim()));
  let reason = simplifyReportNarrative(redactVendorText(String(summaryText || "").trim())) || fallback;
  if (!reason || /^we did not save/i.test(reason)) {
    return "";
  }

  reason = reason
    .replace(/^The tester\b/i, "I")
    .replace(/^Tester\b/i, "I")
    .replace(/^The run\b/i, "the product")
    .replace(/^The app\b/i, "the app")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");

  return reason;
}

function buildExperienceTimelineReactionQuote(span) {
  const level = String(span?.level || "good").trim().toLowerCase();
  const label = redactVendorText(String(span?.label || "").trim());
  const summaryText = redactVendorText(String(span?.summary || "").trim());
  const reason = buildExperienceTimelineReactionReason(summaryText, label);

  if (level === "blocker") {
    return reason
      ? `I got blocked here because ${reason}.`
      : "I got blocked here because the product stopped moving me forward.";
  }

  if (level === "friction") {
    return reason
      ? `I got a bit frustrated here because ${reason}.`
      : "I got a bit frustrated here because this stretch slowed me down before the flow recovered.";
  }

  return reason
    ? `I felt good here because ${reason}.`
    : "I felt good here because the flow kept moving without obvious issues.";
}

function renderExperienceTimelineReaction(span, personaName) {
  const level = String(span?.level || "good").trim().toLowerCase();
  const safePersona = String(personaName || "QA tester").trim() || "QA tester";
  const visual = getExperienceTimelineReactionVisual(level);
  const quote = buildExperienceTimelineReactionQuote(span);

  return `
    <div class="experience-timeline-reaction experience-timeline-reaction--${escapeHtml(level)}">
      <span class="experience-timeline-reaction-emoji" aria-hidden="true">${escapeHtml(visual.emoji)}</span>
      <div class="experience-timeline-reaction-copy">
        <p class="experience-timeline-reaction-meta">${escapeHtml(`${visual.whyLabel} · ${safePersona} felt ${visual.mood}`)}</p>
        <blockquote>${escapeHtml(quote)}</blockquote>
        <p class="experience-timeline-reaction-note">${escapeHtml(visual.explainer)}</p>
      </div>
    </div>
  `;
}

function renderExperienceTimelineSection(report, row = {}) {
  const timeline = getExperienceTimeline(report);
  if (!timeline) {
    return "";
  }

  const videoItem = resolveExperienceTimelineVideoItem(report);
  if (!videoItem?.url) {
    return "";
  }

  const durationMs = Math.max(1, getExperienceTimelineDurationMs(timeline));
  const summary = timeline.summary && typeof timeline.summary === "object" ? timeline.summary : {};
  const playerId = `experience-video-${toAnchorToken(report?.run_id || row?.run_id || "run")}`;
  const spans = timeline.spans.slice(0, 24);
  const personaName = resolvePersonaName(row);
  const trackButtons = spans
    .map((span, index) => {
      const startMs = Math.max(0, Math.round(Number(span?.start_ms) || 0));
      const endMs = Math.max(startMs + 1, Math.round(Number(span?.end_ms) || startMs + 1));
      const jumpMs = Math.max(0, Math.round(Number(span?.jump_ts_ms) || startMs));
      const startPct = Math.max(0, Math.min(100, (startMs / durationMs) * 100));
      const widthPct = Math.max(1.2, Math.min(100 - startPct, ((endMs - startMs) / durationMs) * 100));
      const label = redactVendorText(String(span?.label || `Span ${index + 1}`));
      const level = String(span?.level || "good").trim().toLowerCase();
      const timeLabel = `${formatExperienceTimelineClock(startMs)}-${formatExperienceTimelineClock(endMs)}`;
      return `
        <button
          type="button"
          class="experience-timeline-span experience-timeline-span--${escapeHtml(level)}"
          style="--experience-span-start:${startPct}%; --experience-span-width:${widthPct}%;"
          data-experience-target="${escapeHtml(playerId)}"
          data-experience-span-id="${escapeHtml(String(span?.id || `span-${index + 1}`))}"
          data-experience-jump-ms="${escapeHtml(String(jumpMs))}"
          data-experience-start-ms="${escapeHtml(String(startMs))}"
          data-experience-end-ms="${escapeHtml(String(endMs))}"
          aria-label="${escapeHtml(`${label} at ${timeLabel}`)}"
          title="${escapeHtml(`${timeLabel} · ${label}`)}"
        ></button>
      `;
    })
    .join("");

  const listMarkup = spans
    .map((span, index) => {
      const startMs = Math.max(0, Math.round(Number(span?.start_ms) || 0));
      const endMs = Math.max(startMs, Math.round(Number(span?.end_ms) || startMs));
      const jumpMs = Math.max(0, Math.round(Number(span?.jump_ts_ms) || startMs));
      const specificCopy = buildExperienceTimelineSpecificCopy(
        report,
        span,
        redactVendorText(String(span?.label || `Span ${index + 1}`)),
        redactVendorText(String(span?.summary || "").trim()) || "We did not save a summary for this part."
      );
      const label = specificCopy.label;
      const summaryText = specificCopy.summary;
      const level = String(span?.level || "good").trim().toLowerCase();
      const anchorId = resolveExperienceTimelineFindingAnchor(report, span);
      const actionSteps = specificCopy.actionLines;
      const consoleLogs = Array.isArray(span?.evidence?.console_logs) ? span.evidence.console_logs : [];
      const networkLogs = Array.isArray(span?.evidence?.network_logs) ? span.evidence.network_logs : [];
      const tags = Array.isArray(span?.tags)
        ? span.tags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
        : [];
      const pageUrl = redactVendorText(String(span?.page?.url || "").trim());
      const metrics = span?.metrics && typeof span.metrics === "object" ? span.metrics : {};
      const metricsBits = [
        Number(metrics.wait_count) > 0 ? `${Math.round(Number(metrics.wait_count))} waits` : "",
        Number(metrics.retry_count) > 0 ? `${Math.round(Number(metrics.retry_count))} retries` : "",
        Number(metrics.same_state_count) > 0 ? `${Math.round(Number(metrics.same_state_count))} same-state repeats` : "",
        Number(metrics.console_error_count) > 0 ? `${Math.round(Number(metrics.console_error_count))} console errors` : "",
        Number(metrics.failed_request_count) > 0 ? `${Math.round(Number(metrics.failed_request_count))} failed requests` : ""
      ].filter(Boolean);
      return `
        <article
          class="experience-timeline-list-item experience-timeline-list-item--${escapeHtml(level)}"
          data-experience-span-panel="${escapeHtml(String(span?.id || `span-${index + 1}`))}"
        >
          <div class="experience-timeline-list-head">
            <button
              type="button"
              class="experience-timeline-jump-button"
              data-experience-target="${escapeHtml(playerId)}"
              data-experience-span-id="${escapeHtml(String(span?.id || `span-${index + 1}`))}"
              data-experience-jump-ms="${escapeHtml(String(jumpMs))}"
              data-experience-start-ms="${escapeHtml(String(startMs))}"
              data-experience-end-ms="${escapeHtml(String(endMs))}"
            >
              ${escapeHtml(`${formatExperienceTimelineClock(startMs)}-${formatExperienceTimelineClock(endMs)}`)}
            </button>
            <span class="experience-timeline-level-pill experience-timeline-level-pill--${escapeHtml(level)}">${escapeHtml(level)}</span>
          </div>
          <h4>${escapeHtml(label)}</h4>
          <p>${escapeHtml(summaryText)}</p>
          ${renderExperienceTimelineReaction(span, personaName)}
          <div class="experience-timeline-meta">
            <span>${escapeHtml(formatExperienceTimelineDuration(Math.max(0, endMs - startMs)))}</span>
            ${pageUrl ? `<span>${escapeHtml(pageUrl)}</span>` : ""}
            ${tags.length ? `<span>${escapeHtml(tags.join(" · "))}</span>` : ""}
          </div>
          ${
            metricsBits.length
              ? `<p class="experience-timeline-metrics">${escapeHtml(metricsBits.join(" · "))}</p>`
              : ""
          }
          ${
            actionSteps.length
              ? `<ol class="experience-timeline-action-list">
                  ${actionSteps.map((item) => `<li>${escapeHtml(redactVendorText(String(item || "")))}</li>`).join("")}
                </ol>`
              : ""
          }
          ${
            consoleLogs.length || networkLogs.length
              ? `<div class="experience-timeline-log-grid">
                  ${renderExperienceTimelineLogGroup("Console", consoleLogs)}
                  ${renderExperienceTimelineLogGroup("Network", networkLogs)}
                </div>`
              : ""
          }
          ${
            anchorId
              ? `<a class="experience-timeline-problem-link" href="#${escapeHtml(anchorId)}">Open related problem</a>`
              : ""
          }
        </article>
      `;
    })
    .join("");

  return `
    <section class="experience-timeline-section" id="section-experience-timeline">
      <div class="report-section-head experience-timeline-head">
        <div>
          <h3>Whole run video</h3>
          <p>Watch the full tester experience, jump to any moment, and read why each stretch was green, yellow, or red.</p>
        </div>
        <div class="experience-timeline-summary">
          <span class="experience-summary-pill experience-summary-pill--good">Good ${escapeHtml(formatExperienceTimelineDuration(summary.good_ms || 0))}</span>
          <span class="experience-summary-pill experience-summary-pill--friction">Friction ${escapeHtml(formatExperienceTimelineDuration(summary.friction_ms || 0))}</span>
          <span class="experience-summary-pill experience-summary-pill--blocker">Blocker ${escapeHtml(formatExperienceTimelineDuration(summary.blocker_ms || 0))}</span>
        </div>
      </div>
      <div
        class="experience-timeline-player"
        data-experience-timeline-player="${escapeHtml(playerId)}"
        data-experience-duration-ms="${escapeHtml(String(durationMs))}"
      >
        <div class="experience-timeline-video-shell">
          <video
            id="${escapeHtml(playerId)}"
            class="experience-timeline-video"
            data-experience-video="1"
            src="${escapeHtml(videoItem.url)}"
            controls
            preload="metadata"
            playsinline
          ></video>
        </div>
        <div class="experience-timeline-track-shell">
          <div class="experience-timeline-track" data-experience-track>
            ${trackButtons}
            <div class="experience-timeline-playhead" data-experience-playhead></div>
          </div>
        </div>
        <div class="experience-timeline-list">
          ${listMarkup}
        </div>
      </div>
    </section>
  `;
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

function getTopReportFinding(report) {
  const findings = sortFindingsByPriority(Array.isArray(report?.findings) ? report.findings : []);
  return findings[0] || null;
}

function buildTopFindingHeroSummary(finding, options = {}) {
  const diagnostics = finding?.diagnostic_details && typeof finding.diagnostic_details === "object" ? finding.diagnostic_details : {};
  const reason = redactVendorText(
    String(diagnostics.failure_reason || finding?.observed_behavior || diagnostics.current_state || "").trim()
  );
  const lastSuccessfulStep = redactVendorText(String(diagnostics.last_successful_step || "").trim());
  const fragments = [];

  if (reason) {
    fragments.push(truncateText(reason, 220));
  }
  if (
    lastSuccessfulStep &&
    !String(reason || "").toLowerCase().includes(String(lastSuccessfulStep || "").toLowerCase())
  ) {
    fragments.push(`Last good step: ${truncateText(lastSuccessfulStep, 110)}`);
  }
  if (options.includeStoppedThere) {
    fragments.push("The test stopped there.");
  }

  return truncateText(fragments.filter(Boolean).join(" "), 340);
}

function getReportStatusPillClass(statusValue) {
  const status = normalizeRunStatus(statusValue);
  if (status === "failed") {
    return "report-status-pill--failed";
  }
  if (status === "partial") {
    return "report-status-pill--partial";
  }
  if (status === "completed") {
    return "report-status-pill--completed";
  }
  if (status === "processing") {
    return "report-status-pill--running";
  }
  if (status === "queued" || status === "retryable") {
    return "report-status-pill--monitoring";
  }
  return "report-status-pill--neutral";
}

function buildReportHeroNarrative(mode, verdict, report, row, liveStatus, summaryNote) {
  const snapshot = computeRiskSnapshot(report);
  const environment = getActiveEnvironment();
  const safeSummaryNote = String(summaryNote || "").trim();
  const topFinding = getTopReportFinding(report);

  if (mode === "running") {
    return {
      kicker: "Test running",
      headline: buildQueueExperience(liveStatus, row).headline,
      summary: buildRunningSummaryMessage(liveStatus, row, snapshot)
    };
  }

  if (mode === "failed") {
    const failure = extractRunFailureContext(report, liveStatus);
    if (topFinding) {
      return {
        kicker: "Top blocker",
        headline: redactVendorText(String(topFinding.title || "Run failed").trim()) || "Run failed",
        summary:
          buildTopFindingHeroSummary(topFinding) ||
          failure.detail ||
          buildRiskSummaryMessage(mode, verdict, snapshot, environment)
      };
    }
    return {
      kicker: "Test failed",
      headline: failure.headline || "Run failed before coverage completed.",
      summary: failure.detail || buildRiskSummaryMessage(mode, verdict, snapshot, environment)
    };
  }

  if (mode === "partial") {
    if (topFinding) {
      return {
        kicker: "Top blocker",
        headline: redactVendorText(String(topFinding.title || "The test stopped early").trim()) || "The test stopped early",
        summary:
          buildTopFindingHeroSummary(topFinding, { includeStoppedThere: true }) ||
          buildRiskSummaryMessage(mode, verdict, snapshot, environment)
      };
    }
    return {
      kicker: "Test stopped early",
      headline: "The test stopped before it could finish.",
      summary: buildRiskSummaryMessage(mode, verdict, snapshot, environment)
    };
  }

  if (verdict === "blocked") {
    const blockerCount = snapshot.criticalCount || snapshot.brokenJourneys;
    return {
      kicker: "Big problems found",
      headline: `${blockerCount} blocker${blockerCount === 1 ? "" : "s"} ${blockerCount === 1 ? "is" : "are"} breaking the mission.`,
      summary: buildRiskSummaryMessage(mode, verdict, snapshot, environment)
    };
  }

  if (verdict === "risky") {
    return {
      kicker: "Problems found",
      headline: "The test finished, but it hit clear problems.",
      summary: buildRiskSummaryMessage(mode, verdict, snapshot, environment)
    };
  }

  return {
    kicker: `${getEnvironmentLabel(environment)} result`,
    headline: "The test finished without any big problems.",
    summary: safeSummaryNote || buildRiskSummaryMessage(mode, verdict, snapshot, environment)
  };
}

function buildReportNextAction(mode, verdict, report) {
  const findings = sortFindingsByPriority(Array.isArray(report?.findings) ? report.findings : []);
  const topFinding = findings[0] || null;

  if (mode === "failed") {
    if (topFinding) {
      return {
        eyebrow: "Do this next",
        title: `Fix “${String(topFinding.title || topFinding.id || "top finding").trim()}” first.`,
        copy:
          buildTopFindingHeroSummary(topFinding) ||
          deriveFindingRecommendation(report, topFinding, 0),
        meta: ["The run ended on this blocker.", "Re-run the same goal after it is fixed."]
      };
    }
    return {
      eyebrow: "Do this next",
      title: "Fix the start of the test, then run it again.",
      copy:
        "This test stopped too early. If it shows no problems, that does not mean everything is fine yet.",
      meta: ["Check the URL and login step.", "Run the same test again before you decide anything."]
    };
  }

  if (mode === "partial") {
    if (topFinding) {
      return {
        eyebrow: "Do this next",
        title: `Fix “${String(topFinding.title || topFinding.id || "top finding").trim()}” first.`,
        copy:
          buildTopFindingHeroSummary(topFinding) ||
          deriveFindingRecommendation(report, topFinding, 0),
        meta: ["This was the blocker that stopped the run.", "Run the same goal again after it is fixed."]
      };
    }
    return {
      eyebrow: "Do this next",
      title: "Run the full test before you trust this result.",
      copy:
        "The tester found some useful clues, but it did not finish the full job.",
      meta: ["Keep the same tester and goal.", "Run it again until it finishes from start to end."]
    };
  }

  if (topFinding) {
    const priorityScore = computeFindingPriorityScore(topFinding);
    return {
      eyebrow: "Do this next",
      title: `Fix “${String(topFinding.title || topFinding.id || "top finding").trim()}” first.`,
      copy: deriveFindingRecommendation(report, topFinding, 0),
      meta: [
        `Priority ${priorityScore}/100`,
        `${normalizeSeverity(topFinding.severity).toUpperCase()} severity`,
        formatFindingTypeLabel(topFinding.type)
      ]
    };
  }

  return {
    eyebrow: "Do this next",
    title: "Use this as your clean starting point.",
    copy:
      "This test did not show any big problems in the part it checked.",
    meta: ["Open the proof if you want to double-check it.", "Run a wider test if you want to be more sure."]
  };
}

function renderReportInfoBarIcon(kind) {
  const iconType = String(kind || "").trim().toLowerCase();
  if (iconType === "goal") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5"></circle>
        <circle cx="10" cy="10" r="2.5"></circle>
      </svg>
    `;
  }
  if (iconType === "persona") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="7" r="3.2"></circle>
        <path d="M4.5 16.2c1.3-2.6 3-3.8 5.5-3.8s4.2 1.2 5.5 3.8"></path>
      </svg>
    `;
  }
  if (iconType === "status") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7"></circle>
        <path d="M10 5.7v4.5l3.2 1.8"></path>
      </svg>
    `;
  }
  if (iconType === "coverage") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="4" y="4" width="5" height="5" rx="1.2"></rect>
        <rect x="11" y="4" width="5" height="5" rx="1.2"></rect>
        <rect x="4" y="11" width="5" height="5" rx="1.2"></rect>
        <rect x="11" y="11" width="5" height="5" rx="1.2"></rect>
      </svg>
    `;
  }
  if (iconType === "problems") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3.5 17 16.5H3Z"></path>
        <path d="M10 7.4v3.8"></path>
        <circle cx="10" cy="13.7" r="0.9" fill="currentColor" stroke="none"></circle>
      </svg>
    `;
  }
  if (iconType === "next") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 10h10.5"></path>
        <path d="m10.8 5.9 4.2 4.1-4.2 4.1"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5"></circle>
    </svg>
  `;
}

function renderReportInfoBar(report, row, liveStatus, missionModel, nextAction, mode = "completed") {
  const snapshot = computeRiskSnapshot(report);
  const coverage = buildCoverageSnapshot(report);
  const canonicalStatus = formatStatusLabel(getCanonicalRunStatus(report, row, liveStatus) || mode || "unknown");
  const completedCoverage = coverage.attemptedJourneys
    ? `${coverage.completedJourneys + coverage.partialJourneys}/${coverage.attemptedJourneys} flows`
    : `${coverage.pagesVisited} pages`;
  const blockerLabel = snapshot.criticalCount
    ? `${snapshot.criticalCount} blocker${snapshot.criticalCount === 1 ? "" : "s"}`
    : snapshot.majorCount
      ? `${snapshot.majorCount} friction point${snapshot.majorCount === 1 ? "" : "s"}`
      : "No major blockers";
  const items = [
    {
      kind: "goal",
      label: "Goal",
      value: missionModel.steps[0] || missionModel.headline || "Finish the core task",
      meta: missionModel.steps.length > 1 ? `${missionModel.steps.length} saved steps` : "Primary mission"
    },
    {
      kind: "persona",
      label: missionModel.personaLabel || "Persona",
      value: missionModel.personaDetail || "General business user",
      meta: "First-time tester lens"
    },
    {
      kind: "status",
      label: "Run",
      value: canonicalStatus,
      meta: report?.run_id || row?.run_id || "Unknown run"
    },
    {
      kind: "coverage",
      label: "Coverage",
      value: completedCoverage,
      meta: `${coverage.pagesVisited} pages opened`
    },
    {
      kind: "problems",
      label: "Problems",
      value: blockerLabel,
      meta: `${snapshot.avgSatisfaction}/100 test score`
    },
    {
      kind: "next",
      label: "Next move",
      value: nextAction.title || "Review the top finding",
      meta: truncateText(redactVendorText(nextAction.copy || ""), 104) || "Use the top finding as the next fix."
    }
  ];

  return `
    <div class="report-info-bar" aria-label="Test summary">
      ${items
        .map(
          (item) => `
            <article class="report-info-item report-info-item--${escapeHtml(item.kind)}">
              <span class="report-info-icon" aria-hidden="true">${renderReportInfoBarIcon(item.kind)}</span>
              <div class="report-info-copy">
                <span class="report-info-label">${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
                <small>${escapeHtml(item.meta)}</small>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderReportMissionPanel(missionModel, missionGoal) {
  const hasSteps = missionModel.steps.length > 0;
  const stepsMarkup = missionModel.steps.length
    ? `
      <ol class="report-mission-steps">
        ${missionModel.steps
          .map(
            (step, index) => `
              <li class="report-mission-step">
                <span class="report-mission-step-index">${escapeHtml(String(index + 1))}</span>
                <div class="report-mission-step-copy">
                  <strong>${escapeHtml(step)}</strong>
                </div>
              </li>
            `
          )
          .join("")}
      </ol>
    `
    : `<p class="report-mission-fallback">No extra task list was saved for this test.</p>`;
  const summaryMarkup = hasSteps
    ? ""
    : `<p class="report-panel-copy">${escapeHtml(missionGoal || missionModel.headline)}</p>`;

  return `
    <article class="report-hero-panel report-hero-panel--mission">
      <div class="report-panel-head">
        <div>
          <p class="report-panel-kicker">Goal</p>
          <h3 class="report-panel-title">What the tester was trying to do</h3>
        </div>
      </div>
      ${summaryMarkup}
      ${stepsMarkup}
      ${
        missionModel.personaDetail
          ? `
            <div class="report-mission-footer">
              <span class="report-panel-eyebrow">${escapeHtml(missionModel.personaLabel || "Audience")}</span>
              <strong>${escapeHtml(missionModel.personaDetail)}</strong>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function formatRepoTriageStatusLabel(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "queued") {
    return "Queued";
  }
  if (status === "processing") {
    return "Analyzing repo";
  }
  if (status === "completed") {
    return "Ready";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "skipped") {
    return "Skipped";
  }
  if (status === "pending_blind_report") {
    return "Waiting for blind report";
  }
  return "Disabled";
}

function getRepoTriageState(report, row = {}, liveStatus = null) {
  const liveRepoTriage = liveStatus?.repo_triage && typeof liveStatus.repo_triage === "object" ? liveStatus.repo_triage : null;
  const rowRepoTriage = row?.repo_triage && typeof row.repo_triage === "object" ? row.repo_triage : null;
  const reportRepoTriage =
    report?.metadata?.repo_triage && typeof report.metadata.repo_triage === "object"
      ? report.metadata.repo_triage
      : null;
  const engineeringTriage =
    report?.engineering_triage && typeof report.engineering_triage === "object" ? report.engineering_triage : null;
  const enabled =
    liveRepoTriage?.enabled === true ||
    rowRepoTriage?.enabled === true ||
    reportRepoTriage?.enabled === true ||
    Boolean(engineeringTriage);
  const status = normalizeRunStatus(
    liveRepoTriage?.status ||
      rowRepoTriage?.status ||
      (engineeringTriage ? "completed" : reportRepoTriage?.status || (enabled ? "skipped" : "disabled"))
  );

  return {
    enabled,
    status: status || (enabled ? "skipped" : "disabled"),
    summary:
      String(
        liveRepoTriage?.summary ||
          rowRepoTriage?.summary ||
          engineeringTriage?.summary ||
          reportRepoTriage?.summary ||
          ""
      ).trim() || "",
    repo:
      String(
        liveRepoTriage?.repo ||
          rowRepoTriage?.repo ||
          reportRepoTriage?.repo ||
          engineeringTriage?.repo_label ||
          ""
      ).trim() || ""
  };
}

function findEngineeringTriageForFinding(report, finding) {
  const perFinding = Array.isArray(report?.engineering_triage?.per_finding)
    ? report.engineering_triage.per_finding
    : [];
  const findingId = String(finding?.id || "").trim();
  const findingTitle = String(finding?.title || "").trim().toLowerCase();

  return (
    perFinding.find((item) => findingId && String(item?.finding_id || "").trim() === findingId) ||
    perFinding.find((item) => findingTitle && String(item?.finding_title || "").trim().toLowerCase() === findingTitle) ||
    null
  );
}

function renderEngineeringTriageSection(report, row = {}, liveStatus = null) {
  const repoTriage = getRepoTriageState(report, row, liveStatus);
  const engineeringTriage =
    report?.engineering_triage && typeof report.engineering_triage === "object" ? report.engineering_triage : null;

  if (!repoTriage.enabled && !engineeringTriage) {
    return "";
  }

  if (!engineeringTriage) {
    const toneClass =
      repoTriage.status === "failed"
        ? "report-empty-card--warning"
        : repoTriage.status === "queued" || repoTriage.status === "processing"
          ? "report-empty-card--success"
          : "";
    return `
      <section class="section-priority" id="section-engineering-triage">
        <div class="report-section-head">
          <h3>Engineering Triage</h3>
          <p>Blind evidence stays untouched. This is a separate code-aware layer for owner-only diagnosis.</p>
        </div>
        <div class="report-empty-card ${escapeHtml(toneClass)}">
          <strong>${escapeHtml(formatRepoTriageStatusLabel(repoTriage.status))}</strong>
          <p>${escapeHtml(repoTriage.summary || "No code-aware diagnosis is attached to this run yet.")}</p>
        </div>
      </section>
    `;
  }

  const cards = Array.isArray(engineeringTriage.per_finding) ? engineeringTriage.per_finding : [];
  if (!cards.length) {
    return `
      <section class="section-priority" id="section-engineering-triage">
        <div class="report-section-head">
          <h3>Engineering Triage</h3>
          <p>${escapeHtml(engineeringTriage.summary || "Repo scan completed.")}</p>
        </div>
        <div class="report-empty-card report-empty-card--success">
          <strong>Repo scan finished</strong>
          <p>${escapeHtml(engineeringTriage.summary || "No finding-level diagnosis was attached.")}</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="section-priority" id="section-engineering-triage">
      <div class="report-section-head">
        <h3>Engineering Triage</h3>
        <p>${escapeHtml(engineeringTriage.summary || "Likely file ownership, root-cause hypotheses, and test follow-ups from the repo scan.")}</p>
      </div>
      <div class="finding-ledger-list">
        ${cards
          .map(
            (item) => `
              <article class="finding-ledger-item">
                <div class="finding-ledger-head">
                  <div class="finding-ledger-heading">
                    <h4>${escapeHtml(item.finding_title || item.finding_id || "Finding")}</h4>
                    <p class="finding-ledger-meta">Confidence ${escapeHtml(
                      `${Math.round((Number(item.confidence) || 0) * 100)}%`
                    )}</p>
                  </div>
                </div>
                <div class="finding-detail-copy">
                  ${
                    Array.isArray(item.suspected_files) && item.suspected_files.length
                      ? `<p><strong>Suspected files</strong> ${escapeHtml(item.suspected_files.join(" · "))}</p>`
                      : ""
                  }
                  ${
                    Array.isArray(item.probable_causes) && item.probable_causes.length
                      ? `<p><strong>Probable causes</strong> ${escapeHtml(item.probable_causes.join(" · "))}</p>`
                      : ""
                  }
                  ${
                    Array.isArray(item.suggested_checks) && item.suggested_checks.length
                      ? `<p><strong>Suggested checks</strong> ${escapeHtml(item.suggested_checks.join(" · "))}</p>`
                      : ""
                  }
                  ${
                    Array.isArray(item.suggested_tests) && item.suggested_tests.length
                      ? `<p><strong>Suggested tests</strong> ${escapeHtml(item.suggested_tests.join(" · "))}</p>`
                      : ""
                  }
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFindingEngineeringTriageSection(report, finding) {
  const triage = findEngineeringTriageForFinding(report, finding);
  if (!triage) {
    return "";
  }

  return `
    <section class="finding-detail-section">
      <div class="finding-detail-section-head">
        <h3>Code-aware diagnosis</h3>
        <p>Generated after the blind run finished, using the configured repo/workspace as secondary context.</p>
      </div>
      <div class="finding-detail-copy">
        ${
          Array.isArray(triage.suspected_files) && triage.suspected_files.length
            ? `<p><strong>Suspected files</strong> ${escapeHtml(triage.suspected_files.join(" · "))}</p>`
            : ""
        }
        ${
          Array.isArray(triage.probable_causes) && triage.probable_causes.length
            ? `<p><strong>Probable causes</strong> ${escapeHtml(triage.probable_causes.join(" · "))}</p>`
            : ""
        }
        ${
          Array.isArray(triage.suggested_checks) && triage.suggested_checks.length
            ? `<p><strong>Suggested checks</strong> ${escapeHtml(triage.suggested_checks.join(" · "))}</p>`
            : ""
        }
        ${
          Array.isArray(triage.suggested_tests) && triage.suggested_tests.length
            ? `<p><strong>Suggested tests</strong> ${escapeHtml(triage.suggested_tests.join(" · "))}</p>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderSelectedHeader(report, row, liveStatus = null) {
  const repoTriage = getRepoTriageState(report, row, liveStatus);
  const sessionUrl = toExternalUrl(row.session_url);
  const mission = resolveRunMission(row, report);
  const missionModel = buildDashboardMissionModel(mission, row);
  const newerRun = findNewerRunForSelection(row, report);
  const summaryNote = redactVendorText(report?.summary?.note || "No summary note available.");
  const mode = deriveDashboardMode(report, row, liveStatus);
  const snapshot = computeRiskSnapshot(report);
  const verdict = deriveRiskVerdict(mode, snapshot, report, liveStatus);
  const verdictMeta = buildVerdictMeta(verdict, getActiveEnvironment());
  const heroNarrative = buildReportHeroNarrative(mode, verdict, report, row, liveStatus, summaryNote);
  const nextAction = buildReportNextAction(mode, verdict, report);
  const projectLabel =
    String(
      row?.brand_name ||
        toDisplayProjectName(row?.brand_key || "") ||
        buildTargetLabelFromUrl(report?.target || row?.target || "") ||
        report?.target ||
        row?.target ||
        report?.run_id ||
        "Run report"
    ).trim() || "Run report";
  const quickLinks = [
    `<span class="report-status-pill ${escapeHtml(verdictMeta.severityClass)}">${escapeHtml(verdictMeta.label)}</span>`,
    sessionUrl ? `<a class="report-action-button" href="${escapeHtml(sessionUrl)}" target="_blank" rel="noreferrer">Watch test</a>` : "",
    canManageReportSharing() && (report?.run_id || row?.run_id)
      ? `
        <button
          type="button"
          class="report-action-button report-action-button-primary"
          data-team-share-run="${escapeHtml(report?.run_id || row?.run_id || "")}"
          aria-label="Share with team"
          title="Share with team"
        >
          Share with team
        </button>
      `
      : ""
  ]
    .filter(Boolean)
    .join("");
  const metaPills = [
    `<span class="report-hero-meta-pill">Test ${escapeHtml(report?.run_id || row?.run_id || "unknown")}</span>`,
    repoTriage.enabled
      ? `<span class="report-hero-meta-pill">Engineering triage: ${escapeHtml(formatRepoTriageStatusLabel(repoTriage.status))}</span>`
      : ""
  ]
    .filter(Boolean)
    .join("");
  return `
    ${renderHistoricalRunBanner(newerRun)}
    <section class="report-hero report-hero--${escapeHtml(verdict)}">
      <div class="report-hero-top">
        <div class="report-hero-topbar">
          ${quickLinks ? `<div class="report-summary-actions report-summary-actions-hero">${quickLinks}</div>` : ""}
        </div>
        <div class="report-hero-copy">
          <p class="report-hero-project">${escapeHtml(projectLabel)}</p>
          <p class="report-hero-headline">${escapeHtml(heroNarrative.headline)}</p>
          <p class="report-hero-summary">${escapeHtml(heroNarrative.summary)}</p>
          <div class="report-hero-meta">${metaPills}</div>
        </div>
      </div>
    </section>
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
    <section class="section-block report-live-watch">
      <h3>Live test</h3>
      <p>
        Status: <strong>${escapeHtml(queueStatus || "processing")}</strong>
        ${progress ? ` · ${escapeHtml(String(progress.percent ?? 0))}%` : ""}
      </p>
      <p>${escapeHtml(progress?.message || "The tester is still moving through the site.")}</p>
      ${previewMarkup}
      <p>Problems so far: ${escapeHtml(String(findingsCount))} · Things tried so far: ${escapeHtml(String(journeysCount))}</p>
      ${eventsMarkup}
    </section>
  `;
}

function renderCounts(report, row = {}, liveStatus = null) {
  const counts = report?.summary?.counts || {};
  const snapshot = computeRiskSnapshot(report);
  const mode = deriveDashboardMode(report, row, liveStatus);
  const metrics = buildHeroMetricModel(mode, report, snapshot, liveStatus, row);
  const badges = [
    { label: "bugs", value: counts.bug || 0 },
    { label: "friction", value: counts.frustration_point || 0 },
    { label: "confusion", value: counts.confusion_point || 0 },
    { label: "dead ends", value: counts.dead_end || 0 },
    { label: "performance", value: counts.performance_issue || 0 },
    { label: "a11y", value: counts.accessibility_issue || 0 },
    { label: "copy", value: counts.copy_issue || 0 }
  ]
    .filter((item) => Number(item.value) > 0)
    .slice(0, 5);

  return `
    <article class="report-hero-panel report-overview-panel" id="section-snapshot">
      <div class="report-panel-head">
        <div>
          <p class="report-panel-kicker">Quick facts</p>
          <h3 class="report-panel-title">Simple facts from this test</h3>
        </div>
      </div>
      <div class="report-overview-grid">
        ${metrics
          .map(
            (metric) => `
              <div class="report-overview-card">
                <span>${escapeHtml(metric.label)}</span>
                <strong>${escapeHtml(metric.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      ${
        badges.length
          ? `
            <div class="report-overview-badges">
              ${badges
                .map(
                  (badge) => `
                    <span class="report-overview-badge">${escapeHtml(badge.label)} ${escapeHtml(String(badge.value))}</span>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderPrioritySummary(report, mode = "completed") {
  const findings = sortFindingsByPriority(Array.isArray(report.findings) ? report.findings : []);
  const topFindings = findings.slice(0, 3);
  if (!topFindings.length) {
    const isWarning = mode === "failed" || mode === "partial";
    return `
      <section class="section-priority" id="section-priority">
        <div class="report-section-head">
          <h3>Fix first</h3>
          <p>${escapeHtml(
            isWarning
              ? "This test stopped early, so no saved problems does not mean the site is clean."
              : "This test did not show any big problems."
          )}</p>
        </div>
        <div class="report-empty-card ${escapeHtml(isWarning ? "report-empty-card--warning" : "report-empty-card--success")}">
          <strong>${escapeHtml(isWarning ? "Run it again before you decide anything." : "Nothing urgent stands out here.")}</strong>
          <p>${escapeHtml(
            isWarning
              ? "Use the proof below to fix the start of the test, then run the whole thing again."
              : "This part looks okay. Check the proof or run a bigger test if you want to be more sure."
          )}</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="section-priority" id="section-priority">
      <div class="report-section-head">
        <h3>Fix first</h3>
        <p>These are the biggest problems, so you do not have to read the whole page first.</p>
      </div>
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
    </section>
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
                <a href="#${escapeHtml(marker.id)}">Open problem</a>
              </li>
            `
          )
          .join("")}
      </ol>
    `
    : "<p class=\"evidence-note\">No saved jump points for problems in this test.</p>";

  return `
    <div class="section-block replay-review" id="section-replay">
      <h3>Saved pictures</h3>
      <p>These are the pictures the tester saved during the test.</p>
      <div class="replay-review-layout">
        <div class="replay-review-player">
          ${renderReplayPlayer(view, { playerId: safePlayerId, frameLimit: 24 })}
        </div>
        <aside class="replay-review-markers">
          <h4>Jump to a problem</h4>
          ${markersMarkup}
        </aside>
      </div>
    </div>
  `;
}

function renderJourneys(report, row = {}) {
  const journeys = Array.isArray(report.tested_journeys) ? report.tested_journeys : [];
  if (!journeys.length) {
    return `<div class="section-block" id="section-journeys"><h3>What the tester tried</h3><p>We did not save this part for this test.</p></div>`;
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const getRelatedFindings = (journey) => {
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

    return findings.filter((finding) => {
      const findingTokens = [
        finding?.journey_id,
        finding?.journeyId,
        finding?.journey,
        finding?.flow_id,
        finding?.flowId,
        finding?.flow
      ]
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean);
      const findingPage = String(finding?.page || finding?.route || "").trim().toLowerCase();
      const hasTokenMatch =
        Boolean(journeyTokens.length) &&
        findingTokens.some((token) => journeyTokens.some((journeyToken) => token.includes(journeyToken)));
      const hasPageMatch =
        Boolean(findingPage) &&
        journeyPages.some(
          (journeyPage) => findingPage.includes(journeyPage) || journeyPage.includes(findingPage)
        );
      return hasTokenMatch || hasPageMatch;
    });
  };
  const timeline = getExperienceTimeline(report);
  const timelineDurationMs = Math.max(1, getExperienceTimelineDurationMs(timeline));
  const reportVideoItem = resolveExperienceTimelineVideoItem(report);
  const getNodeTone = (level, status) => {
    const normalizedLevel = String(level || "").trim().toLowerCase();
    const normalizedStatus = normalizeRunStatus(status) || String(status || "").toLowerCase();
    if (normalizedLevel === "blocker" || normalizedStatus === "blocked" || normalizedStatus === "failed") {
      return "critical";
    }
    if (normalizedLevel === "friction" || normalizedStatus === "partial") {
      return "caution";
    }
    return "clear";
  };
  const getStepStatusLabel = (level) => {
    const normalized = String(level || "good").trim().toLowerCase();
    if (normalized === "blocker") return "blocked";
    if (normalized === "friction") return "friction";
    return "clear";
  };
  const normalizeActionRecord = (attempt, index) => {
    const stepNumber = Number.isFinite(Number(attempt?.step)) ? Math.max(1, Math.round(Number(attempt.step))) : index + 1;
    const tsMs = Date.parse(String(attempt?.ts || ""));
    return {
      ...attempt,
      stepNumber,
      tsMs: Number.isFinite(tsMs) ? tsMs : null,
      actionLabel: redactVendorText(String(attempt?.action || "").trim()) || "inspect",
      targetLabel: redactVendorText(String(attempt?.target || "").trim()) || "current screen",
      outcomeLabel: redactVendorText(String(attempt?.outcome || "").trim()) || "state observed"
    };
  };
  const buildStepTimelineMap = (finding, attemptedActions) => {
    const spans = Array.isArray(timeline?.spans) ? timeline.spans : [];
    if (!finding || !spans.length || !attemptedActions.length) {
      return new Map();
    }
    const normalizedFindingId = String(finding?.id || "").trim();
    const matchingSpans = spans.filter((span) => {
      const linkedIds = Array.isArray(span?.linked_finding_ids) ? span.linked_finding_ids : [];
      return linkedIds.some((item) => String(item || "").trim() === normalizedFindingId);
    });
    const sourceSpans = matchingSpans.length ? matchingSpans : spans;
    const attemptedByStep = new Map(attemptedActions.map((item) => [item.stepNumber, item]));
    const map = new Map();

    for (let spanIndex = 0; spanIndex < sourceSpans.length; spanIndex += 1) {
      const span = sourceSpans[spanIndex];
      const spanStartMs = Math.max(0, Math.round(Number(span?.start_ms) || 0));
      const spanEndMs = Math.max(spanStartMs + 1, Math.round(Number(span?.end_ms) || spanStartMs + 1));
      const nextSpan = sourceSpans[spanIndex + 1];
      const segmentEndMs = Math.max(spanStartMs + 1, Math.round(Number(nextSpan?.start_ms) || spanEndMs));
      const actionSteps = Array.isArray(span?.evidence?.action_steps)
        ? span.evidence.action_steps
            .map((value) => Math.round(Number(value)))
            .filter((value) => Number.isInteger(value) && attemptedByStep.has(value))
            .sort((left, right) => left - right)
        : [];
      if (!actionSteps.length) {
        continue;
      }

      const actionsInSpan = actionSteps.map((stepNumber) => attemptedByStep.get(stepNumber)).filter(Boolean);
      const actionsWithTs = actionsInSpan.filter((item) => Number.isFinite(item?.tsMs));
      const availableWindowMs = Math.max(1200, segmentEndMs - spanStartMs);
      const firstTsMs = actionsWithTs.length >= 2 ? Math.min(...actionsWithTs.map((item) => Number(item.tsMs))) : Number.NaN;
      const lastTsMs = actionsWithTs.length >= 2 ? Math.max(...actionsWithTs.map((item) => Number(item.tsMs))) : Number.NaN;

      const stepEntries = [];
      actionsInSpan.forEach((attempt, actionIndex) => {
        let relativeProgress = 0;
        if (Number.isFinite(attempt?.tsMs) && Number.isFinite(firstTsMs) && Number.isFinite(lastTsMs) && lastTsMs > firstTsMs) {
          relativeProgress = Math.max(0, Math.min(1, (Number(attempt.tsMs) - firstTsMs) / (lastTsMs - firstTsMs)));
        } else if (actionsInSpan.length > 1) {
          relativeProgress = actionIndex / Math.max(1, actionsInSpan.length - 1);
        }

        const jumpMs =
          actionsInSpan.length === 1
            ? spanStartMs
            : Math.max(spanStartMs, Math.min(segmentEndMs - 320, spanStartMs + Math.round(relativeProgress * (availableWindowMs - 320))));
        stepEntries.push({
          stepNumber: attempt.stepNumber,
          level: String(span?.level || "good").trim().toLowerCase(),
          label: redactVendorText(String(span?.label || "").trim()),
          summary: redactVendorText(String(span?.summary || "").trim()),
          jumpMs
        });
      });

      stepEntries.forEach((entry, actionIndex) => {
        const nextEntry = stepEntries[actionIndex + 1] || null;
        const clipStartMs = Math.max(spanStartMs, entry.jumpMs);
        const rawClipEndMs = nextEntry ? Math.max(clipStartMs + 320, nextEntry.jumpMs) : Math.max(clipStartMs + 320, segmentEndMs);
        const clipEndMs = Math.max(
          clipStartMs + 1800,
          Math.min(
            timelineDurationMs,
            Math.max(clipStartMs + 1800, rawClipEndMs)
          )
        );
        map.set(entry.stepNumber, {
          ...entry,
          clipStartMs,
          clipEndMs
        });
      });
    }

    return map;
  };
  const toStepTitle = (rawStep, attempt, fallback) => {
    const simplified = simplifyJourneyText(rawStep || "");
    if (simplified) {
      return simplified;
    }
    const actionPrefix = attempt?.actionLabel ? `${attempt.actionLabel}: ` : "";
    const targetText = attempt?.targetLabel || "";
    const combined = `${actionPrefix}${targetText}`.trim();
    return combined || fallback;
  };
  const toStepOutcome = (attempt, spanMeta, fallback) => {
    const outcome = redactVendorText(String(attempt?.outcomeLabel || "").trim());
    if (outcome) {
      return truncateText(outcome.replace(/\s+at\s+\(\d+\s*,\s*\d+\)\s*$/i, "").trim(), 140);
    }
    if (spanMeta?.summary) {
      return truncateText(String(spanMeta.summary), 140);
    }
    return truncateText(fallback, 140);
  };

  const stepCards = [];
  let globalStepIndex = 0;
  journeys.forEach((journey, journeyIndex) => {
    const journeyStatus = normalizeRunStatus(journey?.status) || String(journey?.status || "completed").toLowerCase();
    const relatedFindings = sortFindingsByPriority(getRelatedFindings(journey));
    const primaryFinding = relatedFindings[0] || null;
    const attemptedActions = Array.isArray(primaryFinding?.diagnostic_details?.attempted_actions)
      ? primaryFinding.diagnostic_details.attempted_actions.map(normalizeActionRecord).sort((left, right) => left.stepNumber - right.stepNumber)
      : [];
    const attemptedByStep = new Map(attemptedActions.map((item) => [item.stepNumber, item]));
    const stepTimelineMap = buildStepTimelineMap(primaryFinding, attemptedActions);
    const proofBaselineMs = Array.from(stepTimelineMap.values()).reduce((lowest, item) => {
      const candidate = Math.max(0, Math.round(Number(item?.jumpMs) || 0));
      if (!candidate) {
        return lowest;
      }
      if (!Number.isFinite(lowest)) {
        return candidate;
      }
      return Math.min(lowest, candidate);
    }, Number.POSITIVE_INFINITY);
    const displayTitle = simplifyJourneyTitle(journey?.name || journey?.id || `Try ${journeyIndex + 1}`);
    const summaryText = simplifyJourneySummary(journey?.summary || "", displayTitle);
    const stepList = Array.isArray(journey?.steps) ? journey.steps : [];
    const stepTotal = Math.max(stepList.length, attemptedActions.length, 1);
    const journeyVideos = Array.isArray(journey?.evidence?.videos) ? journey.evidence.videos : [];
    const findingVideos = Array.isArray(primaryFinding?.evidence?.videos) ? primaryFinding.evidence.videos : [];
    const videoItem = resolveEvidenceVideoItems(report, [...journeyVideos, ...findingVideos], { maxItems: 1 })[0] || reportVideoItem || null;
    const stepClipByStep = new Map(
      (Array.isArray(journey?.step_video_clips) ? journey.step_video_clips : [])
        .map((clip) => {
          const stepNumber = Math.max(1, Math.round(Number(clip?.step) || 0));
          return stepNumber ? [stepNumber, clip] : null;
        })
        .filter(Boolean)
    );

    for (let localStepIndex = 0; localStepIndex < stepTotal; localStepIndex += 1) {
      const stepNumber = localStepIndex + 1;
      const attempt = attemptedByStep.get(stepNumber) || attemptedActions[localStepIndex] || null;
      const spanMeta = stepTimelineMap.get(stepNumber) || null;
      const stepClip = stepClipByStep.get(stepNumber) || null;
      const level =
        spanMeta?.level || (journeyStatus === "blocked" && stepNumber === stepTotal ? "blocker" : journeyStatus === "partial" && stepNumber === stepTotal ? "friction" : "good");
      const tone = getNodeTone(level, journeyStatus);
      const jumpMs = Math.max(
        0,
        Math.round(
          Number(stepClip?.clip_start_ms || stepClip?.clipStartMs || spanMeta?.jumpMs) || 0
        )
      );
      const clipStartMs = Math.max(
        0,
        Math.round(
          Number(stepClip?.clip_start_ms || stepClip?.clipStartMs || spanMeta?.clipStartMs || jumpMs) || jumpMs
        )
      );
      const clipEndMs = Math.max(
        clipStartMs + 1800,
        Math.round(
          Number(stepClip?.clip_end_ms || stepClip?.clipEndMs || spanMeta?.clipEndMs || clipStartMs + 4000) ||
            clipStartMs + 4000
        )
      );
      const timeLabel =
        clipEndMs > clipStartMs
          ? `${formatExperienceTimelineClock(clipStartMs)}-${formatExperienceTimelineClock(clipEndMs)}`
          : jumpMs > 0
            ? formatExperienceTimelineClock(jumpMs)
            : "Start";
      const stepProofRaw =
        String(stepClip?.video || stepClip?.video_url || stepClip?.videoUrl || stepClip?.source || stepClip?.url || stepClip?.path || "").trim();
      const explicitStepProofUrl = stepProofRaw ? resolveEvidenceDisplayUrl(report, "video", stepProofRaw) : "";
      const stepProofUrl =
        explicitStepProofUrl || (videoItem?.url ? buildVideoClipUrl(videoItem.url, clipStartMs, clipEndMs) : "");
      const stepTitle = truncateText(
        toStepTitle(stepList[localStepIndex], attempt, localStepIndex === 0 ? `Start ${displayTitle}` : `Step ${stepNumber}`),
        84
      );
      const stepOutcome = toStepOutcome(
        attempt,
        spanMeta,
        stepNumber === stepTotal && journeyStatus !== "completed" ? summaryText : "The tester moved through this step."
      );
      const blockerNote =
        level === "blocker"
          ? truncateText(
              redactVendorText(
                String(primaryFinding?.diagnostic_details?.failure_reason || primaryFinding?.observed_behavior || "").trim()
              ),
              140
            )
          : "";
      stepCards.push(`
        <article class="journey-step-card journey-step-card--${tone}" id="${escapeHtml(`journey-step-${toAnchorToken(`${displayTitle}-${stepNumber}-${globalStepIndex + 1}`)}`)}">
          <div class="journey-step-head">
            <div class="journey-step-title">
              <span class="journey-step-kicker">Step ${stepNumber} · Try ${journeyIndex + 1}</span>
              <h4>${escapeHtml(stepTitle)}</h4>
            </div>
            <span class="journey-step-status journey-step-status--${escapeHtml(level)}">${escapeHtml(getStepStatusLabel(level))}</span>
          </div>
          <p class="journey-step-outcome">${escapeHtml(stepOutcome)}</p>
          ${blockerNote ? `<p class="journey-step-problem">${escapeHtml(blockerNote)}</p>` : ""}
          ${
            stepProofUrl
              ? `
                  <div class="journey-step-proof">
                    <div class="journey-step-proof-head">
                      <span>Step proof</span>
                      <small>${escapeHtml(timeLabel)}</small>
                    </div>
                    <video
                      class="journey-step-proof-video"
                      ${explicitStepProofUrl ? "" : `data-step-proof-video="1"
                      data-step-proof-fragmented="1"
                      data-step-jump-ms="${escapeHtml(String(jumpMs))}"
                      data-step-clip-start-ms="${escapeHtml(String(clipStartMs))}"
                      data-step-clip-end-ms="${escapeHtml(String(clipEndMs))}"
                      data-step-proof-baseline-ms="${escapeHtml(String(Number.isFinite(proofBaselineMs) ? proofBaselineMs : 0))}"
                      data-step-timeline-duration-ms="${escapeHtml(String(timelineDurationMs))}"`}
                      src="${escapeHtml(stepProofUrl)}"
                      controls
                      muted
                      preload="${explicitStepProofUrl ? "metadata" : "auto"}"
                      playsinline
                    ></video>
                  </div>
                `
              : `
                  <div class="journey-step-proof journey-step-proof--empty">
                    <div class="journey-step-proof-head">
                      <span>Step proof</span>
                      <small>No video</small>
                    </div>
                    <p>No video proof was attached to this step.</p>
                  </div>
                `
          }
          <div class="journey-step-meta">
            <span>${escapeHtml(displayTitle)}</span>
            <span>${escapeHtml(timeLabel)}</span>
            ${attempt?.targetLabel ? `<span>${escapeHtml(truncateText(String(attempt.targetLabel || ""), 60))}</span>` : ""}
          </div>
        </article>
      `);
      globalStepIndex += 1;
    }
  });

  const filmstripMarkup = stepCards
    .map((markup, index) => {
      const connector =
        index < stepCards.length - 1
          ? `<div class="journey-filmstrip-link" aria-hidden="true"><span></span></div>`
          : "";
      return `${markup}${connector}`;
    })
    .join("");

  return `
    <section class="report-journey-section" id="section-journeys">
      <div class="report-journey-head">
        <div>
          <p class="report-panel-kicker">This test</p>
          <h3>What the tester tried</h3>
        </div>
        <p>This is the tester flow as a horizontal filmstrip. Each card is one step, and the mini video is clipped to the time window for that step.</p>
      </div>
      <div class="journey-filmstrip-shell">
        <div class="journey-filmstrip" aria-label="Step-by-step filmstrip of what the tester tried">
          ${filmstripMarkup}
        </div>
      </div>
    </section>
  `;
}

function renderSecondaryReportSections(report, row, replayPlayerId) {
  return "";
}

function renderFindings(report, row = {}, replayPlayerId = "") {
  const findings = buildDisplayProblemEntries(report);
  if (!findings.length) {
    return renderReportFailureDiagnosticsSection(report);
  }

  const screenshotIndexMap = buildEvidenceIndexMap(report, "screenshot");
  return `
    <section class="report-findings-ledger" id="section-findings">
      <div class="report-section-head">
        <h3>Problems</h3>
        <p>${escapeHtml(String(findings.length))} problem${findings.length === 1 ? "" : "s"}, ordered from biggest to smallest.</p>
      </div>
      <div class="finding-ledger-list">
        ${findings
        .map(
          (finding, findingIndex) => {
            const emotion = getEmotionVisual(finding?.emotional_reaction?.primary);
            const emotionIntensity = Math.max(0, Number(finding?.emotional_reaction?.intensity) || 0);
            const typeLabel = formatFindingTypeLabel(finding?.type);
            const severity = normalizeSeverity(finding?.severity);
            const priorityScore = getDisplayProblemPriorityScore(finding);
            const recommendation = deriveFindingRecommendation(report, finding, findingIndex);
            const proofModel = buildFindingProofModel(report, finding, { maxItems: 1 });
            const proofToneClass = getFindingIssueToneClass(finding);
            const journeyLabel = getFindingJourneyLabel(finding);
            const confidencePct = toConfidencePercent(finding?.confidence);
            const findingAnchorId = `finding-${toAnchorToken(finding?.id || finding?.title || `finding-${findingIndex + 1}`)}`;
            const findingFrameIndex = findFirstEvidenceIndex(finding?.evidence?.screenshots || [], screenshotIndexMap);
            const modalDataAttributes = buildFindingModalDataAttributes(finding, findingIndex);
            const llmCopyMarkup = renderLlmCopyButtons("finding", {
              findingIndex,
              findingToken: buildFindingModalToken(finding, findingIndex)
            });
            return `
              <article class="finding-ledger-item" id="${escapeHtml(findingAnchorId)}">
                <div class="finding-ledger-head">
                  <div class="finding-ledger-heading">
                    <h4>${escapeHtml(finding.title || finding.id || `Finding ${findingIndex + 1}`)}</h4>
                    <p class="finding-ledger-meta">
                      ${escapeHtml(typeLabel)} · ${escapeHtml(journeyLabel)} · Priority ${escapeHtml(String(priorityScore))}/100
                    </p>
                  </div>
                  <div class="finding-ledger-badges">
                    <span class="issue-severity ${escapeHtml(`severity-${severity}`)}">${escapeHtml(severity.toUpperCase())}</span>
                    <span class="app-inline-pill ${escapeHtml(`tone-${proofToneClass}`)}">${escapeHtml(proofModel.label)}</span>
                  </div>
                </div>
                <div class="finding-ledger-body">
                  ${renderFindingProofCard(report, finding, finding?.title || finding?.id || "Finding", {
                    maxItems: 1,
                    toneClass: proofToneClass,
                    replayFrame: findingFrameIndex,
                    replayTarget: replayPlayerId
                  })}
                  <div class="finding-ledger-state">
                    <div class="finding-ledger-stat">
                      <span>Tester felt</span>
                      <strong>${escapeHtml(`${emotion.emoji} ${emotion.label}`)}</strong>
                      <small>${escapeHtml(`${emotionIntensity}/5`)}</small>
                    </div>
                    <div class="finding-ledger-stat">
                      <span>How sure we are</span>
                      <strong>${escapeHtml(`${confidencePct}%`)}</strong>
                      <small>${escapeHtml(
                        proofModel.state === "verified"
                          ? proofModel.primaryAsset?.kind === "video"
                            ? "Video saved"
                            : "Picture saved"
                          : proofModel.state === "fallback"
                            ? proofModel.primaryAsset?.kind === "video"
                              ? "Using a test video"
                              : "Using a test picture"
                            : "No proof saved"
                      )}</small>
                    </div>
                    <div class="finding-ledger-stat">
                      <span>Part of the test</span>
                      <strong>${escapeHtml(journeyLabel)}</strong>
                      <small>${escapeHtml(typeLabel)}</small>
                    </div>
                  </div>
                  <div class="finding-ledger-compare">
                    <section class="finding-ledger-copy">
                      <span class="finding-section-label">Should have happened</span>
                      <p>${escapeHtml(finding.expected_behavior || "We did not save this part.")}</p>
                    </section>
                    <section class="finding-ledger-copy finding-ledger-copy-observed">
                      <span class="finding-section-label">What happened</span>
                      <p>${escapeHtml(simplifyReportNarrative(finding.observed_behavior || "We did not save this part."))}</p>
                    </section>
                  </div>
                  <div class="finding-ledger-copy">
                    <span class="finding-section-label">Fix idea</span>
                    <p>${escapeHtml(recommendation)}</p>
                  </div>
                  <div class="finding-ledger-actions">
                    ${llmCopyMarkup}
                    <button type="button" ${modalDataAttributes}>More</button>
                  </div>
                </div>
              </article>
            `;
          }
        )
        .join("")}
      </div>
    </section>
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
    : "<p>No parts of the site were opened.</p>";

  const blockedMarkup = blockedFeatures.length
    ? `<ul>${blockedFeatures
        .map((feature) => `<li>${escapeHtml(feature?.label || "Feature")} · ${escapeHtml(feature?.reason || "blocked")}</li>`)
        .join("")}</ul>`
    : "<p>No blocked parts were saved.</p>";

  return `
    <div class="section-block">
      <h3>Parts checked</h3>
      <p>Seen: ${escapeHtml(String(discovered))} · Tried: ${escapeHtml(String(attempted))} · Opened: ${escapeHtml(
        String(visited)
      )} · Blocked: ${escapeHtml(String(blocked))}</p>
      <h4>Opened parts</h4>
      ${visitedMarkup}
      <h4>Blocked parts</h4>
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
  if (normalized === "ERR_NAME_NOT_RESOLVED" || normalized === "NET::ERR_NAME_NOT_RESOLVED") {
    return "The target URL could not be reached.";
  }
  if (normalized === "ERR_CONNECTION_REFUSED" || normalized === "NET::ERR_CONNECTION_REFUSED") {
    return "The target site refused the connection.";
  }
  if (normalized === "ERR_CONNECTION_TIMED_OUT" || normalized === "NET::ERR_CONNECTION_TIMED_OUT") {
    return "The target site did not respond in time.";
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

function cleanAutomationErrorText(value) {
  return String(value || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\b(?:page\.goto|locator\.[a-z]+|page\.waitFor[a-zA-Z]+)\s*:\s*/gi, "")
    .replace(/\bCall log\s*:[\s\S]*$/i, "")
    .replace(/,\s*waiting until\s*["'][^"']+["']/gi, "")
    .replace(/\bwaiting until\s*["'][^"']+["']/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeFailureExcerpt(message, options = {}) {
  const cleaned = cleanAutomationErrorText(message);
  if (!cleaned) {
    return "";
  }

  const lowered = cleaned.toLowerCase();
  if (/err_name_not_resolved|name[_\s-]*not[_\s-]*resolved/.test(lowered)) {
    return "The target URL could not be opened because the host name did not resolve. Check that the URL is complete and publicly reachable.";
  }
  if (/err_connection_refused|connection refused/.test(lowered)) {
    return "The target site refused the connection before the run could continue.";
  }
  if (/err_connection_timed_out|timed out/.test(lowered)) {
    return "The target site did not respond before the navigation timeout.";
  }
  if (/no visible login\/sign up trigger found/.test(lowered)) {
    return "The worker reached the landing page but could not find a visible way into login or sign-up.";
  }
  if (/intercepts pointer events|role=\"dialog\"/.test(lowered)) {
    return "A blocking dialog covered the page and prevented the next action.";
  }
  if (/otp/.test(lowered) && /not found|missing|blocked/.test(lowered)) {
    return "The run was blocked before it could complete OTP verification.";
  }
  if (/navigation/.test(lowered) && /https?:\/\//.test(lowered)) {
    return "The run could not open the target page.";
  }

  const maxLength = Math.max(80, Number(options.maxLength) || 220);
  return truncateText(cleaned, maxLength);
}

function humanizeFailureClassification(classification) {
  const value = String(classification || "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  if (value === "failed_pre_submit") {
    return "The run failed before it could enter the requested flow.";
  }
  if (value === "navigation_failed") {
    return "The run failed while trying to open the target page.";
  }
  return value
    .replaceAll("_", " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function extractRunFailureContext(report, liveStatus) {
  const safeReport = report && typeof report === "object" ? report : {};
  const metadata = safeReport.metadata && typeof safeReport.metadata === "object" ? safeReport.metadata : {};
  const diagnostics =
    safeReport.failure_diagnostics && typeof safeReport.failure_diagnostics === "object"
      ? safeReport.failure_diagnostics
      : {};
  const failureEvent = getLatestRunLogEvent(liveStatus, "run_failed");
  const errorCode = String(failureEvent?.data?.error || metadata.failure_code || "").trim();
  const classification = String(failureEvent?.data?.classification || metadata.classification || "").trim();
  const rawExcerpt = String(metadata.raw_agent_output_excerpt || "").trim();
  const summaryNote = String(safeReport.summary?.note || "").trim();
  const excerpt = humanizeFailureExcerpt(rawExcerpt);

  let headline = humanizeFailureCode(errorCode);
  let detail = "";

  if (errorCode === "LOGIN_TRIGGER_NOT_FOUND") {
    detail =
      "The worker reached the landing page, dismissed overlays, and still could not find a visible path into login or sign-up.";
  } else if (rawExcerpt && /no visible login\/sign up trigger found/i.test(rawExcerpt)) {
    headline = "No login or sign-up entry point was found.";
    detail =
      "The worker reached the landing page but no visible authentication trigger was exposed strongly enough to continue.";
  } else if (summaryNote && /run_failed_pre_submit/i.test(summaryNote)) {
    headline = headline || "Run ended before signup or login could begin.";
    detail = detail || "The worker could not enter the target authenticated flow from the public landing experience.";
  }

  if (!headline) {
    headline =
      humanizeFailureClassification(classification) ||
      humanizeFailureExcerpt(rawExcerpt, { maxLength: 120 }) ||
      "Run ended before the requested flow could complete.";
  }
  if (!detail) {
    detail =
      String(diagnostics.failure_reason || diagnostics.current_state || "").trim() ||
      excerpt ||
      humanizeFailureExcerpt(summaryNote) ||
      "The worker stopped before it could validate the target flow end to end.";
  }

  return {
    errorCode,
    classification,
    excerpt: rawExcerpt,
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

function getFindingIssueToneClass(finding) {
  const safeFinding = finding && typeof finding === "object" ? finding : {};
  const severity = normalizeSeverity(safeFinding?.severity);
  const type = String(safeFinding?.type || "").trim().toLowerCase();
  const problemSource = String(safeFinding?._problemSource || "").trim().toLowerCase();
  const timelineLevel = String(safeFinding?._timelineLevel || "").trim().toLowerCase();

  if (type === "dead_end" || timelineLevel === "blocker") {
    return "severity-critical";
  }
  if (severity === "critical") {
    return "severity-critical";
  }
  if (type === "bug" && (severity === "high" || severity === "critical")) {
    return "severity-critical";
  }
  if (type === "frustration_point" || timelineLevel === "friction" || problemSource === "experience_timeline") {
    return "severity-high";
  }
  if (severity === "high") {
    return "severity-high";
  }
  if (type === "confusion_point" || severity === "medium") {
    return "severity-medium";
  }
  return "severity-low";
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
      ? "Run your first test to see if this is ready to ship."
      : "Run your first test to see how this site is doing.";
  }
  if (mode === "failed") {
    return releaseLens
      ? "The test failed before it finished. Run it again before you decide to ship."
      : "The test failed before it finished. Run it again before you trust this result.";
  }
  if (mode === "partial") {
    return "The test only finished part of the job. Treat this as a clue, not a final answer.";
  }
  if (mode === "running") {
    return `${snapshot.criticalCount} big problem${snapshot.criticalCount === 1 ? "" : "s"} seen so far. This may change before the test ends.`;
  }
  if (verdict === "blocked") {
    return releaseLens
      ? `${snapshot.criticalCount} big problem${snapshot.criticalCount === 1 ? "" : "s"} and ${snapshot.brokenJourneys} broken part${snapshot.brokenJourneys === 1 ? "" : "s"} need fixes before shipping.`
      : `${snapshot.criticalCount} big problem${snapshot.criticalCount === 1 ? "" : "s"} hit ${snapshot.brokenJourneys} part${snapshot.brokenJourneys === 1 ? "" : "s"} of the site.`;
  }
  if (verdict === "risky") {
    return releaseLens
      ? "The test finished, but it still found problems worth fixing before shipping."
      : "The test finished, but it still found problems worth fixing.";
  }
  return releaseLens ? "This test did not show any big shipping blockers." : "This test did not show any big problems.";
}

function buildRunningSummaryMessage(liveStatus, row, snapshot) {
  const queueExperience = buildQueueExperience(liveStatus, row);
  if (queueExperience.queueStatus === "queued" || queueExperience.queueStatus === "retryable") {
    const etaCopy =
      queueExperience.estimatedStartSeconds && queueExperience.estimatedStartSeconds > 0
        ? `It should start around ${queueExperience.etaLabel}.`
        : "We will show the start time when the queue is clearer.";
    return `${queueExperience.headline} ${queueExperience.detail} ${etaCopy}`.trim();
  }
  const screenshotCount = Array.isArray(liveStatus?.artifacts?.local_screenshots) ? liveStatus.artifacts.local_screenshots.length : 0;
  if (screenshotCount > 0) {
    return `The tester is live. ${screenshotCount} picture${screenshotCount === 1 ? "" : "s"} saved so far.`;
  }
  if (snapshot.criticalCount > 0) {
    return `${snapshot.criticalCount} big problem${snapshot.criticalCount === 1 ? "" : "s"} seen so far. This may change before the test ends.`;
  }
  return "The test is running now. Problems, notes, and pictures will show up as the tester moves through the site.";
}

function buildHeroMetricModel(mode, report, snapshot, liveStatus = null, row = null) {
  if (mode === "running") {
    const queueExperience = buildQueueExperience(liveStatus, row);
    const queueStatus = queueExperience.queueStatus;
    const pagesVisited = buildCoverageSnapshot(report).pagesVisited;
    if (queueStatus === "queued" || queueStatus === "retryable") {
      return [
        { label: "Status", value: queueStatus === "retryable" ? "Retrying" : "Queued" },
        { label: "Tests ahead", value: queueExperience.queueAhead === null ? "—" : String(queueExperience.queueAhead) },
        { label: "Wait time", value: queueExperience.queueAgeLabel },
        { label: "Starts around", value: queueExperience.etaLabel }
      ];
    }

    const findingsCount = Array.isArray(report?.findings) ? report.findings.length : 0;
    const journeysCount = Array.isArray(report?.tested_journeys) ? report.tested_journeys.length : 0;
    return [
      { label: "Big problems", value: String(snapshot.criticalCount) },
      { label: "Problems so far", value: String(findingsCount) },
      { label: "Things tried", value: String(journeysCount) },
      { label: "Pages opened", value: String(pagesVisited) }
    ];
  }

  const coverage = buildCoverageSnapshot(report);
  if (mode === "failed") {
    return [
      { label: "Big problems", value: String(snapshot.criticalCount) },
      { label: "Problems saved", value: String(coverage.findingsCount) },
      { label: "Things tried", value: String(coverage.attemptedJourneys) },
      { label: "Pages opened", value: String(coverage.pagesVisited) }
    ];
  }

  if (mode === "partial") {
    const coveredJourneys = coverage.completedJourneys + coverage.partialJourneys;
    const coverageValue = coverage.attemptedJourneys ? `${coveredJourneys}/${coverage.attemptedJourneys}` : "0/0";
    return [
      { label: "Big problems", value: String(snapshot.criticalCount) },
      { label: "Other problems", value: String(snapshot.majorCount) },
      { label: "Things finished", value: coverageValue },
      { label: "Test score", value: `${snapshot.avgSatisfaction}/100` }
    ];
  }

  return [
    { label: "Big problems", value: String(snapshot.criticalCount) },
    { label: "Other problems", value: String(snapshot.majorCount) },
    { label: "Things blocked", value: String(snapshot.brokenJourneys) },
    { label: "Test score", value: `${snapshot.avgSatisfaction}/100` }
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
      const proofModel = buildFindingProofModel(report, finding, { maxItems: 1 });
      const proofToneClass = getFindingIssueToneClass(finding);
      const screenshotMarkup = renderEvidenceThumbnails(
        report,
        finding?.evidence?.screenshots || [],
        finding?.title || "Finding",
        finding?.observed_behavior || finding?.title || "",
        { maxItems: 1, showCaption: false, compact: true }
      );
      const replayFrame = findFirstEvidenceIndex(finding?.evidence?.screenshots || [], screenshotIndexMap);
      const hasProof = Boolean(proofModel.primaryAsset);
      const compactProofMarkup =
        proofModel.primaryAsset?.kind === "video"
          ? `<div class="finding-proof-media"><video src="${escapeHtml(
              proofModel.primaryAsset.url
            )}" controls preload="metadata" playsinline></video></div>`
          : hasProof
            ? screenshotMarkup
            : "";
      const priorityScore = computeFindingPriorityScore(finding);
      const modalDataAttributes = buildFindingModalDataAttributes(finding, index);
      const llmCopyMarkup = renderLlmCopyButtons("finding", {
        findingIndex: index,
        findingToken: buildFindingModalToken(finding, index)
      });

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
            ${
              hasProof
                ? `<span class="app-inline-pill ${escapeHtml(`tone-${proofToneClass}`)}">${escapeHtml(proofModel.label)}</span>`
                : `<span class="app-inline-pill ${escapeHtml(`tone-${proofToneClass}`)}">Proof Missing</span>`
            }
            ${Number.isInteger(replayFrame) && replayFrame >= 0 ? `<span class="app-inline-pill">Replay ${escapeHtml(String(replayFrame + 1))}</span>` : ""}
            ${llmCopyMarkup}
            <button type="button" ${modalDataAttributes}>Details</button>
            ${findingUrl ? `<a href="${escapeHtml(findingUrl)}" target="_blank" rel="noreferrer">Open Finding</a>` : ""}
            ${findingUrl ? `<button type="button" class="share-link-button" data-share-url="${escapeHtml(findingUrl)}">Copy Link</button>` : ""}
          </div>
          ${compactProofMarkup}
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

  const runId = String(report?.run_id || row?.run_id || "").trim();
  if (!runId || !canManageReportSharing()) {
    elements.dashboardShareAction.hidden = true;
    elements.dashboardShareAction.removeAttribute("data-team-share-run");
    return;
  }

  elements.dashboardShareAction.hidden = false;
  elements.dashboardShareAction.setAttribute("data-team-share-run", runId);
  elements.dashboardShareAction.setAttribute("aria-label", "Share with team");
  elements.dashboardShareAction.setAttribute("title", "Share with team");
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
      .map((finding, index) => {
        const severity = normalizeSeverity(finding?.severity);
        const title = finding?.title || finding?.observed_behavior || finding?.id || "Untitled finding";
        const confidencePct = toConfidencePercent(finding?.confidence);
        const modalDataAttributes = buildFindingModalDataAttributes(finding, index);
        return `
          <button type="button" class="app-issue-item app-issue-item-button" ${modalDataAttributes}>
            <span class="issue-severity ${escapeHtml(`severity-${severity}`)}">${escapeHtml(severity.toUpperCase())}</span>
            <div class="issue-copy">
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(getFindingJourneyLabel(finding))} · confidence ${escapeHtml(String(confidencePct))}% · ${escapeHtml(
                formatRelativeTime(row?.delivered_at)
              )}</span>
              <small class="issue-action-hint">View evidence and screenshots</small>
            </div>
          </button>
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
    const detail =
      humanizeFailureCode(data?.error) ||
      humanizeFailureExcerpt(data?.message || data?.reason || "") ||
      humanizeFailureClassification(data?.classification);
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

  const caption =
    Number.isFinite(latestScreenshotIndex) && latestScreenshotIndex >= 0
      ? `Latest browser frame · ${String(latestScreenshotIndex + 1)}`
      : "Latest browser frame";

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
        <small data-live-browser-preview-caption="true">${escapeHtml(caption)}</small>
      </a>
    </div>
  `;
}

function resolveLiveBrowserFramePreview(runId, liveStatus, report = null) {
  const liveArtifacts = liveStatus && typeof liveStatus.artifacts === "object" ? liveStatus.artifacts : null;
  const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
  const liveScreenshots = Array.isArray(liveArtifacts?.local_screenshots) ? liveArtifacts.local_screenshots : [];
  const latestScreenshotIndex = liveScreenshots.length ? liveScreenshots.length - 1 : -1;
  if (latestScreenshotIndex >= 0 && runId) {
    return {
      latestScreenshotIndex,
      latestScreenshotUrl: `${buildEvidenceAssetUrl(runId, "screenshot", latestScreenshotIndex)}&live_tick=${encodeURIComponent(
        progress?.updated_at || Date.now()
      )}`
    };
  }

  const liveLatestFrameUrl =
    liveStatus && liveStatus.live_report && typeof liveStatus.live_report === "object"
      ? String(liveStatus.live_report.latest_frame_url || "").trim()
      : "";
  if (liveLatestFrameUrl) {
    return {
      latestScreenshotIndex: -1,
      latestScreenshotUrl: liveLatestFrameUrl
    };
  }

  const reportScreenshots =
    report && report.evidence_gallery && typeof report.evidence_gallery === "object" && Array.isArray(report.evidence_gallery.screenshots)
      ? report.evidence_gallery.screenshots
      : [];
  const fallbackUrl = String(reportScreenshots.slice(-1)[0] || "").trim();
  return {
    latestScreenshotIndex: -1,
    latestScreenshotUrl: fallbackUrl
  };
}

function renderLiveStream(runId, liveStatus, report = null, row = null) {
  const queueStatus = String(liveStatus?.queue?.queue_status || liveStatus?.queue?.status || row?.queue_status || row?.status || "").toLowerCase();
  if (!isQueueActiveStatus(queueStatus) && !isLiveViewMode()) {
    return '<div class="app-empty"><p>Live stream appears while a run is processing.</p></div>';
  }

  const progress = liveStatus && typeof liveStatus.progress === "object" ? liveStatus.progress : null;
  const liveArtifacts = liveStatus && typeof liveStatus.artifacts === "object" ? liveStatus.artifacts : null;
  const liveSessionEmbedUrl = String(liveArtifacts?.live_stream_embed_url || "").trim();
  const liveSessionViewerUrl = String(liveArtifacts?.live_stream_viewer_url || liveSessionEmbedUrl || "").trim();
  const liveSessionViewerIsViewOnly = isViewOnlyNoVncUrl(liveSessionViewerUrl);
  const { latestScreenshotIndex, latestScreenshotUrl } = resolveLiveBrowserFramePreview(runId, liveStatus, report);
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
            dashboardDebugEnabled && (terminal.failure.errorCode || terminal.failure.classification)
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
  const { latestScreenshotIndex, latestScreenshotUrl } = resolveLiveBrowserFramePreview(runId, liveStatus, report);
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
  dashboardPanels.renderRecentRunsTable(
    {
      elements,
      runs: state.runs,
      selectedRunId: state.selectedRunId
    },
    {
      getLiveStatus,
      getCanonicalRunStatus,
      formatStatusLabel,
      statusBadgeClass,
      estimateRunSatisfaction,
      formatRunDuration,
      buildReportShareUrl,
      escapeHtml
    }
  );
}

function attachShareButtons(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const genericCopyButtons = Array.from(host.querySelectorAll("[data-copy-text]"));
  for (const button of genericCopyButtons) {
    if (button.getAttribute("data-copy-bound") === "1") {
      continue;
    }
    button.setAttribute("data-copy-bound", "1");

    button.addEventListener("click", async () => {
      const text = String(button.getAttribute("data-copy-text") || "").trim();
      if (!text) {
        return;
      }

      const baselineLabel = String(button.getAttribute("data-label") || button.textContent || "Copy").trim() || "Copy";
      button.disabled = true;
      button.textContent = "Copying...";
      const ok = await copyTextToClipboard(text);
      button.textContent = ok ? "Copied" : "Copy failed";
      showReportToast(ok ? "Copied" : "Copy failed", ok ? "success" : "error");
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = baselineLabel;
      }, 1500);
    });
  }

  const buttons = Array.from(host.querySelectorAll("[data-share-url]"));
  for (const button of buttons) {
    if (button.getAttribute("data-bound") === "1") {
      continue;
    }
    button.setAttribute("data-bound", "1");

    button.addEventListener("click", async () => {
      const shareUrl = String(button.getAttribute("data-share-url") || "").trim();
      const baselineLabel = String(
        button.getAttribute("data-label") ||
          button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.textContent ||
          "Copy share link"
      ).trim();
      const isIconButton = button.getAttribute("data-icon-button") === "1";
      const shouldShowToast = button.getAttribute("data-show-toast") === "1";
      if (!button.getAttribute("data-label")) {
        button.setAttribute("data-label", baselineLabel);
      }

      const ok = await copyTextToClipboard(shareUrl);
      if (shouldShowToast) {
        showReportToast(ok ? "Link copied" : "Copy failed", ok ? "success" : "error");
      }
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

  const teamShareButtons = Array.from(host.querySelectorAll("[data-team-share-run]"));
  for (const button of teamShareButtons) {
    if (button.getAttribute("data-team-share-bound") === "1") {
      continue;
    }
    button.setAttribute("data-team-share-bound", "1");

    button.addEventListener("click", async () => {
      const runId = String(button.getAttribute("data-team-share-run") || "").trim();
      if (!runId) {
        return;
      }

      const baselineLabel = String(button.textContent || button.getAttribute("aria-label") || "Share with team").trim() || "Share with team";
      const isIconButton = button.classList.contains("app-icon-button");
      const previousText = button.textContent;
      button.disabled = true;
      if (!isIconButton) {
        button.textContent = "Creating link...";
      }

      try {
        const payload = await requestSharedReportLink(runId);
        const shareUrl = String(payload.share_url || "").trim();
        if (!shareUrl) {
          throw new Error("Shared link was not returned.");
        }
        const ok = await copyTextToClipboard(shareUrl);
        if (!ok) {
          throw new Error("Copy failed");
        }
        if (isIconButton) {
          button.classList.add("is-copied");
          button.setAttribute("aria-label", "Shared link copied");
          button.setAttribute("title", "Shared link copied");
        } else {
          button.textContent = "Shared link copied";
        }
        showReportToast("Shared link copied", "success");
      } catch (error) {
        if (isIconButton) {
          button.classList.add("is-error");
          button.setAttribute("aria-label", "Share failed");
          button.setAttribute("title", "Share failed");
        } else {
          button.textContent = "Share failed";
        }
        showReportToast(error?.message || "Share failed", "error");
      }

      window.setTimeout(() => {
        button.disabled = false;
        button.classList.remove("is-copied", "is-error");
        button.setAttribute("aria-label", baselineLabel);
        button.setAttribute("title", baselineLabel);
        if (!isIconButton) {
          button.textContent = previousText || baselineLabel;
        }
      }, 1600);
    });
  }

  const redeemButtons = Array.from(host.querySelectorAll("[data-redeem-promo-code]"));
  for (const button of redeemButtons) {
    if (button.getAttribute("data-redeem-bound") === "1") {
      continue;
    }
    button.setAttribute("data-redeem-bound", "1");

    button.addEventListener("click", async () => {
      const code = String(button.getAttribute("data-redeem-promo-code") || "").trim();
      const redeemUrl = String(button.getAttribute("data-redeem-url") || "").trim();
      const shareRunId = String(button.getAttribute("data-redeem-share-run") || "").trim();
      const baselineLabel = String(button.getAttribute("data-label") || button.textContent || "Redeem team offer").trim() || "Redeem team offer";
      if (!code) {
        return;
      }

      if (!isDashboardAuthorized()) {
        window.location.href = redeemUrl || buildPromoRedeemUrl(code, { shareRunId });
        return;
      }

      button.disabled = true;
      button.textContent = "Opening offer...";
      try {
        const checkout = await requestShareOfferCheckout(code, shareRunId);
        if (checkout.ok && checkout.checkoutUrl) {
          window.location.href = checkout.checkoutUrl;
          return;
        }

        button.textContent = "Redeeming...";
        const payload = await requestPromoRedemption(code, shareRunId);
        if (window.SwarmAuth && typeof window.SwarmAuth.setUser === "function" && payload.user) {
          window.SwarmAuth.setUser(payload.user);
        }
        button.textContent = "Offer redeemed";
        button.setAttribute("data-label", "Offer redeemed");
        showReportToast(
          payload.already_redeemed ? "This team code is already on your account." : "Team offer redeemed",
          "success"
        );
      } catch (error) {
        button.disabled = false;
        button.textContent = baselineLabel;
        showReportToast(error?.message || "Could not redeem team code", "error");
      }
    });
  }
}

function renderAppPanels(report, row, liveStatus = null) {
  dashboardPanels.renderAppPanels(
    {
      hasAppDashboardUi,
      elements,
      report,
      row,
      liveStatus,
      runs: state.runs,
      selectedRunId: state.selectedRunId
    },
    {
      deriveDashboardMode,
      computeRiskSnapshot,
      deriveRiskVerdict,
      getActiveEnvironment,
      getEnvironmentLabel,
      isReleaseReadinessEnvironment,
      getCanonicalRunStatus,
      isQueueActiveStatus,
      isLiveViewMode,
      resolveRunMission,
      buildLiveVerdictMeta,
      buildVerdictMeta,
      buildHeroMetricModel,
      buildRunningSummaryMessage,
      extractRunFailureContext,
      buildRiskSummaryMessage,
      buildTargetLabelFromUrl,
      buildDashboardMissionModel,
      normalizeScopeModeInput,
      formatRelativeTime,
      formatStatusLabel,
      escapeHtml,
      applyDashboardShareAction,
      renderAppEvidencePanel,
      renderTopFixes,
      attachShareButtons,
      renderPersonaSignals,
      renderAppProgress,
      renderRegressionSignals,
      buildQueueExperience,
      buildLiveTerminalSummary,
      updateLiveStreamPanel,
      renderLiveIncomingFindings,
      renderLiveActivityFeed,
      renderRecentRunsTable
    }
  );
}

function renderAppRunPicker() {
  ensureSelectedRunVisibleInRuns();
  dashboardPanels.renderAppRunPicker(
    {
      hasAppDashboardUi,
      elements,
      runs: state.runs,
      selectedRunId: state.selectedRunId
    },
    {
      getLiveStatus,
      getCanonicalRunStatus,
      escapeHtml
    }
  );
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

function attachExperienceTimelinePlayers(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const players = Array.from(host.querySelectorAll("[data-experience-timeline-player]"));
  for (const player of players) {
    if (player.getAttribute("data-bound") === "1") {
      continue;
    }

    const video = player.querySelector("[data-experience-video]");
    const playhead = player.querySelector("[data-experience-playhead]");
    const panelDeck = player.querySelector(".experience-timeline-list");
    const jumpTargets = Array.from(player.querySelectorAll("[data-experience-jump-ms]"));
    const trackSpans = Array.from(player.querySelectorAll("[data-experience-span-id]"));
    const panels = Array.from(player.querySelectorAll("[data-experience-span-panel]"));
    if (!(video instanceof HTMLVideoElement)) {
      continue;
    }

    const timelineDurationMs = Math.max(1, Math.round(Number(player.getAttribute("data-experience-duration-ms")) || 0));
    let currentActiveId = "";
    let promotedId = "";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const getVideoDurationMs = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        return Math.round(video.duration * 1000);
      }
      return timelineDurationMs;
    };

    const videoMsToTimelineMs = (value) => {
      const videoDurationMs = Math.max(1, getVideoDurationMs());
      const currentVideoMs = Math.max(0, Math.round(Number(value) || 0));
      if (!timelineDurationMs || timelineDurationMs === videoDurationMs) {
        return currentVideoMs;
      }
      return Math.max(0, Math.round((currentVideoMs / videoDurationMs) * timelineDurationMs));
    };

    const timelineMsToVideoMs = (value) => {
      const safeTimelineMs = Math.max(0, Math.round(Number(value) || 0));
      const videoDurationMs = Math.max(1, getVideoDurationMs());
      if (!timelineDurationMs || timelineDurationMs === videoDurationMs) {
        return safeTimelineMs;
      }
      return Math.max(0, Math.round((safeTimelineMs / timelineDurationMs) * videoDurationMs));
    };

    const promoteActivePanel = (activeId, options = {}) => {
      const normalizedId = String(activeId || "").trim();
      const shouldAnimate = options.animate !== false && !reduceMotion.matches;
      if (!normalizedId || !(panelDeck instanceof HTMLElement) || promotedId === normalizedId) {
        return;
      }

      const activePanel = panels.find(
        (element) => String(element.getAttribute("data-experience-span-panel") || "").trim() === normalizedId
      );
      if (!(activePanel instanceof HTMLElement)) {
        return;
      }

      if (panelDeck.firstElementChild === activePanel) {
        promotedId = normalizedId;
        return;
      }

      const beforeRects = shouldAnimate
        ? new Map(panels.map((element) => [element, element.getBoundingClientRect()]))
        : null;

      panelDeck.prepend(activePanel);
      promotedId = normalizedId;

      if (!shouldAnimate || !(beforeRects instanceof Map)) {
        return;
      }

      for (const element of panels) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const before = beforeRects.get(element);
        const after = element.getBoundingClientRect();
        if (!before || !after) {
          continue;
        }
        const deltaY = before.top - after.top;
        if (Math.abs(deltaY) < 1) {
          continue;
        }
        element.animate(
          [
            {
              transform: `${element === activePanel ? "scale(0.985) " : ""}translateY(${deltaY}px)`,
              opacity: element === activePanel ? 0.92 : 0.82
            },
            {
              transform: "translateY(0)",
              opacity: 1
            }
          ],
          {
            duration: element === activePanel ? 440 : 380,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both"
          }
        );
      }
    };

    const resolveActiveSpanId = (currentTimelineMs) => {
      const safeTimelineMs = Math.max(0, Math.round(Number(currentTimelineMs) || 0));
      for (let index = 0; index < trackSpans.length; index += 1) {
        const element = trackSpans[index];
        const startMs = Math.max(0, Math.round(Number(element.getAttribute("data-experience-start-ms")) || 0));
        const endMs = Math.max(startMs, Math.round(Number(element.getAttribute("data-experience-end-ms")) || startMs));
        const isLast = index === trackSpans.length - 1;
        const isWithinSpan =
          safeTimelineMs >= startMs && (isLast ? safeTimelineMs <= endMs : safeTimelineMs < endMs);
        if (isWithinSpan) {
          return String(element.getAttribute("data-experience-span-id") || "").trim();
        }
      }

      let bestElement = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const element of trackSpans) {
        const startMs = Math.max(0, Math.round(Number(element.getAttribute("data-experience-start-ms")) || 0));
        const distance = Math.abs(startMs - safeTimelineMs);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestElement = element;
        }
      }
      return String(bestElement?.getAttribute("data-experience-span-id") || "").trim();
    };

    const setActiveSpan = (activeId) => {
      const normalizedId = String(activeId || "").trim();
      for (const element of trackSpans) {
        const spanId = String(element.getAttribute("data-experience-span-id") || "").trim();
        element.classList.toggle("is-active", Boolean(normalizedId) && spanId === normalizedId);
      }
      for (const element of panels) {
        const spanId = String(element.getAttribute("data-experience-span-panel") || "").trim();
        element.classList.toggle("is-active", Boolean(normalizedId) && spanId === normalizedId);
      }
      if (normalizedId && normalizedId !== currentActiveId) {
        promoteActivePanel(normalizedId, { animate: currentActiveId !== "" });
      }
      currentActiveId = normalizedId;
    };

    const syncPlayhead = () => {
      const currentVideoMs = Math.max(0, Math.round((Number(video.currentTime) || 0) * 1000));
      const currentTimelineMs = videoMsToTimelineMs(currentVideoMs);
      if (playhead && timelineDurationMs > 0) {
        const progress = Math.max(0, Math.min(100, (currentTimelineMs / timelineDurationMs) * 100));
        playhead.style.left = `${progress}%`;
      }

      const activeId = resolveActiveSpanId(currentTimelineMs);
      setActiveSpan(activeId);
    };

    for (const trigger of jumpTargets) {
      if (trigger.getAttribute("data-bound") === "1") {
        continue;
      }
      trigger.setAttribute("data-bound", "1");
      trigger.addEventListener("click", () => {
        const jumpTimelineMs = Math.max(0, Math.round(Number(trigger.getAttribute("data-experience-jump-ms")) || 0));
        const clickedSpanId = String(trigger.getAttribute("data-experience-span-id") || "").trim();
        const jumpVideoMs = timelineMsToVideoMs(jumpTimelineMs);
        if (clickedSpanId) {
          setActiveSpan(clickedSpanId);
        } else {
          setActiveSpan(resolveActiveSpanId(jumpTimelineMs));
        }
        video.currentTime = jumpVideoMs / 1000;
        video.scrollIntoView({ behavior: "smooth", block: "nearest" });
        window.requestAnimationFrame(syncPlayhead);
      });
    }

    video.addEventListener("loadedmetadata", syncPlayhead);
    video.addEventListener("loadeddata", syncPlayhead);
    video.addEventListener("seeking", syncPlayhead);
    video.addEventListener("timeupdate", syncPlayhead);
    video.addEventListener("seeked", syncPlayhead);
    video.addEventListener("pause", syncPlayhead);
    video.addEventListener("play", syncPlayhead);

    player.setAttribute("data-bound", "1");
    window.requestAnimationFrame(syncPlayhead);
  }
}

function attachJourneyStepProofVideos(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const videos = Array.from(host.querySelectorAll("[data-step-proof-video]"));
  for (const video of videos) {
    if (!(video instanceof HTMLVideoElement) || video.getAttribute("data-bound") === "1") {
      continue;
    }

    const useFragmentedClipSource = video.getAttribute("data-step-proof-fragmented") === "1";
    const jumpTimelineMs = Math.max(0, Math.round(Number(video.getAttribute("data-step-jump-ms")) || 0));
    const clipStartTimelineMs = Math.max(
      0,
      Math.round(Number(video.getAttribute("data-step-clip-start-ms")) || jumpTimelineMs)
    );
    const clipEndTimelineMs = Math.max(
      clipStartTimelineMs + 1800,
      Math.round(Number(video.getAttribute("data-step-clip-end-ms")) || clipStartTimelineMs + 4000)
    );
    const proofBaselineMs = Math.max(0, Math.round(Number(video.getAttribute("data-step-proof-baseline-ms")) || 0));
    const timelineDurationMs = Math.max(1, Math.round(Number(video.getAttribute("data-step-timeline-duration-ms")) || 0));
    let settleRafId = 0;
    let seekAttempts = 0;
    let seekSettled = false;

    const mapTimelineMsToVideoSeconds = (timelineMs) => {
      if (useFragmentedClipSource) {
        const relativeMs = Math.max(0, Math.round(Number(timelineMs) || 0) - clipStartTimelineMs);
        const rawTargetSeconds = Math.max(0, relativeMs / 1000);
        const maxSeekableSeconds =
          Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.05) : rawTargetSeconds;
        return Math.max(0, Math.min(rawTargetSeconds, maxSeekableSeconds));
      }

      const videoDurationMs =
        Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : timelineDurationMs;
      const treatAsTrimmedClip =
        proofBaselineMs > 0 && timelineDurationMs > 0 && videoDurationMs > 0 && videoDurationMs + 1500 < timelineDurationMs;
      const mappedVideoMs = treatAsTrimmedClip
        ? Math.max(0, timelineMs - proofBaselineMs)
        : timelineDurationMs && Math.abs(videoDurationMs - timelineDurationMs) > 1500
          ? Math.max(0, Math.round((timelineMs / timelineDurationMs) * videoDurationMs))
          : timelineMs;
      const rawTargetSeconds = Math.max(0, mappedVideoMs / 1000);
      const maxSeekableSeconds =
        Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.15) : rawTargetSeconds;
      return Math.max(0, Math.min(rawTargetSeconds, maxSeekableSeconds));
    };

    const getClipWindowSeconds = () => {
      if (useFragmentedClipSource) {
        const localClipDurationSeconds = Math.max(0.35, (clipEndTimelineMs - clipStartTimelineMs) / 1000);
        const maxDuration =
          Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0.35, video.duration) : localClipDurationSeconds;
        return {
          startSeconds: 0,
          endSeconds: Math.max(0.35, Math.min(localClipDurationSeconds, maxDuration))
        };
      }

      const startSeconds = mapTimelineMsToVideoSeconds(clipStartTimelineMs);
      const rawEndSeconds = mapTimelineMsToVideoSeconds(clipEndTimelineMs);
      const endSeconds = Math.max(startSeconds + 0.35, rawEndSeconds);
      return {
        startSeconds,
        endSeconds
      };
    };

    const seekToSeconds = (targetSeconds) => {
      if (typeof video.fastSeek === "function") {
        video.fastSeek(targetSeconds);
      } else {
        video.currentTime = targetSeconds;
      }
    };

    const clampPlaybackToWindow = (options = {}) => {
      const { startSeconds, endSeconds } = getClipWindowSeconds();
      const currentSeconds = Number(video.currentTime) || 0;
      const tolerance = 0.08;

      if (currentSeconds < startSeconds - tolerance) {
        try {
          seekToSeconds(startSeconds);
        } catch {}
        return;
      }

      if (currentSeconds > endSeconds + tolerance) {
        try {
          seekToSeconds(endSeconds);
        } catch {}
        if (options.pause !== false) {
          try {
            video.pause();
          } catch {}
        }
        return;
      }

      if (currentSeconds >= endSeconds - tolerance) {
        try {
          if (Math.abs(currentSeconds - endSeconds) > tolerance) {
            seekToSeconds(endSeconds);
          }
          video.pause();
        } catch {}
      }
    };

    const attemptSeek = () => {
      settleRafId = 0;
      if (seekSettled) {
        return;
      }

      const { startSeconds } = getClipWindowSeconds();
      try {
        if (Math.abs((Number(video.currentTime) || 0) - startSeconds) > 0.2) {
          seekToSeconds(startSeconds);
        }
        video.pause();
      } catch {}

      seekAttempts += 1;
      if (Math.abs((Number(video.currentTime) || 0) - startSeconds) <= 0.35) {
        seekSettled = true;
        return;
      }

      if (seekAttempts < 6) {
        settleRafId = window.requestAnimationFrame(attemptSeek);
      }
    };

    const scheduleSeek = () => {
      if (seekSettled || settleRafId) {
        return;
      }
      settleRafId = window.requestAnimationFrame(attemptSeek);
    };

    video.addEventListener("loadedmetadata", scheduleSeek);
    video.addEventListener("loadeddata", scheduleSeek);
    video.addEventListener("canplay", scheduleSeek);
    video.addEventListener("durationchange", scheduleSeek);
    video.addEventListener("play", () => {
      const { startSeconds, endSeconds } = getClipWindowSeconds();
      const currentSeconds = Number(video.currentTime) || 0;
      if (currentSeconds < startSeconds - 0.08 || currentSeconds > endSeconds - 0.08) {
        try {
          seekToSeconds(startSeconds);
        } catch {}
      }
    });
    video.addEventListener("timeupdate", () => clampPlaybackToWindow({ pause: true }));
    video.addEventListener("seeking", () => clampPlaybackToWindow({ pause: false }));
    video.addEventListener("seeked", () => {
      const { startSeconds } = getClipWindowSeconds();
      if (Math.abs((Number(video.currentTime) || 0) - startSeconds) <= 0.35) {
        seekSettled = true;
      }
      try {
        video.pause();
      } catch {}
    });

    if (video.readyState >= 1) {
      scheduleSeek();
    }

    video.setAttribute("data-bound", "1");
  }
}

function attachJourneyCanvases(root = null) {
  const host = root || elements.reportDetail;
  if (!host) {
    return;
  }

  const viewports = Array.from(host.querySelectorAll("[data-journey-canvas]"));
  for (const viewport of viewports) {
    if (viewport.getAttribute("data-bound") === "1") {
      continue;
    }

    const shell = viewport.closest(".journey-canvas-shell");
    const stage = viewport.querySelector(".journey-canvas-stage");
    const canvasId = String(viewport.getAttribute("data-journey-canvas") || "").trim();
    const resetButton = shell ? shell.querySelector(`[data-journey-reset="${canvasId}"]`) : null;
    const initialLeft = Math.max(0, Number(viewport.getAttribute("data-initial-left")) || 0);
    const initialTop = Math.max(0, Number(viewport.getAttribute("data-initial-top")) || 0);
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let saveRafId = 0;
    let layoutRafId = 0;

    const applyMeasuredLayout = () => {
      if (!stage) {
        return;
      }

      const cards = Array.from(stage.querySelectorAll(".journey-step-card"));
      if (!cards.length) {
        return;
      }

      const connectors = Array.from(stage.querySelectorAll(".journey-canvas-link"));
      const columnCount = 3;
      const cardWidth = 332;
      const columnStep = 392;
      const baseX = 112;
      const baseY = 120;
      const rowGap = 52;
      const bottomPadding = 108;
      const layouts = [];
      let nextRowY = baseY;

      for (let rowIndex = 0; rowIndex < Math.ceil(cards.length / columnCount); rowIndex += 1) {
        const rowCards = cards.slice(rowIndex * columnCount, rowIndex * columnCount + columnCount);
        const rowHeights = rowCards.map((card) => Math.max(286, Math.ceil(card.getBoundingClientRect().height || card.offsetHeight || 0)));
        const rowHeight = Math.max(...rowHeights);

        rowCards.forEach((card, columnIndex) => {
          const visualColumn = rowIndex % 2 === 0 ? columnIndex : columnCount - 1 - columnIndex;
          const x = baseX + visualColumn * columnStep;
          const y = nextRowY;
          card.style.left = `${x}px`;
          card.style.top = `${y}px`;
          layouts[rowIndex * columnCount + columnIndex] = {
            x,
            y,
            width: cardWidth,
            height: rowHeights[columnIndex]
          };
        });

        nextRowY += rowHeight + rowGap;
      }

      const stageWidth = Math.max(1480, baseX + (columnCount - 1) * columnStep + cardWidth + 120);
      const stageHeight = Math.max(1120, nextRowY + bottomPadding);
      stage.style.setProperty("--journey-stage-width", `${stageWidth}px`);
      stage.style.setProperty("--journey-stage-height", `${stageHeight}px`);

      connectors.forEach((connector, index) => {
        const current = layouts[index];
        const next = layouts[index + 1];
        if (!current || !next) {
          return;
        }
        const startX = current.x + current.width - 12;
        const startY = current.y + Math.round(current.height / 2);
        const endX = next.x + 12;
        const endY = next.y + Math.round(next.height / 2);
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const length = Math.max(48, Math.round(Math.hypot(deltaX, deltaY)));
        const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
        connector.style.left = `${Math.round(startX)}px`;
        connector.style.top = `${Math.round(startY)}px`;
        connector.style.width = `${length}px`;
        connector.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      });
    };

    const scheduleMeasuredLayout = () => {
      if (layoutRafId) {
        return;
      }
      layoutRafId = window.requestAnimationFrame(() => {
        layoutRafId = 0;
        applyMeasuredLayout();
      });
    };

    const readSavedPosition = () => {
      if (!canvasId || !(state.journeyCanvasPositions instanceof Map)) {
        return null;
      }
      const saved = state.journeyCanvasPositions.get(canvasId);
      if (!saved || typeof saved !== "object") {
        return null;
      }

      return {
        left: Math.max(0, Number(saved.left) || 0),
        top: Math.max(0, Number(saved.top) || 0)
      };
    };
    const savePosition = (left = viewport.scrollLeft, top = viewport.scrollTop) => {
      if (!canvasId || !(state.journeyCanvasPositions instanceof Map)) {
        return;
      }
      state.journeyCanvasPositions.set(canvasId, {
        left: Math.max(0, Number(left) || 0),
        top: Math.max(0, Number(top) || 0)
      });
    };
    const queuePositionSave = () => {
      if (saveRafId) {
        return;
      }
      saveRafId = window.requestAnimationFrame(() => {
        saveRafId = 0;
        savePosition();
      });
    };

    const resetView = (behavior = "smooth", shouldFocus = true, forceInitial = false) => {
      const saved = forceInitial ? null : readSavedPosition();
      const targetLeft = saved?.left ?? initialLeft;
      const targetTop = saved?.top ?? initialTop;
      viewport.scrollTo({ left: targetLeft, top: targetTop, behavior });
      savePosition(targetLeft, targetTop);
      if (shouldFocus) {
        viewport.focus({ preventScroll: true });
      }
    };
    const finishDrag = () => {
      if (activePointerId === null) {
        return;
      }
      try {
        viewport.releasePointerCapture(activePointerId);
      } catch {}
      activePointerId = null;
      viewport.classList.remove("is-dragging");
      savePosition();
    };

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" && event.button !== 0) {
        return;
      }
      if (event.target && typeof event.target.closest === "function" && event.target.closest("a, button, input, textarea, select, summary, video")) {
        return;
      }
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = viewport.scrollLeft;
      startTop = viewport.scrollTop;
      viewport.classList.add("is-dragging");
      try {
        viewport.setPointerCapture(activePointerId);
      } catch {}
      event.preventDefault();
    });

    viewport.addEventListener("pointermove", (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      viewport.scrollLeft = startLeft - (event.clientX - startX);
      viewport.scrollTop = startTop - (event.clientY - startY);
    });

    viewport.addEventListener("scroll", queuePositionSave, { passive: true });
    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);
    viewport.addEventListener("lostpointercapture", finishDrag);
    viewport.addEventListener("keydown", (event) => {
      const step = 84;
      if (event.key === "Home") {
        event.preventDefault();
        resetView("smooth", false, true);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        viewport.scrollBy({ left: -step, behavior: "smooth" });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        viewport.scrollBy({ left: step, behavior: "smooth" });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        viewport.scrollBy({ top: -step, behavior: "smooth" });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        viewport.scrollBy({ top: step, behavior: "smooth" });
      }
    });

    if (resetButton) {
      resetButton.addEventListener("click", () => resetView("smooth", true, true));
    }

    if ("ResizeObserver" in window && stage) {
      const resizeObserver = new ResizeObserver(() => scheduleMeasuredLayout());
      stage.querySelectorAll(".journey-step-card, .journey-step-proof-video").forEach((node) => resizeObserver.observe(node));
    }

    viewport.querySelectorAll(".journey-step-proof-video").forEach((video) => {
      video.addEventListener("loadedmetadata", scheduleMeasuredLayout);
      video.addEventListener("loadeddata", scheduleMeasuredLayout);
    });

    viewport.setAttribute("data-bound", "1");
    window.requestAnimationFrame(() => {
      applyMeasuredLayout();
      resetView("auto", false);
    });
  }
}

async function renderSelectedReport() {
  const runId = String(state.selectedRunId || state.requestedRunId || "").trim();
  if (!runId) {
    state.activeRenderedReport = null;
    state.activeRenderedRow = null;
    dashboardRenderState.renderNoSelectionState({
      elements,
      hasAppDashboardUi,
      renderRecentRunsTable,
      environmentLabel: getEnvironmentLabel(getActiveEnvironment()),
      releaseLens: isReleaseReadinessEnvironment(getActiveEnvironment())
    });
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
  const mode = deriveDashboardMode(report, row, statusPayload);
  const liveWatchMarkup = renderLiveWatch(runId, row);
  const sharedPromoMarkup = renderSharedReportPromotionBanner(report, row);
  const experienceTimelineMarkup = renderExperienceTimelineSection(report, row);
  const journeysMarkup = renderJourneys(report, row);
  const priorityMarkup = renderPrioritySummary(report, mode);
  const engineeringTriageMarkup = renderEngineeringTriageSection(report, row, statusPayload);
  const findingsMarkup = renderFindings(report, row, replayPlayerId);
  const detailMarkup = `
    <div class="report-detail-shell">
      ${renderSelectedHeader(report, row, statusPayload)}
      ${sharedPromoMarkup}
      ${experienceTimelineMarkup}
      ${journeysMarkup}
      <div class="report-detail-columns">
        <div class="report-main-column">
          ${liveWatchMarkup}
          ${priorityMarkup}
          ${engineeringTriageMarkup}
          ${findingsMarkup}
        </div>
      </div>
    </div>
  `;

  dashboardRenderState.mountReportDetail({
    elements,
    detailMarkup,
    isReportViewMode: isReportViewMode(),
    attachReplayPlayers,
    attachExperienceTimelinePlayers,
    attachReplayJumpButtons,
    attachJourneyStepProofVideos,
    attachJourneyCanvases,
    attachShareButtons,
    attachLlmCopyButtons
  });

  if (hasAppDashboardUi) {
    if (!isReportViewMode()) {
      renderAppPanels(report, row, statusPayload);
    }
    renderAppRunPicker();
  }
  markDashboardShellReady();
}

async function loadAndRenderReports() {
  const loadRequestId = beginDashboardLoadRequest();
  ensureOnboardingStateInitialized();
  applyAppViewMode();
  closeFindingDetailModal({ restoreFocus: false });
  beginDashboardLoad();
  let shouldMarkShellReady = false;
  try {
    if (requiresDashboardAuth && !isDashboardAuthReady() && !hasSharedReportAccess()) {
      await waitForDashboardAuthReady();
    }
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }
    if (!isDashboardAuthorized() && !hasSharedReportAccess()) {
      stopLivePolling();
      resetDashboardCollections();
      updateOnboardingVisibility();
      renderBrandSuggestions();
      renderAuthRequiredState();
      syncProjectSwitcherVisibility();
      return;
    }

    if (!isDashboardAuthorized() && hasSharedReportAccess()) {
      stopWorkerHealthPolling();
      state.workerHealth = null;
      resetDashboardCollections();
      renderDistributionPacksPanel({
        error: "Sign in to load distribution packs.",
        clearData: true
      });
      updateOnboardingVisibility();
      renderBrandSuggestions();
      syncProjectSwitcherVisibility();
      syncUrlFromState();
      await renderSelectedReport();
      if (!isDashboardLoadRequestCurrent(loadRequestId)) {
        return;
      }
      shouldMarkShellReady = true;
      ensureLivePolling();
      return;
    }

    setProjectCatalogStatus(PROJECT_CATALOG_STATES.LOADING);
    renderBrandSuggestions();
    syncProjectSwitcherVisibility();
    dashboardRenderState.renderLoadingState({
      elements,
      hasAppDashboardUi
    });
    markDashboardShellReady({ force: true });
    renderDistributionPacksPanel({ clearError: true });

    const activeDistributionTrack = normalizeDistributionTrack(state.submissionCatalog.activeTrack);
    const secondaryDistributionTrack = activeDistributionTrack === "startup" ? "physical_local" : "startup";
    void loadDistributionCatalog(activeDistributionTrack, { renderLoading: true }).catch(() => null);
    void loadSubmissionBrands().catch(() => null);

    let fetchedRuns = await requestRunCollection();
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }
    applyRunCollection(fetchedRuns);
    debugDashboardLog("runs resolved", {
      fetchedCount: Array.isArray(fetchedRuns) ? fetchedRuns.length : 0,
      allRuns: state.allRuns.length,
      visibleRuns: state.runs.length,
      selectedRunId: state.selectedRunId
    });

    if (!state.brandOptions.length && state.allRuns.length > 0) {
      const derivedProjects = deriveSavedProjectsFromRuns(state.allRuns);
      debugDashboardLog("derived projects from runs", {
        derivedCount: derivedProjects.length,
        brandKeys: derivedProjects.map((item) => item?.brand_key || "")
      });
      if (derivedProjects.length) {
        mergeSavedProjects(derivedProjects);
        setProjectCatalogStatus(state.brandOptions.length ? PROJECT_CATALOG_STATES.READY : PROJECT_CATALOG_STATES.LOADING);
        ensureSingleProjectSelection();
        debugDashboardLog("after derived merge", {
          projectCount: state.brandOptions.length,
          status: state.projectCatalogStatus,
          selectedBrand: state.filters.brand
        });
        renderBrandSuggestions();
        syncProjectSwitcherVisibility();
      }
    }

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
    void hydrateProjectCatalogInBackground(loadRequestId);
    prefetchDistributionCatalog(secondaryDistributionTrack);
    await renderSelectedReport();
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }
    if (hasAppDashboardUi) {
      await loadQaAutomationPanels();
      if (!isDashboardLoadRequestCurrent(loadRequestId)) {
        return;
      }
    }
    shouldMarkShellReady = true;
    ensureWorkerHealthPolling();
    ensureLivePolling();
  } catch (error) {
    if (!isDashboardLoadRequestCurrent(loadRequestId)) {
      return;
    }
    if (!isProjectCatalogResolved()) {
      setProjectCatalogStatus(PROJECT_CATALOG_STATES.ERROR);
    }
    renderBrandSuggestions();
    dashboardRenderState.renderErrorState({
      elements,
      hasAppDashboardUi,
      message: error.message || "Failed to load reports",
      escapeHtml
    });
    stopLivePolling();
    updateOnboardingVisibility();
    syncProjectSwitcherVisibility();
    shouldMarkShellReady = true;
  } finally {
    finishDashboardLoad();
    if (shouldMarkShellReady && isDashboardLoadRequestCurrent(loadRequestId)) {
      markDashboardShellReady();
    }
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
  if (document.visibilityState === "hidden") {
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
  if (!isDashboardAuthorized() && !hasSharedReportAccess()) {
    return;
  }
  pollSelectedRunLiveStatus();
  state.livePollingTimer = window.setInterval(() => {
    pollSelectedRunLiveStatus();
  }, LIVE_STATUS_POLL_INTERVAL_MS);
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
    renderOnboardingRepoConnectionUi();
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingTargetUrl?.addEventListener("blur", () => {
    normalizeOnboardingTargetUrlInput(String(elements.onboardingTargetUrl?.value || ""), { writeBack: true });
    maybePopulateBrandKeyFromTarget();
    refreshOnboardingPreview();
    renderOnboardingRepoConnectionUi();
    void loadOnboardingRepoConnectionForCurrentBrand({ force: true, includeRepositories: true });
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
  elements.onboardingRepoTriageEnabled?.addEventListener("change", () => {
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingRepoTriageRepo?.addEventListener("input", () => {
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingRepoTriagePaths?.addEventListener("input", () => {
    refreshOnboardingLaunchSummary();
  });
  elements.onboardingRepoTriagePaths?.addEventListener("change", async () => {
    const connection = getCachedRepoConnection(getOnboardingBrandKey());
    if (connection.connection_status !== "connected" || !connection.selected_repo_full_name) {
      return;
    }
    try {
      await persistOnboardingRepoConnectionSelection();
    } catch (error) {
      showReportToast(error?.message || "Could not save repo path allowlist.", "error");
    }
  });

  elements.onboardingRepoTriageConnect?.addEventListener("click", async () => {
    const brandKey = getOnboardingBrandKey();
    if (!brandKey) {
      setOnboardingMessage("Enter the product URL first so the repo connection is scoped to the right brand.", "error");
      elements.onboardingTargetUrl?.focus();
      return;
    }

    try {
      storeGitHubAppReturnState(captureCurrentOnboardingConfig());
      const install = await requestGitHubAppInstallUrl(brandKey);
      window.location.assign(String(install.install_url || "").trim());
    } catch (error) {
      showReportToast(error?.message || "Could not start GitHub App install.", "error");
    }
  });

  elements.onboardingRepoTriageDisconnect?.addEventListener("click", async () => {
    const brandKey = getOnboardingBrandKey();
    if (!brandKey || !window.confirm("Disconnect the GitHub repo for this brand?")) {
      return;
    }
    try {
      await requestDeleteBrandRepoConnection(brandKey);
      state.repoConnections.set(brandKey, buildEmptyRepoConnection(brandKey));
      if (elements.onboardingRepoTriageRepo) {
        elements.onboardingRepoTriageRepo.readOnly = false;
        elements.onboardingRepoTriageRepo.value = "";
      }
      renderOnboardingRepoConnectionUi();
      refreshOnboardingLaunchSummary();
      showReportToast("GitHub repo disconnected for this brand.", "success");
    } catch (error) {
      showReportToast(error?.message || "Could not disconnect GitHub.", "error");
    }
  });

  elements.onboardingRepoConnectionSelect?.addEventListener("change", async () => {
    try {
      await persistOnboardingRepoConnectionSelection({
        repoFullName: elements.onboardingRepoConnectionSelect?.value || ""
      });
      showReportToast("Connected repo saved for this brand.", "success");
    } catch (error) {
      showReportToast(error?.message || "Could not save the selected repo.", "error");
    }
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
  renderOnboardingRepoConnectionUi();
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
  renderOnboardingRepoConnectionUi();
  void loadOnboardingRepoConnectionForCurrentBrand({ includeRepositories: true });
  updateOnboardingVisibility();
  focusOnboardingActiveControl();
}

function closeOnboardingModal() {
  if (!hasAppDashboardUi || !elements.onboardingSection) {
    return;
  }
  state.onboarding.manualOverride = false;
  state.onboarding.forceOpen = false;
  state.onboarding.pendingRepoSelectionFocus = false;
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
  applyOnboardingRepoTriageConfig({ enabled: false, repo: "", path_allowlist: [] });
  renderOnboardingRepoConnectionUi();
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
  closeFindingDetailModal({ restoreFocus: false });
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
  closeFindingDetailModal({ restoreFocus: false });
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

  if (elements.distributionTrackSwitcher && elements.distributionTrackSwitcher.dataset.bound !== "1") {
    elements.distributionTrackSwitcher.dataset.bound = "1";
    elements.distributionTrackSwitcher.addEventListener("click", (event) => {
      const button =
        event.target instanceof HTMLElement
          ? event.target.closest("[data-distribution-track]")
          : null;
      if (!button) {
        return;
      }
      const nextTrack = normalizeDistributionTrack(button.getAttribute("data-distribution-track"));
      if (nextTrack === state.submissionCatalog.activeTrack) {
        return;
      }
      stopDistributionPreparePolling();
      stopDistributionQueuePolling();
      state.submissionCatalog.activeTrack = nextTrack;
      state.submissionLauncher.prepareJob = null;
      state.submissionLauncher.preparing = false;
      state.submissionLauncher.preflight = null;
      state.submissionLauncher.queueBatch = null;
      state.submissionLauncher.queueStatuses = {};
      renderDistributionPacksPanel({ clearError: true });
      void loadDistributionCatalog(nextTrack, { renderLoading: true }).catch(() => null);
    });
  }

  if (elements.distributionBrandSelect && elements.distributionBrandSelect.dataset.bound !== "1") {
    elements.distributionBrandSelect.dataset.bound = "1";
    elements.distributionBrandSelect.addEventListener("change", () => {
      stopDistributionPreparePolling();
      stopDistributionQueuePolling();
      state.submissionLauncher.selectedBrandProfileId = sanitizeString(elements.distributionBrandSelect.value, 128);
      state.submissionLauncher.prepareJob = null;
      state.submissionLauncher.preparing = false;
      state.submissionLauncher.latestManifest = null;
      state.submissionLauncher.manifestError = "";
      state.submissionLauncher.preflight = null;
      state.submissionLauncher.queueBatch = null;
      state.submissionLauncher.queueStatuses = {};
      syncDistributionBrandFormState(getSelectedDistributionBrand(), true);
      renderDistributionLauncher();
      void loadDistributionManifest(state.submissionLauncher.selectedBrandProfileId, {
        force: true,
        clearExisting: true
      }).catch(() => null);
    });
  }

  if (elements.distributionPackSelect && elements.distributionPackSelect.dataset.bound !== "1") {
    elements.distributionPackSelect.dataset.bound = "1";
    elements.distributionPackSelect.addEventListener("change", () => {
      stopDistributionPreparePolling();
      stopDistributionQueuePolling();
      state.submissionLauncher.selectedPackId = sanitizeString(elements.distributionPackSelect.value, 128).toLowerCase();
      state.submissionLauncher.prepareJob = null;
      state.submissionLauncher.preparing = false;
      state.submissionLauncher.preflight = null;
      state.submissionLauncher.queueBatch = null;
      state.submissionLauncher.queueStatuses = {};
      setDistributionLauncherMessage("Pack updated. Prepare assets or rerun preflight for the new selection.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionSubmitLive && elements.distributionSubmitLive.dataset.bound !== "1") {
    elements.distributionSubmitLive.dataset.bound = "1";
    elements.distributionSubmitLive.addEventListener("change", () => {
      renderDistributionLauncher();
    });
  }

  if (elements.distributionPrepareAction && elements.distributionPrepareAction.dataset.bound !== "1") {
    elements.distributionPrepareAction.dataset.bound = "1";
    elements.distributionPrepareAction.addEventListener("click", () => {
      void runDistributionAssetPrepare();
    });
  }

  if (elements.distributionPreflightAction && elements.distributionPreflightAction.dataset.bound !== "1") {
    elements.distributionPreflightAction.dataset.bound = "1";
    elements.distributionPreflightAction.addEventListener("click", () => {
      void runDistributionPreflight();
    });
  }

  if (elements.distributionQueueAction && elements.distributionQueueAction.dataset.bound !== "1") {
    elements.distributionQueueAction.dataset.bound = "1";
    elements.distributionQueueAction.addEventListener("click", () => {
      void queueDistributionPack();
    });
  }

  if (elements.distributionIdentityMode && elements.distributionIdentityMode.dataset.bound !== "1") {
    elements.distributionIdentityMode.dataset.bound = "1";
    elements.distributionIdentityMode.addEventListener("change", () => {
      state.submissionLauncher.brandForm.identityMode = sanitizeOptionalString(elements.distributionIdentityMode.value, 64) || "client_owned";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionMailboxProvider && elements.distributionMailboxProvider.dataset.bound !== "1") {
    elements.distributionMailboxProvider.dataset.bound = "1";
    elements.distributionMailboxProvider.addEventListener("change", () => {
      state.submissionLauncher.brandForm.mailboxProvider =
        sanitizeOptionalString(elements.distributionMailboxProvider.value, 120) || "";
      applyDistributionMailboxDefaults({ force: true });
      setDistributionBrandSaveMessage("Provider defaults applied. Save to persist these changes.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionMailboxEmail && elements.distributionMailboxEmail.dataset.bound !== "1") {
    elements.distributionMailboxEmail.dataset.bound = "1";
    elements.distributionMailboxEmail.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxEmail = sanitizeOptionalString(elements.distributionMailboxEmail.value, 320) || "";
      applyDistributionMailboxDefaults();
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionMailboxUsername && elements.distributionMailboxUsername.dataset.bound !== "1") {
    elements.distributionMailboxUsername.dataset.bound = "1";
    elements.distributionMailboxUsername.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxUsername =
        sanitizeOptionalString(elements.distributionMailboxUsername.value, 320) || "";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxAuthMethod && elements.distributionMailboxAuthMethod.dataset.bound !== "1") {
    elements.distributionMailboxAuthMethod.dataset.bound = "1";
    elements.distributionMailboxAuthMethod.addEventListener("change", () => {
      state.submissionLauncher.brandForm.mailboxAuthMethod =
        sanitizeOptionalString(elements.distributionMailboxAuthMethod.value, 64) || "unknown";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionMailboxHost && elements.distributionMailboxHost.dataset.bound !== "1") {
    elements.distributionMailboxHost.dataset.bound = "1";
    elements.distributionMailboxHost.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxHost = sanitizeOptionalString(elements.distributionMailboxHost.value, 320) || "";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxPort && elements.distributionMailboxPort.dataset.bound !== "1") {
    elements.distributionMailboxPort.dataset.bound = "1";
    elements.distributionMailboxPort.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxPort = sanitizeOptionalString(elements.distributionMailboxPort.value, 16) || "993";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxSecure && elements.distributionMailboxSecure.dataset.bound !== "1") {
    elements.distributionMailboxSecure.dataset.bound = "1";
    elements.distributionMailboxSecure.addEventListener("change", () => {
      state.submissionLauncher.brandForm.mailboxSecure = elements.distributionMailboxSecure.checked === true;
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxSmtpHost && elements.distributionMailboxSmtpHost.dataset.bound !== "1") {
    elements.distributionMailboxSmtpHost.dataset.bound = "1";
    elements.distributionMailboxSmtpHost.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxSmtpHost =
        sanitizeOptionalString(elements.distributionMailboxSmtpHost.value, 320) || "";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxSmtpPort && elements.distributionMailboxSmtpPort.dataset.bound !== "1") {
    elements.distributionMailboxSmtpPort.dataset.bound = "1";
    elements.distributionMailboxSmtpPort.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxSmtpPort =
        sanitizeOptionalString(elements.distributionMailboxSmtpPort.value, 16) || "587";
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxSmtpSecure && elements.distributionMailboxSmtpSecure.dataset.bound !== "1") {
    elements.distributionMailboxSmtpSecure.dataset.bound = "1";
    elements.distributionMailboxSmtpSecure.addEventListener("change", () => {
      state.submissionLauncher.brandForm.mailboxSmtpSecure =
        elements.distributionMailboxSmtpSecure.checked === true;
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
    });
  }

  if (elements.distributionMailboxPassword && elements.distributionMailboxPassword.dataset.bound !== "1") {
    elements.distributionMailboxPassword.dataset.bound = "1";
    elements.distributionMailboxPassword.addEventListener("input", () => {
      state.submissionLauncher.brandForm.mailboxPassword = sanitizeOptionalString(elements.distributionMailboxPassword.value, 1024) || "";
      setDistributionBrandSaveMessage("Mailbox secret ready to save. Leave blank to keep the current one.", "");
    });
  }

  if (elements.distributionMailboxReady && elements.distributionMailboxReady.dataset.bound !== "1") {
    elements.distributionMailboxReady.dataset.bound = "1";
    elements.distributionMailboxReady.addEventListener("change", () => {
      state.submissionLauncher.brandForm.mailboxReady = elements.distributionMailboxReady.checked === true;
      setDistributionBrandSaveMessage("Mailbox form updated. Save to persist these changes.", "");
      renderDistributionLauncher();
    });
  }

  if (elements.distributionSaveBrandAction && elements.distributionSaveBrandAction.dataset.bound !== "1") {
    elements.distributionSaveBrandAction.dataset.bound = "1";
    elements.distributionSaveBrandAction.addEventListener("click", () => {
      void saveDistributionBrandMailbox();
    });
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
        closeFindingDetailModal({ restoreFocus: false });
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
        closeFindingDetailModal({ restoreFocus: false });
        state.selectedRunId = retryRunId;
        state.requestedRunId = retryRunId;
        syncUrlFromState();
        await retryRunFromContext(retryRunId, event);
      }
    });
  }

  if (elements.appDashboardRoot && elements.appDashboardRoot.dataset.findingModalBound !== "1") {
    elements.appDashboardRoot.dataset.findingModalBound = "1";
    elements.appDashboardRoot.addEventListener("click", (event) => {
      const trigger =
        event.target instanceof HTMLElement
          ? event.target.closest("[data-open-finding-modal='1']")
          : null;
      if (!trigger) {
        return;
      }
      event.preventDefault();
      openFindingDetailModal(trigger);
    });
  }

  if (elements.findingDetailModal && elements.findingDetailModal.dataset.bound !== "1") {
    elements.findingDetailModal.dataset.bound = "1";
    elements.findingDetailModal.addEventListener("click", (event) => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest("[data-close-finding-modal='true']")
          : null;
      if (!target) {
        return;
      }
      event.preventDefault();
      closeFindingDetailModal();
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
      if (event.key === "Escape" && elements.findingDetailModal && !elements.findingDetailModal.hidden) {
        closeFindingDetailModal();
        return;
      }
      if (event.key === "Escape" && !elements.onboardingSection?.hidden) {
        closeOnboardingModal();
      }
    });
  }
}

async function bootstrapDashboardContent() {
  state.dashboardBootstrapComplete = false;
  resetDashboardShellReady();
  ensureRequestedRunFromUrl();
  renderWorkerHealthIndicator();
  if (requiresDashboardAuth && !isDashboardAuthReady() && !hasSharedReportAccess()) {
    setDashboardLoading(true);
    await waitForDashboardAuthReady();
  }

  try {
    if (isDashboardAuthorized() || hasSharedReportAccess()) {
      ensureWorkerHealthPolling();
      await loadAndRenderReports();
      return;
    }

    stopWorkerHealthPolling();
    state.workerHealth = null;
    resetDashboardCollections();
    renderBrandSuggestions();
    syncProjectSwitcherVisibility();
    renderAuthRequiredState();
    setDashboardLoading(false);
  } finally {
    state.dashboardBootstrapComplete = true;
  }
}

if (hasReportsUi) {
  initializeThemeModeSwitcher();
  bindQaAutomationInteractions();

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
      closeFindingDetailModal({ restoreFocus: false });
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
  renderWorkerHealthIndicator();
  renderDistributionPacksPanel();
  ensureOnboardingStateInitialized();
  updateOnboardingVisibility();
  consumeGitHubAppRedirectState();
  void bootstrapDashboardContent();

  if (requiresDashboardAuth) {
    window.addEventListener("swarm:auth-state", async (event) => {
      const sessionChecked = Boolean(event?.detail?.sessionChecked);
      if (!sessionChecked) {
        return;
      }
      if (!state.dashboardBootstrapComplete) {
        return;
      }
      const authorized = Boolean(event?.detail?.authorized);
      if (!authorized) {
        if (hasSharedReportAccess()) {
          stopWorkerHealthPolling();
          state.workerHealth = null;
          await loadAndRenderReports();
          return;
        }
        stopLivePolling();
        stopWorkerHealthPolling();
        state.workerHealth = null;
        state.reportCache.clear();
        state.liveStatusCache.clear();
        resetDashboardCollections();
        resetDashboardShellReady();
        state.onboarding.completed = false;
        state.onboarding.forceOpen = false;
        state.onboarding.manualOverride = false;
        state.onboarding.hasAnyRuns = null;
        state.onboarding.initialized = false;
        renderBrandSuggestions();
        renderAuthRequiredState();
        updateOnboardingVisibility();
        syncProjectSwitcherVisibility();
        return;
      }
      ensureWorkerHealthPolling();
      resetDashboardCollections();
      resetDashboardShellReady();
      state.onboarding.hasAnyRuns = null;
      state.onboarding.initialized = false;
      ensureOnboardingStateInitialized();
      updateOnboardingVisibility();
      await loadAndRenderReports();
    });
  }
}
