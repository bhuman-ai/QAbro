import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Laptop,
  LoaderCircle,
  Mail,
  MapPin,
  Smartphone,
  UserRoundCheck
} from "lucide-react";
import { apiFetch } from "./lib/api";

type ApplicationStatus = "applied" | "invited" | "qualified" | "approved" | "declined";

type TesterApplication = {
  id: string;
  owner_email: string;
  name: string;
  country: string;
  experience_level: "new" | "some" | "professional";
  devices: Array<"computer" | "ios" | "android">;
  availability: "weekdays" | "evenings_weekends" | "flexible";
  can_record: boolean;
  status: ApplicationStatus;
  source: string;
  qualification_session_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "New application",
  invited: "Qualification sent",
  qualified: "Passed qualification",
  approved: "Approved for paid tests",
  declined: "Declined"
};

const EXPERIENCE_LABELS: Record<TesterApplication["experience_level"], string> = {
  new: "New to testing",
  some: "Some testing experience",
  professional: "Professional tester"
};

const AVAILABILITY_LABELS: Record<TesterApplication["availability"], string> = {
  weekdays: "Weekdays",
  evenings_weekends: "Evenings and weekends",
  flexible: "Flexible"
};

const DEVICE_LABELS: Record<TesterApplication["devices"][number], string> = {
  computer: "Computer",
  ios: "iPhone / iPad",
  android: "Android"
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusTone(status: ApplicationStatus) {
  if (status === "approved") return "bg-brand-success";
  if (status === "qualified") return "bg-brand-accent";
  if (status === "declined") return "bg-brand-danger";
  if (status === "invited") return "bg-brand-warning";
  return "bg-brand-secondary";
}

export default function TesterApplicationsAdmin({ search }: { search: string }) {
  const initialId = String(new URLSearchParams(search).get("application_id") || "").trim();
  const [items, setItems] = useState<TesterApplication[]>([]);
  const [selectedId, setSelectedId] = useState(initialId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = items.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    apiFetch<{ ok: boolean; items: TesterApplication[] }>("/api/tester-applications", {
      params: { scope: "admin", limit: 200 }
    })
      .then((response) => {
        if (active) setItems(response.items || []);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load tester applications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openApplication(id: string) {
    setSelectedId(id);
    const next = new URL(window.location.href);
    next.searchParams.set("application_id", id);
    window.history.replaceState({}, "", next);
  }

  function closeApplication() {
    setSelectedId("");
    const next = new URL(window.location.href);
    next.searchParams.delete("application_id");
    window.history.replaceState({}, "", next);
  }

  async function updateStatus(status: ApplicationStatus) {
    if (!selected) return;
    if (status === "declined" && !window.confirm(`Decline ${selected.name}'s application?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch<{ ok: boolean; application: TesterApplication }>("/api/tester-applications", {
        method: "PATCH",
        body: {
          id: selected.id,
          status,
          ...(status !== "applied" && selected.qualification_session_id
            ? { qualification_session_id: selected.qualification_session_id }
            : {})
        }
      });
      setItems((current) => current.map((item) => (item.id === selected.id ? response.application : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this application.");
    } finally {
      setBusy(false);
    }
  }

  function qualificationHref(application: TesterApplication) {
    const params = new URLSearchParams({
      tester_application_id: application.id,
      tester_name: application.name,
      tester_email: application.owner_email
    });
    return `/trials?${params.toString()}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" />
        <span className="sr-only">Loading tester applications</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </a>
          <a href="/trials" className="text-sm font-black text-brand-accent hover:text-brand-ink">
            Qualification trials
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {selected ? (
          <section className="overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm">
            <div className="border-b border-brand-line p-6 sm:p-8">
              <button type="button" onClick={closeApplication} className="inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
                <ArrowLeft className="h-4 w-4" />
                All applicants
              </button>
              <div className="mt-7 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent">
                  <UserRoundCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-black text-brand-muted">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusTone(selected.status)}`} />
                    {STATUS_LABELS[selected.status]}
                  </div>
                  <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">{selected.name}</h1>
                  <a href={`mailto:${selected.owner_email}`} className="mt-2 inline-flex items-center gap-2 break-all text-sm font-semibold text-brand-muted hover:text-brand-accent">
                    <Mail className="h-4 w-4 shrink-0" />
                    {selected.owner_email}
                  </a>
                </div>
              </div>
            </div>

            <div className="grid gap-6 border-b border-brand-line p-6 sm:grid-cols-2 sm:p-8">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-brand-muted">Based in</div>
                <div className="mt-2 flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-brand-accent" /> {selected.country}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-brand-muted">Experience</div>
                <div className="mt-2 font-bold">{EXPERIENCE_LABELS[selected.experience_level]}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-brand-muted">Devices</div>
                <div className="mt-2 flex items-center gap-2 font-bold">
                  {selected.devices.includes("computer") ? <Laptop className="h-4 w-4 text-brand-accent" /> : <Smartphone className="h-4 w-4 text-brand-accent" />}
                  {selected.devices.map((device) => DEVICE_LABELS[device]).join(", ")}
                </div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-brand-muted">Usually available</div>
                <div className="mt-2 font-bold">{AVAILABILITY_LABELS[selected.availability]}</div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              {selected.status === "applied" ? (
                <a href={qualificationHref(selected)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-4 font-black text-white transition-colors hover:bg-brand-ink sm:w-auto">
                  Set up qualification
                  <ArrowRight className="h-5 w-5" />
                </a>
              ) : selected.status === "invited" && selected.qualification_session_id ? (
                <a href={`/trials?session_id=${encodeURIComponent(selected.qualification_session_id)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white transition-colors hover:bg-brand-accent sm:w-auto">
                  Open qualification
                  <ArrowRight className="h-5 w-5" />
                </a>
              ) : selected.status === "qualified" ? (
                <button type="button" onClick={() => void updateStatus("approved")} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-success px-5 py-4 font-black text-white disabled:opacity-60 sm:w-auto">
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Approve for paid tests
                </button>
              ) : selected.status === "declined" ? (
                <button type="button" onClick={() => void updateStatus("applied")} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white disabled:opacity-60 sm:w-auto">
                  Reopen application
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 font-black text-brand-success"><Check className="h-5 w-5" /> Ready for paid tests</div>
              )}

              {selected.status !== "approved" && selected.status !== "declined" ? (
                <details className="mt-6 max-w-sm border-t border-brand-line pt-4">
                  <summary className="cursor-pointer text-sm font-black text-brand-muted">More actions</summary>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {selected.status === "invited" ? (
                      <button type="button" onClick={() => void updateStatus("qualified")} disabled={busy} className="rounded-lg border border-brand-line px-4 py-2 text-sm font-black hover:border-brand-accent">
                        Mark qualification passed
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void updateStatus("declined")} disabled={busy} className="rounded-lg border border-brand-danger/30 px-4 py-2 text-sm font-black text-brand-danger hover:bg-brand-danger/5">
                      Decline application
                    </button>
                  </div>
                </details>
              ) : null}

              <div className="mt-6 text-xs font-semibold text-brand-muted">
                Applied {formatDate(selected.created_at)} via {selected.source.replaceAll("_", " ")}.
              </div>
            </div>
          </section>
        ) : (
          <section>
            <div className="flex items-end justify-between gap-4 border-b border-brand-line pb-6">
              <div>
                <h1 className="text-4xl font-black">Tester applicants</h1>
                <p className="mt-2 text-sm font-semibold text-brand-muted">Review each person and send one qualification test.</p>
              </div>
            </div>

            {items.length ? (
              <div className="divide-y divide-brand-line border-b border-brand-line bg-white">
                {items.map((item) => (
                  <button key={item.id} type="button" onClick={() => openApplication(item.id)} className="flex w-full items-center justify-between gap-5 px-4 py-5 text-left transition-colors hover:bg-brand-accent/5 sm:px-6">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black">{item.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-brand-muted">
                        <span>{item.country}</span>
                        <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusTone(item.status)}`} /> {STATUS_LABELS[item.status]}</span>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-brand-accent">Review <ArrowRight className="h-4 w-4" /></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <UserRoundCheck className="mx-auto h-10 w-10 text-brand-muted" />
                <h2 className="mt-5 text-2xl font-black">No applications yet</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-brand-muted">New tester applications will appear here.</p>
                <a href="/testers/apply" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-brand-accent hover:text-brand-ink">Open application page <ArrowRight className="h-4 w-4" /></a>
              </div>
            )}
          </section>
        )}

        {error ? <div className="mt-6 rounded-xl border border-brand-danger/20 bg-brand-danger/10 px-4 py-3 text-sm font-semibold text-brand-danger">{error}</div> : null}
      </main>
    </div>
  );
}
