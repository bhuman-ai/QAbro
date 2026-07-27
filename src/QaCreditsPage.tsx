import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, WalletCards } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { apiFetch } from "./lib/api";

type CreditBalance = {
  balance_cents: number;
  currency: string;
};

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

export default function QaCreditsPage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [testFocus, setTestFocus] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "QA credit | Before Users Do";
    apiFetch<CreditBalance>("/api/qa-credits")
      .then(setBalance)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load QA credit."));
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amountCents = Math.round(Number(amount) * 100);
      const response = await apiFetch<{ balance_cents: number; currency: string }>("/api/qa-credits", {
        method: "POST",
        body: {
          target_url: targetUrl,
          test_focus: testFocus,
          review_type: "specific_flow",
          amount_cents: amountCents
        }
      });
      setBalance({ balance_cents: response.balance_cents, currency: response.currency });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request this test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLogo />
          <a href="/testers/jobs" className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            <ArrowLeft className="h-4 w-4" />
            Tester jobs
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex items-center gap-3 text-brand-success">
          <WalletCards className="h-6 w-6" />
          <span className="text-sm font-black uppercase tracking-wider">QA credit</span>
        </div>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">
          {balance ? formatMoney(balance.balance_cents, balance.currency) : "Loading…"}
        </h1>
        <p className="mt-3 font-semibold leading-7 text-brand-muted">
          Use credit you earned from testing to get a real person to test your product.
        </p>

        {submitted ? (
          <section className="mt-10 border-2 border-brand-ink bg-white p-6 shadow-shell sm:p-8">
            <Check className="h-8 w-8 text-brand-success" />
            <h2 className="mt-4 text-2xl font-black">Your QA request is in</h2>
            <p className="mt-3 font-semibold leading-7 text-brand-muted">
              We’ll prepare the brief and email you when a tester claims it.
            </p>
            <a href="/testers/jobs" className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-brand-accent px-5 py-3 font-black text-white hover:bg-brand-ink">
              Back to tester jobs
            </a>
          </section>
        ) : (
          <form onSubmit={submitRequest} className="mt-10 grid gap-6 border-2 border-brand-ink bg-white p-6 shadow-shell sm:p-8">
            <label className="grid gap-2 text-sm font-black">
              Product URL
              <input
                required
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://yourproduct.com"
                className="min-h-12 rounded-lg border border-brand-line px-4 font-semibold outline-none focus:border-brand-accent"
              />
            </label>
            <label className="grid gap-2 text-sm font-black">
              What should they try?
              <textarea
                required
                value={testFocus}
                onChange={(event) => setTestFocus(event.target.value)}
                placeholder="Sign up and create the first project."
                className="min-h-28 rounded-lg border border-brand-line px-4 py-3 font-semibold outline-none focus:border-brand-accent"
              />
            </label>
            <label className="grid gap-2 text-sm font-black">
              QA credit to spend
              <div className="flex min-h-12 items-center rounded-lg border border-brand-line px-4 focus-within:border-brand-accent">
                <span className="font-black text-brand-muted">$</span>
                <input
                  required
                  min="1"
                  max={Math.max(0, (balance?.balance_cents || 0) / 100)}
                  step="0.01"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="25"
                  className="min-h-12 w-full px-2 font-semibold outline-none"
                />
              </div>
              <span className="text-xs font-semibold text-brand-muted">
                This becomes the tester’s exact reward. Credits are reserved when you send the request.
              </span>
            </label>

            {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-brand-danger">{error}</p> : null}

            <button
              type="submit"
              disabled={busy || !balance?.balance_cents}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 py-4 text-lg font-black text-white hover:bg-brand-ink disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
              {busy ? "Sending…" : "Use credit for QA"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
