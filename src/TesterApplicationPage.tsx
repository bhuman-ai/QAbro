import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  GitBranch,
  Laptop,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  UserRound
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/types";
import BrandLogo from "./BrandLogo";
import alexTesterPhoto from "./assets/testers/alex.jpg";
import jordanTesterPhoto from "./assets/testers/jordan.jpg";
import mayaTesterPhoto from "./assets/testers/maya.jpg";
import ninaTesterPhoto from "./assets/testers/nina.jpg";

type SocialProvider = "google" | "github";
type ExperienceLevel = "" | "new" | "some" | "professional";
type Availability = "" | "weekdays" | "evenings_weekends" | "flexible";
type Device = "computer" | "ios" | "android";

type TesterApplication = {
  id: string;
  name: string;
  country: string;
  experience_level: ExperienceLevel;
  devices: Device[];
  availability: Availability;
  can_record: boolean;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  authReady: boolean;
  authorized: boolean;
  user: AuthUser | null;
  authMessage: string;
  authTone: "neutral" | "success" | "danger";
  onSocialSignIn: (provider: SocialProvider) => Promise<void>;
};

const TESTER_PHOTOS = [mayaTesterPhoto, jordanTesterPhoto, ninaTesterPhoto, alexTesterPhoto];

const DEVICE_OPTIONS: Array<{ value: Device; label: string; icon: typeof Laptop }> = [
  { value: "computer", label: "Computer", icon: Laptop },
  { value: "ios", label: "iPhone / iPad", icon: TabletSmartphone },
  { value: "android", label: "Android", icon: Smartphone }
];

const EXPERIENCE_OPTIONS: Array<{ value: Exclude<ExperienceLevel, "">; label: string; detail: string }> = [
  { value: "new", label: "New to testing", detail: "I notice what feels confusing." },
  { value: "some", label: "Some experience", detail: "I have reviewed apps or websites before." },
  { value: "professional", label: "Professional tester", detail: "QA or UX testing is part of my work." }
];

const AVAILABILITY_OPTIONS: Array<{ value: Exclude<Availability, "">; label: string }> = [
  { value: "weekdays", label: "Weekdays" },
  { value: "evenings_weekends", label: "Evenings + weekends" },
  { value: "flexible", label: "Flexible" }
];

function ProviderMark({ provider }: { provider: SocialProvider }) {
  if (provider === "google") {
    return (
      <img
        src="https://www.google.com/favicon.ico"
        className="h-5 w-5"
        alt=""
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-ink text-white">
      <GitBranch className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

function TesterFaces() {
  return (
    <div className="flex items-center justify-center -space-x-3" aria-label="Before Users Do testers">
      {TESTER_PHOTOS.map((photo, index) => (
        <img
          key={photo}
          src={photo}
          alt=""
          className="h-11 w-11 rounded-full border-[3px] border-brand-bg bg-white object-cover"
          style={{ zIndex: TESTER_PHOTOS.length - index }}
        />
      ))}
      <span className="relative z-0 flex h-11 min-w-11 items-center justify-center rounded-full border-[3px] border-brand-bg bg-brand-ink px-2 text-xs font-black text-white">
        +10
      </span>
    </div>
  );
}

function ChoiceCheck({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        selected ? "border-brand-accent bg-brand-accent text-white" : "border-slate-300 bg-white text-transparent"
      }`}
      aria-hidden="true"
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  );
}

export default function TesterApplicationPage({
  authReady,
  authorized,
  user,
  authMessage,
  authTone,
  onSocialSignIn
}: Props) {
  const [socialLoading, setSocialLoading] = useState<SocialProvider | "">("");
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [application, setApplication] = useState<TesterApplication | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [experience, setExperience] = useState<ExperienceLevel>("");
  const [availability, setAvailability] = useState<Availability>("");
  const [canRecord, setCanRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Become a tester | Before Users Do";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !authorized || !user?.id) {
      setApplicationLoading(false);
      return;
    }

    let cancelled = false;
    setApplicationLoading(true);
    setError("");

    apiFetch<{ ok: boolean; application: TesterApplication | null }>("/api/tester-applications")
      .then((response) => {
        if (!cancelled) {
          setApplication(response.application || null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load your application.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setApplicationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, authorized, user?.id]);

  async function startSocialSignIn(provider: SocialProvider) {
    setSocialLoading(provider);
    setError("");
    try {
      await onSocialSignIn(provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start sign-in.");
      setSocialLoading("");
    }
  }

  function toggleDevice(device: Device) {
    setDevices((current) =>
      current.includes(device) ? current.filter((item) => item !== device) : [...current, device]
    );
  }

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (country.trim().length < 2) {
      setError("Enter where you are based.");
      return;
    }
    if (!devices.length) {
      setError("Choose at least one device.");
      return;
    }
    if (!experience) {
      setError("Choose your testing experience.");
      return;
    }
    if (!availability) {
      setError("Choose when you are usually available.");
      return;
    }
    if (!canRecord) {
      setError("Confirm that you can record your screen and speak in English.");
      return;
    }

    setSubmitting(true);
    try {
      const source = new URLSearchParams(window.location.search).get("source") || "tester_application";
      const response = await apiFetch<{ ok: boolean; application: TesterApplication }>(
        "/api/tester-applications",
        {
          method: "POST",
          body: {
            name,
            country,
            devices,
            experience_level: experience,
            availability,
            can_record: canRecord,
            source
          }
        }
      );
      setApplication(response.application);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send your application.");
    } finally {
      setSubmitting(false);
    }
  }

  const resolvedError = error || (authTone === "danger" ? authMessage : "");

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink" data-app-shell="tester-application">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
        <a href="/" aria-label="Before Users Do homepage">
          <BrandLogo />
        </a>
        <a
          href="/"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-brand-ink"
          aria-label="Back to homepage"
          title="Back to homepage"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        {!authReady || applicationLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center" role="status">
            <LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" />
            <span className="sr-only">Loading application</span>
          </div>
        ) : application ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-xl text-center"
          >
            <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-brand-success text-white">
              <Check className="h-8 w-8" strokeWidth={3} />
            </div>
            <h1 className="text-4xl font-black sm:text-5xl">Choose your first test</h1>
            <p className="mx-auto mt-5 max-w-md text-lg font-semibold leading-relaxed text-slate-600">
              Your application is ready. Take one available qualification when you have a computer and about 15 minutes.
            </p>
            <a
              href="/testers/jobs"
              className="mt-9 inline-flex items-center gap-2 rounded-lg bg-brand-ink px-6 py-4 font-black text-white transition-colors hover:bg-brand-accent"
            >
              See available tests
              <ChevronRight className="h-5 w-5" />
            </a>
          </motion.section>
        ) : !authorized ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-xl text-center"
          >
            <TesterFaces />
            <h1 className="mt-7 text-4xl font-black leading-tight sm:text-6xl">Get paid to test new apps</h1>
            <p className="mx-auto mt-5 max-w-lg text-lg font-semibold leading-relaxed text-slate-600">
              Try new products, say what feels confusing, and send a screen recording.
            </p>

            <div className="mx-auto mt-9 grid max-w-md gap-3">
              <button
                type="button"
                onClick={() => startSocialSignIn("google")}
                disabled={Boolean(socialLoading)}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-brand-accent px-5 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-colors hover:bg-brand-ink disabled:cursor-wait disabled:opacity-60"
              >
                {socialLoading === "google" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ProviderMark provider="google" />}
                {socialLoading === "google" ? "Opening Google..." : "Continue with Google"}
              </button>
              <button
                type="button"
                onClick={() => startSocialSignIn("github")}
                disabled={Boolean(socialLoading)}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg border-2 border-brand-ink bg-white px-5 py-4 font-black text-brand-ink transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                {socialLoading === "github" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ProviderMark provider="github" />}
                {socialLoading === "github" ? "Opening GitHub..." : "Use GitHub instead"}
              </button>
            </div>

            <p className="mt-5 text-sm font-bold text-slate-500">About 2 minutes. No CV needed.</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              The first qualification test is unpaid. Approved customer tests are paid.
            </p>
            {resolvedError ? (
              <p className="mx-auto mt-5 max-w-md rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-brand-danger" role="alert">
                {resolvedError}
              </p>
            ) : null}
          </motion.section>
        ) : (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2 text-sm font-black text-brand-success">
                <ShieldCheck className="h-5 w-5" />
                Signed in as {user?.email}
              </div>
              <h1 className="text-4xl font-black leading-tight sm:text-5xl">A little about you</h1>
              <p className="mt-3 text-lg font-semibold text-slate-600">We use this to match you with the right tests.</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                The first qualification test is unpaid and creates your starter rating.
              </p>
            </div>

            <form onSubmit={submitApplication} className="space-y-8" noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Your name</span>
                  <span className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-brand-line bg-white px-4 focus-within:border-brand-accent">
                    <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Alex Smith"
                      autoComplete="name"
                      className="w-full bg-transparent py-3 font-bold outline-none"
                      required
                    />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Where are you based?</span>
                  <span className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-brand-line bg-white px-4 focus-within:border-brand-accent">
                    <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
                    <input
                      type="text"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      placeholder="Country"
                      autoComplete="country-name"
                      className="w-full bg-transparent py-3 font-bold outline-none"
                      required
                    />
                  </span>
                </label>
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-black">What can you test on?</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {DEVICE_OPTIONS.map(({ value, label, icon: Icon }) => {
                    const selected = devices.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleDevice(value)}
                        className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-4 py-3 text-left font-black transition-colors ${
                          selected
                            ? "border-brand-accent bg-brand-accent/10 text-brand-ink"
                            : "border-brand-line bg-white hover:border-slate-400"
                        }`}
                        aria-pressed={selected}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${selected ? "text-brand-accent" : "text-slate-400"}`} />
                        <span className="min-w-0 flex-1 text-sm">{label}</span>
                        <ChoiceCheck selected={selected} />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-black">Testing experience</legend>
                <div className="space-y-3">
                  {EXPERIENCE_OPTIONS.map((option) => {
                    const selected = experience === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-4 rounded-lg border-2 bg-white px-4 py-4 transition-colors ${
                          selected ? "border-brand-accent" : "border-brand-line hover:border-slate-400"
                        }`}
                      >
                        <input
                          type="radio"
                          name="experience"
                          value={option.value}
                          checked={selected}
                          onChange={() => setExperience(option.value)}
                          className="sr-only"
                        />
                        <ChoiceCheck selected={selected} />
                        <span>
                          <span className="block font-black">{option.label}</span>
                          <span className="mt-0.5 block text-sm font-semibold text-slate-500">{option.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-black">When are you usually available?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AVAILABILITY_OPTIONS.map((option) => {
                    const selected = availability === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex min-h-14 cursor-pointer items-center justify-center rounded-lg border-2 bg-white px-3 py-3 text-center text-sm font-black transition-colors ${
                          selected ? "border-brand-accent bg-brand-accent/10" : "border-brand-line hover:border-slate-400"
                        }`}
                      >
                        <input
                          type="radio"
                          name="availability"
                          value={option.value}
                          checked={selected}
                          onChange={() => setAvailability(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white px-4 py-4">
                <input
                  type="checkbox"
                  checked={canRecord}
                  onChange={(event) => setCanRecord(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-brand-accent"
                />
                <span className="font-bold leading-relaxed">
                  I’m comfortable recording my screen and speaking my thoughts in English.
                </span>
              </label>

              {resolvedError ? (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-brand-danger" role="alert">
                  {resolvedError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-brand-accent px-6 py-4 text-lg font-black text-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-colors hover:bg-brand-ink disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
                {submitting ? "Sending application..." : "Apply to be a tester"}
                {!submitting ? <ChevronRight className="h-5 w-5" /> : null}
              </button>
            </form>
          </motion.section>
        )}
      </main>
    </div>
  );
}
