import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Eye,
  KeyRound,
  MessageSquareText,
  Mic,
  MonitorUp,
  ShieldCheck,
  UserRoundCheck
} from "lucide-react";
import BrandLogo from "./BrandLogo";

const CODEX_CONFIG = `[mcp_servers.beforeusersdo-qa]
url = "https://mcp.beforeusersdo.com/mcp"
bearer_token_env_var = "BEFOREUSERSDO_MCP_TOKEN"`;

const JSON_CONFIG = `{
  "mcpServers": {
    "beforeusersdo-qa": {
      "url": "https://mcp.beforeusersdo.com/mcp",
      "headers": {
        "Authorization": "Bearer mcp_..."
      }
    }
  }
}`;

const PROMPTS = {
  ai: "Test this preview with BeforeUsersDo. Try the main flow and do not say done unless it passes.",
  self: "Start a manual BeforeUsersDo review for this preview. Install and verify the widget before giving me the review link.",
  human: "Have a real person test this preview with BeforeUsersDo. Use the work context you already have and ask me only for anything missing."
};

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-line bg-white px-3 text-sm font-black text-brand-ink transition hover:border-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      aria-live="polite"
    >
      {copied ? <Check className="h-4 w-4 text-brand-success" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Prompt({ children }: { children: string }) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg bg-brand-bg p-4 sm:flex-row sm:items-start sm:justify-between">
      <p className="text-sm font-bold leading-6 text-brand-ink">“{children}”</p>
      <div className="shrink-0">
        <CopyButton value={children} label="Copy prompt" />
      </div>
    </div>
  );
}

function SectionIntro({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-3 text-sm font-black uppercase text-brand-accent">{label}</div>
      <h2 className="text-3xl leading-tight text-brand-ink sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base font-semibold leading-7 text-brand-muted sm:text-lg">{body}</p>
    </div>
  );
}

function PublicDocsPage({
  authorized,
  onOpenMcpSettings
}: {
  authorized: boolean;
  onOpenMcpSettings: () => void;
}) {
  const [client, setClient] = useState<"codex" | "json">("codex");
  const config = client === "codex" ? CODEX_CONFIG : JSON_CONFIG;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Before Users Do Docs | Connect your coding agent";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink" data-app-shell="public-docs">
      <header className="border-b border-brand-line bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/" aria-label="Before Users Do home">
            <BrandLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-black md:flex" aria-label="Documentation">
            <a href="#start" className="hover:text-brand-accent">Set up</a>
            <a href="#ways-to-test" className="hover:text-brand-accent">Ways to test</a>
            <a href="#evidence" className="hover:text-brand-accent">What you get</a>
          </nav>
          <button
            type="button"
            onClick={onOpenMcpSettings}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-ink px-4 text-sm font-black text-white transition hover:bg-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent sm:px-5"
          >
            <KeyRound className="h-4 w-4" />
            {authorized ? "Open settings" : "Get MCP key"}
          </button>
        </div>
      </header>

      <main>
        <section className="px-4 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-5xl">
            <div className="max-w-4xl">
              <p className="mb-5 text-sm font-black uppercase text-brand-accent">Before Users Do docs</p>
              <h1 className="text-[clamp(2.75rem,7vw,5.75rem)] leading-[0.96] text-brand-ink">
                Test your app before you ship it.
              </h1>
              <p className="mt-7 max-w-3xl text-lg font-semibold leading-8 text-brand-muted sm:text-xl">
                Connect BUD once. Then your coding agent can test with AI, open a review for you, or send the app to a real person.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#start"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 font-black text-white transition hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  Connect your agent
                  <ArrowRight className="h-5 w-5" />
                </a>
                <a
                  href="#ways-to-test"
                  className="inline-flex min-h-14 items-center justify-center rounded-lg border border-brand-line bg-white px-6 font-black transition hover:border-brand-ink"
                >
                  See the three test types
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="start" className="scroll-mt-6 border-y border-brand-line bg-white px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionIntro
              label="Quick start"
              title="Connect in three steps"
              body="You need one BUD account and one MCP key. Your agent handles the testing details after that."
            />

            <ol className="mt-12 grid gap-8 border-y border-brand-line py-8 md:grid-cols-3 md:gap-10">
              <li>
                <div className="text-sm font-black text-brand-accent">1</div>
                <h3 className="mt-2 text-xl">Create your MCP key</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">Sign in, open Coding agents, and create a key. It is shown once.</p>
              </li>
              <li>
                <div className="text-sm font-black text-brand-accent">2</div>
                <h3 className="mt-2 text-xl">Add BUD to your agent</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">Paste the connection below into Codex or your MCP client.</p>
              </li>
              <li>
                <div className="text-sm font-black text-brand-accent">3</div>
                <h3 className="mt-2 text-xl">Ask for a test</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">Use normal language. BUD gets the URL and change context from your agent.</p>
              </li>
            </ol>

            <div className="mt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-2xl">Add the connection</h3>
                  <p className="mt-2 text-sm font-semibold text-brand-muted">Choose your client, then copy the config.</p>
                </div>
                <div className="inline-flex w-fit border-b border-brand-line" role="tablist" aria-label="MCP client">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={client === "codex"}
                    onClick={() => setClient("codex")}
                    className={`min-h-11 border-b-2 px-4 text-sm font-black ${client === "codex" ? "border-brand-accent text-brand-ink" : "border-transparent text-brand-muted hover:text-brand-ink"}`}
                  >
                    Codex
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={client === "json"}
                    onClick={() => setClient("json")}
                    className={`min-h-11 border-b-2 px-4 text-sm font-black ${client === "json" ? "border-brand-accent text-brand-ink" : "border-transparent text-brand-muted hover:text-brand-ink"}`}
                  >
                    JSON MCP clients
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg bg-brand-ink text-white">
                <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
                  <span className="text-sm font-bold text-slate-300">{client === "codex" ? "~/.codex/config.toml" : "MCP configuration"}</span>
                  <CopyButton value={config} label="Copy config" />
                </div>
                <pre className="overflow-x-auto p-5 text-[13px] leading-6 text-slate-100"><code>{config}</code></pre>
              </div>

              <div className="mt-5 flex flex-col gap-4 rounded-lg border border-brand-line bg-brand-bg p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-success" />
                  <p className="text-sm font-semibold leading-6 text-brand-muted">
                    {client === "codex"
                      ? "Set BEFOREUSERSDO_MCP_TOKEN to your new key, then restart Codex. Never commit the key."
                      : "Replace mcp_... with the key you just created. Never commit that config with the key inside."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenMcpSettings}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-ink px-5 text-sm font-black text-white hover:bg-brand-accent"
                >
                  <KeyRound className="h-4 w-4" />
                  Create MCP key
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="ways-to-test" className="scroll-mt-6 px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionIntro
              label="Ways to test"
              title="Ask for the kind of help you need"
              body="There are three modes. You do not need to remember tool names or fill out another form."
            />

            <div className="mt-12 border-y border-brand-line">
              <article className="grid gap-6 py-9 md:grid-cols-[220px_1fr] md:gap-12">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary"><Bot className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-2xl">AI tests it</h3>
                </div>
                <div>
                  <p className="font-semibold leading-7 text-brand-muted">Your agent sends the preview to BUD. A browser tries the flow, captures proof, and returns pass, needs a fix, needs review, or timed out.</p>
                  <Prompt>{PROMPTS.ai}</Prompt>
                </div>
              </article>

              <article className="grid gap-6 border-t border-brand-line py-9 md:grid-cols-[220px_1fr] md:gap-12">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent"><Eye className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-2xl">You test it</h3>
                </div>
                <div>
                  <p className="font-semibold leading-7 text-brand-muted">Your agent adds the BUD review widget to the preview. You open the app itself, draw on problems, leave comments, talk, and record your screen.</p>
                  <Prompt>{PROMPTS.self}</Prompt>
                </div>
              </article>

              <article className="grid gap-6 border-t border-brand-line py-9 md:grid-cols-[220px_1fr] md:gap-12">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success"><UserRoundCheck className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-2xl">A real person tests it</h3>
                </div>
                <div>
                  <p className="font-semibold leading-7 text-brand-muted">Your agent creates the request from its existing work context. BUD can offer it to eligible testers or send one private start link to a tester who is ready. The evidence-backed report comes back through MCP.</p>
                  <Prompt>{PROMPTS.human}</Prompt>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="evidence" className="scroll-mt-6 border-y border-brand-line bg-white px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionIntro
              label="What you get"
              title="Feedback your agent can act on"
              body="BUD keeps the report tied to the page, the user’s words, and the browser evidence that explains what happened."
            />

            <div className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {[
                [MonitorUp, "Screen proof", "Screenshots, recordings, drawings, and the exact page where each issue appeared."],
                [Mic, "What the tester said", "Voice becomes a transcript and is grouped into focused feedback points."],
                [ClipboardCheck, "What the browser saw", "Console errors, failed requests, page errors, viewport, and browser details."],
                [MessageSquareText, "Clear work items", "Each issue becomes a focused packet the coding agent can fix and test again."]
              ].map(([Icon, title, body]) => {
                const EvidenceIcon = Icon as typeof MonitorUp;
                return (
                  <div key={String(title)} className="flex gap-4">
                    <EvidenceIcon className="mt-1 h-5 w-5 shrink-0 text-brand-accent" />
                    <div>
                      <h3 className="text-lg">{String(title)}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">{String(body)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-14 border-t border-brand-line pt-10">
              <h3 className="text-2xl">For a real tester</h3>
              <div className="mt-6 grid gap-6 sm:grid-cols-4">
                {[
                  ["Prepared", "BUD turns the request into a safe tester brief."],
                  ["Matched", "A tester claims it or receives one private start link."],
                  ["Testing", "Evidence is being recorded."],
                  ["Complete", "The report is ready for your agent."]
                ].map(([title, body], index) => (
                  <div key={title} className="border-t-2 border-brand-ink pt-4">
                    <div className="text-xs font-black text-brand-accent">{index + 1}</div>
                    <div className="mt-2 font-black">{title}</div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionIntro
              label="Safety"
              title="Testing starts with the safest access"
              body="BUD never assumes permission to spend money, delete data, publish changes, or take another irreversible action."
            />
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              <div className="border-t border-brand-line pt-5">
                <h3 className="text-lg">Public pages</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">The default. The tester only sees what any visitor can open.</p>
              </div>
              <div className="border-t border-brand-line pt-5">
                <h3 className="text-lg">Fresh signup</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">Used only when you allow a tester to create a new test account.</p>
              </div>
              <div className="border-t border-brand-line pt-5">
                <h3 className="text-lg">Test account</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">Login details are encrypted and shown only through the assigned tester’s private link.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-brand-line bg-white px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionIntro
              label="Common questions"
              title="The short answers"
              body="Everything else can stay in your agent’s context."
            />
            <div className="mt-10 divide-y divide-brand-line border-y border-brand-line">
              {[
                ["What do I need to provide?", "Usually just a reachable preview URL. Your coding agent already knows what changed and what success should look like."],
                ["Can BUD test localhost?", "The tester needs a URL it can reach. Ask your agent to deploy a preview or create a secure tunnel first."],
                ["Does BUD change my code?", "BUD returns proof and focused work items. Your coding agent changes the code when you choose to start work."],
                ["Is an inconclusive test a pass?", "No. A timeout, blocked flow, or uncertain result is reported as inconclusive or needs review, never as a pass."],
                ["Do I fill out a form for a human tester?", "No. The MCP creates the request from the same URL and work context your agent already has."],
                ["Does the human tester need MCP?", "No. Testers either claim a test on the BUD website or open a private invite link, then record it in their browser."],
                ["How do tester qualifications and paid tests work?", "A new tester completes one unpaid 15-minute qualification for an initial verified score. Once approved, they can claim paid tests with the amount and expected time shown before starting."]
              ].map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
                    {question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-brand-muted transition group-open:rotate-180" />
                  </summary>
                  <p className="max-w-3xl pt-3 text-sm font-semibold leading-6 text-brand-muted">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="text-4xl sm:text-5xl">Connect once. Test every change.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold leading-7 text-brand-muted">Create your MCP key, add BUD to your coding agent, and ask for the kind of test you need.</p>
            <button
              type="button"
              onClick={onOpenMcpSettings}
              className="mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-7 font-black text-white transition hover:bg-brand-ink"
            >
              <KeyRound className="h-5 w-5" />
              Create MCP key
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-line bg-white px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <a href="/" aria-label="Before Users Do home"><BrandLogo /></a>
          <nav className="flex flex-wrap gap-5 text-sm font-black text-brand-muted" aria-label="Footer">
            <a href="/" className="hover:text-brand-ink">Home</a>
            <a href="/docs" aria-current="page" className="text-brand-ink">Docs</a>
            <button type="button" onClick={onOpenMcpSettings} className="hover:text-brand-ink">Dashboard</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default PublicDocsPage;
