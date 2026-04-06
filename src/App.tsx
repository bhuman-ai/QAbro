import { cloneElement, startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
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
  MousePointer2,
  Play,
  Plus,
  Search,
  Settings,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Quote,
  TrendingUp,
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
  normalizeEntryPath,
  normalizeBrandKey,
  normalizePathname
} from "@/lib/format";
import type {
  AlertItem,
  AuthUser,
  LaunchDraft,
  ProjectSummary,
  QaReport,
  RepoConnection,
  RepoRouteSuggestion,
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

const STARTER_PERSONAS: StarterPersona[] = [
  {
    id: "sarah",
    name: "Sarah",
    role: "31yr old Mom",
    trait: "Distracted & Busy",
    quote: "I'm usually holding a toddler while trying to buy groceries. If I can't do it with one thumb, I'm out.",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
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
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus",
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
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Linda",
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
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo",
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

function getStarterPersonaIndex(seed?: string | null) {
  const value = String(seed || "").toLowerCase();
  if (!value) {
    return 0;
  }
  const matched = STARTER_PERSONAS.findIndex((persona) => value.includes(persona.name.toLowerCase()));
  if (matched >= 0) {
    return matched;
  }
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % STARTER_PERSONAS.length;
  }
  return Math.abs(hash) % STARTER_PERSONAS.length;
}

function getStarterPersona(seed?: string | null) {
  return STARTER_PERSONAS[getStarterPersonaIndex(seed)];
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
      qaMode === "controlled_ux"
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
          ? "bg-transparent text-brand-ink hover:bg-white/5"
          : "bg-white/5 text-brand-ink hover:bg-white/8";

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
      className={`h-11 w-full rounded-lg border border-brand-line bg-brand-panel px-3 text-sm text-brand-ink outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 ${props.className || ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[108px] w-full rounded-lg border border-brand-line bg-brand-panel px-3 py-2.5 text-sm text-brand-ink outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 ${props.className || ""}`}
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
              : "border-brand-line bg-white/5 text-brand-muted"
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
  onOpenWorkspace
}: {
  authorized: boolean;
  onOpenWorkspace: () => void;
}) {
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<any | null>(null);

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
          <a href="#how" className="hover:text-brand-accent transition-colors">How it works</a>
          <button className="hover:text-brand-accent transition-colors" onClick={onOpenWorkspace}>Help Center</button>
          <button
            onClick={onOpenWorkspace}
            className="bg-brand-ink text-white px-6 py-2 rounded-full hover:bg-brand-accent transition-all"
          >
            {authorized ? "Dashboard" : "Login"}
          </button>
        </nav>
      </header>

      <main>
        <section className="pt-16 pb-24 px-4 max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="organic-pill inline-block mb-6 bg-brand-secondary/10 text-brand-ink border-brand-ink">
              ✨ User Testing, but 100x faster
            </div>

            <div className="flex items-center justify-center -space-x-3 mb-8">
              {STARTER_PERSONAS.map((persona, index) => (
                <motion.div
                  key={persona.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className={`w-12 h-12 rounded-2xl border-4 border-white ${persona.color} overflow-hidden shadow-xl`}
                >
                  <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </motion.div>
              ))}
              <div className="w-12 h-12 rounded-2xl border-4 border-white bg-brand-ink flex items-center justify-center text-white font-black text-[10px] shadow-xl">
                +10
              </div>
            </div>

            <h1 className="text-[clamp(2.25rem,7vw,6rem)] font-black mb-8 leading-[0.9] max-w-6xl mx-auto tracking-tighter">
              <span className="block whitespace-nowrap">AI agents that break your app</span>
              <span className="block text-brand-accent">before users do.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
              We built AI agents with the personalities of your real users. They find the friction, the bugs, and the &quot;WTF&quot; moments before your real customers do.
            </p>

            <div className="max-w-3xl mx-auto">
              {!queued ? (
                <form
                  onSubmit={handleSubmit}
                  className="handcrafted-card p-2 flex flex-col md:flex-row gap-2 rounded-3xl"
                >
                  <div className="flex-1 flex items-center px-4 gap-3 border-b-2 md:border-b-0 md:border-r-2 border-brand-muted py-2">
                    <Globe className="text-slate-400 w-5 h-5" />
                    <div className="flex items-center w-full">
                      <span className="text-slate-300 font-bold mr-1">https://</span>
                      <input
                        type="text"
                        placeholder="yourwebsite.com"
                        required
                        className="w-full bg-transparent outline-none font-bold placeholder:text-slate-300"
                        value={site}
                        onChange={(event) => setSite(event.target.value.replace(/^https?:\/\//, ""))}
                      />
                    </div>
                  </div>
                  <div className="flex-1 flex items-center px-4 gap-3 py-2">
                    <Mail className="text-slate-400 w-5 h-5" />
                    <input
                      type="email"
                      placeholder="you@company.com"
                      required
                      className="w-full bg-transparent outline-none font-bold placeholder:text-slate-300"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <button
                    disabled={loading}
                    className="bg-brand-accent text-white px-8 py-4 rounded-2xl font-black text-lg hover:bg-brand-ink transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {loading ? "Generating..." : "Get my QA Report"}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </form>
              ) : (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="handcrafted-card p-8 rounded-3xl bg-brand-secondary/10 border-brand-secondary"
                >
                  <div className="w-16 h-16 bg-brand-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="text-white w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">Report incoming! 🚀</h3>
                  <p className="font-bold text-slate-600">
                    {queued.message || `Our agents are scouring ${site} right now. Check your inbox in 15 mins.`}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {queued.share_url ? (
                      <>
                        <a
                          href={queued.share_url}
                          className="bg-brand-ink text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-brand-accent transition-all"
                        >
                          Open shared report
                        </a>
                        <button
                          type="button"
                          onClick={() => copyText(queued.share_url || "")}
                          className="handcrafted-card px-6 py-3 rounded-2xl font-black text-sm"
                        >
                          Copy report link
                        </button>
                      </>
                    ) : null}
                  </div>
                </motion.div>
              )}

              {error ? <p className="mt-4 text-sm font-bold text-brand-danger">{error}</p> : null}

              <div className="mt-4 flex items-center justify-center gap-6 text-xs font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 15 Min Turnaround</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> No Credit Card</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3" /> 100% AI Powered</span>
              </div>
            </div>
          </motion.div>
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
            <div className="handcrafted-card p-10 rounded-[3rem] bg-brand-ink text-white">
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
                🤖 Built for AI-First Workflows
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
                    <p className="text-slate-500 font-medium">Connect directly to Claude Code or Cursor. Ask your AI to &quot;test this with Sarah&quot; and get a real report in seconds.</p>
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
                    <p><span className="text-white/40">$</span> cursor test --with-beforeusersdo</p>
                    <p className="text-white">🚀 Initializing Sarah (31yr old Mom)...</p>
                    <p className="text-white">🔍 Sarah is navigating to /checkout...</p>
                    <p className="text-brand-accent">⚠️ Sarah got stuck: &quot;The 'Buy' button is too small for one-thumb use.&quot;</p>
                    <p className="text-brand-secondary">✅ Fix suggested by AI Agent.</p>
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
          <div className="max-w-5xl mx-auto handcrafted-card !bg-brand-accent p-12 md:p-20 rounded-[4rem] text-center relative overflow-hidden">
            <div className="relative z-10">
              <div className="organic-pill inline-block mb-6 bg-white text-brand-ink border-brand-ink shadow-[2px_2px_0px_0px_rgba(18,18,18,1)]">
                🚀 Ready to ship with confidence?
              </div>
              <h2 className="text-4xl md:text-7xl font-black mb-8 leading-none text-white">
                Stop guessing. <br />
                <span className="text-brand-ink">Start knowing.</span>
              </h2>
              <p className="text-xl md:text-2xl font-bold text-white mb-12 max-w-xl mx-auto leading-relaxed">
                Sarah, Marcus, and Leo are standing by. Get your first comprehensive QA report in the next 15 minutes.
              </p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="bg-brand-ink text-white px-12 py-6 rounded-3xl font-black text-2xl hover:scale-105 transition-all shadow-[8px_8px_0px_0px_rgba(255,255,255,0.3)] flex items-center gap-3 mx-auto group"
              >
                Get my free report
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>

              <div className="mt-12 flex items-center justify-center gap-4">
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
                <span className="text-sm font-black uppercase tracking-widest text-brand-ink">The fleet is ready</span>
              </div>
            </div>

            <div className="absolute top-[-20px] right-[-20px] w-64 h-64 border-[12px] border-white/20 rounded-full"></div>
            <div className="absolute bottom-[-40px] left-[-40px] w-80 h-80 border-[12px] border-white/20 rounded-full"></div>
            <div className="absolute top-20 left-10 w-6 h-6 bg-brand-secondary rounded-full animate-bounce border-2 border-brand-ink"></div>
            <div className="absolute bottom-20 right-10 w-8 h-8 bg-brand-ink rounded-full opacity-20"></div>
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
            {isLogin ? "Our agents missed you." : "Start testing at the speed of light."}
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
            <div className="space-y-1">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">
                {isLogin ? "Password" : "Invite Code"}
              </label>
              <div className="handcrafted-card p-4 rounded-2xl flex items-center gap-3">
                <Shield className="text-slate-300 w-5 h-5" />
                <input
                  type={isLogin ? "password" : "text"}
                  placeholder={isLogin ? "••••••••" : DEFAULT_SIGNUP_INVITE_CODE}
                  className="bg-transparent outline-none w-full font-bold"
                  value={passwordOrInvite}
                  onChange={(event) => setPasswordOrInvite(event.target.value)}
                />
              </div>
            </div>

            <button className="w-full bg-brand-accent text-white p-5 rounded-2xl font-black text-xl hover:bg-brand-ink transition-all shadow-xl mt-4">
              {loading ? "Sending..." : isLogin ? "Login" : "Create Account"}
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
  const requestedRunId = String(params.get("run_id") || "").trim();
  const selectedBrandFilter = normalizeBrandKey(params.get("brand") || "");
  const currentPanel = String(params.get("panel") || (requestedRunId ? "report" : "overview")).toLowerCase();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [starterPersonas, setStarterPersonas] = useState<StarterPersona[]>(STARTER_PERSONAS);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [reports, setReports] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [selectedReport, setSelectedReport] = useState<QaReport | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
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
  const [repoRoutes, setRepoRoutes] = useState<RepoRouteSuggestion[]>([]);
  const [repoRoutesLoading, setRepoRoutesLoading] = useState(false);
  const [repoRoutesError, setRepoRoutesError] = useState("");
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

  const projectCatalog = buildProjectCatalog(projects, reports);
  const currentBrandKey =
    selectedBrandFilter ||
    normalizeBrandKey(
      selectedReport?.metadata?.brand_key as string ||
        selectedReport?.metadata?.brandKey as string ||
        reports.find((item) => item.run_id === requestedRunId)?.brand_key ||
        launchDraft.brandKey
    );

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
    starterBrands[0] ||
    (currentBrandKey
      ? {
          id: currentBrandKey,
          name: inferBrandName(currentBrandKey),
          website: selectedRun?.target_url || projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.target_url || `https://${currentBrandKey}.com`,
          githubConnected: Boolean(repoConnection?.selected_repo_full_name)
        }
      : null);
  const historyRows = buildStarterHistoryRows(sameBrandRuns.length ? sameBrandRuns : reports);
  const liveAgents = buildStarterLiveAgents(sameBrandRuns.length ? sameBrandRuns : reports);
  const frictionRows = buildStarterFrictionRows(selectedReport, sameBrandRuns.length ? sameBrandRuns : reports);
  const trendData = buildTrendData(sameBrandRuns.length ? sameBrandRuns : reports);
  const emptyWorkspace = !projectCatalog.length && !reports.length;
  const workspaceState = runsLoading ? "loading" : runsError ? "error" : "ready";
  const detailState = detailLoading ? "loading" : detailError ? "error" : selectedReport ? "ready" : "empty";

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
      setRunsError("");

      const results = await Promise.allSettled([
        apiFetch<{ items: ProjectSummary[] }>("/api/qa/projects"),
        apiFetch<{ items: RunSummary[] }>("/api/qa/reports", {
          params: { limit: 120, offset: 0 }
        }),
        apiFetch<{ items: ScheduleItem[] }>("/api/qa/schedules"),
        apiFetch<{ items: AlertItem[] }>("/api/qa/alerts", {
          params: { status: "open" }
        }),
        apiFetch<{ items: WorkerInfo[]; summary: WorkerSummary }>("/api/qa/workers")
      ]);

      if (cancelled) {
        return;
      }

      const [projectsResult, reportsResult, schedulesResult, alertsResult, workersResult] = results;

      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value.items || []);
      }
      if (reportsResult.status === "fulfilled") {
        setReports(reportsResult.value.items || []);
      } else {
        setRunsError(reportsResult.reason instanceof Error ? reportsResult.reason.message : "Could not load tests.");
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

      setRunsLoading(false);
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
  }, [authState.authorized, composeOpen, filteredRuns, isSharedView, navigate, reports, requestedRunId, route.pathname, route.search]);

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
            include_repositories: 1
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
  }, [authState.authorized, currentBrandKey, isSharedView]);

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
    if (!selectedRun && !currentBrandKey) {
      return;
    }
    setLaunchDraft((current) => {
      if (composeOpen && current.targetUrl) {
        return current;
      }
      const next = buildDraftFromRun(selectedRun, selectedReport, repoConnection);
      return {
        ...current,
        ...next,
        brandKey: next.brandKey || currentBrandKey || current.brandKey,
        brandName: next.brandName || inferBrandName(currentBrandKey || current.brandKey || "")
      };
    });
    if (currentSchedule) {
      setScheduleDraft({
        frequency_hours: currentSchedule.frequency_hours || 24,
        mission: currentSchedule.mission || DEFAULT_GOALS.join("\n"),
        persona: currentSchedule.persona || DEFAULT_PERSONA
      });
    }
  }, [composeOpen, currentBrandKey, currentSchedule, repoConnection, selectedReport, selectedRun]);

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
    const [projectsResponse, reportsResponse, schedulesResponse, alertsResponse, workersResponse] = await Promise.all([
      apiFetch<{ items: ProjectSummary[] }>("/api/qa/projects"),
      apiFetch<{ items: RunSummary[] }>("/api/qa/reports", { params: { limit: 120, offset: 0 } }),
      apiFetch<{ items: ScheduleItem[] }>("/api/qa/schedules"),
      apiFetch<{ items: AlertItem[] }>("/api/qa/alerts", { params: { status: "open" } }),
      apiFetch<{ items: WorkerInfo[]; summary: WorkerSummary }>("/api/qa/workers")
    ]);
    setProjects(projectsResponse.items || []);
    setReports(reportsResponse.items || []);
    setSchedules(schedulesResponse.items || []);
    setAlerts(alertsResponse.items || []);
    setWorkers(workersResponse.items || []);
    setWorkerSummary(workersResponse.summary || null);
  }

  async function handleStarterOnboardingComplete(input: { name: string; website: string; connectGitHub: boolean }) {
    const targetUrl = input.website.startsWith("http") ? input.website : `https://${input.website}`;
    const brandKey = deriveBrandKeyFromUrl(targetUrl) || normalizeBrandKey(input.name) || `brand-${Date.now()}`;

    await apiFetch("/api/qa/projects", {
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

    await refreshWorkspaceLists();

    const next = new URLSearchParams(route.search);
    next.set("brand", brandKey);
    next.set("panel", "overview");
    next.delete("run_id");
    next.delete("compose");
    navigate("/dashboard", next);

    if (input.connectGitHub) {
      window.setTimeout(() => {
        handleGitHubInstall().catch(() => null);
      }, 0);
    }
  }

  async function handleLaunchRun(payloadOverride?: Partial<LaunchDraft>, options: { retryOfRunId?: string | null } = {}) {
    const nextDraft = {
      ...launchDraft,
      ...(payloadOverride || {})
    };
    if (
      nextDraft.runMode === "controlled_ux" &&
      !String(nextDraft.userJob || "").trim() &&
      !normalizeEntryPath(nextDraft.entryPath) &&
      !String(nextDraft.routeHintsText || "").trim()
    ) {
      setLaunchMessage("Controlled UX mode needs a user job, an entry path, or at least one planned route.");
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
          await apiFetch("/api/qa/projects", {
            method: "POST",
            body: {
              brand_key: payload.metadata.brand_key,
              brand_name: payload.metadata.brand_name,
              target_url: payload.target_url,
              metadata: {
                source: "react_dashboard"
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
      nextParams.set("view", "live");
      nextParams.delete("compose");
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

  async function handleSaveSchedule() {
    if (!currentBrandKey) {
      setScheduleMessage("Pick a project first.");
      setScheduleTone("danger");
      return;
    }
    setScheduleSaving(true);
    try {
      await apiFetch("/api/qa/schedules", {
        method: "POST",
        body: {
          id: currentSchedule?.id,
          brand_key: currentBrandKey,
          brand_name:
            projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.brand_name ||
            inferBrandName(currentBrandKey),
          target_url:
            selectedRun?.target_url ||
            projectCatalog.find((project) => normalizeBrandKey(project.brand_key) === currentBrandKey)?.target_url ||
            launchDraft.targetUrl,
          frequency_hours: scheduleDraft.frequency_hours,
          scope_mode: launchDraft.scopeMode || "core_20m",
          persona: scheduleDraft.persona,
          mission: scheduleDraft.mission
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

  async function handleGitHubInstall() {
    if (!currentBrandKey) {
      setRepoError("Pick or create a project first.");
      return;
    }

    try {
      const response = await apiFetch<{ install_url: string }>("/api/qa/github-app/install-url", {
        method: "POST",
        body: {
          brand_key: currentBrandKey
        }
      });
      window.location.href = response.install_url;
    } catch (caught) {
      setRepoError(caught instanceof Error ? caught.message : "Could not start GitHub setup.");
    }
  }

  async function handleRepositorySelect(repoFullName: string) {
    if (!currentBrandKey || !repoFullName) {
      return;
    }
    setRepoLoading(true);
    try {
      const response = await apiFetch<{ connection: RepoConnection; repositories: RepoConnection["repositories"] }>("/api/qa/github-app/connection", {
        method: "POST",
        body: {
          brand_key: currentBrandKey,
          repo_full_name: repoFullName
        }
      });
      setRepoConnection({
        ...(response.connection || {}),
        repositories: response.repositories || response.connection?.repositories || []
      });
      setLaunchDraft((current) => ({
        ...current,
        repoTriageEnabled: true,
        selectedRepoFullName: repoFullName
      }));
    } catch (caught) {
      setRepoError(caught instanceof Error ? caught.message : "Could not save repository.");
    } finally {
      setRepoLoading(false);
    }
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
      <header className="sticky top-0 z-30 border-b border-brand-line bg-brand-shell/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between px-6 py-4">
          <BrandMark />
          <div className="flex items-center gap-3">
            {workerSummary?.label ? (
              <div className="hidden items-center gap-2 rounded-full border border-brand-line bg-brand-panel px-3 py-1.5 text-xs text-brand-muted md:flex">
                <Activity className="h-3.5 w-3.5 text-brand-primary" />
                {workerSummary.label}
              </div>
            ) : null}
            <Button
              tone="primary"
              onClick={() => {
                const next = new URLSearchParams(route.search);
                next.set("compose", "1");
                next.delete("run_id");
                next.set("view", "report");
                if (currentBrandKey) {
                  next.set("brand", currentBrandKey);
                }
                navigate("/dashboard", next);
              }}
            >
              <Play className="h-4 w-4" />
              Start test
            </Button>
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium text-brand-ink">{authState.user?.email || "Signed in"}</div>
              <div className="text-xs text-brand-muted">Private test history</div>
            </div>
            <Button tone="ghost" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="border-r border-brand-line bg-brand-rail">
          <div className="sticky top-[73px] flex max-h-[calc(100vh-73px)] flex-col px-4 py-5">
            <div className="space-y-3">
              <div>
                <FieldLabel>Project</FieldLabel>
                <Select
                  value={selectedBrandFilter}
                  onChange={(event) => {
                    const next = new URLSearchParams(route.search);
                    if (event.target.value) {
                      next.set("brand", event.target.value);
                    } else {
                      next.delete("brand");
                    }
                    next.delete("run_id");
                    next.delete("compose");
                    navigate("/dashboard", next);
                  }}
                >
                  <option value="">All projects</option>
                  {projectCatalog.map((project) => (
                    <option key={project.brand_key} value={project.brand_key}>
                      {project.brand_name || inferBrandName(project.brand_key)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel>Search</FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                  <TextInput
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Run, site, or persona"
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="retryable">Retryable</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                </Select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-brand-line pt-4">
              <div>
                <div className="text-sm font-semibold text-brand-ink">Tests</div>
                <div className="text-xs text-brand-muted">{filteredRuns.length} visible</div>
              </div>
              {runsLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-brand-muted" /> : null}
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {runsError ? (
                <div className="rounded-lg border border-brand-danger/30 bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
                  {runsError}
                </div>
              ) : null}
              {!filteredRuns.length && !runsLoading ? (
                <div className="rounded-xl border border-dashed border-brand-line px-4 py-5 text-sm text-brand-muted">
                  No tests match these filters.
                </div>
              ) : null}
              <div className="space-y-2">
                {filteredRuns.map((run) => {
                  const active = run.run_id === requestedRunId && !composeOpen;
                  return (
                    <button
                      key={run.run_id}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-brand-primary/60 bg-brand-primary/12"
                          : "border-brand-line bg-transparent hover:bg-white/4"
                      }`}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(route.search);
                        next.set("run_id", run.run_id);
                        next.delete("compose");
                        next.set("view", "report");
                        if (run.brand_key) {
                          next.set("brand", run.brand_key);
                        }
                        startTransition(() => navigate("/dashboard", next));
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-brand-ink">
                            {run.brand_name || inferBrandName(run.brand_key || "") || run.run_id}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-brand-muted">
                            {run.summary_note || run.goal || run.target_url || "No summary yet."}
                          </div>
                        </div>
                        <StatusPill
                          label={formatStatusLabel(run.status || run.queue_status || "queued")}
                          tone={getStatusTone(run.status || run.queue_status || "queued")}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-brand-muted">
                        <span>{run.findings_count || 0} problems</span>
                        <span>{formatDateTime(run.delivered_at)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-h-[calc(100vh-73px)] px-6 py-6">
          <AnimatePresence mode="wait">
            {composeOpen ? (
              <motion.div
                key="composer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
              >
                <LaunchComposer
                  draft={launchDraft}
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
                    if (requestedRunId) {
                      next.set("run_id", requestedRunId);
                    }
                    navigate("/dashboard", next);
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
                      scopeMode: runMode === "controlled_ux" ? "feature_targeted" : current.scopeMode === "feature_targeted" ? "core_20m" : current.scopeMode,
                      userJob:
                        runMode === "controlled_ux" && !current.userJob
                          ? DEFAULT_CONTROLLED_UX_JOB
                          : current.userJob
                    }))
                  }
                  onToggleGoal={(goal) =>
                    setLaunchDraft((current) => {
                      const lines = current.goalsText
                        .split(/\r?\n/g)
                        .map((item) => item.trim())
                        .filter(Boolean);
                      const exists = lines.includes(goal);
                      const next = exists ? lines.filter((item) => item !== goal) : [...lines, goal];
                      return {
                        ...current,
                        goalsText: next.join("\n")
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
                  onSubmit={() => handleLaunchRun()}
                />
              </motion.div>
            ) : (
              <motion.div
                key={requestedRunId || "empty"}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.18 }}
              >
                <ReportReader
                  run={selectedRun}
                  report={selectedReport}
                  status={selectedStatus}
                  loading={detailLoading}
                  error={detailError}
                  shareKey={shareKey}
                  view={currentView}
                  onChangeView={(nextView) => {
                    const next = new URLSearchParams(route.search);
                    next.set("view", nextView);
                    navigate("/dashboard", next);
                  }}
                  onRunAgain={() => handleLaunchRun(buildDraftFromRun(selectedRun, selectedReport, repoConnection), { retryOfRunId: selectedRun?.run_id || null })}
                  onCopyShareLink={handleCopyShareLink}
                  copyFeedback={copyFeedback}
                  selectedFindingId={selectedFindingId}
                  onSelectFinding={setSelectedFindingId}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <aside className="border-l border-brand-line bg-brand-rail px-5 py-6">
          <div className="sticky top-[89px] space-y-4">
            <div className="rounded-xl border border-brand-line bg-brand-shell p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">Current project</div>
                  <div className="mt-1 text-sm text-brand-muted">
                    {currentBrandKey ? inferBrandName(currentBrandKey) : "No project selected"}
                  </div>
                </div>
                {currentBrandKey ? (
                  <StatusPill label={`${sameBrandRuns.length} tests`} tone="neutral" />
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  tone="primary"
                  onClick={() => {
                    const next = new URLSearchParams(route.search);
                    next.set("compose", "1");
                    next.delete("run_id");
                    navigate("/dashboard", next);
                  }}
                >
                  <Play className="h-4 w-4" />
                  Start test
                </Button>
                {requestedRunId ? (
                  <Button tone="secondary" onClick={() => handleLaunchRun(buildDraftFromRun(selectedRun, selectedReport, repoConnection), { retryOfRunId: requestedRunId })}>
                    Run again
                  </Button>
                ) : null}
              </div>
            </div>

            <details className="group rounded-xl border border-brand-line bg-brand-shell p-4" open>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-brand-ink">
                Automation
                <ChevronDown className="h-4 w-4 text-brand-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                {currentSchedule ? (
                  <div className="rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-brand-ink">{currentSchedule.name || "Saved schedule"}</div>
                      <StatusPill label={currentSchedule.active === false ? "Paused" : "Active"} tone={currentSchedule.active === false ? "warning" : "success"} />
                    </div>
                    <div className="mt-2 text-brand-muted">
                      Every {currentSchedule.frequency_hours || 24}h. Next run {formatRelativeTime(currentSchedule.next_run_at)}.
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button tone="secondary" onClick={() => handleRunScheduleNow(currentSchedule.id)}>
                        Run now
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-brand-line px-3 py-3 text-sm text-brand-muted">
                    No schedule saved for this project.
                  </div>
                )}

                <div className="grid gap-3">
                  <div>
                    <FieldLabel>Every</FieldLabel>
                    <Select
                      value={String(scheduleDraft.frequency_hours)}
                      onChange={(event) =>
                        setScheduleDraft((current) => ({
                          ...current,
                          frequency_hours: Number(event.target.value) || 24
                        }))
                      }
                    >
                      {[6, 12, 24, 48, 72, 168].map((hours) => (
                        <option key={hours} value={hours}>
                          {hours < 24 ? `${hours} hours` : hours === 24 ? "24 hours" : hours === 168 ? "7 days" : `${hours / 24} days`}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Persona</FieldLabel>
                    <TextArea
                      value={scheduleDraft.persona}
                      onChange={(event) =>
                        setScheduleDraft((current) => ({
                          ...current,
                          persona: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Mission</FieldLabel>
                    <TextArea
                      value={scheduleDraft.mission}
                      onChange={(event) =>
                        setScheduleDraft((current) => ({
                          ...current,
                          mission: event.target.value
                        }))
                      }
                    />
                  </div>
                  <Button tone="primary" onClick={handleSaveSchedule} disabled={scheduleSaving}>
                    {scheduleSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                    Save automation
                  </Button>
                  {scheduleMessage ? (
                    <div className={`rounded-lg border px-3 py-2 text-sm ${
                      scheduleTone === "success"
                        ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                        : scheduleTone === "danger"
                          ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                          : "border-brand-line bg-white/5 text-brand-muted"
                    }`}>
                      {scheduleMessage}
                    </div>
                  ) : null}
                </div>
              </div>
            </details>

            <details className="group rounded-xl border border-brand-line bg-brand-shell p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-brand-ink">
                Engineering handoff
                <ChevronDown className="h-4 w-4 text-brand-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                {repoLoading ? (
                  <div className="flex items-center gap-2 text-sm text-brand-muted">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading repository connection
                  </div>
                ) : null}
                {repoConnection?.connection_status === "connected" ? (
                  <div className="rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                    <div className="font-medium text-brand-ink">{repoConnection.selected_repo_full_name}</div>
                    <div className="mt-1 text-brand-muted">Connected through the GitHub App. New tests can attach repo-aware triage.</div>
                  </div>
                ) : null}
                {repoConnection?.repositories && repoConnection.repositories.length > 1 ? (
                  <div>
                    <FieldLabel>Repository</FieldLabel>
                    <Select
                      value={launchDraft.selectedRepoFullName}
                      onChange={(event) => handleRepositorySelect(event.target.value)}
                    >
                      <option value="">Choose a repository</option>
                      {repoConnection.repositories.map((repo) => (
                        <option key={repo.full_name || repo.id} value={repo.full_name || ""}>
                          {repo.full_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {repoConnection?.connection_status !== "connected" ? (
                  <Button tone="secondary" onClick={handleGitHubInstall}>
                    <GitBranch className="h-4 w-4" />
                    Connect GitHub
                  </Button>
                ) : null}
                {repoError ? <div className="text-sm text-brand-danger">{repoError}</div> : null}
              </div>
            </details>

            <details
              className="group rounded-xl border border-brand-line bg-brand-shell p-4"
              onToggle={(event) =>
                setOperatorState((current) => ({
                  ...current,
                  open: (event.currentTarget as HTMLDetailsElement).open
                }))
              }
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-brand-ink">
                Operator tools
                <ChevronDown className="h-4 w-4 text-brand-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                {operatorState.loading ? (
                  <div className="flex items-center gap-2 text-sm text-brand-muted">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading operator tools
                  </div>
                ) : null}
                {operatorState.error ? <div className="text-sm text-brand-danger">{operatorState.error}</div> : null}
                {!operatorState.loading && !operatorState.brands.length ? (
                  <div className="rounded-lg border border-dashed border-brand-line px-3 py-3 text-sm text-brand-muted">
                    No submission brands yet.
                  </div>
                ) : null}
                {operatorState.brands.length ? (
                  <>
                    <div>
                      <FieldLabel>Brand profile</FieldLabel>
                      <Select
                        value={operatorState.selectedBrandId}
                        onChange={(event) =>
                          setOperatorState((current) => ({
                            ...current,
                            selectedBrandId: event.target.value
                          }))
                        }
                      >
                        {operatorState.brands.map((brand) => (
                          <option key={brand.brand_profile_id} value={brand.brand_profile_id}>
                            {brand.display_name || brand.brand_key || brand.brand_profile_id}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Pack</FieldLabel>
                      <Select
                        value={operatorState.selectedPackId}
                        onChange={(event) =>
                          setOperatorState((current) => ({
                            ...current,
                            selectedPackId: event.target.value
                          }))
                        }
                      >
                        {operatorState.packs.map((pack) => (
                          <option key={pack.pack_id} value={pack.pack_id}>
                            {pack.pack_name || pack.pack_id} ({pack.effective_site_count || pack.sites?.length || 0})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border border-brand-line bg-brand-panel px-3 py-2 text-sm text-brand-muted">
                      <input
                        type="checkbox"
                        checked={operatorState.liveMode}
                        onChange={(event) =>
                          setOperatorState((current) => ({
                            ...current,
                            liveMode: event.target.checked
                          }))
                        }
                      />
                      Queue live submit jobs
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-brand-line bg-brand-panel px-3 py-2 text-sm text-brand-muted">
                      <input
                        type="checkbox"
                        checked={operatorState.noHumanActions}
                        onChange={(event) =>
                          setOperatorState((current) => ({
                            ...current,
                            noHumanActions: event.target.checked
                          }))
                        }
                        disabled={!operatorState.liveMode}
                      />
                      No human actions
                    </label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button tone="secondary" onClick={() => handleOperatorAction("prepare")} disabled={operatorState.preparing}>
                        Prepare
                      </Button>
                      <Button tone="secondary" onClick={() => handleOperatorAction("preflight")} disabled={operatorState.preflighting}>
                        Preflight
                      </Button>
                      <Button tone="primary" onClick={() => handleOperatorAction("queue")} disabled={operatorState.queueing}>
                        {operatorState.liveMode ? "Queue live" : "Dry run"}
                      </Button>
                    </div>
                    {operatorState.actionMessage ? (
                      <div className={`rounded-lg border px-3 py-2 text-sm ${
                        operatorState.actionTone === "success"
                          ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                          : operatorState.actionTone === "danger"
                            ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                            : "border-brand-line bg-white/5 text-brand-muted"
                      }`}>
                        {operatorState.actionMessage}
                      </div>
                    ) : null}
                    {operatorState.preflight ? (
                      <div className="rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm text-brand-muted">
                        <div className="font-medium text-brand-ink">{operatorState.preflight.pack?.pack_name || "Pack preflight"}</div>
                        <div className="mt-1">
                          {operatorState.preflight.summary?.ready_auto_count || 0} auto, {operatorState.preflight.summary?.ready_assist_count || 0} assist, {operatorState.preflight.summary?.blocked_count || 0} blocked.
                        </div>
                      </div>
                    ) : null}
                    {operatorState.queueBatch ? (
                      <div className="rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                        <div className="font-medium text-brand-ink">
                          {operatorState.queueBatch.dry_run ? "Dry run result" : "Queued jobs"}
                        </div>
                        <div className="mt-1 text-brand-muted">
                          {operatorState.queueBatch.summary?.queued_count || 0} queued, {operatorState.queueBatch.summary?.skipped_count || 0} skipped, {operatorState.queueBatch.summary?.failed_count || 0} failed.
                        </div>
                        <div className="mt-3 space-y-2">
                          {(operatorState.queueBatch.queued_jobs || []).slice(0, 5).map((job: any) => {
                            const jobStatus = operatorState.queueStatuses[job.job_id]?.job?.status || job.status || "queued";
                            return (
                              <div key={job.job_id} className="flex items-center justify-between gap-3 rounded-md border border-brand-line px-2.5 py-2 text-xs">
                                <span className="truncate text-brand-ink">{job.site_name || job.site_id}</span>
                                <StatusPill label={formatStatusLabel(jobStatus)} tone={getStatusTone(jobStatus)} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <details className="rounded-lg border border-brand-line bg-brand-panel p-3">
                      <summary className="cursor-pointer list-none text-sm font-medium text-brand-ink">Brand profile</summary>
                      <div className="mt-3 grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <FieldLabel>Profile id</FieldLabel>
                            <TextInput
                              value={brandEditor.brand_profile_id}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  brand_profile_id: event.target.value
                                }))
                              }
                              placeholder="acme-main"
                            />
                          </div>
                          <div>
                            <FieldLabel>Display name</FieldLabel>
                            <TextInput
                              value={brandEditor.display_name}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  display_name: event.target.value
                                }))
                              }
                              placeholder="Acme"
                            />
                          </div>
                          <div>
                            <FieldLabel>Brand key</FieldLabel>
                            <TextInput
                              value={brandEditor.brand_key}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  brand_key: normalizeBrandKey(event.target.value)
                                }))
                              }
                              placeholder="acme"
                            />
                          </div>
                          <div>
                            <FieldLabel>Track</FieldLabel>
                            <Select
                              value={brandEditor.track}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  track: event.target.value
                                }))
                              }
                            >
                              <option value="startup">Startup</option>
                              <option value="physical_local">Physical local</option>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Website</FieldLabel>
                          <TextInput
                            value={brandEditor.website_url}
                            onChange={(event) =>
                              setBrandEditor((current) => ({
                                ...current,
                                website_url: event.target.value
                              }))
                            }
                            placeholder="https://your-site.com"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <FieldLabel>Mailbox email</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_email}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_email: event.target.value
                                }))
                              }
                              placeholder="team@brand.com"
                            />
                          </div>
                          <div>
                            <FieldLabel>Provider</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_provider}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_provider: event.target.value
                                }))
                              }
                              placeholder="gmail"
                            />
                          </div>
                          <div>
                            <FieldLabel>Username</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_username}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_username: event.target.value
                                }))
                              }
                              placeholder="Mailbox username"
                            />
                          </div>
                          <div>
                            <FieldLabel>Password</FieldLabel>
                            <TextInput
                              type="password"
                              value={brandEditor.mailbox_password}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_password: event.target.value
                                }))
                              }
                              placeholder="App password"
                            />
                          </div>
                          <div>
                            <FieldLabel>IMAP host</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_host}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_host: event.target.value
                                }))
                              }
                              placeholder="imap.host.com"
                            />
                          </div>
                          <div>
                            <FieldLabel>IMAP port</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_port}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_port: event.target.value
                                }))
                              }
                              placeholder="993"
                            />
                          </div>
                          <div>
                            <FieldLabel>SMTP host</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_smtp_host}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_smtp_host: event.target.value
                                }))
                              }
                              placeholder="smtp.host.com"
                            />
                          </div>
                          <div>
                            <FieldLabel>SMTP port</FieldLabel>
                            <TextInput
                              value={brandEditor.mailbox_smtp_port}
                              onChange={(event) =>
                                setBrandEditor((current) => ({
                                  ...current,
                                  mailbox_smtp_port: event.target.value
                                }))
                              }
                              placeholder="587"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-3 text-sm text-brand-muted">
                          <input
                            type="checkbox"
                            checked={brandEditor.mailbox_secure}
                            onChange={(event) =>
                              setBrandEditor((current) => ({
                                ...current,
                                mailbox_secure: event.target.checked
                              }))
                            }
                          />
                          IMAP secure
                        </label>
                        <label className="flex items-center gap-3 text-sm text-brand-muted">
                          <input
                            type="checkbox"
                            checked={brandEditor.mailbox_smtp_secure}
                            onChange={(event) =>
                              setBrandEditor((current) => ({
                                ...current,
                                mailbox_smtp_secure: event.target.checked
                              }))
                            }
                          />
                          SMTP secure
                        </label>
                        <Button tone="secondary" onClick={handleSaveBrandProfile} disabled={brandEditor.saving}>
                          {brandEditor.saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                          Save brand profile
                        </Button>
                        {brandEditor.message ? (
                          <div className={`rounded-lg border px-3 py-2 text-sm ${
                            brandEditor.tone === "success"
                              ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                              : brandEditor.tone === "danger"
                                ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                                : "border-brand-line bg-white/5 text-brand-muted"
                          }`}>
                            {brandEditor.message}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </>
                ) : null}
              </div>
            </details>

            {currentAlerts.length ? (
              <div className="rounded-xl border border-brand-line bg-brand-shell p-4">
                <div className="text-sm font-semibold text-brand-ink">Open alerts</div>
                <div className="mt-3 space-y-2">
                  {currentAlerts.slice(0, 4).map((alert) => (
                    <div key={alert.id} className="rounded-lg border border-brand-line bg-brand-panel px-3 py-3 text-sm">
                      <div className="font-medium text-brand-ink">{alert.title || "Alert"}</div>
                      <div className="mt-1 text-brand-muted">{alert.message || "No alert message."}</div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-brand-muted">{formatDateTime(alert.created_at)}</span>
                        <Button tone="ghost" onClick={() => handleAlertAcknowledge(alert.id)}>
                          Acknowledge
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LaunchComposer({
  draft,
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
  onSubmit
}: {
  draft: LaunchDraft;
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
  onSubmit: () => Promise<void>;
}) {
  const isControlled = draft.runMode === "controlled_ux";
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
  const effectiveScopeLabel = isControlled
    ? "Focused owned flow"
    : SCOPE_OPTIONS.find((option) => option.value === draft.scopeMode)?.label || "Fast pass";

  return (
    <section className="rounded-2xl border border-brand-line bg-brand-shell p-6 shadow-shell">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-line pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-ink">Start a new test</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted">
            {isControlled
              ? "Validate one owned flow before broad live QA. Define the job, the entry path, the planned route hints, and what success looks like."
              : "Keep the input tight: target, one user, one test depth, and explicit goals only when the flow needs it."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button tone="primary" onClick={onSubmit} disabled={busy}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start test
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Site</FieldLabel>
              <TextInput
                placeholder="https://your-site.com"
                value={draft.targetUrl}
                onChange={(event) =>
                  onChange((current) => {
                    const nextTarget = event.target.value;
                    const nextBrandKey = current.brandKey || deriveBrandKeyFromUrl(nextTarget);
                    return {
                      ...current,
                      targetUrl: nextTarget,
                      brandKey: nextBrandKey,
                      brandName: current.brandName || inferBrandName(nextBrandKey)
                    };
                  })
                }
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
                      active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-panel hover:bg-white/4"
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
            <div className="mb-3 text-sm font-medium text-brand-muted">User</div>
            <div className="grid gap-3 md:grid-cols-2">
              {PERSONA_PRESETS.map((persona) => {
                const active = draft.persona === persona.persona;
                return (
                  <button
                    key={persona.id}
                    className={`rounded-xl border px-4 py-4 text-left transition ${
                      active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-panel hover:bg-white/4"
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
            <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">Owned flow</div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted">
                    The single primary action here is validating one owned user flow. Broad coverage is hidden in this mode so the run stays focused on UI clarity, trust, and step-to-step friction.
                  </p>
                </div>
                <StatusPill label="Focused flow" tone="warning" />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                    placeholder={DEFAULT_CONTROLLED_UX_JOB}
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
                    placeholder="/signup"
                  />
                  <p className="mt-2 text-xs leading-5 text-brand-muted">
                    Start where the owned flow begins. Use a route path, not a broad homepage guess.
                  </p>
                </div>
              </div>

              <div className="mt-4">
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
                <p className="mt-2 text-xs leading-5 text-brand-muted">
                  Add the known route sequence or checkpoints. The runner will treat these as guidance and call out drift on the live site.
                </p>
              </div>

              <div className="mt-4">
                <FieldLabel>Success checks</FieldLabel>
                <TextArea
                  value={draft.successSignalsText}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      successSignalsText: event.target.value
                    }))
                  }
                  placeholder={"The next step is obvious\nValidation errors are clear\nThe user reaches the first useful state"}
                />
              </div>
            </div>
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
                          active ? "border-brand-primary/60 bg-brand-primary/12" : "border-brand-line bg-brand-panel hover:bg-white/4"
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
                <div className="mb-3 text-sm font-medium text-brand-muted">Goals</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {GOAL_PRESETS.map((goal) => {
                    const active = goalLines.includes(goal);
                    return (
                      <button
                        key={goal}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          active ? "border-brand-primary/60 bg-brand-primary/12 text-brand-ink" : "border-brand-line bg-brand-panel text-brand-muted hover:text-brand-ink"
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

        <div className="space-y-4">
          <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
            <div className="text-sm font-semibold text-brand-ink">{isControlled ? "Repo map" : "Engineering handoff"}</div>
            <p className="mt-2 text-sm leading-6 text-brand-muted">
              {isControlled
                ? "Controlled UX runs work best with a connected repo. Route hints come from the selected repository, while repo-aware triage still stays optional."
                : "Keep repo-aware triage behind a disclosure. Turn it on only when the project is connected."}
            </p>

            <label className="mt-4 flex items-center gap-3 text-sm text-brand-muted">
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
              Attach repo-aware triage
            </label>

            {repoConnection?.connection_status === "connected" ? (
              <div className="mt-4 rounded-lg border border-brand-line bg-brand-shell px-3 py-3 text-sm">
                <div className="font-medium text-brand-ink">{repoConnection.selected_repo_full_name}</div>
                <div className="mt-1 text-brand-muted">
                  {isControlled ? "Connected and ready to supply route hints plus repo-aware diagnosis." : "Connected and ready to enrich future reports."}
                </div>
              </div>
            ) : null}

            {isControlled ? (
              <div className="mt-4 rounded-lg border border-brand-line bg-brand-shell px-3 py-3 text-sm">
                <div className="font-medium text-brand-ink">Route hints</div>
                {repoRoutesLoading ? (
                  <div className="mt-2 text-brand-muted">Loading route suggestions from the connected repository.</div>
                ) : repoRoutes.length ? (
                  <>
                    <div className="mt-2 text-brand-muted">Pick an entry path or append known routes to the plan.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {repoRoutes.slice(0, 10).map((route) => {
                        const activeEntry = normalizeEntryPath(draft.entryPath) === route.path;
                        return (
                          <div key={`${route.path}:${route.file_path}`} className="flex items-center gap-2 rounded-full border border-brand-line bg-brand-panel px-2 py-1">
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
                  </>
                ) : (
                  <div className="mt-2 text-brand-muted">
                    {repoRoutesError || "No route suggestions were inferred from the repo. You can still type the entry path and route hints manually."}
                  </div>
                )}
              </div>
            ) : null}

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

            {repoConnection?.connection_status !== "connected" ? (
              <Button tone="secondary" className="mt-4" onClick={onStartGitHubInstall}>
                <GitBranch className="h-4 w-4" />
                Connect GitHub
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
            <div className="text-sm font-semibold text-brand-ink">Review</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-brand-muted">Mode</dt>
                <dd className="mt-1 text-brand-ink">{RUN_MODE_OPTIONS.find((option) => option.value === draft.runMode)?.label || "Live QA"}</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Site</dt>
                <dd className="mt-1 text-brand-ink">{draft.targetUrl || "Add a public site."}</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Project</dt>
                <dd className="mt-1 text-brand-ink">{draft.brandName || inferBrandName(draft.brandKey) || "Project name will be inferred."}</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Coverage</dt>
                <dd className="mt-1 text-brand-ink">{effectiveScopeLabel}</dd>
              </div>
              {isControlled ? (
                <>
                  <div>
                    <dt className="text-brand-muted">Entry path</dt>
                    <dd className="mt-1 text-brand-ink">{draft.entryPath || "Add the first owned-flow route."}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Primary user job</dt>
                    <dd className="mt-1 text-brand-ink">{draft.userJob || "Describe what the user is trying to accomplish."}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Route hints</dt>
                    <dd className="mt-1 text-brand-ink">{routeHintLines.length} added</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Success checks</dt>
                    <dd className="mt-1 text-brand-ink">{successLines.length} added</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt className="text-brand-muted">Goals</dt>
                  <dd className="mt-1 text-brand-ink">{goalLines.length ? goalLines.length : 0} selected</dd>
                </div>
              )}
            </dl>
          </div>

          {message ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                tone === "success"
                  ? "border-brand-success/30 bg-brand-success/10 text-brand-success"
                  : tone === "danger"
                    ? "border-brand-danger/30 bg-brand-danger/10 text-brand-danger"
                    : "border-brand-line bg-white/5 text-brand-muted"
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
              {typeof status?.progress?.percent === "number" ? (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-black/20">
                    <div className="h-2 rounded-full bg-brand-primary" style={{ width: `${Math.max(4, Math.min(100, status.progress.percent || 0))}%` }} />
                  </div>
                </div>
              ) : null}
            </div>

            {status?.artifacts?.live_stream_viewer_url || status?.artifacts?.live_stream_embed_url ? (
              <div className="rounded-xl border border-brand-line bg-brand-panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-brand-ink">Live watch</div>
                  <a
                    className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline"
                    href={status.artifacts.live_stream_viewer_url || status.artifacts.live_stream_embed_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
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
          <a className="inline-flex items-center gap-2 rounded-lg border border-brand-line bg-white/5 px-3.5 py-2 text-sm font-semibold text-brand-ink transition hover:bg-white/8" href="/">
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

export default App;
