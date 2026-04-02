const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

function runWorker(env) {
  return new Promise((resolve) => {
    execFile('node', ['scripts/qa-worker.js', '--once'], {
      cwd: process.cwd(),
      env,
      maxBuffer: 8 * 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

(async () => {
  loadEnvFile(path.resolve('.tmp/vercel.env'));

  const runHandler = require('../api/qa/run');
  const statusHandler = require('../api/qa/status');
  const reportHandler = require('../api/qa/report');

  const runId = `speakeasy_full_${Date.now()}`;

  const runReq = {
    method: 'POST',
    headers: { host: 'swarmtester.com', 'x-forwarded-proto': 'https' },
    body: {
      run_id: runId,
      target_url: 'https://speakeasy.bhuman.ai/',
      brand_persona: 'A skeptical product manager evaluating a new SaaS tool',
      source: 'qa_bot'
    }
  };

  const runRes = createRes();
  await runHandler(runReq, runRes);

  const workerEnv = {
    ...process.env,
    QA_WORKER_ID: 'full-report-worker',
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    QA_MODEL: process.env.QA_MODEL || 'gpt-4.1-mini'
  };

  const workerResult = await runWorker(workerEnv);

  const statusReq = { method: 'GET', query: { run_id: runId } };
  const statusRes = createRes();
  await statusHandler(statusReq, statusRes);

  const reportReq = { method: 'GET', query: { run_id: runId } };
  const reportRes = createRes();
  await reportHandler(reportReq, reportRes);

  const report = reportRes.body?.report || null;
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const journeys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];

  console.log(JSON.stringify({
    run_id: runId,
    enqueue_status: runRes.statusCode,
    worker_ok: !workerResult.error,
    worker_stdout_excerpt: workerResult.stdout.trim().slice(0, 900),
    worker_stderr_excerpt: workerResult.stderr.trim().slice(0, 900) || null,
    status: {
      code: statusRes.statusCode,
      queue_status: statusRes.body?.queue?.queue_status,
      report_status: statusRes.body?.report_status,
      report_ready: statusRes.body?.report_ready
    },
    report: report ? {
      status: report.status,
      findings_count: findings.length,
      journeys_count: journeys.length,
      recommendations_count: Array.isArray(report.recommendations) ? report.recommendations.length : 0,
      evidence_gallery: {
        screenshots: (report.evidence_gallery?.screenshots || []).length,
        videos: (report.evidence_gallery?.videos || []).length,
        has_session: Boolean(report.evidence_gallery?.session_url),
        has_debug: Boolean(report.evidence_gallery?.debug_url)
      },
      first_finding_title: findings[0]?.title || null,
      first_journey_name: journeys[0]?.name || null,
      summary_note: report.summary?.note || null
    } : null
  }, null, 2));
})();
