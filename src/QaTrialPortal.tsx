import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Mic,
  MonitorUp,
  Square,
  Star,
  Video
} from "lucide-react";
import { apiFetch } from "./lib/api";
import type { QaTrialEvidence, QaTrialView } from "./types";

const RECORDING_SEGMENT_MS = 10_000;
const UPLOAD_CHUNK_BYTES = 1_400_000;

function supportedRecordingType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read recording segment"));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(value?: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTesterPay(trial: QaTrialView) {
  const cents = Math.max(0, Number(trial.assignment.tester_pay_cents) || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: trial.assignment.tester_pay_currency || "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

function evidenceUrl(entry: QaTrialEvidence, token: string) {
  if (!entry.url) return "";
  const url = new URL(entry.url, window.location.origin);
  url.searchParams.set("trial_token", token);
  return url.toString();
}

function TrialLogo() {
  return (
    <a href="/" className="inline-flex items-center gap-3 font-display text-xl font-black text-brand-ink">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-ink text-brand-accent">B</span>
      beforeusersdo<span className="text-brand-accent">.</span>
    </a>
  );
}

function TrialState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-accent/10 text-brand-accent">
        {icon}
      </div>
      <h2 className="mt-5 text-2xl font-black text-brand-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-brand-muted">{body}</p>
    </div>
  );
}

export default function QaTrialPortal({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const sessionId = String(params.get("session_id") || "").trim();
  const token = String(params.get("token") || "").trim();
  const [trial, setTrial] = useState<QaTrialView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSegments, setSavedSegments] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const segmentDoneRef = useRef<Promise<void> | null>(null);
  const uploadPromisesRef = useRef<Array<Promise<unknown>>>([]);
  const segmentIndexRef = useRef(0);
  const stopRequestedRef = useRef(false);

  async function loadTrial(silent = false) {
    if (!sessionId || !token) {
      setError("This trial link is incomplete.");
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
        params: { session_id: sessionId, token }
      });
      setTrial(response.trial);
      setNote((current) => current || response.trial.submission.note || "");
      setError("");
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "Could not open this trial.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrial();
    const timer = window.setInterval(() => {
      if (!recording) void loadTrial(true);
    }, 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token, recording]);

  useEffect(() => {
    return () => {
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function performAction(action: "accept" | "start" | "submit" | "rate", body: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
        method: "POST",
        body: { action, session_id: sessionId, token, ...body }
      });
      setTrial(response.trial);
      return response.trial;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this trial.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function uploadRecordingBlob(blob: Blob, segmentIndex: number) {
    const contentType = blob.type || "video/webm";
    const uploadId = `trial_${Date.now().toString(36)}_${segmentIndex.toString(36)}`;
    const chunks = [];
    let chunkIndex = 0;
    for (let offset = 0; offset < blob.size; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = blob.slice(offset, Math.min(blob.size, offset + UPLOAD_CHUNK_BYTES), contentType);
      const uploaded = await apiFetch<{ chunk: Record<string, unknown> }>("/api/manual-qa/widget-evidence-chunks", {
        method: "POST",
        body: {
          action: "chunk",
          session_id: sessionId,
          token,
          upload_id: uploadId,
          kind: "video",
          chunk_index: chunkIndex,
          content_type: contentType,
          filename: `trial-part-${segmentIndex + 1}.webm`,
          data_url: await blobToDataUrl(chunk)
        }
      });
      chunks.push(uploaded.chunk);
      chunkIndex += 1;
    }
    await apiFetch("/api/manual-qa/widget-evidence-chunks", {
      method: "POST",
      body: {
        action: "finish",
        session_id: sessionId,
        item_id: "freestyle",
        token,
        upload_id: uploadId,
        kind: "video",
        content_type: contentType,
        filename: `trial-recording-segment-${segmentIndex + 1}.webm`,
        label: `Trial recording segment ${segmentIndex + 1}`,
        chunks
      }
    });
    setSavedSegments((current) => current + 1);
  }

  function streamIsLive() {
    return Boolean(streamRef.current?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  function startSegment() {
    if (stopRequestedRef.current || !streamRef.current || !streamIsLive()) return;
    const chunks: Blob[] = [];
    const mimeType = supportedRecordingType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    let resolveSegment: () => void = () => undefined;
    segmentDoneRef.current = new Promise<void>((resolve) => {
      resolveSegment = resolve;
    });
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setRecordingMessage("A recording segment failed. Finish the test so saved evidence is kept.");
    };
    recorder.onstop = () => {
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
      const segmentIndex = segmentIndexRef.current++;
      if (chunks.length) {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
        const upload = uploadRecordingBlob(blob, segmentIndex).catch((caught) => {
          setError(caught instanceof Error ? caught.message : "A recording segment could not save.");
          throw caught;
        });
        uploadPromisesRef.current.push(upload);
      }
      resolveSegment();
      if (!stopRequestedRef.current && streamIsLive()) startSegment();
    };
    recorder.start(1000);
    segmentTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, RECORDING_SEGMENT_MS);
  }

  async function stopAndSaveRecording() {
    if (!recording && !streamRef.current) return true;
    setSaving(true);
    setRecordingMessage("Saving the last recording segment...");
    stopRequestedRef.current = true;
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (segmentDoneRef.current) await segmentDoneRef.current;
    const uploads = uploadPromisesRef.current.slice();
    const results = await Promise.allSettled(uploads);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setSaving(false);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      setRecordingMessage(`${failed.length} recording segment${failed.length === 1 ? "" : "s"} failed to save.`);
      return false;
    }
    setRecordingMessage("Recording saved.");
    return true;
  }

  async function startTest(acceptFirst = false) {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError("Use a current version of Chrome to record this trial.");
      return;
    }
    const targetWindow = window.open(trial?.target_url || "about:blank", "beforeusersdo-test-target");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (acceptFirst) {
        const accepted = await performAction("accept");
        if (!accepted) {
          display.getTracks().forEach((track) => track.stop());
          targetWindow?.close();
          return;
        }
      }
      const started = await performAction("start");
      if (!started) {
        display.getTracks().forEach((track) => track.stop());
        targetWindow?.close();
        return;
      }
      let mic: MediaStream | null = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        mic = null;
      }
      const stream = new MediaStream([
        ...display.getVideoTracks(),
        ...display.getAudioTracks(),
        ...(mic ? mic.getAudioTracks() : [])
      ]);
      streamRef.current = stream;
      stopRequestedRef.current = false;
      uploadPromisesRef.current = [];
      segmentIndexRef.current = started.submission.evidence_media.filter((entry) => entry.kind === "video").length;
      setSavedSegments(segmentIndexRef.current);
      setRecording(true);
      setRecordingMessage("Recording screen and voice. Saved segments will appear as you test.");
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopAndSaveRecording();
      });
      startSegment();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start screen recording.");
    }
  }

  async function finishTrial() {
    const saved = await stopAndSaveRecording();
    if (!saved) return;
    const submitted = await performAction("submit", {
      note,
      widget_context: {
        page_url: trial?.target_url || null,
        page_title: trial?.product_name || null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          device_pixel_ratio: window.devicePixelRatio || 1
        }
      }
    });
    if (submitted) setRecordingMessage("");
  }

  async function submitRating() {
    if (!rating) return;
    await performAction("rate", { score: rating, note: ratingNote });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" />
      </div>
    );
  }

  if (!trial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
        <div className="max-w-md text-center">
          <CircleAlert className="mx-auto h-10 w-10 text-brand-danger" />
          <h1 className="mt-4 text-2xl font-black">This trial link does not work</h1>
          <p className="mt-2 text-sm font-semibold text-brand-muted">{error || "Ask BeforeUsersDo for a fresh link."}</p>
        </div>
      </div>
    );
  }

  const submitted = Boolean(trial.submission.submitted_at);
  const paidAssignment = trial.assignment.type === "paid";
  const otherPersonAccepted = trial.role === "tester" ? trial.consent.lead_accepted : trial.consent.tester_accepted;
  const videoEvidence = trial.submission.evidence_media.filter((entry) => entry.kind === "video");

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <TrialLogo />
          <span className="text-xs font-black uppercase tracking-widest text-brand-muted">
            {trial.role === "tester" ? (paidAssignment ? "Paid test" : "Tester trial") : "Product test"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-brand-line bg-white p-6 shadow-sm sm:p-8">
          <div className="text-xs font-black uppercase tracking-widest text-brand-accent">{trial.product_name}</div>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            {trial.role === "tester"
              ? paidAssignment
                ? `Complete this ${formatTesterPay(trial)} test`
                : "Complete your first verified test"
              : "Your product test"}
          </h1>
          <p className="mt-4 text-base font-semibold leading-7 text-brand-muted">{trial.test_focus}</p>

          {trial.role === "tester" ? (
            <div className="mt-7 border-y border-brand-line py-5">
              <div className="flex items-center gap-2 text-sm font-black">
                <KeyRound className="h-4 w-4 text-brand-accent" />
                Access for this test
              </div>
              <p className="mt-2 text-sm font-semibold text-brand-muted">
                {trial.access.mode === "test_account"
                  ? "Use the private test account below."
                  : trial.access.mode === "signup_allowed"
                    ? "You may create a fresh test account."
                    : "Stay on pages that work without signing in."}
              </p>
              {trial.access.credentials ? (
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-black uppercase text-brand-muted">Username</dt>
                    <dd className="mt-1 select-all break-all font-mono font-bold">{trial.access.credentials.username}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase text-brand-muted">Password</dt>
                    <dd className="mt-1 select-all break-all font-mono font-bold">{trial.access.credentials.password}</dd>
                  </div>
                </dl>
              ) : null}
              {trial.access.login_url ? (
                <a href={trial.access.login_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-brand-accent hover:text-brand-ink">
                  Open sign in
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              {trial.access.prohibited_actions.length ? (
                <p className="mt-4 text-xs font-bold leading-5 text-brand-muted">
                  {trial.access.prohibited_actions.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {!trial.consent.accepted ? (
            trial.role === "tester" ? (
              <div className="mt-8 border-t border-brand-line pt-8">
                <p className="text-sm font-semibold leading-6 text-brand-muted">
                  {paidAssignment
                    ? `This ${trial.duration_minutes}-minute test pays ${formatTesterPay(trial)} after Before Users Do reviews the submitted recording and report.`
                    : `This ${trial.duration_minutes}-minute qualification is unpaid. Your recording and report are shared with the product owner and scored for your first verified result.`}
                </p>
                <button
                  type="button"
                  onClick={() => void startTest(true)}
                  disabled={busy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-brand-accent px-6 py-5 text-lg font-black text-white transition hover:bg-brand-ink disabled:opacity-60"
                >
                  {busy ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <MonitorUp className="h-6 w-6" />}
                  {paidAssignment ? "Start paid test" : `Start ${trial.duration_minutes}-minute test`}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mt-8 rounded-2xl bg-brand-bg p-6">
                <h2 className="text-xl font-black">Approve this test</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
                  {paidAssignment
                    ? "An approved tester will follow your brief and record the full test. The report and evidence will appear here when it is submitted."
                    : "A new tester will review your product as their first BUD qualification. You receive the complete test for free and can rate how useful it was."}
                </p>
                <button
                  type="button"
                  onClick={() => void performAction("accept")}
                  disabled={busy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white transition hover:bg-brand-accent disabled:opacity-60 sm:w-auto"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Approve test
                </button>
              </div>
            )
          ) : !otherPersonAccepted ? (
            <TrialState
              icon={<LoaderCircle className="h-7 w-7 animate-spin" />}
              title="Waiting for the other person"
              body="This page updates automatically once both people accept."
            />
          ) : trial.role === "lead" && !submitted ? (
            <TrialState
              icon={<MonitorUp className="h-7 w-7" />}
              title={trial.status === "in_progress" ? "Testing is underway" : "Your test is ready"}
              body="The tester will record the flow and send the report here when finished."
            />
          ) : trial.role === "tester" && !submitted ? (
            <div className="mt-8 border-t border-brand-line pt-8">
              {!recording ? (
                <button
                  type="button"
                  onClick={() => void startTest()}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-brand-accent px-6 py-5 text-lg font-black text-white transition hover:bg-brand-ink disabled:opacity-60"
                >
                  <MonitorUp className="h-6 w-6" />
                  {trial.status === "in_progress" ? "Resume recording" : `Start ${trial.duration_minutes}-minute test`}
                  <ArrowRight className="h-5 w-5" />
                </button>
              ) : null}

              {recording || trial.status === "in_progress" ? (
                <div className="rounded-2xl bg-brand-ink p-5 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        {recording ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-danger opacity-70" /> : null}
                        <span className={`relative inline-flex h-3 w-3 rounded-full ${recording ? "bg-brand-danger" : "bg-brand-success"}`} />
                      </span>
                      <div>
                        <div className="font-black">{recording ? "Recording screen and voice" : "Recording paused"}</div>
                        <div className="mt-1 text-xs font-semibold text-white/60">{savedSegments} segment{savedSegments === 1 ? "" : "s"} saved</div>
                      </div>
                    </div>
                    {recording ? (
                      <button
                        type="button"
                        onClick={() => void stopAndSaveRecording()}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                        aria-label="Stop recording"
                      >
                        <Square className="h-5 w-5 fill-current" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-white/60">
                    <Mic className="h-4 w-4" />
                    Talk naturally while you use the product. Each segment saves as you go.
                  </div>
                </div>
              ) : null}

              <label className="mt-6 block">
                <span className="text-sm font-black">Anything else?</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional note for the product owner"
                  className="mt-2 min-h-28 w-full rounded-xl border border-brand-line bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-brand-accent"
                />
              </label>

              <button
                type="button"
                onClick={() => void finishTrial()}
                disabled={busy || saving || (!recording && !savedSegments && !trial.submission.evidence_media.length)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white transition hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy || saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                Finish and send
              </button>
              {recordingMessage ? <p className="mt-3 text-sm font-semibold text-brand-muted">{recordingMessage}</p> : null}
            </div>
          ) : (
            <div className="mt-8 border-t border-brand-line pt-8">
              <div className="flex items-center gap-3 rounded-2xl bg-brand-success/10 p-4 text-brand-ink">
                <Check className="h-6 w-6 text-brand-success" />
                <div>
                  <div className="font-black">Test submitted</div>
                  <div className="text-sm font-semibold text-brand-muted">{videoEvidence.length} recording{videoEvidence.length === 1 ? "" : "s"} saved</div>
                </div>
              </div>

              {trial.submission.note ? (
                <div className="mt-5 rounded-2xl border border-brand-line p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-muted">Tester note</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{trial.submission.note}</p>
                </div>
              ) : null}

              {videoEvidence.length ? (
                <div className="mt-6 space-y-4">
                  <h2 className="text-xl font-black">Recordings</h2>
                  {videoEvidence.map((entry, index) => (
                    <div key={entry.evidence_id || `${entry.url}-${index}`} className="overflow-hidden rounded-2xl border border-brand-line bg-brand-ink">
                      <video controls preload="metadata" className="aspect-video w-full" src={evidenceUrl(entry, token)} />
                      <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 text-xs font-bold text-brand-muted">
                        <span>{entry.label || `Recording ${index + 1}`}</span>
                        <span>{formatBytes(entry.byte_length)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {paidAssignment && trial.role === "tester" ? (
                <div className="mt-6 rounded-2xl border border-brand-success/30 bg-brand-success/10 p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-success">{formatTesterPay(trial)}</div>
                  <div className="mt-2 text-xl font-black">
                    {trial.assignment.payout_status === "paid"
                      ? "Paid"
                      : trial.assignment.payout_status === "approved"
                        ? "Payment approved"
                        : "Report under review"}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-brand-muted">
                    {trial.assignment.payout_status === "paid"
                      ? "Before Users Do recorded this payment as sent."
                      : trial.assignment.payout_status === "approved"
                        ? "Your report passed review and is ready for payment."
                        : "Before Users Do will review the report before approving payment."}
                  </p>
                </div>
              ) : !paidAssignment && trial.qualification.status === "verified" ? (
                <div className="mt-6 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-accent">BUD Verified Trial</div>
                  <div className="mt-2 text-4xl font-black">{trial.qualification.score}/100</div>
                  {trial.qualification.reviewer_note ? <p className="mt-2 text-sm font-semibold text-brand-muted">{trial.qualification.reviewer_note}</p> : null}
                </div>
              ) : trial.role === "tester" ? (
                <p className="mt-5 text-sm font-semibold text-brand-muted">BUD is reviewing your evidence for your first score.</p>
              ) : null}

              {trial.role === "lead" && !trial.lead_rating.score ? (
                <div className="mt-8 rounded-2xl bg-brand-bg p-6">
                  <h2 className="text-xl font-black">Was this useful?</h2>
                  <div className="mt-4 flex gap-2" role="group" aria-label="Rate this test">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand-line bg-white"
                        aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      >
                        <Star className={`h-6 w-6 ${value <= rating ? "fill-brand-warning text-brand-warning" : "text-slate-300"}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={ratingNote}
                    onChange={(event) => setRatingNote(event.target.value)}
                    placeholder="Optional note"
                    className="mt-4 min-h-24 w-full rounded-xl border border-brand-line bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-brand-accent"
                  />
                  <button
                    type="button"
                    disabled={!rating || busy}
                    onClick={() => void submitRating()}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-3 font-black text-white disabled:opacity-40"
                  >
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Send rating
                  </button>
                </div>
              ) : trial.role === "lead" && trial.lead_rating.score ? (
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-bg p-5">
                  <Star className="h-6 w-6 fill-brand-warning text-brand-warning" />
                  <span className="font-black">You rated this {trial.lead_rating.score}/5</span>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-danger/20 bg-brand-danger/10 px-4 py-3 text-sm font-semibold text-brand-danger">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <a href={trial.target_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            Open product
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-brand-muted">
          <Video className="h-4 w-4" />
          Recordings are private to this trial.
        </div>
      </main>
    </div>
  );
}
