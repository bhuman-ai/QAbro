const nodemailer = require("nodemailer");
const { normalizeUrl, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEnvString(value, maxLength = 2048) {
  const normalized = sanitizeOptionalString(value, maxLength);
  if (!normalized) {
    return "";
  }
  return normalized.replace(/\\r/g, "\r").replace(/\\n/g, "\n").trim();
}

function normalizeAlertEmailList(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const unique = new Set();
  const emails = [];

  for (const rawValue of rawValues) {
    const parts = String(rawValue || "")
      .split(/[\n,;]+/)
      .map((item) => sanitizeOptionalString(item, 320))
      .filter(Boolean)
      .map((item) => item.toLowerCase());

    for (const email of parts) {
      if (!EMAIL_ADDRESS_PATTERN.test(email) || unique.has(email)) {
        continue;
      }
      unique.add(email);
      emails.push(email);
      if (emails.length >= 10) {
        return emails;
      }
    }
  }

  return emails;
}

function isQaAlertEmailConfigured(env = process.env) {
  const host = normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_HOST, 320);
  const port = Number(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_PORT, 32) || 587);
  const username = normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_USERNAME, 320);
  const password = normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_PASSWORD, 2048);
  const from = normalizeEnvString(env.QA_ALERT_EMAIL_FROM, 320);
  return Boolean(host && Number.isFinite(port) && port > 0 && username && password && from);
}

function createQaAlertTransport(env = process.env) {
  return nodemailer.createTransport({
    host: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_HOST, 320), 320),
    port: Number(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_PORT, 32) || 587),
    secure: parseBoolean(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_SECURE, 32)),
    auth: {
      user: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_USERNAME, 320), 320),
      pass: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_SMTP_PASSWORD, 2048), 2048)
    },
    connectionTimeout: 10000,
    socketTimeout: 15000
  });
}

function resolveQaAlertRecipients(schedule = {}, ownerEmail = "") {
  const explicit = normalizeAlertEmailList(
    schedule?.alert_email_to || schedule?.alertEmailTo || schedule?.metadata?.alert_email_to
  );
  if (explicit.length) {
    return explicit;
  }
  return normalizeAlertEmailList(ownerEmail || schedule?.owner_email || schedule?.ownerEmail);
}

function buildQaAlertEmailContent({ schedule = {}, alert = {}, report = {} } = {}) {
  const brandLabel =
    sanitizeOptionalString(schedule.brand_name, 256) ||
    sanitizeOptionalString(schedule.brand_key || alert.brand_key, 256) ||
    "your project";
  const title = sanitizeOptionalString(alert.title, 180) || "Scheduled QA found a problem";
  const message = sanitizeOptionalString(alert.message, 1200) || "A scheduled QA run needs attention.";
  const severity = sanitizeOptionalString(alert.severity, 32).toUpperCase() || "HIGH";
  const runStatus = sanitizeOptionalString(report.status || alert?.payload?.run_status, 64) || "partial";
  const runId = sanitizeOptionalString(report.run_id || alert.run_id, 128) || "unknown";
  const reportUrl =
    normalizeUrl(alert.ui_report_url || alert.uiReportUrl || alert.report_url || alert.reportUrl) || "";
  const targetUrl = normalizeUrl(schedule.target_url) || "";

  const subject = `[SwarmTester] ${title} (${brandLabel})`.slice(0, 240);
  const text = [
    `${title}`,
    "",
    `Project: ${brandLabel}`,
    `Severity: ${severity}`,
    `Run status: ${runStatus}`,
    `Run ID: ${runId}`,
    targetUrl ? `Target URL: ${targetUrl}` : "",
    "",
    `${message}`,
    "",
    reportUrl ? `Open report: ${reportUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p style="margin: 0 0 16px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280;">Swarm Tester alert</p>
      <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">${escapeHtml(title)}</h1>
      <p style="margin: 0 0 20px; color: #4b5563;">${escapeHtml(message)}</p>
      <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Project</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(brandLabel)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Severity</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(severity)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Run status</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(runStatus)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Run ID</td><td style="padding: 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(runId)}</td></tr>
        ${targetUrl ? `<tr><td style="padding: 6px 0; color: #6b7280;">Target</td><td style="padding: 6px 0;">${escapeHtml(targetUrl)}</td></tr>` : ""}
      </table>
      ${
        reportUrl
          ? `<p style="margin: 0;"><a href="${escapeHtml(reportUrl)}" style="display: inline-block; padding: 10px 14px; border-radius: 999px; background: #7c3f4d; color: white; text-decoration: none; font-weight: 600;">Open report</a></p>`
          : ""
      }
    </div>
  `;

  return { subject, text, html };
}

function buildQaReportReadyEmailContent({ targetUrl = "", shareUrl = "", report = {} } = {}) {
  const safeTargetUrl = normalizeUrl(targetUrl) || "";
  const reportTitle =
    sanitizeOptionalString(report.title, 180) ||
    sanitizeOptionalString(report.top_finding_title || report.topFindingTitle, 180) ||
    sanitizeOptionalString(report.summary, 1200) ||
    "Your QA report is ready";
  const runId = sanitizeOptionalString(report.run_id || report.runId, 128) || "unknown";
  const subject = `[SwarmTester] ${reportTitle}`.slice(0, 240);
  const text = [
    `${reportTitle}`,
    "",
    safeTargetUrl ? `Site: ${safeTargetUrl}` : "",
    `Run ID: ${runId}`,
    "",
    "Your real QA run finished and the report is ready.",
    shareUrl ? `Open report: ${shareUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <p style="margin: 0 0 14px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280;">Swarm Tester</p>
      <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">${escapeHtml(reportTitle)}</h1>
      <p style="margin: 0 0 18px; color: #4b5563;">Your real QA run finished and the report is ready.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 0 0 20px;">
        ${safeTargetUrl ? `<tr><td style="padding: 6px 0; color: #6b7280;">Site</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(safeTargetUrl)}</td></tr>` : ""}
        <tr><td style="padding: 6px 0; color: #6b7280;">Run ID</td><td style="padding: 6px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(runId)}</td></tr>
      </table>
      ${
        shareUrl
          ? `<p style="margin: 0;"><a href="${escapeHtml(shareUrl)}" style="display: inline-block; padding: 10px 14px; border-radius: 999px; background: #7c3f4d; color: white; text-decoration: none; font-weight: 600;">Open report</a></p>`
          : ""
      }
    </div>
  `;

  return { subject, text, html };
}

function buildQaTrialInviteEmailContent({ role, productName, testFocus, durationMinutes, trialUrl, leadPreapproved } = {}) {
  const isTester = sanitizeString(role, 32).toLowerCase() === "tester";
  const safeProductName = sanitizeOptionalString(productName, 180) || "the product";
  const safeTestFocus = sanitizeOptionalString(testFocus, 2400) || "Try the requested product flow and explain what feels confusing or broken.";
  const safeTrialUrl = normalizeUrl(trialUrl) || "";
  const safeDuration = Math.max(10, Math.min(60, Number(durationMinutes) || 30));
  const requestAccepted = !isTester && leadPreapproved === true;
  const subject = isTester
    ? `Your first BUD Verified Trial: ${safeProductName}`
    : requestAccepted
      ? `Your human test is being assigned: ${safeProductName}`
      : `Approve your free product test: ${safeProductName}`;
  const heading = isTester
    ? "Earn your first verified QA score"
    : requestAccepted
      ? "Your human test is queued"
      : "Your free product test is ready";
  const body = isTester
    ? `Complete one unpaid ${safeDuration}-minute qualification. Your evidence will be scored against a private benchmark and can become your first BUD Verified Trial.`
    : requestAccepted
      ? "Your request is accepted. A tester will follow the scope you gave your coding agent, and the recording and report will appear at this private link."
      : "A new tester will review your product as their first BUD qualification. You get the complete recording and report for free.";
  const action = isTester ? "Accept tester trial" : requestAccepted ? "Track test" : "Approve free test";
  const text = [
    "Before Users Do",
    "",
    heading,
    "",
    body,
    "",
    `Product: ${safeProductName}`,
    `Test: ${safeTestFocus}`,
    safeTrialUrl ? `${action}: ${safeTrialUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #10182d; line-height: 1.6; max-width: 560px; margin: 0 auto;">
      <p style="margin: 0 0 18px; font-size: 13px; font-weight: 800;">Before Users Do</p>
      <h1 style="margin: 0 0 12px; font-size: 26px; line-height: 1.2;">${escapeHtml(heading)}</h1>
      <p style="margin: 0 0 20px; color: #5d6d89;">${escapeHtml(body)}</p>
      <div style="margin: 0 0 22px; padding: 16px; border: 1px solid #dbe3ef; border-radius: 12px;">
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 800; color: #8b5cf6; text-transform: uppercase;">${escapeHtml(safeProductName)}</p>
        <p style="margin: 0; color: #33415c;">${escapeHtml(safeTestFocus)}</p>
      </div>
      ${
        safeTrialUrl
          ? `<a href="${escapeHtml(safeTrialUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #10182d; color: #ffffff; text-decoration: none; font-weight: 800;">${escapeHtml(action)}</a>`
          : ""
      }
      <p style="margin: 22px 0 0; color: #7a879f; font-size: 12px;">This private link is only for you.</p>
    </div>
  `;

  return { subject: subject.slice(0, 240), text, html };
}

async function sendQaAlertEmail({ schedule = {}, alert = {}, report = {} } = {}, options = {}) {
  const env = options.env || process.env;
  const recipients = resolveQaAlertRecipients(schedule, alert.owner_email || schedule.owner_email || "");
  if (!recipients.length) {
    return { ok: false, skipped: true, error: "No alert email recipient is configured" };
  }
  if (!isQaAlertEmailConfigured(env)) {
    return { ok: false, skipped: true, error: "Email alerts are not configured on the server" };
  }

  const transporter = createQaAlertTransport(env);
  const content = buildQaAlertEmailContent({ schedule, alert, report });
  const info = await transporter.sendMail({
    from: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_FROM, 320), 320),
    to: recipients,
    ...(normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320)
      ? { replyTo: normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320) }
      : {}),
    subject: content.subject,
    text: content.text,
    html: content.html
  });

  return {
    ok: true,
    recipients,
    messageId: sanitizeOptionalString(info?.messageId, 512) || null
  };
}

async function sendQaReportReadyEmail({ email, targetUrl, shareUrl, report = {} } = {}, options = {}) {
  const env = options.env || process.env;
  const recipients = normalizeAlertEmailList(email);
  if (!recipients.length) {
    return { ok: false, skipped: true, error: "No recipient email is configured" };
  }
  if (!isQaAlertEmailConfigured(env)) {
    return { ok: false, skipped: true, error: "Email alerts are not configured on the server" };
  }

  const transporter = createQaAlertTransport(env);
  const content = buildQaReportReadyEmailContent({ targetUrl, shareUrl, report });
  const info = await transporter.sendMail({
    from: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_FROM, 320), 320),
    to: recipients,
    ...(normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320)
      ? { replyTo: normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320) }
      : {}),
    subject: content.subject,
    text: content.text,
    html: content.html
  });

  return {
    ok: true,
    recipients,
    messageId: sanitizeOptionalString(info?.messageId, 512) || null
  };
}

async function sendQaTrialInviteEmail(
  { email, role, productName, testFocus, durationMinutes, trialUrl, leadPreapproved } = {},
  options = {}
) {
  const env = options.env || process.env;
  const recipients = normalizeAlertEmailList(email);
  if (!recipients.length) {
    return { ok: false, skipped: true, error: "No recipient email is configured" };
  }
  if (!isQaAlertEmailConfigured(env)) {
    return { ok: false, skipped: true, error: "Email alerts are not configured on the server" };
  }

  const transporter = createQaAlertTransport(env);
  const content = buildQaTrialInviteEmailContent({
    role,
    productName,
    testFocus,
    durationMinutes,
    trialUrl,
    leadPreapproved
  });
  const info = await transporter.sendMail({
    from: sanitizeString(normalizeEnvString(env.QA_ALERT_EMAIL_FROM, 320), 320),
    to: recipients,
    ...(normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320)
      ? { replyTo: normalizeEnvString(env.QA_ALERT_EMAIL_REPLY_TO, 320) }
      : {}),
    subject: content.subject,
    text: content.text,
    html: content.html
  });

  return {
    ok: true,
    recipients,
    messageId: sanitizeOptionalString(info?.messageId, 512) || null
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

module.exports = {
  buildQaAlertEmailContent,
  buildQaReportReadyEmailContent,
  buildQaTrialInviteEmailContent,
  createQaAlertTransport,
  isQaAlertEmailConfigured,
  normalizeAlertEmailList,
  resolveQaAlertRecipients,
  sendQaAlertEmail,
  sendQaReportReadyEmail,
  sendQaTrialInviteEmail
};
