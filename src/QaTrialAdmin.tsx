import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Clipboard,
  ExternalLink,
  LoaderCircle,
  Plus,
  Star,
  UserRoundCheck
} from "lucide-react";
import { apiFetch } from "./lib/api";
import type { QaTrialSummary, QaTrialView } from "./types";

type CreatedTrial = {
  session_id: string;
  lead_url: string;
  tester_url: string;
  admin_url: string;
  trial: QaTrialView;
  delivery?: {
    lead?: { ok?: boolean; skipped?: boolean; error?: string };
    tester?: { ok?: boolean; skipped?: boolean; error?: string };
  };
};

const EMPTY_FORM = {
  productName: "",
  targetUrl: "",
  leadEmail: "",
  testerEmail: "",
  testFocus: "",
  knownIssues: ""
};

function statusLabel(status?: string) {
  if (status === "awaiting_consent") return "Waiting for acceptance";
  if (status === "ready") return "Ready to test";
  if (status === "in_progress") return "Testing now";
  if (status === "submitted") return "Ready to score";
  if (status === "verified") return "Verified";
  if (status === "completed") return "Complete";
  return "Trial";
}

function trialStatusTone(status?: string) {
  if (status === "completed" || status === "verified") return "bg-brand-success/10 text-brand-success";
  if (status === "submitted") return "bg-brand-warning/15 text-brand-ink";
  return "bg-brand-bg text-brand-muted";
}

export default function QaTrialAdmin({ search }: { search: string }) {
  const initialSessionId = String(new URLSearchParams(search).get("session_id") || "").trim();
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<QaTrialSummary[]>([]);
  const [selectedId, setSelectedId] = useState(initialSessionId);
  const [selected, setSelected] = useState<QaTrialView | null>(null);
  const [created, setCreated] = useState<CreatedTrial | null>(null);
  const [caughtIssueIds, setCaughtIssueIds] = useState<string[]>([]);
  const [clarity, setClarity] = useState<"needs_work" | "good" | "excellent">("good");
  const [reviewerNote, setReviewerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const benchmarkIssues = useMemo(() => selected?.benchmark?.issues || [], [selected]);
  const invitationsSent = Boolean(created?.delivery?.lead?.ok && created?.delivery?.tester?.ok);

  async function loadItems() {
    const response = await apiFetch<{ items: QaTrialSummary[] }>("/api/qa-trials", { params: { limit: 100 } });
    setItems(response.items || []);
  }

  async function loadSelected(sessionId: string) {
    if (!sessionId) {
      setSelected(null);
      return;
    }
    const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
      params: { session_id: sessionId }
    });
    setSelected(response.trial);
    setCaughtIssueIds(response.trial.qualification.caught_issue_ids || []);
    setReviewerNote(response.trial.qualification.reviewer_note || "");
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadItems(), initialSessionId ? loadSelected(initialSessionId) : Promise.resolve()])
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load qualification trials.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch<CreatedTrial>("/api/qa-trials", {
        method: "POST",
        body: {
          action: "create",
          product_name: form.productName,
          target_url: form.targetUrl,
          lead_email: form.leadEmail,
          tester_email: form.testerEmail,
          test_focus: form.testFocus,
          known_issues: form.knownIssues
        }
      });
      setCreated(response);
      setSelectedId(response.session_id);
      setSelected(response.trial);
      setForm(EMPTY_FORM);
      await loadItems();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not pair this trial.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`${label} copied`);
    window.setTimeout(() => setCopyMessage(""), 1800);
  }

  async function openTrial(sessionId: string) {
    setSelectedId(sessionId);
    setCreated(null);
    setLoading(true);
    setError("");
    try {
      await loadSelected(sessionId);
      const next = new URL(window.location.href);
      next.searchParams.set("session_id", sessionId);
      window.history.replaceState({}, "", next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this trial.");
    } finally {
      setLoading(false);
    }
  }

  async function scoreTrial() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
        method: "POST",
        body: {
          action: "score",
          session_id: selectedId,
          caught_issue_ids: caughtIssueIds,
          clarity,
          reviewer_note: reviewerNote
        }
      });
      setSelected(response.trial);
      await loadItems();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not score this trial.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !selected && !items.length) {
    return <div className="flex min-h-screen items-center justify-center bg-brand-bg"><LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </a>
          <div className="font-display text-xl font-black">Qualification trials</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-2xl border border-brand-line bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent">
              <UserRoundCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black">Pair a free test</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
                The customer gets a free report. The new tester earns their first verified score.
              </p>
            </div>
          </div>

          <form className="mt-8 grid gap-5" onSubmit={createTrial}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-black">
                Product name
                <input required value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder="Ciaro Pro" />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Product link
                <input required type="url" value={form.targetUrl} onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))} className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder="https://example.com" />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Customer email
                <input required type="email" value={form.leadEmail} onChange={(event) => setForm((current) => ({ ...current, leadEmail: event.target.value }))} className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder="founder@example.com" />
              </label>
              <label className="grid gap-2 text-sm font-black">
                Tester email
                <input required type="email" value={form.testerEmail} onChange={(event) => setForm((current) => ({ ...current, testerEmail: event.target.value }))} className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder="tester@example.com" />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-black">
              What should they test?
              <textarea required value={form.testFocus} onChange={(event) => setForm((current) => ({ ...current, testFocus: event.target.value }))} className="min-h-24 rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder="Try signup as a first-time user and reach the dashboard." />
            </label>

            <label className="grid gap-2 text-sm font-black">
              Private benchmark issues
              <textarea required value={form.knownIssues} onChange={(event) => setForm((current) => ({ ...current, knownIssues: event.target.value }))} className="min-h-28 rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder={"One known issue per line\nPhone field is easy to miss\nPassword error is unclear"} />
              <span className="text-xs font-semibold text-brand-muted">Only BUD sees these. They are used to calculate the tester’s score.</span>
            </label>

            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-6 py-4 font-black text-white transition hover:bg-brand-accent disabled:opacity-60 sm:w-auto">
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              Pair trial
            </button>
          </form>

          {created ? (
            <div className="mt-8 rounded-2xl border border-brand-success/30 bg-brand-success/10 p-5">
              <div className="flex items-center gap-2 font-black"><Check className="h-5 w-5 text-brand-success" /> Trial paired</div>
              <p className="mt-2 text-sm font-semibold text-brand-muted">
                {invitationsSent ? "Both invitations were emailed. The private links are also shown once below." : "Email was unavailable. Send each person their private link below."}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void copyLink(created.lead_url, "Customer link")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-line bg-white px-4 py-3 font-black"><Clipboard className="h-4 w-4" /> Copy customer link</button>
                <button type="button" onClick={() => void copyLink(created.tester_url, "Tester link")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-line bg-white px-4 py-3 font-black"><Clipboard className="h-4 w-4" /> Copy tester link</button>
              </div>
              {copyMessage ? <div className="mt-3 text-xs font-black uppercase tracking-widest text-brand-success">{copyMessage}</div> : null}
            </div>
          ) : null}
        </section>

        {selected ? (
          <section className="mt-8 rounded-2xl border border-brand-line bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${trialStatusTone(selected.status)}`}>{statusLabel(selected.status)}</div>
                <h2 className="mt-3 text-2xl font-black">{selected.product_name}</h2>
                <p className="mt-1 text-sm font-semibold text-brand-muted">{selected.tester.email} testing for {selected.lead.email}</p>
              </div>
              <a href={selected.target_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-brand-line px-4 py-2 text-sm font-black"><ExternalLink className="h-4 w-4" /> Product</a>
            </div>

            {selected.submission.submitted_at && selected.qualification.status !== "verified" ? (
              <div className="mt-8 border-t border-brand-line pt-8">
                <h3 className="text-xl font-black">Score the trial</h3>
                <p className="mt-1 text-sm font-semibold text-brand-muted">Check each private issue the tester found.</p>
                <div className="mt-5 grid gap-3">
                  {benchmarkIssues.map((issue) => {
                    const checked = caughtIssueIds.includes(issue.id);
                    return (
                      <label key={issue.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${checked ? "border-brand-accent bg-brand-accent/5" : "border-brand-line"}`}>
                        <input type="checkbox" checked={checked} onChange={() => setCaughtIssueIds((current) => checked ? current.filter((id) => id !== issue.id) : [...current, issue.id])} className="mt-1 h-4 w-4 accent-brand-accent" />
                        <span className="font-semibold">{issue.title}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="text-sm font-black">Report clarity</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([
                      ["needs_work", "Needs work"],
                      ["good", "Good"],
                      ["excellent", "Excellent"]
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setClarity(value)} className={`rounded-xl border px-3 py-3 text-sm font-black ${clarity === value ? "border-brand-accent bg-brand-accent text-white" : "border-brand-line bg-white"}`}>{label}</button>
                    ))}
                  </div>
                </div>

                <textarea value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="Optional note for the tester" className="mt-5 min-h-24 w-full rounded-xl border border-brand-line px-4 py-3 text-sm font-semibold outline-none focus:border-brand-accent" />
                <button type="button" onClick={() => void scoreTrial()} disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-4 font-black text-white disabled:opacity-60 sm:w-auto">
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Star className="h-5 w-5" />}
                  Publish score
                </button>
              </div>
            ) : selected.qualification.status === "verified" ? (
              <div className="mt-8 rounded-2xl bg-brand-accent/5 p-6">
                <div className="text-xs font-black uppercase tracking-widest text-brand-accent">BUD Verified Trial</div>
                <div className="mt-2 text-4xl font-black">{selected.qualification.score}/100</div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-brand-muted">
                  <span>Coverage {selected.qualification.coverage_score}/70</span>
                  <span>Evidence {selected.qualification.evidence_score}/20</span>
                  <span>Clarity {selected.qualification.clarity_score}/10</span>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {items.length ? (
          <details className="mt-8 rounded-2xl border border-brand-line bg-white p-5">
            <summary className="cursor-pointer font-black">Past trials ({items.length})</summary>
            <div className="mt-4 grid gap-2">
              {items.map((item) => (
                <button key={item.session_id} type="button" onClick={() => void openTrial(item.session_id)} className="flex items-center justify-between gap-4 rounded-xl border border-brand-line px-4 py-3 text-left hover:border-brand-accent">
                  <div>
                    <div className="font-black">{item.product_name}</div>
                    <div className="mt-1 text-xs font-semibold text-brand-muted">{statusLabel(item.status)}</div>
                  </div>
                  <div className="text-sm font-black text-brand-accent">{item.score === null || item.score === undefined ? "Open" : `${item.score}/100`}</div>
                </button>
              ))}
            </div>
          </details>
        ) : null}

        {error ? <div className="mt-6 rounded-xl border border-brand-danger/20 bg-brand-danger/10 px-4 py-3 text-sm font-semibold text-brand-danger">{error}</div> : null}
      </main>
    </div>
  );
}
