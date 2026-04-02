const dns = require("node:dns/promises");
const net = require("node:net");

const { sanitizeString } = require("./qa-core");

const PREVIEW_SCAN_USER_AGENT = "SwarmTesterPreview/1.0 (+https://swarmtester.com)";

function normalizeScanUrl(value) {
  const raw = sanitizeString(value, 2048);
  if (!raw) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateIpAddress(address) {
  const family = net.isIP(address);
  if (!family) {
    return false;
  }

  if (family === 4) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;

    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    return false;
  }

  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function isBlockedHostname(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  if (!value) {
    return true;
  }

  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal")) {
    return true;
  }

  return isPrivateIpAddress(value);
}

async function assertPublicSite(urlString, options = {}) {
  const lookupFn = options.lookupFn || dns.lookup;
  const parsed = new URL(urlString);
  const hostname = parsed.hostname;

  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "Only public websites can be scanned here." };
  }

  try {
    const records = await lookupFn(hostname, { all: true, verbatim: true });
    const addresses = Array.isArray(records)
      ? records.map((entry) => entry?.address).filter(Boolean)
      : [records?.address].filter(Boolean);

    if (addresses.some((address) => isPrivateIpAddress(address))) {
      return { ok: false, error: "Only public websites can be scanned here." };
    }
  } catch {
    return { ok: false, error: "The site could not be resolved. Double-check the URL and try again." };
  }

  return { ok: true };
}

function readFirstMatch(html, pattern) {
  const match = String(html || "").match(pattern);
  return match?.[1] ? String(match[1]).replace(/\s+/g, " ").trim() : "";
}

function countMatches(html, pattern) {
  return [...String(html || "").matchAll(pattern)].length;
}

function collectHtmlInsights(html) {
  const title = readFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = readFirstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const h1 = readFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const buttonCount = countMatches(html, /<button\b/gi) + countMatches(html, /<input\b[^>]+type=["']?(submit|button)["']?[^>]*>/gi);
  const formCount = countMatches(html, /<form\b/gi);
  const imageTags = [...String(html || "").matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const imagesWithoutAlt = imageTags.filter((tag) => !/\balt\s*=\s*["'][^"']*["']/i.test(tag)).length;
  const passwordInputs = countMatches(html, /<input\b[^>]+type=["']password["'][^>]*>/gi);
  const loginWordCount = countMatches(html, /\b(log in|login|sign in)\b/gi);
  const signupWordCount = countMatches(html, /\b(sign up|signup|create account|register)\b/gi);
  const labelCount = countMatches(html, /<label\b/gi);

  return {
    title,
    metaDescription,
    h1,
    buttonCount,
    formCount,
    imageCount: imageTags.length,
    imagesWithoutAlt,
    passwordInputs,
    loginWordCount,
    signupWordCount,
    labelCount
  };
}

function buildFindings({ insights, responseTimeMs, scannedUrl, statusCode }) {
  const findings = [];

  if (responseTimeMs >= 2200) {
    findings.push({
      kind: "Bug",
      tone: "bug",
      title: "The first HTML response feels slow",
      description: `The page took about ${Math.round(responseTimeMs)}ms to return HTML, which is long enough for a first-time visitor to feel the delay.`
    });
  }

  if (insights.passwordInputs > 0 && insights.loginWordCount > 0 && insights.signupWordCount > 0) {
    findings.push({
      kind: "Friction",
      tone: "friction",
      title: "Login and sign-up are competing on the same auth surface",
      description: "The page mixes log-in and sign-up language around a password form, which can make a first-time visitor hesitate about which path they are on."
    });
  }

  if (insights.imageCount > 0 && insights.imagesWithoutAlt > 0) {
    findings.push({
      kind: "Bug",
      tone: "bug",
      title: "Some images are missing alt text",
      description: `${insights.imagesWithoutAlt} image${insights.imagesWithoutAlt === 1 ? "" : "s"} on the page do not have alt text, which weakens accessibility and makes QA reports harder to interpret.`
    });
  }

  if (!insights.h1) {
    findings.push({
      kind: "Friction",
      tone: "friction",
      title: "The page does not show one clear main headline",
      description: "There is no <h1> on the first HTML pass, so the primary message may be less obvious than it should be."
    });
  }

  if (!insights.metaDescription) {
    findings.push({
      kind: "Friction",
      tone: "friction",
      title: "The page is missing a meta description",
      description: "That will not block the UI itself, but it does make the page less clear when shared in search or chat previews."
    });
  }

  if (!findings.length) {
    findings.push({
      kind: "Proof",
      tone: "proof",
      title: "The quick scan did not find an obvious HTML-level blocker",
      description: "This page still deserves a real QA run, but the first HTML pass looks structurally healthy."
    });
  }

  findings.push({
    kind: "Proof",
    tone: "proof",
    title: "The full run goes much deeper than this preview",
    description: "A real Swarm Tester run opens the site in a browser, records video, saves the steps, and explains the blocker in plain English."
  });

  const limitedFindings = findings.slice(0, 3);
  const title = limitedFindings[0]?.title || "Quick scan complete";
  const summary = statusCode >= 400
    ? `The page returned ${statusCode}, so the preview stopped at the first response.`
    : `Previewed ${new URL(scannedUrl).host} in about ${Math.round(responseTimeMs)}ms and flagged ${Math.max(limitedFindings.length - 1, 0)} likely issue${limitedFindings.length - 1 === 1 ? "" : "s"}.`;

  return {
    summary,
    findings: limitedFindings
  };
}

function buildLogs({ scannedUrl, responseTimeMs, statusCode, insights, findings }) {
  const host = new URL(scannedUrl).host;
  return [
    `[SWARM-01] Navigating to ${host}…`,
    `[SWARM-02] Received HTML in ${Math.round(responseTimeMs)}ms (${statusCode}).`,
    `[SWARM-03] Found ${insights.formCount} form${insights.formCount === 1 ? "" : "s"}, ${insights.buttonCount} button${insights.buttonCount === 1 ? "" : "s"}, and ${insights.imageCount} image${insights.imageCount === 1 ? "" : "s"}.`,
    `[SWARM-04] Flagged ${Math.max(findings.length - 1, 0)} likely issue${findings.length - 1 === 1 ? "" : "s"} from the first HTML pass.`,
    `[SWARM-05] Full QA would now open the browser, try the key flow, and save the video-backed report.`
  ];
}

async function runSitePreviewScan(input, options = {}) {
  const fetchFn = options.fetchFn || global.fetch;
  const url = normalizeScanUrl(input);
  if (!url) {
    return { ok: false, status: 400, error: "Enter a real public URL, like clusterseo.com or https://clusterseo.com." };
  }

  const publicCheck = await assertPublicSite(url, options);
  if (!publicCheck.ok) {
    return { ok: false, status: 400, error: publicCheck.error };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const startedAt = Date.now();

  try {
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": PREVIEW_SCAN_USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      }
    });

    const responseTimeMs = Date.now() - startedAt;
    const contentType = String(response.headers?.get?.("content-type") || "");
    const finalUrl = normalizeScanUrl(response.url || url) || url;

    if (!contentType.toLowerCase().includes("text/html")) {
      return {
        ok: true,
        status: 200,
        target_url: finalUrl,
        summary: `Reached ${new URL(finalUrl).host}, but the first response was ${contentType || "not HTML"}, so the preview stopped there.`,
        logs: [
          `[SWARM-01] Navigating to ${new URL(finalUrl).host}…`,
          `[SWARM-02] Got a ${response.status} response in ${Math.round(responseTimeMs)}ms.`,
          `[SWARM-03] The first response was ${contentType || "not HTML"}, so the lightweight scan could not inspect the page structure.`,
          `[SWARM-04] Full QA would still be able to open the browser and inspect the experience directly.`
        ],
        findings: [
          {
            kind: "Friction",
            tone: "friction",
            title: "The first response is not an HTML page",
            description: "This quick scan only inspects the first HTML response. A full run is better here because it can drive the browser directly."
          },
          {
            kind: "Proof",
            tone: "proof",
            title: "Use a full QA run for dynamic or gated experiences",
            description: "The real run will still try the flow, record the video, and explain what blocked progress."
          }
        ],
        metrics: {
          response_time_ms: responseTimeMs,
          status_code: response.status,
          content_type: contentType
        }
      };
    }

    const html = (await response.text()).slice(0, 250000);
    const insights = collectHtmlInsights(html);
    const built = buildFindings({
      insights,
      responseTimeMs,
      scannedUrl: finalUrl,
      statusCode: response.status
    });
    const logs = buildLogs({
      scannedUrl: finalUrl,
      responseTimeMs,
      statusCode: response.status,
      insights,
      findings: built.findings
    });

    return {
      ok: true,
      status: 200,
      target_url: finalUrl,
      summary: built.summary,
      logs,
      findings: built.findings,
      metrics: {
        response_time_ms: responseTimeMs,
        status_code: response.status,
        title: insights.title,
        h1: insights.h1,
        forms: insights.formCount,
        buttons: insights.buttonCount,
        images: insights.imageCount,
        images_without_alt: insights.imagesWithoutAlt,
        password_inputs: insights.passwordInputs
      }
    };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "The preview timed out before the site responded."
      : "The preview scan could not reach that site.";
    return { ok: false, status: 502, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  PREVIEW_SCAN_USER_AGENT,
  normalizeScanUrl,
  isPrivateIpAddress,
  isBlockedHostname,
  collectHtmlInsights,
  runSitePreviewScan
};
