import { useEffect } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Code2,
  FileWarning,
  KeyRound,
  MonitorCheck,
  Network,
  ShieldCheck,
  SquareTerminal
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import { trackOfferViewed } from "./lib/acquisition";

const PAGE_TITLE = "QA MCP Server for Coding Agents | Before Users Do";
const PAGE_DESCRIPTION =
  "Give Codex, Cursor, and other MCP-capable coding agents browser-backed QA with screenshots, console and network evidence, and fix-ready reports.";
const PAGE_URL = "https://beforeusersdo.com/qa-mcp";

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) return () => {};
  const previous = element.getAttribute(attribute);
  element.setAttribute(attribute, value);
  return () => {
    if (previous === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, previous);
  };
}

function usePageMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    const restore = [
      setMeta('meta[name="description"]', "content", PAGE_DESCRIPTION),
      setMeta('meta[property="og:title"]', "content", PAGE_TITLE),
      setMeta('meta[property="og:description"]', "content", PAGE_DESCRIPTION),
      setMeta('meta[property="og:url"]', "content", PAGE_URL)
    ];
    void trackOfferViewed("qa_mcp", "/qa-mcp");
    return () => {
      document.title = previousTitle;
      restore.forEach((callback) => callback());
    };
  }, []);
}

function QaMcpPage({
  authorized,
  onOpenMcpSettings
}: {
  authorized: boolean;
  onOpenMcpSettings: () => void;
}) {
  usePageMetadata();

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink" data-app-shell="qa-mcp">
      <header className="border-b border-brand-line bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/" aria-label="Before Users Do home">
            <BrandLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-black md:flex" aria-label="QA MCP">
            <a href="#difference" className="hover:text-brand-accent">Why QA MCP</a>
            <a href="#workflow" className="hover:text-brand-accent">How it works</a>
            <a href="#evidence" className="hover:text-brand-accent">Evidence</a>
          </nav>
          <button
            type="button"
            onClick={onOpenMcpSettings}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-ink px-4 text-sm font-black text-white transition hover:bg-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent sm:px-5"
          >
            <KeyRound className="h-4 w-4" />
            <span className="sm:hidden">{authorized ? "MCP setup" : "Install"}</span>
            <span className="hidden sm:inline">{authorized ? "Open MCP settings" : "Install QA MCP"}</span>
          </button>
        </div>
      </header>

      <main>
        <section className="px-4 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
          <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
            <div>
              <p className="mb-5 text-sm font-black uppercase tracking-[0.12em] text-brand-accent">
                Hosted QA MCP for coding agents
              </p>
              <h1 className="max-w-4xl text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.055em] text-brand-ink">
                Your agent wrote it. Make it prove it.
              </h1>
              <p className="mt-7 max-w-3xl text-lg font-semibold leading-8 text-brand-muted sm:text-xl">
                Before Users Do gives Codex, Cursor, and compatible MCP clients a real QA handoff:
                test the live flow, capture what happened, and return a report the agent can fix.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onOpenMcpSettings}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 font-black text-white transition hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  Install BeforeUsersDo
                  <ArrowRight className="h-5 w-5" />
                </button>
                <a
                  href="/docs"
                  className="inline-flex min-h-14 items-center justify-center rounded-lg border border-brand-line bg-white px-6 font-black transition hover:border-brand-ink"
                >
                  Read the setup guide
                </a>
              </div>
            </div>

            <div className="border-y-2 border-brand-ink bg-white py-3">
              {[
                ["Input", "A reachable preview and the change context"],
                ["Run", "A real browser follows the customer flow"],
                ["Return", "Evidence, verdict, and fix-ready work"]
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={`grid grid-cols-[82px_1fr] gap-4 px-2 py-5 ${index ? "border-t border-brand-line" : ""}`}
                >
                  <span className="text-xs font-black uppercase tracking-widest text-brand-accent">{label}</span>
                  <span className="font-black leading-6">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="difference" className="scroll-mt-6 border-y border-brand-line bg-white px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.12em] text-brand-accent">The difference</p>
                <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">Browser control is the floor, not the finish line.</h2>
              </div>
              <div className="space-y-8 text-lg font-semibold leading-8 text-brand-muted">
                <p>
                  A general browser tool can click and type. QA also needs a test goal, a clear outcome,
                  evidence tied to the failed step, and a clean handoff back to the code.
                </p>
                <p>
                  Before Users Do wraps browser execution in that QA contract. Your agent gets
                  <strong className="text-brand-ink"> pass, needs a fix, needs review, or timed out</strong>—not
                  a vague claim that the page looked fine.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-6 px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-brand-accent">One QA loop</p>
              <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">From “done” to evidence in three moves.</h2>
            </div>
            <ol className="mt-12 border-y-2 border-brand-ink">
              {[
                {
                  number: "01",
                  icon: Code2,
                  title: "The agent sends the feature",
                  body: "It passes the reachable preview, expected behavior, and the implementation context it already has."
                },
                {
                  number: "02",
                  icon: MonitorCheck,
                  title: "Before Users Do runs the flow",
                  body: "A browser follows the journey and records the page state, screenshots, console errors, and failed requests."
                },
                {
                  number: "03",
                  icon: SquareTerminal,
                  title: "The agent gets work it can use",
                  body: "The result comes back through MCP with a verdict, supporting proof, and focused fixes."
                }
              ].map(({ number, icon: Icon, title, body }, index) => (
                <li
                  key={number}
                  className={`grid gap-5 py-8 md:grid-cols-[72px_52px_0.8fr_1.2fr] md:items-start md:gap-8 ${index ? "border-t border-brand-line" : ""}`}
                >
                  <span className="text-sm font-black text-brand-accent">{number}</span>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <h3 className="text-2xl leading-tight">{title}</h3>
                  <p className="font-semibold leading-7 text-brand-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="evidence" className="scroll-mt-6 bg-brand-ink px-4 py-20 text-white sm:px-8 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.12em] text-violet-300">What comes back</p>
                <h2 className="mt-4 text-4xl leading-tight text-white sm:text-5xl">Proof your coding agent can inspect.</h2>
                <p className="mt-5 font-semibold leading-7 text-slate-300">
                  Each finding stays tied to the browser state that produced it.
                </p>
              </div>
              <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {[
                  [MonitorCheck, "Screen evidence", "Screenshots, recordings, and the exact page where the issue appeared."],
                  [FileWarning, "Runtime failures", "Page errors and console evidence instead of reconstructed guesses."],
                  [Network, "Network proof", "Failed requests and response context connected to the broken step."],
                  [CheckCircle2, "A usable verdict", "Pass, fix, review, or timeout with the reason made explicit."]
                ].map(([Icon, title, body]) => {
                  const EvidenceIcon = Icon as typeof MonitorCheck;
                  return (
                    <article key={String(title)} className="border-t border-white/20 pt-5">
                      <EvidenceIcon className="h-5 w-5 text-violet-300" />
                      <h3 className="mt-4 text-xl text-white">{String(title)}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{String(body)}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-brand-line bg-white px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.12em] text-brand-accent">Short answers</p>
                <h2 className="mt-4 text-4xl leading-tight">QA MCP questions.</h2>
              </div>
              <div className="divide-y divide-brand-line border-y border-brand-line">
                {[
                  [
                    "What is a QA MCP server?",
                    "It exposes QA work as tools a coding agent can call. Before Users Do accepts a feature and preview, runs browser-backed testing, and returns evidence through the same agent workflow."
                  ],
                  [
                    "Do I need an existing Playwright test suite?",
                    "No for the first exploratory pass. A reachable preview and the expected behavior are normally enough. Durable automated tests still matter for known regressions."
                  ],
                  [
                    "Which coding agents can connect?",
                    "Codex and MCP clients that support a remote streamable-HTTP server can connect with the hosted endpoint and a Before Users Do MCP key."
                  ],
                  [
                    "Does a clean run always mean pass?",
                    "No. Inconclusive work stays inconclusive, and a timed-out or blocked flow is never relabeled as a pass."
                  ]
                ].map(([question, answer]) => (
                  <details key={question} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-black">
                      {question}
                      <CircleDot className="h-4 w-4 shrink-0 text-brand-accent" />
                    </summary>
                    <p className="max-w-3xl pt-3 text-sm font-semibold leading-6 text-brand-muted">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-4xl sm:text-5xl">Give “done” a QA gate.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold leading-7 text-brand-muted">
              Connect once, then ask your coding agent to test the next feature before users find the break.
            </p>
            <button
              type="button"
              onClick={onOpenMcpSettings}
              className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-7 font-black text-white transition hover:bg-brand-ink"
            >
              <ShieldCheck className="h-5 w-5" />
              Install BeforeUsersDo
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-line bg-white px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <a href="/" aria-label="Before Users Do home"><BrandLogo /></a>
          <nav className="flex flex-wrap gap-5 text-sm font-black text-brand-muted" aria-label="Footer">
            <a href="/" className="hover:text-brand-ink">Home</a>
            <a href="/qa-mcp" aria-current="page" className="text-brand-ink">QA MCP</a>
            <a href="/docs" className="hover:text-brand-ink">Docs</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default QaMcpPage;
