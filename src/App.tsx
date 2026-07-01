import { cloneElement, startTransition, useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  Clock,
  Clock3,
  Code,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  GitPullRequest,
  Globe,
  History,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Mic,
  MonitorUp,
  MousePointer2,
  PanelRight,
  PenLine,
  Play,
  Plus,
  Search,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Square,
  Star,
  Quote,
  TrendingUp,
  Trash2,
  TriangleAlert,
  Users,
  WandSparkles,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ApiError, apiFetch } from "@/lib/api";
import {
  buildEvidenceAssetUrl,
  collectEvidenceValues,
  buildEvidenceIndexMap,
  buildLaunchPayload,
  DEFAULT_CONTROLLED_UX_JOB,
  DEFAULT_GOALS,
  DEFAULT_PERSONA,
  deriveBrandKeyFromUrl,
  formatDateTime,
  formatRelativeTime,
  formatStatusLabel,
  getFindingSummary,
  getPrimaryFinding,
  getReportHeadline,
  getReportSubhead,
  getSeverityTone,
  getStatusTone,
  inferBrandName,
  hasControlledUxFlowPlan,
  normalizeAccessMethod,
  normalizeBrowserMode,
  normalizeEntryPath,
  normalizeBrandKey,
  normalizeUrlInput,
  normalizeValidationTarget,
  normalizePathname
} from "@/lib/format";
import type {
  AlertItem,
  AuthUser,
  LaunchDraft,
  ManualQaItem,
  ManualQaSession,
  McpTokenSummary,
  ProjectSummary,
  QaReport,
  ReportFinding,
  RepoConnection,
  RepoRouteSuggestion,
  RunLogEntry,
  RunSummary,
  ScheduleItem,
  ShareResponse,
  StatusResponse,
  SubmissionBrandProfile,
  SubmissionJobStatus,
  SubmissionPack,
  WorkerInfo,
  WorkerSummary
} from "@/types";

const PERSONA_PRESETS = [
  {
    id: "sarah",
    name: "Sarah",
    role: "Busy parent",
    description: "Needs one obvious path and low-friction forms.",
    persona:
      "A distracted parent trying to start quickly on a phone while multitasking. If the main button, labels, or first step feel unclear, she leaves."
  },
  {
    id: "marcus",
    name: "Marcus",
    role: "Speed-focused buyer",
    description: "Hates delays, clutter, and redundant steps.",
    persona:
      "A speed-focused operator who expects the shortest path from landing to value. He abandons slow, repetitive, or overly explained flows."
  },
  {
    id: "linda",
    name: "Linda",
    role: "Clarity seeker",
    description: "Needs labels and instructions to be plain.",
    persona:
      "A careful decision-maker who needs clear labels, obvious errors, and plain language. She does not tolerate jargon or hidden requirements."
  },
  {
    id: "leo",
    name: "Leo",
    role: "Edge-case breaker",
    description: "Pushes odd paths and weak states.",
    persona:
      "A technical user who intentionally pokes weak states, odd routes, and validation edges. He expects resilient error handling and stable navigation."
  }
] as const;

const SCOPE_OPTIONS = [
  {
    value: "core_20m",
    label: "Fast pass",
    description: "Homepage to first useful state."
  },
  {
    value: "deep_45m",
    label: "Deep pass",
    description: "More coverage, more waiting, more proof."
  },
  {
    value: "feature_targeted",
    label: "One flow",
    description: "Target a specific journey with explicit goals."
  }
] as const;

const RUN_MODE_OPTIONS = [
  {
    value: "live_qa",
    label: "Live QA",
    description: "Broad exploration on the live site with no repo assumptions."
  },
  {
    value: "controlled_ux",
    label: "Controlled UX",
    description: "Validate one owned flow with repo route hints before full live QA."
  }
] as const;

const BROWSER_MODE_OPTIONS = [
  {
    value: "standard_browser",
    label: "Standard browser",
    description: "Use the normal local browser path. Best when the site is not fighting automation."
  },
  {
    value: "advanced_browser",
    label: "Advanced browser",
    description: "Use the DO worker's fresh local browser with stronger captcha handling for harder sites."
  }
] as const;

const GITHUB_APP_POPUP_MESSAGE = "swarmtester:github-app";
const PUBLIC_BRAND_NAME = "Before Users Do";
const PUBLIC_BASE_URL = "https://beforeusersdo.com";
const MCP_CLIENT_SERVER_NAME = "beforeusersdo-qa";
const HOSTED_MCP_URL = "https://mcp.beforeusersdo.com/mcp";

type AdvancedBrowserRuntimeState = {
  status: "ready" | "blocked" | "checking";
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  detail: string;
  worker: WorkerInfo | null;
};

function readWorkerMetadata(worker: WorkerInfo | null | undefined) {
  if (!worker || typeof worker !== "object") {
    return {};
  }
  const metadata = worker.metadata;
  return metadata && typeof metadata === "object" ? metadata : {};
}

function buildGitHubPopupFeatures() {
  const width = 720;
  const height = 820;
  const screenLeft = typeof window.screenLeft === "number" ? window.screenLeft : window.screenX || 0;
  const screenTop = typeof window.screenTop === "number" ? window.screenTop : window.screenY || 0;
  const outerWidth = typeof window.outerWidth === "number" && window.outerWidth > 0 ? window.outerWidth : 1440;
  const outerHeight = typeof window.outerHeight === "number" && window.outerHeight > 0 ? window.outerHeight : 900;
  const left = Math.max(0, Math.round(screenLeft + (outerWidth - width) / 2));
  const top = Math.max(0, Math.round(screenTop + (outerHeight - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

function paintGitHubPopupShell(popup: Window) {
  try {
    popup.document.title = "Connect GitHub";
    popup.document.body.innerHTML =
      '<div style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;font:600 16px/1.5 Inter,system-ui,sans-serif;"><div style="padding:24px 28px;border:1px solid #e2e8f0;border-radius:20px;background:white;box-shadow:0 20px 45px rgba(15,23,42,.08);">Opening GitHub…</div></div>';
  } catch {
    // Ignore popup paint failures and continue with the navigation.
  }
}

function readWorkerString(worker: WorkerInfo | null | undefined, key: string) {
  const value = readWorkerMetadata(worker)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readWorkerBoolean(worker: WorkerInfo | null | undefined, key: string) {
  return readWorkerMetadata(worker)[key] === true;
}

function isWorkerHealthy(worker: WorkerInfo | null | undefined) {
  const heartbeatStatus = String(worker?.heartbeat_status || worker?.status || "").toLowerCase();
  return heartbeatStatus === "healthy";
}

function describeAdvancedBrowserRuntime(
  workers: WorkerInfo[],
  workerSummary: WorkerSummary | null
): AdvancedBrowserRuntimeState {
  if (!workers.length && !workerSummary) {
    return {
      status: "checking",
      tone: "neutral",
      title: "Checking the advanced browser worker",
      detail: "Loading the latest QA worker heartbeat from the DO runtime.",
      worker: null
    };
  }

  const healthyWorker = workers.find((worker) => isWorkerHealthy(worker)) || null;
  if (!healthyWorker) {
    return {
      status: "blocked",
      tone: "danger",
      title: "Advanced browser is offline",
      detail:
        String(workerSummary?.detail || "").trim() ||
        "No healthy QA worker heartbeat is available right now. Advanced browser runs would queue, but they may not start on the DO worker.",
      worker: null
    };
  }

  const hostname =
    readWorkerString(healthyWorker, "hostname") ||
    String(healthyWorker.worker_id || healthyWorker.current_run_id || "the active worker").trim();
  const commit =
    readWorkerString(healthyWorker, "git_commit_short") || readWorkerString(healthyWorker, "git_commit_sha");
  const advancedSupported = readWorkerBoolean(healthyWorker, "advanced_browser_supported");
  const advancedConfigured =
    readWorkerBoolean(healthyWorker, "advanced_browser_configured") ||
    (readWorkerBoolean(healthyWorker, "advanced_browser_supported") &&
      !Object.prototype.hasOwnProperty.call(healthyWorker, "advanced_browser_configured"));

  if (!advancedSupported) {
    return {
      status: "blocked",
      tone: "warning",
      title: "Worker restart required",
      detail: commit
        ? `${hostname} is healthy on commit ${commit}, but it does not advertise advanced browser support yet. Restart the DO worker on the latest main before using this mode.`
        : `${hostname} is healthy, but it is running without advanced-browser capability metadata. Restart the DO worker on the latest main before using this mode.`,
      worker: healthyWorker
    };
  }

  if (!advancedConfigured) {
    return {
      status: "blocked",
      tone: "warning",
      title: "Advanced browser is not configured on DO",
      detail: `${hostname}${commit ? ` on ${commit}` : ""} is running the right worker build, but the local browser agent or model access is missing. Fix the DO worker env before using this mode.`,
      worker: healthyWorker
    };
  }

  return {
    status: "ready",
    tone: "success",
    title: "Advanced browser is ready on DO",
    detail: `${hostname}${commit ? ` on ${commit}` : ""} can run the DO worker browser with stronger captcha handling.`,
    worker: healthyWorker
  };
}

const VALIDATION_TARGET_OPTIONS = [
  {
    value: "public_flow",
    label: "Public flow",
    description: "Homepage, pricing, navigation, and public buttons."
  },
  {
    value: "login_signup",
    label: "Login or sign-up",
    description: "Test the auth experience itself, including trust and friction."
  },
  {
    value: "inside_product",
    label: "Inside the product",
    description: "Get into the product with a saved session, a login, or a fresh sign-up."
  }
] as const;

const AUTH_FLOW_ACCESS_OPTIONS = [
  {
    value: "app_url",
    label: "Start from app URL",
    description: "Use the environment URL and find the obvious login or sign-up entry."
  },
  {
    value: "auth_url",
    label: "Use auth URL",
    description: "Jump straight to a specific login or sign-up page."
  },
  {
    value: "credentials",
    label: "Use test login",
    description: "Fill a real test account so the run can prove the login flow."
  }
] as const;

const INSIDE_PRODUCT_ACCESS_OPTIONS = [
  {
    value: "saved_session",
    label: "Use old account",
    description: "Reuse the last working browser session for this project."
  },
  {
    value: "create_account",
    label: "Sign up for me",
    description: "Create a fresh account, save that session, then continue inside the product."
  },
  {
    value: "credentials",
    label: "Use test login",
    description: "Log in with a test account and save that session for later runs."
  }
] as const;

function getDefaultInsideProductAccessMethod(
  browserMode: LaunchDraft["browserMode"],
  savedSessionAvailable: boolean
): LaunchDraft["accessMethod"] {
  if (browserMode !== "advanced_browser" && savedSessionAvailable) {
    return "saved_session";
  }
  return "create_account";
}

function getInsideProductAccessOptions(
  browserMode: LaunchDraft["browserMode"],
  savedSessionAvailable: boolean
) {
  if (browserMode !== "advanced_browser" && savedSessionAvailable) {
    return INSIDE_PRODUCT_ACCESS_OPTIONS;
  }
  return INSIDE_PRODUCT_ACCESS_OPTIONS.filter((option) => option.value !== "saved_session");
}

function isInsideProductCredentialAccess(accessMethod: LaunchDraft["accessMethod"]) {
  return accessMethod === "credentials";
}

function getAccessMethodLabel(accessMethod: LaunchDraft["accessMethod"], validationTarget: LaunchDraft["validationTarget"]) {
  if (validationTarget === "public_flow") {
    return "No login needed";
  }
  if (accessMethod === "saved_session") {
    return "Old account";
  }
  if (accessMethod === "create_account") {
    return "Sign up during run";
  }
  if (accessMethod === "credentials") {
    return "Test login";
  }
  if (accessMethod === "auth_url") {
    return "Specific auth URL";
  }
  return "App URL";
}

const GOAL_PRESETS = [
  "Understand what the product does from the first screen.",
  "Start sign-up or the main get-started flow.",
  "Finish onboarding until the product becomes usable.",
  "Reach the first meaningful in-product state.",
  "Use the first core feature without getting blocked."
];

const DEFAULT_SIGNUP_INVITE_CODE = "BreakStuffFast";

type StarterPersona = {
  id: string;
  name: string;
  role: string;
  trait: string;
  quote: string;
  avatar: string;
  color: string;
  techSavviness: number;
  attentionSpan: number;
  patience: number;
};

type StarterBrand = {
  id: string;
  name: string;
  website: string;
  githubConnected: boolean;
};

const PERSONA_COLOR_SWATCHES = [
  "bg-[#FFE8E8]",
  "bg-[#E8EEFF]",
  "bg-[#FFF0F3]",
  "bg-[#F3E8FF]",
  "bg-[#E8FFF3]",
  "bg-[#FFF6E8]"
] as const;

function hashPersonaSeed(value?: string | null) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildPersonaColor(seed?: string | null) {
  return PERSONA_COLOR_SWATCHES[hashPersonaSeed(seed) % PERSONA_COLOR_SWATCHES.length];
}

function formatPersonaLabel(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z]{2,4}$/.test(part)) {
        return part;
      }
      if (/^\d/.test(part)) {
        return part.replace(/grandma/gi, "Grandma").replace(/grandpa/gi, "Grandpa");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function buildPersonaAvatarDescriptor(input: Pick<StarterPersona, "name" | "role" | "trait" | "quote"> | string) {
  const value =
    typeof input === "string"
      ? input
      : [input.name, input.role, input.trait, input.quote].filter(Boolean).join(". ");
  return value.replace(/\s+/g, " ").trim().slice(0, 240) || "General customer";
}

function buildPersonaAvatarUrl(input: Pick<StarterPersona, "name" | "role" | "trait" | "quote"> | string) {
  const params = new URLSearchParams({
    persona: buildPersonaAvatarDescriptor(input)
  });
  return `/api/qa/persona-avatar?${params.toString()}`;
}

function shouldAutoReplacePersonaAvatar(avatar?: string | null) {
  const value = String(avatar || "").trim();
  return !value || /api\.dicebear\.com\/7\.x\/avataaars/i.test(value);
}

function resolvePersonaAvatar(
  personaLike: Pick<StarterPersona, "name" | "role" | "trait" | "quote">,
  currentAvatar?: string | null
) {
  return shouldAutoReplacePersonaAvatar(currentAvatar) ? buildPersonaAvatarUrl(personaLike) : String(currentAvatar || "").trim();
}

function derivePersonaName(seed?: string | null) {
  const value = String(seed || "").trim();
  if (!value) {
    return "Customer";
  }
  if (/grandma|grandmother/i.test(value)) {
    return "Grandma";
  }
  if (/grandpa|grandfather/i.test(value)) {
    return "Grandpa";
  }
  if (/\bmom\b|mother/i.test(value)) {
    return "Mom";
  }
  if (/\bdad\b|father/i.test(value)) {
    return "Dad";
  }
  if (/student/i.test(value)) {
    return "Student";
  }
  if (/director/i.test(value)) {
    return "Director";
  }
  if (/manager/i.test(value)) {
    return "Manager";
  }
  if (/founder/i.test(value)) {
    return "Founder";
  }
  if (/developer|engineer/i.test(value)) {
    return "Builder";
  }
  if (/marketer|growth/i.test(value)) {
    return "Marketer";
  }
  if (/buyer|shopper|customer/i.test(value)) {
    return "Customer";
  }
  const firstNamedWord = value.match(/\b([A-Z][a-z]{2,})\b/);
  return firstNamedWord?.[1] || "Customer";
}

function derivePersonaRole(seed?: string | null) {
  const value = String(seed || "").replace(/\s+/g, " ").trim();
  if (!value) {
    return "Generated customer";
  }
  const explicitAge = value.match(/(\d{1,3}\s*(?:[-\s]?(?:year|yr)s?\s*[-\s]?old))/i)?.[1] || "";
  const ageRoleKeyword =
    value.match(/\b(grandma|grandmother|grandpa|grandfather|mom|mother|dad|father|hr director|cs student|product manager|student|buyer|shopper|parent|director|manager|founder|marketer|developer|engineer|customer)\b/i)?.[1] ||
    "";
  if (explicitAge && ageRoleKeyword) {
    return formatPersonaLabel(`${explicitAge} ${ageRoleKeyword}`);
  }
  if (explicitAge) {
    return formatPersonaLabel(explicitAge);
  }
  const keywordRole =
    value.match(/\b(busy parent|first-time customer|speed-focused buyer|product manager|hr director|cs student|founder|marketer|developer|engineer|director|manager|student|buyer|shopper|parent|grandma|grandpa|mom|dad)\b/i)?.[1] ||
    "";
  if (keywordRole) {
    return formatPersonaLabel(keywordRole);
  }
  return "Generated customer";
}

function derivePersonaTrait(seed?: string | null) {
  const value = String(seed || "").toLowerCase();
  if (/distracted|busy|multitask|overwhelmed/.test(value)) {
    return "Distracted & Busy";
  }
  if (/speed|fast|efficiency|commission|quick/.test(value)) {
    return "Speed Focused";
  }
  if (/skeptic|hesitant|uncertain|doubt/.test(value)) {
    return "Skeptical";
  }
  if (/clarity|accessibility|labels|jargon/.test(value)) {
    return "Clarity Seeker";
  }
  if (/break|chaos|edge case|student/.test(value)) {
    return "Chaos Tester";
  }
  if (/strict|serious|frustrated|annoyed/.test(value)) {
    return "Hard To Please";
  }
  return "First-time user";
}

function buildGeneratedPersona(seed?: string | null): StarterPersona {
  const descriptor = String(seed || "").trim();
  const name = derivePersonaName(descriptor);
  const role = derivePersonaRole(descriptor);
  const trait = derivePersonaTrait(descriptor);
  const quote = descriptor || "A generated customer perspective for this run.";
  const base = {
    name,
    role,
    trait,
    quote
  };

  return {
    id: `generated-${hashPersonaSeed(descriptor).toString(36)}`,
    ...base,
    avatar: buildPersonaAvatarUrl(base),
    color: buildPersonaColor(descriptor),
    techSavviness: /student|developer|engineer|technical|power user/i.test(descriptor) ? 85 : 55,
    attentionSpan: /busy|distracted|multitask/i.test(descriptor) ? 35 : 65,
    patience: /impatient|speed|commission|frustrated/i.test(descriptor) ? 30 : 60
  };
}

const STARTER_PERSONAS: StarterPersona[] = [
  {
    id: "sarah",
    name: "Sarah",
    role: "31yr old Mom",
    trait: "Distracted & Busy",
    quote: "I'm usually holding a toddler while trying to buy groceries. If I can't do it with one thumb, I'm out.",
    avatar: buildPersonaAvatarUrl("Sarah. 31yr old Mom. Distracted & Busy. Usually holding a toddler while trying to buy groceries."),
    color: "bg-[#FFE8E8]",
    techSavviness: 45,
    attentionSpan: 30,
    patience: 20
  },
  {
    id: "marcus",
    name: "Marcus",
    role: "27yr old SDR",
    trait: "Efficiency Obsessed",
    quote: "I live in my CRM. If your integration is clunky, it's costing me commission. I need speed.",
    avatar: buildPersonaAvatarUrl("Marcus. 27yr old SDR. Efficiency Obsessed. Lives in a CRM and cares about speed."),
    color: "bg-[#E8EEFF]",
    techSavviness: 90,
    attentionSpan: 85,
    patience: 40
  },
  {
    id: "linda",
    name: "Linda",
    role: "58yr old HR Director",
    trait: "Clarity Seeker",
    quote: "I care about accessibility and clear labels. Don't use jargon I have to look up.",
    avatar: buildPersonaAvatarUrl("Linda. 58yr old HR Director. Clarity Seeker. Cares about accessibility and clear labels."),
    color: "bg-[#FFF0F3]",
    techSavviness: 60,
    attentionSpan: 95,
    patience: 80
  },
  {
    id: "leo",
    name: "Leo",
    role: "19yr old CS Student",
    trait: "The Chaos Tester",
    quote: "I'll find every edge case. I try to break things for fun. Your error messages better be helpful.",
    avatar: buildPersonaAvatarUrl("Leo. 19yr old CS Student. Chaos Tester. Likes breaking edge cases for fun."),
    color: "bg-[#F3E8FF]",
    techSavviness: 98,
    attentionSpan: 70,
    patience: 50
  }
];

type RouteState = {
  pathname: string;
  search: string;
  hash: string;
};

type AuthState = {
  ready: boolean;
  authorized: boolean;
  user: AuthUser | null;
  message: string;
  tone: "neutral" | "success" | "danger";
};

type OperatorState = {
  open: boolean;
  loading: boolean;
  error: string;
  brands: SubmissionBrandProfile[];
  packs: SubmissionPack[];
  selectedBrandId: string;
  selectedPackId: string;
  actionMessage: string;
  actionTone: "neutral" | "success" | "danger";
  preparing: boolean;
  preflighting: boolean;
  queueing: boolean;
  prepareJob: { job_id: string; status?: string | null } | null;
  preflight: any | null;
  queueBatch: any | null;
  queueStatuses: Record<string, SubmissionJobStatus>;
  liveMode: boolean;
  noHumanActions: boolean;
};

function readRouteState(): RouteState {
  return {
    pathname: normalizePathname(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash
  };
}

function useBrowserRoute() {
  const [route, setRoute] = useState<RouteState>(() => readRouteState());

  useEffect(() => {
    const onPopState = () => setRoute(readRouteState());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(pathname: string, params?: URLSearchParams, replace = false) {
    const normalized = normalizePathname(pathname);
    const next = `${normalized}${params && params.toString() ? `?${params.toString()}` : ""}`;
    if (replace) {
      window.history.replaceState({}, "", next);
    } else {
      window.history.pushState({}, "", next);
    }
    setRoute(readRouteState());
  }

  return { route, navigate };
}

function getMagicLinkRedirectUrl() {
  const nextUrl = new URL(window.location.pathname + window.location.search, window.location.origin);
  nextUrl.searchParams.set("auth_callback", "1");
  return nextUrl.toString();
}

function cleanupAuthCallbackUrl() {
  const next = new URL(window.location.href);
  next.hash = "";
  next.searchParams.delete("auth_callback");
  window.history.replaceState({}, "", `${normalizePathname(next.pathname)}${next.search}`);
}

async function copyText(value: string) {
  if (!value) {
    return;
  }
  await navigator.clipboard.writeText(value);
}

function buildProjectCatalog(projects: ProjectSummary[], runs: RunSummary[]) {
  const map = new Map<string, ProjectSummary>();

  projects.forEach((project) => {
    const key = normalizeBrandKey(project.brand_key);
    if (!key) {
      return;
    }
    map.set(key, { ...project, brand_key: key });
  });

  runs.forEach((run) => {
    const key = normalizeBrandKey(run.brand_key || "");
    if (!key) {
      return;
    }
    const existing = map.get(key);
    map.set(key, {
      brand_key: key,
      brand_name: run.brand_name || existing?.brand_name || inferBrandName(key),
      target_url: run.target_url || existing?.target_url || null,
      run_count: Math.max(existing?.run_count || 0, 0),
      latest_run_at: existing?.latest_run_at || run.delivered_at || null,
      metadata: existing?.metadata || {}
    });
  });

  return Array.from(map.values()).sort((left, right) => {
    const leftTime = left.latest_run_at ? new Date(left.latest_run_at).getTime() : 0;
    const rightTime = right.latest_run_at ? new Date(right.latest_run_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

function upsertProjectSummary(projects: ProjectSummary[], project?: ProjectSummary | null) {
  const brandKey = normalizeBrandKey(project?.brand_key || "");
  if (!brandKey) {
    return projects;
  }

  const current = projects.find((item) => normalizeBrandKey(item.brand_key) === brandKey) || null;
  const hasTargetUrl = Boolean(project && Object.prototype.hasOwnProperty.call(project, "target_url"));
  const merged: ProjectSummary = {
    ...(current || {}),
    ...(project || {}),
    brand_key: brandKey,
    brand_name: project?.brand_name || current?.brand_name || inferBrandName(brandKey),
    target_url: hasTargetUrl ? project?.target_url ?? null : current?.target_url || null,
    run_count: Number(project?.run_count ?? current?.run_count ?? 0) || 0,
    latest_run_at: project?.latest_run_at ?? current?.latest_run_at ?? null,
    metadata:
      project?.metadata && typeof project.metadata === "object"
        ? project.metadata
        : current?.metadata && typeof current.metadata === "object"
          ? current.metadata
          : {}
  };

  const remaining = projects.filter((item) => normalizeBrandKey(item.brand_key) !== brandKey);
  return buildProjectCatalog([merged, ...remaining], []);
}

function buildDraftFromRun(run?: RunSummary | null, report?: QaReport | null, repoConnection?: RepoConnection | null): LaunchDraft {
  const metadata = report?.metadata && typeof report.metadata === "object" ? report.metadata : {};
  const controlledRaw =
    metadata?.controlled_ux && typeof metadata.controlled_ux === "object"
      ? (metadata.controlled_ux as Record<string, unknown>)
      : metadata?.controlledUx && typeof metadata.controlledUx === "object"
        ? (metadata.controlledUx as Record<string, unknown>)
        : {};
  const runMode =
    String(metadata?.qa_mode || metadata?.qaMode || "").trim().toLowerCase() === "controlled_ux" ||
    controlledRaw.enabled === true
      ? "controlled_ux"
      : "live_qa";
  const validationTarget = normalizeValidationTarget(
    String(metadata?.validation_target || metadata?.validationTarget || "").trim()
  );
  const accessMethod = normalizeAccessMethod(
    String(metadata?.access_method || metadata?.accessMethod || "").trim(),
    validationTarget
  );
  const goals = Array.isArray(run?.scenario_list) && run!.scenario_list!.length
    ? run!.scenario_list!
    : run?.goal
      ? [run.goal]
      : DEFAULT_GOALS;

  const routeHints = Array.isArray(controlledRaw.route_hints)
    ? controlledRaw.route_hints
    : Array.isArray(controlledRaw.routeHints)
      ? controlledRaw.routeHints
      : [];
  const successSignals = Array.isArray(controlledRaw.success_signals)
    ? controlledRaw.success_signals
    : Array.isArray(controlledRaw.successSignals)
      ? controlledRaw.successSignals
      : [];

  return {
    targetUrl: run?.target_url || run?.target || "",
    brandKey: run?.brand_key || deriveBrandKeyFromUrl(run?.target_url || ""),
    brandName: run?.brand_name || inferBrandName(run?.brand_key || ""),
    runMode,
    browserMode: normalizeBrowserMode(
      String(metadata?.browser_mode || metadata?.browserMode || metadata?.execution_engine || metadata?.executionEngine || "")
    ),
    validationTarget,
    accessMethod,
    authUrl: String(metadata?.auth_entry_url || metadata?.authEntryUrl || "").trim(),
    authUsername: "",
    authPassword: "",
    scopeMode: runMode === "controlled_ux" ? "feature_targeted" : run?.scope_mode || "core_20m",
    persona: run?.persona || DEFAULT_PERSONA,
    goalsText: goals.join("\n"),
    userJob: String(controlledRaw.user_job || controlledRaw.userJob || run?.goal || "").trim(),
    entryPath: String(controlledRaw.entry_path || controlledRaw.entryPath || "").trim(),
    routeHintsText: routeHints.map((item) => String(item || "").trim()).filter(Boolean).join("\n"),
    successSignalsText: successSignals.map((item) => String(item || "").trim()).filter(Boolean).join("\n"),
    repoTriageEnabled: repoConnection?.connection_status === "connected",
    selectedRepoFullName: repoConnection?.selected_repo_full_name || ""
  };
}

function readSavedEnvironmentUrls(project?: ProjectSummary | null): string[] {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata : {};
  const safeMetadata = metadata as Record<string, unknown>;
  const rawHistory = Array.isArray(safeMetadata.environment_urls)
    ? safeMetadata.environment_urls
    : Array.isArray(safeMetadata.environmentUrls)
      ? safeMetadata.environmentUrls
      : [];
  const rawLast = String(safeMetadata.last_environment_url || safeMetadata.lastEnvironmentUrl || "").trim();
  const seen = new Set<string>();
  const urls: string[] = [];

  function pushUrl(value: unknown) {
    const normalized = normalizeUrlInput(String(value || "").trim());
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    urls.push(normalized);
  }

  pushUrl(rawLast);
  rawHistory.forEach((value) => pushUrl(value));
  pushUrl(project?.target_url || "");

  return urls.slice(0, 8);
}

function buildProjectEnvironmentMetadata(metadata: Record<string, unknown>, nextTargetUrl: string, fallbackTargetUrl?: string | null) {
  const nextUrl = normalizeUrlInput(nextTargetUrl);
  const urls = readSavedEnvironmentUrls({
    brand_key: "",
    target_url: fallbackTargetUrl || null,
    metadata
  });
  const ordered = nextUrl
    ? [nextUrl, ...urls.filter((item) => item.toLowerCase() !== nextUrl.toLowerCase())]
    : urls;

  return {
    ...metadata,
    environment_urls: ordered.slice(0, 8),
    last_environment_url: nextUrl || ordered[0] || null
  };
}

function applyLaunchTargetUrl(current: LaunchDraft, nextTarget: string): LaunchDraft {
  const nextBrandKey = current.brandKey || deriveBrandKeyFromUrl(nextTarget);
  return {
    ...current,
    targetUrl: nextTarget,
    brandKey: nextBrandKey,
    brandName: current.brandName || inferBrandName(nextBrandKey)
  };
}

function buildDraftFromProject(project?: ProjectSummary | null, repoConnection?: RepoConnection | null): Partial<LaunchDraft> {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata : {};
  const launchDefaults =
    metadata?.launch_defaults && typeof metadata.launch_defaults === "object"
      ? (metadata.launch_defaults as Record<string, unknown>)
      : metadata?.launchDefaults && typeof metadata.launchDefaults === "object"
        ? (metadata.launchDefaults as Record<string, unknown>)
        : {};
  const controlledRaw =
    launchDefaults?.controlled_ux && typeof launchDefaults.controlled_ux === "object"
      ? (launchDefaults.controlled_ux as Record<string, unknown>)
      : launchDefaults?.controlledUx && typeof launchDefaults.controlledUx === "object"
        ? (launchDefaults.controlledUx as Record<string, unknown>)
        : {};
  const validationTarget = normalizeValidationTarget(
    String(launchDefaults.validation_target || launchDefaults.validationTarget || "").trim()
  );
  const accessMethod = normalizeAccessMethod(
    String(launchDefaults.access_method || launchDefaults.accessMethod || "").trim(),
    validationTarget
  );
  const routeHints = Array.isArray(controlledRaw.route_hints)
    ? controlledRaw.route_hints
    : Array.isArray(controlledRaw.routeHints)
      ? controlledRaw.routeHints
      : [];
  const successSignals = Array.isArray(controlledRaw.success_signals)
    ? controlledRaw.success_signals
    : Array.isArray(controlledRaw.successSignals)
      ? controlledRaw.successSignals
      : [];

  return {
    targetUrl: readSavedEnvironmentUrls(project)[0] || project?.target_url || "",
    brandKey: project?.brand_key || "",
    brandName: project?.brand_name || inferBrandName(project?.brand_key || ""),
    runMode:
      String(launchDefaults.qa_mode || launchDefaults.qaMode || launchDefaults.run_mode || launchDefaults.runMode || "")
        .trim()
        .toLowerCase() === "controlled_ux"
        ? "controlled_ux"
        : "live_qa",
    browserMode: normalizeBrowserMode(
      String(
        launchDefaults.browser_mode ||
          launchDefaults.browserMode ||
          launchDefaults.execution_engine ||
          launchDefaults.executionEngine ||
          ""
      ).trim()
    ),
    validationTarget,
    accessMethod,
    authUrl: String(launchDefaults.auth_entry_url || launchDefaults.authEntryUrl || "").trim(),
    authUsername: "",
    authPassword: "",
    scopeMode: String(launchDefaults.scope_mode || launchDefaults.scopeMode || "core_20m").trim() || "core_20m",
    persona: String(launchDefaults.persona || DEFAULT_PERSONA).trim() || DEFAULT_PERSONA,
    goalsText:
      Array.isArray(launchDefaults.goals) && launchDefaults.goals.length
        ? launchDefaults.goals.map((item) => String(item || "").trim()).filter(Boolean).join("\n")
        : DEFAULT_GOALS.join("\n"),
    userJob: String(controlledRaw.user_job || controlledRaw.userJob || launchDefaults.goal || "").trim(),
    entryPath: String(controlledRaw.entry_path || controlledRaw.entryPath || "").trim(),
    routeHintsText: routeHints.map((item) => String(item || "").trim()).filter(Boolean).join("\n"),
    successSignalsText: successSignals.map((item) => String(item || "").trim()).filter(Boolean).join("\n"),
    repoTriageEnabled:
      metadata?.repo_triage && typeof metadata.repo_triage === "object"
        ? Boolean((metadata.repo_triage as Record<string, unknown>).enabled)
        : repoConnection?.connection_status === "connected",
    selectedRepoFullName:
      String(
        launchDefaults.selected_repo_full_name ||
          launchDefaults.selectedRepoFullName ||
          repoConnection?.selected_repo_full_name ||
          ""
      ).trim() || ""
  };
}

function launchDraftsMatch(left: LaunchDraft, right: LaunchDraft) {
  return (
    left.targetUrl === right.targetUrl &&
    left.brandKey === right.brandKey &&
    left.brandName === right.brandName &&
    left.runMode === right.runMode &&
    left.browserMode === right.browserMode &&
    left.validationTarget === right.validationTarget &&
    left.accessMethod === right.accessMethod &&
    left.authUrl === right.authUrl &&
    left.authUsername === right.authUsername &&
    left.authPassword === right.authPassword &&
    left.scopeMode === right.scopeMode &&
    left.persona === right.persona &&
    left.goalsText === right.goalsText &&
    left.userJob === right.userJob &&
    left.entryPath === right.entryPath &&
    left.routeHintsText === right.routeHintsText &&
    left.successSignalsText === right.successSignalsText &&
    left.repoTriageEnabled === right.repoTriageEnabled &&
    left.selectedRepoFullName === right.selectedRepoFullName
  );
}

function getStarterPersona(seed?: string | null) {
  const value = String(seed || "").trim();
  if (!value) {
    return STARTER_PERSONAS[0];
  }
  const matched = STARTER_PERSONAS.find((persona) => {
    const haystack = `${persona.name} ${persona.role} ${persona.trait} ${persona.quote}`.toLowerCase();
    return haystack.includes(value.toLowerCase()) || value.toLowerCase().includes(persona.name.toLowerCase());
  });
  if (matched) {
    return {
      ...matched,
      avatar: resolvePersonaAvatar(matched, matched.avatar)
    };
  }
  return buildGeneratedPersona(value);
}

function buildStarterBrands(projects: ProjectSummary[], runs: RunSummary[], repoConnection?: RepoConnection | null): StarterBrand[] {
  const catalog = buildProjectCatalog(projects, runs);
  return catalog.map((project) => ({
    id: normalizeBrandKey(project.brand_key),
    name: project.brand_name || inferBrandName(project.brand_key),
    website: project.target_url || `https://${normalizeBrandKey(project.brand_key)}.com`,
    githubConnected: Boolean(repoConnection?.selected_repo_full_name && normalizeBrandKey(repoConnection?.brand_key || "") === normalizeBrandKey(project.brand_key))
  }));
}

function readProjectTeamMembers(project?: ProjectSummary | null) {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata : {};
  const rawValue = (metadata as Record<string, unknown>).team_members;
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const seen = new Set<string>();
  const members: string[] = [];
  for (const item of rawValue) {
    const safeValue = String(item || "").trim().toLowerCase();
    if (!safeValue || seen.has(safeValue)) {
      continue;
    }
    seen.add(safeValue);
    members.push(safeValue);
    if (members.length >= 12) {
      break;
    }
  }
  return members;
}

function deriveScoreFromReport(report?: QaReport | null, run?: RunSummary | null) {
  const findings = Array.isArray(report?.findings) ? report!.findings! : [];
  const riskScore = Number(report?.summary?.risk_score ?? run?.risk_score ?? NaN);
  if (Number.isFinite(riskScore)) {
    return Math.max(0, Math.min(100, Math.round(100 - riskScore)));
  }
  const penalty = findings.reduce((total, finding) => {
    const severity = String(finding?.severity || "").toLowerCase();
    if (severity === "critical") return total + 30;
    if (severity === "high") return total + 18;
    if (severity === "medium") return total + 10;
    if (severity === "low") return total + 5;
    return total + 8;
  }, 0);
  if (!findings.length) {
    return run?.status === "failed" ? 0 : 92;
  }
  return Math.max(0, 100 - penalty);
}

function buildTrendData(runs: RunSummary[]) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grouped = new Map<number, number[]>();

  runs.forEach((run) => {
    const raw = run.delivered_at || run.report_url || "";
    const date = run.delivered_at ? new Date(run.delivered_at) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return;
    }
    const day = date.getDay();
    const normalized = day === 0 ? 6 : day - 1;
    const score = deriveScoreFromReport(null, run);
    grouped.set(normalized, [...(grouped.get(normalized) || []), score]);
  });

  return labels.map((name, index) => {
    const values = grouped.get(index) || [];
    const score = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 70 + index * 3;
    return { name, score };
  });
}

function buildStarterHistoryRows(runs: RunSummary[]) {
  return runs.slice(0, 8).map((run) => {
    const persona = getStarterPersona(run.persona || run.goal || run.run_id);
    return {
      id: run.run_id,
      date: formatDateTime(run.delivered_at) || run.run_id,
      agent: persona.name,
      persona,
      task: run.goal || run.target_url || inferBrandName(run.brand_key || "") || "Product audit",
      result: ["failed", "partial"].includes(String(run.status || run.queue_status || "").toLowerCase()) ? "Friction Found" : "Success",
      severity:
        String(run.status || run.queue_status || "").toLowerCase() === "failed"
          ? "High"
          : (run.findings_count || 0) > 2
            ? "Medium"
            : "None",
      duration: run.scope_mode === "deep_45m" ? "6m 20s" : run.scope_mode === "feature_targeted" ? "3m 55s" : "4m 12s",
      score: deriveScoreFromReport(null, run),
      status: String(run.status || run.queue_status || "completed").toLowerCase()
    };
  });
}

function buildStarterFrictionRows(report?: QaReport | null, runs: RunSummary[] = []) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  if (findings.length) {
    return findings.slice(0, 4).map((finding, index) => ({
      id: finding.id || `finding-${index}`,
      title: finding.title || `Friction point ${index + 1}`,
      description: getFindingSummary(finding),
      severity: (String(finding.severity || "medium").toLowerCase() === "critical" ? "high" : String(finding.severity || "medium").toLowerCase()) as "low" | "medium" | "high"
    }));
  }

  return runs
    .filter((run) => (run.findings_count || 0) > 0)
    .slice(0, 4)
    .map((run, index) => ({
      id: run.run_id,
      title: run.summary_note || run.goal || `Run ${index + 1}`,
      description: run.target_url || run.target || "A recent run reported friction that needs review.",
      severity: (run.status === "failed" ? "high" : "medium") as "low" | "medium" | "high"
    }));
}

function buildStarterLiveAgents(runs: RunSummary[]) {
  const liveRuns = runs.filter((run) => ["queued", "processing", "retryable"].includes(String(run.queue_status || run.status || "").toLowerCase()));
  return liveRuns.slice(0, 2).map((run, index) => {
    const persona = getStarterPersona(run.persona || run.goal || run.run_id);
    const progress = String(run.queue_status || run.status || "").toLowerCase() === "queued" ? 25 + index * 10 : 55 + index * 15;
    return {
      id: run.run_id,
      ...persona,
      task: run.goal || "Core flow",
      status: run.summary_note || "Exploring the main user path",
      progress,
      logs: [
        `Opened ${run.target_url || run.target || "the product"}`,
        "Mapped the primary call to action",
        "Checking for friction, blockers, and missing feedback"
      ],
      thoughts:
        "The interface looks promising, but I am still checking whether the main path is obvious, fast, and resilient for a realistic user."
    };
  });
}

function buildOptimisticRunSummary(payload: ReturnType<typeof buildLaunchPayload>): RunSummary {
  const qaMode = String(payload.metadata?.qa_mode || "live_qa").toLowerCase();
  const browserMode = normalizeBrowserMode(String(payload.metadata?.browser_mode || ""));
  return {
    run_id: payload.run_id,
    brand_key: payload.metadata.brand_key,
    brand_name: payload.metadata.brand_name,
    target_url: payload.target_url,
    target: payload.target_url,
    persona: payload.brand_persona,
    goal: payload.metadata.goal,
    scope_mode: payload.scope_mode,
    scenario_list: payload.scenario_list,
    status: "queued",
    latest_report_status: "queued",
    queue_status: "queued",
    delivered_at: new Date().toISOString(),
    source: payload.source,
    report_ready: false,
    summary_note:
      browserMode === "advanced_browser"
        ? "Advanced browser run queued. Using stronger anti-bot and captcha handling."
        : qaMode === "controlled_ux"
        ? "Controlled UX run queued. Validating the owned flow before broad live QA."
        : "Run queued and waiting for worker pickup.",
    findings_count: 0,
    journeys_count: 0,
    recommendations_count: 0,
    counts: {}
  };
}

function Button({
  children,
  tone = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-brand-primary text-white hover:bg-brand-primary-strong"
      : tone === "danger"
        ? "bg-brand-danger/15 text-brand-danger hover:bg-brand-danger/20"
        : tone === "ghost"
          ? "bg-transparent text-brand-muted hover:bg-brand-bg hover:text-brand-ink"
          : "bg-brand-shell text-brand-ink hover:bg-brand-bg";

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-brand-line px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-brand-muted">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-lg border border-brand-line bg-brand-panel px-3 text-sm text-brand-ink outline-none transition placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 ${props.className || ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[108px] w-full rounded-lg border border-brand-line bg-brand-panel px-3 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 ${props.className || ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-lg border border-brand-line bg-brand-panel px-3 text-sm text-brand-ink outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 ${props.className || ""}`}
    />
  );
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        tone === "success"
          ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
          : tone === "danger"
            ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
            : tone === "warning"
              ? "border-brand-warning/30 bg-brand-warning/10 text-brand-warning"
              : "border-brand-line bg-brand-bg text-brand-muted"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative group">
        <div className="w-12 h-12 bg-brand-ink rounded-2xl flex items-center justify-center rotate-[-4deg] group-hover:rotate-0 transition-all duration-500 shadow-[4px_4px_0px_0px_rgba(139,92,246,0.3)]">
          <Shield className="text-white w-6 h-6" />
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute -right-1 -bottom-1 w-6 h-6 bg-brand-accent rounded-lg flex items-center justify-center border-2 border-white shadow-sm"
          >
            <Zap className="text-white w-3 h-3 fill-current" />
          </motion.div>
        </div>
      </div>
      <span className="font-display text-2xl font-black tracking-tighter text-brand-ink">
        beforeusersdo<span className="text-brand-accent">.</span>
      </span>
    </div>
  );
}

function BrandMark() {
  return <Logo />;
}

function HomePage({
  authorized,
  onOpenWorkspace,
  onOpenMcpSettings
}: {
  authorized: boolean;
  onOpenWorkspace: () => void;
  onOpenMcpSettings: () => void;
}) {
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<any | null>(null);
  const mcpInstallConfig = `{
  "mcpServers": {
    "${MCP_CLIENT_SERVER_NAME}": {
      "url": "${HOSTED_MCP_URL}",
      "headers": {
        "Authorization": "Bearer mcp_..."
      }
    }
  }
}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<any>("/api/site-qa-request", {
        method: "POST",
        body: {
          url: site,
          email
        }
      });
      setQueued(response);
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : "Could not start the test.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen font-sans" data-app-shell="home">
      <header className="py-6 px-4 sm:px-8 flex justify-between items-center max-w-7xl mx-auto">
        <div className="cursor-pointer">
          <Logo />
        </div>
        <nav className="hidden md:flex items-center gap-8 font-bold text-sm uppercase tracking-widest">
          <a href="#install" className="hover:text-brand-accent transition-colors">Install MCP</a>
          <a href="#proof" className="hover:text-brand-accent transition-colors">Proof</a>
          <button className="hover:text-brand-accent transition-colors" onClick={onOpenWorkspace}>Help Center</button>
          <button
            onClick={onOpenMcpSettings}
            className="bg-brand-ink text-white px-6 py-2 rounded-full hover:bg-brand-accent transition-all"
          >
            {authorized ? "Create MCP key" : "Login"}
          </button>
        </nav>
      </header>

      <main>
        <section className="pt-12 pb-20 px-4 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]"
          >
            <div>
              <div className="organic-pill inline-flex items-center gap-2 mb-6 bg-brand-secondary/10 text-brand-ink border-brand-ink">
                <Code className="h-3.5 w-3.5" />
                Hosted QA MCP for coding agents
              </div>

              <h1 className="text-[clamp(2.5rem,7vw,6.5rem)] font-black mb-8 leading-[0.88] max-w-5xl tracking-tighter text-brand-ink">
                Let your coding agent QA its own work.
              </h1>
              <p className="text-xl md:text-2xl text-slate-600 max-w-2xl mb-10 font-medium leading-relaxed">
                Install the {PUBLIC_BRAND_NAME} MCP once. Codex, Cursor, Claude Desktop, or any Streamable HTTP MCP client can launch a real browser QA run, wait for the result, and return screenshots, console errors, network proof, and a dev-ready report.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onOpenMcpSettings}
                  className="bg-brand-accent text-white px-8 py-5 rounded-2xl font-black text-lg hover:bg-brand-ink transition-all flex items-center justify-center gap-2 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]"
                >
                  {authorized ? "Create MCP key" : "Sign in to create key"}
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href="#install"
                  className="handcrafted-card px-8 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2"
                >
                  See install steps
                  <ChevronRight className="w-5 h-5" />
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-3 py-2"><Shield className="w-3 h-3" /> Revocable keys</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-3 py-2"><Clock className="w-3 h-3" /> Hosted endpoint</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-3 py-2"><FileText className="w-3 h-3" /> Evidence bundle</span>
              </div>
            </div>

            <div className="relative">
              <div className="handcrafted-card !bg-brand-ink p-5 sm:p-7 rounded-[2rem] text-white">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-brand-danger"></div>
                    <div className="w-3 h-3 rounded-full bg-brand-warning"></div>
                    <div className="w-3 h-3 rounded-full bg-brand-success"></div>
                  </div>
                  <span className="truncate text-xs font-black uppercase tracking-widest text-white/45">mcp client config</span>
                </div>
                <pre className="mt-5 overflow-x-auto whitespace-pre-wrap break-words text-left font-mono text-[11px] leading-relaxed text-brand-secondary sm:text-xs">
                  {mcpInstallConfig}
                </pre>
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 text-sm font-black text-white">
                    <Check className="h-5 w-5 text-brand-success" />
                    qa_check_work returned needs_fix
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white/60">
                    Blank white screen after successful OTP verification. Includes final screenshot, page errors, DOM snapshot, network timeline, viewport, browser version, and post-auth state flags.
                  </p>
                </div>
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -bottom-7 -left-4 hidden rounded-3xl border-4 border-brand-ink bg-white p-3 shadow-2xl sm:flex sm:items-center sm:gap-3"
              >
                <div className={`w-12 h-12 rounded-2xl ${STARTER_PERSONAS[1].color} overflow-hidden border-2 border-brand-ink`}>
                  <img src={STARTER_PERSONAS[1].avatar} alt={STARTER_PERSONAS[1].name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Persona run</div>
                  <div className="text-sm font-black text-brand-ink">First-time user QA</div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        <section id="install" className="py-20 px-4 bg-white border-y-2 border-brand-ink">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl">
              <span className="text-brand-accent font-black uppercase tracking-[0.2em] text-sm">Install once</span>
              <h2 className="mt-4 text-4xl md:text-6xl font-black leading-tight text-brand-ink">
                Give every coding agent a real QA tool.
              </h2>
              <p className="mt-5 text-lg font-bold leading-relaxed text-slate-600">
                The hosted MCP endpoint is already live. Create a key in your dashboard, paste the config into your coding agent, then ask it to test a preview URL before it calls the work done.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid gap-4">
                {[
                  ["1", "Create a key", "Open Settings, choose Coding agents, then create a revocable MCP key."],
                  ["2", "Paste the config", "Use the hosted Streamable HTTP URL and Authorization header in your MCP client."],
                  ["3", "Ask for QA", "Tell the agent what changed, the preview URL, and the task a user should try."]
                ].map(([step, title, body]) => (
                  <div key={step} className="handcrafted-card rounded-3xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-ink font-black text-white">
                        {step}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-brand-ink">{title}</h3>
                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">{body}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onOpenMcpSettings}
                  className="bg-brand-ink text-white px-7 py-5 rounded-2xl font-black text-lg hover:bg-brand-accent transition-all flex items-center justify-center gap-2"
                >
                  Open MCP settings
                  <ExternalLink className="h-5 w-5" />
                </button>
              </div>

              <div className="handcrafted-card rounded-3xl !bg-brand-ink p-6 text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Hosted MCP URL</div>
                    <div className="mt-1 max-w-full break-all font-mono text-xs font-bold text-brand-secondary">{HOSTED_MCP_URL}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(mcpInstallConfig)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-brand-ink"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <pre className="mt-6 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/5 p-4 text-left font-mono text-[11px] leading-relaxed text-brand-secondary sm:text-xs">
                  {mcpInstallConfig}
                </pre>
                <div className="mt-6 rounded-2xl bg-white p-5 text-brand-ink">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Try this prompt</div>
                  <p className="mt-2 text-sm font-black leading-relaxed">
                    Test my preview URL with {PUBLIC_BRAND_NAME} QA. Use qa_check_work, try the signup flow, wait for the verdict, and fix anything marked needs_fix before you finish.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="proof" className="py-24 px-4 max-w-7xl mx-auto">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <span className="text-brand-accent font-black uppercase tracking-[0.2em] text-sm">Dev handoff</span>
              <h2 className="mt-4 text-4xl md:text-6xl font-black leading-tight text-brand-ink">
                Not just screenshots. A report a developer can act on.
              </h2>
              <p className="mt-5 text-lg font-bold leading-relaxed text-slate-600">
                Every MCP run returns a plain verdict plus the proof needed to reproduce, diagnose, and prioritize the issue without leaking private tokens.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Final screenshot", "The terminal state is promoted first so a blank screen or blocked flow is obvious."],
                ["Page errors", "Uncaught exceptions and console errors are captured beside the user-facing failure."],
                ["Network timeline", "Requests are ordered by time with misleading transient failures filtered from the diagnosis."],
                ["DOM snapshot", "The accessibility tree and visible DOM state show what the browser could actually interact with."],
                ["Environment", "Browser version, viewport, URL, asset hash, and run timing travel with the report."],
                ["Auth state flags", "Post-auth booleans like need_profile, token_present, and serialized_step are included without secrets."]
              ].map(([title, body]) => (
                <div key={title} className="handcrafted-card rounded-3xl p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-secondary/10 text-brand-secondary">
                    <Check className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-black text-brand-ink">{title}</h3>
                  <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="personas" className="py-24 px-4 bg-brand-ink text-white overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <span className="text-brand-accent font-black uppercase tracking-[0.2em] text-sm">The Test Fleet</span>
              <h2 className="text-4xl md:text-6xl font-black mt-4 mb-6 leading-tight">
                AI agents that feel <br />
                <span className="text-brand-secondary italic">actually human.</span>
              </h2>
              <p className="text-slate-400 text-xl max-w-2xl font-medium">
                We don&apos;t just run scripts. We deploy personalities. Our agents have goals, frustrations, and varying levels of tech-savviness.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {STARTER_PERSONAS.map((persona, index) => (
                <motion.div
                  key={persona.id}
                  whileHover={{ y: -10, rotate: index % 2 === 0 ? 1 : -1 }}
                  className="bg-white text-brand-ink p-8 rounded-[2.5rem] border-4 border-brand-accent relative group"
                >
                  <div className={`w-24 h-24 rounded-3xl ${persona.color} mb-6 overflow-hidden border-2 border-brand-ink`}>
                    <img
                      src={persona.avatar}
                      alt={persona.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <h3 className="text-2xl font-black mb-1">{persona.name}</h3>
                  <div className="text-xs font-black uppercase tracking-widest text-brand-accent mb-4">{persona.role}</div>
                  <div className="bg-brand-muted/30 p-4 rounded-2xl mb-6 relative">
                    <Quote className="absolute -top-2 -left-2 w-6 h-6 text-brand-accent opacity-20" />
                    <p className="text-sm font-bold leading-relaxed italic">&quot;{persona.quote}&quot;</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter">
                    <Zap className="w-3 h-3 text-brand-secondary" />
                    Trait: {persona.trait}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="py-24 px-4 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 handcrafted-card p-10 rounded-[3rem] bg-brand-secondary/5">
              <div className="w-14 h-14 bg-brand-secondary rounded-2xl flex items-center justify-center mb-8 rotate-[-5deg]">
                <Zap className="text-white w-8 h-8" />
              </div>
              <h3 className="text-3xl font-black mb-4">Zero-Setup Testing</h3>
              <p className="text-lg font-bold text-slate-600 leading-relaxed max-w-md">
                Just drop your URL. Our agents automatically map your site, identify user flows, and start testing. No SDKs, no code, no headaches.
              </p>
            </div>
            <div className="handcrafted-card p-10 rounded-[3rem] bg-brand-accent/5">
              <div className="w-14 h-14 bg-brand-accent rounded-2xl flex items-center justify-center mb-8 rotate-[5deg]">
                <MessageCircle className="text-white w-8 h-8" />
              </div>
              <h3 className="text-3xl font-black mb-4">Real Chat Logs</h3>
              <p className="text-lg font-bold text-slate-600 leading-relaxed">
                Read exactly what the agents were thinking as they navigated your product.
              </p>
            </div>
            <div className="handcrafted-card p-10 rounded-[3rem] !bg-brand-ink text-white">
              <h3 className="text-3xl font-black mb-4">15 Min Reports</h3>
              <p className="text-lg font-bold text-slate-400 mb-8">
                Why wait weeks for a user study? Get a comprehensive QA report before your coffee gets cold.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex -space-x-3">
                  {STARTER_PERSONAS.slice(0, 3).map((persona) => (
                    <div key={persona.id} className={`w-10 h-10 rounded-full border-2 border-brand-ink ${persona.color} overflow-hidden`}>
                      <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-brand-accent">Active Agents</span>
              </div>
            </div>
            <div className="md:col-span-2 handcrafted-card p-10 rounded-[3rem] flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                <h3 className="text-3xl font-black mb-4">Visual Friction Maps</h3>
                <p className="text-lg font-bold text-slate-600 leading-relaxed">
                  See exactly where Sarah got confused or where Marcus felt the UI was too slow. Heatmaps, but with actual human reasoning.
                </p>
              </div>
              <div className="w-full md:w-64 h-48 bg-brand-muted rounded-2xl border-2 border-brand-ink overflow-hidden relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-brand-accent rounded-full animate-ping opacity-20"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-brand-accent rounded-full"></div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4 bg-brand-muted/30">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1">
              <div className="organic-pill inline-block mb-6 bg-brand-ink text-white border-brand-ink">
                Built for agentic workflows
              </div>
              <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight text-brand-ink">
                Your AI writes the code. <br />
                Stop being the <br />
                <span className="text-brand-accent italic">manual QA</span> <br />
                for its mistakes.
              </h2>
              <p className="text-xl font-bold text-slate-600 mb-8 leading-relaxed">
                You build at the speed of light with Cursor and Claude. Stop slowing down to manually click through every PR. Our agents close the loop by testing AI-generated code against real human behavior.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-secondary rounded-xl flex items-center justify-center shrink-0">
                    <Zap className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-lg">MCP Integration</h4>
                    <p className="text-slate-500 font-medium">Connect hosted Streamable HTTP MCP to Codex, Cursor, Claude Desktop, or any compatible client. Ask the agent to test the preview before it reports done.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center shrink-0">
                    <Shield className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-lg">Confidence, Not Hope</h4>
                    <p className="text-slate-500 font-medium">Don&apos;t just hope the LLM got the UI right. Our agents navigate the actual DOM, finding the edge cases your AI missed.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full">
              <div className="handcrafted-card bg-white p-8 rounded-[3rem] relative">
                <div className="bg-brand-ink rounded-2xl p-6 font-mono text-sm text-brand-secondary overflow-hidden">
                  <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                    <div className="w-3 h-3 rounded-full bg-brand-danger"></div>
                    <div className="w-3 h-3 rounded-full bg-brand-warning"></div>
                    <div className="w-3 h-3 rounded-full bg-brand-success"></div>
                    <span className="text-white/40 ml-2">cursor-terminal</span>
                  </div>
                  <div className="space-y-2">
                    <p><span className="text-white/40">$</span> qa_check_work target_url=https://preview.example.com</p>
                    <p className="text-white">Starting persona browser run for the signup flow...</p>
                    <p className="text-white">Capturing screenshots, console errors, DOM, and network timeline...</p>
                    <p className="text-brand-accent">needs_fix: Blank white screen after OTP verification.</p>
                    <p className="text-brand-secondary">share_url: {PUBLIC_BASE_URL}/share/...</p>
                  </div>
                </div>
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute -top-6 -right-6 w-24 h-24 bg-white rounded-3xl border-4 border-brand-ink p-2 shadow-2xl overflow-hidden"
                >
                  <img
                    src={STARTER_PERSONAS[0].avatar}
                    alt="Sarah"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 px-4">
          <div className="max-w-7xl mx-auto grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="handcrafted-card !bg-brand-accent p-10 md:p-14 rounded-[3rem] relative overflow-hidden">
              <div className="relative z-10">
                <div className="organic-pill inline-flex items-center gap-2 mb-6 bg-white text-brand-ink border-brand-ink shadow-[2px_2px_0px_0px_rgba(18,18,18,1)]">
                  <Code className="h-3.5 w-3.5" />
                  Ready to connect an agent?
                </div>
                <h2 className="text-4xl md:text-6xl font-black mb-8 leading-none text-white">
                  Install the QA MCP, then ship with proof.
                </h2>
                <p className="text-lg md:text-xl font-bold text-white mb-10 max-w-xl leading-relaxed">
                  The primary path is hosted MCP: create a key, paste the config, and make QA a required step before your agent finishes work.
                </p>
                <button
                  type="button"
                  onClick={onOpenMcpSettings}
                  className="bg-brand-ink text-white px-9 py-5 rounded-3xl font-black text-xl hover:scale-[1.02] transition-all shadow-[8px_8px_0px_0px_rgba(255,255,255,0.3)] flex items-center gap-3"
                >
                  Create MCP key
                  <ArrowRight className="w-6 h-6" />
                </button>

                <div className="mt-10 flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {STARTER_PERSONAS.map((persona) => (
                      <img
                        key={persona.id}
                        src={persona.avatar}
                        className="w-12 h-12 rounded-full border-2 border-brand-ink bg-white shadow-sm"
                        alt="Agent"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-brand-ink">Personas ready</span>
                </div>
              </div>
            </div>

            <div className="handcrafted-card rounded-[3rem] bg-white p-8 md:p-10">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <span className="text-brand-accent font-black uppercase tracking-[0.2em] text-xs">Secondary path</span>
                  <h3 className="mt-3 text-3xl font-black text-brand-ink">Need one quick site report?</h3>
                  <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                    Use this when you are not installing MCP yet. Agents still run a real browser test and email a shareable report.
                  </p>
                </div>
                <Globe className="hidden h-10 w-10 shrink-0 text-brand-secondary sm:block" />
              </div>

              {!queued ? (
                <form onSubmit={handleSubmit} className="mt-8 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Website</span>
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-ink bg-white px-4 py-4">
                      <Globe className="text-slate-400 w-5 h-5" />
                      <span className="text-slate-300 font-bold">https://</span>
                      <input
                        type="text"
                        placeholder="yourwebsite.com"
                        required
                        className="w-full min-w-0 bg-transparent outline-none font-bold placeholder:text-slate-300"
                        value={site}
                        onChange={(event) => setSite(event.target.value.replace(/^https?:\/\//, ""))}
                      />
                    </div>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</span>
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-ink bg-white px-4 py-4">
                      <Mail className="text-slate-400 w-5 h-5" />
                      <input
                        type="email"
                        placeholder="you@company.com"
                        required
                        className="w-full min-w-0 bg-transparent outline-none font-bold placeholder:text-slate-300"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>
                  </label>
                  <button
                    disabled={loading}
                    className="mt-2 bg-brand-ink text-white px-8 py-5 rounded-2xl font-black text-lg hover:bg-brand-accent transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? "Starting report..." : "Start one-off report"}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </form>
              ) : (
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-8 rounded-3xl border-2 border-brand-secondary bg-brand-secondary/10 p-6"
                >
                  <div className="w-14 h-14 bg-brand-secondary rounded-2xl flex items-center justify-center mb-4">
                    <Clock className="text-white w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">Report started</h3>
                  <p className="font-bold text-slate-600">
                    {queued.message || `Our agents are checking ${site} now. Watch your inbox for the report.`}
                  </p>
                  {queued.share_url ? (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <a
                        href={queued.share_url}
                        className="bg-brand-ink text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-brand-accent transition-all"
                      >
                        Open shared report
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(queued.share_url || "")}
                        className="rounded-2xl border-2 border-brand-ink px-6 py-3 font-black text-sm"
                      >
                        Copy report link
                      </button>
                    </div>
                  ) : null}
                </motion.div>
              )}

              {error ? <p className="mt-4 text-sm font-bold text-brand-danger">{error}</p> : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-4 border-t-2 border-brand-muted max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-ink rounded-lg flex items-center justify-center">
            <Sparkles className="text-brand-accent w-5 h-5" />
          </div>
          <span className="font-display text-xl font-black tracking-tighter">
            beforeusersdo<span className="text-brand-accent">.</span>
          </span>
        </div>
        <div className="flex gap-8 text-xs font-black uppercase tracking-widest text-slate-400">
          <a href="#" className="hover:text-brand-ink">Privacy</a>
          <a href="#" className="hover:text-brand-ink">Terms</a>
          <a href="#" className="hover:text-brand-ink">Twitter</a>
        </div>
        <p className="text-xs font-bold text-slate-400">© 2026 Before Users Do. All rights reserved.</p>
      </footer>
    </div>
  );
}

function AuthGate({
  message,
  tone,
  onSubmit
}: {
  message: string;
  tone: "neutral" | "success" | "danger";
  onSubmit: (email: string, inviteCode: string) => Promise<void>;
}) {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [passwordOrInvite, setPasswordOrInvite] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setLocalError("");
    try {
      await onSubmit(email, isLogin ? "" : passwordOrInvite || DEFAULT_SIGNUP_INVITE_CODE);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not send sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  function handleSocialClick() {
    setLocalError("Use email for this build. Social sign-in is not wired yet.");
  }

  const resolvedMessage = localError || message;
  const resolvedTone = localError ? "danger" : tone;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4" data-app-shell="auth-gate">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="mb-12 cursor-pointer flex justify-center">
          <Logo />
        </div>

        <div className="handcrafted-card bg-white p-8 md:p-10 rounded-[3rem]">
          <h2 className="text-3xl font-black mb-2 text-center">
            {isLogin ? "Welcome back!" : "Join the fleet"}
          </h2>
          <p className="text-slate-500 font-bold text-center mb-8">
            {isLogin ? "We will email you a sign-in link." : "Start testing at the speed of light."}
          </p>

          <div className="space-y-4 mb-8">
            <button onClick={handleSocialClick} className="w-full handcrafted-card p-4 rounded-2xl flex items-center justify-center gap-3 font-black hover:bg-brand-muted/20 transition-all">
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
              Continue with Google
            </button>
            <button onClick={handleSocialClick} className="w-full handcrafted-card p-4 rounded-2xl flex items-center justify-center gap-3 font-black hover:bg-brand-muted/20 transition-all">
              <div className="w-5 h-5 bg-brand-ink rounded flex items-center justify-center">
                <Globe className="text-white w-3 h-3" />
              </div>
              Continue with GitHub
            </button>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-brand-muted"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-black tracking-widest">
              <span className="bg-white px-4 text-slate-400">Or use email</span>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isLogin ? (
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Full Name</label>
                <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                  <Star className="text-slate-300 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    className="bg-transparent outline-none w-full font-bold"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Email Address</label>
              <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                <Mail className="text-slate-300 w-5 h-5" />
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="bg-transparent outline-none w-full font-bold"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            {!isLogin ? (
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Invite Code</label>
                <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                  <Shield className="text-slate-300 w-5 h-5" />
                  <input
                    type="text"
                    placeholder={DEFAULT_SIGNUP_INVITE_CODE}
                    className="bg-transparent outline-none w-full font-bold"
                    value={passwordOrInvite}
                    onChange={(event) => setPasswordOrInvite(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                Enter your email and we&apos;ll send a magic link.
              </p>
            )}

            <button className="w-full bg-brand-accent text-white p-5 rounded-2xl font-black text-xl hover:bg-brand-ink transition-all shadow-xl mt-4">
              {loading ? "Sending..." : isLogin ? "Send Sign-In Link" : "Create Account"}
            </button>
          </form>

          {resolvedMessage ? (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
                resolvedTone === "success"
                  ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary"
                  : resolvedTone === "danger"
                    ? "border-brand-danger/20 bg-brand-danger/10 text-brand-danger"
                    : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {resolvedMessage}
            </div>
          ) : null}

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsLogin((current) => !current)}
              className="text-sm font-black text-brand-accent hover:text-brand-ink transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
            </button>
          </div>
        </div>

        <button
          onClick={() => (window.location.href = "/")}
          className="mt-8 flex items-center gap-2 mx-auto text-sm font-black text-slate-400 hover:text-brand-ink transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Back to homepage
        </button>
      </motion.div>
    </div>
  );
}

function LoadingShell({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg" data-app-shell="loading">
      <div className="flex items-center gap-3 rounded-lg border border-brand-line bg-brand-shell px-4 py-3 text-sm text-brand-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function App() {
  const { route, navigate } = useBrowserRoute();
  const [authState, setAuthState] = useState<AuthState>({
    ready: false,
    authorized: false,
    user: null,
    message: "",
    tone: "neutral"
  });

  const pathname = route.pathname;
  const isWorkspaceRoute = pathname === "/dashboard" || pathname === "/reports";

  async function refreshSession() {
    try {
      const response = await apiFetch<{ ok: boolean; user: AuthUser | null }>("/api/auth/session");
      setAuthState({
        ready: true,
        authorized: true,
        user: response.user || null,
        message: "",
        tone: "neutral"
      });
      return response.user || null;
    } catch {
      setAuthState((current) => ({
        ...current,
        ready: true,
        authorized: false,
        user: null
      }));
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      const hash = String(window.location.hash || "").replace(/^#/, "");
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = String(params.get("access_token") || "").trim();
        const refreshToken = String(params.get("refresh_token") || "").trim();
        const authError = String(params.get("error_description") || params.get("error") || "").trim();

        if (authError) {
          cleanupAuthCallbackUrl();
          if (!cancelled) {
            setAuthState((current) => ({
              ...current,
              message: authError.replaceAll("+", " "),
              tone: "danger"
            }));
          }
        } else if (accessToken && refreshToken) {
          try {
            await apiFetch("/api/auth/exchange", {
              method: "POST",
              body: {
                access_token: accessToken,
                refresh_token: refreshToken
              }
            });
            cleanupAuthCallbackUrl();
            if (!cancelled) {
              setAuthState((current) => ({
                ...current,
                message: "Sign-in complete.",
                tone: "success"
              }));
            }
          } catch (caught) {
            cleanupAuthCallbackUrl();
            if (!cancelled) {
              setAuthState((current) => ({
                ...current,
                message: caught instanceof Error ? caught.message : "Sign-in link expired.",
                tone: "danger"
              }));
            }
          }
        }
      }

      await refreshSession();
    }

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRequestMagicLink(email: string, inviteCode: string) {
    const endpoint = inviteCode ? "/api/auth/signup" : "/api/auth/signin";
    const body = inviteCode
      ? {
          email,
          invite_code: inviteCode,
          redirect_to: getMagicLinkRedirectUrl()
        }
      : {
          email,
          redirect_to: getMagicLinkRedirectUrl()
        };

    const response = await apiFetch<{ message?: string }>(endpoint, {
      method: "POST",
      body
    });

    setAuthState((current) => ({
      ...current,
      message: response.message || (inviteCode ? "Check your email for your sign-in link." : "Check your email for your sign-in link."),
      tone: "success"
    }));
  }

  async function handleSignOut() {
    await apiFetch("/api/auth/signout", { method: "POST" });
    setAuthState({
      ready: true,
      authorized: false,
      user: null,
      message: "Signed out.",
      tone: "success"
    });
    navigate("/dashboard", new URLSearchParams(), true);
  }

  if (!authState.ready && isWorkspaceRoute) {
    return <LoadingShell label="Opening your tests..." />;
  }

  if (!isWorkspaceRoute) {
    return (
      <HomePage
        authorized={authState.authorized}
        onOpenWorkspace={() => navigate("/dashboard")}
        onOpenMcpSettings={() => {
          const next = new URLSearchParams();
          next.set("panel", "settings");
          navigate("/dashboard", next);
        }}
      />
    );
  }

  return (
    <WorkspacePage
      route={route}
      navigate={navigate}
      authState={authState}
      onRequestMagicLink={handleRequestMagicLink}
      onRefreshSession={refreshSession}
      onSignOut={handleSignOut}
    />
  );
}

function WorkspacePage({
  route,
  navigate,
  authState,
  onRequestMagicLink,
  onRefreshSession,
  onSignOut
}: {
  route: RouteState;
  navigate: ReturnType<typeof useBrowserRoute>["navigate"];
  authState: AuthState;
  onRequestMagicLink: (email: string, inviteCode: string) => Promise<void>;
  onRefreshSession: () => Promise<AuthUser | null>;
  onSignOut: () => Promise<void>;
}) {
  const params = new URLSearchParams(route.search);
  const sharedRunId = String(params.get("run_id") || "").trim();
  const shareKey = String(params.get("share_key") || "").trim();
  const isSharedView = Boolean(sharedRunId && shareKey);
  const currentView = String(params.get("view") || "report").toLowerCase() === "live" ? "live" : "report";
  const composeOpen = params.get("compose") === "1";
  const composeMode = params.get("compose_mode") === "advanced" ? "advanced" : "simple";
  const requestedRunId = String(params.get("run_id") || "").trim();
  const requestedManualSessionId = String(params.get("session_id") || params.get("manual_session_id") || "").trim();
  const selectedBrandFilter = normalizeBrandKey(params.get("brand") || "");
  const currentPanel = String(params.get("panel") || (requestedManualSessionId ? "manual_qa" : requestedRunId ? "report" : "overview")).toLowerCase();
  const githubAppStatus = String(params.get("github_app_status") || "").trim().toLowerCase();
  const githubAppError = String(params.get("github_app_error") || "").trim().toLowerCase();
  const githubAppBrand = normalizeBrandKey(params.get("github_app_brand") || params.get("brand") || "");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [starterPersonas, setStarterPersonas] = useState<StarterPersona[]>(STARTER_PERSONAS);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [reports, setReports] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [workspaceBootstrapped, setWorkspaceBootstrapped] = useState(() => isSharedView || !authState.authorized);
  const [runsError, setRunsError] = useState("");
  const [selectedReport, setSelectedReport] = useState<QaReport | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [manualQaSession, setManualQaSession] = useState<ManualQaSession | null>(null);
  const [manualQaLoading, setManualQaLoading] = useState(false);
  const [manualQaError, setManualQaError] = useState("");
  const [manualQaBusyItemId, setManualQaBusyItemId] = useState("");
  const [manualQaCopyFeedback, setManualQaCopyFeedback] = useState("");
  const [shareState, setShareState] = useState<ShareResponse | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [workerSummary, setWorkerSummary] = useState<WorkerSummary | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [repoConnection, setRepoConnection] = useState<RepoConnection | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [repoConnectionReloadKey, setRepoConnectionReloadKey] = useState(0);
  const [mcpTokens, setMcpTokens] = useState<McpTokenSummary[]>([]);
  const [mcpTokensLoading, setMcpTokensLoading] = useState(false);
  const [mcpTokenError, setMcpTokenError] = useState("");
  const [createdMcpToken, setCreatedMcpToken] = useState("");
  const [repoRoutes, setRepoRoutes] = useState<RepoRouteSuggestion[]>([]);
  const [repoRoutesLoading, setRepoRoutesLoading] = useState(false);
  const [repoRoutesError, setRepoRoutesError] = useState("");
  const githubInstallPopupRef = useRef<Window | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduleTone, setScheduleTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchMessage, setLaunchMessage] = useState("");
  const [launchTone, setLaunchTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [scheduleDraft, setScheduleDraft] = useState({
    frequency_hours: 24,
    mission: DEFAULT_GOALS.join("\n"),
    persona: DEFAULT_PERSONA
  });
  const [operatorState, setOperatorState] = useState<OperatorState>({
    open: false,
    loading: false,
    error: "",
    brands: [],
    packs: [],
    selectedBrandId: "",
    selectedPackId: "",
    actionMessage: "",
    actionTone: "neutral",
    preparing: false,
    preflighting: false,
    queueing: false,
    prepareJob: null,
    preflight: null,
    queueBatch: null,
    queueStatuses: {},
    liveMode: false,
    noHumanActions: false
  });
  const [brandEditor, setBrandEditor] = useState({
    brand_profile_id: "",
    display_name: "",
    brand_key: "",
    track: "startup",
    website_url: "",
    mailbox_email: "",
    mailbox_provider: "custom",
    mailbox_username: "",
    mailbox_host: "",
    mailbox_port: "993",
    mailbox_secure: true,
    mailbox_smtp_host: "",
    mailbox_smtp_port: "587",
    mailbox_smtp_secure: false,
    mailbox_password: "",
    saving: false,
    message: "",
    tone: "neutral" as "neutral" | "success" | "danger"
  });

  const [launchDraft, setLaunchDraft] = useState<LaunchDraft>({
    targetUrl: "",
    brandKey: selectedBrandFilter || "",
    brandName: inferBrandName(selectedBrandFilter || ""),
    runMode: "live_qa",
    browserMode: "standard_browser",
    validationTarget: "public_flow",
    accessMethod: "none",
    authUrl: "",
    authUsername: "",
    authPassword: "",
    scopeMode: "core_20m",
    persona: DEFAULT_PERSONA,
    goalsText: DEFAULT_GOALS.join("\n"),
    userJob: "",
    entryPath: "",
    routeHintsText: "",
    successSignalsText: "",
    repoTriageEnabled: false,
    selectedRepoFullName: ""
  });
  const launchDraftSeededRef = useRef(false);
  const advancedBrowserRuntime = describeAdvancedBrowserRuntime(workers, workerSummary);

  const projectCatalog = buildProjectCatalog(projects, reports);
  const currentBrandKey =
    selectedBrandFilter ||
    normalizeBrandKey(
      selectedReport?.metadata?.brand_key as string ||
        selectedReport?.metadata?.brandKey as string ||
        manualQaSession?.brand_key ||
        reports.find((item) => item.run_id === requestedRunId)?.brand_key ||
        launchDraft.brandKey
    );
  const currentProject =
    projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey) || null;

  const selectedRun = reports.find((item) => item.run_id === requestedRunId) || null;
  const filteredRuns = reports.filter((run) => {
    if (selectedBrandFilter && normalizeBrandKey(run.brand_key || "") !== selectedBrandFilter) {
      return false;
    }
    if (statusFilter !== "all" && String(run.status || run.queue_status || "").toLowerCase() !== statusFilter) {
      return false;
    }
    if (deferredSearchTerm) {
      const haystack = [
        run.run_id,
        run.brand_name,
        run.brand_key,
        run.target_url,
        run.persona,
        run.goal
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(deferredSearchTerm.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
  const sameBrandRuns = reports.filter((run) => normalizeBrandKey(run.brand_key || "") === currentBrandKey);
  const currentSchedule = schedules.find((item) => normalizeBrandKey(item.brand_key || "") === currentBrandKey) || null;
  const currentAlerts = alerts.filter((item) => normalizeBrandKey(item.brand_key || "") === currentBrandKey);
  const primaryFinding = getPrimaryFinding(selectedReport);
  const starterBrands = buildStarterBrands(projects, reports, repoConnection);
  const activeStarterBrand =
    starterBrands.find((brand) => normalizeBrandKey(brand.id) === currentBrandKey) ||
    (currentBrandKey
      ? {
          id: currentBrandKey,
          name: inferBrandName(currentBrandKey),
          website: selectedRun?.target_url || projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.target_url || `https://${currentBrandKey}.com`,
          githubConnected: Boolean(repoConnection?.selected_repo_full_name)
        }
      : null) ||
    starterBrands[0] ||
    null;
  const historyRows = buildStarterHistoryRows(sameBrandRuns.length ? sameBrandRuns : reports);
  const liveAgents = buildStarterLiveAgents(sameBrandRuns.length ? sameBrandRuns : reports);
  const frictionRows = buildStarterFrictionRows(selectedReport, sameBrandRuns.length ? sameBrandRuns : reports);
  const trendData = buildTrendData(sameBrandRuns.length ? sameBrandRuns : reports);
  const emptyWorkspace = workspaceBootstrapped && !projectCatalog.length && !reports.length;
  const onboardingSeen = authState.user?.onboarding_seen === true;
  const workspaceState = !workspaceBootstrapped || runsLoading ? "loading" : runsError ? "error" : "ready";
  const detailState = detailLoading ? "loading" : detailError ? "error" : selectedReport ? "ready" : "empty";

  useEffect(() => {
    if (isSharedView || !authState.authorized) {
      setWorkspaceBootstrapped(true);
      return;
    }
    setWorkspaceBootstrapped(false);
  }, [authState.authorized, isSharedView]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.opener || window.opener === window) {
      return;
    }
    if (!githubAppStatus && !githubAppError) {
      return;
    }

    try {
      window.opener.postMessage(
        {
          type: GITHUB_APP_POPUP_MESSAGE,
          status: githubAppStatus || null,
          error: githubAppError || null,
          brand_key: githubAppBrand || null
        },
        window.location.origin
      );
    } catch {
      // Ignore message failures and still try to close the popup.
    }

    const closeTimer = window.setTimeout(() => {
      window.close();
    }, 40);

    return () => {
      window.clearTimeout(closeTimer);
    };
  }, [githubAppBrand, githubAppError, githubAppStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleGitHubPopupMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }
      const payload = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : null;
      if (!payload || payload.type !== GITHUB_APP_POPUP_MESSAGE) {
        return;
      }

      if (githubInstallPopupRef.current && !githubInstallPopupRef.current.closed) {
        githubInstallPopupRef.current.close();
      }
      githubInstallPopupRef.current = null;

      const brandKey = normalizeBrandKey(String(payload.brand_key || ""));
      const status = String(payload.status || "").trim().toLowerCase();
      const error = String(payload.error || "").trim();
      const nextPanel =
        currentPanel === "settings" || status === "repo_selection_required"
          ? "settings"
          : "overview";

      const next = new URLSearchParams(route.search);
      if (brandKey) {
        next.set("brand", brandKey);
      }
      next.set("panel", nextPanel);
      next.delete("github_app_status");
      next.delete("github_app_error");
      next.delete("github_app_brand");
      navigate("/dashboard", next, true);

      refreshWorkspaceLists().catch(() => null);
      setRepoConnectionReloadKey((current) => current + 1);
      setRepoError(error ? `GitHub setup failed: ${error.replace(/_/g, " ")}` : "");
    }

    window.addEventListener("message", handleGitHubPopupMessage);
    return () => {
      window.removeEventListener("message", handleGitHubPopupMessage);
    };
  }, [currentPanel, navigate, route.search]);

  useEffect(() => {
    if (isSharedView) {
      return;
    }
    if (!authState.authorized) {
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      setRunsLoading(true);
      setMcpTokensLoading(true);
      setRunsError("");
      setMcpTokenError("");

      const results = await Promise.allSettled([
        apiFetch<{ items: ProjectSummary[] }>("/api/qa/projects"),
        apiFetch<{ items: RunSummary[] }>("/api/qa/reports", {
          params: { limit: 120, offset: 0 }
        }),
        apiFetch<{ items: ScheduleItem[] }>("/api/qa/schedules"),
        apiFetch<{ items: AlertItem[] }>("/api/qa/alerts", {
          params: { status: "open" }
        }),
        apiFetch<{ items: WorkerInfo[]; summary: WorkerSummary }>("/api/qa/workers"),
        apiFetch<{ items: McpTokenSummary[] }>("/api/mcp-tokens")
      ]);

      if (cancelled) {
        return;
      }

      const [projectsResult, reportsResult, schedulesResult, alertsResult, workersResult, mcpTokensResult] = results;
      const nextWorkspaceErrors: string[] = [];

      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value.items || []);
      } else {
        nextWorkspaceErrors.push(
          projectsResult.reason instanceof Error ? projectsResult.reason.message : "Could not load brands."
        );
      }
      if (reportsResult.status === "fulfilled") {
        setReports(reportsResult.value.items || []);
      } else {
        nextWorkspaceErrors.push(
          reportsResult.reason instanceof Error ? reportsResult.reason.message : "Could not load tests."
        );
      }
      if (schedulesResult.status === "fulfilled") {
        setSchedules(schedulesResult.value.items || []);
      }
      if (alertsResult.status === "fulfilled") {
        setAlerts(alertsResult.value.items || []);
      }
      if (workersResult.status === "fulfilled") {
        setWorkers(workersResult.value.items || []);
        setWorkerSummary(workersResult.value.summary || null);
      }
      if (mcpTokensResult.status === "fulfilled") {
        setMcpTokens(mcpTokensResult.value.items || []);
        setMcpTokenError("");
      } else {
        setMcpTokens([]);
        setMcpTokenError(
          mcpTokensResult.reason instanceof Error ? mcpTokensResult.reason.message : "Could not load MCP tokens."
        );
      }

      setRunsError(nextWorkspaceErrors[0] || "");
      setRunsLoading(false);
      setMcpTokensLoading(false);
      setWorkspaceBootstrapped(true);
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [authState.authorized, isSharedView]);

  useEffect(() => {
    if (isSharedView) {
      return;
    }
    if (!authState.authorized) {
      return;
    }
    if (currentPanel !== "report") {
      return;
    }
    if (requestedRunId || composeOpen) {
      return;
    }
    const nextRun = filteredRuns[0] || reports[0];
    if (!nextRun) {
      return;
    }
    const nextParams = new URLSearchParams(route.search);
    nextParams.set("run_id", nextRun.run_id);
    if (nextRun.brand_key) {
      nextParams.set("brand", nextRun.brand_key);
    }
    nextParams.set("view", "report");
    navigate(route.pathname, nextParams, true);
  }, [authState.authorized, composeOpen, currentPanel, filteredRuns, isSharedView, navigate, reports, requestedRunId, route.pathname, route.search]);

  useEffect(() => {
    if (!currentBrandKey || isSharedView || !authState.authorized) {
      setRepoConnection(null);
      return;
    }

    let cancelled = false;
    async function loadRepoConnection() {
      setRepoLoading(true);
      setRepoError("");
      try {
        const response = await apiFetch<{
          connection: RepoConnection | null;
          repositories: RepoConnection["repositories"];
          warning?: string | null;
        }>("/api/qa/github-app/connection", {
          params: {
            brand_key: currentBrandKey,
            include_repositories: 1,
            reconcile: 1
          }
        });
        if (!cancelled) {
          setRepoConnection({
            ...(response.connection || {}),
            repositories: response.repositories || response.connection?.repositories || []
          });
          if (response.warning) {
            setRepoError(response.warning);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setRepoConnection(null);
          setRepoError(caught instanceof Error ? caught.message : "Could not load repository connection.");
        }
      } finally {
        if (!cancelled) {
          setRepoLoading(false);
        }
      }
    }
    loadRepoConnection();
    return () => {
      cancelled = true;
    };
  }, [authState.authorized, currentBrandKey, isSharedView, repoConnectionReloadKey]);

  useEffect(() => {
    if (
      !composeOpen ||
      launchDraft.runMode !== "controlled_ux" ||
      !currentBrandKey ||
      isSharedView ||
      !authState.authorized ||
      repoConnection?.connection_status !== "connected" ||
      !repoConnection?.selected_repo_full_name
    ) {
      setRepoRoutes([]);
      setRepoRoutesError("");
      setRepoRoutesLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRepoRoutes() {
      setRepoRoutesLoading(true);
      setRepoRoutesError("");
      try {
        const response = await apiFetch<{
          routes: RepoRouteSuggestion[];
        }>("/api/qa/github-app/routes", {
          params: {
            brand_key: currentBrandKey
          }
        });
        if (!cancelled) {
          setRepoRoutes(response.routes || []);
        }
      } catch (caught) {
        if (!cancelled) {
          setRepoRoutes([]);
          setRepoRoutesError(caught instanceof Error ? caught.message : "Could not load route hints.");
        }
      } finally {
        if (!cancelled) {
          setRepoRoutesLoading(false);
        }
      }
    }

    loadRepoRoutes();
    return () => {
      cancelled = true;
    };
  }, [
    authState.authorized,
    composeOpen,
    currentBrandKey,
    isSharedView,
    launchDraft.runMode,
    repoConnection?.connection_status,
    repoConnection?.selected_repo_full_name
  ]);

  useEffect(() => {
    if (!composeOpen || isSharedView || !authState.authorized) {
      return;
    }
    refreshWorkerHealth().catch(() => null);
  }, [authState.authorized, composeOpen, isSharedView]);

  useEffect(() => {
    if (!requestedRunId) {
      setSelectedReport(null);
      setSelectedStatus(null);
      setShareState(null);
      return;
    }

    let cancelled = false;

    async function loadRunDetail() {
      setDetailLoading(true);
      setDetailError("");
      const sharedParams = shareKey ? { run_id: requestedRunId, share_key: shareKey } : { run_id: requestedRunId };
      const results = await Promise.allSettled([
        apiFetch<{ report: QaReport }>("/api/qa/report", { params: sharedParams }),
        apiFetch<StatusResponse>("/api/qa/status", { params: sharedParams }),
        !isSharedView ? apiFetch<ShareResponse>("/api/qa/share", { params: { run_id: requestedRunId } }) : Promise.resolve(null)
      ]);

      if (cancelled) {
        return;
      }

      const [reportResult, statusResult, shareResult] = results;

      if (reportResult.status === "fulfilled") {
        setSelectedReport(reportResult.value.report || null);
      } else {
        setSelectedReport(null);
        setDetailError(reportResult.reason instanceof Error ? reportResult.reason.message : "Could not load report.");
      }

      if (statusResult.status === "fulfilled") {
        setSelectedStatus(statusResult.value || null);
      } else {
        setSelectedStatus(null);
      }

      if (shareResult && shareResult.status === "fulfilled") {
        setShareState(shareResult.value || null);
      }

      setDetailLoading(false);
    }

    loadRunDetail();
    return () => {
      cancelled = true;
    };
  }, [isSharedView, requestedRunId, shareKey]);

  useEffect(() => {
    if (isSharedView || currentPanel !== "manual_qa" || !requestedManualSessionId) {
      if (currentPanel !== "manual_qa") {
        setManualQaError("");
      }
      return;
    }

    let cancelled = false;

    async function loadManualQaSession() {
      setManualQaLoading(true);
      setManualQaError("");
      try {
        const response = await apiFetch<{ session: ManualQaSession }>("/api/manual-qa/sessions", {
          params: { session_id: requestedManualSessionId }
        });
        if (!cancelled) {
          setManualQaSession(response.session || null);
        }
      } catch (caught) {
        if (!cancelled) {
          setManualQaSession(null);
          setManualQaError(caught instanceof Error ? caught.message : "Could not load manual QA session.");
        }
      } finally {
        if (!cancelled) {
          setManualQaLoading(false);
        }
      }
    }

    loadManualQaSession();
    return () => {
      cancelled = true;
    };
  }, [currentPanel, isSharedView, requestedManualSessionId]);

  useEffect(() => {
    if (!requestedRunId || !selectedStatus) {
      return;
    }
    const status = String(selectedStatus.queue?.queue_status || selectedStatus.report_status || "").toLowerCase();
    if (!["queued", "processing", "retryable"].includes(status)) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const nextStatus = await apiFetch<StatusResponse>("/api/qa/status", {
          params: shareKey ? { run_id: requestedRunId, share_key: shareKey } : { run_id: requestedRunId }
        });
        setSelectedStatus(nextStatus);
        if (nextStatus.report_ready) {
          const reportPayload = await apiFetch<{ report: QaReport }>("/api/qa/report", {
            params: shareKey ? { run_id: requestedRunId, share_key: shareKey } : { run_id: requestedRunId }
          });
          setSelectedReport(reportPayload.report || null);
          if (!isSharedView) {
            const reportsPayload = await apiFetch<{ items: RunSummary[] }>("/api/qa/reports", {
              params: { limit: 120, offset: 0 }
            });
            setReports(reportsPayload.items || []);
          }
        }
      } catch {
        // Ignore transient polling failures.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isSharedView, requestedRunId, selectedStatus, shareKey]);

  useEffect(() => {
    if (isSharedView || currentPanel !== "report" || currentView !== "live" || !requestedRunId) {
      return;
    }
    const status = String(
      selectedStatus?.queue?.queue_status ||
        selectedStatus?.report_status ||
        selectedReport?.status ||
        selectedRun?.status ||
        ""
    ).toLowerCase();
    const runIsActive = ["queued", "processing", "retryable"].includes(status);
    const reportIsReady = Boolean(selectedReport || selectedStatus?.report_ready || selectedRun?.report_ready);
    if (runIsActive || !reportIsReady) {
      return;
    }
    const next = new URLSearchParams(route.search);
    next.set("panel", "report");
    next.set("view", "report");
    next.set("run_id", requestedRunId);
    if (currentBrandKey) {
      next.set("brand", currentBrandKey);
    }
    navigate("/dashboard", next, true);
  }, [
    currentBrandKey,
    currentPanel,
    currentView,
    isSharedView,
    navigate,
    requestedRunId,
    route.search,
    selectedReport,
    selectedRun?.report_ready,
    selectedRun?.status,
    selectedStatus?.queue?.queue_status,
    selectedStatus?.report_ready,
    selectedStatus?.report_status
  ]);

  useEffect(() => {
    if (!selectedRun && !currentBrandKey) {
      return;
    }
    setLaunchDraft((current) => {
      if (composeOpen) {
        if (launchDraftSeededRef.current) {
          return current;
        }
        launchDraftSeededRef.current = true;
      } else {
        launchDraftSeededRef.current = false;
      }
      const projectDefaults = buildDraftFromProject(currentProject, repoConnection);
      const next = buildDraftFromRun(selectedRun, selectedReport, repoConnection);
      const nextDraft = {
        ...current,
        ...projectDefaults,
        ...next,
        brandKey: next.brandKey || projectDefaults.brandKey || currentBrandKey || current.brandKey,
        brandName:
          next.brandName ||
          projectDefaults.brandName ||
          inferBrandName(currentBrandKey || current.brandKey || "")
      };
      return launchDraftsMatch(current, nextDraft) ? current : nextDraft;
    });
    if (currentSchedule) {
      setScheduleDraft((current) => {
        const nextScheduleDraft = {
          frequency_hours: currentSchedule.frequency_hours || 24,
          mission: currentSchedule.mission || DEFAULT_GOALS.join("\n"),
          persona: currentSchedule.persona || DEFAULT_PERSONA
        };
        return current.frequency_hours === nextScheduleDraft.frequency_hours &&
          current.mission === nextScheduleDraft.mission &&
          current.persona === nextScheduleDraft.persona
          ? current
          : nextScheduleDraft;
      });
    }
  }, [composeOpen, currentBrandKey, currentProject, currentSchedule, repoConnection, selectedReport, selectedRun]);

  useEffect(() => {
    if (!operatorState.open || operatorState.loading || operatorState.brands.length) {
      return;
    }

    let cancelled = false;

    async function loadOperatorData() {
      setOperatorState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const brandsResponse = await apiFetch<{ brand_profiles: SubmissionBrandProfile[] }>("/api/submissions/brands", {
          params: { limit: 100 }
        });
        const nextBrands = brandsResponse.brand_profiles || [];
        const brand = nextBrands[0] || null;
        const packsResponse = await apiFetch<{ effective_product_packs?: SubmissionPack[]; product_packs?: SubmissionPack[] }>("/api/submissions/packs", {
          params: {
            track: brand?.track || "startup"
          }
        });
        if (!cancelled) {
          const packs = packsResponse.effective_product_packs || packsResponse.product_packs || [];
          setOperatorState((current) => ({
            ...current,
            loading: false,
            brands: nextBrands,
            packs,
            selectedBrandId: current.selectedBrandId || brand?.brand_profile_id || "",
            selectedPackId: current.selectedPackId || packs.find((item) => (item.effective_site_count || 0) > 0)?.pack_id || packs[0]?.pack_id || ""
          }));
        }
      } catch (caught) {
        if (!cancelled) {
          setOperatorState((current) => ({
            ...current,
            loading: false,
            error: caught instanceof Error ? caught.message : "Could not load operator tools."
          }));
        }
      }
    }

    loadOperatorData();
    return () => {
      cancelled = true;
    };
  }, [operatorState.brands.length, operatorState.loading, operatorState.open]);

  useEffect(() => {
    const selectedBrand = operatorState.brands.find((item) => item.brand_profile_id === operatorState.selectedBrandId);
    if (!selectedBrand) {
      return;
    }
    let cancelled = false;

    async function reloadPacksForTrack() {
      try {
        const response = await apiFetch<{ effective_product_packs?: SubmissionPack[]; product_packs?: SubmissionPack[] }>("/api/submissions/packs", {
          params: {
            track: selectedBrand.track || "startup"
          }
        });
        if (!cancelled) {
          const packs = response.effective_product_packs || response.product_packs || [];
          setOperatorState((current) => ({
            ...current,
            packs,
            selectedPackId:
              packs.find((item) => item.pack_id === current.selectedPackId)?.pack_id ||
              packs.find((item) => (item.effective_site_count || 0) > 0)?.pack_id ||
              packs[0]?.pack_id ||
              ""
          }));
        }
      } catch {
        // Ignore pack refresh failures until the user triggers an action.
      }
    }

    reloadPacksForTrack();
    return () => {
      cancelled = true;
    };
  }, [operatorState.brands, operatorState.selectedBrandId]);

  useEffect(() => {
    const selectedBrand = operatorState.brands.find((item) => item.brand_profile_id === operatorState.selectedBrandId) || null;
    const identity = selectedBrand?.profile?.identity || {};
    const mailbox = identity?.mailbox || {};
    setBrandEditor((current) => ({
      ...current,
      brand_profile_id: selectedBrand?.brand_profile_id || current.brand_profile_id || "",
      display_name: selectedBrand?.display_name || "",
      brand_key: selectedBrand?.brand_key || "",
      track: selectedBrand?.track || "startup",
      website_url: selectedBrand?.website_url || "",
      mailbox_email: mailbox.email || "",
      mailbox_provider: mailbox.provider || "custom",
      mailbox_username: mailbox.username || mailbox.email || "",
      mailbox_host: mailbox.host || "",
      mailbox_port: mailbox.port ? String(mailbox.port) : "993",
      mailbox_secure: mailbox.secure !== false,
      mailbox_smtp_host: mailbox.smtp_host || "",
      mailbox_smtp_port: mailbox.smtp_port ? String(mailbox.smtp_port) : "587",
      mailbox_smtp_secure: mailbox.smtp_secure === true,
      mailbox_password: mailbox.password || "",
      message: "",
      tone: "neutral"
    }));
  }, [operatorState.brands, operatorState.selectedBrandId]);

  async function refreshWorkspaceLists() {
    if (!authState.authorized || isSharedView) {
      return;
    }
    setMcpTokensLoading(true);
    const [projectsResponse, reportsResponse, schedulesResponse, alertsResponse, workersResponse, mcpTokensResponse] = await Promise.allSettled([
      apiFetch<{ items: ProjectSummary[] }>("/api/qa/projects"),
      apiFetch<{ items: RunSummary[] }>("/api/qa/reports", { params: { limit: 120, offset: 0 } }),
      apiFetch<{ items: ScheduleItem[] }>("/api/qa/schedules"),
      apiFetch<{ items: AlertItem[] }>("/api/qa/alerts", { params: { status: "open" } }),
      apiFetch<{ items: WorkerInfo[]; summary: WorkerSummary }>("/api/qa/workers"),
      apiFetch<{ items: McpTokenSummary[] }>("/api/mcp-tokens")
    ]);
    const nextWorkspaceErrors: string[] = [];
    if (projectsResponse.status === "fulfilled") {
      setProjects(projectsResponse.value.items || []);
    } else {
      nextWorkspaceErrors.push(
        projectsResponse.reason instanceof Error ? projectsResponse.reason.message : "Could not load brands."
      );
    }
    if (reportsResponse.status === "fulfilled") {
      setReports(reportsResponse.value.items || []);
    } else {
      nextWorkspaceErrors.push(
        reportsResponse.reason instanceof Error ? reportsResponse.reason.message : "Could not load tests."
      );
    }
    if (schedulesResponse.status === "fulfilled") {
      setSchedules(schedulesResponse.value.items || []);
    }
    if (alertsResponse.status === "fulfilled") {
      setAlerts(alertsResponse.value.items || []);
    }
    if (workersResponse.status === "fulfilled") {
      setWorkers(workersResponse.value.items || []);
      setWorkerSummary(workersResponse.value.summary || null);
    }
    if (mcpTokensResponse.status === "fulfilled") {
      setMcpTokens(mcpTokensResponse.value.items || []);
      setMcpTokenError("");
    } else {
      setMcpTokenError(
        mcpTokensResponse.reason instanceof Error ? mcpTokensResponse.reason.message : "Could not load MCP tokens."
      );
    }
    setMcpTokensLoading(false);
    setRunsError(nextWorkspaceErrors[0] || "");
  }

  async function refreshWorkerHealth() {
    if (!authState.authorized || isSharedView) {
      return null;
    }
    const response = await apiFetch<{ items: WorkerInfo[]; summary: WorkerSummary }>("/api/qa/workers");
    setWorkers(response.items || []);
    setWorkerSummary(response.summary || null);
    return response;
  }

  async function handleCreateMcpToken(name: string) {
    setMcpTokensLoading(true);
    setMcpTokenError("");
    try {
      const response = await apiFetch<{ token: string; item: McpTokenSummary }>("/api/mcp-tokens", {
        method: "POST",
        body: {
          name: name || "Coding agent MCP key"
        }
      });
      if (response.item) {
        setMcpTokens((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)]);
      }
      setCreatedMcpToken(response.token || "");
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create MCP token.";
      setMcpTokenError(message);
      throw caught;
    } finally {
      setMcpTokensLoading(false);
    }
  }

  async function handleRevokeMcpToken(tokenId: string) {
    if (!tokenId) {
      return;
    }
    setMcpTokensLoading(true);
    setMcpTokenError("");
    try {
      const response = await apiFetch<{ revoked?: boolean; item?: McpTokenSummary }>("/api/mcp-tokens", {
        method: "DELETE",
        params: {
          id: tokenId
        }
      });
      if (response.item) {
        setMcpTokens((current) => current.map((item) => (item.id === tokenId ? response.item as McpTokenSummary : item)));
      } else {
        setMcpTokens((current) =>
          current.map((item) => (item.id === tokenId ? { ...item, active: false, revoked_at: new Date().toISOString() } : item))
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not revoke MCP token.";
      setMcpTokenError(message);
      throw caught;
    } finally {
      setMcpTokensLoading(false);
    }
  }

  async function handleStarterOnboardingComplete(input: { name: string; website: string; connectGitHub: boolean }) {
    const targetUrl = input.website.startsWith("http") ? input.website : `https://${input.website}`;
    const brandKey = deriveBrandKeyFromUrl(targetUrl) || normalizeBrandKey(input.name) || `brand-${Date.now()}`;

    const response = await apiFetch<{ items?: ProjectSummary[] }>("/api/qa/projects", {
      method: "POST",
      body: {
        brand_key: brandKey,
        brand_name: input.name,
        target_url: targetUrl,
        metadata: {
          source: "beforeusersdo_ui_starter"
        }
      }
    });

    const savedProject =
      (response.items || []).find((item) => normalizeBrandKey(item.brand_key) === brandKey) ||
      response.items?.[0] ||
      ({
        brand_key: brandKey,
        brand_name: input.name,
        target_url: targetUrl,
        metadata: {
          source: "beforeusersdo_ui_starter"
        }
      } satisfies ProjectSummary);
    setProjects((current) => upsertProjectSummary(current, savedProject));
    setLaunchDraft((current) => ({
      ...current,
      targetUrl,
      brandKey,
      brandName: input.name
    }));
    try {
      await apiFetch("/api/auth/onboarding-seen", {
        method: "POST",
        body: {
          seen: true
        }
      });
      await onRefreshSession().catch(() => null);
    } catch {
      // Ignore onboarding persistence failures and continue to the dashboard.
    }

    const next = new URLSearchParams(route.search);
    next.set("brand", brandKey);
    next.set("panel", "overview");
    next.delete("run_id");
    next.delete("compose");
    next.delete("compose_mode");
    navigate("/dashboard", next);

    if (input.connectGitHub) {
      window.setTimeout(() => {
        handleGitHubInstallForBrand(brandKey).catch(() => null);
      }, 0);
    }
  }

  async function handleLaunchRun(payloadOverride?: Partial<LaunchDraft>, options: { retryOfRunId?: string | null } = {}) {
    const nextDraft = {
      ...launchDraft,
      ...(payloadOverride || {})
    };
    const browserMode = normalizeBrowserMode(nextDraft.browserMode);
    let nextWorkers = workers;
    let nextWorkerSummary = workerSummary;
    const currentProjectMetadata =
      currentProject?.metadata && typeof currentProject.metadata === "object"
        ? { ...currentProject.metadata }
        : {};
    delete (currentProjectMetadata as Record<string, unknown>).qa_profile;
    const projectQaProfile =
      currentProject?.metadata &&
      typeof currentProject.metadata === "object" &&
      currentProject.metadata.qa_profile &&
      typeof currentProject.metadata.qa_profile === "object"
        ? (currentProject.metadata.qa_profile as Record<string, unknown>)
        : {};
    const savedSessionAvailable = projectQaProfile.available === true;
    if (browserMode === "advanced_browser") {
      try {
        const refreshedWorkers = await refreshWorkerHealth();
        if (refreshedWorkers) {
          nextWorkers = refreshedWorkers.items || [];
          nextWorkerSummary = refreshedWorkers.summary || null;
        }
      } catch (caught) {
        setLaunchMessage(
          caught instanceof Error
            ? `Could not confirm the DO worker state before starting Advanced browser: ${caught.message}`
            : "Could not confirm the DO worker state before starting Advanced browser."
        );
        setLaunchTone("danger");
        return;
      }
      const runtime = describeAdvancedBrowserRuntime(nextWorkers, nextWorkerSummary);
      if (runtime.status !== "ready") {
        setLaunchMessage(runtime.detail);
        setLaunchTone("danger");
        return;
      }
    }
    if (browserMode === "advanced_browser" && nextDraft.validationTarget === "inside_product" && nextDraft.accessMethod === "saved_session") {
      setLaunchMessage("Advanced browser starts from a fresh DO worker session. Pick sign-up or a test login instead of an old saved account.");
      setLaunchTone("danger");
      return;
    }
    if (nextDraft.validationTarget === "inside_product") {
      if (
        nextDraft.accessMethod === "saved_session" &&
        !savedSessionAvailable
      ) {
        setLaunchMessage("There is no old saved account for this project yet. Start once with sign-up or a test login first.");
        setLaunchTone("danger");
        return;
      }
      if (
        nextDraft.accessMethod === "credentials" &&
        (!String(nextDraft.authUsername || "").trim() ||
          !String(nextDraft.authPassword || "").trim())
      ) {
        setLaunchMessage("Inside the product needs an old account, a test login, or sign-up enabled.");
        setLaunchTone("danger");
        return;
      }
    }
    if (nextDraft.accessMethod === "auth_url" && !normalizeUrlInput(nextDraft.authUrl)) {
      setLaunchMessage("Add a valid auth URL before starting the test.");
      setLaunchTone("danger");
      return;
    }
    if (
      nextDraft.accessMethod === "credentials" &&
      (!String(nextDraft.authUsername || "").trim() || !String(nextDraft.authPassword || "").trim())
    ) {
      setLaunchMessage("Add the test login email and password before starting the test.");
      setLaunchTone("danger");
      return;
    }
    if (
      nextDraft.runMode === "controlled_ux" &&
      !hasControlledUxFlowPlan(nextDraft)
    ) {
      setLaunchMessage("Controlled UX mode needs an entry path or at least one planned route. Otherwise it turns into generic live-site clicking.");
      setLaunchTone("danger");
      return;
    }
    setLaunchBusy(true);
    setLaunchMessage("");

    try {
      const payload = buildLaunchPayload(nextDraft, {
        retryOfRunId: options.retryOfRunId || null
      });
      const queued = await apiFetch<any>("/api/qa/run", {
        method: "POST",
        body: payload
      });

      const optimistic = buildOptimisticRunSummary(payload);
      setReports((current) => [optimistic, ...current.filter((item) => item.run_id !== optimistic.run_id)]);
      if (payload.metadata.brand_key) {
        try {
          const controlled = payload.metadata.controlled_ux && typeof payload.metadata.controlled_ux === "object"
            ? payload.metadata.controlled_ux
            : { enabled: false };
          const canonicalProjectTarget = currentProject?.target_url || payload.target_url;
          const nextProjectMetadata = buildProjectEnvironmentMetadata(currentProjectMetadata, payload.target_url, canonicalProjectTarget);
          await apiFetch("/api/qa/projects", {
            method: "POST",
            body: {
              brand_key: payload.metadata.brand_key,
              brand_name: payload.metadata.brand_name,
              target_url: canonicalProjectTarget,
              metadata: {
                ...nextProjectMetadata,
                source: "react_dashboard",
                repo_triage: {
                  enabled: payload.metadata.repo_triage?.enabled === true,
                  repo: payload.metadata.repo_triage?.repo || null
                },
                launch_defaults: {
                  qa_mode: payload.metadata.qa_mode,
                  browser_mode: browserMode,
                  execution_engine: payload.metadata.execution_engine,
                  validation_target: payload.metadata.validation_target,
                  access_method:
                    browserMode !== "advanced_browser" &&
                    nextDraft.validationTarget === "inside_product" &&
                    (nextDraft.accessMethod === "credentials" || nextDraft.accessMethod === "create_account")
                      ? "saved_session"
                      : payload.metadata.access_method,
                  auth_entry_url: payload.metadata.auth_entry_url || null,
                  scope_mode: payload.scope_mode,
                  persona: payload.brand_persona,
                  goals: payload.scenario_list,
                  goal: payload.metadata.goal || null,
                  selected_repo_full_name: nextDraft.selectedRepoFullName || null,
                  controlled_ux:
                    controlled && controlled.enabled === true
                      ? {
                          enabled: true,
                          user_job: controlled.user_job || null,
                          entry_path: controlled.entry_path || null,
                          route_hints: Array.isArray(controlled.route_hints) ? controlled.route_hints : [],
                          success_signals: Array.isArray(controlled.success_signals) ? controlled.success_signals : []
                        }
                      : {
                          enabled: false
                        }
                }
              }
            }
          });
        } catch {
          // Ignore project persistence failures; the run remains queued.
        }
      }
      try {
        await apiFetch("/api/auth/onboarding-seen", {
          method: "POST",
          body: {
            seen: true
          }
        });
      } catch {
        // Ignore onboarding persistence failures.
      }
      setLaunchMessage("Test queued. Opening the live reader.");
      setLaunchTone("success");

      const nextParams = new URLSearchParams(route.search);
      nextParams.set("run_id", payload.run_id);
      if (payload.metadata.brand_key) {
        nextParams.set("brand", String(payload.metadata.brand_key));
      }
      nextParams.set("panel", "report");
      nextParams.set("view", "live");
      nextParams.delete("compose");
      nextParams.delete("compose_mode");
      navigate("/dashboard", nextParams);
      setSelectedReport(null);
      setSelectedStatus({
        ok: true,
        run_id: payload.run_id,
        queue: queued.queue || {
          queue_status: "queued",
          status: "queued"
        },
        report_ready: false,
        report_status: "queued"
      } as StatusResponse);
      await refreshWorkspaceLists();
    } catch (caught) {
      setLaunchMessage(caught instanceof Error ? caught.message : "Could not queue the test.");
      setLaunchTone("danger");
    } finally {
      setLaunchBusy(false);
    }
  }

  async function handleCopyShareLink() {
    try {
      let nextShare = shareState;
      if (!nextShare?.enabled || !nextShare.share_url) {
        nextShare = await apiFetch<ShareResponse>("/api/qa/share", {
          method: "POST",
          params: {
            run_id: requestedRunId
          }
        });
        setShareState(nextShare);
      }
      await copyText(nextShare.share_url || "");
      setCopyFeedback("Copied");
      window.setTimeout(() => setCopyFeedback(""), 1400);
    } catch (caught) {
      setCopyFeedback(caught instanceof Error ? caught.message : "Could not copy link");
      window.setTimeout(() => setCopyFeedback(""), 1800);
    }
  }

  async function handleManualQaItemUpdate(item: ManualQaItem, status: ManualQaItem["status"], note: string, evidenceText: string) {
    if (!requestedManualSessionId) {
      setManualQaError("Manual QA session is missing.");
      return;
    }
    setManualQaBusyItemId(item.id);
    setManualQaError("");
    try {
      const evidenceUrls = evidenceText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      const response = await apiFetch<{ session: ManualQaSession }>("/api/manual-qa/items", {
        method: "PATCH",
        body: {
          session_id: requestedManualSessionId,
          item_id: item.id,
          status,
          note,
          evidence_urls: evidenceUrls
        }
      });
      setManualQaSession(response.session || null);
    } catch (caught) {
      setManualQaError(caught instanceof Error ? caught.message : "Could not save checklist item.");
    } finally {
      setManualQaBusyItemId("");
    }
  }

  async function handleManualQaExport() {
    if (!requestedManualSessionId) {
      setManualQaCopyFeedback("Missing session");
      window.setTimeout(() => setManualQaCopyFeedback(""), 1600);
      return;
    }
    try {
      const response = await apiFetch<{ markdown: string }>("/api/manual-qa/export", {
        params: { session_id: requestedManualSessionId }
      });
      await copyText(response.markdown || "");
      setManualQaCopyFeedback("Copied report");
      window.setTimeout(() => setManualQaCopyFeedback(""), 1600);
    } catch (caught) {
      setManualQaCopyFeedback(caught instanceof Error ? caught.message : "Could not export");
      window.setTimeout(() => setManualQaCopyFeedback(""), 2200);
    }
  }

  async function handleSaveSchedule(override?: {
    name?: string;
    frequency_hours: number;
    mission: string;
    persona: string;
  }) {
    if (!currentBrandKey) {
      setScheduleMessage("Pick a project first.");
      setScheduleTone("danger");
      return;
    }
    const nextScheduleDraft = override || scheduleDraft;
    if (override) {
      setScheduleDraft(nextScheduleDraft);
    }
    setScheduleSaving(true);
    try {
      await apiFetch("/api/qa/schedules", {
        method: "POST",
        body: {
          id: currentSchedule?.id,
          name: override?.name || currentSchedule?.name || null,
          brand_key: currentBrandKey,
          brand_name:
            projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.brand_name ||
            inferBrandName(currentBrandKey),
          target_url:
            selectedRun?.target_url ||
            projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.target_url ||
            launchDraft.targetUrl,
          frequency_hours: nextScheduleDraft.frequency_hours,
          scope_mode: launchDraft.scopeMode || "core_20m",
          persona: nextScheduleDraft.persona,
          mission: nextScheduleDraft.mission
        }
      });
      setScheduleMessage("Automation saved.");
      setScheduleTone("success");
      await refreshWorkspaceLists();
    } catch (caught) {
      setScheduleMessage(caught instanceof Error ? caught.message : "Could not save schedule.");
      setScheduleTone("danger");
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleRunScheduleNow(scheduleId: string) {
    try {
      await apiFetch("/api/qa/schedules/trigger", {
        method: "POST",
        body: {
          schedule_id: scheduleId
        }
      });
      setScheduleMessage("Scheduled run queued.");
      setScheduleTone("success");
      await refreshWorkspaceLists();
    } catch (caught) {
      setScheduleMessage(caught instanceof Error ? caught.message : "Could not queue scheduled run.");
      setScheduleTone("danger");
    }
  }

  async function handleAlertAcknowledge(alertId: string) {
    try {
      await apiFetch("/api/qa/alerts", {
        method: "POST",
        body: {
          id: alertId,
          status: "acknowledged"
        }
      });
      await refreshWorkspaceLists();
    } catch {
      // Ignore acknowledgement errors in the list for now.
    }
  }

  async function handleGitHubInstallForBrand(brandKey: string) {
    const normalizedBrandKey = normalizeBrandKey(brandKey);
    if (!normalizedBrandKey) {
      setRepoError("Pick or create a project first.");
      return;
    }

    const popup =
      typeof window !== "undefined" ? window.open("", "swarmtester-github-connect", buildGitHubPopupFeatures()) : null;
    if (popup) {
      githubInstallPopupRef.current = popup;
      paintGitHubPopupShell(popup);
    }

    try {
      const response = await apiFetch<{ install_url: string }>("/api/qa/github-app/install-url", {
        method: "POST",
        body: {
          brand_key: normalizedBrandKey
        }
      });

      if (popup && !popup.closed) {
        popup.location.href = response.install_url;
        popup.focus();
        setRepoError("");
        return;
      }

      const opened =
        typeof window !== "undefined" ? window.open(response.install_url, "_blank", "noopener,noreferrer") : null;
      if (opened) {
        setRepoError("");
        return;
      }

      window.location.href = response.install_url;
    } catch (caught) {
      if (popup && !popup.closed) {
        popup.close();
      }
      githubInstallPopupRef.current = null;
      setRepoError(caught instanceof Error ? caught.message : "Could not start GitHub setup.");
    }
  }

  async function handleGitHubInstall() {
    await handleGitHubInstallForBrand(currentBrandKey);
  }

  function handleRefreshGitHubConnection() {
    setRepoConnectionReloadKey((current) => current + 1);
  }

  async function handleRepositorySelect(repoFullName: string) {
    const existingAssociatedRepoFullNames = Array.isArray(repoConnection?.associated_repo_full_names)
      ? repoConnection.associated_repo_full_names
      : [];
    await handleProjectRepositoriesSave({
      primaryRepoFullName: repoFullName,
      associatedRepoFullNames: existingAssociatedRepoFullNames.length
        ? Array.from(new Set([repoFullName, ...existingAssociatedRepoFullNames]))
        : [repoFullName]
    });
  }

  async function handleProjectRepositoriesSave({
    primaryRepoFullName,
    associatedRepoFullNames
  }: {
    primaryRepoFullName: string;
    associatedRepoFullNames: string[];
  }) {
    if (!currentBrandKey || !primaryRepoFullName) {
      return;
    }
    setRepoLoading(true);
    try {
      const response = await apiFetch<{ connection: RepoConnection; repositories: RepoConnection["repositories"] }>("/api/qa/github-app/connection", {
        method: "POST",
        body: {
          brand_key: currentBrandKey,
          repo_full_name: primaryRepoFullName,
          associated_repo_full_names: associatedRepoFullNames
        }
      });
      setRepoConnection({
        ...(response.connection || {}),
        repositories: response.repositories || response.connection?.repositories || []
      });
      setLaunchDraft((current) => ({
        ...current,
        repoTriageEnabled: true,
        selectedRepoFullName: primaryRepoFullName
      }));
      setRepoError("");
    } catch (caught) {
      setRepoError(caught instanceof Error ? caught.message : "Could not save repository.");
    } finally {
      setRepoLoading(false);
    }
  }

  async function handleDisconnectGitHubConnection() {
    const brandKey = normalizeBrandKey(currentBrandKey || activeStarterBrand?.id || "");
    if (!brandKey) {
      throw new Error("Pick a brand first.");
    }

    setRepoLoading(true);
    try {
      await apiFetch("/api/qa/github-app/connection", {
        method: "DELETE",
        params: {
          brand_key: brandKey
        }
      });
      setRepoConnection(null);
      setRepoError("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not disconnect GitHub.";
      setRepoError(message);
      throw new Error(message);
    } finally {
      setRepoLoading(false);
    }
  }

  async function handleSaveBrandSettings(input: { brandName: string; website: string; teamMembers: string[] }) {
    const brandKey = normalizeBrandKey(currentBrandKey || activeStarterBrand?.id || "");
    if (!brandKey) {
      throw new Error("Pick a brand first.");
    }

    const trimmedBrandName = String(input.brandName || "").trim();
    if (!trimmedBrandName) {
      throw new Error("Brand name is required.");
    }

    const normalizedWebsite = input.website ? normalizeUrlInput(input.website) : "";
    if (input.website && !normalizedWebsite) {
      throw new Error("Add a valid website URL.");
    }

    const currentMetadata =
      currentProject?.metadata && typeof currentProject.metadata === "object"
        ? { ...currentProject.metadata }
        : {};
    delete (currentMetadata as Record<string, unknown>).qa_profile;

    const response = await apiFetch<{ items?: ProjectSummary[] }>("/api/qa/projects", {
      method: "POST",
      body: {
        brand_key: brandKey,
        brand_name: trimmedBrandName,
        target_url: normalizedWebsite || null,
        metadata: {
          ...currentMetadata,
          source: currentMetadata.source || "react_dashboard_brand_settings",
          team_members: input.teamMembers
        }
      }
    });

    const savedProject =
      (response.items || []).find((item) => normalizeBrandKey(item.brand_key) === brandKey) ||
      response.items?.[0] ||
      ({
        brand_key: brandKey,
        brand_name: trimmedBrandName,
        target_url: normalizedWebsite || null,
        metadata: {
          ...currentMetadata,
          source: currentMetadata.source || "react_dashboard_brand_settings",
          team_members: input.teamMembers
        }
      } satisfies ProjectSummary);

    setProjects((current) => upsertProjectSummary(current, savedProject));
    setLaunchDraft((current) =>
      normalizeBrandKey(current.brandKey || "") === brandKey
        ? {
            ...current,
            brandKey,
            brandName: savedProject.brand_name || trimmedBrandName,
            targetUrl: savedProject.target_url || ""
          }
        : current
    );
    refreshWorkspaceLists().catch(() => null);
    return savedProject;
  }

  async function handleOperatorAction(kind: "prepare" | "preflight" | "queue") {
    const brand = operatorState.brands.find((item) => item.brand_profile_id === operatorState.selectedBrandId);
    const pack = operatorState.packs.find((item) => item.pack_id === operatorState.selectedPackId);
    if (!brand || !pack) {
      setOperatorState((current) => ({
        ...current,
        actionMessage: "Choose a submission brand and pack first.",
        actionTone: "danger"
      }));
      return;
    }

    if (kind === "prepare") {
      const jobId = `asset-prepare-${brand.brand_profile_id}-${pack.pack_id}-${Date.now()}`;
      setOperatorState((current) => ({
        ...current,
        preparing: true,
        actionMessage: `Preparing assets for ${brand.display_name || brand.brand_key}.`,
        actionTone: "neutral",
        prepareJob: { job_id: jobId, status: "queued" }
      }));
      try {
        await apiFetch("/api/submissions/assets/prepare", {
          method: "POST",
          body: {
            job_id: jobId,
            brand_profile_id: brand.brand_profile_id,
            brand_key: brand.brand_key,
            track: brand.track,
            site_ids: (pack.sites || []).map((site) => site.site_id).filter(Boolean),
            metadata: {
              pack_id: pack.pack_id,
              pack_name: pack.pack_name,
              launched_from: "react_dashboard"
            }
          }
        });
        setOperatorState((current) => ({
          ...current,
          preparing: false,
          actionMessage: "Asset preparation queued.",
          actionTone: "success"
        }));
      } catch (caught) {
        setOperatorState((current) => ({
          ...current,
          preparing: false,
          actionMessage: caught instanceof Error ? caught.message : "Could not prepare assets.",
          actionTone: "danger"
        }));
      }
      return;
    }

    if (kind === "preflight") {
      setOperatorState((current) => ({
        ...current,
        preflighting: true,
        actionMessage: `Running preflight for ${pack.pack_name || pack.pack_id}.`,
        actionTone: "neutral"
      }));
      try {
        const response = await apiFetch<any>("/api/submissions/pack-preflight", {
          method: "POST",
          body: {
            brand_profile_id: brand.brand_profile_id,
            pack_id: pack.pack_id,
            track: brand.track
          }
        });
        setOperatorState((current) => ({
          ...current,
          preflighting: false,
          preflight: response,
          actionMessage: `Preflight returned ${response.summary?.ready_auto_count || 0} auto, ${response.summary?.ready_assist_count || 0} assist, ${response.summary?.blocked_count || 0} blocked.`,
          actionTone: response.overall_decision === "blocked" ? "danger" : "success"
        }));
      } catch (caught) {
        setOperatorState((current) => ({
          ...current,
          preflighting: false,
          actionMessage: caught instanceof Error ? caught.message : "Could not run preflight.",
          actionTone: "danger"
        }));
      }
      return;
    }

    setOperatorState((current) => ({
      ...current,
      queueing: true,
      actionMessage: operatorState.liveMode ? `Queueing ${pack.pack_name || pack.pack_id}.` : `Running a dry-run queue preview.`,
      actionTone: "neutral"
    }));
    try {
      const response = await apiFetch<any>("/api/submissions/pack-submit", {
        method: "POST",
        body: {
          brand_profile_id: brand.brand_profile_id,
          pack_id: pack.pack_id,
          track: brand.track,
          dry_run: !operatorState.liveMode,
          stop_before_submit: !operatorState.liveMode,
          no_human_actions: operatorState.liveMode && operatorState.noHumanActions,
          include_auto: true,
          include_assist: true,
          include_manual: false,
          metadata: {
            pack_id: pack.pack_id,
            pack_name: pack.pack_name,
            launched_from: "react_dashboard"
          }
        }
      });
      setOperatorState((current) => ({
        ...current,
        queueing: false,
        queueBatch: response,
        queueStatuses: {},
        actionMessage: response.dry_run
          ? `Dry run produced ${response.summary?.queued_count || 0} queueable jobs.`
          : `Queued ${response.summary?.queued_count || 0} submission jobs.`,
        actionTone: "success"
      }));
    } catch (caught) {
      setOperatorState((current) => ({
        ...current,
        queueing: false,
        actionMessage: caught instanceof Error ? caught.message : "Could not queue pack submit.",
        actionTone: "danger"
      }));
    }
  }

  async function handleSaveBrandProfile() {
    if (!brandEditor.brand_profile_id || !brandEditor.display_name) {
      setBrandEditor((current) => ({
        ...current,
        message: "Brand profile id and display name are required.",
        tone: "danger"
      }));
      return;
    }

    setBrandEditor((current) => ({
      ...current,
      saving: true,
      message: "",
      tone: "neutral"
    }));

    try {
      const response = await apiFetch<{ brand_profile: SubmissionBrandProfile }>("/api/submissions/brands", {
        method: "POST",
        body: {
          brand_profile_id: brandEditor.brand_profile_id,
          display_name: brandEditor.display_name,
          brand_key: brandEditor.brand_key || null,
          track: brandEditor.track,
          website_url: brandEditor.website_url || null,
          mailbox_email: brandEditor.mailbox_email || null,
          mailbox_provider: brandEditor.mailbox_provider || null,
          mailbox_auth_method: "password",
          mailbox_username: brandEditor.mailbox_username || null,
          mailbox_host: brandEditor.mailbox_host || null,
          mailbox_port: brandEditor.mailbox_port || null,
          mailbox_secure: brandEditor.mailbox_secure,
          mailbox_smtp_host: brandEditor.mailbox_smtp_host || null,
          mailbox_smtp_port: brandEditor.mailbox_smtp_port || null,
          mailbox_smtp_secure: brandEditor.mailbox_smtp_secure,
          mailbox_password: brandEditor.mailbox_password || null
        }
      });

      setOperatorState((current) => {
        const nextBrand = response.brand_profile;
        const existing = current.brands.filter((item) => item.brand_profile_id !== nextBrand.brand_profile_id);
        return {
          ...current,
          brands: [nextBrand, ...existing],
          selectedBrandId: nextBrand.brand_profile_id
        };
      });
      setBrandEditor((current) => ({
        ...current,
        saving: false,
        message: "Brand profile saved.",
        tone: "success"
      }));
    } catch (caught) {
      setBrandEditor((current) => ({
        ...current,
        saving: false,
        message: caught instanceof Error ? caught.message : "Could not save brand profile.",
        tone: "danger"
      }));
    }
  }

  useEffect(() => {
    const queuedJobs = Array.isArray(operatorState.queueBatch?.queued_jobs) ? operatorState.queueBatch.queued_jobs : [];
    if (!queuedJobs.length || operatorState.queueBatch?.dry_run) {
      return;
    }
    const timer = window.setInterval(async () => {
      const results = await Promise.allSettled(
        queuedJobs.map((job: any) =>
          apiFetch<SubmissionJobStatus>("/api/submissions/status", {
            params: { job_id: job.job_id }
          })
        )
      );

      const nextStatusMap: Record<string, SubmissionJobStatus> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          nextStatusMap[queuedJobs[index].job_id] = result.value;
        }
      });
      setOperatorState((current) => ({
        ...current,
        queueStatuses: nextStatusMap
      }));
    }, 5000);

    return () => window.clearInterval(timer);
  }, [operatorState.queueBatch]);

  if (!isSharedView && !authState.authorized) {
    return (
      <AuthGate
        message={authState.message}
        tone={authState.tone}
        onSubmit={onRequestMagicLink}
      />
    );
  }

  if (isSharedView) {
    return (
      <SharedReportPage
        loading={detailLoading}
        error={detailError}
        report={selectedReport}
        status={selectedStatus}
        runId={sharedRunId}
        shareKey={shareKey}
      />
    );
  }

  if (!workspaceBootstrapped) {
    return <LoadingShell label="Loading your dashboard..." />;
  }

  function openPanel(panel: string, options: { brand?: string | null; runId?: string | null; sessionId?: string | null; keepRun?: boolean } = {}) {
    const next = new URLSearchParams(route.search);
    next.set("panel", panel);
    next.delete("compose");

    if (options.brand === "") {
      next.delete("brand");
    } else if (options.brand) {
      next.set("brand", options.brand);
    }

    if (panel === "report") {
      const fallbackRunId = options.runId || requestedRunId || filteredRuns[0]?.run_id || reports[0]?.run_id || "";
      if (fallbackRunId) {
        next.set("run_id", fallbackRunId);
      }
      next.set("view", currentView || "report");
      next.delete("session_id");
    } else if (panel === "manual_qa") {
      const fallbackSessionId = options.sessionId || requestedManualSessionId || "";
      if (fallbackSessionId) {
        next.set("session_id", fallbackSessionId);
      }
      next.delete("run_id");
      next.delete("view");
    } else if (!options.keepRun) {
      next.delete("run_id");
      next.delete("view");
      next.delete("session_id");
    }

    startTransition(() => navigate("/dashboard", next));
  }

  function handleBrandSwitch(brandId: string) {
    openPanel("overview", { brand: brandId || "", runId: null });
  }

  function handleOpenReport(runId: string) {
    const run = reports.find((item) => item.run_id === runId) || filteredRuns.find((item) => item.run_id === runId) || null;
    openPanel("report", {
      brand: run?.brand_key || currentBrandKey || "",
      runId
    });
  }

  function handleQuickRun() {
    if (!activeStarterBrand?.website) {
      openPanel("onboarding");
      return;
    }
    handleOpenComposer("simple");
  }

  function handleOpenComposer(mode: "simple" | "advanced" = "simple") {
    const next = new URLSearchParams(route.search);
    next.set("compose", "1");
    if (mode === "advanced") {
      next.set("compose_mode", "advanced");
    } else {
      next.delete("compose_mode");
    }
    next.set("panel", currentPanel === "report" ? "report" : "overview");
    if (!next.get("brand") && activeStarterBrand?.id) {
      next.set("brand", activeStarterBrand.id);
    }
    navigate("/dashboard", next);
  }

  const resolvedPanel =
    !onboardingSeen && emptyWorkspace && !["help", "manual_qa"].includes(currentPanel) ? "onboarding" : currentPanel;
  const canShowReportPanel = Boolean(requestedRunId || selectedRun || selectedReport);
  const previousRun = requestedRunId ? sameBrandRuns.find((run, index) => sameBrandRuns[index + 1]?.run_id === requestedRunId) || null : null;
  const currentRunIndex = sameBrandRuns.findIndex((run) => run.run_id === requestedRunId);
  const nextRun = currentRunIndex > 0 ? sameBrandRuns[currentRunIndex - 1] : null;
  const activeDashboardBrandKey = activeStarterBrand?.id || currentBrandKey || "";

  let workspaceContent: React.ReactNode;

  if (resolvedPanel === "onboarding") {
    workspaceContent = (
      <StarterOnboardingFlow
        personas={starterPersonas}
        onComplete={handleStarterOnboardingComplete}
      />
    );
  } else if (resolvedPanel === "history") {
    workspaceContent = (
      <StarterTestHistory
        rows={historyRows}
        onBack={() => openPanel("overview", { brand: currentBrandKey || "" })}
        onViewReport={handleOpenReport}
      />
    );
  } else if (resolvedPanel === "personas") {
    workspaceContent = (
      <StarterPersonaLab
        personas={starterPersonas}
        setPersonas={setStarterPersonas}
        onBack={() => openPanel("overview", { brand: currentBrandKey || "" })}
      />
    );
  } else if (resolvedPanel === "automations") {
    workspaceContent = (
      <StarterAutomationsPage
        personas={starterPersonas}
        activeBrand={activeStarterBrand}
        currentSchedule={currentSchedule}
        scheduleDraft={scheduleDraft}
        setScheduleDraft={setScheduleDraft}
        scheduleSaving={scheduleSaving}
        scheduleMessage={scheduleMessage}
        scheduleTone={scheduleTone}
        repoConnection={repoConnection}
        repoLoading={repoLoading}
        repoError={repoError}
        alerts={currentAlerts}
        onBack={() => openPanel("overview", { brand: currentBrandKey || "" })}
        onSaveSchedule={handleSaveSchedule}
        onRunScheduleNow={handleRunScheduleNow}
        onConnectGitHub={handleGitHubInstall}
        onSaveProjectRepos={handleProjectRepositoriesSave}
        onAcknowledgeAlert={handleAlertAcknowledge}
      />
    );
  } else if (resolvedPanel === "settings") {
    workspaceContent = (
      <StarterBrandSettingsPage
        activeBrand={activeStarterBrand}
        currentProject={currentProject}
        repoConnection={repoConnection}
        repoLoading={repoLoading}
        repoError={repoError}
        mcpTokens={mcpTokens}
        mcpTokensLoading={mcpTokensLoading}
        mcpTokenError={mcpTokenError}
        createdMcpToken={createdMcpToken}
        onBack={() => openPanel(activeStarterBrand ? "overview" : "onboarding", { brand: activeDashboardBrandKey })}
        onSaveBrandSettings={handleSaveBrandSettings}
        onConnectGitHub={handleGitHubInstall}
        onRefreshGitHubConnection={handleRefreshGitHubConnection}
        onSaveProjectRepos={handleProjectRepositoriesSave}
        onDisconnectGitHub={handleDisconnectGitHubConnection}
        onCreateMcpToken={handleCreateMcpToken}
        onRevokeMcpToken={handleRevokeMcpToken}
        onClearCreatedMcpToken={() => setCreatedMcpToken("")}
      />
    );
  } else if (resolvedPanel === "help") {
    workspaceContent = <StarterHelpCenter onBack={() => openPanel(activeStarterBrand ? "overview" : "onboarding", { brand: currentBrandKey || "" })} />;
  } else if (resolvedPanel === "manual_qa") {
    workspaceContent = (
      <ManualQaPage
        session={manualQaSession}
        loading={manualQaLoading}
        error={manualQaError}
        busyItemId={manualQaBusyItemId}
        copyFeedback={manualQaCopyFeedback}
        onBack={() => openPanel("overview", { brand: currentBrandKey || "" })}
        onUpdateItem={handleManualQaItemUpdate}
        onExport={handleManualQaExport}
      />
    );
  } else if (resolvedPanel === "report" && canShowReportPanel) {
    workspaceContent = (
      <StarterReportPage
        run={selectedRun}
        report={selectedReport}
        status={selectedStatus}
        shareKey={shareKey}
        view={currentView}
        loading={detailLoading}
        error={detailError}
        copyFeedback={copyFeedback}
        previousRunId={previousRun?.run_id || null}
        nextRunId={nextRun?.run_id || null}
        onBack={() => openPanel("overview", { brand: currentBrandKey || "" })}
        onChangeView={(nextView) => {
          const next = new URLSearchParams(route.search);
          next.set("panel", "report");
          next.set("view", nextView);
          if (requestedRunId) {
            next.set("run_id", requestedRunId);
          }
          if (currentBrandKey) {
            next.set("brand", currentBrandKey);
          }
          navigate("/dashboard", next, true);
        }}
        onCopyShareLink={handleCopyShareLink}
        onRunAgain={() => handleLaunchRun(buildDraftFromRun(selectedRun, selectedReport, repoConnection), { retryOfRunId: selectedRun?.run_id || null })}
        onViewRun={handleOpenReport}
      />
    );
  } else {
    workspaceContent = (
      <StarterDashboard
        brands={starterBrands}
        activeBrand={activeStarterBrand}
        ownerEmail={authState.user?.email || ""}
        workspaceError={runsError}
        personas={starterPersonas}
        historyRows={historyRows}
        liveAgents={liveAgents}
        frictionRows={frictionRows}
        trendData={trendData}
        workerLabel={workerSummary?.label || ""}
        onSwitchBrand={handleBrandSwitch}
        onAddBrand={() => openPanel("onboarding")}
        onLogout={onSignOut}
        onViewReport={handleOpenReport}
        onViewPersonas={() => openPanel("personas", { brand: activeDashboardBrandKey })}
        onViewAutomations={() => openPanel("automations", { brand: activeDashboardBrandKey })}
        onViewHistory={() => openPanel("history", { brand: activeDashboardBrandKey })}
        onViewHelp={() => openPanel("help", { brand: activeDashboardBrandKey })}
        onOpenSettings={() => openPanel("settings", { brand: activeDashboardBrandKey })}
        onRunNewTest={handleQuickRun}
        onScheduleTest={() => openPanel("automations", { brand: activeDashboardBrandKey })}
        onRetryWorkspace={refreshWorkspaceLists}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-brand-bg text-brand-ink"
      data-app-shell="workspace"
      data-route={route.pathname}
      data-view={currentView}
      data-workspace-state={workspaceState}
      data-detail-state={detailState}
      data-compose-open={composeOpen ? "true" : "false"}
      data-project-count={String(projectCatalog.length)}
      data-visible-run-count={String(filteredRuns.length)}
      data-selected-run={requestedRunId ? "true" : "false"}
    >
      {workspaceContent}

      <AnimatePresence>
        {composeOpen ? (
          <div
            className="fixed inset-0 isolate z-[120] flex items-center justify-center bg-brand-ink/65 backdrop-blur-md p-4"
            onClick={() => {
              const next = new URLSearchParams(route.search);
              next.delete("compose");
              next.delete("compose_mode");
              navigate("/dashboard", next, true);
            }}
          >
            <motion.div
              initial={{ y: 24 }}
              animate={{ y: 0 }}
              exit={{ y: 24 }}
              transition={{ duration: 0.2 }}
              className={
                composeMode === "advanced"
                  ? "relative z-[1] w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl"
                  : "relative z-[1] w-full max-w-[520px] max-h-[88vh] overflow-hidden rounded-2xl"
              }
              onClick={(event) => event.stopPropagation()}
            >
              {composeMode === "advanced" ? (
                <LaunchComposer
                  draft={launchDraft}
                  currentProject={currentProject}
                  advancedBrowserRuntime={advancedBrowserRuntime}
                  repoConnection={repoConnection}
                  repoRoutes={repoRoutes}
                  repoRoutesLoading={repoRoutesLoading}
                  repoRoutesError={repoRoutesError}
                  busy={launchBusy}
                  message={launchMessage}
                  tone={launchTone}
                  onCancel={() => {
                    const next = new URLSearchParams(route.search);
                    next.delete("compose");
                    next.delete("compose_mode");
                    navigate("/dashboard", next, true);
                  }}
                  onChange={setLaunchDraft}
                  onUsePersona={(persona) =>
                    setLaunchDraft((current) => ({
                      ...current,
                      persona: persona.persona
                    }))
                  }
                  onUseRunMode={(runMode) =>
                    setLaunchDraft((current) => ({
                      ...current,
                      runMode,
                      scopeMode: runMode === "controlled_ux" ? "feature_targeted" : current.scopeMode === "feature_targeted" ? "core_20m" : current.scopeMode
                    }))
                  }
                  onToggleGoal={(goal) =>
                    setLaunchDraft((current) => {
                      const lines = current.goalsText
                        .split(/\r?\n/g)
                        .map((item) => item.trim())
                        .filter(Boolean);
                      const exists = lines.includes(goal);
                      const nextGoals = exists ? lines.filter((item) => item !== goal) : [...lines, goal];
                      return {
                        ...current,
                        goalsText: nextGoals.join("\n")
                      };
                    })
                  }
                  onUseRouteAsEntry={(routePath) =>
                    setLaunchDraft((current) => ({
                      ...current,
                      entryPath: routePath
                    }))
                  }
                  onAddRouteHint={(routePath) =>
                    setLaunchDraft((current) => {
                      const lines = current.routeHintsText
                        .split(/\r?\n/g)
                        .map((item) => item.trim())
                        .filter(Boolean);
                      if (lines.includes(routePath)) {
                        return current;
                      }
                      return {
                        ...current,
                        routeHintsText: [...lines, routePath].join("\n")
                      };
                    })
                  }
                  onSaveRepository={handleRepositorySelect}
                  onStartGitHubInstall={handleGitHubInstall}
                  onRefreshWorkerHealth={refreshWorkerHealth}
                  onSubmit={() => handleLaunchRun()}
                />
              ) : (
                <QuickLaunchModal
                  draft={launchDraft}
                  currentProject={currentProject}
                  advancedBrowserRuntime={advancedBrowserRuntime}
                  busy={launchBusy}
                  message={launchMessage}
                  tone={launchTone}
                  onCancel={() => {
                    const next = new URLSearchParams(route.search);
                    next.delete("compose");
                    next.delete("compose_mode");
                    navigate("/dashboard", next, true);
                  }}
                  onChange={setLaunchDraft}
                  onOpenAdvanced={() => handleOpenComposer("advanced")}
                  onRefreshWorkerHealth={refreshWorkerHealth}
                  onSubmit={() => handleLaunchRun()}
                />
              )}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AdvancedBrowserReadinessCard({
  runtime,
  onRefresh
}: {
  runtime: AdvancedBrowserRuntimeState;
  onRefresh: () => Promise<unknown>;
}) {
  const toneClasses =
    runtime.tone === "success"
      ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
      : runtime.tone === "warning"
        ? "border-brand-warning/30 bg-brand-warning/10 text-brand-ink"
        : runtime.tone === "danger"
          ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
          : "border-brand-line bg-brand-shell text-brand-muted";
  const Icon = runtime.tone === "success" ? Check : runtime.tone === "neutral" ? LoaderCircle : TriangleAlert;

  return (
    <div className={`rounded-xl border px-4 py-4 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-white/70 p-1.5">
            <Icon className={`h-4 w-4 ${runtime.status === "checking" ? "animate-spin" : ""}`} />
          </div>
          <div>
            <div className="text-sm font-semibold">{runtime.title}</div>
            <p className="mt-1 text-xs leading-5 opacity-90">{runtime.detail}</p>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full border border-current/20 px-3 py-1 text-[11px] font-semibold transition hover:bg-white/60"
          onClick={() => {
            void onRefresh();
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function EnvironmentUrlField({
  value,
  savedUrls,
  onChange
}: {
  value: string;
  savedUrls: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const query = value.trim().toLowerCase();
  const filteredUrls = savedUrls.filter((url) => !query || url.toLowerCase().includes(query));
  const hasSavedUrls = savedUrls.length > 0;

  return (
    <div>
      <FieldLabel>Environment URL</FieldLabel>
      <div className="relative">
        <TextInput
          id={inputId}
          placeholder="https://staging.example.com"
          value={value}
          onFocus={() => {
            if (hasSavedUrls) {
              setOpen(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            if (hasSavedUrls) {
              setOpen(true);
            }
          }}
          className="pr-11"
        />
        {hasSavedUrls ? (
          <button
            type="button"
            aria-label="Show saved URLs"
            onMouseDown={(event) => {
              event.preventDefault();
              setOpen((current) => !current);
            }}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-ink"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>

      {hasSavedUrls ? (
        <p className="mt-2 text-xs leading-5 text-brand-muted">
          Saved for this brand. Pick one from the dropdown or type a new URL.
        </p>
      ) : null}

      {open && hasSavedUrls ? (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          {filteredUrls.length ? (
            <div className="max-h-56 overflow-y-auto">
              {filteredUrls.map((url) => {
                const selected = value.trim().toLowerCase() === url.toLowerCase();
                return (
                  <button
                    key={url}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChange(url);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                      selected ? "bg-brand-primary/10 text-brand-ink" : "text-brand-ink hover:bg-white"
                    }`}
                  >
                    <span className="truncate">{url}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-brand-primary" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-400">
              No saved URLs match that search.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuickLaunchModal({
  draft,
  currentProject,
  advancedBrowserRuntime,
  busy,
  message,
  tone,
  onCancel,
  onChange,
  onOpenAdvanced,
  onRefreshWorkerHealth,
  onSubmit
}: {
  draft: LaunchDraft;
  currentProject: ProjectSummary | null;
  advancedBrowserRuntime: AdvancedBrowserRuntimeState;
  busy: boolean;
  message: string;
  tone: "neutral" | "success" | "danger";
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<LaunchDraft>>;
  onOpenAdvanced: () => void;
  onRefreshWorkerHealth: () => Promise<unknown>;
  onSubmit: () => Promise<void>;
}) {
  const validationTarget = normalizeValidationTarget(draft.validationTarget);
  const browserMode = normalizeBrowserMode(draft.browserMode);
  const accessMethod = normalizeAccessMethod(draft.accessMethod, validationTarget);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const projectMetadata = currentProject?.metadata && typeof currentProject.metadata === "object" ? currentProject.metadata : {};
  const savedEnvironmentUrls = readSavedEnvironmentUrls(currentProject);
  const savedSessionAvailable =
    projectMetadata?.qa_profile && typeof projectMetadata.qa_profile === "object"
      ? (projectMetadata.qa_profile as Record<string, unknown>).available === true
      : false;
  const canStart =
    Boolean(normalizeUrlInput(draft.targetUrl)) &&
    (draft.runMode !== "controlled_ux" || hasControlledUxFlowPlan(draft)) &&
    (browserMode !== "advanced_browser" || advancedBrowserRuntime.status === "ready") &&
    (validationTarget !== "inside_product" ||
      (browserMode !== "advanced_browser" && accessMethod === "saved_session" && savedSessionAvailable) ||
      accessMethod === "create_account" ||
      Boolean(String(draft.authUsername || "").trim() && String(draft.authPassword || "").trim())) &&
    (accessMethod !== "auth_url" || Boolean(normalizeUrlInput(draft.authUrl))) &&
    (accessMethod !== "credentials" ||
      Boolean(String(draft.authUsername || "").trim() && String(draft.authPassword || "").trim()));

  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0 });
  }, [browserMode]);

  return (
    <section className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-4 border-b border-brand-line px-5 py-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-brand-ink">Start test</h1>
          <p className="mt-1 text-sm leading-5 text-brand-muted">Choose the site and flow.</p>
        </div>
        <Button tone="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div ref={scrollBodyRef} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 [overflow-anchor:none]">
        <EnvironmentUrlField
          value={draft.targetUrl}
          savedUrls={savedEnvironmentUrls}
          onChange={(nextTarget) => onChange((current) => applyLaunchTargetUrl(current, nextTarget))}
        />

        <div>
          <FieldLabel>Test mode</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {RUN_MODE_OPTIONS.map((option) => {
              const active = draft.runMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active ? "border-brand-ink bg-slate-50" : "border-brand-line bg-brand-shell hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      runMode: option.value,
                      scopeMode:
                        option.value === "controlled_ux"
                          ? "feature_targeted"
                          : current.scopeMode === "feature_targeted"
                            ? "core_20m"
                            : current.scopeMode
                    }))
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                    {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-brand-muted">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Browser runtime</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {BROWSER_MODE_OPTIONS.map((option) => {
              const active = browserMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active ? "border-brand-ink bg-slate-50" : "border-brand-line bg-brand-shell hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      browserMode: option.value,
                      accessMethod:
                        option.value === "advanced_browser" &&
                        current.validationTarget === "inside_product" &&
                        current.accessMethod === "saved_session"
                          ? "create_account"
                          : current.accessMethod
                    }))
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                    {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-brand-muted">{option.description}</p>
                </button>
              );
            })}
          </div>
          {browserMode === "advanced_browser" ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-5 text-brand-muted">
                Best for harder sites that need the DO worker browser and supported captcha gates.
              </p>
              <AdvancedBrowserReadinessCard runtime={advancedBrowserRuntime} onRefresh={onRefreshWorkerHealth} />
            </div>
          ) : null}
        </div>

        <div>
          <FieldLabel>What should we test?</FieldLabel>
          <div className="grid gap-2">
            {VALIDATION_TARGET_OPTIONS.map((option) => {
              const active = validationTarget === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active ? "border-brand-ink bg-slate-50" : "border-brand-line bg-brand-shell hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      validationTarget: option.value,
                      accessMethod:
                        option.value === "public_flow"
                          ? "none"
                          : option.value === "inside_product"
                            ? getDefaultInsideProductAccessMethod(browserMode, savedSessionAvailable)
                            : normalizeAccessMethod(current.accessMethod, option.value)
                    }))
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                    {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-brand-muted">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {draft.runMode === "controlled_ux" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>Owned flow</FieldLabel>
              <TextInput
                value={draft.userJob}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    userJob: event.target.value
                  }))
                }
                placeholder={
                  validationTarget === "inside_product"
                    ? "Create the first project from the dashboard."
                    : validationTarget === "login_signup"
                      ? "Create an account and understand what happens next."
                      : "Understand the product and reach the main get-started page."
                }
              />
            </div>
            <div>
              <FieldLabel>Entry path</FieldLabel>
              <TextInput
                value={draft.entryPath}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    entryPath: normalizeEntryPath(event.target.value)
                  }))
                }
                placeholder={validationTarget === "login_signup" ? "/login" : "/dashboard"}
              />
            </div>
            <div>
              <FieldLabel>Optional route hint</FieldLabel>
              <TextInput
                value={draft.routeHintsText}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    routeHintsText: event.target.value
                  }))
                }
                placeholder="/onboarding"
              />
            </div>
          </div>
        ) : null}

        {validationTarget === "public_flow" ? null : validationTarget === "inside_product" ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              {getInsideProductAccessOptions(browserMode, savedSessionAvailable).map((option) => {
                const active = accessMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active ? "border-brand-ink bg-slate-50" : "border-brand-line bg-brand-shell hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        accessMethod: option.value
                      }))
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                      {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-brand-muted">{option.description}</p>
                  </button>
                );
              })}
            </div>

            {browserMode === "advanced_browser" ? (
              <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                Advanced browser starts fresh each run, so old saved sessions are hidden here. Pick sign-up or give the bot a test login.
              </div>
            ) : null}

            {accessMethod === "saved_session" ? (
              <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-3 text-sm leading-6 text-brand-muted">
                We will open the product with the last saved account for this brand and focus on the product after login.
              </div>
            ) : null}

            {accessMethod === "create_account" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel>Optional sign-up URL</FieldLabel>
                  <TextInput
                    value={draft.authUrl}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        authUrl: event.target.value,
                        accessMethod: "create_account"
                      }))
                    }
                    placeholder="https://staging.example.com/signup"
                  />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                  We will create a fresh account, save that session, then continue into the product. Add a sign-up URL only if the good path is hard to find.
                </div>
              </div>
            ) : null}

            {isInsideProductCredentialAccess(accessMethod) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel>Optional login URL</FieldLabel>
                  <TextInput
                    value={draft.authUrl}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        authUrl: event.target.value,
                        accessMethod: "credentials"
                      }))
                    }
                    placeholder="https://staging.example.com/login"
                  />
                </div>
                <div>
                  <FieldLabel>Test login email</FieldLabel>
                  <TextInput
                    value={draft.authUsername}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        authUsername: event.target.value,
                        accessMethod: "credentials"
                      }))
                    }
                    placeholder="tester@example.com"
                  />
                </div>
                <div>
                  <FieldLabel>Test login password</FieldLabel>
                  <TextInput
                    type="password"
                    value={draft.authPassword}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        authPassword: event.target.value,
                        accessMethod: "credentials"
                      }))
                    }
                    placeholder="••••••••"
                  />
                </div>
                <div className="sm:col-span-2 rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                  {browserMode === "advanced_browser"
                    ? "Advanced browser will use a fresh DO worker browser with stronger captcha handling when the worker supports it."
                    : "After one successful run, we can reuse this account as the old saved account next time."}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{validationTarget === "login_signup" ? "Optional auth URL" : "Login URL"}</FieldLabel>
              <TextInput
                value={draft.authUrl}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    authUrl: event.target.value,
                    accessMethod: String(event.target.value || "").trim() ? "auth_url" : current.accessMethod
                  }))
                }
                placeholder="https://staging.example.com/login"
              />
            </div>
            <div>
              <FieldLabel>Test login email</FieldLabel>
              <TextInput
                value={draft.authUsername}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    authUsername: event.target.value,
                    accessMethod: "credentials"
                  }))
                }
                placeholder="tester@example.com"
              />
            </div>
            <div>
              <FieldLabel>Test login password</FieldLabel>
              <TextInput
                type="password"
                value={draft.authPassword}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    authPassword: event.target.value,
                    accessMethod: "credentials"
                  }))
                }
                placeholder="••••••••"
              />
            </div>
            {validationTarget === "login_signup" ? (
              <div className="sm:col-span-2 rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                Leave the login blank if you only want us to judge the visible auth experience.
              </div>
            ) : null}
          </div>
        )}

        {message ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              tone === "success"
                ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                : tone === "danger"
                  ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                  : "border-brand-line bg-brand-bg text-brand-muted"
            }`}
          >
            {message}
          </div>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-brand-line bg-slate-50/60 px-5 py-4">
        <button type="button" className="text-sm font-semibold text-brand-muted hover:text-brand-ink" onClick={onOpenAdvanced}>
          More options
        </button>
        <div className="flex items-center gap-3">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button tone="primary" onClick={() => onSubmit()} disabled={busy || !canStart}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start test
          </Button>
        </div>
      </div>
    </section>
  );
}

function LaunchComposer({
  draft,
  currentProject,
  advancedBrowserRuntime,
  repoConnection,
  repoRoutes,
  repoRoutesLoading,
  repoRoutesError,
  busy,
  message,
  tone,
  onCancel,
  onChange,
  onUsePersona,
  onUseRunMode,
  onToggleGoal,
  onUseRouteAsEntry,
  onAddRouteHint,
  onSaveRepository,
  onStartGitHubInstall,
  onRefreshWorkerHealth,
  onSubmit
}: {
  draft: LaunchDraft;
  currentProject: ProjectSummary | null;
  advancedBrowserRuntime: AdvancedBrowserRuntimeState;
  repoConnection: RepoConnection | null;
  repoRoutes: RepoRouteSuggestion[];
  repoRoutesLoading: boolean;
  repoRoutesError: string;
  busy: boolean;
  message: string;
  tone: "neutral" | "success" | "danger";
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<LaunchDraft>>;
  onUsePersona: (persona: (typeof PERSONA_PRESETS)[number]) => void;
  onUseRunMode: (runMode: LaunchDraft["runMode"]) => void;
  onToggleGoal: (goal: string) => void;
  onUseRouteAsEntry: (routePath: string) => void;
  onAddRouteHint: (routePath: string) => void;
  onSaveRepository: (repoFullName: string) => Promise<void>;
  onStartGitHubInstall: () => Promise<void>;
  onRefreshWorkerHealth: () => Promise<unknown>;
  onSubmit: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const isControlled = draft.runMode === "controlled_ux";
  const browserMode = normalizeBrowserMode(draft.browserMode);
  const validationTarget = draft.validationTarget;
  const accessMethod = normalizeAccessMethod(draft.accessMethod, validationTarget);
  const projectMetadata = currentProject?.metadata && typeof currentProject.metadata === "object" ? currentProject.metadata : {};
  const savedEnvironmentUrls = readSavedEnvironmentUrls(currentProject);
  const savedSessionAvailable =
    projectMetadata?.qa_profile && typeof projectMetadata.qa_profile === "object"
      ? (projectMetadata.qa_profile as Record<string, unknown>).available === true
      : false;
  const goalLines = draft.goalsText
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const routeHintLines = draft.routeHintsText
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const successLines = draft.successSignalsText
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const stepTitles = ["Basics", "What To Test", "Access", "Flow Setup", "Review"];
  const effectiveScopeLabel = isControlled
    ? "Focused owned flow"
    : SCOPE_OPTIONS.find((option) => option.value === draft.scopeMode)?.label || "Fast pass";
  const browserModeLabel =
    BROWSER_MODE_OPTIONS.find((option) => option.value === browserMode)?.label || "Standard browser";
  const advancedBrowserBlocked = browserMode === "advanced_browser" && advancedBrowserRuntime.status !== "ready";

  useEffect(() => {
    setStep((current) => Math.max(1, Math.min(5, current)));
  }, [draft.runMode, draft.validationTarget]);

  useEffect(() => {
    if (draft.validationTarget !== "inside_product" || accessMethod !== "saved_session" || savedSessionAvailable) {
      return;
    }
    onChange((current) => ({
      ...current,
      accessMethod: getDefaultInsideProductAccessMethod(browserMode, false)
    }));
  }, [accessMethod, browserMode, draft.validationTarget, onChange, savedSessionAvailable]);

  useEffect(() => {
    if (browserMode !== "advanced_browser" || draft.validationTarget !== "inside_product" || accessMethod !== "saved_session") {
      return;
    }
    onChange((current) => ({
      ...current,
      accessMethod: "create_account"
    }));
  }, [accessMethod, browserMode, draft.validationTarget, onChange]);

  const reviewAccessLabel = getAccessMethodLabel(accessMethod, validationTarget);

  const controlledJobPlaceholder =
    validationTarget === "inside_product"
      ? "Open the dashboard and create the first project."
      : validationTarget === "login_signup"
        ? "Create an account and understand what happens next."
        : "Understand the product and reach the main get-started page.";
  const stepReady =
    step === 1
      ? Boolean(normalizeUrlInput(draft.targetUrl))
      : step === 2
        ? Boolean(validationTarget)
        : step === 3
          ? validationTarget === "public_flow"
            ? true
            : validationTarget === "inside_product"
              ? browserMode !== "advanced_browser" && accessMethod === "saved_session"
                ? savedSessionAvailable
                : accessMethod === "create_account"
                  ? true
                  : Boolean(String(draft.authUsername || "").trim() && String(draft.authPassword || "").trim())
              : accessMethod === "auth_url"
                ? Boolean(normalizeUrlInput(draft.authUrl))
                : accessMethod === "credentials"
                  ? Boolean(String(draft.authUsername || "").trim() && String(draft.authPassword || "").trim())
            : true
          : step === 4
            ? isControlled
              ? hasControlledUxFlowPlan(draft)
              : Boolean(draft.persona)
            : !advancedBrowserBlocked;

  const handleNext = async () => {
    if (step < 5) {
      setStep((current) => Math.min(5, current + 1));
      return;
    }
    await onSubmit();
  };

  return (
    <section className="rounded-2xl border border-brand-line bg-brand-shell p-6 shadow-shell">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-line pb-5">
        <div>
          <div className="text-sm font-medium text-brand-muted">{`Step ${step} of 5`}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-brand-ink">Start a new test</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted">
            One choice at a time. Pick the environment, say what you want to validate, then add access only if the run needs it.
          </p>
        </div>
        <Button tone="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="mt-6 h-2 rounded-full bg-black/10">
        <div className="h-2 rounded-full bg-brand-primary transition-all" style={{ width: `${(step / 5) * 100}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-brand-muted">
        {stepTitles.map((label, index) => (
          <span key={label} className={index + 1 === step ? "text-brand-ink" : ""}>
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-brand-line bg-brand-panel p-5">
          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-semibold text-brand-ink">Basics</div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  Start with the environment URL and the kind of test you want.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <EnvironmentUrlField
                    value={draft.targetUrl}
                    savedUrls={savedEnvironmentUrls}
                    onChange={(nextTarget) => onChange((current) => applyLaunchTargetUrl(current, nextTarget))}
                  />
                </div>
                <div>
                  <FieldLabel>Project key</FieldLabel>
                  <TextInput
                    value={draft.brandKey}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        brandKey: normalizeBrandKey(event.target.value)
                      }))
                    }
                    placeholder="acme"
                  />
                </div>
                <div>
                  <FieldLabel>Project name</FieldLabel>
                  <TextInput
                    value={draft.brandName}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        brandName: event.target.value
                      }))
                    }
                    placeholder="Acme"
                  />
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-medium text-brand-muted">Mode</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {RUN_MODE_OPTIONS.map((option) => {
                    const active = draft.runMode === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`rounded-xl border px-4 py-4 text-left transition ${
                          active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                        }`}
                        type="button"
                        onClick={() => onUseRunMode(option.value)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                          {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-brand-muted">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-medium text-brand-muted">Browser runtime</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {BROWSER_MODE_OPTIONS.map((option) => {
                    const active = browserMode === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`rounded-xl border px-4 py-4 text-left transition ${
                          active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                        }`}
                        type="button"
                        onClick={() =>
                          onChange((current) => ({
                            ...current,
                            browserMode: option.value,
                            accessMethod:
                              option.value === "advanced_browser" &&
                              current.validationTarget === "inside_product" &&
                              current.accessMethod === "saved_session"
                                ? "create_account"
                                : current.accessMethod
                          }))
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                          {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-brand-muted">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                {browserMode === "advanced_browser" ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-brand-muted">
                      Use this when the site blocks normal automation, shows strict bot checks, or needs stronger captcha handling.
                    </p>
                    <AdvancedBrowserReadinessCard runtime={advancedBrowserRuntime} onRefresh={onRefreshWorkerHealth} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-semibold text-brand-ink">What should we test?</div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  Choose the surface first. This decides whether bypass is allowed and what the runner should care about.
                </p>
              </div>

              <div className="grid gap-3">
                {VALIDATION_TARGET_OPTIONS.map((option) => {
                  const active = validationTarget === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                      }`}
                      onClick={() =>
                        onChange((current) => {
                          const nextValidationTarget = option.value;
                          return {
                            ...current,
                            validationTarget: nextValidationTarget,
                            accessMethod:
                              nextValidationTarget === "inside_product"
                                ? getDefaultInsideProductAccessMethod(browserMode, savedSessionAvailable)
                                : normalizeAccessMethod(current.accessMethod, nextValidationTarget),
                            authUrl: nextValidationTarget === "public_flow" ? "" : current.authUrl
                          };
                        })
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                        {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-brand-muted">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-semibold text-brand-ink">Access</div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  {validationTarget === "public_flow"
                    ? "No login is needed here."
                    : validationTarget === "login_signup"
                      ? browserMode === "advanced_browser"
                        ? "Choose how we should enter the auth flow. Advanced browser will use stronger anti-bot and captcha handling."
                        : "Choose how we should enter the auth flow."
                      : browserMode === "advanced_browser"
                        ? "Pick one: let the bot sign up or give it a test login. Advanced browser starts clean each run."
                        : savedSessionAvailable
                        ? "Pick one: reuse the old account, let the bot sign up, or give it a test login."
                        : "Pick one: let the bot sign up, or give it a test login."}
                </p>
              </div>

              {validationTarget === "public_flow" ? (
                <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                  We will stay on public pages, public CTAs, and public forms. No login or account creation will be attempted in this path.
                </div>
              ) : validationTarget === "login_signup" ? (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {AUTH_FLOW_ACCESS_OPTIONS.map((option) => {
                      const active = accessMethod === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-xl border px-4 py-4 text-left transition ${
                            active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                          }`}
                          onClick={() =>
                            onChange((current) => ({
                              ...current,
                              accessMethod: option.value
                            }))
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                            {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-brand-muted">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  {accessMethod === "auth_url" || accessMethod === "credentials" ? (
                    <div>
                      <FieldLabel>Auth URL</FieldLabel>
                      <TextInput
                        value={draft.authUrl}
                        onChange={(event) =>
                          onChange((current) => ({
                            ...current,
                            authUrl: event.target.value
                          }))
                        }
                        placeholder="https://staging.example.com/login"
                      />
                    </div>
                  ) : null}

                  {accessMethod === "credentials" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel>Test login email</FieldLabel>
                        <TextInput
                          value={draft.authUsername}
                          onChange={(event) =>
                            onChange((current) => ({
                              ...current,
                              authUsername: event.target.value
                            }))
                          }
                          placeholder="tester@example.com"
                        />
                      </div>
                      <div>
                        <FieldLabel>Test login password</FieldLabel>
                        <TextInput
                          type="password"
                          value={draft.authPassword}
                          onChange={(event) =>
                            onChange((current) => ({
                              ...current,
                              authPassword: event.target.value
                            }))
                          }
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                      If no credentials are provided, the runner will judge the auth UX using the public path and try sign-up when the product supports it.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {getInsideProductAccessOptions(browserMode, savedSessionAvailable).map((option) => {
                      const active = accessMethod === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-xl border px-4 py-4 text-left transition ${
                            active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                          }`}
                          onClick={() =>
                            onChange((current) => ({
                              ...current,
                              accessMethod: option.value
                            }))
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                            {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-brand-muted">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  {browserMode === "advanced_browser" ? (
                    <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                      This path uses a fresh DO worker browser with stronger captcha handling. Old saved accounts only work on the standard browser.
                    </div>
                  ) : null}

                  {accessMethod === "saved_session" ? (
                    <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                      We will open the product with the last saved account for this brand. If it has expired, switch to sign-up or test login.
                    </div>
                  ) : null}

                  {accessMethod === "create_account" ? (
                    <>
                      <div>
                        <FieldLabel>Optional sign-up URL</FieldLabel>
                        <TextInput
                          value={draft.authUrl}
                          onChange={(event) =>
                            onChange((current) => ({
                              ...current,
                              authUrl: event.target.value,
                              accessMethod: "create_account"
                            }))
                          }
                          placeholder="https://staging.example.com/signup"
                        />
                      </div>
                      <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                        We will create a fresh account, save that session, then keep going inside the product.
                      </div>
                    </>
                  ) : null}

                  {isInsideProductCredentialAccess(accessMethod) ? (
                    <>
                      <div>
                        <FieldLabel>Optional login URL</FieldLabel>
                        <TextInput
                          value={draft.authUrl}
                          onChange={(event) =>
                            onChange((current) => ({
                              ...current,
                              authUrl: event.target.value,
                              accessMethod: "credentials"
                            }))
                          }
                          placeholder="https://staging.example.com/login"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel>Test login email</FieldLabel>
                          <TextInput
                            value={draft.authUsername}
                            onChange={(event) =>
                              onChange((current) => ({
                                ...current,
                                authUsername: event.target.value,
                                accessMethod: "credentials"
                              }))
                            }
                            placeholder="tester@example.com"
                          />
                        </div>
                        <div>
                          <FieldLabel>Test login password</FieldLabel>
                          <TextInput
                            type="password"
                            value={draft.authPassword}
                            onChange={(event) =>
                              onChange((current) => ({
                                ...current,
                                authPassword: event.target.value,
                                accessMethod: "credentials"
                              }))
                            }
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                      {browserMode !== "advanced_browser" ? (
                        <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                          After one successful run, this project can use that account as the old saved account next time.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-brand-line bg-brand-shell px-4 py-4 text-sm leading-6 text-brand-muted">
                          Advanced browser will start a fresh DO worker browser and use supported captcha solving when the worker is configured for it.
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-semibold text-brand-ink">Flow setup</div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  {isControlled
                    ? "Anchor the review to a real start path or planned route so it stays on the owned flow."
                    : "Pick one user and decide how deep the run should go."}
                </p>
              </div>

              <div>
                <div className="mb-3 text-sm font-medium text-brand-muted">User</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {PERSONA_PRESETS.map((persona) => {
                    const active = draft.persona === persona.persona;
                    return (
                      <button
                        key={persona.id}
                        className={`rounded-xl border px-4 py-4 text-left transition ${
                          active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                        }`}
                        type="button"
                        onClick={() => onUsePersona(persona)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-brand-ink">{persona.name}</div>
                            <div className="text-sm text-brand-muted">{persona.role}</div>
                          </div>
                          {active ? <Check className="h-4 w-4 text-brand-primary" /> : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-brand-muted">{persona.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isControlled ? (
                <>
                  <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                    <div className="text-sm font-semibold text-brand-ink">Controlled UX needs a route plan</div>
                    <p className="mt-1 text-sm leading-6 text-brand-muted">
                      Add an entry path or at least one planned route. If both are blank, the runner falls back to generic live-site clicking.
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Primary user job</FieldLabel>
                    <TextArea
                      value={draft.userJob}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          userJob: event.target.value
                        }))
                      }
                      placeholder={controlledJobPlaceholder}
                    />
                  </div>
                  <div>
                    <FieldLabel>Entry path</FieldLabel>
                    <TextInput
                      value={draft.entryPath}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          entryPath: normalizeEntryPath(event.target.value)
                        }))
                      }
                      placeholder={validationTarget === "login_signup" ? "/login" : "/dashboard"}
                    />
                  </div>
                  <div>
                    <FieldLabel>Planned route hints</FieldLabel>
                    <TextArea
                      value={draft.routeHintsText}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          routeHintsText: event.target.value
                        }))
                      }
                      placeholder={"/signup\n/onboarding\n/dashboard"}
                    />
                  </div>
                  <div>
                    <FieldLabel>Success checks</FieldLabel>
                    <TextArea
                      value={draft.successSignalsText}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          successSignalsText: event.target.value
                        }))
                      }
                      placeholder={"The next step is obvious\nErrors are clear\nThe first useful state is reachable"}
                    />
                  </div>

                  <div className="rounded-xl border border-brand-line bg-brand-shell p-4">
                    <div className="text-sm font-semibold text-brand-ink">GitHub route hints</div>
                    <p className="mt-1 text-sm leading-6 text-brand-muted">
                      Connect the repo if you want us to suggest likely routes and keep the run closer to the owned flow.
                    </p>

                    {repoConnection?.connection_status === "connected" ? (
                      <div className="mt-4 rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                        <div className="font-medium text-brand-ink">{repoConnection.selected_repo_full_name}</div>
                        <div className="mt-1 text-brand-muted">
                          Connected and ready to supply route hints.
                          {repoConnection?.associated_repo_full_names && repoConnection.associated_repo_full_names.length > 1
                            ? ` ${repoConnection.associated_repo_full_names.length} project repos are linked for diagnosis.`
                            : ""}
                        </div>
                      </div>
                    ) : (
                      <Button tone="secondary" className="mt-4" onClick={onStartGitHubInstall}>
                        <GitBranch className="h-4 w-4" />
                        Connect GitHub
                      </Button>
                    )}

                    {repoConnection?.repositories && repoConnection.repositories.length > 1 ? (
                      <div className="mt-4">
                        <FieldLabel>Repository</FieldLabel>
                        <Select
                          value={draft.selectedRepoFullName}
                          onChange={(event) =>
                            onChange((current) => ({
                              ...current,
                              selectedRepoFullName: event.target.value
                            }))
                          }
                        >
                          <option value="">Choose a repository</option>
                          {repoConnection.repositories.map((repo) => (
                            <option key={repo.full_name || repo.id} value={repo.full_name || ""}>
                              {repo.full_name}
                            </option>
                          ))}
                        </Select>
                        <Button tone="secondary" className="mt-3" onClick={() => onSaveRepository(draft.selectedRepoFullName)} disabled={!draft.selectedRepoFullName}>
                          Save repository
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                      <div className="font-medium text-brand-ink">Suggested routes</div>
                      {repoRoutesLoading ? (
                        <div className="mt-2 text-brand-muted">Loading route suggestions.</div>
                      ) : repoRoutes.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {repoRoutes.slice(0, 10).map((route) => {
                            const activeEntry = normalizeEntryPath(draft.entryPath) === route.path;
                            return (
                              <div key={`${route.path}:${route.file_path}`} className="flex items-center gap-2 rounded-full border border-brand-line bg-brand-shell px-2 py-1">
                                <button
                                  type="button"
                                  className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
                                    activeEntry ? "bg-brand-primary/15 text-brand-ink" : "text-brand-muted hover:text-brand-ink"
                                  }`}
                                  onClick={() => onUseRouteAsEntry(route.path)}
                                >
                                  {route.path}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-brand-line px-2 py-1 text-[11px] font-semibold text-brand-muted transition hover:text-brand-ink"
                                  onClick={() => onAddRouteHint(route.path)}
                                >
                                  Add
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-brand-muted">
                          {repoRoutesError || "No route suggestions yet. You can still type the route plan manually."}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="mb-3 text-sm font-medium text-brand-muted">Coverage</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {SCOPE_OPTIONS.map((option) => {
                        const active = draft.scopeMode === option.value;
                        return (
                          <button
                            key={option.value}
                            className={`rounded-xl border px-4 py-4 text-left transition ${
                              active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-shell hover:border-brand-primary/25 hover:bg-brand-bg"
                            }`}
                            type="button"
                            onClick={() =>
                              onChange((current) => ({
                                ...current,
                                scopeMode: option.value
                              }))
                            }
                          >
                            <div className="text-sm font-semibold text-brand-ink">{option.label}</div>
                            <div className="mt-1 text-sm leading-6 text-brand-muted">{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-sm font-medium text-brand-muted">Mission</div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {GOAL_PRESETS.map((goal) => {
                        const active = goalLines.includes(goal);
                        return (
                          <button
                            key={goal}
                            className={`rounded-full border px-3 py-1.5 text-sm transition ${
                              active
                                ? "border-brand-primary/60 bg-brand-primary/12 text-brand-ink"
                                : "border-brand-line bg-brand-shell text-brand-muted hover:bg-brand-bg hover:text-brand-ink"
                            }`}
                            type="button"
                            onClick={() => onToggleGoal(goal)}
                          >
                            {goal}
                          </button>
                        );
                      })}
                    </div>
                    <TextArea
                      value={draft.goalsText}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          goalsText: event.target.value
                        }))
                      }
                    />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-5">
              <div>
                <div className="text-lg font-semibold text-brand-ink">Review</div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  Check the setup, then start the test.
                </p>
              </div>

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-brand-muted">Environment</dt>
                  <dd className="mt-1 text-brand-ink">{draft.targetUrl || "Add an environment URL."}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Mode</dt>
                  <dd className="mt-1 text-brand-ink">{RUN_MODE_OPTIONS.find((option) => option.value === draft.runMode)?.label || "Live QA"}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Browser runtime</dt>
                  <dd className="mt-1 text-brand-ink">{browserModeLabel}</dd>
                </div>
                {browserMode === "advanced_browser" ? (
                  <div>
                    <dt className="text-brand-muted">DO runtime</dt>
                    <dd className="mt-1 text-brand-ink">{advancedBrowserRuntime.title}</dd>
                    <div className="mt-1 text-xs leading-5 text-brand-muted">{advancedBrowserRuntime.detail}</div>
                  </div>
                ) : null}
                <div>
                  <dt className="text-brand-muted">What to test</dt>
                  <dd className="mt-1 text-brand-ink">{VALIDATION_TARGET_OPTIONS.find((option) => option.value === validationTarget)?.label || "Public flow"}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Access</dt>
                  <dd className="mt-1 text-brand-ink">{reviewAccessLabel}</dd>
                </div>
                {draft.authUrl ? (
                  <div>
                    <dt className="text-brand-muted">Auth URL</dt>
                    <dd className="mt-1 text-brand-ink">{draft.authUrl}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-brand-muted">User</dt>
                  <dd className="mt-1 text-brand-ink">
                    {PERSONA_PRESETS.find((persona) => persona.persona === draft.persona)?.name || "Custom user"}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Flow</dt>
                  <dd className="mt-1 text-brand-ink">
                    {isControlled ? draft.userJob || "Add the owned flow job." : goalLines[0] || "Add the mission."}
                  </dd>
                </div>
                {isControlled ? (
                  <>
                    <div>
                      <dt className="text-brand-muted">Entry path</dt>
                      <dd className="mt-1 text-brand-ink">{draft.entryPath || "Add an entry path."}</dd>
                    </div>
                    <div>
                      <dt className="text-brand-muted">Route hints</dt>
                      <dd className="mt-1 text-brand-ink">{routeHintLines.length} added</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt className="text-brand-muted">Coverage</dt>
                    <dd className="mt-1 text-brand-ink">{effectiveScopeLabel}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-brand-line pt-5">
            <div>
              {step > 1 ? (
                <Button tone="ghost" onClick={() => setStep((current) => Math.max(1, current - 1))}>
                  Back
                </Button>
              ) : null}
            </div>
            <Button tone="primary" onClick={handleNext} disabled={busy || !stepReady}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : step === 5 ? <Play className="h-4 w-4" /> : null}
              {step === 5 ? "Start test" : "Next"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-brand-line bg-brand-panel p-5">
            <div className="text-sm font-semibold text-brand-ink">Current setup</div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-brand-muted">Environment</div>
                <div className="mt-1 text-brand-ink">{draft.targetUrl || "Not set yet"}</div>
              </div>
              <div>
                <div className="text-brand-muted">Mode</div>
                <div className="mt-1 text-brand-ink">{RUN_MODE_OPTIONS.find((option) => option.value === draft.runMode)?.label || "Live QA"}</div>
              </div>
              <div>
                <div className="text-brand-muted">Browser runtime</div>
                <div className="mt-1 text-brand-ink">{browserModeLabel}</div>
              </div>
              <div>
                <div className="text-brand-muted">What to test</div>
                <div className="mt-1 text-brand-ink">{VALIDATION_TARGET_OPTIONS.find((option) => option.value === validationTarget)?.label || "Public flow"}</div>
              </div>
              <div>
                <div className="text-brand-muted">Access</div>
                <div className="mt-1 text-brand-ink">{reviewAccessLabel}</div>
              </div>
              {isControlled ? (
                <div>
                  <div className="text-brand-muted">Owned flow</div>
                  <div className="mt-1 text-brand-ink">{draft.userJob || "Add the user job in Flow Setup."}</div>
                </div>
              ) : (
                <div>
                  <div className="text-brand-muted">Mission</div>
                  <div className="mt-1 text-brand-ink">{goalLines[0] || "Add the mission in Flow Setup."}</div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-line bg-brand-panel p-5">
            <div className="text-sm font-semibold text-brand-ink">What happens next</div>
            <div className="mt-2 text-sm leading-6 text-brand-muted">
              {browserMode === "advanced_browser"
                ? "We will use a fresh DO worker browser with supported captcha handling."
                : validationTarget === "public_flow"
                ? "We will stay on public pages only."
                : validationTarget === "login_signup"
                  ? "We will judge the auth experience itself and avoid bypasses."
                  : accessMethod === "saved_session"
                    ? "We will start from the old saved account and focus on the product after login."
                    : accessMethod === "create_account"
                      ? "We will create a fresh account, then keep going inside the product."
                      : "We will use the provided test login and focus on the product after login."}
            </div>
            {browserMode === "advanced_browser" ? (
              <div className="mt-3">
                <AdvancedBrowserReadinessCard runtime={advancedBrowserRuntime} onRefresh={onRefreshWorkerHealth} />
              </div>
            ) : null}
            {isControlled ? (
              <div className="mt-3 text-sm leading-6 text-brand-muted">
                Controlled UX keeps the run close to one owned flow and uses route hints when the repo is connected.
              </div>
            ) : null}
          </div>

          <details className="rounded-2xl border border-brand-line bg-brand-panel p-5">
            <summary className="cursor-pointer list-none text-sm font-semibold text-brand-ink">Advanced</summary>
            <div className="mt-4 space-y-4 text-sm">
              <label className="flex items-center gap-3 text-brand-muted">
                <input
                  type="checkbox"
                  checked={draft.repoTriageEnabled}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      repoTriageEnabled: event.target.checked
                    }))
                  }
                />
                Attach repo-aware diagnosis after the run
              </label>
              {repoConnection?.connection_status === "connected" ? (
                <div className="rounded-lg border border-brand-line bg-brand-shell px-3 py-3 text-sm">
                  <div className="font-medium text-brand-ink">{repoConnection.selected_repo_full_name}</div>
                  <div className="mt-1 text-brand-muted">
                    Connected for route hints and post-run diagnosis.
                    {repoConnection?.associated_repo_full_names && repoConnection.associated_repo_full_names.length > 1
                      ? ` ${repoConnection.associated_repo_full_names.length} project repos are linked.`
                      : ""}
                  </div>
                </div>
              ) : (
                <Button tone="secondary" onClick={onStartGitHubInstall}>
                  <GitBranch className="h-4 w-4" />
                  Connect GitHub
                </Button>
              )}
            </div>
          </details>

          {message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                tone === "success"
                  ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                  : tone === "danger"
                    ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                    : "border-brand-line bg-brand-bg text-brand-muted"
              }`}
            >
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LiveSessionEmbed({
  embedUrl,
  viewerUrl,
  title = "Live session",
  className = "",
  frameClassName = ""
}: {
  embedUrl: string;
  viewerUrl?: string;
  title?: string;
  className?: string;
  frameClassName?: string;
}) {
  const safeEmbedUrl = String(embedUrl || "").trim();
  const safeViewerUrl = String(viewerUrl || embedUrl || "").trim();
  if (!safeEmbedUrl) {
    return null;
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-brand-line bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
        <div className="text-sm font-black text-brand-ink">{title}</div>
        {safeViewerUrl ? (
          <a
            href={safeViewerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:text-brand-ink"
          >
            Open in new tab
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      <div className={`h-[min(62vh,560px)] min-h-[320px] bg-brand-ink ${frameClassName}`}>
        <iframe
          title={title}
          src={safeEmbedUrl}
          className="h-full w-full border-0 bg-brand-ink"
          allow="clipboard-read; clipboard-write; fullscreen"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function getManualQaItemTone(status: ManualQaItem["status"] | string) {
  if (status === "pass") return "success";
  if (status === "fail" || status === "blocked") return "danger";
  if (status === "confusing") return "warning";
  return "neutral";
}

function getManualQaItemLabel(status: ManualQaItem["status"] | string) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  if (status === "confusing") return "Confusing";
  if (status === "blocked") return "Blocked";
  if (status === "skip") return "Skipped";
  return "Pending";
}

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function downloadUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ManualQaWidgetLaunch({ targetUrl, widgetStatus }: { targetUrl: string; widgetStatus?: string | null }) {
  return (
    <div className="rounded-xl border border-brand-line bg-brand-shell p-4 shadow-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-brand-ink">Page widget</div>
          <div className="mt-1 text-sm text-brand-muted">
            Open the preview. If the agent injected the snippet, use the floating Review button on the page.
          </div>
          {widgetStatus ? <div className="mt-2 text-xs font-semibold text-brand-muted">Widget: {widgetStatus}</div> : null}
        </div>
        {targetUrl ? (
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-primary bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-strong"
          >
            <ExternalLink className="h-4 w-4" />
            Open target
          </a>
        ) : (
          <Button tone="primary" disabled>
            Open target
          </Button>
        )}
      </div>
    </div>
  );
}

function ManualQaReviewRecorder({
  targetUrl,
  sessionId,
  isSidecar
}: {
  targetUrl: string;
  sessionId: string;
  isSidecar: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const drawingRef = useRef(false);
  const recordingUrlRef = useRef("");
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ready">("idle");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recorderMessage, setRecorderMessage] = useState("");
  const [hasDrawing, setHasDrawing] = useState(false);
  const safeSessionId = String(sessionId || "manual-qa").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (captureStream) {
      video.srcObject = captureStream;
      video.play().catch(() => null);
    } else {
      video.srcObject = null;
    }
  }, [captureStream]);

  useEffect(() => {
    recordingUrlRef.current = recordingUrl;
  }, [recordingUrl]);

  useEffect(() => {
    return () => {
      stopReviewCapture();
      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
        recordingUrlRef.current = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopActiveStreams() {
    activeStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    activeStreamsRef.current = [];
    setCaptureStream(null);
  }

  function openTargetWindow() {
    if (!targetUrl) {
      setRecorderMessage("No target URL was provided.");
      return null;
    }
    return window.open(
      targetUrl,
      "beforeusersdo-test-target",
      "popup=yes,width=1280,height=900,left=460,top=40"
    );
  }

  function openSidecarWindow() {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("sidecar", "1");
    const sidecar = window.open(
      currentUrl.toString(),
      "beforeusersdo-review-sidecar",
      "popup=yes,width=440,height=900,left=20,top=40"
    );
    sidecar?.focus();
  }

  async function startReviewCapture() {
    setRecorderMessage("");
    if (targetUrl) {
      openTargetWindow();
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setRecorderMessage("Screen recording is not available in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setRecorderMessage("Recording is not available in this browser.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        micStream = null;
      }

      const combinedTracks = [
        ...displayStream.getVideoTracks(),
        ...displayStream.getAudioTracks(),
        ...(micStream ? micStream.getAudioTracks() : [])
      ];
      const combinedStream = new MediaStream(combinedTracks);
      activeStreamsRef.current = micStream ? [displayStream, micStream, combinedStream] : [displayStream, combinedStream];

      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
        recordingUrlRef.current = "";
        setRecordingUrl("");
      }
      chunksRef.current = [];
      const mimeType = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blobType = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        const nextUrl = URL.createObjectURL(blob);
        recordingUrlRef.current = nextUrl;
        setRecordingUrl(nextUrl);
        setRecordingState("ready");
        setRecorderMessage("Recording ready. Download it before closing this page.");
        stopActiveStreams();
      };
      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopReviewCapture();
      });
      setCaptureStream(combinedStream);
      setRecordingState("recording");
      setRecorderMessage("Recording. Choose the target window if Chrome asks what to share.");
      recorder.start(1000);
      window.setTimeout(resizeDrawingCanvas, 250);
    } catch (caught) {
      setRecorderMessage(caught instanceof Error ? caught.message : "Could not start recording.");
      stopActiveStreams();
      setRecordingState("idle");
    }
  }

  function stopReviewCapture() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopActiveStreams();
    if (recordingState === "recording") {
      setRecordingState("idle");
    }
  }

  function resizeDrawingCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
    const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width === nextWidth && canvas.height === nextHeight) {
      return;
    }
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
    };
  }

  function handleDrawStart(event: React.PointerEvent<HTMLCanvasElement>) {
    resizeDrawingCanvas();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const point = getCanvasPoint(event);
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(4, canvas.width / 180);
    context.strokeStyle = "#ef4444";
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function handleDrawMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) {
      return;
    }
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasDrawing(true);
  }

  function handleDrawEnd(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  function downloadAnnotation() {
    const video = videoRef.current;
    const annotation = canvasRef.current;
    if (!video || !annotation || !captureStream) {
      setRecorderMessage("Start screen sharing before saving an annotated screenshot.");
      return;
    }
    const rect = annotation.getBoundingClientRect();
    const width = annotation.width || Math.floor(rect.width || 1280);
    const height = annotation.height || Math.floor(rect.height || 720);
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    try {
      context.drawImage(video, 0, 0, width, height);
    } catch {
      // Some browsers briefly block drawing the stream before the first frame is ready.
    }
    context.drawImage(annotation, 0, 0, width, height);
    downloadUrl(output.toDataURL("image/png"), `${safeSessionId}-annotation.png`);
  }

  return (
    <div className="rounded-xl border border-brand-line bg-brand-shell p-4 shadow-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-brand-ink">Fallback recorder</div>
          <div className="mt-1 text-sm text-brand-muted">Use this only if the page widget was not installed.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSidecar ? (
            <Button tone="secondary" onClick={openSidecarWindow}>
              <PanelRight className="h-4 w-4" />
              Sidecar
            </Button>
          ) : null}
          {recordingState === "recording" ? (
            <Button tone="danger" onClick={stopReviewCapture}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button tone="primary" onClick={startReviewCapture} disabled={!targetUrl}>
              <MonitorUp className="h-4 w-4" />
              Start review
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-brand-line bg-brand-ink">
        <div className="relative aspect-video min-h-[220px]">
          {captureStream ? (
            <>
              <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-contain" />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={handleDrawStart}
                onPointerMove={handleDrawMove}
                onPointerUp={handleDrawEnd}
                onPointerCancel={handleDrawEnd}
                aria-label="Draw on the recorded screen preview"
              />
            </>
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm text-white/70">
              Press Start review, then choose the target window when Chrome asks what to share.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button tone="secondary" onClick={downloadAnnotation} disabled={!captureStream}>
            <PenLine className="h-4 w-4" />
            Save drawing
          </Button>
          <Button tone="ghost" onClick={clearDrawing} disabled={!hasDrawing}>
            <Eraser className="h-4 w-4" />
            Clear
          </Button>
        </div>
        {recordingUrl ? (
          <Button tone="secondary" onClick={() => downloadUrl(recordingUrl, `${safeSessionId}-review.webm`)}>
            <Download className="h-4 w-4" />
            Download recording
          </Button>
        ) : null}
      </div>

      {recorderMessage ? (
        <div className="mt-3 rounded-lg border border-brand-line bg-brand-panel px-3 py-2 text-sm text-brand-muted">
          <Mic className="mr-2 inline h-4 w-4 text-brand-accent" />
          {recorderMessage}
        </div>
      ) : null}
    </div>
  );
}

function ManualQaPage({
  session,
  loading,
  error,
  busyItemId,
  copyFeedback,
  onBack,
  onUpdateItem,
  onExport
}: {
  session: ManualQaSession | null;
  loading: boolean;
  error: string;
  busyItemId: string;
  copyFeedback: string;
  onBack: () => void;
  onUpdateItem: (item: ManualQaItem, status: ManualQaItem["status"], note: string, evidenceText: string) => Promise<void>;
  onExport: () => Promise<void>;
}) {
  const checklist = session?.checklist || [];
  const firstPending = checklist.find((item) => item.status === "pending") || checklist[0] || null;
  const [selectedItemId, setSelectedItemId] = useState(firstPending?.id || "");
  const selectedItem = checklist.find((item) => item.id === selectedItemId) || firstPending;
  const [noteDraft, setNoteDraft] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const counts = session?.counts || {};
  const browserEmbedUrl = String(session?.browser?.embed_url || session?.browser?.viewer_url || "").trim();
  const browserViewerUrl = String(session?.browser?.viewer_url || session?.browser?.embed_url || "").trim();
  const targetUrl = String(session?.target_url || session?.browser?.target_url || "").trim();
  const isSidecar =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sidecar") === "1";

  useEffect(() => {
    if (!selectedItemId && firstPending?.id) {
      setSelectedItemId(firstPending.id);
    }
  }, [firstPending?.id, selectedItemId]);

  useEffect(() => {
    setNoteDraft(selectedItem?.note || "");
    setEvidenceDraft((selectedItem?.evidence_urls || []).join("\n"));
  }, [selectedItem?.id, selectedItem?.note, selectedItem?.evidence_urls]);

  async function saveSelected(status: ManualQaItem["status"]) {
    if (!selectedItem) {
      return;
    }
    await onUpdateItem(selectedItem, status, noteDraft, evidenceDraft);
  }

  return (
    <section className="min-h-screen bg-brand-bg text-brand-ink">
      <div className="border-b border-brand-line bg-brand-shell px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-muted hover:text-brand-ink"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Dashboard
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={formatStatusLabel(session?.status || "manual_ready")} tone={getStatusTone(session?.status || "manual_ready")} />
              <span className="text-sm text-brand-muted">{session?.brand_name || session?.brand_key || "Manual QA"}</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
              {session?.title || "Manual QA session"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-brand-muted">
              {targetUrl ? <span className="break-all">{targetUrl}</span> : null}
              {session?.updated_at ? <span>{formatDateTime(session.updated_at)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {targetUrl ? (
              <a
                href={targetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-line bg-brand-shell px-3.5 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-bg"
              >
                <ExternalLink className="h-4 w-4" />
                Target
              </a>
            ) : null}
            <Button tone="secondary" onClick={onExport} disabled={!session}>
              <Copy className="h-4 w-4" />
              {copyFeedback || "Copy report"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[390px_1fr] sm:px-6">
        <aside className="space-y-4">
          <div className="rounded-xl border border-brand-line bg-brand-shell p-4 shadow-shell">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-brand-ink">Checklist</div>
              <div className="text-xs font-semibold text-brand-muted">
                {(counts.pass || 0) + (counts.fail || 0) + (counts.confusing || 0) + (counts.blocked || 0) + (counts.skip || 0)}/{checklist.length || 0}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-brand-line bg-brand-panel px-2 py-2">
                <div className="font-semibold text-brand-success">{counts.pass || 0}</div>
                <div className="text-brand-muted">Pass</div>
              </div>
              <div className="rounded-lg border border-brand-line bg-brand-panel px-2 py-2">
                <div className="font-semibold text-brand-danger">{counts.fail || 0}</div>
                <div className="text-brand-muted">Fail</div>
              </div>
              <div className="rounded-lg border border-brand-line bg-brand-panel px-2 py-2">
                <div className="font-semibold text-brand-warning">{(counts.confusing || 0) + (counts.blocked || 0)}</div>
                <div className="text-brand-muted">Needs note</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-brand-line bg-brand-shell shadow-shell">
            {loading ? (
              <div className="px-4 py-6 text-sm text-brand-muted">
                <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                Loading manual QA
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-brand-danger">{error}</div>
            ) : !checklist.length ? (
              <div className="px-4 py-6 text-sm text-brand-muted">No checklist was found for this session.</div>
            ) : (
              <div className="divide-y divide-brand-line">
                {checklist.map((item, index) => {
                  const active = selectedItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        active ? "bg-brand-bg" : "hover:bg-brand-bg/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-brand-muted">Item {index + 1}</div>
                          <div className="mt-1 line-clamp-2 text-sm font-semibold text-brand-ink">{item.title}</div>
                        </div>
                        <StatusPill label={getManualQaItemLabel(item.status)} tone={getManualQaItemTone(item.status)} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <ManualQaWidgetLaunch targetUrl={targetUrl} widgetStatus={session?.widget?.status} />

              <details className="px-1">
                <summary className="cursor-pointer list-none text-sm font-semibold text-brand-muted hover:text-brand-ink">
                  Fallback sidecar recorder
                </summary>
                <div className="mt-4">
                  <ManualQaReviewRecorder
                    targetUrl={targetUrl}
                    sessionId={session?.session_id || "manual-qa"}
                    isSidecar={isSidecar}
                  />
                </div>
              </details>

              {session?.context?.work_summary || session?.context?.developer_notes ? (
                <div className="rounded-xl border border-brand-line bg-brand-shell p-4 shadow-shell">
                  <div className="text-sm font-semibold text-brand-ink">Agent context</div>
                  {session.context.work_summary ? (
                    <p className="mt-3 text-sm leading-6 text-brand-muted">{session.context.work_summary}</p>
                  ) : null}
                  {session.context.developer_notes ? (
                    <p className="mt-3 text-sm leading-6 text-brand-muted">{session.context.developer_notes}</p>
                  ) : null}
                </div>
              ) : null}

              {browserEmbedUrl ? (
                <details className="px-1">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-brand-muted hover:text-brand-ink">
                    Advanced remote browser fallback
                  </summary>
                  <div className="mt-4">
                    <LiveSessionEmbed
                      embedUrl={browserEmbedUrl}
                      viewerUrl={browserViewerUrl}
                      title="Remote browser fallback"
                      className="bg-brand-shell"
                      frameClassName="h-[420px] min-h-[320px]"
                    />
                  </div>
                </details>
              ) : null}
            </div>

            <div className="rounded-xl border border-brand-line bg-brand-shell p-4 shadow-shell">
              {selectedItem ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <StatusPill label={getManualQaItemLabel(selectedItem.status)} tone={getManualQaItemTone(selectedItem.status)} />
                      {selectedItem.start_url ? (
                        <a
                          href={selectedItem.start_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent"
                        >
                          Start here
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-brand-ink">{selectedItem.title}</h2>
                    {selectedItem.instructions ? (
                      <p className="mt-2 text-sm leading-6 text-brand-muted">{selectedItem.instructions}</p>
                    ) : null}
                    {selectedItem.expected ? (
                      <div className="mt-3 rounded-lg border border-brand-line bg-brand-panel px-3 py-2 text-sm leading-6 text-brand-muted">
                        <span className="font-semibold text-brand-ink">Expected: </span>
                        {selectedItem.expected}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <FieldLabel>Tester note</FieldLabel>
                    <TextArea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="What happened? What should the developer see?"
                      className="min-h-[130px]"
                    />
                  </div>

                  <div>
                    <FieldLabel>Evidence links</FieldLabel>
                    <TextArea
                      value={evidenceDraft}
                      onChange={(event) => setEvidenceDraft(event.target.value)}
                      placeholder="One screenshot, recording, or issue URL per line"
                      className="min-h-[86px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button tone="primary" onClick={() => saveSelected("pass")} disabled={busyItemId === selectedItem.id}>
                      <Check className="h-4 w-4" />
                      Pass
                    </Button>
                    <Button tone="danger" onClick={() => saveSelected("fail")} disabled={busyItemId === selectedItem.id}>
                      <TriangleAlert className="h-4 w-4" />
                      Fail
                    </Button>
                    <Button tone="secondary" onClick={() => saveSelected("confusing")} disabled={busyItemId === selectedItem.id}>
                      <CircleAlert className="h-4 w-4" />
                      Confusing
                    </Button>
                    <Button tone="secondary" onClick={() => saveSelected("blocked")} disabled={busyItemId === selectedItem.id}>
                      <Lock className="h-4 w-4" />
                      Blocked
                    </Button>
                  </div>

                  <Button tone="ghost" className="w-full" onClick={() => saveSelected("skip")} disabled={busyItemId === selectedItem.id}>
                    Skip item
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-brand-muted">Pick a checklist item to record feedback.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}

function ReportReader({
  run,
  report,
  status,
  loading,
  error,
  shareKey,
  view,
  onChangeView,
  onRunAgain,
  onCopyShareLink,
  copyFeedback,
  selectedFindingId,
  onSelectFinding
}: {
  run: RunSummary | null;
  report: QaReport | null;
  status: StatusResponse | null;
  loading: boolean;
  error: string;
  shareKey: string;
  view: "report" | "live";
  onChangeView: (view: "report" | "live") => void;
  onRunAgain: () => Promise<void>;
  onCopyShareLink: () => Promise<void>;
  copyFeedback: string;
  selectedFindingId: string;
  onSelectFinding: (id: string) => void;
}) {
  const effectiveStatus = String(status?.queue?.queue_status || status?.report_status || run?.status || "").toLowerCase();
  const evidenceIndexMap = buildEvidenceIndexMap(report, "screenshot");
  const primaryFinding = getPrimaryFinding(report);
  const findings = report?.findings || [];
  const journeys = report?.tested_journeys || [];
  const screenshotValues = Array.from(evidenceIndexMap.entries())
    .sort((left, right) => left[1] - right[1])
    .slice(0, 8);
  const liveStreamEmbedUrl = String(
    status?.artifacts?.live_stream_embed_url ||
      status?.artifacts?.live_stream_viewer_url ||
      ""
  ).trim();
  const liveStreamViewerUrl = String(
    status?.artifacts?.live_stream_viewer_url ||
      status?.artifacts?.live_stream_embed_url ||
      ""
  ).trim();
  const isActiveRun = ["queued", "processing", "retryable"].includes(effectiveStatus);
  const reportReady = Boolean(report || status?.report_ready || run?.report_ready);

  return (
    <section className="rounded-2xl border border-brand-line bg-brand-shell shadow-shell">
      <div className="border-b border-brand-line px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={formatStatusLabel(effectiveStatus || "queued")} tone={getStatusTone(effectiveStatus || "queued")} />
              {run?.brand_name || run?.brand_key ? (
                <span className="text-sm text-brand-muted">{run?.brand_name || inferBrandName(run?.brand_key || "")}</span>
              ) : null}
            </div>
            <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.5rem)] font-semibold tracking-tight text-brand-ink">
              {getReportHeadline(run, report)}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-muted">{getReportSubhead(run, report)}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-brand-muted">
              <span>{run?.target_url || run?.target || report?.target || "No target yet"}</span>
              {run?.delivered_at ? <span>{formatDateTime(run.delivered_at)}</span> : null}
              {run?.persona ? <span>{run.persona}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button tone={view === "report" ? "primary" : "secondary"} onClick={() => onChangeView("report")}>
              Report
            </Button>
            <Button tone={view === "live" ? "primary" : "secondary"} onClick={() => onChangeView("live")}>
              Live
            </Button>
            <Button tone="secondary" onClick={onRunAgain}>
              Run again
            </Button>
            <Button tone="secondary" onClick={onCopyShareLink}>
              <Copy className="h-4 w-4" />
              {copyFeedback || "Share"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-sm text-brand-muted">
          <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
          Loading report
        </div>
      ) : error ? (
        <div className="px-6 py-8 text-sm text-brand-danger">{error}</div>
      ) : !run && !report ? (
        <div className="px-6 py-8 text-sm text-brand-muted">Pick a test to open the detail view.</div>
      ) : view === "live" ? (
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-brand-ink">Queue and live state</div>
                <StatusPill label={formatStatusLabel(effectiveStatus || "queued")} tone={getStatusTone(effectiveStatus || "queued")} />
              </div>
              <div className="mt-3 text-sm leading-6 text-brand-muted">
                {status?.progress?.message || report?.summary?.note || run?.summary_note || "Waiting for updates."}
              </div>
              {!isActiveRun && reportReady ? (
                <div className="mt-4">
                  <Button tone="primary" onClick={() => onChangeView("report")}>
                    <FileText className="h-4 w-4" />
                    View report
                  </Button>
                </div>
              ) : null}
              {typeof status?.progress?.percent === "number" ? (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-black/20">
                    <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${Math.max(4, Math.min(100, status.progress.percent || 0))}%` }} />
                  </div>
                </div>
              ) : null}
            </div>

            {isActiveRun && liveStreamEmbedUrl ? (
              <LiveSessionEmbed
                embedUrl={liveStreamEmbedUrl}
                viewerUrl={liveStreamViewerUrl}
                title="Live watch"
                className="bg-brand-panel"
              />
            ) : null}

            {(status?.run_log || []).length ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="text-sm font-semibold text-brand-ink">Recent activity</div>
                <div className="mt-3 space-y-2">
                  {(status?.run_log || []).slice(-12).reverse().map((entry, index) => (
                    <div key={`${String(entry.event || entry.ts || index)}`} className="rounded-lg border border-brand-line px-3 py-2 text-sm">
                      <div className="font-medium text-brand-ink">{String(entry.event || "event").replaceAll("_", " ")}</div>
                      <div className="mt-1 text-brand-muted">{String(entry.message || entry.note || JSON.stringify(entry.data || {})).slice(0, 200)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {status?.live_report?.latest_frame_url ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="text-sm font-semibold text-brand-ink">Latest frame</div>
                <img
                  className="mt-3 w-full rounded-lg border border-brand-line object-cover"
                  src={status.live_report.latest_frame_url}
                  alt="Latest frame"
                />
              </div>
            ) : screenshotValues[0] ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="text-sm font-semibold text-brand-ink">Latest frame</div>
                <img
                  className="mt-3 w-full rounded-lg border border-brand-line object-cover"
                  src={buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "screenshot", screenshotValues[0][1], shareKey)}
                  alt="Latest frame"
                />
              </div>
            ) : null}

            {status?.live_report?.findings?.length ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="text-sm font-semibold text-brand-ink">Live findings</div>
                <div className="mt-3 space-y-2">
                  {status.live_report.findings.slice(0, 5).map((finding, index) => (
                    <div key={finding.id || index} className="rounded-lg border border-brand-line px-3 py-2 text-sm">
                      <div className="font-medium text-brand-ink">{finding.title || `Finding ${index + 1}`}</div>
                      <div className="mt-1 text-brand-muted">{getFindingSummary(finding)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {primaryFinding ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-brand-ink">Next fix</div>
                  <StatusPill label={formatStatusLabel(primaryFinding.severity || "medium")} tone={getSeverityTone(primaryFinding.severity || "medium")} />
                </div>
                <div className="mt-3 text-sm leading-7 text-brand-muted">
                  {primaryFinding.recommended_fix || primaryFinding.expected_behavior || primaryFinding.observed_behavior}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
              <div className="text-sm font-semibold text-brand-ink">Problems</div>
              {!findings.length ? (
                <div className="mt-3 text-sm text-brand-muted">No structured problems were recorded for this run.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {findings.map((finding, index) => {
                    const findingId = finding.id || `finding-${index}`;
                    const active = selectedFindingId ? selectedFindingId === findingId : index === 0;
                    const screenshotSource = finding.evidence?.screenshots?.[0];
                    const screenshotIndex = screenshotSource ? evidenceIndexMap.get(screenshotSource) : undefined;
                    return (
                      <div key={findingId} className="rounded-xl border border-brand-line">
                        <button
                          className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
                          type="button"
                          onClick={() => onSelectFinding(active ? "" : findingId)}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-brand-ink">{finding.title || `Problem ${index + 1}`}</div>
                            <div className="mt-1 text-sm leading-6 text-brand-muted">{finding.observed_behavior || finding.expected_behavior}</div>
                          </div>
                          <StatusPill label={formatStatusLabel(finding.severity || "medium")} tone={getSeverityTone(finding.severity || "medium")} />
                        </button>
                        {active ? (
                          <div className="grid gap-4 border-t border-brand-line px-4 py-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-3 text-sm">
                              {finding.expected_behavior ? (
                                <div>
                                  <div className="font-medium text-brand-ink">Expected</div>
                                  <div className="mt-1 leading-6 text-brand-muted">{finding.expected_behavior}</div>
                                </div>
                              ) : null}
                              {finding.observed_behavior ? (
                                <div>
                                  <div className="font-medium text-brand-ink">Observed</div>
                                  <div className="mt-1 leading-6 text-brand-muted">{finding.observed_behavior}</div>
                                </div>
                              ) : null}
                              {finding.recommended_fix ? (
                                <div>
                                  <div className="font-medium text-brand-ink">Fix</div>
                                  <div className="mt-1 leading-6 text-brand-muted">{finding.recommended_fix}</div>
                                </div>
                              ) : null}
                            </div>
                            {typeof screenshotIndex === "number" ? (
                              <img
                                className="w-full rounded-lg border border-brand-line object-cover"
                                src={buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "screenshot", screenshotIndex, shareKey)}
                                alt={finding.title || "Finding proof"}
                              />
                            ) : (
                              <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-brand-line text-sm text-brand-muted">
                                No screenshot attached.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {journeys.length ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="text-sm font-semibold text-brand-ink">Journeys tested</div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {journeys.map((journey, index) => (
                    <div key={journey.id || index} className="rounded-xl border border-brand-line px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-brand-ink">{journey.name || `Journey ${index + 1}`}</div>
                        <StatusPill label={formatStatusLabel(journey.status || "unknown")} tone={getStatusTone(journey.status || "unknown")} />
                      </div>
                      <div className="mt-2 text-sm leading-6 text-brand-muted">{journey.summary || "No journey summary recorded."}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {screenshotValues.length ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-brand-ink">Proof</div>
                  <StatusPill label={`${screenshotValues.length} shots`} tone="neutral" />
                </div>
                <div className="mt-3 grid gap-3">
                  {screenshotValues.slice(0, 4).map(([source, index]) => (
                    <a
                      key={source}
                      href={buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "screenshot", index, shareKey)}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-lg border border-brand-line"
                    >
                      <img
                        className="aspect-[16/10] w-full object-cover"
                        src={buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "screenshot", index, shareKey)}
                        alt={`Proof ${index + 1}`}
                      />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {(report?.engineering_triage || run?.repo_triage_enabled) ? (
              <details className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-brand-ink">Engineering detail</summary>
                <div className="mt-3 space-y-3 text-sm">
                  {report?.engineering_triage?.summary ? (
                    <div className="leading-6 text-brand-muted">{report.engineering_triage.summary}</div>
                  ) : (
                    <div className="leading-6 text-brand-muted">Repo-aware triage is enabled for this project. Expanded diagnosis will appear here when available.</div>
                  )}
                  {(report?.engineering_triage?.suspected_files || []).length ? (
                    <div>
                      <div className="font-medium text-brand-ink">Suspected files</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(report?.engineering_triage?.suspected_files || []).map((file) => (
                          <span key={file} className="rounded-md border border-brand-line bg-brand-shell px-2 py-1 text-xs text-brand-muted">
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function SharedReportPage({
  loading,
  error,
  report,
  status,
  runId,
  shareKey
}: {
  loading: boolean;
  error: string;
  report: QaReport | null;
  status: StatusResponse | null;
  runId: string;
  shareKey: string;
}) {
  const primaryFinding = getPrimaryFinding(report);
  const evidenceMap = buildEvidenceIndexMap(report, "screenshot");
  const firstEvidence = Array.from(evidenceMap.entries()).sort((left, right) => left[1] - right[1])[0];

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink" data-app-shell="shared-report">
      <header className="border-b border-brand-line bg-brand-shell/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
          <BrandMark />
          <a className="inline-flex items-center gap-2 rounded-lg border border-brand-line bg-brand-shell px-3.5 py-2 text-sm font-semibold text-brand-ink transition hover:bg-brand-bg" href="/">
            Run your own test
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-10">
        <div className="rounded-2xl border border-brand-line bg-brand-shell p-6 shadow-shell">
          {loading ? (
            <div className="text-sm text-brand-muted">
              <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
              Loading shared report
            </div>
          ) : error ? (
            <div className="text-sm text-brand-danger">{error}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={formatStatusLabel(status?.queue?.queue_status || report?.status || "report")}
                  tone={getStatusTone(status?.queue?.queue_status || report?.status || "report")}
                />
                <span className="text-sm text-brand-muted">Shared report</span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-brand-ink">
                {primaryFinding?.title || report?.summary?.note || "QA report"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-muted">
                {primaryFinding?.observed_behavior || report?.summary?.note || "Read the main problem and the proof below."}
              </p>

              {firstEvidence ? (
                <img
                  className="mt-6 w-full rounded-xl border border-brand-line object-cover"
                  src={buildEvidenceAssetUrl(runId || report?.run_id || "", "screenshot", firstEvidence[1], shareKey)}
                  alt="Shared report proof"
                />
              ) : null}

              {report?.findings?.length ? (
                <div className="mt-6 space-y-3">
                  {report.findings.slice(0, 5).map((finding, index) => (
                    <div key={finding.id || index} className="rounded-xl border border-brand-line bg-brand-panel px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-brand-ink">{finding.title || `Finding ${index + 1}`}</div>
                        <StatusPill label={formatStatusLabel(finding.severity || "medium")} tone={getSeverityTone(finding.severity || "medium")} />
                      </div>
                      <div className="mt-2 text-sm leading-6 text-brand-muted">{finding.observed_behavior || finding.expected_behavior}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-brand-line bg-brand-shell p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-brand-ink">Run this on your own product</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-brand-muted">
                Start one real browser-backed test, keep the proof, and open the same list-detail triage inbox used for this report.
              </p>
            </div>
            <a className="inline-flex items-center gap-2 rounded-lg border border-brand-line bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-strong" href="/">
              Open homepage
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

type StarterHistoryRow = ReturnType<typeof buildStarterHistoryRows>[number];
type StarterFrictionPoint = ReturnType<typeof buildStarterFrictionRows>[number];
type StarterLiveAgent = ReturnType<typeof buildStarterLiveAgents>[number];

function StarterOnboardingFlow({
  personas,
  onComplete
}: {
  personas: StarterPersona[];
  onComplete: (input: { name: string; website: string; connectGitHub: boolean }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function finish(connectGitHub: boolean) {
    if (!name || !website || submitting) {
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      await onComplete({
        name,
        website: website.startsWith("http") ? website : `https://${website}`,
        connectGitHub
      });
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Could not finish setup.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full handcrafted-card bg-white p-12 rounded-[4rem] relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-brand-muted">
          <motion.div className="h-full bg-brand-accent" animate={{ width: `${(step / 2) * 100}%` }} />
        </div>

        {step === 1 ? (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="organic-pill inline-block mb-6 bg-brand-secondary/10 text-brand-ink border-brand-ink">
              Step 1: The Basics
            </div>
            <h2 className="text-4xl font-black mb-4">What are we testing?</h2>
            <p className="text-slate-500 font-bold mb-8">Give your brand a name and drop the URL. Our agents will start mapping it immediately.</p>

            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Brand Name</label>
                <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                  <Star className="text-slate-300 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="bg-transparent outline-none w-full font-bold"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Website URL</label>
                <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                  <Globe className="text-slate-300 w-5 h-5" />
                  <div className="flex items-center w-full">
                    <span className="text-slate-300 font-bold mr-1">https://</span>
                    <input
                      type="text"
                      placeholder="acme.com"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value.replace(/^https?:\/\//, ""))}
                      className="bg-transparent outline-none w-full font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2 block mb-3">Your Test Fleet is Ready</label>
                <div className="flex -space-x-4">
                  {personas.map((persona, index) => (
                    <motion.div
                      key={persona.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`w-12 h-12 rounded-2xl border-4 border-white ${persona.color} overflow-hidden shadow-lg relative group`}
                    >
                      <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </motion.div>
                  ))}
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-3 italic">These agents will begin exploring your site immediately after setup.</p>
              </div>

              <button
                disabled={!name || !website}
                onClick={() => setStep(2)}
                className="w-full bg-brand-ink text-white p-5 rounded-2xl font-black text-xl hover:bg-brand-accent transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
              >
                Next Step
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="organic-pill inline-block mb-6 bg-brand-accent/10 text-brand-ink border-brand-ink">
              Step 2: Deep Diagnosis
            </div>
            <h2 className="text-4xl font-black mb-4">Connect your Repos</h2>
            <p className="text-slate-500 font-bold mb-8">By connecting GitHub, our agents can examine your code after finding a bug to recommend a precise fix diagnosis.</p>

            <div className="handcrafted-card p-8 rounded-3xl bg-slate-50 border-dashed border-4 flex flex-col items-center text-center gap-6">
              <div className="w-20 h-20 bg-brand-ink rounded-3xl flex items-center justify-center rotate-[-5deg]">
                <GitBranch className="text-white w-12 h-12" />
              </div>
              <div>
                <h4 className="text-xl font-black mb-2">Install GitHub App</h4>
                <p className="text-sm font-bold text-slate-500">We&apos;ll only request read access to the repositories you select.</p>
              </div>
              <button
                onClick={() => finish(true)}
                disabled={submitting}
                className="bg-brand-ink text-white px-8 py-4 rounded-2xl font-black hover:bg-brand-accent transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? "Connecting..." : "Connect GitHub"}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => finish(false)}
              disabled={submitting}
              className="mt-8 text-sm font-black text-slate-400 hover:text-brand-ink transition-colors block mx-auto disabled:opacity-50"
            >
              Skip for now (I&apos;ll do it later)
            </button>
            {submitError ? <p className="mt-4 text-center text-sm font-bold text-rose-500">{submitError}</p> : null}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function StarterDashboard({
  brands,
  activeBrand,
  ownerEmail,
  workspaceError,
  personas,
  historyRows,
  liveAgents,
  frictionRows,
  trendData,
  workerLabel,
  onSwitchBrand,
  onAddBrand,
  onLogout,
  onViewReport,
  onViewPersonas,
  onViewAutomations,
  onViewHistory,
  onViewHelp,
  onOpenSettings,
  onRunNewTest,
  onScheduleTest,
  onRetryWorkspace
}: {
  brands: StarterBrand[];
  activeBrand: StarterBrand | null;
  ownerEmail: string;
  workspaceError: string;
  personas: StarterPersona[];
  historyRows: StarterHistoryRow[];
  liveAgents: StarterLiveAgent[];
  frictionRows: StarterFrictionPoint[];
  trendData: Array<{ name: string; score: number }>;
  workerLabel: string;
  onSwitchBrand: (brandId: string) => void;
  onAddBrand: () => void;
  onLogout: () => Promise<void>;
  onViewReport: (runId: string) => void;
  onViewPersonas: () => void;
  onViewAutomations: () => void;
  onViewHistory: () => void;
  onViewHelp: () => void;
  onOpenSettings: () => void;
  onRunNewTest: () => void;
  onScheduleTest: () => void;
  onRetryWorkspace: () => void | Promise<void>;
}) {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [selectedLiveAgent, setSelectedLiveAgent] = useState<StarterLiveAgent | null>(null);
  const latestScore = trendData[trendData.length - 1]?.score || 0;
  const openBugCount = frictionRows.filter((item) => item.severity === "high").length;
  const showBrandLoadNotice = Boolean(workspaceError) || !brands.length;

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      <AnimatePresence>
        {selectedLiveAgent ? (
          <StarterLiveAgentDetail agent={selectedLiveAgent} onClose={() => setSelectedLiveAgent(null)} />
        ) : null}
      </AnimatePresence>

      <aside className="w-64 border-r border-slate-200 flex flex-col bg-white">
        <div className="p-6 border-b border-slate-200">
          <Logo className="scale-75 origin-left" />
        </div>
        <div className="p-4 border-b border-slate-200 relative">
          <button
            onClick={() => setIsSwitcherOpen((current) => !current)}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 border border-slate-200 transition-all"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 bg-brand-ink rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[10px]">{activeBrand?.name?.[0] || "B"}</span>
              </div>
              <span className="font-bold text-sm truncate tracking-tight">{activeBrand?.name || "Choose a brand"}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isSwitcherOpen ? "rotate-180" : ""}`} />
          </button>

          {isSwitcherOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full left-4 right-4 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <div className="p-1 space-y-0.5">
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Your Brands</div>
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => {
                      onSwitchBrand(brand.id);
                      setIsSwitcherOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-all ${
                      activeBrand?.id === brand.id ? "bg-brand-accent/5 text-brand-accent" : ""
                    }`}
                  >
                    <div className="w-6 h-6 bg-brand-ink rounded-md flex items-center justify-center shrink-0">
                      <span className="text-white font-black text-[10px]">{brand.name[0]}</span>
                    </div>
                    <span className="font-bold text-xs truncate">{brand.name}</span>
                  </button>
                ))}
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    setIsSwitcherOpen(false);
                    onAddBrand();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-all text-brand-accent"
                >
                  <Plus className="w-4 h-4" />
                  <span className="font-bold text-xs">Add New Brand</span>
                </button>
              </div>
            </motion.div>
          ) : null}

          {showBrandLoadNotice ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {workspaceError ? "Brand load issue" : "No brands loaded"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                {workspaceError
                  ? workspaceError
                  : ownerEmail
                    ? `No brands are attached to ${ownerEmail}. If this is the wrong account, sign out and use the right email.`
                    : "We could not find any brands for this account."}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {ownerEmail || "Signed-in account unavailable"}
                </span>
                <button
                  onClick={() => void onRetryWorkspace()}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-brand-ink transition-all hover:bg-slate-100"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <StarterNavItem icon={<LayoutDashboard />} label="Overview" active onClick={() => null} />
          <StarterNavItem icon={<History />} label="Test History" onClick={onViewHistory} />
          <StarterNavItem icon={<Users />} label="Persona Lab" onClick={onViewPersonas} />
          <StarterNavItem icon={<Zap />} label="Automations" onClick={onViewAutomations} />
          <StarterNavItem icon={<FileText />} label="Help Center" onClick={onViewHelp} />
          <StarterNavItem icon={<Settings />} label="Settings" onClick={onOpenSettings} />
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={() => onLogout().catch(() => null)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-brand-danger/5 text-slate-400 hover:text-brand-danger transition-all font-bold text-sm"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-10">
        <header className="flex justify-between items-start mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-black tracking-tighter text-brand-ink">Overview</h1>
              <div className="px-2 py-0.5 rounded-full bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20 text-[10px] font-black uppercase tracking-widest">
                {liveAgents.length ? "Live Agents Active" : "Ready"}
              </div>
            </div>
            <p className="text-slate-500 font-bold flex items-center gap-2 text-sm">
              <Globe className="w-3.5 h-3.5" />
              {activeBrand?.website || "No brand selected"}
            </p>
            {workerLabel ? <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">{workerLabel}</p> : null}
          </div>
          <div className="flex gap-3">
            <button onClick={onScheduleTest} className="bg-white border border-slate-200 px-6 py-3 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
              <Clock className="w-4 h-4 text-slate-400" />
              Schedule Test
            </button>
            <button onClick={onRunNewTest} className="bg-brand-ink text-white px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-brand-accent transition-all shadow-sm">
              <Play className="w-4 h-4" />
              New Test
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-6">
            <StarterStatCard label="Satisfaction Score" value={`${latestScore}%`} trend="+ real data" icon={<Star className="text-brand-success" />} color="bg-brand-success/5" />
            <StarterStatCard label="Open Bugs" value={String(openBugCount).padStart(2, "0")} trend={`${frictionRows.filter((item) => item.severity === "high").length} critical`} icon={<Shield className="text-brand-danger" />} color="bg-brand-danger/5" />
            <StarterStatCard label="Friction Points" value={String(frictionRows.length).padStart(2, "0")} trend={`${historyRows.length} runs tracked`} icon={<Zap className="text-brand-warning" />} color="bg-brand-warning/5" />
            <StarterStatCard label="Active Agents" value={String(liveAgents.length).padStart(2, "0")} trend={liveAgents.length ? "Running now" : "Standing by"} icon={<MessageCircle className="text-brand-secondary" />} color="bg-brand-secondary/5" />
          </div>

          <div className="lg:col-span-3 dash-card p-8 bg-white">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black tracking-tight">User Satisfaction Trend</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last 7 Days</p>
              </div>
              <div className="flex items-center gap-2 text-brand-secondary">
                <TrendingUp className="w-5 h-5" />
                <span className="font-black text-lg">{latestScore}%</span>
              </div>
            </div>
            <div className="h-[250px]">
              <StarterHealthScoreChart data={trendData} />
            </div>
          </div>

          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="dash-card p-8 relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black tracking-tight">Live Agents</h3>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${liveAgents.length ? "bg-brand-accent" : "bg-slate-300"} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${liveAgents.length ? "bg-brand-accent" : "bg-slate-300"}`}></span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent">
                    {liveAgents.length ? `${liveAgents.length} Tests Running` : "No Live Tests"}
                  </span>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                {liveAgents.length ? (
                  liveAgents.map((agent) => (
                    <StarterLiveAgentRow key={agent.id} agent={agent} onClick={() => setSelectedLiveAgent(agent)} />
                  ))
                ) : (
                  <div className="dash-card p-6 bg-slate-50/50 text-sm font-bold text-slate-500">
                    No live sessions at the moment. Run a new test to watch agents explore the real product.
                  </div>
                )}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100">
                <button onClick={onViewHistory} className="w-full py-3 rounded-xl bg-slate-50 text-slate-400 font-black text-xs hover:bg-slate-100 transition-all">
                  View All Active Sessions
                </button>
              </div>
            </div>

            <StarterLiveAgentPeek agent={liveAgents[0] || { ...personas[0], task: "Next run", status: "Waiting for a new test", progress: 0, logs: [], thoughts: "Run a new test to see a live agent stream here." }} />
          </div>

          <div className="lg:col-span-3 space-y-8">
            <div className="dash-card p-8">
              <h3 className="text-xl font-black mb-8 tracking-tight">Open Friction Points</h3>
              <div className="space-y-4">
                {frictionRows.length ? (
                  frictionRows.map((point) => <StarterFrictionPointRow key={point.id} point={point} />)
                ) : (
                  <div className="text-sm font-bold text-slate-500">No friction points are open right now.</div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 dash-card overflow-hidden">
            <div className="px-8 py-6 border-b border-brand-muted flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black tracking-tight">Test History</h3>
              <button onClick={onViewHistory} className="text-sm font-black text-brand-accent hover:underline">View all reports</button>
            </div>
            <div className="divide-y border-t border-brand-muted">
              {historyRows.slice(0, 3).map((item) => (
                <StarterTestRow key={item.id} item={item} onClick={() => onViewReport(item.id)} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StarterNavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all font-bold text-sm ${
        active ? "bg-brand-ink text-white" : "text-slate-400 hover:bg-slate-50 hover:text-brand-ink"
      }`}
    >
      {cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5" })}
      {label}
    </button>
  );
}

function StarterStatCard({ label, value, trend, icon, color }: { label: string; value: string; trend: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="dash-card p-6 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-16 h-16 ${color} rounded-full -mr-6 -mt-6 transition-transform group-hover:scale-110`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">{cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5" })}</div>
        </div>
        <div className="flex items-end gap-2">
          <div className="text-3xl font-black tracking-tighter">{value}</div>
          <div className="text-[10px] font-bold text-brand-secondary mb-1.5">{trend}</div>
        </div>
      </div>
    </div>
  );
}

function StarterLiveAgentRow({ agent, onClick }: { agent: StarterLiveAgent; onClick?: () => void }) {
  return (
    <div onClick={onClick} className="dash-card p-4 bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer group">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl overflow-hidden border border-white shadow-sm ${agent.color}`}>
          <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-1">
            <div>
              <span className="font-black text-sm">{agent.name}</span>
              <span className="text-[10px] font-bold text-slate-400 ml-2 uppercase tracking-widest">Testing {agent.task}</span>
            </div>
            <span className="text-xs font-black text-brand-accent">{agent.progress}%</span>
          </div>
          <div className="text-xs font-bold text-slate-500 mb-2">{agent.status}</div>
          <div className="h-1.5 w-full bg-brand-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-brand-accent" initial={{ width: 0 }} animate={{ width: `${agent.progress}%` }} transition={{ duration: 1, ease: "easeOut" }} />
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-white border border-brand-muted flex items-center justify-center group-hover:bg-brand-ink group-hover:border-brand-ink transition-all">
          <Play className="w-4 h-4 text-brand-ink group-hover:text-white ml-0.5" />
        </div>
      </div>
    </div>
  );
}

function StarterLiveThinkingLog({ thoughts }: { thoughts: string[] }) {
  return (
    <div className="space-y-2">
      {thoughts.map((thought, index) => (
        <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 items-start">
          <div className="w-1 h-1 rounded-full bg-brand-accent mt-1.5 shrink-0" />
          <p className="text-[10px] font-bold text-slate-500 leading-tight">{thought}</p>
        </motion.div>
      ))}
    </div>
  );
}

function StarterLiveStreamView({ agent }: { agent: StarterLiveAgent }) {
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const fullText = "test@example.com";

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIsTyping(true);
      setTypedText("");
      let index = 0;
      const typingInterval = window.setInterval(() => {
        if (index < fullText.length) {
          setTypedText(fullText.slice(0, index + 1));
          index += 1;
        } else {
          window.clearInterval(typingInterval);
          window.setTimeout(() => setIsTyping(false), 1200);
        }
      }, 100);
    }, 8000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="aspect-video bg-slate-100 rounded-3xl border-2 border-slate-200 overflow-hidden relative group shadow-inner">
      <div className="absolute top-0 left-0 right-0 h-8 bg-white border-b border-slate-200 flex items-center px-4 gap-2 z-20">
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-slate-50 rounded-md h-5 flex items-center px-3 gap-2 border border-slate-100">
          <Lock className="w-2.5 h-2.5 text-slate-400" />
          <span className="text-[8px] font-bold text-slate-400 truncate">{agent.task}</span>
        </div>
      </div>

      <div className="absolute inset-0 pt-8 p-6 bg-white flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="w-24 h-4 bg-slate-100 rounded" />
          <div className="flex gap-2">
            <div className="w-8 h-2 bg-slate-100 rounded" />
            <div className="w-8 h-2 bg-slate-100 rounded" />
          </div>
        </div>

        <div className="space-y-3 mt-4">
          <div className="w-3/4 h-6 bg-slate-50 rounded-lg" />
          <div className="w-1/2 h-4 bg-slate-50 rounded-lg" />
        </div>

        <div className="mt-6 space-y-4 max-w-xs">
          <div className="space-y-1">
            <div className="w-12 h-2 bg-slate-100 rounded" />
            <div className="w-full h-10 bg-slate-50 border-2 border-slate-100 rounded-xl flex items-center px-4">
              <span className="text-xs font-bold text-slate-400">
                {typedText}
                <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="inline-block w-0.5 h-4 bg-brand-accent ml-0.5 align-middle" />
              </span>
            </div>
          </div>
          <div className="w-full h-10 bg-brand-ink rounded-xl" />
        </div>
      </div>

      <motion.div
        animate={{ x: [100, 350, 150, 450, 200, 300], y: [80, 200, 120, 250, 100, 180] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-6 h-6 pointer-events-none z-30"
      >
        <MousePointer2 className="w-5 h-5 text-brand-ink fill-brand-ink drop-shadow-lg" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-brand-ink text-white text-[8px] font-black rounded whitespace-nowrap shadow-xl">
          {agent.name} is {isTyping ? "typing..." : "exploring..."}
        </div>
      </motion.div>

      <div className="absolute bottom-4 right-4 w-48 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-2xl z-40">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Thinking...</span>
        </div>
        <StarterLiveThinkingLog thoughts={agent.logs.slice(-3).length ? agent.logs.slice(-3) : ["Scanning the interface for blockers."]} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-6 bg-slate-50 border-t border-slate-200 flex items-center px-4 justify-between z-20">
        <div className="flex items-center gap-2">
          <Activity className="w-3 h-3 text-brand-accent" />
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{agent.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">DOM Stable</span>
          <div className="w-1.5 h-1.5 rounded-full bg-brand-success" />
        </div>
      </div>
    </div>
  );
}

function StarterLiveAgentPeek({ agent }: { agent: StarterLiveAgent }) {
  return (
    <div className="dash-card overflow-hidden flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Live Peek: {agent.name}</h3>
        </div>
        <div className="text-[10px] font-black text-brand-secondary uppercase tracking-widest">{agent.task}</div>
      </div>
      <div className="p-6 flex-1 flex flex-col gap-6">
        <StarterLiveStreamView agent={agent} />
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Action</span>
            <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">Active</span>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <MousePointer2 className="w-4 h-4 text-brand-ink" />
            </div>
            <p className="text-xs font-bold text-slate-600">{agent.status}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StarterLiveAgentDetail({ agent, onClose }: { agent: StarterLiveAgent; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-end bg-brand-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="w-full max-w-2xl h-full bg-white rounded-[3rem] shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-lg ${agent.color}`}>
              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-black tracking-tight">{agent.name}</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 text-[10px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                  Live Run
                </div>
              </div>
              <p className="text-slate-500 font-bold text-sm">Testing {agent.task}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all">
            <Plus className="w-6 h-6 rotate-45 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Current Progress</span>
              <span className="text-xl font-black text-brand-accent">{agent.progress}%</span>
            </div>
            <div className="h-3 w-full bg-brand-muted rounded-full overflow-hidden">
              <motion.div className="h-full bg-brand-accent" initial={{ width: 0 }} animate={{ width: `${agent.progress}%` }} transition={{ duration: 1.5, ease: "easeOut" }} />
            </div>
            <p className="text-sm font-bold text-slate-500 italic">&quot;{agent.status}&quot;</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Live Browser Stream</h3>
            <StarterLiveStreamView agent={agent} />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-secondary" />
              Agent Thoughts
            </h3>
            <div className="bg-brand-secondary/5 border-2 border-brand-secondary/10 p-6 rounded-[2rem] relative">
              <Quote className="absolute -top-3 -left-3 w-8 h-8 text-brand-secondary opacity-20" />
              <p className="text-lg font-bold text-brand-ink leading-relaxed italic">&quot;{agent.thoughts}&quot;</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <History className="w-4 h-4" />
              Activity Log
            </h3>
            <div className="bg-brand-ink rounded-2xl p-6 font-mono text-xs text-brand-secondary/80 space-y-2 overflow-hidden">
              {(agent.logs.length ? agent.logs : ["Waiting for the next browser action."]).map((log, index) => (
                <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} className="flex gap-3">
                  <span className="text-white/20">[{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}]</span>
                  <span className={index === agent.logs.length - 1 ? "text-brand-accent font-bold" : ""}>
                    {index === agent.logs.length - 1 ? "→ " : ""}{log}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4">
          <button className="flex-1 bg-brand-ink text-white py-4 rounded-2xl font-black hover:bg-brand-accent transition-all flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Intervene as Human
          </button>
          <button onClick={onClose} className="px-6 py-4 rounded-2xl border-2 border-slate-200 font-black hover:bg-white transition-all">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StarterFrictionPointRow({ point }: { point: StarterFrictionPoint }) {
  const colors = {
    low: "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/20",
    medium: "bg-brand-warning/10 text-brand-warning border-brand-warning/20",
    high: "bg-brand-danger/10 text-brand-danger border-brand-danger/20"
  };

  return (
    <div className="flex gap-4 p-4 rounded-xl hover:bg-slate-50 transition-all border-b border-slate-100 last:border-0">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${point.severity === "high" ? "bg-brand-danger" : point.severity === "medium" ? "bg-brand-warning" : "bg-brand-secondary"}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-sm">{point.title}</h4>
          <div className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${colors[point.severity]}`}>{point.severity}</div>
        </div>
        <p className="text-xs font-medium text-slate-500 leading-relaxed">{point.description}</p>
      </div>
      <button className="text-[10px] font-black text-brand-accent hover:underline self-start mt-1">Fix Now</button>
    </div>
  );
}

function StarterTestRow({ item, onClick }: { item: StarterHistoryRow; onClick?: () => void }) {
  return (
    <div onClick={onClick} className="flex items-center justify-between px-8 py-6 hover:bg-slate-50 transition-all group cursor-pointer">
      <div className="flex items-center gap-6">
        <div className="relative">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform ${item.status === "completed" ? "bg-brand-success/10 text-brand-success" : "bg-brand-danger/10 text-brand-danger"}`}>
            {item.status === "completed" ? <Zap className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
          </div>
          <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border border-white overflow-hidden ${item.persona.color} shadow-sm`}>
            <img src={item.persona.avatar} alt={item.persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        </div>
        <div>
          <div className="font-black text-lg tracking-tight">{item.date}</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.status} • Tested by {item.persona.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-12">
        {item.score > 0 ? (
          <div className="text-right">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Score</div>
            <div className={`font-black text-2xl tracking-tighter ${item.score >= 90 ? "text-brand-success" : item.score > 0 ? "text-brand-warning" : "text-brand-danger"}`}>{item.score}/100</div>
          </div>
        ) : null}
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          className="bg-brand-muted/20 hover:bg-brand-ink hover:text-white px-6 py-2 rounded-xl font-black text-sm transition-all"
        >
          Report
        </button>
      </div>
    </div>
  );
}

function StarterHealthScoreChart({ data }: { data: Array<{ name: string; score: number }> }) {
  return (
    <div className="h-full w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="starterColorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }} dy={10} />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              borderRadius: "16px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              padding: "12px"
            }}
            itemStyle={{ fontWeight: 900, fontSize: "12px" }}
          />
          <Area type="monotone" dataKey="score" stroke="#10B981" strokeWidth={4} fillOpacity={1} fill="url(#starterColorScore)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StarterTestHistory({
  rows,
  onBack,
  onViewReport
}: {
  rows: StarterHistoryRow[];
  onBack: () => void;
  onViewReport: (runId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredRows = rows.filter((item) => `${item.date} ${item.agent} ${item.task} ${item.result}`.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">Test History</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historical Audit Logs</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search history..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-brand-accent transition-all"
          />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-8 md:p-12">
        <div className="dash-card overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Date & Time</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Agent</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Task</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Result</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Duration</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRows.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm font-bold text-slate-600">{item.date}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden">
                        <img src={item.persona.avatar} alt={item.persona.name} referrerPolicy="no-referrer" />
                      </div>
                      <span className="text-sm font-bold text-brand-ink">{item.agent}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-600">{item.task}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${item.result === "Success" ? "bg-brand-success" : "bg-brand-accent"}`} />
                      <span className={`text-xs font-black uppercase tracking-widest ${item.result === "Success" ? "text-brand-success" : "text-brand-accent"}`}>{item.result}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm font-bold text-slate-600">{item.duration}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => onViewReport(item.id)} className="text-xs font-black text-brand-accent uppercase tracking-widest hover:underline">
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

type StarterFixPoint = {
  id?: string;
  title: string;
  severity: string;
  description: string;
  expected_behavior?: string | null;
  observed_behavior?: string | null;
  recommended_fix?: string | null;
  page_url?: string | null;
  element?: string | null;
  repro_steps?: string[] | null;
  evidence?: string[] | null;
  acceptance_criteria?: string[] | null;
  diagnostic_details?: Record<string, unknown> | null;
};

type RepoFixDiagnosis = {
  source?: string;
  repo_full_name?: string | null;
  repo_understanding?: string;
  likely_fix_location?: string;
  suspected_files?: string[];
  suggested_fixes?: string[];
  implementation_notes?: string[];
  developer_prompt?: string;
  confidence_note?: string;
};

function cleanPromptText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function cleanPromptList(items: unknown, fallback: string[] = []) {
  if (!Array.isArray(items)) {
    return fallback;
  }
  const cleaned = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function readDiagnosticString(details: StarterFixPoint["diagnostic_details"], keys: string[]) {
  if (!details || typeof details !== "object") {
    return "";
  }
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function formatPromptList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatPromptObject(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2).slice(0, 4000);
  } catch {
    return "";
  }
}

function buildCompleteFixPrompt({
  point,
  repoDiagnosis,
  suggestedFixes,
  implementationNotes,
  suspectedFiles,
  repoSummary
}: {
  point: StarterFixPoint;
  repoDiagnosis: RepoFixDiagnosis | null;
  suggestedFixes: string[];
  implementationNotes: string[];
  suspectedFiles: string[];
  repoSummary: string;
}) {
  const observedOutcome = cleanPromptText(
    point.observed_behavior,
    cleanPromptText(point.description, "The QA run flagged this flow as confusing or blocked.")
  );
  const expectedOutcome = cleanPromptText(
    point.expected_behavior,
    "A real user should understand what to do next, complete the affected step, and reach the intended next state without confusion."
  );
  const proposedFix = cleanPromptText(
    point.recommended_fix,
    suggestedFixes.join(" ") || "Inspect the affected UI and remove the friction reported by the QA run."
  );
  const currentUrl =
    cleanPromptText(point.page_url) ||
    readDiagnosticString(point.diagnostic_details, ["current_url", "url", "page_url"]) ||
    "Not captured";
  const affectedElement =
    cleanPromptText(point.element) ||
    readDiagnosticString(point.diagnostic_details, ["element", "selector", "target"]) ||
    "Not captured";
  const failureReason = readDiagnosticString(point.diagnostic_details, ["failure_reason", "current_state", "last_successful_step"]);
  const reproSteps = cleanPromptList(point.repro_steps, [
    currentUrl !== "Not captured" ? `Open ${currentUrl}.` : "Open the affected page or flow from the QA report.",
    "Follow the same persona/task path that produced this finding.",
    "Compare the observed outcome against the expected outcome below."
  ]);
  const evidence = cleanPromptList(point.evidence, failureReason ? [failureReason] : ["Use the QA report screenshots/replay and the details below as the source of truth."]);
  const diagnosticDetails = formatPromptObject(point.diagnostic_details);
  const acceptanceCriteria = cleanPromptList(point.acceptance_criteria, [
    "The observed outcome no longer happens in the same flow.",
    "The expected outcome is reachable and obvious to the user.",
    "The proposed fix is visible near the affected action or decision point.",
    "The same QA scenario can be rerun without this finding reappearing."
  ]);
  const repoNotes = [
    repoDiagnosis?.repo_full_name ? `Repo: ${repoDiagnosis.repo_full_name}` : "",
    repoSummary ? `Repo understanding: ${repoSummary}` : "",
    repoDiagnosis?.likely_fix_location ? `Likely fix location: ${repoDiagnosis.likely_fix_location}` : "",
    suspectedFiles.length ? `Likely files:\n${formatPromptList(suspectedFiles)}` : "",
    implementationNotes.length ? `Implementation notes:\n${formatPromptList(implementationNotes)}` : "",
    repoDiagnosis?.confidence_note ? `Confidence note: ${repoDiagnosis.confidence_note}` : ""
  ].filter(Boolean).join("\n\n");
  const repoGeneratedPrompt = repoDiagnosis?.source === "github_repo_analysis"
    ? cleanPromptText(repoDiagnosis.developer_prompt)
    : "";

  return [
    "# Bug Report / Fix Request",
    "",
    "## Summary",
    `Fix this UX issue: ${point.title}`,
    "",
    "## Severity",
    point.severity,
    "",
    "## Expected outcome",
    expectedOutcome,
    "",
    "## Observed outcome",
    observedOutcome,
    "",
    "## Repro steps",
    formatPromptList(reproSteps),
    "",
    "## Affected area",
    `- URL/page: ${currentUrl}`,
    `- Element/interaction: ${affectedElement}`,
    "",
    "## Proposed fix",
    proposedFix,
    "",
    "## Acceptance criteria",
    formatPromptList(acceptanceCriteria),
    "",
    "## Evidence and context",
    formatPromptList(evidence),
    "",
    diagnosticDetails ? "## Raw diagnostic details\n" + diagnosticDetails : "",
    "",
    "## Repo context",
    repoNotes || "No repo-specific diagnosis was available. Inspect the UI owner for the affected flow.",
    repoGeneratedPrompt ? "\n## Additional repo-generated diagnosis\n" + repoGeneratedPrompt : "",
    "",
    "## Instructions",
    "Make the smallest product change that satisfies the acceptance criteria. Do not treat this as complete until the expected outcome is visible in the same user flow and the QA scenario can be rerun cleanly."
  ]
    .filter((part) => part !== null && part !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function StarterFixDiagnosis({
  point,
  runId,
  brandKey,
  onClose
}: {
  point: StarterFixPoint;
  runId: string;
  brandKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");
  const [repoDiagnosis, setRepoDiagnosis] = useState<RepoFixDiagnosis | null>(null);
  const pointKey = [
    point.id || "",
    point.title,
    point.severity,
    point.description,
    point.expected_behavior || "",
    point.observed_behavior || "",
    point.recommended_fix || "",
    point.page_url || "",
    point.element || ""
  ].join("|");

  useEffect(() => {
    let cancelled = false;

    async function loadDiagnosis() {
      if (!runId || !brandKey) {
        setDiagnosisError("Connect a project repo to get repo-aware fix diagnosis.");
        setRepoDiagnosis(null);
        setLoadingDiagnosis(false);
        return;
      }

      setLoadingDiagnosis(true);
      setDiagnosisError("");
      try {
        const response = await fetch("/api/qa/fix-diagnosis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({
            run_id: runId,
            brand_key: brandKey,
            point
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || "Could not load repo-aware diagnosis."));
        }
        if (!cancelled) {
          setRepoDiagnosis((payload?.diagnosis as RepoFixDiagnosis) || null);
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnosisError(error instanceof Error ? error.message : "Could not load repo-aware diagnosis.");
          setRepoDiagnosis(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingDiagnosis(false);
        }
      }
    }

    loadDiagnosis().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [brandKey, pointKey, runId]);

  const suggestedFixes =
    repoDiagnosis?.suggested_fixes && repoDiagnosis.suggested_fixes.length
      ? repoDiagnosis.suggested_fixes
      : (point.recommended_fix || "Review the UI state, simplify the action path, and add clearer feedback where the agent got stuck.")
          .split(/\.\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((item) => `${item.trim().replace(/\.$/, "")}.`);
  const suspectedFiles = Array.isArray(repoDiagnosis?.suspected_files) ? repoDiagnosis?.suspected_files || [] : [];
  const implementationNotes =
    repoDiagnosis?.implementation_notes && repoDiagnosis.implementation_notes.length
      ? repoDiagnosis.implementation_notes
      : [
          "Inspect the UI copy and the component that owns this step.",
          "Make the smallest visible change that answers the customer concern clearly.",
          "Rerun the same test after the fix."
        ];
  const repoSummary =
    repoDiagnosis?.repo_understanding ||
    (loadingDiagnosis
      ? "Checking the connected GitHub repository to understand which part of the product owns this issue."
      : diagnosisError
        ? ""
        : "No repo-aware diagnosis is available yet for this issue.");
  const expectedOutcome = cleanPromptText(
    point.expected_behavior,
    "A real user should understand the next step and reach the intended next state without confusion."
  );
  const observedOutcome = cleanPromptText(point.observed_behavior, cleanPromptText(point.description));
  const proposedFix = cleanPromptText(point.recommended_fix, suggestedFixes.join(" "));
  const developerPrompt = buildCompleteFixPrompt({
    point,
    repoDiagnosis,
    suggestedFixes,
    implementationNotes,
    suspectedFiles,
    repoSummary
  });

  async function handleCopyPrompt() {
    await copyText(developerPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/60 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="w-full max-w-5xl h-[85vh] bg-white rounded-[3rem] shadow-2xl flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent flex items-center justify-center text-white shadow-lg">
              <Code className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Fix Diagnosis</h2>
              <p className="text-slate-500 font-bold text-sm">Repo-aware diagnosis for &quot;{point.title}&quot;</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all">
            <Plus className="w-6 h-6 rotate-45 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-8">
            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Problem Report</h3>
              <div className="space-y-3">
                <div className="rounded-2xl border border-brand-line bg-white p-5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Observed outcome</div>
                  <p className="mt-2 text-sm font-bold leading-6 text-brand-ink">{observedOutcome}</p>
                </div>
                <div className="rounded-2xl border border-brand-line bg-white p-5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Expected outcome</div>
                  <p className="mt-2 text-sm font-bold leading-6 text-brand-ink">{expectedOutcome}</p>
                </div>
                <div className="rounded-2xl border border-brand-secondary/20 bg-brand-secondary/5 p-5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-brand-secondary">Fix to make</div>
                  <p className="mt-2 text-sm font-bold leading-6 text-brand-ink">{proposedFix}</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Repo Context</h3>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {loadingDiagnosis ? (
                  <div className="flex items-start gap-3 text-sm font-semibold text-slate-600">
                    <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-brand-primary" />
                    <span>Checking the connected GitHub repo and matching this issue to likely product files.</span>
                  </div>
                ) : diagnosisError ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-brand-ink">Repo-aware diagnosis unavailable</div>
                    <p className="text-sm leading-6 text-slate-500">{diagnosisError}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {repoDiagnosis?.repo_full_name ? (
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                        <GitBranch className="h-3.5 w-3.5" />
                        {repoDiagnosis.repo_full_name}
                      </div>
                    ) : null}
                    <p className="text-sm font-semibold leading-6 text-brand-ink">{repoSummary}</p>
                    {repoDiagnosis?.likely_fix_location ? (
                      <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Likely fix location</div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{repoDiagnosis.likely_fix_location}</div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

          </div>

          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Complete AI Dev Prompt</h3>
                <p className="mt-1 text-sm font-bold text-brand-ink">Includes expected, observed, repro, fix, repo context, and acceptance criteria.</p>
              </div>
              <span className="rounded-full border border-brand-line bg-brand-shell px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-brand-muted">
                {repoDiagnosis?.repo_full_name ? "Repo-aware" : "Bug report"}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-brand-line bg-brand-ink p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  Severity: {point.severity}
                </span>
                {repoDiagnosis?.source ? (
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                    {repoDiagnosis.source === "github_repo_analysis"
                      ? "GitHub analysis"
                      : repoDiagnosis.source === "stored_engineering_triage"
                        ? "Stored repo triage"
                        : "Repo heuristic"}
                  </span>
                ) : null}
              </div>
              <pre className="min-h-[360px] flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 font-mono text-[11px] leading-5 text-white/75">{developerPrompt}</pre>
              <Button tone="secondary" onClick={handleCopyPrompt} className="mt-4 w-full border-white/10 bg-white py-3 text-xs font-black text-brand-ink hover:bg-white/90">
                {copied ? (
                  <>
                    <Zap className="w-4 h-4 text-brand-secondary" />
                    Copied complete bug report
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy complete bug report
                  </>
                )}
              </Button>
            </div>
            <div className="rounded-2xl border border-brand-line bg-brand-panel px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-brand-secondary">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold leading-6 text-brand-muted">
                  The copied prompt is the source of truth. Repo notes are included inside it so the developer gets the full problem report instead of a partial snippet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

type ReplayThoughtCue = {
  id: string;
  action: string;
  target: string;
  emotion: string;
  text: string;
  whatThisIs: string;
  noticed: string[];
  skepticism: string;
  missingInformation: string;
  trustSignal: string;
  continueState: string;
  currentUrl: string;
  timestampLabel: string;
  progress: number;
  left: number;
  top: number;
  align: "left" | "right";
};

type ReplayCursorCue = {
  id: string;
  label: string;
  progress: number;
  left: number;
  top: number;
};

type ReplayExperienceTone = "positive" | "warning" | "negative" | "neutral";

type ReplayExperienceSegment = {
  id: string;
  start: number;
  end: number;
  tone: ReplayExperienceTone;
};

type PersonaReadout = {
  overall: string;
  emotionalState: string;
  emotionalTone: "positive" | "neutral" | "warning" | "negative";
  takeaways: string[];
  skepticisms: string[];
  latestThought: string;
  blocker: string;
  blockerContext: string;
};

function getRunLogEvent(entry: RunLogEntry | Record<string, unknown> | null | undefined) {
  return String(entry && typeof entry === "object" ? entry.event || "" : "")
    .trim()
    .toLowerCase();
}

function getRunLogPayload(entry: RunLogEntry | Record<string, unknown> | null | undefined) {
  if (!entry || typeof entry !== "object") {
    return {};
  }
  if (entry.data && typeof entry.data === "object") {
    return entry.data as Record<string, unknown>;
  }
  if (entry.details && typeof entry.details === "object") {
    return entry.details as Record<string, unknown>;
  }
  return {};
}

function getRunLogTimestampMs(entry: RunLogEntry | Record<string, unknown> | null | undefined) {
  const raw = String((entry && typeof entry === "object" ? entry.ts || entry.timestamp : "") || "").trim();
  if (!raw) {
    return Number.NaN;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clampReplayPercent(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function resolveReplayCoordinates(payload: Record<string, unknown>) {
  const directX = Number(payload.x);
  const directY = Number(payload.y);
  if (Number.isFinite(directX) && Number.isFinite(directY)) {
    return { x: directX, y: directY };
  }

  const pair = Array.isArray(payload.fallback_coordinates) ? payload.fallback_coordinates : [];
  const pairX = Number(pair[0]);
  const pairY = Number(pair[1]);
  if (Number.isFinite(pairX) && Number.isFinite(pairY)) {
    return { x: pairX, y: pairY };
  }

  const box = payload.box && typeof payload.box === "object" ? (payload.box as Record<string, unknown>) : null;
  const boxX = Number(box?.center_x);
  const boxY = Number(box?.center_y);
  if (Number.isFinite(boxX) && Number.isFinite(boxY)) {
    return { x: boxX, y: boxY };
  }

  return null;
}

function isTaskCentricThought(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    /\b(main flow|finish the task|next thing to click|next field|next page|step completed|objective reached)\b/.test(normalized) ||
    /\bi need to look around\b/.test(normalized) ||
    /\bi'?m waiting to see if the page changes\b/.test(normalized) ||
    /\bthis feels like enough to finish\b/.test(normalized) ||
    /\bthis starts the main flow\b/.test(normalized)
  );
}

function readObservationList(value: unknown, maxItems = 3) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n|;|•/g)
      : [];
  const items: string[] = [];
  const seen = new Set<string>();
  source.forEach((rawItem) => {
    const item = String(rawItem || "").trim().replace(/\s+/g, " ");
    if (!item) {
      return;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(item);
  });
  return items.slice(0, maxItems);
}

function lowercaseFirst(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return `${trimmed[0].toLowerCase()}${trimmed.slice(1)}`;
}

function normalizeReplayText(value: unknown, maxLength = 320) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function ensureSentencePunctuation(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function looksLikeInternalRunLabel(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /^progress through [a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(normalized) ||
    /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(normalized)
  );
}

function normalizeSkepticismText(value: unknown, maxLength = 220) {
  let normalized = normalizeReplayText(value, maxLength);
  if (!normalized || looksLikeInternalRunLabel(normalized)) {
    return "";
  }

  normalized = normalized
    .replace(/\bI am supposed to\b/gi, "I was supposed to")
    .replace(/\bI'm supposed to\b/gi, "I was supposed to");

  if (/^i cannot tell whether\b/i.test(normalized)) {
    normalized = normalized.replace(/^i cannot tell whether\b/i, "It was unclear whether");
  } else if (/^i cannot tell\b/i.test(normalized)) {
    normalized = normalized.replace(/^i cannot tell\b/i, "I couldn't tell");
  } else if (/^whether\b/i.test(normalized)) {
    normalized = `It was unclear ${lowercaseFirst(normalized)}`;
  } else if (/^(what|why|how|where|which|who|if)\b/i.test(normalized)) {
    normalized = `I couldn't tell ${lowercaseFirst(normalized)}`;
  }

  return ensureSentencePunctuation(normalized);
}

function isGenericSkepticismText(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.includes("it was unclear whether the action succeeded") ||
    normalized.includes("i couldn't tell whether the action worked") ||
    normalized.includes("i couldn't tell what should happen") ||
    normalized.includes("the page did not confirm whether this worked") ||
    normalized.includes("what should happen next") ||
    normalized.includes("what i was supposed to do next")
  );
}

function buildCleanTakeawayItems(values: unknown[], limit = 3) {
  return uniqueReadoutItems(
    values
      .map((value) => normalizeReplayText(value, 220))
      .filter((item) => item && !looksLikeInternalRunLabel(item)),
    limit
  );
}

function buildCleanSkepticismItems(values: unknown[], limit = 3) {
  const normalizedItems = uniqueReadoutItems(values.map((value) => normalizeSkepticismText(value, 220)), limit * 2);
  const concreteItems = normalizedItems.filter((item) => !isGenericSkepticismText(item) && !isPlaceholderReadoutItem(item));
  if (concreteItems.length) {
    return concreteItems.slice(0, limit);
  }
  return normalizedItems.slice(0, Math.min(limit, 1));
}

function getReplayTimestampLabel(entry: RunLogEntry | Record<string, unknown> | null | undefined) {
  const raw = String((entry && typeof entry === "object" ? entry.ts || entry.timestamp : "") || "").trim();
  return raw ? formatDateTime(raw) : "";
}

function readReportFailureDiagnostics(report: QaReport | null | undefined) {
  const direct = report && typeof report === "object"
    ? ((report as unknown as Record<string, unknown>).failure_diagnostics as Record<string, unknown> | null | undefined)
    : null;
  if (direct && typeof direct === "object") {
    return direct;
  }
  const finding = Array.isArray(report?.findings)
    ? report.findings.find((item) => item?.diagnostic_details && typeof item.diagnostic_details === "object")
    : null;
  return finding?.diagnostic_details && typeof finding.diagnostic_details === "object"
    ? finding.diagnostic_details as Record<string, unknown>
    : null;
}

function readRunBlocker(report: QaReport | null | undefined) {
  const diagnostics = readReportFailureDiagnostics(report);
  const failureReason = normalizeReplayText(diagnostics?.failure_reason, 320);
  if (failureReason) {
    return failureReason;
  }

  const firstFinding = Array.isArray(report?.findings) ? report.findings[0] : null;
  const observedBehavior = normalizeReplayText(firstFinding?.observed_behavior, 320);
  if (observedBehavior) {
    return observedBehavior;
  }

  return normalizeReplayText(firstFinding?.title, 220);
}

function readRunBlockerContext(report: QaReport | null | undefined) {
  const diagnostics = readReportFailureDiagnostics(report);
  return normalizeReplayText(diagnostics?.last_successful_step, 220);
}

function buildReplayOverlayData(
  runLog: StatusResponse["run_log"] | null | undefined,
  report?: QaReport | null,
  statusArtifacts?: StatusResponse["artifacts"] | null
) {
  const safeRunLog = Array.isArray(runLog) ? runLog : [];
  const timestamps = safeRunLog
    .map((entry) => getRunLogTimestampMs(entry))
    .filter((value) => Number.isFinite(value));
  const startedAtMs = Date.parse(String(report?.artifacts?.started_at || statusArtifacts?.started_at || ""));
  const finishedAtMs = Date.parse(String(report?.artifacts?.finished_at || statusArtifacts?.finished_at || ""));
  const startMs = Number.isFinite(startedAtMs) ? startedAtMs : timestamps[0];
  const endMs = Number.isFinite(finishedAtMs) ? finishedAtMs : timestamps[timestamps.length - 1];
  const hasWindow = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const totalMs = hasWindow ? Math.max(1000, endMs - startMs) : 1000;
  const viewportWidth =
    Number(report?.artifacts?.viewport_width || statusArtifacts?.viewport_width) > 0
      ? Number(report?.artifacts?.viewport_width || statusArtifacts?.viewport_width)
      : 1440;
  const viewportHeight =
    Number(report?.artifacts?.viewport_height || statusArtifacts?.viewport_height) > 0
      ? Number(report?.artifacts?.viewport_height || statusArtifacts?.viewport_height)
      : 900;

  const cursorCues: Array<ReplayCursorCue & { atMs: number }> = [];
  const thoughtCandidates: Array<
    Omit<ReplayThoughtCue, "left" | "top" | "align"> & { atMs: number }
  > = [];

  safeRunLog.forEach((entry, index) => {
    const event = getRunLogEvent(entry);
    const payload = getRunLogPayload(entry);
    const atMs = getRunLogTimestampMs(entry);
    const normalizedProgress =
      hasWindow && Number.isFinite(atMs) ? clampReplayPercent((atMs - startMs) / totalMs, 0, 1) : 0;

    if (event === "agent_click_coordinate_fallback_succeeded") {
      const coordinates = resolveReplayCoordinates(payload);
      if (coordinates) {
        cursorCues.push({
          id: `cursor-${index}`,
          label: String(payload.describe || payload.reason || "interaction").trim() || "interaction",
          progress: normalizedProgress,
          left: clampReplayPercent((coordinates.x / viewportWidth) * 100, 2, 98),
          top: clampReplayPercent((coordinates.y / viewportHeight) * 100, 4, 96),
          atMs: Number.isFinite(atMs) ? atMs : startMs || 0
        });
      }
    }

    if (event === "persona_observation") {
      const thoughtText = String(payload.observation || payload.text || "").trim();
      if (!thoughtText || isTaskCentricThought(thoughtText)) {
        return;
      }
      thoughtCandidates.push({
        id: `thought-${index}`,
        action: "",
        target: "",
        emotion: String(payload.emotion || "").trim(),
        text: thoughtText,
        whatThisIs: String(payload.what_i_think_this_is || payload.what_this_page_is || "").trim(),
        noticed: readObservationList(payload.noticed),
        skepticism: String(payload.skepticism || "").trim(),
        missingInformation: String(payload.missing_information || "").trim(),
        trustSignal: String(payload.trust_signal || "").trim(),
        continueState: String(payload.continue_state || "").trim(),
        currentUrl: String(payload.current_url || "").trim(),
        timestampLabel: getReplayTimestampLabel(entry),
        progress: normalizedProgress,
        atMs: Number.isFinite(atMs) ? atMs : startMs || 0
      });
    }
  });

  const sortedCursors = cursorCues.slice().sort((left, right) => left.atMs - right.atMs);
  const thoughts = thoughtCandidates
    .slice()
    .sort((left, right) => left.atMs - right.atMs)
    .map((thought) => {
      let anchor = sortedCursors
        .filter((cursor) => cursor.atMs <= thought.atMs && thought.atMs - cursor.atMs <= 6000)
        .slice(-1)[0];
      if (!anchor) {
        anchor = sortedCursors.find((cursor) => cursor.atMs >= thought.atMs && cursor.atMs - thought.atMs <= 1800);
      }
      const left = anchor
        ? clampReplayPercent(anchor.left, 12, 78)
        : thought.progress > 0.62
          ? 52
          : 14;
      const top = anchor
        ? clampReplayPercent(anchor.top - 13, 10, 76)
        : clampReplayPercent(74 - thought.progress * 26, 24, 74);
      return {
        ...thought,
        left,
        top,
        align: left > 56 ? ("right" as const) : ("left" as const)
      };
    });

  return {
    thoughts,
    cursors: sortedCursors,
    viewportWidth,
    viewportHeight
  };
}

function uniqueReadoutItems(values: unknown[], limit = 3) {
  const seen = new Set<string>();
  const items: string[] = [];
  values.forEach((value) => {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(text);
  });
  return items.slice(0, limit);
}

function isPlaceholderReadoutItem(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.startsWith("no content-specific skepticism was captured") ||
    normalized.startsWith("no major skepticism was captured") ||
    normalized.startsWith("no customer-perspective takeaway was captured") ||
    normalized.startsWith("no clear customer emotional state was captured")
  );
}

function buildSkepticismFixPoints(items: string[]): StarterFixPoint[] {
  return items
    .map((item) => item.trim())
    .filter((item) => item && !isPlaceholderReadoutItem(item))
    .map((item, index) => ({
      id: `skepticism-${index}`,
      title: `Customer skepticism ${index + 1}`,
      severity: "medium",
      description: item,
      expected_behavior: "The UI should answer this concern at the point of hesitation and make the next step obvious.",
      observed_behavior: `The simulated customer hesitated because: ${item}`,
      recommended_fix:
        `Answer this concern directly in the UI with clearer copy, proof, examples, or next-step guidance. ` +
        `Specifically address: ${item}`,
      acceptance_criteria: [
        "The concern is answered in visible UI copy near the relevant CTA or decision point.",
        "The user can understand what happens next without leaving the flow.",
        "The same persona walkthrough no longer reports this skepticism as a blocker."
      ]
    }));
}

function readReportSummaryText(report: QaReport | null | undefined, keys: string[]) {
  const summary = report?.summary && typeof report.summary === "object" ? report.summary as Record<string, unknown> : {};
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readReportSummaryList(report: QaReport | null | undefined, keys: string[]) {
  const summary = report?.summary && typeof report.summary === "object" ? report.summary as Record<string, unknown> : {};
  for (const key of keys) {
    const value = summary[key];
    if (Array.isArray(value)) {
      const list = uniqueReadoutItems(value, 4);
      if (list.length) {
        return list;
      }
    }
    if (typeof value === "string" && value.trim()) {
      return uniqueReadoutItems(value.split(/\n|;|•/g), 4);
    }
  }
  return [];
}

function formatEmotionLabel(emotion: string) {
  const normalized = emotion.trim().toLowerCase();
  const labels: Record<string, string> = {
    confidence: "Confident",
    trust: "Trusting",
    delight: "Positive",
    uncertainty: "Uncertain",
    confusion: "Confused",
    frustration: "Frustrated",
    distrust: "Skeptical"
  };
  return labels[normalized] || (normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "");
}

function getPersonaReadoutTone(emotion: string, frictionCount: number) {
  const normalized = emotion.trim().toLowerCase();
  if (normalized === "frustration" || normalized === "distrust" || frictionCount > 0) {
    return "negative" as const;
  }
  if (normalized === "uncertainty" || normalized === "confusion") {
    return "warning" as const;
  }
  if (normalized === "confidence" || normalized === "trust" || normalized === "delight") {
    return "positive" as const;
  }
  return "neutral" as const;
}

function buildPersonaReadout({
  persona,
  report,
  thoughts,
  frictionPoints
}: {
  persona: StarterPersona;
  report: QaReport | null;
  thoughts: ReplayThoughtCue[];
  frictionPoints: Array<{ title: string; description: string; severity: string }>;
}): PersonaReadout {
  const latestThought = thoughts.length ? thoughts[thoughts.length - 1]?.text || "" : "";
  const latestObservation = thoughts.length ? thoughts[thoughts.length - 1] : null;
  const runBlocker = readRunBlocker(report);
  const runBlockerContext = readRunBlockerContext(report);
  const explicitOverall = readReportSummaryText(report, [
    "persona_readout",
    "persona_overall",
    "user_reaction",
    "persona_reaction",
    "overall_user_reaction",
    "emotional_summary"
  ]);
  const overall =
    explicitOverall ||
    latestThought ||
    "No customer thoughts were captured for this run.";

  const emotionCounts = new Map<string, number>();
  thoughts.forEach((thought) => {
    const emotion = thought.emotion.trim().toLowerCase();
    if (emotion) {
      emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + 1);
    }
  });
  (report?.findings || []).forEach((finding) => {
    const reaction = finding as Record<string, unknown>;
    const emotionalReaction = reaction.emotional_reaction && typeof reaction.emotional_reaction === "object"
      ? reaction.emotional_reaction as Record<string, unknown>
      : {};
    const emotion = String(emotionalReaction.primary || "").trim().toLowerCase();
    if (emotion) {
      emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + 2);
    }
  });
  const dominantEmotion = Array.from(emotionCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "";
  const emotionalState =
    readReportSummaryText(report, ["emotional_state", "persona_emotional_state"]) ||
    (latestObservation
      ? (() => {
          const baseEmotion = formatEmotionLabel(latestObservation.emotion || dominantEmotion);
          const hesitation = latestObservation.skepticism || latestObservation.missingInformation;
          if (baseEmotion && hesitation) {
            return `${baseEmotion}; still unsure because ${lowercaseFirst(hesitation)}`;
          }
          if (baseEmotion && latestObservation.continueState === "abandon") {
            return `${baseEmotion}; likely to stop here.`;
          }
          if (baseEmotion && latestObservation.continueState === "pause") {
            return `${baseEmotion}; would pause before continuing.`;
          }
          if (baseEmotion && latestObservation.continueState === "continue") {
            return `${baseEmotion}; willing to keep going.`;
          }
          return baseEmotion || "No customer thoughts were captured for this run.";
        })()
      : "No customer thoughts were captured for this run.");

  const explicitTakeaways = buildCleanTakeawayItems(
    readReportSummaryList(report, ["persona_takeaways", "takeaways", "user_takeaways"])
  );
  const thoughtTakeaways = buildCleanTakeawayItems(
    thoughts.flatMap((thought) => [thought.whatThisIs, thought.trustSignal]).filter(Boolean),
    3
  );
  const takeaways = explicitTakeaways.length
    ? explicitTakeaways
    : thoughtTakeaways;

  const explicitSkepticisms = buildCleanSkepticismItems(
    readReportSummaryList(report, [
      "skepticisms",
      "persona_skepticisms",
      "trust_concerns",
      "user_skepticisms"
    ])
  );
  const skepticalThoughts = buildCleanSkepticismItems(
    thoughts.flatMap((thought) => [thought.skepticism, thought.missingInformation]).filter(Boolean),
    3
  );
  const skepticisms = explicitSkepticisms.length
    ? explicitSkepticisms
    : skepticalThoughts;

  return {
    overall,
    emotionalState,
    emotionalTone: getPersonaReadoutTone(dominantEmotion, frictionPoints.length),
    takeaways,
    skepticisms,
    latestThought,
    blocker: runBlocker,
    blockerContext: runBlockerContext
  };
}

function getActiveReplayCue<T extends { progress: number }>(cues: T[], duration: number, currentTime: number, lingerMs: number) {
  if (!Array.isArray(cues) || !cues.length || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  const lingerSeconds = Math.max(0.6, lingerMs / 1000);
  let active: T | null = null;
  cues.forEach((cue) => {
    const cueTime = cue.progress * duration;
    if (currentTime >= cueTime && currentTime - cueTime <= lingerSeconds) {
      active = cue;
    }
  });
  return active;
}

function getReplayExperienceTone(thought: Pick<ReplayThoughtCue, "emotion" | "continueState" | "skepticism" | "missingInformation"> | null | undefined): ReplayExperienceTone {
  const emotion = String(thought?.emotion || "").trim().toLowerCase();
  const continueState = String(thought?.continueState || "").trim().toLowerCase();
  const hasHesitation = Boolean(String(thought?.skepticism || "").trim() || String(thought?.missingInformation || "").trim());

  if (
    continueState === "abandon" ||
    continueState === "blocker" ||
    emotion === "frustration" ||
    emotion === "distrust"
  ) {
    return "negative";
  }

  if (
    continueState === "pause" ||
    emotion === "uncertainty" ||
    emotion === "confusion" ||
    hasHesitation
  ) {
    return "warning";
  }

  if (
    continueState === "continue" ||
    emotion === "confidence" ||
    emotion === "trust" ||
    emotion === "delight"
  ) {
    return "positive";
  }

  return "neutral";
}

function buildReplayExperienceSegments(thoughtCues: ReplayThoughtCue[]) {
  const sorted = (Array.isArray(thoughtCues) ? thoughtCues : [])
    .filter((cue) => Number.isFinite(cue.progress))
    .slice()
    .sort((left, right) => left.progress - right.progress);

  if (!sorted.length) {
    return [
      {
        id: "experience-neutral",
        start: 0,
        end: 1,
        tone: "neutral" as ReplayExperienceTone
      }
    ];
  }

  const segments = sorted.map((cue, index) => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    const start = index === 0 ? 0 : clampReplayPercent((previous.progress + cue.progress) / 2, 0, 1);
    const end = index === sorted.length - 1 ? 1 : clampReplayPercent((cue.progress + next.progress) / 2, 0, 1);
    return {
      id: `experience-${cue.id}`,
      start,
      end: Math.max(end, start + 0.01),
      tone: getReplayExperienceTone(cue)
    };
  });

  return segments.reduce<ReplayExperienceSegment[]>((merged, segment) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.tone === segment.tone && segment.start <= previous.end + 0.01) {
      previous.end = Math.max(previous.end, segment.end);
      return merged;
    }
    merged.push({ ...segment });
    return merged;
  }, []);
}

function getReplayExperienceMeta(tone: ReplayExperienceTone) {
  if (tone === "positive") {
    return {
      label: "Smooth",
      segmentClass: "bg-brand-success/90",
      pillClass: "border-brand-success/40 bg-brand-success/18 text-emerald-50",
      markerClass: "bg-brand-success border-emerald-50/70"
    };
  }
  if (tone === "warning") {
    return {
      label: "Hesitation",
      segmentClass: "bg-brand-warning/90",
      pillClass: "border-brand-warning/40 bg-brand-warning/20 text-amber-50",
      markerClass: "bg-brand-warning border-amber-50/70"
    };
  }
  if (tone === "negative") {
    return {
      label: "Blocked",
      segmentClass: "bg-brand-danger/90",
      pillClass: "border-brand-danger/40 bg-brand-danger/20 text-rose-50",
      markerClass: "bg-brand-danger border-rose-50/70"
    };
  }
  return {
    label: "Neutral",
    segmentClass: "bg-white/35",
    pillClass: "border-white/20 bg-white/12 text-white/75",
    markerClass: "bg-white/70 border-white/80"
  };
}

function getActiveReplayExperienceSegment(segments: ReplayExperienceSegment[], progress: number) {
  if (!Array.isArray(segments) || !segments.length) {
    return null;
  }
  const normalizedProgress = clampReplayPercent(progress, 0, 1);
  return (
    segments.find((segment) => normalizedProgress >= segment.start && normalizedProgress <= segment.end) ||
    segments[segments.length - 1] ||
    null
  );
}

function ReplayVideoWithOverlay({
  title,
  videoUrl,
  posterUrl,
  thoughtCues,
  cursorCues
}: {
  title: string;
  videoUrl: string;
  posterUrl: string;
  thoughtCues: ReplayThoughtCue[];
  cursorCues: ReplayCursorCue[];
}) {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const activeThought = getActiveReplayCue(thoughtCues, duration, currentTime, 4200);
  const activeCursor = getActiveReplayCue(cursorCues, duration, currentTime, 2200);
  const experienceSegments = buildReplayExperienceSegments(thoughtCues);
  const currentProgress =
    Number.isFinite(duration) && duration > 0
      ? clampReplayPercent(currentTime / duration, 0, 1)
      : 0;
  const activeExperience = activeThought
    ? {
        tone: getReplayExperienceTone(activeThought)
      }
    : getActiveReplayExperienceSegment(experienceSegments, currentProgress);
  const activeExperienceMeta = getReplayExperienceMeta(activeExperience?.tone || "neutral");

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-black">
      <video
        controls
        autoPlay
        preload="metadata"
        playsInline
        poster={posterUrl || undefined}
        className="w-full max-h-[72vh] bg-black object-contain"
        src={videoUrl}
        aria-label={title}
        onLoadedMetadata={(event) => {
          setDuration(Number(event.currentTarget.duration) || 0);
          setCurrentTime(Number(event.currentTarget.currentTime) || 0);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(Number(event.currentTarget.currentTime) || 0);
        }}
        onSeeked={(event) => {
          setCurrentTime(Number(event.currentTarget.currentTime) || 0);
        }}
      >
        Your browser could not play this replay.
      </video>

      <div className="pointer-events-none absolute inset-x-4 bottom-[3.1rem] z-20 md:inset-x-6 md:bottom-[3.35rem]">
        <div className="rounded-[1.25rem] border border-white/12 bg-brand-ink/68 px-3 py-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.28)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/65">User experience</div>
            <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${activeExperienceMeta.pillClass}`}>
              {activeExperienceMeta.label}
            </div>
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/12">
            {experienceSegments.map((segment) => {
              const segmentMeta = getReplayExperienceMeta(segment.tone);
              return (
                <div
                  key={segment.id}
                  className={`absolute inset-y-0 ${segmentMeta.segmentClass}`}
                  style={{
                    left: `${segment.start * 100}%`,
                    width: `${Math.max((segment.end - segment.start) * 100, 1.2)}%`
                  }}
                />
              );
            })}
            {thoughtCues.map((thought) => {
              const markerMeta = getReplayExperienceMeta(getReplayExperienceTone(thought));
              return (
                <div
                  key={`marker-${thought.id}`}
                  className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_3px_rgba(15,23,42,0.28)] ${markerMeta.markerClass}`}
                  style={{
                    left: `calc(${clampReplayPercent(thought.progress, 0.02, 0.98) * 100}% - 0.4375rem)`
                  }}
                />
              );
            })}
            <div
              className="absolute inset-y-[-2px] w-0.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(15,23,42,0.35)]"
              style={{
                left: `calc(${currentProgress * 100}% - 1px)`
              }}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeCursor ? (
          <motion.div
            key={activeCursor.id}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="pointer-events-none absolute z-20"
            style={{
              left: `${activeCursor.left}%`,
              top: `${activeCursor.top}%`,
              transform: "translate(-12%, -10%)"
            }}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/35 blur-md" />
              <MousePointer2 className="relative h-8 w-8 fill-white text-brand-ink drop-shadow-[0_10px_25px_rgba(15,23,42,0.45)]" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeThought ? (
          <motion.div
            key={activeThought.id}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="pointer-events-none absolute z-30 max-w-[min(24rem,76vw)]"
            style={{
              left: `${activeThought.left}%`,
              top: `${activeThought.top}%`,
              transform: activeThought.align === "right" ? "translate(-100%, -100%)" : "translate(0, -100%)"
            }}
          >
            <div className="rounded-[1.4rem] border border-white/20 bg-white/92 px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.34)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                <Quote className="h-3.5 w-3.5 text-brand-accent" />
                Customer reaction
                {activeThought.emotion ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">{activeThought.emotion}</span> : null}
              </div>
              <div className="mt-2 text-sm font-black leading-6 text-brand-ink">{activeThought.text}</div>
              {activeThought.whatThisIs ? (
                <div className="mt-2 text-[11px] font-bold text-slate-500">Read as: {activeThought.whatThisIs}</div>
              ) : null}
              {activeThought.skepticism || activeThought.missingInformation ? (
                <div className="mt-1 text-[11px] font-bold text-slate-500">
                  Still unclear: {activeThought.skepticism || activeThought.missingInformation}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!thoughtCues.length ? (
        <div className="pointer-events-none absolute inset-x-6 bottom-6 z-10 rounded-2xl border border-white/10 bg-brand-ink/55 px-4 py-3 text-xs font-bold text-white/75 backdrop-blur">
          This replay has proof, but no structured customer reactions were saved for it yet.
        </div>
      ) : null}
    </div>
  );
}

function StarterSessionReplayModal({
  title,
  videoUrl,
  posterUrl,
  sessionUrl,
  thoughtCues,
  cursorCues,
  onClose
}: {
  title: string;
  videoUrl: string;
  posterUrl: string;
  sessionUrl: string;
  thoughtCues: ReplayThoughtCue[];
  cursorCues: ReplayCursorCue[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-brand-ink/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 20 }}
        className="w-full max-w-6xl bg-white rounded-[2rem] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 bg-slate-50/70">
          <div>
            <h2 className="text-xl font-black tracking-tight text-brand-ink">{title}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {videoUrl ? "Replay is ready to watch." : sessionUrl ? "Open the recorded session in a separate tab." : "Replay data is not available for this run yet."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all"
          >
            <Plus className="w-6 h-6 rotate-45 text-slate-400" />
          </button>
        </div>

        <div className="bg-brand-ink p-4 md:p-6">
          {videoUrl ? (
            <ReplayVideoWithOverlay
              title={title}
              videoUrl={videoUrl}
              posterUrl={posterUrl}
              thoughtCues={thoughtCues}
              cursorCues={cursorCues}
            />
          ) : posterUrl ? (
            <img
              src={posterUrl}
              alt={title}
              className="w-full max-h-[72vh] rounded-[1.5rem] bg-black object-contain"
            />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-[1.5rem] bg-white/5 text-center text-white/80">
              <div>
                <div className="text-lg font-black">No replay video attached</div>
                <div className="mt-2 text-sm font-bold text-white/50">This run only has static proof right now.</div>
              </div>
            </div>
          )}
        </div>

        {thoughtCues.length ? (
          <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-black text-brand-ink">Thought timeline</div>
                <div className="mt-1 text-xs font-bold text-slate-500">Customer reactions tied to what was visibly on screen.</div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{thoughtCues.length} cues</div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {thoughtCues.slice(0, 6).map((thought) => (
                <div key={thought.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    <Quote className="h-3.5 w-3.5 text-brand-accent" />
                    {thought.timestampLabel || "Thought"}
                  </div>
                  <div className="mt-2 text-sm font-black leading-6 text-brand-ink">{thought.text}</div>
                  {thought.whatThisIs ? (
                    <div className="mt-2 text-[11px] font-bold text-slate-500">Read as: {thought.whatThisIs}</div>
                  ) : null}
                  {thought.skepticism || thought.missingInformation ? (
                    <div className="mt-1 text-[11px] font-bold text-slate-500">
                      Still unclear: {thought.skepticism || thought.missingInformation}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 bg-white">
          <div className="text-sm font-bold text-slate-500">
            {videoUrl
              ? "Scrub the replay to see customer reactions and cursor markers at each recorded interaction."
              : "If a hosted session exists, open it from the button on the right."}
          </div>
          <div className="flex flex-wrap gap-3">
            {sessionUrl ? (
              <a
                href={sessionUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-brand-ink hover:bg-slate-50 transition-all"
              >
                Open Session
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-ink px-5 py-3 text-sm font-black text-white hover:bg-brand-accent transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StarterReportPage({
  run,
  report,
  status,
  shareKey,
  view,
  loading,
  error,
  copyFeedback,
  previousRunId,
  nextRunId,
  onBack,
  onChangeView,
  onCopyShareLink,
  onRunAgain,
  onViewRun
}: {
  run: RunSummary | null;
  report: QaReport | null;
  status: StatusResponse | null;
  shareKey: string;
  view: "report" | "live";
  loading: boolean;
  error: string;
  copyFeedback: string;
  previousRunId: string | null;
  nextRunId: string | null;
  onBack: () => void;
  onChangeView: (view: "report" | "live") => void;
  onCopyShareLink: () => Promise<void>;
  onRunAgain: () => Promise<void>;
  onViewRun: (runId: string) => void;
}) {
  const [selectedFix, setSelectedFix] = useState<StarterFixPoint | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const evidenceIndexMap = buildEvidenceIndexMap(report, "screenshot");
  const firstEvidence = Array.from(evidenceIndexMap.entries()).sort((left, right) => left[1] - right[1])[0];
  const videoEvidence = collectEvidenceValues(report, "video");
  const preferredVideoIndex = (() => {
    const localIndex = videoEvidence.findIndex((value) => !/^https?:\/\//i.test(String(value || "").trim()));
    return localIndex >= 0 ? localIndex : 0;
  })();
  const firstVideoValue = videoEvidence[preferredVideoIndex] || "";
  const persona = getStarterPersona(run?.persona || report?.summary?.note || run?.run_id);
  const effectiveStatus = String(status?.queue?.queue_status || status?.report_status || report?.status || run?.status || "completed").toLowerCase();
  const score = deriveScoreFromReport(report, run);
  const replayVideoUrl =
    firstVideoValue && (report?.run_id || run?.run_id)
      ? buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "video", preferredVideoIndex, shareKey)
      : "";
  const replaySessionUrl =
    String(
      report?.evidence_gallery?.session_url ||
        run?.session_url ||
        status?.artifacts?.live_stream_viewer_url ||
        status?.artifacts?.live_stream_embed_url ||
        ""
    ).trim();
  const liveStreamEmbedUrl = String(
    status?.artifacts?.live_stream_embed_url ||
      status?.artifacts?.live_stream_viewer_url ||
      ""
  ).trim();
  const liveStreamViewerUrl = String(
    status?.artifacts?.live_stream_viewer_url ||
      status?.artifacts?.live_stream_embed_url ||
      ""
  ).trim();
  const replayPosterUrl =
    firstEvidence && (report?.run_id || run?.run_id)
      ? buildEvidenceAssetUrl(report?.run_id || run?.run_id || "", "screenshot", firstEvidence[1], shareKey)
      : "";
  const replayOverlay = buildReplayOverlayData(status?.run_log, report, status?.artifacts);
  const hasReplay = Boolean(replayVideoUrl || replaySessionUrl);
  const frictionPoints =
    (report?.findings || []).map((finding, index) => {
      const detailedFinding = finding as ReportFinding & {
        element?: string | null;
        repro_steps?: string[] | null;
        fix_hint?: string | null;
        acceptance_criteria?: string[] | null;
      };
      const diagnosticDetails =
        detailedFinding.diagnostic_details && typeof detailedFinding.diagnostic_details === "object"
          ? detailedFinding.diagnostic_details as Record<string, unknown>
          : null;
      return {
        id: detailedFinding.id || `finding-${index}`,
        title: detailedFinding.title || `Friction point ${index + 1}`,
        description: getFindingSummary(detailedFinding),
        severity: String(detailedFinding.severity || "medium").toLowerCase(),
        expected_behavior: detailedFinding.expected_behavior || null,
        observed_behavior: detailedFinding.observed_behavior || null,
        recommended_fix: detailedFinding.recommended_fix || detailedFinding.fix_hint || null,
        page_url: detailedFinding.page?.url || (diagnosticDetails && typeof diagnosticDetails.current_url === "string" ? diagnosticDetails.current_url : null),
        element: detailedFinding.element || (diagnosticDetails && typeof diagnosticDetails.element === "string" ? diagnosticDetails.element : null),
        repro_steps: Array.isArray(detailedFinding.repro_steps) ? detailedFinding.repro_steps : null,
        acceptance_criteria: Array.isArray(detailedFinding.acceptance_criteria) ? detailedFinding.acceptance_criteria : null,
        diagnostic_details: diagnosticDetails
      };
    }) || [];
  const personaReadout = buildPersonaReadout({
    persona,
    report,
    thoughts: replayOverlay.thoughts,
    frictionPoints
  });
  const skepticismFixPoints = buildSkepticismFixPoints(personaReadout.skepticisms);
  const personaReadoutToneClass =
    personaReadout.emotionalTone === "negative"
      ? "border-brand-danger/20 bg-brand-danger/5 text-brand-danger"
      : personaReadout.emotionalTone === "warning"
        ? "border-brand-warning/20 bg-brand-warning/5 text-brand-warning"
        : personaReadout.emotionalTone === "positive"
          ? "border-brand-success/20 bg-brand-success/5 text-brand-success"
          : "border-slate-200 bg-slate-50 text-slate-600";
  const replayLogs = (status?.run_log || []).slice(0, 8).map((entry, index) => ({
    step: index + 1,
    action: String(entry.event || entry.message || "Interaction").replaceAll("_", " "),
    result: String(entry.message || entry.note || getRunLogPayload(entry).text || getRunLogPayload(entry).reason || "Recorded"),
    time: entry.ts ? formatDateTime(String(entry.ts)) : `0:${String(index * 8).padStart(2, "0")}`
  }));
  const isActiveRun = ["queued", "processing", "retryable"].includes(effectiveStatus);
  const reportReady = Boolean(report || status?.report_ready || run?.report_ready);
  const liveSummary =
    status?.progress?.message ||
    run?.summary_note ||
    (effectiveStatus === "queued"
      ? "Waiting for worker pickup."
      : effectiveStatus === "processing"
        ? "The run is in progress."
        : "Waiting for another attempt.");
  const liveThoughtRows = replayOverlay.thoughts.slice(-6).reverse();
  const liveLogRows = (status?.run_log || []).slice(-12).map((entry, index) => {
    const details = getRunLogPayload(entry);
    return {
    id: `${entry.timestamp || entry.ts || index}-${entry.event || "event"}`,
    title: String(entry.event || "update").replaceAll("_", " "),
    note:
      String(
        entry.message ||
          entry.note ||
          details.text ||
          details.message ||
          details.current_state ||
          details.reason ||
          "Recorded"
      ).trim() || "Recorded",
    at: String(entry.timestamp || entry.ts || "").trim()
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      <AnimatePresence>
        {selectedFix ? (
          <StarterFixDiagnosis
            point={selectedFix}
            runId={report?.run_id || run?.run_id || ""}
            brandKey={run?.brand_key || String(report?.metadata?.brand_key || "")}
            onClose={() => setSelectedFix(null)}
          />
        ) : null}
        {replayOpen ? (
          <StarterSessionReplayModal
            title={`Watch ${persona.name}'s Session`}
            videoUrl={replayVideoUrl}
            posterUrl={replayPosterUrl}
            sessionUrl={replaySessionUrl}
            thoughtCues={replayOverlay.thoughts}
            cursorCues={replayOverlay.cursors}
            onClose={() => setReplayOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div className="h-8 w-[2px] bg-slate-100" />
          <div>
            <h1 className="text-xl font-black tracking-tight">Test Report: {formatDateTime(run?.delivered_at) || run?.run_id || report?.run_id || "Latest"}</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dashboard</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">Report Detail</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => onChangeView("report")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                view === "report" ? "bg-brand-ink text-white" : "text-slate-500 hover:text-brand-ink"
              }`}
            >
              Report
            </button>
            <button
              onClick={() => onChangeView("live")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                view === "live" ? "bg-brand-ink text-white" : "text-slate-500 hover:text-brand-ink"
              }`}
            >
              Live
            </button>
          </div>
          <button onClick={() => onCopyShareLink().catch(() => null)} className="handcrafted-card px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-slate-50 transition-all">
            <Globe className="w-4 h-4 text-slate-400" />
            {copyFeedback || "Share Link"}
          </button>
          <button onClick={() => window.print()} className="bg-brand-ink text-white px-8 py-2.5 rounded-xl font-black text-sm hover:bg-brand-accent transition-all shadow-sm">
            Export PDF
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-8 md:p-12">
        {loading ? (
          <div className="dash-card p-10 text-sm font-bold text-slate-500">
            <LoaderCircle className="inline h-4 w-4 mr-2 animate-spin" />
            Loading report...
          </div>
        ) : error ? (
          <div className="dash-card p-10 text-sm font-bold text-brand-danger">{error}</div>
        ) : view === "live" || isActiveRun ? (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-12">
            <aside className="space-y-8">
              <div className="dash-card p-8 space-y-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${effectiveStatus === "processing" ? "bg-brand-warning" : "bg-brand-accent"}`} />
                    <div className="text-lg font-black uppercase tracking-widest text-brand-ink">
                      {formatStatusLabel(effectiveStatus || "queued")}
                    </div>
                  </div>
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current test</div>
                  <div className="mt-2 text-sm font-bold text-brand-ink">{run?.goal || run?.summary_note || "Waiting for the test to start."}</div>
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">User</div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 border-white shadow-md ${persona.color}`}>
                      <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <div className="font-black text-sm">{persona.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{persona.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-8">
              <section className="dash-card p-10 bg-white">
                <div className="flex items-center gap-3 mb-6">
                  <LoaderCircle className={`w-6 h-6 ${isActiveRun ? "animate-spin text-brand-accent" : "text-brand-accent"}`} />
                  <h3 className="text-xl font-black tracking-tight">
                    {!isActiveRun && reportReady
                      ? "Run complete"
                      : effectiveStatus === "queued"
                        ? "Run queued"
                        : effectiveStatus === "processing"
                          ? "Run in progress"
                          : "Run update"}
                  </h3>
                </div>
                <p className="text-2xl font-bold text-brand-ink leading-relaxed">
                  {!isActiveRun && reportReady ? "The report is ready." : liveSummary}
                </p>
                <p className="mt-4 text-sm font-bold text-slate-400">
                  {isActiveRun
                    ? "This run has not finished yet. A full report will appear after the worker completes."
                    : reportReady
                      ? "Review the findings, proof, and next fix."
                      : "The worker finished, but the report is still being finalized."}
                </p>
                {!isActiveRun && reportReady ? (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => onChangeView("report")}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-ink px-6 py-3 text-sm font-black text-white shadow-sm transition-all hover:bg-brand-accent"
                    >
                      <FileText className="h-4 w-4" />
                      View report
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="space-y-6">
              {liveThoughtRows.length ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-xl font-black tracking-tight">What the customer is thinking</h3>
                      <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                        {liveThoughtRows.length} cues
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {liveThoughtRows.map((thought) => (
                        <div key={thought.id} className="dash-card p-6 border border-slate-100 bg-white">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            <Quote className="h-3.5 w-3.5 text-brand-accent" />
                            Customer reaction
                            {thought.emotion ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">{thought.emotion}</span> : null}
                          </div>
                          <div className="mt-3 text-base font-black leading-7 text-brand-ink">{thought.text}</div>
                          {thought.whatThisIs ? (
                            <div className="mt-3 text-xs font-black uppercase tracking-widest text-slate-400">
                              Read as: {thought.whatThisIs}
                            </div>
                          ) : null}
                          {thought.skepticism || thought.missingInformation ? (
                            <div className="mt-2 text-sm font-bold text-slate-500">
                              Still unclear: {thought.skepticism || thought.missingInformation}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="dash-card p-6 text-sm font-bold text-slate-500">
                    No customer thoughts were captured for this run yet.
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-black tracking-tight">Live activity</h3>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    {liveLogRows.length ? `${liveLogRows.length} updates` : "No updates yet"}
                  </div>
                </div>
                <div className="dash-card overflow-hidden">
                  <div className="divide-y border-slate-100">
                    {(liveLogRows.length
                      ? liveLogRows
                      : [
                          {
                            id: "waiting",
                            title: "waiting for worker pickup",
                            note: "The queue row exists, but no worker activity has been recorded yet.",
                            at: ""
                          }
                        ]).map((log) => (
                      <div key={log.id} className="flex items-start justify-between gap-6 p-6 hover:bg-slate-50/60 transition-all">
                        <div>
                          <div className="text-sm font-black uppercase tracking-widest text-brand-ink">{log.title}</div>
                          <div className="mt-2 text-sm font-bold text-slate-500">{log.note}</div>
                        </div>
                        <div className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {log.at ? formatDateTime(log.at) : "pending"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {isActiveRun ? (
                <section className="space-y-6">
                  <h3 className="text-xl font-black tracking-tight">Session watch</h3>
                  {liveStreamEmbedUrl ? (
                    <LiveSessionEmbed
                      embedUrl={liveStreamEmbedUrl}
                      viewerUrl={liveStreamViewerUrl}
                      title="Live session"
                      className="dash-card bg-white"
                      frameClassName="h-[min(68vh,640px)] min-h-[420px]"
                    />
                  ) : (
                    <div className="dash-card p-8">
                      <div className="text-sm font-bold text-slate-500">
                        Live viewer is not attached yet. If the run stays queued here, the worker likely has not picked it up.
                      </div>
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
            <aside className="lg:col-span-1 space-y-8">
              <div className="dash-card p-8 text-center">
                <div className={`w-24 h-24 rounded-[2rem] flex flex-col items-center justify-center border-4 border-white shadow-2xl mx-auto mb-6 ${score >= 90 ? "bg-brand-success text-white" : score > 0 ? "bg-brand-warning text-white" : "bg-brand-danger text-white"}`}>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Score</div>
                  <div className="text-4xl font-black tracking-tighter">{score}</div>
                </div>
                <h3 className="text-xl font-black mb-1">{score >= 90 ? "Excellent" : score > 0 ? "Needs Work" : "Critical Failure"}</h3>
                <p className="text-sm font-bold text-slate-400">Overall Satisfaction</p>
              </div>

              <div className="dash-card p-6 space-y-6">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Tested By</h4>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 border-white shadow-md ${persona.color}`}>
                      <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <div className="font-black text-sm">{persona.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{persona.role}</div>
                    </div>
                  </div>
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Trait</h4>
                  <div className="text-sm font-bold text-brand-ink">{persona.trait}</div>
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Status</h4>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${effectiveStatus === "completed" ? "bg-brand-success" : ["queued", "processing", "retryable"].includes(effectiveStatus) ? "bg-brand-accent" : "bg-brand-danger"}`} />
                    <span className="text-sm font-black uppercase tracking-widest">{formatStatusLabel(effectiveStatus)}</span>
                  </div>
                </div>
              </div>
            </aside>

            <div className="lg:col-span-3 space-y-12">
              <section className="dash-card p-10 bg-white">
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="w-6 h-6 text-brand-accent" />
                  <h3 className="text-xl font-black tracking-tight">Executive Summary</h3>
                </div>
                <p className="text-2xl font-bold text-brand-ink leading-relaxed">
                  {report?.summary?.note || run?.summary_note || getReportSubhead(run, report)}
                </p>
              </section>

              <section className="dash-card p-8 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Persona readout</h3>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      Only captured customer thoughts appear here. Raw run failures are shown separately.
                    </p>
                  </div>
                  <div className={`rounded-xl border px-4 py-3 text-sm font-black ${personaReadoutToneClass}`}>
                    {personaReadout.emotionalState}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Quote className="mt-1 h-4 w-4 shrink-0 text-brand-accent" />
                    <p className="text-base font-black leading-7 text-brand-ink">{personaReadout.overall}</p>
                  </div>
                </div>

                {personaReadout.blocker ? (
                  <div className="mt-4 rounded-2xl border border-brand-danger/20 bg-brand-danger/5 px-5 py-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-brand-danger">Run blocker</div>
                    <p className="mt-2 text-base font-black leading-7 text-brand-ink">{personaReadout.blocker}</p>
                    {personaReadout.blockerContext ? (
                      <p className="mt-2 text-sm font-bold text-slate-600">
                        Last confirmed progress: {personaReadout.blockerContext}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 p-5">
                    <h4 className="text-sm font-black text-brand-ink">Takeaways</h4>
                    {personaReadout.takeaways.length ? (
                      <ul className="mt-4 space-y-3">
                        {personaReadout.takeaways.map((item) => (
                          <li key={item} className="flex gap-3 text-sm font-bold leading-6 text-slate-600">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-success" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-4 text-sm font-bold leading-6 text-slate-500">
                        No customer takeaways were captured in this run.
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-5">
                    <h4 className="text-sm font-black text-brand-ink">Skepticisms</h4>
                    {skepticismFixPoints.length ? (
                      <div className="mt-4 space-y-3">
                        {skepticismFixPoints.map((point) => (
                          <div key={point.id} className="rounded-2xl border border-brand-warning/20 bg-brand-warning/5 p-4">
                            <div className="flex gap-3">
                              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-warning" />
                              <p className="text-sm font-bold leading-6 text-slate-700">{point.description}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedFix(point)}
                              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-ink px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-brand-accent"
                            >
                              <Sparkles className="h-4 w-4" />
                              Generate Fix Diagnosis
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 flex gap-3 text-sm font-bold leading-6 text-slate-500">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                        <span>No customer skepticisms were captured in this run.</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-xl font-black tracking-tight">Friction Points Found ({frictionPoints.length})</h3>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-danger/10 text-brand-danger border border-brand-danger/20 text-[10px] font-black uppercase tracking-widest">
                      {frictionPoints.filter((point) => point.severity === "high" || point.severity === "critical").length} High
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-warning/10 text-brand-warning border border-brand-warning/20 text-[10px] font-black uppercase tracking-widest">
                      {frictionPoints.filter((point) => point.severity === "medium").length} Medium
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {frictionPoints.length ? frictionPoints.map((point, index) => (
                    <motion.div key={point.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="dash-card p-8 border-2 border-slate-100 hover:border-brand-accent transition-all group relative overflow-hidden">
                      <div className="flex justify-between items-start mb-6">
                        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                          point.severity === "high" || point.severity === "critical"
                            ? "bg-brand-danger/10 text-brand-danger border-brand-danger/20"
                            : point.severity === "medium"
                              ? "bg-brand-warning/10 text-brand-warning border-brand-warning/20"
                              : "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/20"
                        }`}>
                          {point.severity} severity
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-brand-accent group-hover:text-white transition-all">
                          <Zap className="w-5 h-5" />
                        </div>
                      </div>
                      <h4 className="text-xl font-black mb-3">{point.title}</h4>
                      <p className="text-base font-medium text-slate-500 mb-8 leading-relaxed">{point.description}</p>
                      <button onClick={() => setSelectedFix(point)} className="w-full bg-brand-ink text-white py-4 rounded-2xl font-black text-sm hover:bg-brand-accent transition-all flex items-center justify-center gap-2 shadow-lg">
                        <Sparkles className="w-5 h-5" />
                        Generate Fix Diagnosis
                      </button>
                    </motion.div>
                  )) : (
                    <div className="dash-card p-8 border-2 border-slate-100 md:col-span-2">
                      <h4 className="text-lg font-black text-brand-ink">No structured findings</h4>
                      <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
                        This run did not record a concrete friction point to fix.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-xl font-black tracking-tight">Session Replay</h3>
                <button
                  type="button"
                  onClick={() => {
                    if (!hasReplay) {
                      return;
                    }
                    if (!replayVideoUrl && replaySessionUrl) {
                      window.open(replaySessionUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    setReplayOpen(true);
                  }}
                  disabled={!hasReplay}
                  className={`aspect-video w-full bg-brand-ink rounded-[3rem] flex items-center justify-center relative group overflow-hidden shadow-2xl border-8 border-white text-left ${
                    hasReplay ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                  }`}
                >
                  {firstEvidence ? (
                    <img className="absolute inset-0 h-full w-full object-cover opacity-80" src={replayPosterUrl} alt="Session replay" />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-ink/90 via-brand-ink/20 to-transparent" />
                  <div className="relative z-10 text-center">
                    <div className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-2xl group-hover:scale-105 transition-transform">
                      <Play className="w-10 h-10 text-white fill-white ml-1.5" />
                    </div>
                    <p className="text-white font-black uppercase tracking-widest text-lg">Watch {persona.name}&apos;s Session</p>
                    <p className="text-white/40 text-sm mt-2 font-bold tracking-tight">
                      {run?.target_url || run?.target || report?.target || "Real session proof"} • {frictionPoints.length} friction points
                    </p>
                    <p className="mt-4 text-xs font-black uppercase tracking-widest text-white/70">
                      {replayVideoUrl ? "Click to play replay" : replaySessionUrl ? "Click to open session" : "Replay not available yet"}
                    </p>
                  </div>
                </button>
              </section>

              {replayOverlay.thoughts.length ? (
                <section className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-black tracking-tight">What the customer was thinking</h3>
                    <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {replayOverlay.thoughts.length} excerpts
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {replayOverlay.thoughts.slice(0, 6).map((thought) => (
                      <div key={thought.id} className="dash-card p-6 border-2 border-slate-100 bg-white">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          <Quote className="h-3.5 w-3.5 text-brand-accent" />
                          {thought.timestampLabel || "Customer reaction"}
                          {thought.emotion ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">{thought.emotion}</span> : null}
                        </div>
                        <div className="mt-3 text-base font-black leading-7 text-brand-ink">{thought.text}</div>
                        {thought.whatThisIs ? (
                          <div className="mt-3 text-xs font-black uppercase tracking-widest text-slate-400">
                            Read as: {thought.whatThisIs}
                          </div>
                        ) : null}
                        {thought.skepticism || thought.missingInformation ? (
                          <div className="mt-2 text-sm font-bold text-slate-500">
                            Still unclear: {thought.skepticism || thought.missingInformation}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-6">
                <h3 className="text-xl font-black tracking-tight">Full Step-by-Step Log</h3>
                <div className="dash-card overflow-hidden">
                  <div className="divide-y border-slate-100">
                    {(replayLogs.length ? replayLogs : [{ step: 1, action: "No run log yet", result: "Waiting for more structured playback data", time: "n/a" }]).map((log, index) => (
                      <div key={`${log.step}-${index}`} className="flex items-center justify-between p-6 hover:bg-slate-50 transition-all">
                        <div className="flex items-center gap-6">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400">{log.step}</div>
                          <div>
                            <div className="font-bold text-sm text-brand-ink">{log.action}</div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.time}</div>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${String(log.result).toLowerCase().includes("fail") ? "bg-brand-danger/10 text-brand-danger border-brand-danger/20" : "bg-brand-success/10 text-brand-success border-brand-success/20"}`}>
                          {String(log.result).slice(0, 48)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 p-6 sticky bottom-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button disabled={!previousRunId} onClick={() => previousRunId && onViewRun(previousRunId)} className="handcrafted-card px-8 py-3 rounded-xl font-black text-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-40">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Previous Report
            </button>
            <button disabled={!nextRunId} onClick={() => nextRunId && onViewRun(nextRunId)} className="handcrafted-card px-8 py-3 rounded-xl font-black text-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-40">
              Next Report
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={onBack} className="bg-brand-muted/20 px-8 py-3 rounded-xl font-black text-sm hover:bg-brand-ink hover:text-white transition-all">
              Archive Report
            </button>
            <button onClick={() => onRunAgain().catch(() => null)} className="bg-brand-accent text-white px-10 py-3 rounded-xl font-black text-sm hover:bg-brand-ink transition-all shadow-lg">
              Approve Fixes
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StarterPersonaLab({
  personas,
  setPersonas,
  onBack
}: {
  personas: StarterPersona[];
  setPersonas: React.Dispatch<React.SetStateAction<StarterPersona[]>>;
  onBack: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingPersona, setEditingPersona] = useState<StarterPersona | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    trait: "Impatient & Fast",
    quote: "",
    avatar: "",
    techSavviness: 50,
    attentionSpan: 50,
    patience: 50
  });

  function handleOpenCreate() {
    setEditingPersona(null);
    const base = {
      name: "",
      role: "Custom User",
      trait: "Impatient & Fast",
      quote: "I&apos;m a custom persona created for testing."
    };
    setFormData({
      name: base.name,
      trait: base.trait,
      quote: base.quote,
      avatar: buildPersonaAvatarUrl(base),
      techSavviness: 50,
      attentionSpan: 50,
      patience: 50
    });
    setIsCreating(true);
  }

  function handleOpenEdit(persona: StarterPersona) {
    const resolvedAvatar = resolvePersonaAvatar(persona, persona.avatar);
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      trait: persona.trait,
      quote: persona.quote,
      avatar: resolvedAvatar,
      techSavviness: persona.techSavviness,
      attentionSpan: persona.attentionSpan,
      patience: persona.patience
    });
    setIsCreating(true);
  }

  function handleSave() {
    const role = editingPersona?.role || "Custom User";
    const resolvedAvatar = resolvePersonaAvatar(
      {
        name: formData.name || editingPersona?.name || "Custom Persona",
        role,
        trait: formData.trait,
        quote: formData.quote
      },
      formData.avatar
    );
    if (editingPersona) {
      setPersonas((current) =>
        current.map((persona) =>
          persona.id === editingPersona.id
            ? {
                ...persona,
                name: formData.name,
                trait: formData.trait,
                quote: formData.quote,
                avatar: resolvedAvatar,
                techSavviness: formData.techSavviness,
                attentionSpan: formData.attentionSpan,
                patience: formData.patience
              }
            : persona
        )
      );
    } else {
      setPersonas((current) => [
        ...current,
        {
          id: Math.random().toString(36).slice(2, 9),
          name: formData.name || "Custom Persona",
          role,
          trait: formData.trait,
          quote: formData.quote,
          avatar: resolvedAvatar,
          color: buildPersonaColor(formData.name || formData.quote || formData.trait),
          techSavviness: formData.techSavviness,
          attentionSpan: formData.attentionSpan,
          patience: formData.patience
        }
      ]);
    }
    setIsCreating(false);
  }

  function generateNewAvatar() {
    const descriptor = {
      name: formData.name || editingPersona?.name || "Custom Persona",
      role: editingPersona?.role || "Custom User",
      trait: formData.trait,
      quote: formData.quote
    };
    setFormData((current) => ({
      ...current,
      avatar: `${buildPersonaAvatarUrl(descriptor)}&refresh=${Date.now()}`
    }));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">Persona Lab</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Train & Manage Custom Agents</p>
          </div>
        </div>
        <button onClick={handleOpenCreate} className="bg-brand-ink text-white px-8 py-2.5 rounded-xl font-black text-sm hover:bg-brand-accent transition-all shadow-sm flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Custom Persona
        </button>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-8 md:p-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {personas.map((persona) => {
            const displayAvatar = resolvePersonaAvatar(persona, persona.avatar);
            return (
              <div key={persona.id} className="dash-card p-8 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className={`w-20 h-20 rounded-[2rem] overflow-hidden border-4 border-white shadow-xl ${persona.color}`}>
                    <img src={displayAvatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <button onClick={() => handleOpenEdit(persona)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-brand-ink hover:text-white transition-all">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-2xl font-black mt-6 tracking-tight">{persona.name}</h3>
                <div className="text-xs font-black uppercase tracking-widest text-brand-accent mt-1">{persona.role}</div>
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-sm font-bold text-slate-600 italic">&quot;{persona.quote}&quot;</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tech</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-brand-secondary" style={{ width: `${persona.techSavviness}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Attention</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-brand-accent" style={{ width: `${persona.attentionSpan}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Patience</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-brand-warning" style={{ width: `${persona.patience}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <AnimatePresence>
        {isCreating ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm p-4" onClick={() => setIsCreating(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl p-10 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-3xl font-black tracking-tight mb-2">{editingPersona ? "Edit Persona" : "New Persona"}</h2>
              <p className="text-slate-500 font-bold mb-8">{editingPersona ? "Update how this agent behaves." : "Create a custom test persona for your product."}</p>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Name</label>
                  <input type="text" value={formData.name} onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Trait</label>
                  <input type="text" value={formData.trait} onChange={(event) => setFormData((current) => ({ ...current, trait: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Quote</label>
                  <textarea value={formData.quote} onChange={(event) => setFormData((current) => ({ ...current, quote: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold min-h-32" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Avatar</label>
                  <div className="flex gap-3">
                    <input type="text" value={formData.avatar} onChange={(event) => setFormData((current) => ({ ...current, avatar: event.target.value }))} className="flex-1 p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold" />
                    <button onClick={generateNewAvatar} className="handcrafted-card px-4 rounded-xl font-black text-sm">Refresh</button>
                  </div>
                </div>
                <button onClick={handleSave} className="w-full bg-brand-ink text-white py-4 rounded-2xl font-black text-lg hover:bg-brand-accent transition-all shadow-lg mt-4">
                  {editingPersona ? "Save Changes" : "Create Persona"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StarterAutomationsPage({
  personas,
  activeBrand,
  currentSchedule,
  scheduleDraft,
  setScheduleDraft,
  scheduleSaving,
  scheduleMessage,
  scheduleTone,
  repoConnection,
  repoLoading,
  repoError,
  alerts,
  onBack,
  onSaveSchedule,
  onRunScheduleNow,
  onConnectGitHub,
  onSaveProjectRepos,
  onAcknowledgeAlert
}: {
  personas: StarterPersona[];
  activeBrand: StarterBrand | null;
  currentSchedule: ScheduleItem | null;
  scheduleDraft: { frequency_hours: number; mission: string; persona: string };
  setScheduleDraft: React.Dispatch<React.SetStateAction<{ frequency_hours: number; mission: string; persona: string }>>;
  scheduleSaving: boolean;
  scheduleMessage: string;
  scheduleTone: "neutral" | "success" | "danger";
  repoConnection: RepoConnection | null;
  repoLoading: boolean;
  repoError: string;
  alerts: AlertItem[];
  onBack: () => void;
  onSaveSchedule: (override?: { name?: string; frequency_hours: number; mission: string; persona: string }) => Promise<void>;
  onRunScheduleNow: (scheduleId: string) => Promise<void>;
  onConnectGitHub: () => Promise<void>;
  onSaveProjectRepos: (input: { primaryRepoFullName: string; associatedRepoFullNames: string[] }) => Promise<void>;
  onAcknowledgeAlert: (alertId: string) => Promise<void>;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [repoPrimaryDraft, setRepoPrimaryDraft] = useState("");
  const [repoAssociatedDraft, setRepoAssociatedDraft] = useState<string[]>([]);
  const [repoAddDraft, setRepoAddDraft] = useState("");
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoSaveMessage, setRepoSaveMessage] = useState("");
  const [repoSaveTone, setRepoSaveTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [formData, setFormData] = useState({
    title: currentSchedule?.name || "",
    triggerType: "Scheduled" as "Scheduled" | "GitHub Push",
    frequency: currentSchedule?.frequency_hours === 168 ? "Weekly" : "Daily",
    personaId: "all",
    target: "Full Site"
  });
  const availableRepos = Array.isArray(repoConnection?.repositories) ? repoConnection.repositories.filter((repo) => repo.full_name) : [];
  const githubInstalled = Boolean(repoConnection?.installation_id);
  const repoConnected = repoConnection?.connection_status === "connected";
  const repoNeedsSelection = repoConnection?.connection_status === "awaiting_repo_selection";
  const canChooseProjectRepos = repoConnected || repoNeedsSelection || availableRepos.length > 0;
  const savedAssociatedRepos = Array.isArray(repoConnection?.associated_repo_full_names)
    ? repoConnection.associated_repo_full_names.filter((repo) => repo && repo !== repoConnection?.selected_repo_full_name)
    : [];
  const remainingRepoOptions = availableRepos.filter((repo) => {
    const fullName = String(repo.full_name || "");
    return fullName && fullName !== repoPrimaryDraft && !repoAssociatedDraft.includes(fullName);
  });
  const repoSelectionDirty =
    repoPrimaryDraft !== String(repoConnection?.selected_repo_full_name || "") ||
    JSON.stringify([...repoAssociatedDraft].sort()) !== JSON.stringify([...savedAssociatedRepos].sort());

  useEffect(() => {
    const primaryRepoFullName = String(repoConnection?.selected_repo_full_name || "");
    const associatedRepoFullNames = Array.isArray(repoConnection?.associated_repo_full_names)
      ? repoConnection.associated_repo_full_names.filter((repo) => repo && repo !== primaryRepoFullName)
      : [];
    setRepoPrimaryDraft(primaryRepoFullName);
    setRepoAssociatedDraft(associatedRepoFullNames);
    setRepoAddDraft("");
    setRepoSaveMessage("");
    setRepoSaveTone("neutral");
  }, [repoConnection?.associated_repo_full_names, repoConnection?.selected_repo_full_name]);

  function openEditor() {
    setLocalMessage("");
    setFormData({
      title: currentSchedule?.name || "",
      triggerType: "Scheduled",
      frequency: currentSchedule?.frequency_hours === 168 ? "Weekly" : "Daily",
      personaId: "all",
      target: "Full Site"
    });
    setIsCreating(true);
  }

  function handleAddAssociatedRepo() {
    if (!repoAddDraft || repoAddDraft === repoPrimaryDraft || repoAssociatedDraft.includes(repoAddDraft)) {
      return;
    }
    setRepoAssociatedDraft((current) => [...current, repoAddDraft]);
    setRepoAddDraft("");
  }

  async function handleSaveProjectRepos() {
    if (!repoPrimaryDraft) {
      setRepoSaveMessage("Pick a primary repo first.");
      setRepoSaveTone("danger");
      return;
    }
    setRepoSaving(true);
    setRepoSaveMessage("");
    try {
      await onSaveProjectRepos({
        primaryRepoFullName: repoPrimaryDraft,
        associatedRepoFullNames: [repoPrimaryDraft, ...repoAssociatedDraft]
      });
      setRepoSaveMessage("Project repos saved.");
      setRepoSaveTone("success");
    } catch (error) {
      setRepoSaveMessage(error instanceof Error ? error.message : "Could not save project repos.");
      setRepoSaveTone("danger");
    } finally {
      setRepoSaving(false);
    }
  }

  async function handleSave() {
    if (formData.triggerType === "GitHub Push") {
      setLocalMessage("GitHub-triggered suites are not wired in this build yet. Use a scheduled trigger for now.");
      return;
    }

    const selectedPersona = formData.personaId === "all"
      ? scheduleDraft.persona || DEFAULT_PERSONA
      : personas.find((persona) => persona.id === formData.personaId)?.quote || DEFAULT_PERSONA;
    const mission = formData.target === "Full Site" ? DEFAULT_GOALS.join("\n") : `Focus on the ${formData.target} flow and record any friction.`;
    const frequency_hours = formData.frequency === "Weekly" ? 168 : 24;

    setScheduleDraft((current) => ({
      ...current,
      frequency_hours,
      persona: selectedPersona,
      mission
    }));
    await onSaveSchedule({
      name: formData.title || currentSchedule?.name || "Scheduled QA",
      frequency_hours,
      persona: selectedPersona,
      mission
    });
    setIsCreating(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">Automations</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CI/CD & Scheduled Testing</p>
          </div>
        </div>
        <button onClick={openEditor} className="bg-brand-ink text-white px-8 py-2.5 rounded-xl font-black text-sm hover:bg-brand-accent transition-all shadow-sm flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Automation
        </button>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-8 md:p-12 space-y-12">
        <div className="dash-card p-10 bg-white border-2 border-slate-100 flex flex-col md:flex-row items-center gap-12">
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center shrink-0 shadow-2xl">
            <GitBranch className="w-12 h-12 text-white" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight">GitHub Integration</h2>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${repoConnected ? "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/20" : "bg-brand-warning/10 text-brand-warning border-brand-warning/20"}`}>
                {repoConnected ? "Connected" : repoNeedsSelection ? "Pick Repo" : "Not Connected"}
              </span>
            </div>
            <p className="text-slate-500 font-medium text-lg leading-relaxed max-w-2xl">
              We automatically run a full regression suite on every Pull Request. If an agent finds a friction point, we&apos;ll comment directly on the PR with proof and a suggested fix.
            </p>
            {repoError ? <p className="text-sm font-bold text-brand-danger">{repoError}</p> : null}
            {repoNeedsSelection ? (
              <div className="mt-4 rounded-2xl border border-brand-warning/20 bg-brand-warning/10 p-5">
                <div className="text-sm font-black tracking-tight text-brand-ink">
                  Choose the repos for {activeBrand?.name || "this brand"}
                </div>
                <p className="mt-1 text-sm leading-6 text-brand-muted">
                  GitHub is connected. Now pick the primary repo and any related repos that belong to this product so route hints and fix diagnosis search the right codebase.
                </p>
              </div>
            ) : null}
            {canChooseProjectRepos ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-black tracking-tight text-brand-ink">Project repos</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Pick one primary repo for this brand, then add any other repos this product depends on so diagnosis can search across the right codebases.
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Primary repo</label>
                    <select
                      value={repoPrimaryDraft}
                      onChange={(event) => {
                        const nextPrimary = event.target.value;
                        setRepoPrimaryDraft(nextPrimary);
                        setRepoAssociatedDraft((current) => current.filter((repo) => repo !== nextPrimary));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink outline-none focus:border-brand-accent"
                    >
                      <option value="">Choose a repo</option>
                      {availableRepos.map((repo) => (
                        <option key={repo.full_name || repo.id} value={repo.full_name || ""}>
                          {repo.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="self-end text-xs font-bold uppercase tracking-widest text-slate-400">
                    {repoConnection?.associated_repo_full_names?.length || (repoConnection?.selected_repo_full_name ? 1 : 0)} linked
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Other repos for this project</label>
                  <div className="flex flex-wrap gap-2">
                    {repoAssociatedDraft.length ? (
                      repoAssociatedDraft.map((repo) => (
                        <button
                          key={repo}
                          type="button"
                          onClick={() => setRepoAssociatedDraft((current) => current.filter((item) => item !== repo))}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:border-brand-accent"
                        >
                          {repo}
                          <Plus className="h-3.5 w-3.5 rotate-45 text-slate-400" />
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
                        No extra repos linked yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    value={repoAddDraft}
                    onChange={(event) => setRepoAddDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink outline-none focus:border-brand-accent"
                  >
                    <option value="">Add another repo</option>
                    {remainingRepoOptions.map((repo) => (
                      <option key={repo.full_name || repo.id} value={repo.full_name || ""}>
                        {repo.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddAssociatedRepo}
                    disabled={!repoAddDraft}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-brand-ink transition-all hover:border-brand-accent disabled:opacity-50"
                  >
                    Add repo
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">
                    Diagnosis will search the primary repo first, then the linked repos.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveProjectRepos().catch(() => null)}
                    disabled={repoSaving || !repoPrimaryDraft || !repoSelectionDirty}
                    className="rounded-xl bg-brand-ink px-5 py-3 text-sm font-black text-white transition-all hover:bg-brand-accent disabled:opacity-50"
                  >
                    {repoSaving ? "Saving..." : "Save project repos"}
                  </button>
                </div>

                {repoSaveMessage ? (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${repoSaveTone === "success" ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary" : repoSaveTone === "danger" ? "border-brand-danger/20 bg-brand-danger/10 text-brand-danger" : "border-slate-200 bg-white text-slate-500"}`}>
                    {repoSaveMessage}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button onClick={() => onConnectGitHub().catch(() => null)} disabled={repoLoading} className="handcrafted-card px-8 py-4 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
            {repoLoading ? "Loading..." : githubInstalled ? "Reconnect GitHub" : "Connect GitHub"}
          </button>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-black tracking-tight">Active Triggers</h3>
          <div className="grid grid-cols-1 gap-4">
            {currentSchedule ? (
              <div className="dash-card p-6 flex items-center justify-between bg-white hover:border-brand-accent transition-all group">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand-accent group-hover:text-white transition-all">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black tracking-tight">{currentSchedule.name || `${activeBrand?.name || "Brand"} Daily Check`}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-bold text-slate-400">Every {currentSchedule.frequency_hours || 24}h</span>
                      <div className="w-1 h-1 rounded-full bg-slate-200" />
                      <span className="text-xs font-bold text-brand-accent">Agent: {currentSchedule.persona || "Mix of Agents"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <button onClick={() => onRunScheduleNow(currentSchedule.id).catch(() => null)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-all">
                    <div className="w-2 h-2 rounded-full bg-brand-secondary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Run Now</span>
                  </button>
                  <button onClick={openEditor} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-brand-ink hover:text-white transition-all">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="dash-card p-8 bg-white text-sm font-bold text-slate-500">No automation exists for this brand yet. Create one to keep the new UI under constant QA.</div>
            )}
          </div>
        </div>

        {alerts.length ? (
          <div className="space-y-6">
            <h3 className="text-xl font-black tracking-tight">Open Alerts</h3>
            <div className="grid grid-cols-1 gap-4">
              {alerts.map((alert) => (
                <div key={alert.id} className="dash-card p-6 bg-white flex items-center justify-between gap-6">
                  <div>
                    <div className="text-lg font-black tracking-tight">{alert.title || "Alert"}</div>
                    <div className="text-sm font-medium text-slate-500 mt-1">{alert.message || "A recent automation raised attention."}</div>
                  </div>
                  <button onClick={() => onAcknowledgeAlert(alert.id).catch(() => null)} className="handcrafted-card px-6 py-3 rounded-xl font-black text-sm">
                    Acknowledge
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {scheduleMessage ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${scheduleTone === "success" ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary" : scheduleTone === "danger" ? "border-brand-danger/20 bg-brand-danger/10 text-brand-danger" : "border-slate-200 bg-white text-slate-500"}`}>
            {scheduleMessage}
          </div>
        ) : null}
      </main>

      <AnimatePresence>
        {isCreating ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-ink/40 backdrop-blur-sm p-4" onClick={() => setIsCreating(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl p-10 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-3xl font-black tracking-tight mb-2">{currentSchedule ? "Edit Automation" : "New Automation"}</h2>
              <p className="text-slate-500 font-bold mb-8">{currentSchedule ? "Update your testing trigger settings." : "Set up a recurring or event-based test suite."}</p>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Automation Name</label>
                  <input type="text" value={formData.title} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Monthly Full Audit" className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Trigger Type</label>
                    <select value={formData.triggerType} onChange={(event) => setFormData((current) => ({ ...current, triggerType: event.target.value as "Scheduled" | "GitHub Push" }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold bg-white">
                      <option>Scheduled</option>
                      <option>GitHub Push</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Frequency</label>
                    <select value={formData.frequency} onChange={(event) => setFormData((current) => ({ ...current, frequency: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold bg-white">
                      <option>Daily</option>
                      <option>Weekly</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Agent Selection</label>
                  <select value={formData.personaId} onChange={(event) => setFormData((current) => ({ ...current, personaId: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold bg-white">
                    <option value="all">Mix of Agents (Recommended)</option>
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>{persona.name} ({persona.trait})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Test Target</label>
                  <select value={formData.target} onChange={(event) => setFormData((current) => ({ ...current, target: event.target.value }))} className="w-full p-4 rounded-xl border-2 border-slate-100 focus:border-brand-accent outline-none font-bold bg-white">
                    <option>Full Site</option>
                    <option>Checkout Flow</option>
                    <option>Onboarding</option>
                    <option>Pricing Page</option>
                  </select>
                </div>
                {localMessage ? <div className="rounded-xl border border-brand-warning/20 bg-brand-warning/10 px-4 py-3 text-sm font-bold text-brand-warning">{localMessage}</div> : null}
                <button onClick={() => handleSave().catch(() => null)} disabled={scheduleSaving} className="w-full bg-brand-ink text-white py-4 rounded-2xl font-black text-lg hover:bg-brand-accent transition-all shadow-lg mt-4 disabled:opacity-50">
                  {scheduleSaving ? "Saving..." : currentSchedule ? "Save Changes" : "Create Automation"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StarterBrandSettingsPage({
  activeBrand,
  currentProject,
  repoConnection,
  repoLoading,
  repoError,
  mcpTokens,
  mcpTokensLoading,
  mcpTokenError,
  createdMcpToken,
  onBack,
  onSaveBrandSettings,
  onConnectGitHub,
  onRefreshGitHubConnection,
  onSaveProjectRepos,
  onDisconnectGitHub,
  onCreateMcpToken,
  onRevokeMcpToken,
  onClearCreatedMcpToken
}: {
  activeBrand: StarterBrand | null;
  currentProject: ProjectSummary | null;
  repoConnection: RepoConnection | null;
  repoLoading: boolean;
  repoError: string;
  mcpTokens: McpTokenSummary[];
  mcpTokensLoading: boolean;
  mcpTokenError: string;
  createdMcpToken: string;
  onBack: () => void;
  onSaveBrandSettings: (input: { brandName: string; website: string; teamMembers: string[] }) => Promise<ProjectSummary>;
  onConnectGitHub: () => Promise<void>;
  onRefreshGitHubConnection: () => void;
  onSaveProjectRepos: (input: { primaryRepoFullName: string; associatedRepoFullNames: string[] }) => Promise<void>;
  onDisconnectGitHub: () => Promise<void>;
  onCreateMcpToken: (name: string) => Promise<{ token: string; item: McpTokenSummary }>;
  onRevokeMcpToken: (tokenId: string) => Promise<void>;
  onClearCreatedMcpToken: () => void;
}) {
  const savedBrandName = String(currentProject?.brand_name || activeBrand?.name || "");
  const savedWebsite = String(currentProject?.target_url || activeBrand?.website || "");
  const savedTeamMembers = readProjectTeamMembers(currentProject);
  const [brandNameDraft, setBrandNameDraft] = useState(savedBrandName);
  const [websiteDraft, setWebsiteDraft] = useState(savedWebsite);
  const [teamMembersDraft, setTeamMembersDraft] = useState<string[]>(savedTeamMembers);
  const [teamMemberInput, setTeamMemberInput] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsTone, setSettingsTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [repoPrimaryDraft, setRepoPrimaryDraft] = useState("");
  const [repoAssociatedDraft, setRepoAssociatedDraft] = useState<string[]>([]);
  const [mainRepoQuery, setMainRepoQuery] = useState("");
  const [supportRepoQuery, setSupportRepoQuery] = useState("");
  const [mainRepoPickerOpen, setMainRepoPickerOpen] = useState(false);
  const [supportRepoPickerOpen, setSupportRepoPickerOpen] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoSaveMessage, setRepoSaveMessage] = useState("");
  const [repoSaveTone, setRepoSaveTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [mcpTokenName, setMcpTokenName] = useState("Codex MCP key");
  const [mcpTokenSaving, setMcpTokenSaving] = useState(false);
  const [mcpTokenMessage, setMcpTokenMessage] = useState("");
  const [mcpTokenTone, setMcpTokenTone] = useState<"neutral" | "success" | "danger">("neutral");
  const [mcpCopyFeedback, setMcpCopyFeedback] = useState("");
  const [revokingMcpTokenId, setRevokingMcpTokenId] = useState("");
  const availableRepos = Array.isArray(repoConnection?.repositories) ? repoConnection.repositories.filter((repo) => repo.full_name) : [];
  const repoPendingInstall = repoConnection?.connection_status === "pending_install";
  const githubInstalled = Boolean(repoConnection?.installation_id) || repoPendingInstall;
  const repoConnected = repoConnection?.connection_status === "connected";
  const repoNeedsSelection = repoConnection?.connection_status === "awaiting_repo_selection";
  const canChooseProjectRepos = repoConnected || repoNeedsSelection || availableRepos.length > 0;
  const savedAssociatedRepos = Array.isArray(repoConnection?.associated_repo_full_names)
    ? repoConnection.associated_repo_full_names.filter((repo) => repo && repo !== repoConnection?.selected_repo_full_name)
    : [];
  const remainingRepoOptions = availableRepos.filter((repo) => {
    const fullName = String(repo.full_name || "");
    return fullName && fullName !== repoPrimaryDraft && !repoAssociatedDraft.includes(fullName);
  });
  const repoSelectionDirty =
    repoPrimaryDraft !== String(repoConnection?.selected_repo_full_name || "") ||
    JSON.stringify([...repoAssociatedDraft].sort()) !== JSON.stringify([...savedAssociatedRepos].sort());
  const settingsDirty =
    brandNameDraft.trim() !== savedBrandName.trim() ||
    websiteDraft.trim() !== savedWebsite.trim() ||
    JSON.stringify([...teamMembersDraft].sort()) !== JSON.stringify([...savedTeamMembers].sort());
  const mainRepoSearchTerm = mainRepoQuery.trim().toLowerCase();
  const supportRepoSearchTerm = supportRepoQuery.trim().toLowerCase();
  const mainRepoResults = availableRepos
    .filter((repo) => {
      const fullName = String(repo.full_name || "");
      if (!fullName) {
        return false;
      }
      return !mainRepoSearchTerm || fullName.toLowerCase().includes(mainRepoSearchTerm);
    })
    .slice(0, 8);
  const supportRepoResults = availableRepos
    .filter((repo) => {
      const fullName = String(repo.full_name || "");
      if (!fullName || fullName === repoPrimaryDraft || repoAssociatedDraft.includes(fullName)) {
        return false;
      }
      return !supportRepoSearchTerm || fullName.toLowerCase().includes(supportRepoSearchTerm);
    })
    .slice(0, 10);
  const linkedRepoCount = (repoPrimaryDraft ? 1 : 0) + repoAssociatedDraft.length;
  const repoStatusTone = repoConnected ? "success" : repoNeedsSelection ? "warning" : repoPendingInstall ? "neutral" : "neutral";
  const repoStatusLabel = repoConnected ? "Connected" : repoNeedsSelection ? "Pick repos" : repoPendingInstall ? "Waiting for GitHub" : "Not connected";
  const activeMcpTokens = mcpTokens.filter((token) => token.active !== false);
  const visibleMcpTokens = mcpTokens.slice(0, 8);
  const mcpSnippetToken = createdMcpToken || "<your mcp token>";
  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        [MCP_CLIENT_SERVER_NAME]: {
          url: HOSTED_MCP_URL,
          headers: {
            Authorization: `Bearer ${mcpSnippetToken}`
          }
        }
      }
    },
    null,
    2
  );

  useEffect(() => {
    setBrandNameDraft(savedBrandName);
    setWebsiteDraft(savedWebsite);
    setTeamMembersDraft(savedTeamMembers);
    setTeamMemberInput("");
    setSettingsMessage("");
    setSettingsTone("neutral");
  }, [savedBrandName, savedWebsite, currentProject?.brand_key, JSON.stringify(savedTeamMembers)]);

  useEffect(() => {
    const primaryRepoFullName = String(repoConnection?.selected_repo_full_name || "");
    const associatedRepoFullNames = Array.isArray(repoConnection?.associated_repo_full_names)
      ? repoConnection.associated_repo_full_names.filter((repo) => repo && repo !== primaryRepoFullName)
      : [];
    setRepoPrimaryDraft(primaryRepoFullName);
    setMainRepoQuery(primaryRepoFullName);
    setRepoAssociatedDraft(associatedRepoFullNames);
    setSupportRepoQuery("");
    setMainRepoPickerOpen(false);
    setSupportRepoPickerOpen(false);
    setRepoSaveMessage("");
    setRepoSaveTone("neutral");
  }, [repoConnection?.associated_repo_full_names, repoConnection?.selected_repo_full_name]);

  function handleAddTeamMember() {
    const nextEmail = teamMemberInput.trim().toLowerCase();
    if (!nextEmail) {
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
      setSettingsMessage("Add a valid teammate email.");
      setSettingsTone("danger");
      return;
    }
    if (teamMembersDraft.includes(nextEmail)) {
      setTeamMemberInput("");
      return;
    }
    setTeamMembersDraft((current) => [...current, nextEmail]);
    setTeamMemberInput("");
    setSettingsMessage("");
    setSettingsTone("neutral");
  }

  async function handleSaveSettings() {
    if (!brandNameDraft.trim()) {
      setSettingsMessage("Brand name is required.");
      setSettingsTone("danger");
      return;
    }
    if (websiteDraft.trim() && !normalizeUrlInput(websiteDraft)) {
      setSettingsMessage("Add a valid website URL.");
      setSettingsTone("danger");
      return;
    }

    setSettingsSaving(true);
    setSettingsMessage("");
    try {
      await onSaveBrandSettings({
        brandName: brandNameDraft.trim(),
        website: websiteDraft.trim(),
        teamMembers: teamMembersDraft
      });
      setSettingsMessage("Brand settings saved.");
      setSettingsTone("success");
    } catch (caught) {
      setSettingsMessage(caught instanceof Error ? caught.message : "Could not save brand settings.");
      setSettingsTone("danger");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSaveRepos() {
    if (!repoPrimaryDraft) {
      setRepoSaveMessage("Pick a primary repo first.");
      setRepoSaveTone("danger");
      return;
    }
    setRepoSaving(true);
    setRepoSaveMessage("");
    try {
      await onSaveProjectRepos({
        primaryRepoFullName: repoPrimaryDraft,
        associatedRepoFullNames: [repoPrimaryDraft, ...repoAssociatedDraft]
      });
      setRepoSaveMessage("Project repos saved.");
      setRepoSaveTone("success");
    } catch (caught) {
      setRepoSaveMessage(caught instanceof Error ? caught.message : "Could not save project repos.");
      setRepoSaveTone("danger");
    } finally {
      setRepoSaving(false);
    }
  }

  async function handleDisconnectRepos() {
    if (typeof window !== "undefined" && !window.confirm("Disconnect GitHub from this brand?")) {
      return;
    }
    setRepoSaving(true);
    setRepoSaveMessage("");
    try {
      await onDisconnectGitHub();
      setRepoSaveMessage("GitHub disconnected for this brand.");
      setRepoSaveTone("success");
    } catch (caught) {
      setRepoSaveMessage(caught instanceof Error ? caught.message : "Could not disconnect GitHub.");
      setRepoSaveTone("danger");
    } finally {
      setRepoSaving(false);
    }
  }

  async function handleCreateAgentKey() {
    if (mcpTokenSaving) {
      return;
    }
    setMcpTokenSaving(true);
    setMcpTokenMessage("");
    try {
      await onCreateMcpToken(mcpTokenName.trim() || "Coding agent MCP key");
      setMcpTokenMessage("Token created. Copy it now; the full value will not be shown again.");
      setMcpTokenTone("success");
    } catch (caught) {
      setMcpTokenMessage(caught instanceof Error ? caught.message : "Could not create MCP token.");
      setMcpTokenTone("danger");
    } finally {
      setMcpTokenSaving(false);
    }
  }

  async function handleCopyMcpValue(value: string, label: string) {
    try {
      await copyText(value);
      setMcpCopyFeedback(label);
      window.setTimeout(() => setMcpCopyFeedback(""), 1400);
    } catch {
      setMcpCopyFeedback("Copy failed");
      window.setTimeout(() => setMcpCopyFeedback(""), 1800);
    }
  }

  async function handleRevokeAgentKey(tokenId: string) {
    if (!tokenId || revokingMcpTokenId) {
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("Revoke this MCP key? Agents using it will stop working.")) {
      return;
    }
    setRevokingMcpTokenId(tokenId);
    setMcpTokenMessage("");
    try {
      await onRevokeMcpToken(tokenId);
      setMcpTokenMessage("Token revoked.");
      setMcpTokenTone("success");
    } catch (caught) {
      setMcpTokenMessage(caught instanceof Error ? caught.message : "Could not revoke MCP token.");
      setMcpTokenTone("danger");
    } finally {
      setRevokingMcpTokenId("");
    }
  }

  if (!activeBrand && !currentProject) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-6 sticky top-0 z-50">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">Brand Settings</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Choose a brand first</p>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="dash-card max-w-xl rounded-[2rem] border border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Settings2 className="h-8 w-8" />
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight text-brand-ink">No brand selected</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Pick a brand from the switcher first, then open Settings to manage its name, repos, and team.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">Brand Settings</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Edit brand details and connected codebases</p>
          </div>
        </div>
        <Button tone="primary" disabled={settingsSaving || !settingsDirty} onClick={() => handleSaveSettings().catch(() => null)} className="px-5 py-2.5 rounded-xl font-black">
          {settingsSaving ? "Saving..." : "Save settings"}
        </Button>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-8 md:p-12 space-y-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <section className="dash-card rounded-[2rem] border border-slate-200 bg-white p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Settings2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-brand-ink">Brand profile</h2>
                    <p className="mt-1 text-sm text-slate-500">Update the project name, site, and internal team list.</p>
                  </div>
                </div>
              </div>
              {savedWebsite ? (
                <a
                  href={savedWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-brand-ink transition-all hover:border-brand-accent"
                >
                  Visit site
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <FieldLabel>Brand name</FieldLabel>
                <TextInput value={brandNameDraft} onChange={(event) => setBrandNameDraft(event.target.value)} placeholder="Acme" />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Website URL</FieldLabel>
                <TextInput value={websiteDraft} onChange={(event) => setWebsiteDraft(event.target.value)} placeholder="https://acme.com" />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Brand key</FieldLabel>
                <div className="flex h-11 items-center rounded-lg border border-brand-line bg-brand-panel px-3 text-sm font-semibold text-slate-400">
                  {currentProject?.brand_key || activeBrand?.id || ""}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black tracking-tight text-brand-ink">Team members</div>
                  <div className="text-sm text-slate-500">Add the people tied to this brand so ownership stays obvious.</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {teamMembersDraft.length ? (
                  teamMembersDraft.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => setTeamMembersDraft((current) => current.filter((member) => member !== email))}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:border-brand-accent"
                    >
                      {email}
                      <Plus className="h-3.5 w-3.5 rotate-45 text-slate-400" />
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
                    No teammates added yet.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <TextInput
                  value={teamMemberInput}
                  onChange={(event) => setTeamMemberInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTeamMember();
                    }
                  }}
                  placeholder="name@company.com"
                />
                <Button type="button" onClick={handleAddTeamMember} disabled={!teamMemberInput.trim()} className="rounded-xl px-5 py-2.5 font-black">
                  Add teammate
                </Button>
              </div>
            </div>

            {settingsMessage ? (
              <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${settingsTone === "success" ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary" : settingsTone === "danger" ? "border-brand-danger/20 bg-brand-danger/10 text-brand-danger" : "border-slate-200 bg-white text-slate-500"}`}>
                {settingsMessage}
              </div>
            ) : null}
          </section>

          <section className="dash-card rounded-[2rem] border border-slate-200 bg-white p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-brand-ink">Current setup</h2>
                <p className="mt-1 text-sm text-slate-500">Quick status for this brand.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Website</div>
                <div className="mt-2 text-sm font-bold text-brand-ink">{savedWebsite || "No URL saved yet."}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">GitHub</div>
                <div className="mt-2 text-sm font-bold text-brand-ink">
                  {repoConnected
                    ? repoConnection?.selected_repo_full_name || "Connected"
                    : repoNeedsSelection
                      ? "Connected, repo still needs selection"
                      : repoPendingInstall
                        ? "GitHub install started. Refresh to finish linking this brand."
                        : githubInstalled
                          ? "Connected"
                          : "Not connected"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Team</div>
                <div className="mt-2 text-sm font-bold text-brand-ink">{teamMembersDraft.length ? `${teamMembersDraft.length} teammate${teamMembersDraft.length === 1 ? "" : "s"}` : "No teammates added"}</div>
              </div>
            </div>
          </section>
        </div>

        <section className="dash-card rounded-[2rem] border border-slate-200 bg-white p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl">
                <Code className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black tracking-tight text-brand-ink">Coding agents</h2>
                  <StatusPill label={`${activeMcpTokens.length} active`} tone={activeMcpTokens.length ? "success" : "neutral"} />
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
                  Give Codex, Claude Desktop, Cursor, or another MCP client a revocable key for hosted QA runs.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hosted MCP URL</div>
              <div className="mt-1 max-w-xs truncate font-mono text-xs font-bold text-brand-ink">{HOSTED_MCP_URL}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
              <div className="text-base font-black tracking-tight text-brand-ink">Create an MCP key</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                The full key is shown once. Store it in the coding agent, then keep only the prefix here.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <TextInput
                  value={mcpTokenName}
                  onChange={(event) => setMcpTokenName(event.target.value)}
                  placeholder="Codex MCP key"
                />
                <Button
                  type="button"
                  tone="primary"
                  onClick={() => handleCreateAgentKey().catch(() => null)}
                  disabled={mcpTokenSaving || mcpTokensLoading}
                  className="rounded-xl px-5 py-2.5 font-black"
                >
                  {mcpTokenSaving ? "Creating..." : "Create key"}
                </Button>
              </div>

              {createdMcpToken ? (
                <div className="mt-5 rounded-2xl border border-brand-secondary/20 bg-brand-secondary/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-black text-brand-ink">Copy this key now</div>
                      <div className="mt-1 text-xs font-bold text-brand-secondary">It will not be shown again after you clear it.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleCopyMcpValue(createdMcpToken, "Token copied").catch(() => null)}
                        className="rounded-xl px-4 py-2 font-black"
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                      <Button type="button" tone="secondary" onClick={onClearCreatedMcpToken} className="rounded-xl px-4 py-2 font-black">
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 break-all rounded-xl border border-brand-secondary/20 bg-white px-3 py-3 font-mono text-xs font-bold text-brand-ink">
                    {createdMcpToken}
                  </div>
                </div>
              ) : null}

              {(mcpTokenMessage || mcpTokenError) ? (
                <div className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${mcpTokenTone === "success" && !mcpTokenError ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary" : "border-brand-danger/20 bg-brand-danger/10 text-brand-danger"}`}>
                  {mcpTokenError || mcpTokenMessage}
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-base font-black tracking-tight text-brand-ink">Agent config</div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Paste this into an MCP client that supports Streamable HTTP.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => handleCopyMcpValue(mcpConfigSnippet, "Config copied").catch(() => null)}
                  className="rounded-xl px-4 py-2 font-black"
                >
                  <Copy className="h-4 w-4" />
                  Copy config
                </Button>
              </div>
              <pre className="mt-4 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-brand-ink">
                <code>{mcpConfigSnippet}</code>
              </pre>
              {mcpCopyFeedback ? <div className="mt-3 text-xs font-black uppercase tracking-widest text-brand-secondary">{mcpCopyFeedback}</div> : null}
            </div>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-black tracking-tight text-brand-ink">Keys</div>
                <p className="mt-1 text-sm text-slate-500">Revoke any key that leaves your team or an agent you no longer use.</p>
              </div>
              {mcpTokensLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
            </div>

            <div className="mt-4 space-y-2">
              {visibleMcpTokens.length ? (
                visibleMcpTokens.map((token) => (
                  <div key={token.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-black text-brand-ink">{token.name || "MCP key"}</div>
                        <StatusPill label={token.active === false ? "Revoked" : "Active"} tone={token.active === false ? "danger" : "success"} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                        <span className="font-mono">{token.token_prefix || "mcp_"}</span>
                        {token.created_at ? <span>Created {formatRelativeTime(token.created_at)}</span> : null}
                        {token.last_used_at ? <span>Last used {formatRelativeTime(token.last_used_at)}</span> : <span>Never used</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      tone="danger"
                      onClick={() => handleRevokeAgentKey(token.id).catch(() => null)}
                      disabled={token.active === false || revokingMcpTokenId === token.id}
                      className="rounded-xl px-4 py-2 font-black"
                    >
                      {revokingMcpTokenId === token.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Revoke
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
                  No MCP keys yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="dash-card rounded-[2rem] border border-slate-200 bg-white p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl">
                <GitBranch className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black tracking-tight text-brand-ink">Connected repos</h2>
                  <StatusPill label={repoStatusLabel} tone={repoStatusTone} />
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
                  Pick one main repo for this brand. Add supporting repos only if the product spans more than one codebase.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <Button
                type="button"
                onClick={() => {
                  if (repoPendingInstall) {
                    onRefreshGitHubConnection();
                    return;
                  }
                  onConnectGitHub().catch(() => null);
                }}
                disabled={repoLoading}
                className="rounded-xl px-5 py-2.5 font-black"
              >
                {repoLoading ? "Loading..." : repoPendingInstall ? "Refresh GitHub" : githubInstalled ? "Reconnect GitHub" : "Connect GitHub"}
              </Button>
              {githubInstalled && !repoPendingInstall ? (
                <details className="group">
                  <summary className="cursor-pointer list-none text-right text-xs font-black uppercase tracking-widest text-slate-400 transition group-open:text-slate-500">
                    More options
                  </summary>
                  <div className="mt-2 flex justify-end">
                    <Button type="button" tone="danger" onClick={() => handleDisconnectRepos().catch(() => null)} disabled={repoSaving || repoLoading} className="rounded-xl px-4 py-2 font-black">
                      Disconnect GitHub
                    </Button>
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          {repoError ? <div className="mt-6 rounded-xl border border-brand-danger/20 bg-brand-danger/10 px-4 py-3 text-sm font-bold text-brand-danger">{repoError}</div> : null}

          {repoPendingInstall ? (
            <div className="mt-6 rounded-2xl border border-brand-accent/20 bg-brand-accent/5 p-4">
              <div className="text-sm font-black tracking-tight text-brand-ink">
                GitHub is already installed. This brand still needs to attach to it.
              </div>
              <p className="mt-1 text-sm leading-6 text-brand-muted">
                GitHub sometimes leaves the popup on the installation settings page instead of sending us back. Use Refresh GitHub to reuse the existing installation for this brand, then pick the repos that belong to it.
              </p>
            </div>
          ) : null}

          {repoNeedsSelection ? (
            <div className="mt-6 rounded-2xl border border-brand-warning/20 bg-brand-warning/10 p-4">
              <div className="text-sm font-black tracking-tight text-brand-ink">
                Choose the repos for {activeBrand?.name || "this brand"}
              </div>
              <p className="mt-1 text-sm leading-6 text-brand-muted">
                GitHub is connected. Start with the main repo, then add supporting repos only if you need them.
              </p>
            </div>
          ) : null}

          {canChooseProjectRepos ? (
            <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-base font-black tracking-tight text-brand-ink">Choose repos</div>
                  <p className="mt-1 text-sm text-slate-500">
                    The main repo is required. Supporting repos are optional.
                  </p>
                </div>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {linkedRepoCount} linked
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Main repo</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <TextInput
                    value={mainRepoQuery}
                    onFocus={() => setMainRepoPickerOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setMainRepoPickerOpen(false), 120);
                    }}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      setMainRepoQuery(nextQuery);
                      if (repoPrimaryDraft && nextQuery.trim().toLowerCase() !== repoPrimaryDraft.toLowerCase()) {
                        setRepoPrimaryDraft("");
                      }
                    }}
                    placeholder="Type to search repos"
                    className="pl-10 pr-10"
                  />
                  {mainRepoQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMainRepoQuery("");
                        setRepoPrimaryDraft("");
                        setMainRepoPickerOpen(true);
                      }}
                      className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-brand-ink"
                    >
                      <Plus className="h-3.5 w-3.5 rotate-45" />
                    </button>
                  ) : null}
                </div>

                {mainRepoPickerOpen ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    {mainRepoResults.length ? (
                      <div className="max-h-56 overflow-y-auto">
                        {mainRepoResults.map((repo) => {
                          const fullName = String(repo.full_name || "");
                          const selected = fullName === repoPrimaryDraft;
                          return (
                            <button
                              key={fullName || repo.id}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setRepoPrimaryDraft(fullName);
                                setMainRepoQuery(fullName);
                                setRepoAssociatedDraft((current) => current.filter((repoName) => repoName !== fullName));
                                setMainRepoPickerOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                                selected ? "bg-brand-primary/10 text-brand-ink" : "text-brand-ink hover:bg-white"
                              }`}
                            >
                              <span className="truncate">{fullName}</span>
                              {selected ? <Check className="h-4 w-4 shrink-0 text-brand-primary" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-400">No repos match that search.</div>
                    )}
                  </div>
                ) : null}

                <div className="mt-2 text-sm text-slate-500">
                  {repoPrimaryDraft ? `Selected main repo: ${repoPrimaryDraft}` : "Type a few letters, then click the repo you want."}
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Supporting repos</label>
                    {repoAssociatedDraft.length ? (
                      <button
                        type="button"
                        onClick={() => setRepoAssociatedDraft([])}
                        className="text-xs font-bold text-slate-400 transition hover:text-brand-ink"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    Add these only if this product depends on multiple repos.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {repoAssociatedDraft.length ? (
                      repoAssociatedDraft.map((repo) => (
                        <button
                          key={repo}
                          type="button"
                          onClick={() => setRepoAssociatedDraft((current) => current.filter((item) => item !== repo))}
                          className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-shell px-3 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand-accent"
                        >
                          {repo}
                          <Plus className="h-3.5 w-3.5 rotate-45 text-slate-400" />
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
                        No supporting repos selected.
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <TextInput
                        value={supportRepoQuery}
                        onFocus={() => {
                          if (repoPrimaryDraft) {
                            setSupportRepoPickerOpen(true);
                          }
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setSupportRepoPickerOpen(false), 120);
                        }}
                        onChange={(event) => {
                          setSupportRepoQuery(event.target.value);
                          if (repoPrimaryDraft) {
                            setSupportRepoPickerOpen(true);
                          }
                        }}
                        placeholder={repoPrimaryDraft ? "Type to search supporting repos" : "Choose the main repo first"}
                        disabled={!repoPrimaryDraft}
                        className="pl-10"
                      />
                    </div>

                    {supportRepoPickerOpen && repoPrimaryDraft ? (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        {supportRepoResults.length ? (
                          <div className="max-h-64 overflow-y-auto">
                            {supportRepoResults.map((repo) => {
                              const fullName = String(repo.full_name || "");
                              return (
                                <button
                                  key={fullName || repo.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setRepoAssociatedDraft((current) => [...current, fullName]);
                                    setSupportRepoQuery("");
                                    setSupportRepoPickerOpen(true);
                                  }}
                                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-ink transition hover:bg-white"
                                >
                                  <span className="truncate">{fullName}</span>
                                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Add</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-400">
                            {supportRepoSearchTerm ? "No repos match that search." : "No other repos are available for this GitHub install."}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-slate-500">
                    {repoPrimaryDraft
                      ? `Diagnosis will search ${repoPrimaryDraft} first.`
                      : "Pick the main repo first."}
                  </div>
                  <Button
                    type="button"
                    tone="primary"
                    onClick={() => handleSaveRepos().catch(() => null)}
                    disabled={repoSaving || !repoPrimaryDraft || !repoSelectionDirty}
                    className="w-full rounded-xl px-5 py-2.5 font-black md:w-auto"
                  >
                    {repoSaving ? "Saving..." : "Save repos"}
                  </Button>
                </div>

                {repoSaveMessage ? (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${repoSaveTone === "success" ? "border-brand-secondary/20 bg-brand-secondary/10 text-brand-secondary" : repoSaveTone === "danger" ? "border-brand-danger/20 bg-brand-danger/10 text-brand-danger" : "border-slate-200 bg-white text-slate-500"}`}>
                    {repoSaveMessage}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-7 text-slate-500">
              {repoPendingInstall
                ? "GitHub is installed but this brand has not finished syncing yet. Press Refresh GitHub, then choose which repos belong to this brand."
                : "Connect the GitHub App first, then choose which repos belong to this brand."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StarterHelpCenter({ onBack }: { onBack: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const categories = [
    {
      title: "Getting Started",
      icon: <Play className="w-6 h-6" />,
      articles: ["How to connect your first brand", "Understanding Agent Personas", "Your first test run", "Interpreting Friction Points"]
    },
    {
      title: "Agent Training",
      icon: <Users className="w-6 h-6" />,
      articles: ["Creating custom personas", "Uploading customer datasets", "Training on support tickets", "Fine-tuning agent behaviors"]
    },
    {
      title: "Integrations",
      icon: <GitBranch className="w-6 h-6" />,
      articles: ["Connecting GitHub for Fix Diagnosis", "Setting up Slack notifications", "Jira & Linear workflows", "API & Webhook access"]
    },
    {
      title: "Billing & Plans",
      icon: <Shield className="w-6 h-6" />,
      articles: ["Understanding Agent Hours", "Managing your subscription", "Team seats & permissions", "Usage limits & quotas"]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all group">
            <ArrowRight className="w-5 h-5 rotate-180 text-slate-400 group-hover:text-brand-ink" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Help Center</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Knowledge Base & Support</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="handcrafted-card px-6 py-2.5 rounded-xl font-black text-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" />
            Contact Support
          </button>
          <button className="bg-brand-ink text-white px-8 py-2.5 rounded-xl font-black text-sm hover:bg-brand-accent transition-all shadow-sm">
            Join Discord
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-8 md:p-12 space-y-16">
        <section className="text-center space-y-8">
          <h2 className="text-5xl font-black tracking-tighter leading-none">How can we help?</h2>
          <div className="max-w-2xl mx-auto relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <input type="text" placeholder="Search for articles, guides, or features..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full bg-white border-4 border-white shadow-2xl rounded-[2rem] py-6 pl-16 pr-8 text-lg font-bold outline-none focus:border-brand-accent/20 transition-all" />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Popular:</span>
            {["GitHub Setup", "Custom Personas", "Fix Diagnosis", "Billing"].map((tag) => (
              <button key={tag} className="text-xs font-black text-brand-accent hover:underline">{tag}</button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {categories.map((category, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="dash-card p-10 bg-white hover:border-brand-accent transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-brand-ink mb-8 group-hover:bg-brand-accent group-hover:text-white transition-all shadow-sm">{category.icon}</div>
              <h3 className="text-2xl font-black mb-6 tracking-tight">{category.title}</h3>
              <ul className="space-y-4">
                {category.articles.map((article) => (
                  <li key={article}>
                    <button className="flex items-center justify-between w-full text-left group/item">
                      <span className="text-slate-500 font-bold hover:text-brand-ink transition-colors">{article}</span>
                      <ArrowRight className="w-4 h-4 text-slate-200 group-hover/item:text-brand-accent transition-all -translate-x-2 opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
              <button className="mt-10 text-sm font-black text-brand-accent hover:underline flex items-center gap-2">
                View all articles
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </section>

        <section className="dash-card p-12 bg-brand-ink text-white text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/20 blur-[100px] rounded-full -mr-32 -mt-32" />
          <h3 className="text-3xl font-black tracking-tight relative z-10">Still need help?</h3>
          <p className="text-white/60 font-medium text-lg max-w-xl mx-auto relative z-10">Our community of developers and product managers is active on Discord. Get real-time help from the team and other users.</p>
          <div className="flex justify-center gap-4 relative z-10">
            <button className="bg-white text-brand-ink px-10 py-4 rounded-2xl font-black text-sm hover:bg-brand-accent hover:text-white transition-all shadow-xl">Talk to a Human</button>
            <button className="bg-white/10 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-white/20 transition-all border border-white/10">Visit Community</button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
