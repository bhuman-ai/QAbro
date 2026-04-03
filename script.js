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
    scanResultSummary.textContent = payload?.summary || "Test ready.";
    scanResultAction.href = payload?.actionUrl || "/dashboard";
    scanResultAction.textContent = payload?.actionLabel || "Open tests";
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
        kind: "Started",
        pillClass: "scan-result-pill-queued",
        title: "Your test is in line",
        description: payload?.message || `We added ${payload?.target_url || "your site"} to the real browser test queue.`
      },
      {
        kind: "Email",
        pillClass: "scan-result-pill-proof",
        title: "We will email the report",
        description: payload?.email ? `We will send the finished report and share link to ${payload.email}.` : "We will email the finished report when it is ready."
      },
      {
        kind: "Next",
        pillClass: "scan-result-pill-friction",
        title: "You can open the report page now",
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
        "[SWARM-00] Waiting for a site…",
        "[SWARM-01] Add a public site like clusterseo.com or your-site.com to start the test."
      ]);
      scanResultSummary.textContent = "Enter a public site to start the test.";
      scanResultGrid.innerHTML = `
        <article>
          <span class="scan-result-pill scan-result-pill-friction">Input needed</span>
          <strong>Add a site first</strong>
          <p>Paste a public domain like clusterseo.com, example.com, or app.yourcompany.com.</p>
        </article>
      `;
      scanResultAction.href = "#";
      scanResultAction.textContent = "Enter site";
      scanResult.hidden = false;
      scanUrl.focus();
      scanUrl.select();
      return;
    }

    if (!email) {
      setConsoleLines([
        `[SWARM-00] Site saved for ${targetUrl}.`,
        "[SWARM-01] Add your work email so we know where to send the report."
      ]);
      scanResultSummary.textContent = "Add your work email so we can send the report.";
      scanResultGrid.innerHTML = `
        <article>
          <span class="scan-result-pill scan-result-pill-friction">Email needed</span>
          <strong>Add your email</strong>
          <p>We use it to send the finished report and share link as soon as the test finishes.</p>
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
      "[SWARM-02] Starting the browser-backed test…"
    ]);

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Starting…";
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
          summary: payload?.error || "The test could not be started.",
          findings: [
            {
              kind: "Needs attention",
              pillClass: "scan-result-pill-friction",
              title: "The test did not start",
              description: payload?.error || "Try again in a moment or use a different public URL."
            },
            {
              kind: "Next step",
              pillClass: "scan-result-pill-proof",
              title: "Nothing was tested yet",
              description: "This request failed before the worker queue accepted the run."
            }
          ],
          actionUrl: "/dashboard",
          actionLabel: "Open tests"
        };

        streamConsoleLines(
          [
            `[SWARM-03] ${payload?.error || "The test could not be started."}`,
            "[SWARM-04] Nothing was tested yet because the worker queue never accepted the request."
          ],
          () => renderScanResult(errorPayload)
        );
        return;
      }

      const queueLines = [
        `[SWARM-03] Started run ${payload.run_id || "run_pending"} for ${payload.target_url || targetUrl}.`,
        payload?.queue?.summary
          ? `[SWARM-04] ${payload.queue.summary}`
          : "[SWARM-04] Waiting for the next available worker slot.",
        payload?.estimated_start_label
          ? `[SWARM-05] ${formatEstimatedStart(payload.estimated_start_seconds)}`
          : "[SWARM-05] The report page is ready while the worker queue catches up.",
        `[SWARM-06] We will email ${payload.email || email} when the report is ready.`,
        "[SWARM-07] The link below opens the report page right away so you can check status."
      ];

      streamConsoleLines(queueLines, () =>
        renderScanResult({
          summary: payload?.message || "The test is queued.",
          findings: buildQueuedCards(payload),
          actionUrl: payload?.share_url || payload?.ui_report_url || "/dashboard",
          actionLabel: "Open test"
        })
      );
    } catch (_error) {
      const fallback = {
        summary: "The request hit a network error before the test could start.",
        findings: [
          {
            kind: "Network issue",
            pillClass: "scan-result-pill-friction",
            title: "The request did not reach the queue",
            description: "The homepage could not hand this request off to the worker fleet just now."
          },
          {
            kind: "Next step",
            pillClass: "scan-result-pill-proof",
            title: "Try again in a moment",
            description: "Once the queue accepts the request, Swarm Tester will open the browser, record the run, and email the report."
          }
        ],
        actionUrl: "/dashboard",
        actionLabel: "Open tests"
      };

      streamConsoleLines(
        [
          "[SWARM-03] The real QA request hit a network problem before it could start.",
          "[SWARM-04] No browser run started yet."
        ],
        () => renderScanResult(fallback)
      );
    } finally {
      window.setTimeout(() => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Start Test";
        }
      }, 200);
    }
  };

  scanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runRealQaRequest();
  });
}
