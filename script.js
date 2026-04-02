const year = document.getElementById("year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const copyButtons = Array.from(document.querySelectorAll(".copy-snippet-btn"));

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;

    if (!target) {
      return;
    }

    const originalLabel = button.textContent;
    button.dataset.feedback = "";

    try {
      await navigator.clipboard.writeText(target.textContent || "");
      button.textContent = "Copy";
      button.dataset.feedback = "Copied!";
      button.classList.add("is-feedback-visible");
    } catch (_error) {
      button.dataset.feedback = "Copy failed";
      button.classList.add("is-feedback-visible");
    }

    window.setTimeout(() => {
      button.textContent = originalLabel;
      button.classList.remove("is-feedback-visible");
      button.dataset.feedback = "";
    }, 1400);
  });
});

const scanForm = document.getElementById("scanForm");
const scanUrl = document.getElementById("scanUrl");
const scanEmail = document.getElementById("scanEmail");
const scanConsoleBody = document.getElementById("scanConsoleBody");
const scanResult = document.getElementById("scanResult");
const scanResultGrid = document.getElementById("scanResultGrid");
const scanResultSummary = document.getElementById("scanResultSummary");
const scanResultAction = document.getElementById("scanResultAction");

if (scanForm && scanUrl && scanEmail && scanConsoleBody && scanResult && scanResultGrid && scanResultSummary && scanResultAction) {
  let activeScanTimers = [];
  const submitButton = scanForm.querySelector(".scan-submit-btn");

  const resetScanTimers = () => {
    activeScanTimers.forEach((timer) => window.clearTimeout(timer));
    activeScanTimers = [];
  };

  const normalizeUrl = (rawValue) => {
    const value = rawValue.trim();

    if (!value) {
      return "";
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    return `https://${value}`;
  };

  const setConsoleLines = (lines) => {
    scanConsoleBody.textContent = lines.join("\n");
  };

  const formatEstimatedStart = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }
    if (value < 60) {
      return `Should start in about ${Math.round(value)}s.`;
    }
    const minutes = Math.round(value / 60);
    if (minutes < 60) {
      return `Should start in about ${minutes} min.`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (!remainingMinutes) {
      return `Should start in about ${hours}h.`;
    }
    return `Should start in about ${hours}h ${remainingMinutes}m.`;
  };

  const renderFindingCard = (finding) => {
    return `
      <article>
        <span class="scan-result-pill ${finding?.pillClass || ""}">${finding?.kind || "Queued"}</span>
        <strong>${finding?.title || "Run queued"}</strong>
        <p>${finding?.description || ""}</p>
      </article>
    `;
  };

  const renderScanResult = (payload) => {
    scanResultSummary.textContent = payload?.summary || "Quick scan complete.";
    scanResultAction.href = payload?.actionUrl || "/dashboard?mode=signup";
    scanResultAction.textContent = payload?.actionLabel || "Open live report";
    scanResultGrid.innerHTML = Array.isArray(payload?.findings)
      ? payload.findings.map(renderFindingCard).join("")
      : "";
    scanResult.hidden = false;
  };

  const streamConsoleLines = (lines, onComplete) => {
    const visible = [];
    setConsoleLines([]);

    lines.forEach((line, index) => {
      const timer = window.setTimeout(() => {
        visible.push(line);
        setConsoleLines(visible);

        if (index === lines.length - 1 && typeof onComplete === "function") {
          onComplete();
        }
      }, index * 240);

      activeScanTimers.push(timer);
    });
  };

  const buildQueuedCards = (payload) => {
    const queueMessage = payload?.queue?.summary || payload?.queue?.message || "The run is queued and waiting for a worker slot.";
    const estimatedStart = payload?.estimated_start_seconds || payload?.queue?.estimated_start_seconds;
    const queueAhead = payload?.queue_ahead ?? payload?.queue?.queue_ahead;
    const queueDetail = formatEstimatedStart(estimatedStart);
    return [
      {
        kind: "Queued",
        pillClass: "scan-result-pill-queued",
        title: "A real browser QA run is queued",
        description: payload?.message || `We queued ${payload?.target_url || "your site"} for a real browser-backed run.`
      },
      {
        kind: "Email",
        pillClass: "scan-result-pill-proof",
        title: "The finished report will be emailed",
        description: payload?.email ? `We will send the finished report and share link to ${payload.email}.` : "We will email the finished report when it is ready."
      },
      {
        kind: "Status",
        pillClass: "scan-result-pill-friction",
        title: "You can track the run immediately",
        description: [queueDetail, typeof queueAhead === "number" ? `${queueAhead} run${queueAhead === 1 ? "" : "s"} ahead in your queue.` : "", queueMessage]
          .filter(Boolean)
          .join(" ")
      }
    ];
  };

  const runRealQaRequest = async () => {
    resetScanTimers();
    scanResult.hidden = true;
    scanResultGrid.innerHTML = "";

    const targetUrl = normalizeUrl(scanUrl.value);
    const email = scanEmail.value.trim().toLowerCase();

    if (!targetUrl) {
      setConsoleLines([
        "[SWARM-00] Waiting for a URL…",
        "[SWARM-01] Add a public site like clusterseo.com or your-site.com to queue the run."
      ]);
      scanResultSummary.textContent = "Enter a public site to queue a real QA run.";
      scanResultGrid.innerHTML = `
        <article>
          <span class="scan-result-pill scan-result-pill-friction">Input needed</span>
          <strong>Add a site URL first</strong>
          <p>Paste a public domain like clusterseo.com, example.com, or app.yourcompany.com and then queue the run.</p>
        </article>
      `;
      scanResultAction.href = "#";
      scanResultAction.textContent = "Enter a URL";
      scanResult.hidden = false;
      scanUrl.focus();
      scanUrl.select();
      return;
    }

    if (!email) {
      setConsoleLines([
        `[SWARM-00] URL captured for ${targetUrl}.`,
        "[SWARM-01] Add a work email so we know where to send the finished report."
      ]);
      scanResultSummary.textContent = "Add a work email so we can send the report when the run finishes.";
      scanResultGrid.innerHTML = `
        <article>
          <span class="scan-result-pill scan-result-pill-friction">Email needed</span>
          <strong>Add your work email</strong>
          <p>We use it to send the finished report and share link as soon as the real QA run completes.</p>
        </article>
      `;
      scanResultAction.href = "#";
      scanResultAction.textContent = "Enter email";
      scanResult.hidden = false;
      scanEmail.focus();
      scanEmail.select();
      return;
    }

    setConsoleLines([
      `[SWARM-00] Preparing a real QA run for ${targetUrl}…`,
      "[SWARM-01] Validating the target URL and email destination…",
      "[SWARM-02] Creating a browser-backed run request…"
    ]);

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Queueing…";
    }

    try {
      const response = await fetch("/api/site-qa-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: targetUrl,
          email
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        const errorPayload = {
          summary: payload?.error || "The real QA run could not be queued.",
          findings: [
            {
              kind: "Needs attention",
              pillClass: "scan-result-pill-friction",
              title: "The run could not be queued yet",
              description: payload?.error || "Try again in a moment or use a different public URL."
            },
            {
              kind: "Next step",
              pillClass: "scan-result-pill-proof",
              title: "We have not run the browser QA yet",
              description: "Nothing was tested yet. This request failed before the worker queue accepted the run."
            }
          ],
          actionUrl: "/dashboard?mode=signup",
          actionLabel: "Create account"
        };

        streamConsoleLines(
          [
            `[SWARM-03] ${payload?.error || "The real QA run could not be queued."}`,
            "[SWARM-04] Nothing was tested yet because the worker queue never accepted the request."
          ],
          () => renderScanResult(errorPayload)
        );
        return;
      }

      const queueLines = [
        `[SWARM-03] Queued run ${payload.run_id || "run_pending"} for ${payload.target_url || targetUrl}.`,
        payload?.queue?.summary
          ? `[SWARM-04] ${payload.queue.summary}`
          : "[SWARM-04] Waiting for the next available worker slot.",
        payload?.estimated_start_label
          ? `[SWARM-05] ${formatEstimatedStart(payload.estimated_start_seconds)}`
          : "[SWARM-05] The homepage will keep the live report link ready while the worker queue catches up.",
        `[SWARM-06] We will email ${payload.email || email} when the report is ready.`,
        "[SWARM-07] The link below opens the live report page right away so you can check status as the run moves."
      ];

      streamConsoleLines(queueLines, () =>
        renderScanResult({
          summary: payload?.message || "The real QA run is queued.",
          findings: buildQueuedCards(payload),
          actionUrl: payload?.share_url || payload?.ui_report_url || "/dashboard?mode=signup",
          actionLabel: "Check live status"
        })
      );
    } catch (_error) {
      const fallback = {
        summary: "The real QA request hit a network error before the run could be queued.",
        findings: [
          {
            kind: "Network issue",
            pillClass: "scan-result-pill-friction",
            title: "The request did not reach the QA queue",
            description: "The homepage could not hand this request off to the real worker fleet just now."
          },
          {
            kind: "Next step",
            pillClass: "scan-result-pill-proof",
            title: "Try again in a moment",
            description: "Once the queue accepts the request, Swarm Tester will open the browser, record the run, and email the full report."
          }
        ],
        actionUrl: "/dashboard?mode=signup",
        actionLabel: "Create account"
      };

      streamConsoleLines(
        [
          "[SWARM-03] The real QA request hit a network problem before it could be queued.",
          "[SWARM-04] No browser run started yet."
        ],
        () => renderScanResult(fallback)
      );
    } finally {
      window.setTimeout(() => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Queue Real QA";
        }
      }, 200);
    }
  };

  scanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runRealQaRequest();
  });
}
