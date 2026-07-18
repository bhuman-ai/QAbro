import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Plus,
  Send,
  Star,
  UserRoundCheck
} from "lucide-react";
import { apiFetch } from "./lib/api";
import type { HumanTestRequest, QaTrialSummary, QaTrialView } from "./types";

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
  testerName: "",
  testerEmail: "",
  testFocus: "",
  knownIssues: "",
  assignmentType: "qualification" as "qualification" | "paid",
  testerPay: ""
};

function formatPay(cents = 0, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

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
  const initialParams = new URLSearchParams(search);
  const initialSessionId = String(initialParams.get("session_id") || "").trim();
  const testerApplicationId = String(initialParams.get("tester_application_id") || "").trim();
  const testerName = String(initialParams.get("tester_name") || "").trim();
  const testerEmail = String(initialParams.get("tester_email") || "").trim();
  const [form, setForm] = useState({ ...EMPTY_FORM, testerName, testerEmail });
  const [items, setItems] = useState<QaTrialSummary[]>([]);
  const [requests, setRequests] = useState<HumanTestRequest[]>([]);
  const [availableRequests, setAvailableRequests] = useState<HumanTestRequest[]>([]);
  const [humanRequestId, setHumanRequestId] = useState("");
  const [humanRequestAction, setHumanRequestAction] = useState<"publish" | "invite" | "">("");
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
  const [publishedMessage, setPublishedMessage] = useState("");

  const benchmarkIssues = useMemo(() => selected?.benchmark?.issues || [], [selected]);
  const invitationsSent = Boolean(created?.delivery?.lead?.ok && created?.delivery?.tester?.ok);

  async function loadItems() {
    const response = await apiFetch<{ items: QaTrialSummary[] }>("/api/qa-trials", { params: { limit: 100 } });
    setItems(response.items || []);
  }

  async function loadRequests() {
    const [queued, available] = await Promise.all([
      apiFetch<{ items: HumanTestRequest[] }>("/api/human-test-requests", {
        params: { scope: "admin", status: "queued", limit: 100 }
      }),
      apiFetch<{ items: HumanTestRequest[] }>("/api/human-test-requests", {
        params: { scope: "admin", status: "available", limit: 100 }
      })
    ]);
    setRequests(queued.items || []);
    setAvailableRequests(available.items || []);
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
    Promise.all([loadItems(), loadRequests(), initialSessionId ? loadSelected(initialSessionId) : Promise.resolve()])
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
      if (humanRequestId) {
        if (humanRequestAction === "invite") {
          const invitedEmail = form.testerEmail.trim();
          const response = await apiFetch<CreatedTrial>("/api/human-test-requests", {
            method: "POST",
            body: {
              action: "assign",
              request_id: humanRequestId,
              tester_name: form.testerName,
              tester_email: invitedEmail
            }
          });
          setCreated(response);
          setSelectedId(response.session_id);
          setSelected(response.trial);
          setPublishedMessage(`Private test reserved for ${invitedEmail}.`);
          setHumanRequestId("");
          setHumanRequestAction("");
          setForm(EMPTY_FORM);
          await Promise.all([loadItems(), loadRequests()]);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        await apiFetch("/api/human-test-requests", {
          method: "POST",
          body: {
            action: "publish",
            request_id: humanRequestId,
            known_issues: form.knownIssues,
            assignment_type: form.assignmentType,
            tester_pay_cents:
              form.assignmentType === "paid" ? Math.round(Number(form.testerPay) * 100) : 0,
            tester_pay_currency: "USD"
          }
        });
        setPublishedMessage(
          form.assignmentType === "paid"
            ? `${form.productName} is available to approved testers for ${formatPay(Math.round(Number(form.testerPay) * 100))}.`
            : `${form.productName} is available as a qualification.`
        );
        setHumanRequestId("");
        setHumanRequestAction("");
        setForm(EMPTY_FORM);
        await loadRequests();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const response = await apiFetch<CreatedTrial>("/api/qa-trials", {
        method: "POST",
        body: {
          action: "create",
          product_name: form.productName,
          target_url: form.targetUrl,
          lead_email: form.leadEmail,
          tester_name: form.testerName,
          tester_email: form.testerEmail,
          test_focus: form.testFocus,
          known_issues: form.knownIssues,
          ...(testerApplicationId ? { tester_application_id: testerApplicationId } : {})
        }
      });
      setCreated(response);
      setSelectedId(response.session_id);
      setSelected(response.trial);
      setForm(EMPTY_FORM);
      await Promise.all([loadItems(), loadRequests()]);
      if (testerApplicationId) {
        try {
          await apiFetch("/api/tester-applications", {
            method: "PATCH",
            body: {
              id: testerApplicationId,
              status: "invited",
              qualification_session_id: response.session_id
            }
          });
        } catch {
          setError("The trial was created, but the applicant queue did not update. Open the applicant and mark the qualification as sent.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not pair this trial.");
    } finally {
      setBusy(false);
    }
  }

  function chooseHumanRequest(request: HumanTestRequest) {
    setHumanRequestId(request.id);
    setHumanRequestAction("publish");
    setCreated(null);
    setPublishedMessage("");
    setForm((current) => ({
      ...current,
      productName: request.product_name,
      targetUrl: request.target_url,
      leadEmail: request.owner_email,
      testFocus: request.test_focus,
      assignmentType: "paid",
      testerPay: request.tester_pay_cents ? String(request.tester_pay_cents / 100) : ""
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseInviteRequest(request: HumanTestRequest) {
    setHumanRequestId(request.id);
    setHumanRequestAction("invite");
    setCreated(null);
    setPublishedMessage("");
    setForm({
      ...EMPTY_FORM,
      productName: request.product_name,
      targetUrl: request.target_url,
      leadEmail: request.owner_email,
      testFocus: request.test_focus,
      assignmentType: request.assignment_type,
      testerPay: request.tester_pay_cents ? String(request.tester_pay_cents / 100) : ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  async function markPaid() {
    if (!selected?.source_request_id) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/human-test-requests", {
        method: "POST",
        body: { action: "mark_paid", request_id: selected.source_request_id }
      });
      await Promise.all([loadSelected(selected.session_id), loadRequests(), loadItems()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record this payment.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !selected && !items.length) {
    return <div className="flex min-h-screen items-center justify-center bg-brand-bg"><LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" /></div>;
  }

  const publishingRequest = Boolean(humanRequestId && humanRequestAction === "publish");
  const invitingTester = Boolean(humanRequestId && humanRequestAction === "invite");

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </a>
          <a href="/testers/admin" className="text-sm font-black text-brand-accent hover:text-brand-ink">Tester applicants</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {requests.length ? (
          <section className="mb-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black">Needs preparation</h1>
                <p className="mt-1 text-sm font-semibold text-brand-muted">Add private review points, then publish it to testers.</p>
              </div>
              <span className="text-sm font-black text-brand-accent">{requests.length}</span>
            </div>
            <div className="mt-4 divide-y divide-brand-line border-y border-brand-line bg-white">
              {requests.map((request) => (
                <div key={request.id} className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 shrink-0 text-brand-accent" />
                      <div className="truncate font-black">{request.product_name}</div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-brand-muted">{request.test_focus}</p>
                    <p className="mt-2 text-xs font-bold text-brand-muted">
                      {request.review_type === "specific_flow" ? "Specific flow" : "First-time review"} · {request.access_mode.replaceAll("_", " ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseHumanRequest(request)}
                    className="shrink-0 rounded-xl bg-brand-ink px-5 py-3 text-sm font-black text-white transition hover:bg-brand-accent"
                  >
                    Prepare test
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {publishedMessage ? (
          <div className="mb-8 flex items-center gap-3 border-y border-brand-success/30 bg-brand-success/10 px-4 py-4 font-bold">
            <Check className="h-5 w-5 text-brand-success" />
            {publishedMessage}
          </div>
        ) : null}

        {availableRequests.length ? (
          <section className="mb-8 border-y border-brand-line bg-white">
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <h2 className="text-lg font-black">Available to testers</h2>
                <p className="mt-1 text-sm font-semibold text-brand-muted">Let a tester claim one, or send it directly to someone who is ready.</p>
              </div>
              <span className="text-sm font-black text-brand-success">{availableRequests.length}</span>
            </div>
            <div className="divide-y divide-brand-line border-t border-brand-line">
              {availableRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-4 px-4 py-4">
                  <div className="min-w-0">
                    <div className="truncate font-black">{request.product_name}</div>
                    <div className="mt-1 text-xs font-bold text-brand-muted">
                      {request.assignment_type === "paid"
                        ? `${formatPay(request.tester_pay_cents, request.tester_pay_currency)} paid test · waiting to be claimed`
                        : "Qualification · waiting to be claimed"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseInviteRequest(request)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-ink px-4 py-3 text-sm font-black text-white transition hover:bg-brand-accent"
                  >
                    <Send className="h-4 w-4" />
                    Invite tester
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-brand-line bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent">
              <UserRoundCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black">
                {publishingRequest
                  ? "Publish for testers"
                  : invitingTester
                    ? `Invite a tester to ${form.productName}`
                    : testerName
                      ? `Set up ${testerName}'s qualification`
                      : "Pair a free test"}
              </h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
                {publishingRequest
                  ? "The customer brief is ready. Add private review points before testers can see it."
                  : invitingTester
                    ? "They get one private link that opens this brief and starts the recording."
                  : "The customer gets a free report. The new tester earns their first verified score."}
              </p>
            </div>
          </div>

          <form className="mt-8 grid gap-5" onSubmit={createTrial}>
            {publishingRequest || invitingTester ? (
              <>
                <div className="border-y border-brand-line py-5">
                  <div className="text-sm font-black text-brand-accent">{form.productName}</div>
                  <p className="mt-2 font-semibold leading-7 text-brand-muted">{form.testFocus}</p>
                  <p className="mt-3 break-all text-xs font-bold text-brand-muted">{form.targetUrl}</p>
                </div>
                {publishingRequest ? (
                  <>
                    <fieldset>
                      <legend className="text-sm font-black">Who is this for?</legend>
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-brand-bg p-1">
                        {([
                          ["paid", "Approved tester"],
                          ["qualification", "New tester"]
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={form.assignmentType === value}
                            onClick={() => setForm((current) => ({
                              ...current,
                              assignmentType: value,
                              testerPay: value === "paid" ? current.testerPay : ""
                            }))}
                            className={`min-h-11 rounded-lg px-3 text-sm font-black ${
                              form.assignmentType === value ? "bg-white text-brand-ink shadow-sm" : "text-brand-muted"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {form.assignmentType === "paid" ? (
                      <label className="grid gap-2 text-sm font-black">
                        Tester pay
                        <div className="flex items-center rounded-xl border border-brand-line bg-white px-4 focus-within:border-brand-accent">
                          <span className="font-black text-brand-muted">$</span>
                          <input
                            required
                            min="1"
                            step="0.01"
                            type="number"
                            inputMode="decimal"
                            value={form.testerPay}
                            onChange={(event) => setForm((current) => ({ ...current, testerPay: event.target.value }))}
                            className="min-h-12 w-full px-2 font-semibold outline-none"
                            placeholder="25"
                          />
                        </div>
                        <span className="text-xs font-semibold text-brand-muted">
                          This exact amount is shown before the tester claims the job.
                        </span>
                      </label>
                    ) : null}
                  </>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-black">
                      Tester name
                      <input
                        value={form.testerName}
                        onChange={(event) => setForm((current) => ({ ...current, testerName: event.target.value }))}
                        className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent"
                        placeholder="Haley Birch"
                        autoComplete="name"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-black">
                      Tester email
                      <input
                        required
                        type="email"
                        value={form.testerEmail}
                        onChange={(event) => setForm((current) => ({ ...current, testerEmail: event.target.value }))}
                        className="rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent"
                        placeholder="tester@example.com"
                        autoComplete="email"
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <>
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
              </>
            )}

            {!invitingTester ? (
              <label className="grid gap-2 text-sm font-black">
                Private review points
                <textarea required value={form.knownIssues} onChange={(event) => setForm((current) => ({ ...current, knownIssues: event.target.value }))} className="min-h-28 rounded-xl border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent" placeholder={"One known issue per line\nPhone field is easy to miss\nPassword error is unclear"} />
                <span className="text-xs font-semibold text-brand-muted">Only BUD sees these. Use known issues or important areas the tester should notice.</span>
              </label>
            ) : null}

            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-6 py-4 font-black text-white transition hover:bg-brand-accent disabled:opacity-60 sm:w-auto">
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : invitingTester ? <Send className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {publishingRequest ? "Publish test" : invitingTester ? "Send private invite" : "Pair trial"}
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
                {selected.assignment.type === "paid" ? (
                  <p className="mt-2 text-lg font-black text-brand-success">
                    {formatPay(selected.assignment.tester_pay_cents, selected.assignment.tester_pay_currency)} · {selected.assignment.payout_status.replaceAll("_", " ")}
                  </p>
                ) : null}
              </div>
              <a href={selected.target_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-brand-line px-4 py-2 text-sm font-black"><ExternalLink className="h-4 w-4" /> Product</a>
            </div>

            {selected.submission.submitted_at && selected.qualification.status !== "verified" ? (
              <div className="mt-8 border-t border-brand-line pt-8">
                <h3 className="text-xl font-black">
                  {selected.assignment.type === "paid" ? "Review the paid test" : "Score the trial"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-brand-muted">
                  {selected.assignment.type === "paid"
                    ? "Confirm what the tester found before approving payment."
                    : "Check each private issue the tester found."}
                </p>
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
                  {selected.assignment.type === "paid" ? "Approve report and payment" : "Publish score"}
                </button>
              </div>
            ) : selected.assignment.type === "paid" && selected.assignment.payout_status === "approved" ? (
              <div className="mt-8 rounded-2xl bg-brand-success/10 p-6">
                <div className="text-xs font-black uppercase tracking-widest text-brand-success">Payment approved</div>
                <div className="mt-2 text-3xl font-black">
                  {formatPay(selected.assignment.tester_pay_cents, selected.assignment.tester_pay_currency)}
                </div>
                <button
                  type="button"
                  onClick={() => void markPaid()}
                  disabled={busy || !selected.source_request_id}
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-3 font-black text-white hover:bg-brand-accent disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Mark paid
                </button>
              </div>
            ) : selected.assignment.type === "paid" && selected.assignment.payout_status === "paid" ? (
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-brand-success/10 p-6 font-black">
                <Check className="h-6 w-6 text-brand-success" />
                {formatPay(selected.assignment.tester_pay_cents, selected.assignment.tester_pay_currency)} paid
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
                  <div className="text-sm font-black text-brand-accent">
                    {item.assignment_type === "paid"
                      ? formatPay(item.tester_pay_cents, item.tester_pay_currency)
                      : item.score === null || item.score === undefined
                        ? "Open"
                        : `${item.score}/100`}
                  </div>
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
