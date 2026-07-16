import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  LogOut,
  MonitorUp,
  ShieldCheck,
  Star
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/types";
import BrandLogo from "./BrandLogo";

type TesterStatus = "applied" | "invited" | "qualified" | "approved" | "declined";

type TesterApplication = {
  id: string;
  name: string;
  owner_email: string;
  devices: Array<"computer" | "ios" | "android">;
  status: TesterStatus;
};

type TesterJob = {
  id: string;
  product_name: string;
  review_type: "specific_flow" | "general_first_time_user";
  test_focus: string;
  expected_success?: string | null;
  duration_minutes: number;
  access_mode: "public_only" | "signup_allowed" | "test_account";
  status: "available" | "assigned" | "in_progress" | "submitted" | "completed";
  can_open: boolean;
  published_at?: string | null;
  claimed_at?: string | null;
  updated_at?: string | null;
};

type JobsResponse = {
  ok: boolean;
  application: TesterApplication | null;
  available: TesterJob[];
  current: TesterJob[];
  history: TesterJob[];
  can_claim_qualification: boolean;
  desktop_ready: boolean;
};

function accessLabel(mode: TesterJob["access_mode"]) {
  if (mode === "signup_allowed") return "You may create a free account";
  if (mode === "test_account") return "A test login is provided after you take it";
  return "Public pages only";
}

function currentActionLabel(status: TesterJob["status"]) {
  if (status === "submitted") return "View submission";
  if (status === "in_progress") return "Continue test";
  return "Start test";
}

export default function TesterJobsPage({
  user,
  onSignOut
}: {
  user: AuthUser | null;
  onSignOut: () => Promise<void>;
}) {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function loadJobs() {
    setError("");
    const response = await apiFetch<JobsResponse>("/api/tester-jobs");
    setData(response);
  }

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Tester jobs | Before Users Do";
    loadJobs()
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Could not load available tests.");
      })
      .finally(() => setLoading(false));
    return () => {
      document.title = previousTitle;
    };
  }, []);

  async function runJobAction(job: TesterJob, action: "claim" | "open") {
    setBusyId(job.id);
    setError("");
    try {
      const response = await apiFetch<{ ok: boolean; open_url: string }>("/api/tester-jobs", {
        method: "POST",
        body: { action, request_id: job.id }
      });
      window.location.assign(response.open_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this test.");
      await loadJobs().catch(() => undefined);
    } finally {
      setBusyId("");
    }
  }

  const application = data?.application || null;
  const currentJob = data?.current?.[0] || null;

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink" data-app-shell="tester-jobs">
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href="/" aria-label="Before Users Do homepage">
            <BrandLogo />
          </a>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-black text-brand-muted hover:bg-brand-bg hover:text-brand-ink"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        {loading ? (
          <div className="flex min-h-[55vh] items-center justify-center" role="status">
            <LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" />
            <span className="sr-only">Loading tester jobs</span>
          </div>
        ) : !application ? (
          <section className="mx-auto max-w-xl text-center">
            <h1 className="text-4xl font-black sm:text-5xl">Apply before taking a test</h1>
            <p className="mt-4 text-lg font-semibold leading-7 text-brand-muted">
              Tell us what you can test on, then choose your first qualification.
            </p>
            <a
              href="/testers/apply"
              className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 py-4 font-black text-white shadow-shell hover:bg-brand-ink"
            >
              Apply to be a tester
              <ArrowRight className="h-5 w-5" />
            </a>
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-brand-line pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black text-brand-accent">Hi {application.name}</p>
                <h1 className="mt-2 text-4xl font-black sm:text-5xl">
                  {currentJob ? "Your test" : "Choose a test"}
                </h1>
              </div>
              <p className="text-sm font-semibold text-brand-muted">{user?.email}</p>
            </div>

            {error ? (
              <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-brand-danger" role="alert">
                {error}
              </p>
            ) : null}

            {currentJob ? (
              <section className="py-8">
                <div className="border-2 border-brand-ink bg-white p-6 shadow-shell sm:p-8">
                  <div className="flex items-center gap-2 text-sm font-black text-brand-success">
                    <MonitorUp className="h-5 w-5" />
                    {currentJob.status === "submitted" ? "Sent for review" : "Taken by you"}
                  </div>
                  <h2 className="mt-4 text-3xl font-black">{currentJob.product_name}</h2>
                  <p className="mt-4 font-semibold leading-7 text-brand-muted">{currentJob.test_focus}</p>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-brand-muted">
                    <span className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4" /> {currentJob.duration_minutes} minutes
                    </span>
                    <span>{accessLabel(currentJob.access_mode)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === currentJob.id || !currentJob.can_open}
                    onClick={() => void runJobAction(currentJob, "open")}
                    className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 py-4 text-lg font-black text-white hover:bg-brand-ink disabled:cursor-wait disabled:opacity-50 sm:w-auto"
                  >
                    {busyId === currentJob.id ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
                    {busyId === currentJob.id ? "Opening..." : currentActionLabel(currentJob.status)}
                    {busyId !== currentJob.id ? <ArrowRight className="h-5 w-5" /> : null}
                  </button>
                </div>
              </section>
            ) : application.status === "applied" && !data?.desktop_ready ? (
              <section className="py-10 text-center">
                <MonitorUp className="mx-auto h-9 w-9 text-brand-accent" />
                <h2 className="mt-4 text-2xl font-black">A computer is needed for your first test</h2>
                <p className="mx-auto mt-3 max-w-lg font-semibold leading-7 text-brand-muted">
                  The current recorder works in Chrome on a computer. Mobile testing will be added separately.
                </p>
              </section>
            ) : application.status === "applied" && data?.available.length ? (
              <section className="divide-y divide-brand-line border-b border-brand-line">
                {data.available.map((job) => (
                  <article key={job.id} className="py-8">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-brand-accent">Unpaid qualification</div>
                        <h2 className="mt-2 text-2xl font-black">{job.product_name}</h2>
                        <p className="mt-3 font-semibold leading-7 text-brand-muted">{job.test_focus}</p>
                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-brand-muted">
                          <span className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4" /> {job.duration_minutes} minutes
                          </span>
                          <span>{accessLabel(job.access_mode)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => void runJobAction(job, "claim")}
                        className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 py-4 font-black text-white shadow-shell hover:bg-brand-ink disabled:cursor-wait disabled:opacity-50"
                      >
                        {busyId === job.id ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
                        {busyId === job.id ? "Taking test..." : "Take test"}
                        {busyId !== job.id ? <ArrowRight className="h-5 w-5" /> : null}
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ) : application.status === "applied" ? (
              <section className="py-12 text-center">
                <Clock3 className="mx-auto h-9 w-9 text-brand-accent" />
                <h2 className="mt-4 text-2xl font-black">No qualification is open right now</h2>
                <p className="mt-3 font-semibold text-brand-muted">We’ll email you when a new test is ready to take.</p>
              </section>
            ) : application.status === "invited" ? (
              <section className="py-12 text-center">
                <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-brand-accent" />
                <h2 className="mt-4 text-2xl font-black">Your test is being prepared</h2>
                <p className="mt-3 font-semibold text-brand-muted">Refresh this page in a moment.</p>
              </section>
            ) : application.status === "qualified" ? (
              <section className="py-12 text-center">
                <Star className="mx-auto h-9 w-9 text-brand-accent" />
                <h2 className="mt-4 text-2xl font-black">Qualification complete</h2>
                <p className="mt-3 font-semibold text-brand-muted">BUD is reviewing your score before paid tests open.</p>
              </section>
            ) : application.status === "approved" ? (
              <section className="py-12 text-center">
                <ShieldCheck className="mx-auto h-9 w-9 text-brand-success" />
                <h2 className="mt-4 text-2xl font-black">You’re approved</h2>
                <p className="mt-3 font-semibold text-brand-muted">We’ll email you when a paid test is ready.</p>
              </section>
            ) : (
              <section className="py-12 text-center">
                <h2 className="text-2xl font-black">Your application is closed</h2>
                <p className="mt-3 font-semibold text-brand-muted">Contact BUD if you think this is a mistake.</p>
              </section>
            )}

            {data?.history.length ? (
              <details className="mt-8 border-t border-brand-line pt-6">
                <summary className="cursor-pointer text-sm font-black text-brand-muted">
                  Completed tests ({data.history.length})
                </summary>
                <div className="mt-4 divide-y divide-brand-line border-y border-brand-line bg-white">
                  {data.history.map((job) => (
                    <div key={job.id} className="flex items-center justify-between gap-4 px-4 py-4">
                      <div>
                        <div className="font-black">{job.product_name}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs font-bold text-brand-success">
                          <Check className="h-4 w-4" /> Complete
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runJobAction(job, "open")}
                        className="min-h-11 rounded-lg px-4 text-sm font-black text-brand-accent hover:bg-brand-bg"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
