const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const { performCredentialedLogin } = require("./qa-auth-playwright");
const {
  buildIdentityOtpInbox,
  hasSubmissionIdentity,
  normalizeSubmissionIdentityProfile
} = require("./submission-identity");
const { generateSubmissionAssets } = require("./submission-asset-generator");
const { resolveSubmissionProxySelection } = require("./submission-proxy");
const { getSiteDefinition } = require("./site-packs");

const CTA_TEXT_PATTERNS = [
  /\bsubmit\b/i,
  /\badd\b/i,
  /\blist\b/i,
  /\blaunch\b/i,
  /\bclaim\b/i,
  /\bget started\b/i,
  /\bstart\b/i,
  /\bcontinue\b/i,
  /\bjoin\b/i,
  /\bsign up\b/i
];
const FINAL_SUBMIT_CTA_PATTERNS = [
  /\bsubmit\b/i,
  /\badd\b/i,
  /\blist\b/i,
  /\blaunch\b/i,
  /\bclaim\b/i,
  /\bjoin\b/i
];
const PROGRESS_CTA_PATTERNS = [
  /\bcontinue\b/i,
  /\bnext\b/i,
  /\bget started\b/i,
  /\bstart\b/i
];

const ASSET_BUCKET_ALIASES = {
  logo: ["logo"],
  icon: ["icon", "logo"],
  cover_image: ["cover_image"],
  banner: ["banner"],
  og_image: ["og_image"],
  social_card: ["social_card"],
  thumbnail_square: ["icon", "logo", "cover_image"],
  gallery_1270x760: ["cover_image", "banner", "og_image", "social_card"],
  youtube_demo: ["video"],
  screenshots: ["screenshots"],
  video: ["video"],
  founder_headshots: ["team_photos"],
  team_photos: ["team_photos"],
  office_photos: ["office_photos"],
  description: [],
  tagline: [],
  pricing: [],
  categories: []
};

const AD_BLOCK_PATTERNS = [
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /facebook\.net/i,
  /adsystem/i,
  /adservice/i,
  /hotjar\.com/i,
  /segment\.io/i
];

const AUTO_CREATE_AUTH_SITE_IDS = new Set([
  "bbb",
  "betalist",
  "futurepedia",
  "saashub",
  "toolify",
  "topai_tools",
  "yelp"
]);

const COOKIE_DIALOG_PATTERN = /\bcookie\b|\bconsent\b|\bprivacy\b/i;
const COUNTRY_DIALOG_PATTERN = /\bcountry\b|\bregion\b|\blocation\b/i;
const COUNTRY_PREFERRED_US_PATTERN = /\bunited states\b|^us$|^u\.s\.a?$/i;
const OVERLAY_CLOSE_PATTERNS = [
  /close/i,
  /dismiss/i,
  /skip/i,
  /not now/i,
  /maybe later/i,
  /no thanks/i,
  /continue to site/i
];
const OVERLAY_COOKIE_PATTERNS = [
  /reject all/i,
  /decline/i,
  /accept all/i,
  /allow all/i,
  /accept/i,
  /allow/i,
  /got it/i,
  /^ok$/i
];
const CTA_SELECTOR = "button, a, [role='button'], input[type='submit'], input[type='button']";

function appendRunLog(runLog, event, details = {}) {
  if (!Array.isArray(runLog)) {
    return;
  }

  runLog.push({
    ts: new Date().toISOString(),
    event: sanitizeString(event, 128) || "submission_progress",
    data: details && typeof details === "object" ? details : {}
  });

  const persist = typeof runLog.__persist === "function" ? runLog.__persist : null;
  if (persist) {
    try {
      persist();
    } catch {
      // Ignore incremental run-log persistence failures.
    }
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeRunLogFile(outputDir, runLog) {
  if (!outputDir || !Array.isArray(runLog)) {
    return null;
  }
  try {
    const filePath = path.join(outputDir, "run-log.json");
    fs.writeFileSync(filePath, JSON.stringify(runLog, null, 2));
    return filePath;
  } catch {
    return null;
  }
}

function buildJobRequestWithConnectorRuntimeOverrides(jobRequest) {
  const safeJobRequest = isPlainObject(jobRequest) ? jobRequest : {};
  const siteId = sanitizeString(safeJobRequest.site_id, 128).toLowerCase();
  const siteDefinition = siteId ? getSiteDefinition(siteId) : null;
  const connectorOverrides =
    siteDefinition?.runtime_overrides && typeof siteDefinition.runtime_overrides === "object"
      ? siteDefinition.runtime_overrides
      : null;
  if (!connectorOverrides) {
    return safeJobRequest;
  }

  const metadata = isPlainObject(safeJobRequest.metadata) ? { ...safeJobRequest.metadata } : {};
  for (const [key, value] of Object.entries(connectorOverrides)) {
    if (metadata[key] === undefined) {
      metadata[key] = value;
    }
  }

  return {
    ...safeJobRequest,
    metadata
  };
}

function toSafeSlug(value, fallbackValue = "job") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallbackValue;
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function parseViewportValue(value) {
  if (isPlainObject(value)) {
    const width = Number(value.width);
    const height = Number(value.height);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return {
        width: Math.max(320, Math.min(3840, Math.floor(width))),
        height: Math.max(320, Math.min(2160, Math.floor(height)))
      };
    }
  }

  const text = sanitizeOptionalString(value, 120);
  if (!text) {
    return null;
  }
  const match = text.match(/(\d{3,4})\D+(\d{3,4})/);
  if (!match) {
    return null;
  }
  return {
    width: Math.max(320, Math.min(3840, Number(match[1]) || 1440)),
    height: Math.max(320, Math.min(2160, Number(match[2]) || 900))
  };
}

function parseGeolocationValue(value) {
  const source = isPlainObject(value) ? value : null;
  if (!source) {
    return null;
  }

  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng ?? source.lon);
  const accuracy = Number(source.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude: Math.max(-90, Math.min(90, latitude)),
    longitude: Math.max(-180, Math.min(180, longitude)),
    accuracy: Number.isFinite(accuracy) ? Math.max(0, Math.min(50000, accuracy)) : 25
  };
}

function parseHeaderMap(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.fromEntries(
    Object.entries(source)
      .map(([rawKey, rawValue]) => [sanitizeString(rawKey, 120), sanitizeString(rawValue, 4000)])
      .filter(([key, headerValue]) => key && headerValue)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTwoCaptchaApiResponse(rawValue) {
  const text = sanitizeOptionalString(rawValue, 10000) || "";
  if (!text) {
    return { status: 0, request: "Empty response from 2Captcha." };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return {
        status: Number(parsed.status) === 1 ? 1 : 0,
        request: sanitizeOptionalString(parsed.request, 8000) || "Unknown 2Captcha response."
      };
    }
  } catch {
    // Fall back to plain-text parsing below.
  }

  if (text.startsWith("OK|")) {
    return {
      status: 1,
      request: sanitizeOptionalString(text.slice(3), 8000) || ""
    };
  }

  return {
    status: 0,
    request: text
  };
}

async function detectSupportedCaptchaChallenge(page) {
  if (!page || typeof page.evaluate !== "function") {
    return null;
  }

  const challenges = await page.evaluate(() => {
    const textFrom = (value) => (typeof value === "string" ? value.trim() : "");
    const parseUrl = (value) => {
      try {
        return new URL(value, window.location.href);
      } catch {
        return null;
      }
    };
    const isInvisibleIframeChallenge = (url) => {
      if (!url || !url.searchParams) {
        return false;
      }
      const size = textFrom(url.searchParams.get("size")).toLowerCase();
      const invisible = textFrom(url.searchParams.get("invisible")).toLowerCase();
      return size === "invisible" || invisible === "1" || invisible === "true";
    };
    const normalizeRecaptchaApiDomain = (value) => {
      const hostname = textFrom(value).toLowerCase();
      if (!hostname) {
        return null;
      }
      if (hostname.includes("recaptcha.net")) {
        return "recaptcha.net";
      }
      if (hostname.includes("google.com")) {
        return "google.com";
      }
      return null;
    };
    const normalizeRecaptchaVersion = (value) => {
      const lowered = textFrom(value).toLowerCase();
      if (lowered === "v2" || lowered === "v3") {
        return lowered;
      }
      return null;
    };
    const normalizeRecaptchaScore = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      if (numeric >= 0.8) {
        return 0.9;
      }
      if (numeric >= 0.5) {
        return 0.7;
      }
      return 0.3;
    };
    const normalizeType = (value) => {
      const lowered = textFrom(value).toLowerCase();
      if (lowered === "recaptcha" || lowered === "hcaptcha" || lowered === "turnstile") {
        return lowered;
      }
      return "";
    };
    const mergeText = (left, right) => textFrom(left) || textFrom(right) || null;
    const recaptchaSignals = {
      apiDomain: null,
      enterprise: false,
      renderedSitekeys: new Set(),
      actionBySitekey: new Map(),
      fallbackActions: []
    };
    for (const script of Array.from(document.querySelectorAll("script"))) {
      const src = textFrom(script.getAttribute("src"));
      const url = src ? parseUrl(src) : null;
      if (url && /\/recaptcha\//i.test(url.pathname)) {
        const apiDomain = normalizeRecaptchaApiDomain(url.hostname);
        if (apiDomain) {
          recaptchaSignals.apiDomain = recaptchaSignals.apiDomain || apiDomain;
        }
        if (/enterprise\.js$/i.test(url.pathname)) {
          recaptchaSignals.enterprise = true;
        }
        const renderValue = textFrom(url.searchParams.get("render"));
        if (renderValue && renderValue.toLowerCase() !== "explicit") {
          recaptchaSignals.renderedSitekeys.add(renderValue);
        }
      }
      const scriptText = textFrom(script.textContent);
      if (!scriptText) {
        continue;
      }
      if (/grecaptcha\.enterprise\.execute/i.test(scriptText)) {
        recaptchaSignals.enterprise = true;
      }
      const executePattern =
        /grecaptcha(?:\.enterprise)?\.execute\(\s*['"]([^'"]+)['"]\s*,\s*\{[\s\S]{0,400}?action\s*:\s*['"]([^'"]+)['"]/gi;
      for (const match of scriptText.matchAll(executePattern)) {
        const sitekey = textFrom(match?.[1]);
        const action = textFrom(match?.[2]);
        if (sitekey) {
          recaptchaSignals.renderedSitekeys.add(sitekey);
          if (action) {
            recaptchaSignals.actionBySitekey.set(sitekey, action);
          }
        } else if (action) {
          recaptchaSignals.fallbackActions.push(action);
        }
      }
    }

    const items = new Map();
    const pushChallenge = (candidate) => {
      const type = normalizeType(candidate?.type);
      const sitekey = textFrom(candidate?.sitekey);
      if (!type || !sitekey) {
        return;
      }
      const dedupeKey = `${type}:${sitekey}`;
      const existing = items.get(dedupeKey) || null;
      const merged = {
        type,
        sitekey,
        pageurl: mergeText(candidate?.pageurl, existing?.pageurl) || window.location.href,
        callback_name: mergeText(candidate?.callback_name, existing?.callback_name),
        data_s: mergeText(candidate?.data_s, existing?.data_s),
        action: mergeText(candidate?.action, existing?.action),
        data: mergeText(candidate?.data, existing?.data),
        pagedata: mergeText(candidate?.pagedata, existing?.pagedata),
        version: normalizeRecaptchaVersion(candidate?.version) || normalizeRecaptchaVersion(existing?.version),
        min_score: normalizeRecaptchaScore(candidate?.min_score ?? existing?.min_score),
        api_domain: mergeText(candidate?.api_domain, existing?.api_domain),
        invisible: candidate?.invisible === true || existing?.invisible === true,
        enterprise: candidate?.enterprise === true || existing?.enterprise === true
      };
      items.set(dedupeKey, merged);
    };

    for (const iframe of Array.from(document.querySelectorAll("iframe[src]"))) {
      const src = textFrom(iframe.getAttribute("src"));
      const url = parseUrl(src);
      if (!url) {
        continue;
      }
      const href = url.toString();
      if (/recaptcha/i.test(href)) {
        pushChallenge({
          type: "recaptcha",
          sitekey: url.searchParams.get("k") || url.searchParams.get("sitekey") || url.searchParams.get("render"),
          data_s: url.searchParams.get("s"),
          api_domain: normalizeRecaptchaApiDomain(url.hostname),
          version:
            textFrom(url.searchParams.get("render")).toLowerCase() &&
            textFrom(url.searchParams.get("render")).toLowerCase() !== "explicit"
              ? "v3"
              : null,
          invisible: isInvisibleIframeChallenge(url),
          enterprise: /enterprise/i.test(href)
        });
      } else if (/hcaptcha/i.test(href)) {
        pushChallenge({
          type: "hcaptcha",
          sitekey: url.searchParams.get("sitekey"),
          invisible: isInvisibleIframeChallenge(url)
        });
      } else if (/turnstile/i.test(href) || /challenges\.cloudflare\.com/i.test(href)) {
        pushChallenge({
          type: "turnstile",
          sitekey: url.searchParams.get("sitekey"),
          action: url.searchParams.get("action"),
          data: url.searchParams.get("cData") || url.searchParams.get("data"),
          pagedata: url.searchParams.get("pagedata")
        });
      }
    }

    for (const element of Array.from(document.querySelectorAll(".g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], [data-site-key]"))) {
      const className = textFrom(
        typeof element.className === "string" ? element.className : element.getAttribute("class")
      ).toLowerCase();
      const sitekey = textFrom(element.getAttribute("data-sitekey") || element.getAttribute("data-site-key"));
      let type = "";
      if (className.includes("h-captcha")) {
        type = "hcaptcha";
      } else if (className.includes("turnstile")) {
        type = "turnstile";
      } else if (className.includes("g-recaptcha") || sitekey) {
        type = "recaptcha";
      }
      if (!sitekey || !type) {
        continue;
      }
      pushChallenge({
        type,
        sitekey,
        callback_name: textFrom(element.getAttribute("data-callback")),
        data_s: textFrom(element.getAttribute("data-s")),
        action: textFrom(element.getAttribute("data-action")),
        data: textFrom(element.getAttribute("data-cdata") || element.getAttribute("data-data")),
        pagedata: textFrom(element.getAttribute("data-pagedata")),
        version: type === "recaptcha" && textFrom(element.getAttribute("data-action")) ? "v3" : null,
        invisible: /invisible/i.test(textFrom(element.getAttribute("data-size"))),
        enterprise:
          element.getAttribute("data-enterprise") === "true" ||
          /enterprise/i.test(textFrom(element.getAttribute("data-theme")))
      });
    }

    for (const sitekey of Array.from(recaptchaSignals.renderedSitekeys)) {
      pushChallenge({
        type: "recaptcha",
        sitekey,
        version: "v3",
        action: recaptchaSignals.actionBySitekey.get(sitekey) || null,
        api_domain: recaptchaSignals.apiDomain,
        enterprise: recaptchaSignals.enterprise
      });
    }

    const finalized = Array.from(items.values()).map((candidate) => {
      if (candidate.type !== "recaptcha") {
        return candidate;
      }
      const sitekey = textFrom(candidate.sitekey);
      const hasRenderedSitekey = sitekey ? recaptchaSignals.renderedSitekeys.has(sitekey) : false;
      const action =
        textFrom(candidate.action) ||
        (sitekey ? textFrom(recaptchaSignals.actionBySitekey.get(sitekey)) : "") ||
        (items.size === 1 ? textFrom(recaptchaSignals.fallbackActions[0]) : "");
      const version =
        normalizeRecaptchaVersion(candidate.version) ||
        (action || hasRenderedSitekey ? "v3" : "v2");
      return {
        ...candidate,
        action: action || null,
        version,
        min_score: version === "v3" ? normalizeRecaptchaScore(candidate.min_score) || 0.3 : null,
        api_domain: normalizeRecaptchaApiDomain(candidate.api_domain) || recaptchaSignals.apiDomain || "google.com",
        enterprise: candidate.enterprise === true || recaptchaSignals.enterprise === true
      };
    });

    return finalized;
  });

  return Array.isArray(challenges) && challenges.length > 0 ? challenges[0] : null;
}

async function requestTwoCaptchaToken(challenge, runtime, options = {}) {
  const config = isPlainObject(runtime?.twoCaptcha) ? runtime.twoCaptcha : {};
  const apiKey = sanitizeOptionalString(config.apiKey, 512);
  if (!apiKey) {
    return { ok: false, skipped: true, error: "2Captcha API key is not configured." };
  }

  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof fetch === "function"
        ? fetch.bind(globalThis)
        : null;
  if (typeof fetchImpl !== "function") {
    return { ok: false, skipped: false, error: "fetch is not available for 2Captcha requests." };
  }

  const type = sanitizeString(challenge?.type, 32).toLowerCase();
  const sitekey = sanitizeOptionalString(challenge?.sitekey, 1024);
  const pageurl = sanitizeOptionalString(challenge?.pageurl, 4096);
  if (!type || !sitekey || !pageurl) {
    return { ok: false, skipped: true, error: "2Captcha challenge is missing type, sitekey, or page URL." };
  }
  const recaptchaVersion = sanitizeString(challenge?.version, 16).toLowerCase() || "v2";
  const recaptchaAction =
    sanitizeOptionalString(challenge?.action, 128) || sanitizeOptionalString(config.recaptchaV3Action, 128) || null;
  const recaptchaApiDomain = sanitizeOptionalString(challenge?.api_domain, 64) || "google.com";
  const recaptchaMinScoreRaw = Number(challenge?.min_score ?? config.recaptchaV3MinScore);
  const recaptchaMinScore =
    Number.isFinite(recaptchaMinScoreRaw) && recaptchaMinScoreRaw >= 0.8
      ? 0.9
      : Number.isFinite(recaptchaMinScoreRaw) && recaptchaMinScoreRaw >= 0.5
        ? 0.7
        : 0.3;

  const apiBaseUrl = (sanitizeOptionalString(config.apiBaseUrl, 4096) || "https://2captcha.com").replace(/\/+$/, "");
  const createParams = new URLSearchParams({
    key: apiKey,
    json: "1",
    pageurl
  });
  if (config.softId) {
    createParams.set("soft_id", String(config.softId));
  }

  if (type === "recaptcha") {
    createParams.set("method", "userrecaptcha");
    createParams.set("googlekey", sitekey);
    if (recaptchaVersion === "v3") {
      createParams.set("version", "v3");
      createParams.set("min_score", String(recaptchaMinScore));
      if (recaptchaAction) {
        createParams.set("action", recaptchaAction);
      }
    }
    if (challenge.enterprise) {
      createParams.set("enterprise", "1");
    }
    if (challenge.data_s) {
      createParams.set("data-s", challenge.data_s);
    }
    if (recaptchaApiDomain === "recaptcha.net") {
      createParams.set("domain", "recaptcha.net");
    }
    if (challenge.invisible && recaptchaVersion !== "v3") {
      createParams.set("invisible", "1");
    }
  } else if (type === "hcaptcha") {
    createParams.set("method", "hcaptcha");
    createParams.set("sitekey", sitekey);
    if (challenge.invisible) {
      createParams.set("invisible", "1");
    }
  } else if (type === "turnstile") {
    createParams.set("method", "turnstile");
    createParams.set("sitekey", sitekey);
    if (challenge.action) {
      createParams.set("action", challenge.action);
    }
    if (challenge.data) {
      createParams.set("data", challenge.data);
    }
    if (challenge.pagedata) {
      createParams.set("pagedata", challenge.pagedata);
    }
  } else {
    return { ok: false, skipped: true, error: `Unsupported captcha type for 2Captcha: ${type}` };
  }

  let createResponse;
  try {
    createResponse = await fetchImpl(`${apiBaseUrl}/in.php`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: createParams.toString()
    });
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error?.message || "2Captcha task creation request failed."
    };
  }

  const createText = await createResponse.text();
  const createParsed = parseTwoCaptchaApiResponse(createText);
  if (!createResponse.ok || createParsed.status !== 1 || !createParsed.request) {
    return {
      ok: false,
      skipped: false,
      error: createParsed.request || `2Captcha task creation failed with HTTP ${createResponse.status}.`
    };
  }

  const taskId = createParsed.request;
  const timeoutMs = Math.max(10000, Math.min(600000, Number(config.timeoutMs) || 180000));
  const pollIntervalMs = Math.max(1000, Math.min(60000, Number(config.pollIntervalMs) || 5000));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    let pollResponse;
    try {
      pollResponse = await fetchImpl(
        `${apiBaseUrl}/res.php?${new URLSearchParams({
          key: apiKey,
          action: "get",
          id: taskId,
          json: "1"
        }).toString()}`,
        {
          method: "GET"
        }
      );
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        taskId,
        error: error?.message || "2Captcha polling request failed."
      };
    }

    const pollText = await pollResponse.text();
    const pollParsed = parseTwoCaptchaApiResponse(pollText);
    if (pollParsed.status === 1 && pollParsed.request) {
      return {
        ok: true,
        taskId,
        token: pollParsed.request
      };
    }
    if ((pollParsed.request || "").toUpperCase() !== "CAPCHA_NOT_READY") {
      return {
        ok: false,
        skipped: false,
        taskId,
        error: pollParsed.request || `2Captcha polling failed with HTTP ${pollResponse.status}.`
      };
    }
  }

  return {
    ok: false,
    skipped: false,
    taskId,
    error: `2Captcha timed out after ${timeoutMs}ms.`
  };
}

async function applyCaptchaToken(page, challenge, token) {
  if (!page || typeof page.evaluate !== "function") {
    return { ok: false, appliedCount: 0, callbackCount: 0, error: "Page handle is not available." };
  }

  try {
    const result = await page.evaluate(({ challenge: widget, tokenValue }) => {
      const textFrom = (value) => (typeof value === "string" ? value.trim() : "");
      const dispatch = (element) => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const ensureField = (name, tagName = "textarea") => {
        const selector = `${tagName}[name='${name}'], input[name='${name}']`;
        let element = document.querySelector(selector);
        if (!element) {
          const parent = document.querySelector("form") || document.body || document.documentElement;
          element = document.createElement(tagName);
          element.setAttribute("name", name);
          element.style.display = "none";
          parent.appendChild(element);
        }
        return element;
      };
      const setValue = (element, value) => {
        if (!element) {
          return false;
        }
        element.value = value;
        if ("innerHTML" in element) {
          element.innerHTML = value;
        }
        dispatch(element);
        return true;
      };
      const resolveWindowPath = (value) => {
        const pathValue = textFrom(value);
        if (!pathValue) {
          return null;
        }
        return pathValue.split(".").reduce((current, key) => {
          if (!current || typeof current !== "object") {
            return null;
          }
          return current[key];
        }, window);
      };
      const invokeCallback = (candidate, value) => {
        if (typeof candidate === "function") {
          candidate(value);
          return true;
        }
        if (typeof candidate === "string") {
          const resolved = resolveWindowPath(candidate);
          if (typeof resolved === "function") {
            resolved(value);
            return true;
          }
        }
        return false;
      };
      const invokeClientCallbacks = (root, value) => {
        let count = 0;
        const queue = [root];
        const seen = new Set();
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
          }
          seen.add(current);
          for (const [key, child] of Object.entries(current)) {
            if (/^(callback|cb|promise-callback)$/i.test(key)) {
              if (invokeCallback(child, value)) {
                count += 1;
              }
              continue;
            }
            if (child && typeof child === "object") {
              queue.push(child);
            }
          }
        }
        return count;
      };

      let appliedCount = 0;
      let callbackCount = 0;
      const type = textFrom(widget?.type).toLowerCase();
      const callbackName = textFrom(widget?.callback_name);

      const applyNamedFields = (names) => {
        for (const name of names) {
          for (const tagName of ["textarea", "input"]) {
            const element = ensureField(name, tagName);
            if (setValue(element, tokenValue)) {
              appliedCount += 1;
            }
          }
        }
      };

      if (type === "recaptcha") {
        applyNamedFields(["g-recaptcha-response"]);
        callbackCount += invokeClientCallbacks(window.___grecaptcha_cfg?.clients || null, tokenValue);
      } else if (type === "hcaptcha") {
        applyNamedFields(["h-captcha-response", "g-recaptcha-response"]);
        callbackCount += invokeClientCallbacks(window.___hcaptcha_cfg?.clients || null, tokenValue);
      } else if (type === "turnstile") {
        applyNamedFields(["cf-turnstile-response"]);
      } else {
        return {
          ok: false,
          appliedCount: 0,
          callbackCount: 0,
          error: `Unsupported captcha type: ${type}`
        };
      }

      if (callbackName && invokeCallback(callbackName, tokenValue)) {
        callbackCount += 1;
      }

      return {
        ok: appliedCount > 0 || callbackCount > 0,
        appliedCount,
        callbackCount,
        error: appliedCount > 0 || callbackCount > 0 ? null : "Captcha token was not applied to the page."
      };
    }, { challenge, tokenValue: token });

    return isPlainObject(result)
      ? result
      : { ok: false, appliedCount: 0, callbackCount: 0, error: "Captcha token injection returned no result." };
  } catch (error) {
    return {
      ok: false,
      appliedCount: 0,
      callbackCount: 0,
      error: error?.message || "Captcha token injection failed."
    };
  }
}

async function attemptTwoCaptchaSolve(page, runtime, runLog, options = {}) {
  const challenge = await detectSupportedCaptchaChallenge(page);
  if (!challenge) {
    return {
      ok: false,
      skipped: true,
      error: "Captcha was detected, but no supported widget with a sitekey was found."
    };
  }

  appendRunLog(runLog, "twocaptcha_challenge_detected", {
    type: challenge.type,
    version: sanitizeOptionalString(challenge?.version, 16) || null,
    action: sanitizeOptionalString(challenge?.action, 128) || null,
    page_url: challenge.pageurl
  });
  const tokenResult = await requestTwoCaptchaToken(challenge, runtime, options);
  if (!tokenResult.ok) {
    appendRunLog(runLog, "twocaptcha_failed", {
      type: challenge.type,
      task_id: tokenResult.taskId || null,
      message: tokenResult.error || "2Captcha solve failed"
    });
    return {
      ok: false,
      skipped: tokenResult.skipped === true,
      challenge,
      taskId: tokenResult.taskId || null,
      error: tokenResult.error || "2Captcha solve failed"
    };
  }

  appendRunLog(runLog, "twocaptcha_token_received", {
    type: challenge.type,
    version: sanitizeOptionalString(challenge?.version, 16) || null,
    task_id: tokenResult.taskId
  });
  const injection = await applyCaptchaToken(page, challenge, tokenResult.token);
  if (!injection.ok) {
    appendRunLog(runLog, "twocaptcha_apply_failed", {
      type: challenge.type,
      task_id: tokenResult.taskId,
      message: injection.error || "Captcha token injection failed"
    });
    return {
      ok: false,
      skipped: false,
      challenge,
      taskId: tokenResult.taskId,
      error: injection.error || "Captcha token injection failed"
    };
  }

  const postInjectWaitMs = Math.max(
    0,
    Math.min(120000, Number(runtime?.twoCaptcha?.postInjectWaitMs) || 4000)
  );
  if (postInjectWaitMs > 0) {
    await page.waitForTimeout(postInjectWaitMs);
  }

  const snapshot = await evaluatePageSnapshot(page, "post_captcha_twocaptcha");
  const resolved =
    !(Array.isArray(snapshot?.captcha_hints) && snapshot.captcha_hints.length > 0);
  appendRunLog(runLog, "twocaptcha_apply_completed", {
    type: challenge.type,
    version: sanitizeOptionalString(challenge?.version, 16) || null,
    task_id: tokenResult.taskId,
    applied_count: injection.appliedCount || 0,
    callback_count: injection.callbackCount || 0,
    resolved
  });

  return {
    ok: true,
    challenge,
    taskId: tokenResult.taskId,
    resolved,
    snapshot,
    note: resolved ? "2Captcha token was applied and the challenge no longer appears active." : null,
    appliedCount: injection.appliedCount || 0,
    callbackCount: injection.callbackCount || 0
  };
}

function buildSelfHostedRuntimeConfig(jobRequest, options = {}) {
  const effectiveJobRequest = buildJobRequestWithConnectorRuntimeOverrides(jobRequest);
  const metadata = isPlainObject(effectiveJobRequest?.metadata) ? effectiveJobRequest.metadata : {};
  const headless =
    parseBoolean(
      options.headless ??
        metadata.self_hosted_headless ??
        process.env.SUBMISSION_SELF_HOSTED_HEADLESS ??
        process.env.SUBMISSION_DO_HEADLESS ??
        process.env.SUBMISSION_LOCAL_HEADLESS ??
        process.env.QA_LOCAL_HEADLESS ??
        "true"
    ) !== false;
  const browserChannel = sanitizeOptionalString(
    options.browserChannel ??
      metadata.self_hosted_browser_channel ??
      process.env.SUBMISSION_SELF_HOSTED_BROWSER_CHANNEL ??
      process.env.SUBMISSION_DO_BROWSER_CHANNEL ??
      process.env.SUBMISSION_LOCAL_BROWSER_CHANNEL ??
      "chromium",
    64
  );
  const profileRootDir =
    sanitizeOptionalString(
      options.profileRootDir ??
        metadata.self_hosted_profile_root_dir ??
        process.env.SUBMISSION_SELF_HOSTED_PROFILE_ROOT_DIR ??
        process.env.SUBMISSION_DO_PROFILE_ROOT_DIR,
      4096
    ) || null;
  const profileNamespace =
    sanitizeOptionalString(
      options.profileNamespace ??
        metadata.self_hosted_profile_namespace ??
        process.env.SUBMISSION_SELF_HOSTED_PROFILE_NAMESPACE ??
        process.env.SUBMISSION_DO_PROFILE_NAMESPACE,
      256
    ) || null;
  const launchTimeoutMs = Math.max(
    1000,
    Math.min(
      120000,
      Number(
        options.launchTimeoutMs ??
          metadata.self_hosted_browser_launch_timeout_ms ??
          process.env.SUBMISSION_SELF_HOSTED_BROWSER_LAUNCH_TIMEOUT_MS ??
          process.env.SUBMISSION_DO_BROWSER_LAUNCH_TIMEOUT_MS ??
          process.env.SUBMISSION_LOCAL_BROWSER_LAUNCH_TIMEOUT_MS ??
          process.env.QA_LOCAL_BROWSER_LAUNCH_TIMEOUT_MS
      ) || 30000
    )
  );
  const viewport =
    parseViewportValue(options.viewport ?? metadata.self_hosted_viewport) || { width: 1440, height: 900 };
  const locale =
    sanitizeOptionalString(
      options.locale ??
        metadata.self_hosted_locale ??
        process.env.SUBMISSION_SELF_HOSTED_LOCALE ??
        process.env.SUBMISSION_DO_LOCALE,
      32
    ) || "en-US";
  const timezoneId =
    sanitizeOptionalString(
      options.timezoneId ??
        metadata.self_hosted_timezone_id ??
        process.env.SUBMISSION_SELF_HOSTED_TIMEZONE_ID ??
        process.env.SUBMISSION_DO_TIMEZONE_ID,
      128
    ) || "America/New_York";
  const userAgent =
    sanitizeOptionalString(
      options.userAgent ??
        metadata.self_hosted_user_agent ??
        process.env.SUBMISSION_SELF_HOSTED_USER_AGENT ??
        process.env.SUBMISSION_DO_USER_AGENT,
      1024
    ) || null;
  const proxyServer =
    sanitizeOptionalString(
      options.proxyServer ??
        metadata.self_hosted_proxy_server ??
        process.env.SUBMISSION_SELF_HOSTED_PROXY_SERVER ??
        process.env.SUBMISSION_DO_PROXY_SERVER,
      4096
    ) || null;
  const proxy = proxyServer
    ? {
        server: proxyServer,
        ...(sanitizeOptionalString(
          options.proxyUsername ??
            metadata.self_hosted_proxy_username ??
            process.env.SUBMISSION_SELF_HOSTED_PROXY_USERNAME ??
            process.env.SUBMISSION_DO_PROXY_USERNAME,
          512
        )
          ? {
              username: sanitizeOptionalString(
                options.proxyUsername ??
                  metadata.self_hosted_proxy_username ??
                  process.env.SUBMISSION_SELF_HOSTED_PROXY_USERNAME ??
                  process.env.SUBMISSION_DO_PROXY_USERNAME,
                512
              )
            }
          : {}),
        ...(sanitizeOptionalString(
          options.proxyPassword ??
            metadata.self_hosted_proxy_password ??
            process.env.SUBMISSION_SELF_HOSTED_PROXY_PASSWORD ??
            process.env.SUBMISSION_DO_PROXY_PASSWORD,
          512
        )
          ? {
              password: sanitizeOptionalString(
                options.proxyPassword ??
                  metadata.self_hosted_proxy_password ??
                  process.env.SUBMISSION_SELF_HOSTED_PROXY_PASSWORD ??
                  process.env.SUBMISSION_DO_PROXY_PASSWORD,
                512
              )
            }
          : {}),
        ...(sanitizeOptionalString(
          options.proxyBypass ??
            metadata.self_hosted_proxy_bypass ??
            process.env.SUBMISSION_SELF_HOSTED_PROXY_BYPASS ??
            process.env.SUBMISSION_DO_PROXY_BYPASS,
          1024
        )
          ? {
              bypass: sanitizeOptionalString(
                options.proxyBypass ??
                  metadata.self_hosted_proxy_bypass ??
                  process.env.SUBMISSION_SELF_HOSTED_PROXY_BYPASS ??
                  process.env.SUBMISSION_DO_PROXY_BYPASS,
                1024
              )
            }
          : {})
      }
    : null;
  const geolocation = parseGeolocationValue(options.geolocation ?? metadata.self_hosted_geolocation);
  const stealthMode =
    parseBoolean(
      options.stealthMode ??
        metadata.submission_stealth_mode ??
        process.env.SUBMISSION_SELF_HOSTED_STEALTH_MODE ??
        process.env.SUBMISSION_DO_STEALTH_MODE ??
        "true"
    ) !== false;
  const blockAds =
    parseBoolean(
      options.blockAds ??
        metadata.submission_block_ads ??
        process.env.SUBMISSION_SELF_HOSTED_BLOCK_ADS ??
        process.env.SUBMISSION_DO_BLOCK_ADS
    ) === true;
  const recordVideo =
    parseBoolean(
      options.recordVideo ??
        metadata.self_hosted_record_video ??
        process.env.SUBMISSION_SELF_HOSTED_RECORD_VIDEO ??
        process.env.SUBMISSION_DO_RECORD_VIDEO ??
        "true"
    ) !== false;
  const ignoreHttpsErrors =
    parseBoolean(
      options.ignoreHttpsErrors ??
        metadata.self_hosted_ignore_https_errors ??
        process.env.SUBMISSION_SELF_HOSTED_IGNORE_HTTPS_ERRORS ??
        process.env.SUBMISSION_DO_IGNORE_HTTPS_ERRORS
    ) === true;
  const captchaHeaders = parseHeaderMap(metadata.captcha_hook_headers);
  const envCaptchaHeaders = (() => {
    const raw = sanitizeOptionalString(
      process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_HOOK_HEADERS_JSON ||
        process.env.SUBMISSION_DO_CAPTCHA_HOOK_HEADERS_JSON,
      20000
    );
    if (!raw) {
      return {};
    }
    try {
      return parseHeaderMap(JSON.parse(raw));
    } catch {
      return {};
    }
  })();
  const captchaHookUrl =
    sanitizeOptionalString(
      options.captchaHookUrl ??
        metadata.captcha_hook_url ??
        process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_HOOK_URL ??
        process.env.SUBMISSION_DO_CAPTCHA_HOOK_URL,
      4096
    ) || null;
  const captchaHookTimeoutMs = Math.max(
    1000,
    Math.min(
      120000,
      Number(
        options.captchaHookTimeoutMs ??
          metadata.captcha_hook_timeout_ms ??
          process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_HOOK_TIMEOUT_MS ??
          process.env.SUBMISSION_DO_CAPTCHA_HOOK_TIMEOUT_MS
      ) || 15000
    )
  );
  const captchaHookWaitMs = Math.max(
    0,
    Math.min(
      300000,
      Number(
        options.captchaHookWaitMs ??
          metadata.captcha_hook_wait_ms ??
          process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_HOOK_WAIT_MS ??
          process.env.SUBMISSION_DO_CAPTCHA_HOOK_WAIT_MS
      ) || 15000
    )
  );
  const captchaHookRequired =
    parseBoolean(
      options.captchaHookRequired ??
        metadata.captcha_hook_required ??
        process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_HOOK_REQUIRED ??
        process.env.SUBMISSION_DO_CAPTCHA_HOOK_REQUIRED
    ) === true;
  const captchaStrategy = (() => {
    const raw = sanitizeString(
      options.captchaStrategy ??
        metadata.submission_captcha_strategy ??
        process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_STRATEGY ??
        process.env.SUBMISSION_DO_CAPTCHA_STRATEGY ??
        "built_in",
      32
    ).toLowerCase();
    if (["built_in", "hook", "pause"].includes(raw)) {
      return raw;
    }
    return "built_in";
  })();
  const captchaBuiltInWaitMs = Math.max(
    0,
    Math.min(
      300000,
      Number(
        options.captchaBuiltInWaitMs ??
          metadata.captcha_builtin_wait_ms ??
          process.env.SUBMISSION_SELF_HOSTED_CAPTCHA_BUILTIN_WAIT_MS ??
          process.env.SUBMISSION_DO_CAPTCHA_BUILTIN_WAIT_MS
      ) || 15000
    )
  );
  const twoCaptchaApiKey =
    sanitizeOptionalString(
      options.twoCaptchaApiKey ??
        metadata.twocaptcha_api_key ??
        process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_API_KEY ??
        process.env.SUBMISSION_DO_2CAPTCHA_API_KEY ??
        process.env.TWOCAPTCHA_API_KEY ??
        process.env.TWO_CAPTCHA_API_KEY ??
        process.env.CAPTCHA_API_KEY,
      512
    ) || null;
  const twoCaptchaApiBaseUrl =
    sanitizeOptionalString(
      options.twoCaptchaApiBaseUrl ??
        metadata.twocaptcha_api_base_url ??
        process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_API_BASE_URL ??
        process.env.SUBMISSION_DO_2CAPTCHA_API_BASE_URL ??
        process.env.TWOCAPTCHA_API_BASE_URL ??
        "https://2captcha.com",
      4096
    ) || "https://2captcha.com";
  const twoCaptchaTimeoutMs = Math.max(
    10000,
    Math.min(
      600000,
      Number(
        options.twoCaptchaTimeoutMs ??
          metadata.twocaptcha_timeout_ms ??
          process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_TIMEOUT_MS ??
          process.env.SUBMISSION_DO_2CAPTCHA_TIMEOUT_MS ??
          process.env.TWOCAPTCHA_TIMEOUT_MS
      ) || 180000
    )
  );
  const twoCaptchaPollIntervalMs = Math.max(
    1000,
    Math.min(
      60000,
      Number(
        options.twoCaptchaPollIntervalMs ??
          metadata.twocaptcha_poll_interval_ms ??
          process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_POLL_INTERVAL_MS ??
          process.env.SUBMISSION_DO_2CAPTCHA_POLL_INTERVAL_MS ??
          process.env.TWOCAPTCHA_POLL_INTERVAL_MS
      ) || 5000
    )
  );
  const twoCaptchaPostInjectWaitMs = Math.max(
    0,
    Math.min(
      120000,
      Number(
        options.twoCaptchaPostInjectWaitMs ??
          metadata.twocaptcha_post_inject_wait_ms ??
          process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_POST_INJECT_WAIT_MS ??
          process.env.SUBMISSION_DO_2CAPTCHA_POST_INJECT_WAIT_MS ??
          process.env.TWOCAPTCHA_POST_INJECT_WAIT_MS
      ) || 4000
    )
  );
  const twoCaptchaSoftId = sanitizeOptionalString(
    options.twoCaptchaSoftId ??
      process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_SOFT_ID ??
      process.env.SUBMISSION_DO_2CAPTCHA_SOFT_ID ??
      process.env.TWOCAPTCHA_SOFT_ID,
    64
  );
  const twoCaptchaRecaptchaV3Action =
    sanitizeOptionalString(
      options.twoCaptchaRecaptchaV3Action ??
        metadata.twocaptcha_recaptcha_v3_action ??
        process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_RECAPTCHA_V3_ACTION ??
        process.env.SUBMISSION_DO_2CAPTCHA_RECAPTCHA_V3_ACTION ??
        process.env.TWOCAPTCHA_RECAPTCHA_V3_ACTION,
      128
    ) || null;
  const twoCaptchaRecaptchaV3MinScoreRaw = Number(
    options.twoCaptchaRecaptchaV3MinScore ??
      metadata.twocaptcha_recaptcha_v3_min_score ??
      process.env.SUBMISSION_SELF_HOSTED_2CAPTCHA_RECAPTCHA_V3_MIN_SCORE ??
      process.env.SUBMISSION_DO_2CAPTCHA_RECAPTCHA_V3_MIN_SCORE ??
      process.env.TWOCAPTCHA_RECAPTCHA_V3_MIN_SCORE
  );
  const twoCaptchaRecaptchaV3MinScore =
    Number.isFinite(twoCaptchaRecaptchaV3MinScoreRaw) && twoCaptchaRecaptchaV3MinScoreRaw >= 0.8
      ? 0.9
      : Number.isFinite(twoCaptchaRecaptchaV3MinScoreRaw) && twoCaptchaRecaptchaV3MinScoreRaw >= 0.5
        ? 0.7
        : 0.3;

  return {
    headless,
    browserChannel,
    profileRootDir,
    profileNamespace,
    launchTimeoutMs,
    viewport,
    locale,
    timezoneId,
    userAgent,
    proxy,
    geolocation,
    stealthMode,
    blockAds,
    recordVideo,
    ignoreHttpsErrors,
    captchaStrategy,
    captchaBuiltInWaitMs,
    captchaHook: {
      url: captchaHookUrl,
      timeoutMs: captchaHookTimeoutMs,
      waitMs: captchaHookWaitMs,
      required: captchaHookRequired,
      headers: {
        ...envCaptchaHeaders,
        ...captchaHeaders
      }
    },
    twoCaptcha: {
      enabled: Boolean(twoCaptchaApiKey),
      apiKey: twoCaptchaApiKey,
      apiBaseUrl: twoCaptchaApiBaseUrl,
      timeoutMs: twoCaptchaTimeoutMs,
      pollIntervalMs: twoCaptchaPollIntervalMs,
      postInjectWaitMs: twoCaptchaPostInjectWaitMs,
      softId: twoCaptchaSoftId || null,
      recaptchaV3Action: twoCaptchaRecaptchaV3Action,
      recaptchaV3MinScore: twoCaptchaRecaptchaV3MinScore
    }
  };
}

async function resolveSelfHostedRuntimeConfig(jobRequest, brand, options = {}) {
  const runtime = buildSelfHostedRuntimeConfig(jobRequest, options);
  const proxyResolution = await resolveSubmissionProxySelection(jobRequest, brand, runtime.proxy, options);
  if (proxyResolution?.proxy?.server) {
    runtime.proxy = proxyResolution.proxy;
  }
  runtime.proxySelection = isPlainObject(proxyResolution?.selection) ? proxyResolution.selection : null;
  runtime.proxyRotation = isPlainObject(proxyResolution?.rotation) ? proxyResolution.rotation : null;
  return runtime;
}

function getBrowserLaunchOptions(runtime) {
  const timeout = Math.max(
    1000,
    Math.min(
      120000,
      Number(runtime?.launchTimeoutMs) || 30000
    )
  );
  const launchOptions = {
    headless: runtime?.headless !== false,
    timeout
  };
  const channel = sanitizeOptionalString(runtime?.browserChannel, 64);
  if (channel && !["default", "none", "false", "0"].includes(channel.toLowerCase())) {
    launchOptions.channel = channel;
  }
  if (runtime?.proxy?.server) {
    launchOptions.proxy = runtime.proxy;
  }
  if (runtime?.headless === false) {
    launchOptions.args = [
      "--start-maximized",
      "--window-position=0,0",
      "--window-size=1440,900",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion"
    ];
  }
  return launchOptions;
}

function buildBrowserContextOptions(runtime, outputDir) {
  const contextOptions = {
    viewport: runtime?.viewport || { width: 1440, height: 900 },
    locale: runtime?.locale || "en-US",
    timezoneId: runtime?.timezoneId || "America/New_York"
  };

  if (runtime?.recordVideo !== false) {
    contextOptions.recordVideo = {
      dir: outputDir,
      size: { width: 1280, height: 720 }
    };
  }

  if (runtime?.userAgent) {
    contextOptions.userAgent = runtime.userAgent;
  }
  if (runtime?.ignoreHttpsErrors) {
    contextOptions.ignoreHTTPSErrors = true;
  }
  if (runtime?.geolocation) {
    contextOptions.geolocation = runtime.geolocation;
    contextOptions.permissions = ["geolocation"];
  }

  return contextOptions;
}

function sanitizeSubmissionCredentials(value) {
  if (!isPlainObject(value)) {
    return null;
  }
  const loginUrl = sanitizeOptionalString(value.login_url || value.loginUrl, 4096) || null;
  const username = sanitizeOptionalString(value.username, 320) || null;
  const password = sanitizeOptionalString(value.password, 320) || null;
  const otpMode = sanitizeString(value.otp_mode || value.otpMode || "none", 64).toLowerCase() || "none";
  if (!loginUrl && !username && !password && otpMode === "none") {
    return null;
  }
  return {
    login_url: loginUrl,
    username,
    password,
    otp_mode: otpMode
  };
}

function readBrandSiteConfig(brand, siteId) {
  const profile = isPlainObject(brand?.profile) ? brand.profile : {};
  const siteScopedCandidates = [
    isPlainObject(profile.site_auth) ? profile.site_auth[siteId] : null,
    isPlainObject(profile.auth) ? profile.auth[siteId] : null,
    isPlainObject(profile.site_credentials) ? profile.site_credentials[siteId] : null,
    isPlainObject(profile.credentials_by_site) ? profile.credentials_by_site[siteId] : null
  ];
  for (const candidate of siteScopedCandidates) {
    if (isPlainObject(candidate)) {
      return candidate;
    }
  }
  return {};
}

function supportsMailboxPlusAlias(identity = {}) {
  const mailbox = isPlainObject(identity?.mailbox) ? identity.mailbox : {};
  const provider = sanitizeString(mailbox.provider, 64).toLowerCase();
  return ["forwardemail", "gmail"].includes(provider);
}

function buildSiteMailboxAlias(email, siteId) {
  const safeEmail = sanitizeOptionalString(email, 320) || "";
  if (!safeEmail || !safeEmail.includes("@")) {
    return null;
  }

  const [localPart, domainPart] = safeEmail.split("@");
  const normalizedLocal = sanitizeString(localPart, 128).trim();
  const normalizedDomain = sanitizeString(domainPart, 255).trim();
  const siteSlug =
    sanitizeString(siteId, 64)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "listing";
  if (!normalizedLocal || !normalizedDomain || normalizedLocal.includes("+")) {
    return safeEmail;
  }
  return `${normalizedLocal}+${siteSlug}@${normalizedDomain}`;
}

function resolveSubmissionAuthConfig(jobRequest, brand, siteId, siteProfile = {}) {
  const metadata = isPlainObject(jobRequest?.metadata) ? { ...jobRequest.metadata } : {};
  const siteConfig = readBrandSiteConfig(brand, siteId);
  const brandIdentity = normalizeSubmissionIdentityProfile(brand?.profile?.identity || brand?.identity, {
    includeSecrets: true
  });
  const otpInbox = buildIdentityOtpInbox(brandIdentity);
  const siteCredentials =
    sanitizeSubmissionCredentials(jobRequest?.credentials) ||
    sanitizeSubmissionCredentials(metadata.credentials) ||
    sanitizeSubmissionCredentials(siteConfig.credentials) ||
    sanitizeSubmissionCredentials(siteConfig);

  const resolvedMetadata = {
    ...metadata
  };
  if (!sanitizeString(resolvedMetadata.auth_requirement, 128) && sanitizeString(siteConfig.auth_requirement, 128)) {
    resolvedMetadata.auth_requirement = sanitizeString(siteConfig.auth_requirement, 128);
  }
  if (!sanitizeString(resolvedMetadata.auth_policy, 64) && sanitizeString(siteConfig.auth_policy, 64)) {
    resolvedMetadata.auth_policy = sanitizeString(siteConfig.auth_policy, 64);
  }
  const shouldAutoCreate =
    !siteCredentials &&
    (parseBoolean(resolvedMetadata.auto_create_account, false) === true ||
      sanitizeString(resolvedMetadata.auth_policy, 64).toLowerCase() === "signup_if_needed" ||
      AUTO_CREATE_AUTH_SITE_IDS.has(sanitizeString(siteId, 128).toLowerCase()));
  const preferredAuthEmail =
    shouldAutoCreate && otpInbox?.email && supportsMailboxPlusAlias(brandIdentity)
      ? buildSiteMailboxAlias(otpInbox.email, siteId)
      : otpInbox?.email || null;
  if (!sanitizeOptionalString(resolvedMetadata.default_auth_email, 320) && preferredAuthEmail) {
    resolvedMetadata.default_auth_email = preferredAuthEmail;
  }
  if (!sanitizeOptionalString(resolvedMetadata.default_auth_name, 128) && sanitizeOptionalString(brandIdentity?.owner_name, 128)) {
    resolvedMetadata.default_auth_name = sanitizeOptionalString(brandIdentity.owner_name, 128);
  }
  if (!isPlainObject(resolvedMetadata.otp_inbox) && otpInbox) {
    resolvedMetadata.otp_inbox = otpInbox;
  }
  if (!sanitizeString(resolvedMetadata.otp_provider, 64) && otpInbox?.provider) {
    resolvedMetadata.otp_provider = otpInbox.provider;
  }
  if (resolvedMetadata.auto_create_account === undefined && siteConfig.auto_create_account !== undefined) {
    resolvedMetadata.auto_create_account = parseBoolean(siteConfig.auto_create_account);
  }
  if (
    !siteCredentials &&
    !sanitizeString(resolvedMetadata.auth_policy, 64) &&
    AUTO_CREATE_AUTH_SITE_IDS.has(sanitizeString(siteId, 128).toLowerCase())
  ) {
    resolvedMetadata.auth_policy = "signup_if_needed";
    resolvedMetadata.auto_create_account = true;
  }
  if (
    !sanitizeString(resolvedMetadata.auth_requirement, 128) &&
    sanitizeString(siteId, 128).toLowerCase() === "google_business_profile"
  ) {
    resolvedMetadata.auth_requirement = "google_oauth";
  }

  return {
    metadata: resolvedMetadata,
    credentials: siteCredentials,
    shouldAttempt:
      Boolean(siteCredentials) ||
      parseBoolean(resolvedMetadata.auto_create_account, false) === true ||
      sanitizeString(resolvedMetadata.auth_policy, 64).toLowerCase() === "signup_if_needed" ||
      sanitizeString(resolvedMetadata.auth_requirement, 128).length > 0 ||
      (Array.isArray(siteProfile?.gates) && siteProfile.gates.some((gate) => sanitizeString(gate?.type, 64) === "auth"))
  };
}

function resolvePersistentProfileDir(runtime, jobRequest) {
  const rootDir = sanitizeOptionalString(runtime?.profileRootDir, 4096);
  if (!rootDir) {
    return null;
  }
  const namespace = toSafeSlug(runtime?.profileNamespace || "default", "default");
  const brandSlug = toSafeSlug(jobRequest?.brand_profile_id || "brand", "brand");
  const siteSlug = toSafeSlug(jobRequest?.site_id || "site", "site");
  return path.resolve(rootDir, namespace, brandSlug, siteSlug);
}

async function launchSubmissionBrowserContext(runtime, outputDir, jobRequest) {
  const persistentProfileDir = resolvePersistentProfileDir(runtime, jobRequest);
  if (persistentProfileDir) {
    mkdirp(persistentProfileDir);
    const context = await chromium.launchPersistentContext(
      persistentProfileDir,
      {
        ...getBrowserLaunchOptions(runtime),
        ...buildBrowserContextOptions(runtime, outputDir)
      }
    );
    const page = context.pages()[0] || (await context.newPage());
    return {
      browser: null,
      context,
      page,
      videoHandle: typeof page.video === "function" ? page.video() : null,
      persistentProfileDir
    };
  }

  const browser = await chromium.launch(getBrowserLaunchOptions(runtime));
  const context = await browser.newContext(buildBrowserContextOptions(runtime, outputDir));
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    videoHandle: typeof page.video === "function" ? page.video() : null,
    persistentProfileDir: null
  };
}

function planBlockingOverlayAction(dialogText, buttonTexts = []) {
  const normalizedDialog = sanitizeString(dialogText, 4000);
  const normalizedButtons = Array.isArray(buttonTexts)
    ? buttonTexts.map((text) => sanitizeString(text, 320)).filter(Boolean)
    : [];

  if (COUNTRY_DIALOG_PATTERN.test(normalizedDialog)) {
    const usOption = normalizedButtons.find((text) => COUNTRY_PREFERRED_US_PATTERN.test(text));
    if (usOption) {
      return {
        kind: "country",
        label: usOption,
        pattern: COUNTRY_PREFERRED_US_PATTERN
      };
    }
  }

  if (COOKIE_DIALOG_PATTERN.test(normalizedDialog)) {
    const cookieOption = normalizedButtons.find((text) =>
      OVERLAY_COOKIE_PATTERNS.some((pattern) => pattern.test(text))
    );
    if (cookieOption) {
      return {
        kind: "cookie",
        label: cookieOption,
        pattern: OVERLAY_COOKIE_PATTERNS.find((pattern) => pattern.test(cookieOption)) || null
      };
    }
  }

  const dismissOption = normalizedButtons.find((text) =>
    OVERLAY_CLOSE_PATTERNS.some((pattern) => pattern.test(text))
  );
  if (dismissOption) {
    return {
      kind: "dismiss",
      label: dismissOption,
      pattern: OVERLAY_CLOSE_PATTERNS.find((pattern) => pattern.test(dismissOption)) || null
    };
  }

  return null;
}

async function dismissBlockingOverlays(page, runLog) {
  if (!page || typeof page.locator !== "function") {
    return [];
  }

  const overlaySelectors = [
    "[role='dialog']",
    "[aria-modal='true']",
    ".modal",
    "[class*='modal']",
    "[id*='modal']",
    "[class*='cookie']",
    "[id*='cookie']",
    "[class*='consent']",
    "[id*='consent']"
  ];
  const actions = [];

  for (let pass = 0; pass < 3; pass += 1) {
    let actionTaken = false;
    for (const selector of overlaySelectors) {
      const overlays = page.locator(selector);
      const overlayCount = Math.min((await overlays.count().catch(() => 0)) || 0, 5);
      for (let index = 0; index < overlayCount; index += 1) {
        const overlay = overlays.nth(index);
        if (!(await overlay.isVisible().catch(() => false))) {
          continue;
        }
        const dialogText = sanitizeString(await overlay.innerText().catch(() => ""), 4000);
        const buttonLocator = overlay.locator("button, a, [role='button']");
        const buttonCount = Math.min((await buttonLocator.count().catch(() => 0)) || 0, 20);
        const buttonTexts = [];
        for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex += 1) {
          const button = buttonLocator.nth(buttonIndex);
          if (!(await button.isVisible().catch(() => false))) {
            continue;
          }
          const buttonText = sanitizeString(
            (await button.innerText().catch(() => "")) ||
              (await button.getAttribute("aria-label").catch(() => "")) ||
              (await button.getAttribute("title").catch(() => "")),
            320
          );
          if (buttonText) {
            buttonTexts.push(buttonText);
          }
        }
        const plan = planBlockingOverlayAction(dialogText, buttonTexts);
        if (!plan?.pattern) {
          continue;
        }

        for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex += 1) {
          const button = buttonLocator.nth(buttonIndex);
          if (!(await button.isVisible().catch(() => false))) {
            continue;
          }
          const buttonText = sanitizeString(
            (await button.innerText().catch(() => "")) ||
              (await button.getAttribute("aria-label").catch(() => "")) ||
              (await button.getAttribute("title").catch(() => "")),
            320
          );
          if (!buttonText || !plan.pattern.test(buttonText)) {
            continue;
          }
          await button.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(900);
          appendRunLog(runLog, "blocking_overlay_dismissed", {
            kind: plan.kind,
            button_label: buttonText
          });
          actions.push({
            kind: plan.kind,
            button_label: buttonText
          });
          actionTaken = true;
          break;
        }

        if (actionTaken) {
          break;
        }
      }
      if (actionTaken) {
        break;
      }
    }

    if (!actionTaken) {
      break;
    }
  }

  return actions;
}

async function applyStealthMode(context, runtime) {
  if (!runtime?.stealthMode || !context || typeof context.addInitScript !== "function") {
    return;
  }

  await context.addInitScript(() => {
    const overrideGetter = (object, property, valueFactory) => {
      try {
        Object.defineProperty(object, property, {
          configurable: true,
          get: valueFactory
        });
      } catch {
        // Ignore override failures.
      }
    };

    overrideGetter(Navigator.prototype, "webdriver", () => undefined);
    overrideGetter(Navigator.prototype, "languages", () => ["en-US", "en"]);
    overrideGetter(Navigator.prototype, "platform", () => "MacIntel");
    overrideGetter(Navigator.prototype, "plugins", () => [
      { name: "Chrome PDF Plugin" },
      { name: "Chrome PDF Viewer" },
      { name: "Native Client" }
    ]);

    if (!window.chrome) {
      window.chrome = { runtime: {} };
    } else if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }

    if (navigator.permissions?.query) {
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) => {
        if (parameters?.name === "notifications") {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(parameters);
      };
    }
  });
}

async function applyNetworkControls(page, runtime, runLog) {
  if (!runtime?.blockAds || !page || typeof page.route !== "function") {
    return;
  }

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (AD_BLOCK_PATTERNS.some((pattern) => pattern.test(url))) {
      appendRunLog(runLog, "request_blocked", {
        url,
        reason: "ad_or_tracker_blocked"
      });
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }
    await route.continue().catch(() => {});
  });
}

async function callCaptchaAssistHook(jobRequest, payload, runtime, options = {}) {
  if (typeof options.captchaHook === "function") {
    return options.captchaHook(jobRequest, payload, runtime);
  }

  const config = runtime?.captchaHook || {};
  if (!config.url) {
    return { ok: false, skipped: true, error: "Captcha assist hook is not configured." };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, skipped: false, error: "fetch is not available for captcha assist hook." };
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs || 15000) : null;
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers || {})
      },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {})
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        error: data?.error || data?.message || `Captcha assist hook returned ${response.status}`,
        response: data
      };
    }

    return {
      ok: true,
      skipped: false,
      response: data
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error?.message || "Captcha assist hook failed"
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function captureScreenshot(page, outputDir, name, screenshots, runLog) {
  const filePath = path.join(outputDir, `${name}.png`);
  await page.screenshot({
    path: filePath,
    fullPage: true,
    type: "png"
  });
  screenshots.push(filePath);
  appendRunLog(runLog, "screenshot_captured", { path: filePath, label: name });
  return filePath;
}

async function evaluatePageSnapshot(page, stepName) {
  return page.evaluate(({ stepName: currentStep }) => {
    const ctaSelector = "button, a, [role='button'], input[type='submit'], input[type='button']";
    const textFrom = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      if (!element || !(element instanceof Element)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const getContainerLabel = (element) => {
      const horizontalField = element.closest(".field.is-horizontal");
      const horizontalLabel = textFrom(
        horizontalField?.querySelector(".field-label .label, .field-label label, .field-label")?.textContent
      );
      if (horizontalLabel) {
        return horizontalLabel;
      }

      const fieldWrapper = element.closest(".field");
      const directLabel = textFrom(fieldWrapper?.querySelector(":scope > .label, :scope > label, .label, label")?.textContent);
      if (directLabel) {
        return directLabel;
      }

      const describedById = textFrom(element.getAttribute("aria-describedby"));
      const describedByText = describedById ? textFrom(document.getElementById(describedById)?.textContent) : "";
      if (describedByText && !/\d+\s*\/\s*\d+/.test(describedByText)) {
        return describedByText;
      }

      return "";
    };
    const collectTextHints = () =>
      Array.from(document.querySelectorAll("h1, h2, h3, label, legend, p, li"))
        .filter((element) => isVisible(element))
        .map((element) => textFrom(element.textContent))
        .filter(Boolean)
        .slice(0, 80);

    const labelMap = new Map();
    for (const label of Array.from(document.querySelectorAll("label"))) {
      const labelText = textFrom(label.textContent);
      if (!labelText) {
        continue;
      }
      const htmlFor = label.getAttribute("for");
      if (htmlFor) {
        labelMap.set(htmlFor, labelText);
      }
      const nestedInput = label.querySelector("input, textarea, select");
      if (nestedInput?.id) {
        labelMap.set(nestedInput.id, labelText);
      }
      if (nestedInput?.name) {
        labelMap.set(`name:${nestedInput.name}`, labelText);
      }
    }

    const fields = Array.from(document.querySelectorAll("input, textarea, select"))
      .map((element, domIndex) => {
        const tag = element.tagName.toLowerCase();
        const type = tag === "input" ? textFrom(element.getAttribute("type") || "text").toLowerCase() : tag;
        const id = textFrom(element.getAttribute("id"));
        const name = textFrom(element.getAttribute("name"));
        const placeholder = textFrom(element.getAttribute("placeholder"));
        const ariaLabel = textFrom(element.getAttribute("aria-label"));
        const role = textFrom(element.getAttribute("role")).toLowerCase() || null;
        const widget =
          role === "combobox" || /^react-select-\d+-input$/i.test(id)
            ? "combobox"
            : null;
        const hiddenName = textFrom(
          element
            .closest("[data-react-class]")
            ?.querySelector("input[type='hidden'][name]")?.getAttribute("name")
        );
        const nearestLabel =
          (id && labelMap.get(id)) ||
          (name && labelMap.get(`name:${name}`)) ||
          getContainerLabel(element) ||
          textFrom(element.closest("label")?.textContent) ||
          "";
        const accept = textFrom(element.getAttribute("accept"));
        const options =
          tag === "select"
            ? Array.from(element.querySelectorAll("option"))
                .map((option) => textFrom(option.textContent || option.value))
                .filter(Boolean)
                .slice(0, 20)
            : [];

        const rect = element.getBoundingClientRect();
        return {
          dom_index: domIndex,
          id: id || null,
          name: name || null,
          hidden_name: hiddenName || null,
          label: nearestLabel || ariaLabel || placeholder || `field_${domIndex + 1}`,
          tag,
          type,
          role,
          widget,
          required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
          placeholder: placeholder || null,
          accept: accept || null,
          multiple: element.hasAttribute("multiple") || Boolean(hiddenName && /\[\]$/.test(hiddenName)),
          max_length: (() => {
            const raw = Number(element.getAttribute("maxlength"));
            return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
          })(),
          options,
          autocomplete: textFrom(element.getAttribute("autocomplete")) || null,
          top: Number.isFinite(rect.top) ? Math.round(rect.top) : null
        };
      })
      .filter((field) => field && field.label && field.dom_index >= 0)
      .filter((field) => {
        const element = document.querySelectorAll("input, textarea, select")[field.dom_index];
        return isVisible(element);
      });

    const buttons = Array.from(document.querySelectorAll(ctaSelector))
      .map((element, domIndex) => {
        const rect = element.getBoundingClientRect();
        const enclosingForm = element.closest("form");
        const enclosingField = element.closest(".field, .control, .box, .card");
        const fieldDistances = fields
          .map((field) => {
            const fieldTop = Number(field?.top);
            return Number.isFinite(fieldTop) ? Math.abs(fieldTop - rect.top) : null;
          })
          .filter((value) => Number.isFinite(value));
        return {
          dom_index: domIndex,
          tag: element.tagName.toLowerCase(),
          text: textFrom(
            element.textContent ||
              element.getAttribute("value") ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title")
          ),
          href: textFrom(element.getAttribute("href")) || null,
          visible: isVisible(element),
          top: Number.isFinite(rect.top) ? Math.round(rect.top) : null,
          within_form: Boolean(enclosingForm),
          within_content: Boolean(enclosingField),
          aria_disabled: element.getAttribute("aria-disabled") === "true" || element.hasAttribute("disabled"),
          distance_to_fields: fieldDistances.length ? Math.min(...fieldDistances) : null
        };
      })
      .filter((item) => item.visible && item.text)
      .slice(0, 80);

    const pageText = textFrom(document.body?.innerText || "");
    const authHints = [];
    if (/\bsign in\b|\blog in\b|\bauth\b/i.test(pageText)) {
      authHints.push("login_text_detected");
    }
    if (/\bplease register to submit more than one product\b|\bregister to submit more than one product\b/i.test(pageText)) {
      authHints.push("register_required_text_detected");
    }
    if (fields.some((field) => field.type === "password")) {
      authHints.push("password_field_detected");
    }
    const socialAuthControls = Array.from(document.querySelectorAll("a, button, [role='button']"))
      .filter((element) => isVisible(element))
      .map((element) =>
        textFrom(
          [
            element.textContent,
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("href")
          ]
            .filter(Boolean)
            .join(" ")
        )
      )
      .filter(Boolean);
    if (
      socialAuthControls.some((text) =>
        /\b(continue|sign in|log in|login|signup|sign up)\b.*\b(google|linkedin|github|apple)\b/i.test(text)
      )
    ) {
      authHints.push("social_auth_option_detected");
    }

    const captchaHints = [];
    if (/\bcaptcha\b|\brecaptcha\b|\bhcaptcha\b/i.test(pageText)) {
      captchaHints.push("captcha_text_detected");
    }
    if (document.querySelector("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .h-captcha, .g-recaptcha")) {
      captchaHints.push("captcha_widget_detected");
    }

    const duplicateCheckHints = [];
    if (/\bfind your business\b|\bsearch for your business\b/i.test(pageText)) {
      duplicateCheckHints.push("search_for_existing_listing");
    }
    if (/\balready listed\b|\balready on\b|\bclaim this\b/i.test(pageText)) {
      duplicateCheckHints.push("claim_existing_listing");
    }
    if (/\bduplicate\b/i.test(pageText)) {
      duplicateCheckHints.push("duplicate_listing_warning");
    }

    return {
      step: currentStep,
      url: window.location.href,
      title: document.title || "",
      forms_count: document.querySelectorAll("form").length,
      field_count: fields.length,
      fields,
      buttons,
      text_hints: collectTextHints(),
      auth_hints: authHints,
      captcha_hints: captchaHints,
      duplicate_check_hints: duplicateCheckHints
    };
  }, { stepName });
}

function chooseCandidateButton(snapshot, patterns = CTA_TEXT_PATTERNS, options = {}) {
  const buttons = Array.isArray(snapshot?.buttons) ? snapshot.buttons : [];
  const scored = [];
  for (const button of buttons) {
    const text = sanitizeString(button?.text, 240);
    if (!text || text.length > 80) {
      continue;
    }
    if (!patterns.some((pattern) => pattern.test(text))) {
      continue;
    }
    if (options.requireContextual === true) {
      const contextual =
        button.within_form ||
        button.within_content ||
        button.tag === "button" ||
        button.tag === "input" ||
        (Number.isFinite(Number(button.distance_to_fields)) && Number(button.distance_to_fields) <= 220);
      if (!contextual) {
        continue;
      }
    }
    let score = 0;
    if (button.within_form) {
      score += 60;
    }
    if (button.within_content) {
      score += 20;
    }
    if (button.tag === "button") {
      score += 20;
    }
    if (!button.href) {
      score += 10;
    }
    if (button.aria_disabled) {
      score -= 80;
    }
    if (Number.isFinite(Number(button.top))) {
      score += Math.max(0, Math.min(40, Math.floor(Number(button.top) / 25)));
      if (Number(button.top) < 120) {
        score -= 40;
      }
    }
    if (Number.isFinite(Number(button.distance_to_fields))) {
      const distance = Number(button.distance_to_fields);
      score += Math.max(0, 80 - Math.floor(distance / 5));
      if (distance > 500) {
        score -= 60;
      }
    }
    scored.push({ button, score });
  }
  scored.sort((left, right) => right.score - left.score);
  if (!scored.length || scored[0].score < 0) {
    return null;
  }
  return scored[0].button || null;
}

function chooseFinalSubmitButton(snapshot) {
  const patternMatch = chooseCandidateButton(snapshot, FINAL_SUBMIT_CTA_PATTERNS, {
    requireContextual: true
  });
  if (patternMatch) {
    return patternMatch;
  }

  const buttons = Array.isArray(snapshot?.buttons) ? snapshot.buttons : [];
  const fallbackCandidates = buttons.filter((button) => {
    const text = sanitizeString(button?.text, 240);
    if (!text) {
      return false;
    }
    if (PROGRESS_CTA_PATTERNS.some((pattern) => pattern.test(text))) {
      return false;
    }
    const contextual =
      button.within_form ||
      button.within_content ||
      button.tag === "button" ||
      button.tag === "input" ||
      (Number.isFinite(Number(button.distance_to_fields)) && Number(button.distance_to_fields) <= 220);
    if (!contextual) {
      return false;
    }
    return (
      button.tag === "button" ||
      button.tag === "input" ||
      sanitizeString(button?.type, 32).toLowerCase() === "submit"
    );
  });

  if (!fallbackCandidates.length) {
    return null;
  }

  return chooseCandidateButton(
    {
      buttons: fallbackCandidates
    },
    [/.+/],
    {
      requireContextual: true
    }
  );
}

async function maybeAdvanceSubmissionFlow(page, snapshot, outputDir, screenshots, runLog, stepIndex = 1) {
  const candidate = chooseCandidateButton(snapshot, PROGRESS_CTA_PATTERNS);
  if (!candidate) {
    return { clicked: false, snapshot };
  }

  const locator = page.locator(CTA_SELECTOR).nth(candidate.dom_index);
  try {
    await locator.click({ timeout: 5000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await captureScreenshot(page, outputDir, `04-progress-step-${stepIndex}`, screenshots, runLog);
    appendRunLog(runLog, "submit_progress_advanced", {
      text: candidate.text,
      href: candidate.href || null,
      step_index: stepIndex
    });
    return {
      clicked: true,
      candidate,
      snapshot: await evaluatePageSnapshot(page, `post_submit_progress_${stepIndex}`)
    };
  } catch (error) {
    appendRunLog(runLog, "submit_progress_advance_failed", {
      text: candidate.text,
      message: error?.message || "Progress CTA click failed",
      step_index: stepIndex
    });
    return { clicked: false, snapshot };
  }
}

async function fillSnapshotFields({
  page,
  snapshot,
  fieldSuggestions,
  availableAssets,
  assetDir,
  runLog,
  options,
  skippedUploads,
  failedFields,
  attemptedFieldKeys,
  attemptedUploadKeys
}) {
  const visibleFields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const fieldLocator = page.locator("input, textarea, select");
  let filledFieldCount = 0;
  let uploadedAssetCount = 0;

  for (const field of visibleFields) {
    const fieldKey = [
      sanitizeString(field?.label, 240),
      sanitizeString(field?.name, 240),
      sanitizeString(field?.id, 240),
      Number.isFinite(Number(field?.dom_index)) ? Number(field.dom_index) : 0
    ].join("|");
    const locator = fieldLocator.nth(Number.isFinite(Number(field?.dom_index)) ? Number(field.dom_index) : 0);
    if (sanitizeString(field?.type, 64).toLowerCase() === "file") {
      if (attemptedUploadKeys?.has(fieldKey)) {
        continue;
      }
      const assetType = inferAssetType(field) || "file_upload";
      const availableRefs = getAssetRefsForType(assetType, availableAssets);
      if (!availableRefs.length) {
        skippedUploads.push({
          field_label: field.label || field.name || "file_upload",
          asset_type: assetType,
          reason: "No prepared asset was available."
        });
        attemptedUploadKeys?.add(fieldKey);
        continue;
      }

      const localPaths = [];
      for (const assetRef of availableRefs.slice(0, field.multiple ? 5 : 1)) {
        const materialized = await materializeAssetRef(assetRef, assetType, assetDir, runLog, options);
        if (materialized.ok && materialized.path) {
          localPaths.push(materialized.path);
        } else {
          skippedUploads.push({
            field_label: field.label || field.name || "file_upload",
            asset_type: assetType,
            reason: materialized.error || "Asset could not be materialized."
          });
        }
      }

      attemptedUploadKeys?.add(fieldKey);
      if (!localPaths.length) {
        continue;
      }

      try {
        await locator.setInputFiles(field.multiple ? localPaths : localPaths[0]);
        uploadedAssetCount += 1;
        appendRunLog(runLog, "asset_uploaded", {
          field: field.label || field.name || "file_upload",
          asset_type: assetType,
          count: localPaths.length
        });
      } catch (error) {
        skippedUploads.push({
          field_label: field.label || field.name || "file_upload",
          asset_type: assetType,
          reason: error?.message || "Upload failed."
        });
        appendRunLog(runLog, "asset_upload_failed", {
          field: field.label || field.name || "file_upload",
          asset_type: assetType,
          message: error?.message || "Upload failed"
        });
      }
      continue;
    }

    if (attemptedFieldKeys?.has(fieldKey)) {
      continue;
    }
    const suggestion = findSuggestionForField(field, fieldSuggestions);
    const suggestedValue = sanitizeString(suggestion?.suggested_value, 4000);
    if (!suggestedValue) {
      continue;
    }

    const filled = await fillVisibleField(page, locator, field, suggestedValue, runLog);
    attemptedFieldKeys?.add(fieldKey);
    if (filled.ok) {
      filledFieldCount += 1;
    } else if (!filled.skipped) {
      failedFields.push({
        field_label: field.label || field.name || "field",
        reason: filled.error || "Field fill failed."
      });
    }
  }

  return {
    filledFieldCount,
    uploadedAssetCount
  };
}

async function maybeAdvanceToReconFlow(page, initialSnapshot, runLog) {
  if (!initialSnapshot || initialSnapshot.field_count > 0 || initialSnapshot.forms_count > 0) {
    return { clicked: false, snapshot: initialSnapshot };
  }

  const candidate = chooseCandidateButton(initialSnapshot);
  if (!candidate) {
    return { clicked: false, snapshot: initialSnapshot };
  }

  const selector = CTA_SELECTOR;
  const locator = page.locator(selector).nth(candidate.dom_index);
  try {
    await locator.click({ timeout: 5000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
    appendRunLog(runLog, "cta_followed", {
      text: candidate.text,
      href: candidate.href || null
    });
    return {
      clicked: true,
      snapshot: await evaluatePageSnapshot(page, "post_cta")
    };
  } catch (error) {
    appendRunLog(runLog, "cta_follow_failed", {
      text: candidate.text,
      message: error?.message || "CTA click failed"
    });
    return { clicked: false, snapshot: initialSnapshot };
  }
}

async function attemptAutomatedAuth({
  page,
  jobRequest,
  brand,
  runtime,
  siteRow,
  siteProfile,
  currentUrl,
  returnToUrl,
  outputDir,
  screenshots,
  runLog,
  checkpointPrefix = "auth",
  snapshotLabel = "post_auth"
}) {
  const siteId = sanitizeString(siteRow?.site_id || jobRequest?.site_id, 128).toLowerCase();
  const authConfig = resolveSubmissionAuthConfig(jobRequest, brand, siteId, siteProfile);
  if (!authConfig.shouldAttempt) {
    return {
      attempted: false,
      success: false,
      reason: "auth_not_configured",
      snapshot: null
    };
  }

  const loginUrl =
    sanitizeOptionalString(authConfig.credentials?.login_url, 4096) ||
    sanitizeOptionalString(currentUrl, 4096) ||
    sanitizeOptionalString(returnToUrl, 4096) ||
    null;
  const authRunRequest = {
    run_id: `${sanitizeString(jobRequest?.job_id, 96) || "submission"}_auth`,
    target_url: loginUrl,
    scope_mode: "feature_targeted",
    scenario_list: ["Authenticate to the site and return to the submission flow."],
    credentials: authConfig.credentials
      ? {
          ...authConfig.credentials,
          login_url: loginUrl,
          otp_mode: sanitizeString(authConfig.credentials?.otp_mode || "none", 64).toLowerCase() || "none"
        }
      : null,
    metadata: {
      ...authConfig.metadata,
      queue_origin: sanitizeOptionalString(jobRequest?.metadata?.queue_origin, 64) || "directory_submit_auth"
    }
  };

  try {
    appendRunLog(runLog, "submission_auth_started", {
      site_id: siteId,
      login_url: loginUrl,
      auto_create_account: parseBoolean(authRunRequest.metadata.auto_create_account, false) === true
    });
    const authResult = await performCredentialedLogin(page, authRunRequest, {
      runLog,
      captchaPostWaitMs: runtime?.twoCaptcha?.postInjectWaitMs || 4000,
      resolveCaptcha: async (authPage) => attemptTwoCaptchaSolve(authPage, runtime, runLog),
      hasCaptchaChallenge: async (authPage) => Boolean(await detectSupportedCaptchaChallenge(authPage)),
      captureCheckpoint: async (label, authPage) => {
        if (!outputDir || !Array.isArray(screenshots)) {
          return;
        }
        await captureScreenshot(
          authPage,
          outputDir,
          `${toSafeSlug(checkpointPrefix, "auth")}-${toSafeSlug(label, "checkpoint")}`,
          screenshots,
          runLog
        );
      }
    });

    if (!authResult?.attempted || authResult?.success !== true) {
      appendRunLog(runLog, "submission_auth_skipped", {
        site_id: siteId,
        reason: sanitizeOptionalString(authResult?.reason, 120) || "auth_not_attempted"
      });
      return {
        attempted: Boolean(authResult?.attempted),
        success: false,
        reason: sanitizeOptionalString(authResult?.reason, 120) || "auth_not_attempted",
        snapshot: null
      };
    }

    await page.waitForTimeout(1200);
    await dismissBlockingOverlays(page, runLog);
    const safeReturnUrl = sanitizeOptionalString(returnToUrl, 4096) || null;
    if (safeReturnUrl && sanitizeOptionalString(page.url(), 4096) !== safeReturnUrl) {
      await page.goto(safeReturnUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      await page.waitForTimeout(1200);
      await dismissBlockingOverlays(page, runLog);
    }

    let snapshot = await evaluatePageSnapshot(page, snapshotLabel);
    const advanced = await maybeAdvanceToReconFlow(page, snapshot, runLog);
    snapshot = advanced.snapshot;
    if (advanced.clicked && outputDir && Array.isArray(screenshots)) {
      await captureScreenshot(
        page,
        outputDir,
        `${toSafeSlug(checkpointPrefix, "auth")}-post-cta`,
        screenshots,
        runLog
      );
    }
    appendRunLog(runLog, "submission_auth_completed", {
      site_id: siteId,
      final_url: sanitizeOptionalString(page.url(), 4096) || null
    });
    return {
      attempted: true,
      success: true,
      authResult,
      snapshot
    };
  } catch (error) {
    appendRunLog(runLog, "submission_auth_failed", {
      site_id: siteId,
      message: error?.message || "Submission auth failed"
    });
    if (outputDir && Array.isArray(screenshots)) {
      await captureScreenshot(
        page,
        outputDir,
        `${toSafeSlug(checkpointPrefix, "auth")}-failed`,
        screenshots,
        runLog
      ).catch(() => {});
    }
    return {
      attempted: true,
      success: false,
      reason: error?.message || "Submission auth failed",
      snapshot: null
    };
  }
}

function inferAssetType(field) {
  const label = `${field.label || ""} ${field.name || ""} ${field.placeholder || ""}`.toLowerCase();
  if (field.type !== "file") return "";
  if (/\blogo\b/.test(label)) return "logo";
  if (/\bscreenshot\b|\bgallery\b/.test(label)) return "screenshots";
  if (/\bcover\b|\bbanner\b|\bhero\b/.test(label)) return "cover_image";
  if (/\bvideo\b|\byoutube\b|\bdemo\b/.test(label)) return "video";
  if (/\bicon\b/.test(label)) return "icon";
  return "file_upload";
}

function buildAssetRequirements(fields) {
  const assets = [];
  const seen = new Set();

  for (const field of Array.isArray(fields) ? fields : []) {
    const assetType = inferAssetType(field);
    if (!assetType) {
      continue;
    }

    const key = `${assetType}:${field.label || field.name || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    assets.push({
      asset_type: assetType,
      label: field.label || null,
      field_name: field.name || null,
      accept: field.accept || null,
      required: field.required === true,
      multiple: field.multiple === true,
      note:
        field.type === "file"
          ? `Upload field${field.accept ? ` accepts ${field.accept}` : ""}.`
          : `Text field of type ${field.type || "text"}.`
    });
  }

  return assets;
}

function buildGates(snapshot) {
  const gates = [];
  const authHints = Array.isArray(snapshot?.auth_hints) ? snapshot.auth_hints : [];
  const captchaHints = Array.isArray(snapshot?.captcha_hints) ? snapshot.captcha_hints : [];

  for (const hint of authHints) {
    gates.push({
      type: "auth",
      note: hint.replaceAll("_", " ")
    });
  }

  for (const hint of captchaHints) {
    gates.push({
      type: "captcha",
      note: hint.replaceAll("_", " ")
    });
  }

  return gates;
}

function buildDuplicateCheckFlow(snapshot) {
  const hints = Array.isArray(snapshot?.duplicate_check_hints) ? snapshot.duplicate_check_hints : [];
  if (!hints.length) {
    return [];
  }

  const steps = [];
  if (hints.includes("search_for_existing_listing")) {
    steps.push("Search for an existing listing before creating a new profile.");
  }
  if (hints.includes("claim_existing_listing")) {
    steps.push("Check whether an existing listing should be claimed instead of creating a new one.");
  }
  if (hints.includes("duplicate_listing_warning")) {
    steps.push("Watch for duplicate listing warnings during submission.");
  }
  return steps;
}

function recommendSubmissionPolicy(snapshot, postCtaSnapshot) {
  const snapshots = [snapshot, postCtaSnapshot].filter(Boolean);
  const hasCaptcha = snapshots.some((item) => Array.isArray(item.captcha_hints) && item.captcha_hints.length > 0);
  const hasAuth = snapshots.some((item) => Array.isArray(item.auth_hints) && item.auth_hints.length > 0);
  if (hasCaptcha) {
    return "assist";
  }
  if (hasAuth) {
    return "assist";
  }
  return "auto";
}

function buildNextSteps(profile) {
  const steps = [
    "Review the discovered fields and asset requirements before generating brand assets."
  ];

  if (Array.isArray(profile.gates) && profile.gates.some((gate) => gate.type === "auth")) {
    steps.push("Prepare an account or login strategy before automating submission.");
  }
  if (Array.isArray(profile.gates) && profile.gates.some((gate) => gate.type === "captcha")) {
    steps.push("Plan for assisted submission because CAPTCHA is present.");
  }
  if (Array.isArray(profile.duplicate_check_flow) && profile.duplicate_check_flow.length > 0) {
    steps.push("Run duplicate-listing checks before creating a new entry.");
  }

  return steps;
}

async function runDirectoryRecon(jobRequest, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const runLog = [];
  const jobSlug = `${toSafeSlug(jobRequest.site_id, "site")}-${toSafeSlug(jobRequest.job_id, "job")}-${timestampId()}`;
  const outputDir = path.resolve(options.outputRoot || "output/submissions", jobSlug);
  const screenshots = [];
  mkdirp(outputDir);
  let runtime = buildSelfHostedRuntimeConfig(jobRequest, options);

  const artifacts = {
    output_dir: outputDir,
    screenshots: [],
    video_path: null,
    final_url: null,
    runtime: {
      headless: runtime.headless,
      browser_channel: runtime.browserChannel || null,
      locale: runtime.locale || null,
      timezone_id: runtime.timezoneId || null,
      proxy_enabled: Boolean(runtime.proxy?.server),
      stealth_mode: runtime.stealthMode === true,
      block_ads: runtime.blockAds === true,
      record_video: runtime.recordVideo !== false,
      persistent_profile_enabled: Boolean(resolvePersistentProfileDir(runtime, jobRequest))
    }
  };
  Object.defineProperty(runLog, "__persist", {
    value: () => {
      const runLogPath = writeRunLogFile(outputDir, runLog);
      if (runLogPath) {
        artifacts.run_log_path = runLogPath;
      }
    },
    enumerable: false
  });

  let browser = null;
  let context = null;
  let page = null;
  let videoHandle = null;
  let brand = {
    profile: {}
  };

  const reportProgress = (phase, percent, message) => {
    if (onProgress) {
      onProgress({
        phase,
        percent,
        message,
        updated_at: new Date().toISOString()
      });
    }
  };

  try {
    appendRunLog(runLog, "recon_started", {
      job_id: jobRequest.job_id,
      site_id: jobRequest.site_id,
      submit_url: jobRequest.submit_url
    });
    const brandProfileId =
      sanitizeOptionalString(jobRequest?.brand_profile_id, 128) ||
      sanitizeOptionalString(jobRequest?.metadata?.brand_profile_id, 128) ||
      null;
    if (brandProfileId && typeof options.loadBrandProfile === "function") {
      const brandLoaded = await options.loadBrandProfile(brandProfileId);
      if (brandLoaded?.ok && brandLoaded.row) {
        brand = extractBrandProfileData(brandLoaded.row);
        brand.profile = brandLoaded.row.profile || {};
      }
    }
    runtime = await resolveSelfHostedRuntimeConfig(jobRequest, brand, options);
    artifacts.runtime.proxy_enabled = Boolean(runtime.proxy?.server);
    if (runtime.proxySelection) {
      artifacts.runtime.proxy_selection = {
        provider: runtime.proxySelection.provider || null,
        status: runtime.proxySelection.status || null,
        matched: runtime.proxySelection.matched !== false,
        match_quality: runtime.proxySelection.match_quality || null,
        attempt_index: Number(runtime.proxySelection.attempt_index) || 0,
        available_candidate_count: Number(runtime.proxySelection.available_candidate_count) || 0,
        has_more_candidates: runtime.proxySelection.has_more_candidates === true,
        target: runtime.proxySelection.target || null,
        selected: runtime.proxySelection.selected || null,
        note: runtime.proxySelection.note || null,
        warnings: Array.isArray(runtime.proxySelection.warnings) ? runtime.proxySelection.warnings : []
      };
      appendRunLog(runLog, "proxy_selection_resolved", {
        provider: runtime.proxySelection.provider || null,
        status: runtime.proxySelection.status || null,
        matched: runtime.proxySelection.matched !== false,
        match_quality: runtime.proxySelection.match_quality || null,
        note: runtime.proxySelection.note || null
      });
    }
    reportProgress("launching_browser", 5, "Launching browser for recon.");

    const launched = await launchSubmissionBrowserContext(runtime, outputDir, jobRequest);
    browser = launched.browser;
    context = launched.context;
    await applyStealthMode(context, runtime);
    page = launched.page;
    videoHandle = launched.videoHandle;
    if (launched.persistentProfileDir) {
      artifacts.runtime.persistent_profile_dir = launched.persistentProfileDir;
    }
    await applyNetworkControls(page, runtime, runLog);

    reportProgress("navigating", 15, "Opening submission flow.");
    await page.goto(jobRequest.submit_url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(1200);
    await dismissBlockingOverlays(page, runLog);

    const initialScreenshot = await captureScreenshot(page, outputDir, "01-landing", screenshots, runLog);
    artifacts.screenshots = screenshots.slice();
    appendRunLog(runLog, "landing_loaded", { screenshot: initialScreenshot });

    let landingSnapshot = await evaluatePageSnapshot(page, "landing");
    let authBlockedRecon = false;
    if (Array.isArray(landingSnapshot?.auth_hints) && landingSnapshot.auth_hints.length > 0) {
      const authAttempt = await attemptAutomatedAuth({
        page,
        jobRequest,
        brand,
        runtime,
        siteRow: {
          site_id: jobRequest.site_id,
          site_name: jobRequest.site_name || jobRequest.site_id
        },
        siteProfile: {},
        currentUrl: sanitizeOptionalString(page.url(), 4096) || jobRequest.submit_url,
        returnToUrl: jobRequest.submit_url,
        outputDir,
        screenshots,
        runLog,
        checkpointPrefix: "recon-auth",
        snapshotLabel: "recon_post_auth"
      });
      if (authAttempt.success && authAttempt.snapshot) {
        landingSnapshot = authAttempt.snapshot;
        artifacts.screenshots = screenshots.slice();
      } else if (authAttempt.attempted) {
        authBlockedRecon = true;
        landingSnapshot = await evaluatePageSnapshot(page, "landing_auth_blocked");
      }
    }
    reportProgress("inspecting", 40, "Inspecting landing page fields and gates.");

    const advanced = authBlockedRecon
      ? {
          clicked: false,
          snapshot: landingSnapshot
        }
      : await maybeAdvanceToReconFlow(page, landingSnapshot, runLog);
    let workingSnapshot = advanced.snapshot;
    if (advanced.clicked) {
      await dismissBlockingOverlays(page, runLog);
      await captureScreenshot(page, outputDir, "02-post-cta", screenshots, runLog);
      artifacts.screenshots = screenshots.slice();
      reportProgress("inspecting", 60, "Inspecting submission form after CTA.");
      workingSnapshot = advanced.snapshot;
    }
    if (!authBlockedRecon && Array.isArray(workingSnapshot?.auth_hints) && workingSnapshot.auth_hints.length > 0) {
      const authAttempt = await attemptAutomatedAuth({
        page,
        jobRequest,
        brand,
        runtime,
        siteRow: {
          site_id: jobRequest.site_id,
          site_name: jobRequest.site_name || jobRequest.site_id
        },
        siteProfile: {},
        currentUrl: sanitizeOptionalString(page.url(), 4096) || jobRequest.submit_url,
        returnToUrl: jobRequest.submit_url,
        outputDir,
        screenshots,
        runLog,
        checkpointPrefix: "recon-auth-after-cta",
        snapshotLabel: "recon_post_auth_cta"
      });
      if (authAttempt.success && authAttempt.snapshot) {
        workingSnapshot = authAttempt.snapshot;
        artifacts.screenshots = screenshots.slice();
      }
    }

    artifacts.final_url = sanitizeString(workingSnapshot?.url, 4096) || sanitizeString(page.url(), 4096) || null;

    const aggregateFields = Array.from(
      new Map(
        [...(Array.isArray(landingSnapshot.fields) ? landingSnapshot.fields : []), ...(Array.isArray(workingSnapshot.fields) ? workingSnapshot.fields : [])]
          .map((field) => {
            const key = `${field.name || ""}|${field.label || ""}|${field.type || ""}`;
            return [key, field];
          })
      ).values()
    );

    const siteProfile = {
      site_id: jobRequest.site_id,
      site_name: jobRequest.site_name || jobRequest.site_id,
      track: jobRequest.track || "custom",
      submit_url: jobRequest.submit_url,
      final_url: artifacts.final_url,
      discovered_at: new Date().toISOString(),
      pages: [landingSnapshot, advanced.clicked ? workingSnapshot : null].filter(Boolean),
      fields: aggregateFields,
      asset_requirements: buildAssetRequirements(aggregateFields),
      gates: [
        ...buildGates(landingSnapshot),
        ...buildGates(advanced.clicked ? workingSnapshot : null)
      ],
      duplicate_check_flow: buildDuplicateCheckFlow(advanced.clicked ? workingSnapshot : landingSnapshot),
      success_signals: [
        "Pending approval confirmation screen",
        "Live listing URL",
        "Account dashboard entry for the listing"
      ],
      recommended_submission_policy: recommendSubmissionPolicy(landingSnapshot, advanced.clicked ? workingSnapshot : null),
      recon_notes: [
        `Landing page title: ${landingSnapshot.title || "n/a"}`,
        `Final page title: ${workingSnapshot?.title || landingSnapshot.title || "n/a"}`,
        ...(authBlockedRecon ? ["Recon stopped on the auth surface after automated account creation/login did not resolve."] : [])
      ]
    };

    const nextSteps = buildNextSteps(siteProfile);
    reportProgress("finalizing", 90, "Persisting recon findings and site profile.");

    const result = {
      status: "completed",
      summary: {
        note: `Recon captured ${siteProfile.fields.length} field(s), ${siteProfile.asset_requirements.length} asset requirement(s), and ${siteProfile.gates.length} gate hint(s).`
      },
      site_profile: siteProfile,
      evidence: {
        screenshots: screenshots.slice(),
        video: null
      },
      next_steps: nextSteps
    };
    const runLogPath = writeRunLogFile(outputDir, runLog);
    if (runLogPath) {
      artifacts.run_log_path = runLogPath;
    }

    return {
      ok: true,
      result,
      artifacts,
      runLog
    };
  } catch (error) {
    appendRunLog(runLog, "recon_failed", {
      message: error?.message || "Directory recon failed"
    });
    return {
      ok: false,
      result: {
        status: "failed",
        summary: {
          note: error?.message || "Directory recon failed"
        },
        evidence: {
          screenshots: screenshots.slice(),
          video: null
        },
        next_steps: ["Review the failure evidence and retry recon with a more specific submit URL."]
      },
      artifacts,
      runLog,
      error
    };
  } finally {
    const runLogPath = writeRunLogFile(outputDir, runLog);
    if (runLogPath) {
      artifacts.run_log_path = runLogPath;
    }
    if (page) {
      try {
        const videoPath =
          videoHandle && typeof videoHandle.path === "function"
            ? sanitizeOptionalString(await videoHandle.path(), 4096)
            : null;
        if (videoPath) {
          artifacts.video_path = videoPath;
        }
      } catch {
        // Ignore video path errors.
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore teardown errors.
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore teardown errors.
      }
    }
  }
}

function truncateText(value, maxLength) {
  const text = sanitizeString(value, 8000);
  if (!text) {
    return "";
  }
  if (!Number.isFinite(Number(maxLength)) || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sanitizeStringList(values, maxItems = 20, maxLength = 180) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => sanitizeString(value, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function extractBrandProfileData(brandProfileRow) {
  const profile = brandProfileRow?.profile && typeof brandProfileRow.profile === "object" ? brandProfileRow.profile : {};
  const location = profile.location && typeof profile.location === "object" ? profile.location : {};
  const contact = profile.contact && typeof profile.contact === "object" ? profile.contact : {};
  const links = profile.links && typeof profile.links === "object" ? profile.links : {};
  const assets = profile.assets && typeof profile.assets === "object" ? profile.assets : {};
  const services = sanitizeStringList(profile.services || profile.offerings || [], 50, 180);
  const tags = sanitizeStringList(profile.tags || profile.categories || [], 20, 120);
  const summary =
    sanitizeString(profile.summary, 1000) ||
    sanitizeString(profile.tagline, 1000) ||
    sanitizeString(profile.one_liner, 1000) ||
    "";
  const description =
    sanitizeString(profile.description, 4000) ||
    sanitizeString(profile.about, 4000) ||
    summary;
  const identity = normalizeSubmissionIdentityProfile(profile.identity);

  return {
    brand_profile_id: sanitizeString(brandProfileRow?.brand_profile_id, 128),
    brand_key: sanitizeOptionalString(brandProfileRow?.brand_key, 256) || null,
    track: sanitizeString(brandProfileRow?.track, 64) || "custom",
    display_name: sanitizeString(brandProfileRow?.display_name, 180),
    legal_name: sanitizeOptionalString(brandProfileRow?.legal_name, 240) || null,
    website_url: sanitizeOptionalString(brandProfileRow?.website_url, 4096) || null,
    summary,
    description,
    services,
    tags,
    competitors: sanitizeStringList(
      profile.competitors || profile.competitor_names || profile.alternatives || [],
      20,
      180
    ),
    location: {
      address_line_1: sanitizeOptionalString(location.address_line_1 || location.address || profile.address, 320) || null,
      city: sanitizeOptionalString(location.city, 120) || null,
      state: sanitizeOptionalString(location.state, 120) || null,
      postal_code: sanitizeOptionalString(location.postal_code || location.zip, 64) || null,
      country: sanitizeOptionalString(location.country, 120) || null,
      service_areas: sanitizeStringList(location.service_areas || profile.service_areas || [], 30, 120),
      hours: profile.hours && typeof profile.hours === "object" ? profile.hours : {}
    },
    contact: {
      email:
        sanitizeOptionalString(contact.email || profile.email || profile.support_email || links.email, 320) ||
        sanitizeOptionalString(identity.mailbox?.email, 320) ||
        null,
      phone:
        sanitizeOptionalString(contact.phone || profile.phone || location.phone, 120) ||
        null
    },
    links: {
      pricing_url:
        sanitizeOptionalString(links.pricing_url || profile.pricing_url, 4096) ||
        null,
      demo_url:
        sanitizeOptionalString(links.demo_url || profile.demo_url || profile.video_url, 4096) ||
        null,
      linkedin_url: sanitizeOptionalString(links.linkedin_url, 4096) || null,
      x_url: sanitizeOptionalString(links.x_url || links.twitter_url, 4096) || null
    },
    ...(hasSubmissionIdentity(identity) ? { identity } : {}),
    assets
  };
}

function buildCopyPack(brand) {
  const displayName = brand.display_name || brand.legal_name || "";
  const summary = brand.summary || `${displayName} online presence`;
  const description =
    brand.description ||
    [summary, brand.services.length ? `Key services: ${brand.services.join(", ")}.` : ""]
      .filter(Boolean)
      .join(" ");
  const locationLabel = [brand.location.city, brand.location.state].filter(Boolean).join(", ");

  return {
    display_name: displayName,
    one_liner_60: truncateText(summary || displayName, 60),
    blurb_160: truncateText(summary || description, 160),
    blurb_280: truncateText(description, 280),
    about_500: truncateText(description, 500),
    long_description_1000: truncateText(description, 1000),
    categories: brand.tags.slice(0, 8),
    services: brand.services.slice(0, 12),
    location_blurb: locationLabel
      ? truncateText(`${displayName} serves ${locationLabel}.`, 160)
      : ""
  };
}

function buildFactualPack(brand) {
  return {
    legal_name: brand.legal_name || "",
    website_url: brand.website_url || "",
    email: brand.contact.email || "",
    linkedin_url: brand.links.linkedin_url || "",
    phone: brand.contact.phone || "",
    address_line_1: brand.location.address_line_1 || "",
    city: brand.location.city || "",
    state: brand.location.state || "",
    postal_code: brand.location.postal_code || "",
    country: brand.location.country || "",
    service_areas: brand.location.service_areas || [],
    competitors: brand.competitors || [],
    hours: brand.location.hours || {}
  };
}

function collectAvailableAssets(brand) {
  const assets = brand.assets && typeof brand.assets === "object" ? brand.assets : {};
  const asList = (value) =>
    Array.from(
      new Set(
        (Array.isArray(value) ? value : value ? [value] : [])
          .map((item) => normalizeAssetRef(item))
          .filter(Boolean)
      )
    ).slice(0, 20);

  return {
    logo: asList(assets.logo || assets.logo_url || assets.logo_square || assets.logo_square_url),
    icon: asList(assets.icon || assets.icon_url || assets.favicon || assets.favicon_url),
    cover_image: asList(
      assets.cover_image ||
        assets.cover_image_url ||
        assets.banner ||
        assets.banner_url ||
        assets.og_image ||
        assets.og_image_url
    ),
    banner: asList(assets.banner || assets.banner_url),
    og_image: asList(assets.og_image || assets.og_image_url),
    social_card: asList(assets.social_card || assets.social_card_url || assets.social_cards),
    screenshots: asList(assets.screenshots),
    video: asList(assets.video || assets.video_url || assets.demo_video || assets.demo_video_url),
    team_photos: asList(assets.team_photos || assets.founder_headshots || assets.headshots),
    office_photos: asList(assets.office_photos || assets.photos)
  };
}

function getAssetCandidatesForType(assetType) {
  return ASSET_BUCKET_ALIASES[assetType] || [assetType];
}

function resolveAssetStatus(assetType, availableAssets) {
  const candidates = getAssetCandidatesForType(assetType);
  if (!candidates.length) {
    return "ready";
  }
  return candidates.some((candidate) => Array.isArray(availableAssets[candidate]) && availableAssets[candidate].length)
    ? "ready"
    : "needs_input";
}

function normalizeAssetRef(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return sanitizeString(value, 4096);
  }
  if (typeof value === "object") {
    return (
      sanitizeOptionalString(value.local_path || value.path || value.url || value.href || value.src, 4096) || ""
    );
  }
  return sanitizeString(value, 4096);
}

function normalizeAssetMap(value) {
  const source = isPlainObject(value) ? value : {};
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = sanitizeString(rawKey, 120);
    if (!key) {
      continue;
    }
    const refs = Array.from(
      new Set(
        (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [])
          .map(normalizeAssetRef)
          .filter(Boolean)
      )
    ).slice(0, 40);
    normalized[key] = refs;
  }
  return normalized;
}

function mergeAssetMaps(baseMap, nextMap) {
  const base = normalizeAssetMap(baseMap);
  const next = normalizeAssetMap(nextMap);
  const merged = { ...base };

  for (const [key, refs] of Object.entries(next)) {
    merged[key] = Array.from(new Set([...(Array.isArray(base[key]) ? base[key] : []), ...refs])).slice(0, 40);
  }

  return merged;
}

function extensionFromContentType(contentType) {
  const safeType = sanitizeString(contentType, 120).toLowerCase();
  if (!safeType) {
    return "";
  }
  if (safeType.includes("image/png")) return ".png";
  if (safeType.includes("image/jpeg")) return ".jpg";
  if (safeType.includes("image/webp")) return ".webp";
  if (safeType.includes("image/gif")) return ".gif";
  if (safeType.includes("image/svg+xml")) return ".svg";
  if (safeType.includes("video/mp4")) return ".mp4";
  if (safeType.includes("video/webm")) return ".webm";
  return "";
}

function extensionFromAssetRef(assetRef) {
  const safeRef = normalizeAssetRef(assetRef);
  if (!safeRef) {
    return "";
  }
  try {
    const url = new URL(safeRef);
    const pathname = sanitizeString(url.pathname, 4096);
    const ext = path.extname(pathname);
    return sanitizeString(ext, 16);
  } catch {
    const ext = path.extname(safeRef);
    return sanitizeString(ext, 16);
  }
}

async function materializeGeneratedAssetMap(assetMap, outputDir, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { asset_map: {}, saved_assets: [] };
  }

  const normalized = normalizeAssetMap(assetMap);
  const materialized = {};
  const savedAssets = [];
  const generatedDir = path.join(outputDir, "generated-assets");
  mkdirp(generatedDir);

  for (const [bucket, refs] of Object.entries(normalized)) {
    let bucketIndex = 0;
    for (const ref of refs) {
      const safeRef = normalizeAssetRef(ref);
      if (!/^https?:\/\//i.test(safeRef)) {
        continue;
      }
      try {
        const response = await fetchImpl(safeRef);
        if (!response.ok) {
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const ext =
          extensionFromContentType(response.headers?.get?.("content-type")) ||
          extensionFromAssetRef(safeRef) ||
          ".bin";
        const fileName = `${toSafeSlug(bucket, "asset")}-${String(bucketIndex + 1).padStart(2, "0")}${ext}`;
        const filePath = path.join(generatedDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
        if (!Array.isArray(materialized[bucket])) {
          materialized[bucket] = [];
        }
        materialized[bucket].push(filePath);
        savedAssets.push({
          bucket,
          source_url: safeRef,
          local_path: filePath
        });
        bucketIndex += 1;
      } catch {
        // Ignore per-asset materialization failures.
      }
    }
  }

  return {
    asset_map: materialized,
    saved_assets: savedAssets
  };
}

function mergeTextRecord(base, next, maxLength = 4000) {
  const merged = isPlainObject(base) ? { ...base } : {};
  if (!isPlainObject(next)) {
    return merged;
  }

  for (const [rawKey, rawValue] of Object.entries(next)) {
    const key = sanitizeString(rawKey, 128);
    if (!key) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      merged[key] = sanitizeStringList(rawValue, 40, Math.min(1000, maxLength));
      continue;
    }
    const value = sanitizeString(rawValue, maxLength);
    if (value) {
      merged[key] = value;
    }
  }

  return merged;
}

function countAssetRefs(assetMap) {
  return Object.values(normalizeAssetMap(assetMap)).reduce(
    (sum, refs) => sum + (Array.isArray(refs) ? refs.length : 0),
    0
  );
}

function buildAssetGenerationConfig(jobRequest, options = {}) {
  const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
  const hookUrl =
    sanitizeOptionalString(
      metadata.asset_generation_hook_url ||
        metadata.assetGeneratorUrl ||
        options.assetGenerationHookUrl ||
        process.env.SUBMISSION_ASSET_GENERATOR_URL,
      4096
    ) || null;
  const timeoutMs = Math.max(
    1000,
    Math.min(
      120000,
      Number(
        metadata.asset_generation_timeout_ms ||
          metadata.assetGenerationTimeoutMs ||
          options.assetGenerationTimeoutMs ||
          process.env.SUBMISSION_ASSET_GENERATOR_TIMEOUT_MS
      ) || 15000
    )
  );
  const required =
    parseBoolean(
      metadata.asset_generation_hook_required ??
        metadata.assetGenerationHookRequired ??
        options.assetGenerationHookRequired ??
        process.env.SUBMISSION_ASSET_GENERATOR_REQUIRED
    ) === true;
  const metadataHeaders = isPlainObject(metadata.asset_generation_hook_headers)
    ? metadata.asset_generation_hook_headers
    : isPlainObject(metadata.assetGenerationHookHeaders)
      ? metadata.assetGenerationHookHeaders
      : {};
  const envHeaders = (() => {
    const raw = sanitizeOptionalString(process.env.SUBMISSION_ASSET_GENERATOR_HEADERS_JSON, 20000);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  })();
  const mergedHeaders = {
    ...envHeaders,
    ...metadataHeaders
  };
  const bearerToken = sanitizeOptionalString(
    process.env.SUBMISSION_ASSET_GENERATOR_BEARER_TOKEN,
    4096
  );
  if (bearerToken && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${bearerToken}`;
  }

  return {
    hookUrl,
    timeoutMs,
    required,
    headers: Object.fromEntries(
      Object.entries(mergedHeaders)
        .map(([rawKey, rawValue]) => [sanitizeString(rawKey, 120), sanitizeString(rawValue, 4000)])
        .filter(([key, value]) => key && value)
    )
  };
}

async function callAssetGenerationHook(jobRequest, payload, options = {}) {
  if (typeof options.assetGenerationHook === "function") {
    return options.assetGenerationHook(jobRequest, payload);
  }

  const config = buildAssetGenerationConfig(jobRequest, options);
  if (!config.hookUrl) {
    return { ok: false, skipped: true, error: "Asset generation hook is not configured." };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, skipped: false, error: "fetch is not available for asset generation hook." };
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;
  try {
    const response = await fetchImpl(config.hookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers
      },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {})
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        error: data?.error || data?.message || `Asset generation hook returned ${response.status}`,
        response: data
      };
    }

    return {
      ok: true,
      skipped: false,
      config,
      response: data
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error?.message || "Asset generation hook failed"
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function suggestValueForField(field, brand, copyPack, factualPack) {
  const label = `${field.label || ""} ${field.name || ""} ${field.hidden_name || ""} ${field.placeholder || ""}`.toLowerCase();

  if (/\blinkedin\b/.test(label)) {
    return factualPack.linkedin_url;
  }
  if (/\bcompetitors?\b|\balternatives?\b|service_names\[\]/.test(label)) {
    return Array.isArray(factualPack.competitors) ? factualPack.competitors.join(", ") : "";
  }
  if (/\bcategories?\b|\btags?\b|category_names\[\]/.test(label)) {
    return brand.services.length ? brand.services.join(", ") : brand.tags.join(", ");
  }
  if (/\bservices\b|\bservice areas?\b/.test(label)) {
    return brand.services.join(", ");
  }
  if (/\bwebsite\b|\burl\b/.test(label)) {
    return factualPack.website_url;
  }
  if (/\bname\b/.test(label) && !/\bcompany\b|\bbusiness\b/.test(label)) {
    return factualPack.legal_name || copyPack.display_name || "";
  }
  if (/\bcompany\b|\bbusiness\b|\bproduct\b/.test(label)) {
    return factualPack.legal_name || copyPack.display_name || "";
  }
  if (/\btagline\b|\bslogan\b/.test(label)) {
    return copyPack.one_liner_60;
  }
  if (/\baudience\b|\btarget market\b|\bmarket segment\b|\bideal customer\b|\bideal user\b|\bicp\b/.test(label)) {
    return copyPack.target_market_description || copyPack.ideal_customer_profile || "";
  }
  if (/\bshort\b.*\bdescription\b|\bsummary\b|\bpitch\b/.test(label)) {
    return copyPack.blurb_160;
  }
  if (/\bdescription\b|\babout\b|\bdetails\b/.test(label)) {
    return copyPack.about_500;
  }
  if (/\bemail\b/.test(label)) {
    return factualPack.email;
  }
  if (/\bphone\b|\bmobile\b/.test(label)) {
    return factualPack.phone;
  }
  if (/\baddress\b/.test(label)) {
    return factualPack.address_line_1;
  }
  if (/\bcity\b/.test(label)) {
    return factualPack.city;
  }
  if (/\bstate\b|\bprovince\b/.test(label)) {
    return factualPack.state;
  }
  if (/\bzip\b|\bpostal\b/.test(label)) {
    return factualPack.postal_code;
  }
  if (/\bhours\b/.test(label)) {
    return Object.keys(factualPack.hours || {}).length ? JSON.stringify(factualPack.hours) : "";
  }
  if (/\bprice\b|\bpricing\b/.test(label)) {
    return copyPack.pricing_summary || sanitizeString(brand.profile?.pricing_summary, 500) || "";
  }
  return "";
}

function applySitePlanOverrides(fieldSuggestions, sitePlan) {
  const suggestions = Array.isArray(fieldSuggestions) ? [...fieldSuggestions] : [];
  const overrides = Array.isArray(sitePlan?.field_overrides) ? sitePlan.field_overrides : [];
  for (const override of overrides) {
    const suggestedValue = sanitizeString(override?.suggested_value, 4000);
    if (!suggestedValue) {
      continue;
    }
    const targetLabel = normalizeFieldToken(override?.field_label);
    const targetName = normalizeFieldToken(override?.field_name);
    const matchingIndex = suggestions.findIndex((item) => {
      const label = normalizeFieldToken(item?.field_label);
      const name = normalizeFieldToken(item?.field_name);
      if (targetName && name && name === targetName) {
        return true;
      }
      if (targetLabel && label && label === targetLabel) {
        return true;
      }
      if (targetLabel && label && (label.includes(targetLabel) || targetLabel.includes(label))) {
        return true;
      }
      return false;
    });

    if (matchingIndex >= 0) {
      suggestions[matchingIndex] = {
        ...suggestions[matchingIndex],
        suggested_value: suggestedValue
      };
      continue;
    }

    suggestions.push({
      field_label: sanitizeString(override?.field_label, 180) || sanitizeString(override?.field_name, 180) || "Generated field",
      field_name: sanitizeString(override?.field_name, 180) || null,
      field_type: "text",
      suggested_value: suggestedValue,
      required: false
    });
  }
  return suggestions;
}

function buildSiteManifest(siteRow, brand, copyPack, factualPack, availableAssets, sitePlan = null) {
  const profile = siteRow?.profile && typeof siteRow.profile === "object" ? siteRow.profile : {};
  const fields = Array.isArray(profile.fields) ? profile.fields : [];
  const assetRequirements = Array.isArray(profile.asset_requirements) ? profile.asset_requirements : [];
  const fieldSuggestions = applySitePlanOverrides(
    fields.map((field) => ({
      field_label: field.label || field.name || "",
      field_name: field.name || field.hidden_name || null,
      field_type: field.type || field.tag || "text",
      suggested_value: suggestValueForField(field, brand, copyPack, factualPack),
      required: field.required === true
    })),
    sitePlan
  );

  if (sanitizeString(siteRow?.site_id, 128).toLowerCase() === "saashub") {
    for (const suggestion of fieldSuggestions) {
      if (normalizeFieldToken(suggestion?.field_label) === "contact email") {
        suggestion.suggested_value = "";
        suggestion.required = false;
      }
    }
  }

  const missingItems = [];
  for (const asset of assetRequirements) {
    const assetType = sanitizeString(asset.asset_type || asset.key || asset.name || asset.label, 120) || "unknown_asset";
    if (asset.required === false) {
      continue;
    }
    const status = resolveAssetStatus(assetType, availableAssets);
    if (status !== "ready") {
      missingItems.push({
        type: "asset",
        asset_type: assetType,
        message: `Missing ${assetType} input for ${siteRow.site_name || siteRow.site_id}.`
      });
    }
  }

  for (const suggestion of fieldSuggestions) {
    if (suggestion.required && !sanitizeString(suggestion.suggested_value, 500)) {
      missingItems.push({
        type: "field",
        field_label: suggestion.field_label,
        message: `Missing factual value for required field "${suggestion.field_label || suggestion.field_name || "field"}".`
      });
    }
  }

  return {
    site_id: siteRow.site_id,
    site_name: siteRow.site_name,
    submission_policy: siteRow.submission_policy || profile.recommended_submission_policy || "assist",
    submit_url: siteRow.submit_url,
    asset_requirements: assetRequirements,
    field_suggestions: fieldSuggestions,
    duplicate_check_flow: Array.isArray(profile.duplicate_check_flow) ? profile.duplicate_check_flow : [],
    generation_notes: sanitizeString(sitePlan?.notes, 1000) || "",
    missing_items: missingItems
  };
}

function buildRequiredAssets(siteRows, availableAssets) {
  const assetsByType = new Map();

  for (const siteRow of Array.isArray(siteRows) ? siteRows : []) {
    const profile = siteRow?.profile && typeof siteRow.profile === "object" ? siteRow.profile : {};
    for (const asset of Array.isArray(profile.asset_requirements) ? profile.asset_requirements : []) {
      const assetType = sanitizeString(asset.asset_type || asset.key || asset.name || asset.label, 120) || "unknown_asset";
      if (asset.required === false) {
        continue;
      }
      if (!assetsByType.has(assetType)) {
        assetsByType.set(assetType, {
          asset_type: assetType,
          status: resolveAssetStatus(assetType, availableAssets),
          required_for: [],
          labels: [],
          accept: asset.accept || null,
          multiple: asset.multiple === true
        });
      }
      const existing = assetsByType.get(assetType);
      existing.required_for.push(siteRow.site_id);
      if (asset.label) {
        existing.labels.push(asset.label);
      }
      if (!existing.accept && asset.accept) {
        existing.accept = asset.accept;
      }
      if (asset.multiple === true) {
        existing.multiple = true;
      }
    }
  }

  return Array.from(assetsByType.values()).map((item) => ({
    ...item,
    required_for: Array.from(new Set(item.required_for)),
    labels: Array.from(new Set(item.labels))
  }));
}

function buildApprovalItems(brand, requiredAssets, siteManifests) {
  const items = [];
  const add = (type, label, message) => {
    items.push({ type, label, message });
  };

  if (!brand.website_url) add("factual", "Website URL", "Confirm the canonical website URL.");
  if (!brand.contact.email) add("factual", "Email", "Confirm the primary contact email.");
  if (!brand.contact.phone) add("factual", "Phone", "Confirm the primary contact phone number.");

  if (brand.track === "physical_local") {
    if (!brand.location.address_line_1) add("factual", "Address", "Confirm the physical street address.");
    if (!brand.location.city || !brand.location.state) add("factual", "Location", "Confirm city and state details.");
  }

  for (const asset of requiredAssets) {
    if (asset.status !== "ready") {
      add("asset", asset.asset_type, `Provide ${asset.asset_type} before submission starts.`);
    }
  }

  for (const site of siteManifests) {
    if (Array.isArray(site.missing_items)) {
      for (const item of site.missing_items) {
        add(item.type || "field", item.field_label || item.asset_type || site.site_id, item.message || "Missing value.");
      }
    }
  }

  return Array.from(
    new Map(items.map((item) => [`${item.type}:${item.label}:${item.message}`, item])).values()
  );
}

function normalizeFieldToken(value) {
  return sanitizeString(value, 240)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findSuggestionForField(field, fieldSuggestions) {
  const suggestions = Array.isArray(fieldSuggestions) ? fieldSuggestions : [];
  const fieldName = normalizeFieldToken(field?.name);
  const fieldLabel = normalizeFieldToken(field?.label);

  if (fieldName) {
    const exactName = suggestions.find((item) => normalizeFieldToken(item?.field_name) === fieldName);
    if (exactName) {
      return exactName;
    }
  }

  if (fieldLabel) {
    const exactLabel = suggestions.find((item) => normalizeFieldToken(item?.field_label) === fieldLabel);
    if (exactLabel) {
      return exactLabel;
    }

    const partialLabel = suggestions.find((item) => {
      const suggestionLabel = normalizeFieldToken(item?.field_label);
      return suggestionLabel && (suggestionLabel.includes(fieldLabel) || fieldLabel.includes(suggestionLabel));
    });
    if (partialLabel) {
      return partialLabel;
    }
  }

  return null;
}

async function fillVisibleField(page, locator, field, value, runLog) {
  const fieldType = sanitizeString(field?.type, 64).toLowerCase();
  const fieldTag = sanitizeString(field?.tag, 64).toLowerCase();
  const fieldRole = sanitizeString(field?.role, 64).toLowerCase();
  const fieldWidget = sanitizeString(field?.widget, 64).toLowerCase();
  const safeValue = typeof value === "string" ? value : sanitizeString(value, 4000);
  if (!safeValue) {
    return { ok: false, skipped: true, reason: "Empty suggested value." };
  }

  try {
    if (fieldWidget === "combobox" || fieldRole === "combobox") {
      const tokens = Array.from(
        new Set(
          safeValue
            .split(/[\n,]+/)
            .map((item) => sanitizeString(item, 240))
            .filter(Boolean)
        )
      ).slice(0, field.multiple ? 8 : 1);
      if (!tokens.length) {
        return { ok: false, skipped: true, reason: "No combobox tokens were provided." };
      }

      let selectedCount = 0;
      const missingTokens = [];
      for (const token of tokens) {
        const optionPrefix = sanitizeString(field?.id, 120).replace(/input$/i, "option-");
        const hiddenName = sanitizeString(field?.hidden_name, 240);
        await locator.click({ timeout: 5000 });
        await locator.fill("");
        await locator.fill(token);
        await page.waitForTimeout(500);
        let optionClicked = false;
        let committed = false;
        const verifyCommitted = async () => {
          if (hiddenName) {
            const hiddenLocator = page.locator(`input[type="hidden"][name="${hiddenName}"]`).first();
            const count = await hiddenLocator.count().catch(() => 0);
            if (count > 0) {
              const hiddenValue = await hiddenLocator.inputValue().catch(() => "");
              if (sanitizeString(hiddenValue, 1000).toLowerCase().includes(token.toLowerCase())) {
                return true;
              }
            }
          }
          const chipLocator = page.locator(".react-select__multi-value__label").filter({
            hasText: new RegExp(`^${escapeRegExp(token)}$`, "i")
          });
          const chipCount = await chipLocator.count().catch(() => 0);
          return chipCount > 0;
        };
        const exactRoleOption = page.getByRole("option", {
          name: new RegExp(`^${escapeRegExp(token)}$`, "i")
        }).first();
        const exactRoleCount = await exactRoleOption.count().catch(() => 0);
        if (exactRoleCount > 0) {
          await exactRoleOption.click({ timeout: 5000 });
          optionClicked = true;
        }
        if (optionPrefix) {
          if (!optionClicked) {
            const optionLocator = page.locator(`[id^="${optionPrefix}"]`);
            const optionCount = await optionLocator.count().catch(() => 0);
            if (optionCount > 0) {
              const exactOption = optionLocator.filter({ hasText: token }).first();
              const exactCount = await exactOption.count().catch(() => 0);
              const targetOption = exactCount > 0 ? exactOption : optionLocator.first();
              await targetOption.click({ timeout: 5000 });
              optionClicked = true;
            }
          }
        }
        if (optionClicked) {
          await page.waitForTimeout(250);
          committed = await verifyCommitted();
        }
        if (!committed) {
          await locator.click({ timeout: 5000 }).catch(() => {});
          await locator.fill("").catch(() => {});
          await locator.fill(token).catch(() => {});
          await page.waitForTimeout(250);
          await page.keyboard.press("ArrowDown").catch(() => {});
          await page.keyboard.press("Enter").catch(() => {});
          await page.waitForTimeout(300);
          committed = await verifyCommitted();
          optionClicked = optionClicked || committed;
        }
        if (!committed) {
          missingTokens.push(token);
          appendRunLog(runLog, "field_combobox_option_missing", {
            field: field.label || field.name || field.hidden_name || "combobox",
            value: token
          });
          await locator.fill("").catch(() => {});
          continue;
        }
        selectedCount += 1;
        await page.waitForTimeout(200);
        appendRunLog(runLog, "field_combobox_selected", {
          field: field.label || field.name || field.hidden_name || "combobox",
          value: token,
          option_clicked: optionClicked,
          committed
        });
      }

      if (!selectedCount) {
        return { ok: false, skipped: true, reason: "No combobox options were selectable." };
      }

      return {
        ok: true,
        mode: missingTokens.length ? "combobox_partial" : "combobox",
        warnings: missingTokens
      };
    }

    if (fieldTag === "select" || fieldType === "select") {
      let selected = false;
      try {
        await locator.selectOption({ label: safeValue });
        selected = true;
      } catch {
        // Try value-based selection next.
      }
      if (!selected) {
        await locator.selectOption({ value: safeValue });
      }
      appendRunLog(runLog, "field_selected", {
        field: field.label || field.name || "select",
        value: safeValue
      });
      return { ok: true, mode: "select" };
    }

    if (fieldType === "checkbox") {
      const boolValue = parseBoolean(safeValue);
      if (boolValue === false) {
        await locator.uncheck({ force: true });
      } else {
        await locator.check({ force: true });
      }
      appendRunLog(runLog, "field_toggled", {
        field: field.label || field.name || "checkbox",
        value: boolValue !== false
      });
      return { ok: true, mode: "toggle" };
    }

    if (fieldType === "radio") {
      await locator.check({ force: true });
      appendRunLog(runLog, "field_toggled", {
        field: field.label || field.name || "radio",
        value: true
      });
      return { ok: true, mode: "toggle" };
    }

    await locator.fill("");
    await locator.fill(safeValue);
    appendRunLog(runLog, "field_filled", {
      field: field.label || field.name || "field",
      value_preview: safeValue.slice(0, 120)
    });
    return { ok: true, mode: "fill" };
  } catch (error) {
    appendRunLog(runLog, "field_fill_failed", {
      field: field.label || field.name || "field",
      message: error?.message || "Field fill failed"
    });
    return { ok: false, error: error?.message || "Field fill failed" };
  }
}

function getAssetRefsForType(assetType, availableAssets) {
  const refs = [];
  for (const candidate of getAssetCandidatesForType(assetType)) {
    if (Array.isArray(availableAssets?.[candidate])) {
      refs.push(...availableAssets[candidate]);
    }
  }
  return Array.from(new Set(refs.map(normalizeAssetRef).filter(Boolean)));
}

function guessAssetExtension(assetRef, contentType) {
  const safeRef = sanitizeString(assetRef, 4096);
  const pathname = (() => {
    try {
      return new URL(safeRef).pathname;
    } catch {
      return safeRef;
    }
  })();
  const ext = path.extname(pathname || "").toLowerCase();
  if (ext && ext.length <= 10) {
    return ext;
  }

  const normalizedType = sanitizeString(contentType, 160).toLowerCase();
  if (normalizedType.includes("png")) return ".png";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return ".jpg";
  if (normalizedType.includes("webp")) return ".webp";
  if (normalizedType.includes("svg")) return ".svg";
  if (normalizedType.includes("gif")) return ".gif";
  if (normalizedType.includes("mp4")) return ".mp4";
  if (normalizedType.includes("mov")) return ".mov";
  return ".bin";
}

async function materializeAssetRef(assetRef, assetType, assetDir, runLog, options = {}) {
  const safeRef = normalizeAssetRef(assetRef);
  if (!safeRef) {
    return { ok: false, error: "Missing asset reference." };
  }

  if (/^https?:\/\//i.test(safeRef)) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      return { ok: false, error: "fetch is not available for remote asset downloads." };
    }
    try {
      const response = await fetchImpl(safeRef);
      if (!response.ok) {
        return { ok: false, error: `Failed to download remote asset (${response.status}).` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = path.join(
        assetDir,
        `${toSafeSlug(assetType, "asset")}-${timestampId()}${guessAssetExtension(
          safeRef,
          response.headers.get("content-type")
        )}`
      );
      fs.writeFileSync(filePath, buffer);
      appendRunLog(runLog, "asset_downloaded", {
        asset_type: assetType,
        source: safeRef,
        path: filePath
      });
      return { ok: true, path: filePath, source: safeRef };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Failed to download remote asset.",
        source: safeRef
      };
    }
  }

  const localPath = path.isAbsolute(safeRef) ? safeRef : path.resolve(safeRef);
  if (!fs.existsSync(localPath)) {
    return { ok: false, error: "Local asset path does not exist.", source: safeRef };
  }

  return { ok: true, path: localPath, source: safeRef };
}

function classifySubmitOutcome(snapshot) {
  const text = [
    sanitizeString(snapshot?.title, 1000),
    ...(Array.isArray(snapshot?.text_hints) ? snapshot.text_hints : [])
  ]
    .filter(Boolean)
    .join(" ");
  const url = sanitizeOptionalString(snapshot?.url, 4096) || "";
  if (/\/related-alternatives\//i.test(url) && /\bflow=submit\b/i.test(url)) {
    return "submitted";
  }
  if (/\bselect competitors\b/i.test(text) && /\bverified alternative\b/i.test(text)) {
    return "submitted";
  }
  if (/\bpending\b|\breview\b|\bapproval\b/i.test(text)) {
    return "pending_review";
  }
  if (/\bthank you\b|\bthanks\b|\bsuccess\b|\bsubmitted\b/i.test(text)) {
    return "submitted";
  }
  if ((Number(snapshot?.field_count) || 0) > 0 || (Number(snapshot?.forms_count) || 0) > 0) {
    return "incomplete";
  }
  return "unknown";
}

function buildPauseSummary(context) {
  if (context.hasCaptcha) {
    return {
      submission_status: "paused_for_captcha",
      message: "Submission paused because CAPTCHA handling is required."
    };
  }
  if (context.hasAuth) {
    return {
      submission_status: "paused_for_login",
      message: "Submission paused because authentication is required."
    };
  }
  if (context.hasDuplicateFlow) {
    return {
      submission_status: "paused_for_duplicate_review",
      message: "Submission paused so an operator can resolve duplicate-listing checks."
    };
  }
  if (context.hasMissingItems) {
    return {
      submission_status: "paused_for_missing_inputs",
      message: "Submission paused because required fields or assets are still missing."
    };
  }
  if (context.stopBeforeSubmit) {
    return {
      submission_status: "filled_ready_for_review",
      message: "Submission was filled and paused before the final submit step."
    };
  }
  return {
    submission_status: "paused_for_human_review",
    message: "Submission paused for human review under assisted policy."
  };
}

async function runAssetPrepare(jobRequest, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const runLog = [];
  const outputDir = path.resolve(
    options.outputRoot || "output/submissions/assets",
    `${toSafeSlug(jobRequest.brand_profile_id, "brand")}-${toSafeSlug(jobRequest.job_id, "job")}-${timestampId()}`
  );
  mkdirp(outputDir);
  const artifacts = {
    output_dir: outputDir,
    manifest_path: null,
    run_log_path: null
  };
  Object.defineProperty(runLog, "__persist", {
    value: () => {
      const runLogPath = writeRunLogFile(outputDir, runLog);
      if (runLogPath) {
        artifacts.run_log_path = runLogPath;
      }
    },
    enumerable: false
  });

  const reportProgress = (phase, percent, message) => {
    if (onProgress) {
      onProgress({
        phase,
        percent,
        message,
        updated_at: new Date().toISOString()
      });
    }
  };

  try {
    appendRunLog(runLog, "asset_prepare_started", {
      job_id: jobRequest.job_id,
      brand_profile_id: jobRequest.brand_profile_id
    });
    reportProgress("loading_brand_profile", 10, "Loading brand profile.");

    const brandLoaded = await options.loadBrandProfile(jobRequest.brand_profile_id);
    if (!brandLoaded?.ok || !brandLoaded.row) {
      throw new Error(brandLoaded?.error || "Brand profile not found.");
    }

    reportProgress("loading_site_profiles", 30, "Loading active site profiles.");
    const sitesLoaded = await options.loadSiteProfiles(jobRequest.site_ids);
    if (!sitesLoaded?.ok) {
      throw new Error(sitesLoaded?.error || "Failed to load site profiles.");
    }

    const brand = extractBrandProfileData(brandLoaded.row);
    brand.profile = brandLoaded.row.profile || {};
    const siteRows = Array.isArray(sitesLoaded.rows) ? sitesLoaded.rows : [];
    const siteIdsRequested = Array.isArray(jobRequest.site_ids) ? jobRequest.site_ids : [];
    const foundSiteIds = new Set(siteRows.map((row) => row.site_id));
    const missingSiteProfiles = siteIdsRequested.filter((siteId) => !foundSiteIds.has(siteId));
    const copyPack = buildCopyPack(brand);
    const factualPack = buildFactualPack(brand);
    let availableAssets = collectAvailableAssets(brand);
    let resolvedCopyPack = { ...copyPack };
    let resolvedFactualPack = { ...factualPack };
    let resolvedSitePlans = {};
    let generation = {
      attempted: false,
      status: "not_configured",
      hook_url: null,
      notes: [],
      generated_asset_count: 0
    };

    const assetHookPayload = {
      job_id: jobRequest.job_id,
      brand_profile_id: brand.brand_profile_id,
      brand_key: brand.brand_key,
      track: brand.track,
      requested_site_ids: siteIdsRequested,
      brand,
      copy_pack: resolvedCopyPack,
      factual_pack: resolvedFactualPack,
      available_assets: availableAssets,
      site_profiles: siteRows.map((siteRow) => ({
        site_id: siteRow.site_id,
        site_name: siteRow.site_name,
        submission_policy: siteRow.submission_policy,
        submit_url: siteRow.submit_url,
        profile: siteRow.profile || {}
      }))
    };

    const hookConfig = buildAssetGenerationConfig(jobRequest, options);
    const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
    const preferBuiltinRaw =
      metadata.asset_generation_prefer_builtin ??
      metadata.assetGenerationPreferBuiltin ??
      options.assetGenerationPreferBuiltin ??
      process.env.SUBMISSION_ASSET_GENERATOR_PREFER_BUILTIN;
    const preferBuiltin = preferBuiltinRaw === undefined ? true : parseBoolean(preferBuiltinRaw) !== false;
    const hasExternalHook = Boolean(hookConfig.hookUrl || typeof options.assetGenerationHook === "function");
    generation.hook_url = hookConfig.hookUrl || (preferBuiltin ? "builtin_openai_replicate" : null);

    const mergeGenerationResponse = (hookResponse, sourceLabel) => {
      const generatedAssets = normalizeAssetMap(
        hookResponse.generated_assets || hookResponse.assets || hookResponse.available_assets
      );
      const mergedCopy = mergeTextRecord(
        resolvedCopyPack,
        hookResponse.copy_pack || hookResponse.generated_copy || hookResponse.copy,
        4000
      );
      const mergedFactual = mergeTextRecord(
        resolvedFactualPack,
        hookResponse.factual_pack || hookResponse.generated_factual || hookResponse.factual,
        4000
      );
      availableAssets = mergeAssetMaps(availableAssets, generatedAssets);
      resolvedCopyPack = mergedCopy;
      resolvedFactualPack = mergedFactual;
      if (isPlainObject(hookResponse.site_plans)) {
        resolvedSitePlans = { ...resolvedSitePlans, ...hookResponse.site_plans };
      }
      generation = {
        attempted: true,
        status: "completed",
        hook_url: sourceLabel,
        notes: sanitizeStringList(
          hookResponse.notes || hookResponse.messages || hookResponse.warnings || [],
          20,
          500
        ),
        generated_asset_count: countAssetRefs(generatedAssets),
        generation_meta: isPlainObject(hookResponse.generation_meta) ? hookResponse.generation_meta : null
      };
      appendRunLog(runLog, "asset_generation_completed", {
        source: sourceLabel,
        generated_asset_count: generation.generated_asset_count
      });
      return {
        hookResponse,
        generatedAssets
      };
    };

    let generationResult = null;
    if (preferBuiltin || !hasExternalHook) {
      generation.attempted = true;
      reportProgress("generating_assets", 45, "Generating submission assets with OpenAI and Replicate.");
      appendRunLog(runLog, "asset_generation_builtin_started", {
        source: "builtin_openai_replicate"
      });
      const builtinResult = await generateSubmissionAssets(jobRequest, assetHookPayload, options);
      if (builtinResult.ok) {
        generationResult = mergeGenerationResponse(
          isPlainObject(builtinResult.response) ? builtinResult.response : {},
          "builtin_openai_replicate"
        );
      } else if (!builtinResult.skipped) {
        generation = {
          attempted: true,
          status: "failed",
          hook_url: "builtin_openai_replicate",
          notes: [sanitizeString(builtinResult.error, 500) || "Built-in asset generation failed."],
          generated_asset_count: 0
        };
        appendRunLog(runLog, "asset_generation_builtin_failed", {
          message: builtinResult.error || "Built-in asset generation failed"
        });
        if (!hasExternalHook && hookConfig.required) {
          throw new Error(builtinResult.error || "Built-in asset generation failed");
        }
      }
    }

    if (!generationResult && hasExternalHook) {
      generation.hook_url = hookConfig.hookUrl || "inline_hook";
      generation.attempted = true;
      reportProgress("generating_assets", 45, "Calling asset generation hook.");
      appendRunLog(runLog, "asset_generation_hook_started", {
        hook_url: hookConfig.hookUrl || "inline_hook"
      });
      const hookRequestPath = path.join(outputDir, "asset-generation-hook-request.json");
      fs.writeFileSync(hookRequestPath, JSON.stringify(assetHookPayload, null, 2));

      const hookResult = await callAssetGenerationHook(jobRequest, assetHookPayload, options);
      if (hookResult.ok) {
        const hookResponse = isPlainObject(hookResult.response) ? hookResult.response : {};
        generationResult = mergeGenerationResponse(hookResponse, hookConfig.hookUrl || "inline_hook");
        const hookResponsePath = path.join(outputDir, "asset-generation-hook-response.json");
        fs.writeFileSync(hookResponsePath, JSON.stringify(hookResponse, null, 2));
        appendRunLog(runLog, "asset_generation_hook_completed", {
          generated_asset_count: generation.generated_asset_count,
          response_path: hookResponsePath
        });
      } else {
        generation = {
          attempted: true,
          status: hookResult.skipped ? "skipped" : "failed",
          hook_url: hookConfig.hookUrl || "inline_hook",
          notes: [sanitizeString(hookResult.error, 500) || "Asset generation hook failed."],
          generated_asset_count: 0
        };
        appendRunLog(runLog, "asset_generation_hook_failed", {
          message: hookResult.error || "Asset generation hook failed"
        });
        if (hookConfig.required) {
          throw new Error(hookResult.error || "Asset generation hook failed");
        }
      }
    }

    if (generationResult?.generatedAssets && countAssetRefs(generationResult.generatedAssets) > 0) {
      const materializedAssets = await materializeGeneratedAssetMap(generationResult.generatedAssets, outputDir, options);
      if (countAssetRefs(materializedAssets.asset_map) > 0) {
        availableAssets = mergeAssetMaps(availableAssets, materializedAssets.asset_map);
        generation.generation_meta = {
          ...(isPlainObject(generation.generation_meta) ? generation.generation_meta : {}),
          materialized_asset_count: materializedAssets.saved_assets.length,
          materialized_assets: materializedAssets.saved_assets
        };
        appendRunLog(runLog, "generated_assets_materialized", {
          materialized_asset_count: materializedAssets.saved_assets.length
        });
      }
    }

    reportProgress("building_manifest", 60, "Compiling asset manifest.");
    const siteManifests = siteRows.map((siteRow) =>
      buildSiteManifest(
        siteRow,
        brand,
        resolvedCopyPack,
        resolvedFactualPack,
        availableAssets,
        resolvedSitePlans[sanitizeString(siteRow.site_id, 128).toLowerCase()] || null
      )
    );
    const requiredAssets = buildRequiredAssets(siteRows, availableAssets);
    const approvalItems = buildApprovalItems(brand, requiredAssets, siteManifests);
    const missingItems = [
      ...approvalItems.filter((item) => item.type === "asset" || item.type === "field"),
      ...missingSiteProfiles.map((siteId) => ({
        type: "site_profile",
        label: siteId,
        message: `Run recon for ${siteId} before preparing final submission assets.`
      }))
    ];

    const manifest = {
      brand_profile_id: brand.brand_profile_id,
      brand_key: brand.brand_key,
      track: brand.track,
      generated_at: new Date().toISOString(),
      requested_site_ids: siteIdsRequested,
      missing_site_profiles: missingSiteProfiles,
      copy_pack: resolvedCopyPack,
      factual_pack: resolvedFactualPack,
      available_assets: availableAssets,
      required_assets: requiredAssets,
      site_manifests: siteManifests,
      missing_items: missingItems,
      approval_items: approvalItems,
      site_plans: resolvedSitePlans,
      generation
    };

    const manifestPath = path.join(outputDir, "asset-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    artifacts.manifest_path = manifestPath;
    appendRunLog(runLog, "asset_manifest_written", { path: manifestPath });

    reportProgress("finalizing", 90, "Finalizing asset manifest.");
    return {
      ok: true,
      result: {
        status: "completed",
        summary: {
          note: `Prepared asset manifest for ${siteRows.length} site profile(s); ${missingItems.length} item(s) still need attention.`
        },
        asset_manifest: manifest,
        next_steps: [
          "Review the copy pack and factual pack.",
          "Approve or fill missing factual items.",
          "Provide missing binary assets before enabling directory_submit."
        ]
      },
      artifacts,
      runLog
    };
  } catch (error) {
    appendRunLog(runLog, "asset_prepare_failed", {
      message: error?.message || "Asset preparation failed"
    });
    return {
      ok: false,
      result: {
        status: "failed",
        summary: {
          note: error?.message || "Asset preparation failed"
        },
        next_steps: ["Review the asset preparation error and retry after fixing the missing input."]
      },
      artifacts,
      runLog,
      error
    };
  }
}

async function runDirectorySubmit(jobRequest, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const runLog = [];
  const outputDir = path.resolve(
    options.outputRoot || "output/submissions/runs",
    `${toSafeSlug(jobRequest.site_id, "site")}-${toSafeSlug(jobRequest.job_id, "job")}-${timestampId()}`
  );
  const screenshots = [];
  mkdirp(outputDir);
  const assetDir = path.join(outputDir, "assets");
  mkdirp(assetDir);
  let runtime = buildSelfHostedRuntimeConfig(jobRequest, options);

  const artifacts = {
    output_dir: outputDir,
    screenshots: [],
    video_path: null,
    final_url: null,
    runtime: {
      headless: runtime.headless,
      browser_channel: runtime.browserChannel || null,
      locale: runtime.locale || null,
      timezone_id: runtime.timezoneId || null,
      proxy_enabled: Boolean(runtime.proxy?.server),
      stealth_mode: runtime.stealthMode === true,
      block_ads: runtime.blockAds === true,
      record_video: runtime.recordVideo !== false,
      captcha_strategy: runtime.captchaStrategy || "built_in",
      twocaptcha_enabled: runtime.twoCaptcha?.enabled === true,
      captcha_hook_enabled: Boolean(runtime.captchaHook?.url),
      persistent_profile_enabled: Boolean(resolvePersistentProfileDir(runtime, jobRequest))
    }
  };
  Object.defineProperty(runLog, "__persist", {
    value: () => {
      const runLogPath = writeRunLogFile(outputDir, runLog);
      if (runLogPath) {
        artifacts.run_log_path = runLogPath;
      }
    },
    enumerable: false
  });

  const reportProgress = (phase, percent, message) => {
    if (onProgress) {
      onProgress({
        phase,
        percent,
        message,
        updated_at: new Date().toISOString()
      });
    }
  };

  let browser = null;
  let context = null;
  let page = null;
  let videoHandle = null;

  try {
    appendRunLog(runLog, "directory_submit_started", {
      job_id: jobRequest.job_id,
      site_id: jobRequest.site_id,
      brand_profile_id: jobRequest.brand_profile_id
    });
    reportProgress("loading_inputs", 8, "Loading brand profile, site profile, and asset manifest.");

    const brandLoaded = await options.loadBrandProfile(jobRequest.brand_profile_id);
    if (!brandLoaded?.ok || !brandLoaded.row) {
      throw new Error(brandLoaded?.error || "Brand profile not found.");
    }

    const assetManifestLoaded = await options.loadAssetManifest(
      jobRequest.manifest_id
        ? { manifest_id: jobRequest.manifest_id }
        : { brand_profile_id: jobRequest.brand_profile_id, latest: true }
    );
    if (!assetManifestLoaded?.ok || !assetManifestLoaded.row) {
      throw new Error(assetManifestLoaded?.error || "Submission asset manifest not found.");
    }

    const siteLoaded = await options.loadSiteProfiles([jobRequest.site_id]);
    if (!siteLoaded?.ok || !Array.isArray(siteLoaded.rows) || !siteLoaded.rows.length) {
      throw new Error(siteLoaded?.error || "Active site profile not found.");
    }

    const brand = extractBrandProfileData(brandLoaded.row);
    brand.profile = brandLoaded.row.profile || {};
    runtime = await resolveSelfHostedRuntimeConfig(jobRequest, brand, options);
    artifacts.runtime.proxy_enabled = Boolean(runtime.proxy?.server);
    if (runtime.proxySelection) {
      artifacts.runtime.proxy_selection = {
        provider: runtime.proxySelection.provider || null,
        status: runtime.proxySelection.status || null,
        matched: runtime.proxySelection.matched !== false,
        match_quality: runtime.proxySelection.match_quality || null,
        attempt_index: Number(runtime.proxySelection.attempt_index) || 0,
        available_candidate_count: Number(runtime.proxySelection.available_candidate_count) || 0,
        has_more_candidates: runtime.proxySelection.has_more_candidates === true,
        target: runtime.proxySelection.target || null,
        selected: runtime.proxySelection.selected || null,
        note: runtime.proxySelection.note || null,
        warnings: Array.isArray(runtime.proxySelection.warnings) ? runtime.proxySelection.warnings : []
      };
      appendRunLog(runLog, "proxy_selection_resolved", {
        provider: runtime.proxySelection.provider || null,
        status: runtime.proxySelection.status || null,
        matched: runtime.proxySelection.matched !== false,
        match_quality: runtime.proxySelection.match_quality || null,
        note: runtime.proxySelection.note || null
      });
    }
    const manifestRow = assetManifestLoaded.row;
    const manifest = isPlainObject(manifestRow.manifest) ? manifestRow.manifest : {};
    const siteRow = siteLoaded.rows[0];
    const availableAssets = normalizeAssetMap(manifest.available_assets || collectAvailableAssets(brand));
    const copyPack = mergeTextRecord(buildCopyPack(brand), manifest.copy_pack, 4000);
    const factualPack = mergeTextRecord(buildFactualPack(brand), manifest.factual_pack, 4000);
    const siteManifest =
      (Array.isArray(manifest.site_manifests)
        ? manifest.site_manifests.find((item) => sanitizeString(item?.site_id, 128) === siteRow.site_id)
        : null) || buildSiteManifest(siteRow, brand, copyPack, factualPack, availableAssets);
    const siteProfile = isPlainObject(siteRow.profile) ? siteRow.profile : {};
    const effectivePolicy =
      sanitizeString(jobRequest.submission_policy, 64) ||
      sanitizeString(siteManifest.submission_policy, 64) ||
      sanitizeString(siteRow.submission_policy, 64) ||
      "assist";
    const targetUrl = sanitizeOptionalString(siteRow.submit_url || siteManifest.submit_url, 4096);
    if (!targetUrl) {
      throw new Error("Site profile is missing submit_url.");
    }

    reportProgress("launching_browser", 20, "Launching browser for directory submission.");
    const launched = await launchSubmissionBrowserContext(runtime, outputDir, jobRequest);
    browser = launched.browser;
    context = launched.context;
    await applyStealthMode(context, runtime);
    page = launched.page;
    videoHandle = launched.videoHandle;
    if (launched.persistentProfileDir) {
      artifacts.runtime.persistent_profile_dir = launched.persistentProfileDir;
    }
    await applyNetworkControls(page, runtime, runLog);

    reportProgress("navigating", 35, "Opening site submission flow.");
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(1200);
    await dismissBlockingOverlays(page, runLog);

    await captureScreenshot(page, outputDir, "01-landing", screenshots, runLog);
    artifacts.screenshots = screenshots.slice();
    let landingSnapshot = await evaluatePageSnapshot(page, "submit_landing");
    if (Array.isArray(landingSnapshot?.auth_hints) && landingSnapshot.auth_hints.length > 0) {
      const authAttempt = await attemptAutomatedAuth({
        page,
        jobRequest,
        brand,
        runtime,
        siteRow,
        siteProfile,
        currentUrl: sanitizeOptionalString(page.url(), 4096) || targetUrl,
        returnToUrl: targetUrl,
        outputDir,
        screenshots,
        runLog,
        checkpointPrefix: "submit-auth-entry",
        snapshotLabel: "submit_post_auth_entry"
      });
      if (authAttempt.success && authAttempt.snapshot) {
        landingSnapshot = authAttempt.snapshot;
        artifacts.screenshots = screenshots.slice();
      }
    }

    const advanced = await maybeAdvanceToReconFlow(page, landingSnapshot, runLog);
    let workingSnapshot = advanced.snapshot;
    if (advanced.clicked) {
      await dismissBlockingOverlays(page, runLog);
      await captureScreenshot(page, outputDir, "02-post-cta", screenshots, runLog);
      artifacts.screenshots = screenshots.slice();
    }
    if (Array.isArray(workingSnapshot?.auth_hints) && workingSnapshot.auth_hints.length > 0) {
      const authAttempt = await attemptAutomatedAuth({
        page,
        jobRequest,
        brand,
        runtime,
        siteRow,
        siteProfile,
        currentUrl: sanitizeOptionalString(page.url(), 4096) || targetUrl,
        returnToUrl: targetUrl,
        outputDir,
        screenshots,
        runLog,
        checkpointPrefix: "submit-auth-post-cta",
        snapshotLabel: "submit_post_auth_cta"
      });
      if (authAttempt.success && authAttempt.snapshot) {
        workingSnapshot = authAttempt.snapshot;
        artifacts.screenshots = screenshots.slice();
      }
    }

    reportProgress("filling_fields", 55, "Filling known fields and uploading available assets.");
    await dismissBlockingOverlays(page, runLog);
    const fieldSuggestions = Array.isArray(siteManifest?.field_suggestions) ? siteManifest.field_suggestions : [];
    let filledFieldCount = 0;
    let uploadedAssetCount = 0;
    const skippedUploads = [];
    const failedFields = [];
    const attemptedFieldKeys = new Set();
    const attemptedUploadKeys = new Set();
    const initialFill = await fillSnapshotFields({
      page,
      snapshot: workingSnapshot,
      fieldSuggestions,
      availableAssets,
      assetDir,
      runLog,
      options,
      skippedUploads,
      failedFields,
      attemptedFieldKeys,
      attemptedUploadKeys
    });
    filledFieldCount += initialFill.filledFieldCount;
    uploadedAssetCount += initialFill.uploadedAssetCount;

    await page.waitForTimeout(800);
    await captureScreenshot(page, outputDir, "03-filled", screenshots, runLog);
    artifacts.screenshots = screenshots.slice();
    let postFillSnapshot = await evaluatePageSnapshot(page, "post_fill");
    if (Array.isArray(postFillSnapshot?.auth_hints) && postFillSnapshot.auth_hints.length > 0) {
      const authAttempt = await attemptAutomatedAuth({
        page,
        jobRequest,
        brand,
        runtime,
        siteRow,
        siteProfile,
        currentUrl: sanitizeOptionalString(page.url(), 4096) || targetUrl,
        returnToUrl: targetUrl,
        outputDir,
        screenshots,
        runLog,
        checkpointPrefix: "submit-auth-post-fill",
        snapshotLabel: "submit_post_auth_fill"
      });
      if (authAttempt.success && authAttempt.snapshot) {
        postFillSnapshot = authAttempt.snapshot;
        artifacts.screenshots = screenshots.slice();
      }
    }
    const captchaResolution = {
      strategy: runtime.captchaStrategy || "built_in",
      built_in_attempted: false,
      built_in_resolved: false,
      built_in_wait_ms: 0,
      built_in_solver: runtime.twoCaptcha?.enabled === true ? "2captcha" : "wait",
      twocaptcha_attempted: false,
      twocaptcha_resolved: false,
      twocaptcha_task_id: null,
      twocaptcha_type: null,
      hook_attempted: false,
      hook_resolved: false,
      note: null,
      wait_ms: 0
    };

    if (Array.isArray(postFillSnapshot?.captcha_hints) && postFillSnapshot.captcha_hints.length > 0) {
      if (runtime.captchaStrategy === "built_in") {
        captchaResolution.built_in_attempted = true;
        captchaResolution.built_in_wait_ms = runtime.captchaBuiltInWaitMs || 0;
        if (runtime.twoCaptcha?.enabled === true) {
          reportProgress("captcha_built_in", 64, "Solving captcha with 2Captcha on the DO worker.");
          appendRunLog(runLog, "captcha_built_in_started", {
            solver: "2captcha"
          });
          const twoCaptchaResult = await attemptTwoCaptchaSolve(page, runtime, runLog, options);
          captchaResolution.twocaptcha_attempted = twoCaptchaResult.skipped !== true;
          captchaResolution.twocaptcha_task_id = twoCaptchaResult.taskId || null;
          captchaResolution.twocaptcha_type = sanitizeOptionalString(twoCaptchaResult?.challenge?.type, 64) || null;
          captchaResolution.note = sanitizeOptionalString(twoCaptchaResult.note || twoCaptchaResult.error, 500) || null;
          if (twoCaptchaResult.ok) {
            captchaResolution.twocaptcha_resolved = twoCaptchaResult.resolved === true;
            if (twoCaptchaResult.snapshot) {
              postFillSnapshot = twoCaptchaResult.snapshot;
            }
          }
        }
        if (Array.isArray(postFillSnapshot?.captcha_hints) && postFillSnapshot.captcha_hints.length > 0) {
          reportProgress("captcha_built_in_wait", 64, "Waiting for the self-hosted captcha solver window.");
          appendRunLog(runLog, "captcha_built_in_wait_started", {
            wait_ms: captchaResolution.built_in_wait_ms,
            solver: captchaResolution.built_in_solver
          });
          if (captchaResolution.built_in_wait_ms > 0) {
            await page.waitForTimeout(captchaResolution.built_in_wait_ms);
          }
        }
        await captureScreenshot(page, outputDir, "04-post-captcha-built-in", screenshots, runLog);
        artifacts.screenshots = screenshots.slice();
        postFillSnapshot = await evaluatePageSnapshot(page, "post_captcha_builtin");
        captchaResolution.built_in_resolved =
          !(Array.isArray(postFillSnapshot?.captcha_hints) && postFillSnapshot.captcha_hints.length > 0);
        appendRunLog(runLog, "captcha_built_in_wait_completed", {
          resolved: captchaResolution.built_in_resolved,
          wait_ms: captchaResolution.built_in_wait_ms,
          solver: captchaResolution.built_in_solver
        });
      }

      if (
        Array.isArray(postFillSnapshot?.captcha_hints) &&
        postFillSnapshot.captcha_hints.length > 0 &&
        (runtime.captchaStrategy === "hook" ||
          (runtime.captchaStrategy === "built_in" && (runtime.captchaHook?.url || typeof options.captchaHook === "function")))
      ) {
        captchaResolution.hook_attempted = true;
        reportProgress("captcha_hook", 65, "Triggering captcha assist hook.");
        const captchaPayload = {
          job_id: jobRequest.job_id,
          brand_profile_id: brand.brand_profile_id,
          site_id: siteRow.site_id,
          site_name: siteRow.site_name,
          manifest_id: manifestRow.manifest_id,
          page_url: sanitizeOptionalString(page.url(), 4096) || null,
          output_dir: outputDir,
          screenshots: screenshots.slice(),
          captcha_hints: postFillSnapshot.captcha_hints,
          auth_hints: postFillSnapshot.auth_hints || [],
          submission_policy: effectivePolicy
        };
        appendRunLog(runLog, "captcha_assist_started", {
          hook_url: runtime.captchaHook?.url || "inline_hook"
        });
        const hookResult = await callCaptchaAssistHook(jobRequest, captchaPayload, runtime, options);
        if (!hookResult.ok) {
          appendRunLog(runLog, "captcha_assist_failed", {
            message: hookResult.error || "Captcha assist hook failed"
          });
          if (runtime.captchaHook?.required) {
            throw new Error(hookResult.error || "Captcha assist hook failed");
          }
        } else {
          const hookResponse = isPlainObject(hookResult.response) ? hookResult.response : {};
          captchaResolution.note =
            sanitizeOptionalString(hookResponse.note || hookResponse.message, 500) || null;
          captchaResolution.wait_ms = Math.max(
            0,
            Math.min(
              300000,
              Number(hookResponse.wait_ms || hookResponse.waitMs || runtime.captchaHook?.waitMs) || 0
            )
          );
          if (captchaResolution.wait_ms > 0) {
            await page.waitForTimeout(captchaResolution.wait_ms);
          }
          await captureScreenshot(page, outputDir, "05-post-captcha-hook", screenshots, runLog);
          artifacts.screenshots = screenshots.slice();
          postFillSnapshot = await evaluatePageSnapshot(page, "post_captcha_hook");
          captchaResolution.hook_resolved =
            !(Array.isArray(postFillSnapshot?.captcha_hints) && postFillSnapshot.captcha_hints.length > 0);
          appendRunLog(runLog, "captcha_assist_completed", {
            resolved: captchaResolution.hook_resolved,
            wait_ms: captchaResolution.wait_ms,
            note: captchaResolution.note
          });
        }
      }
    }

    const hasAuth = Array.isArray(postFillSnapshot?.auth_hints) && postFillSnapshot.auth_hints.length > 0;
    const hasCaptcha = Array.isArray(postFillSnapshot?.captcha_hints) && postFillSnapshot.captcha_hints.length > 0;
    const hasDuplicateFlow =
      (Array.isArray(siteManifest?.duplicate_check_flow) && siteManifest.duplicate_check_flow.length > 0) ||
      (Array.isArray(postFillSnapshot?.duplicate_check_hints) && postFillSnapshot.duplicate_check_hints.length > 0);
    const hasMissingItems = Array.isArray(siteManifest?.missing_items) && siteManifest.missing_items.length > 0;
    const pauseContext = {
      hasAuth,
      hasCaptcha,
      hasDuplicateFlow,
      hasMissingItems,
      stopBeforeSubmit: jobRequest.stop_before_submit !== false
    };

    let submissionStatus = "";
    let nextSteps = [];
    let finalSnapshot = postFillSnapshot;
    let listingUrl = null;
    let summaryNote = "";

    if (
      effectivePolicy !== "auto" ||
      pauseContext.stopBeforeSubmit ||
      hasAuth ||
      hasCaptcha ||
      hasDuplicateFlow ||
      hasMissingItems
    ) {
      const pauseSummary = buildPauseSummary(pauseContext);
      submissionStatus = pauseSummary.submission_status;
      summaryNote = pauseSummary.message;
      nextSteps = [
        pauseSummary.message,
        ...(hasCaptcha && captchaResolution.twocaptcha_attempted && !captchaResolution.twocaptcha_resolved
          ? ["2Captcha was attempted, but the challenge still appeared active afterward."]
          : []),
        ...(hasCaptcha && captchaResolution.built_in_attempted && !captchaResolution.built_in_resolved
          ? ["The self-hosted captcha solver path elapsed without clearing the challenge."]
          : []),
        ...(hasDuplicateFlow
          ? ["Review existing-listing checks before final submission."]
          : []),
        ...(failedFields.length
          ? ["Inspect the failed field fills and decide whether to continue manually."]
          : []),
        ...(skippedUploads.length
          ? ["Provide or verify the skipped asset uploads before final submission."]
          : [])
      ];
      appendRunLog(runLog, "submission_paused", {
        submission_status: submissionStatus,
        policy: effectivePolicy
      });
    } else {
      reportProgress("submitting", 78, "Clicking final submit CTA.");
      const submitSnapshot = await evaluatePageSnapshot(page, "pre_submit");
      const submitCandidate = chooseFinalSubmitButton(submitSnapshot);
      if (!submitCandidate) {
        const progressAdvance = await maybeAdvanceSubmissionFlow(
          page,
          submitSnapshot,
          outputDir,
          screenshots,
          runLog,
          1
        );
        artifacts.screenshots = screenshots.slice();
        if (!progressAdvance.clicked) {
          submissionStatus = "paused_no_submit_cta";
          summaryNote = "Submission was filled but no safe final submit CTA was detected.";
          nextSteps = ["Review the final step manually and complete the submit action."];
          appendRunLog(runLog, "submit_cta_missing", {});
        } else {
          finalSnapshot = progressAdvance.snapshot;
          if (Array.isArray(finalSnapshot?.auth_hints) && finalSnapshot.auth_hints.length > 0) {
            const authAttempt = await attemptAutomatedAuth({
              page,
              jobRequest,
              brand,
              runtime,
              siteRow,
              siteProfile,
              currentUrl: sanitizeOptionalString(page.url(), 4096) || targetUrl,
              returnToUrl: sanitizeOptionalString(page.url(), 4096) || targetUrl,
              outputDir,
              screenshots,
              runLog,
              checkpointPrefix: "submit-auth-progress-step",
              snapshotLabel: "submit_post_auth_progress_step"
            });
            if (authAttempt.success && authAttempt.snapshot) {
              finalSnapshot = authAttempt.snapshot;
              artifacts.screenshots = screenshots.slice();
            } else {
              submissionStatus = "paused_for_login";
              summaryNote = "Submission paused because authentication is required after the first submit step.";
              nextSteps = ["Complete account registration or login, then continue the SaaSHub submission flow."];
              listingUrl = sanitizeOptionalString(page.url(), 4096) || null;
              appendRunLog(runLog, "submission_paused_after_progress_auth", {
                submission_status: submissionStatus
              });
            }
          }
          if (submissionStatus) {
            // Auth pause or a similar boundary was detected immediately after the progress CTA.
          } else {
          const advancedOutcome = classifySubmitOutcome(finalSnapshot);
          if (advancedOutcome === "pending_review") {
            submissionStatus = "pending_review";
            summaryNote = "Submission appears to be pending review.";
            nextSteps = ["Wait for the site to approve or moderate the listing."];
          } else if (advancedOutcome === "submitted") {
            submissionStatus = "submitted";
            summaryNote = "Submission was sent through the site flow.";
            nextSteps = ["Verify the listing result and capture the live URL if the site returns one."];
          } else {
            const followupFill = await fillSnapshotFields({
              page,
              snapshot: finalSnapshot,
              fieldSuggestions,
              availableAssets,
              assetDir,
              runLog,
              options,
              skippedUploads,
              failedFields,
              attemptedFieldKeys,
              attemptedUploadKeys
            });
            filledFieldCount += followupFill.filledFieldCount;
            uploadedAssetCount += followupFill.uploadedAssetCount;
            if (followupFill.filledFieldCount > 0 || followupFill.uploadedAssetCount > 0) {
              await page.waitForTimeout(800);
              await captureScreenshot(page, outputDir, "05-filled-step-2", screenshots, runLog);
              artifacts.screenshots = screenshots.slice();
              finalSnapshot = await evaluatePageSnapshot(page, "post_progress_fill_1");
            }
            const followupSubmitCandidate = chooseFinalSubmitButton(finalSnapshot);
            if (followupSubmitCandidate) {
              const followupLocator = page.locator(CTA_SELECTOR).nth(followupSubmitCandidate.dom_index);
              await followupLocator.click({ timeout: 5000 });
              await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
              await page.waitForTimeout(1500);
              await captureScreenshot(page, outputDir, "06-submitted", screenshots, runLog);
              artifacts.screenshots = screenshots.slice();
              finalSnapshot = await evaluatePageSnapshot(page, "post_submit_followup");
              submissionStatus = classifySubmitOutcome(finalSnapshot);
              if (submissionStatus === "pending_review") {
                summaryNote = "Submission appears to be pending review.";
                nextSteps = ["Wait for the site to approve or moderate the listing."];
              } else if (submissionStatus === "submitted") {
                summaryNote = "Submission was sent through the site flow.";
                nextSteps = ["Verify the listing result and capture the live URL if the site returns one."];
              } else {
                submissionStatus = "paused_submit_unconfirmed";
                summaryNote = "A follow-up submit CTA was clicked, but the page did not reach a clear confirmation state.";
                nextSteps = ["Review the post-submit step and continue the flow if the site requires additional inputs."];
              }
              listingUrl = sanitizeOptionalString(page.url(), 4096) || null;
              appendRunLog(runLog, "submit_clicked", {
                cta_text: followupSubmitCandidate.text,
                submission_status: submissionStatus,
                step_index: 2
              });
            } else {
              submissionStatus = "paused_multistep_continue";
              summaryNote = `Submission advanced with '${progressAdvance.candidate?.text || "continue"}' but did not reach a final confirmation state.`;
              nextSteps = [
                "The connector appears to be multi-step and needs another fill/submit pass after the progress CTA."
              ];
            }
          }
          listingUrl = sanitizeOptionalString(page.url(), 4096) || null;
          }
        }
      } else {
        const submitLocator = page.locator(CTA_SELECTOR).nth(submitCandidate.dom_index);
        await submitLocator.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await captureScreenshot(
          page,
          outputDir,
          captchaResolution.hook_attempted || captchaResolution.built_in_attempted ? "06-submitted" : "04-submitted",
          screenshots,
          runLog
        );
        artifacts.screenshots = screenshots.slice();
        finalSnapshot = await evaluatePageSnapshot(page, "post_submit");
        submissionStatus = classifySubmitOutcome(finalSnapshot);
        if (submissionStatus === "pending_review") {
          summaryNote = "Submission appears to be pending review.";
          nextSteps = ["Wait for the site to approve or moderate the listing."];
        } else if (submissionStatus === "submitted") {
          summaryNote = "Submission was sent through the site flow.";
          nextSteps = ["Verify the listing result and capture the live URL if the site returns one."];
        } else {
          submissionStatus = "paused_submit_unconfirmed";
          summaryNote = "A submit CTA was clicked, but the page did not reach a clear confirmation state.";
          nextSteps = ["Review the post-submit step and continue the flow if the site requires additional inputs."];
        }
        listingUrl = sanitizeOptionalString(page.url(), 4096) || null;
        appendRunLog(runLog, "submit_clicked", {
          cta_text: submitCandidate.text,
          submission_status: submissionStatus
        });
      }
    }

    artifacts.final_url = sanitizeOptionalString(page.url(), 4096) || null;
    reportProgress("finalizing", 92, "Saving submission evidence and result.");

    return {
      ok: true,
      result: {
        status: submissionStatus.startsWith("paused") || submissionStatus.startsWith("filled_") ? "paused" : "completed",
        summary: {
          note: summaryNote || "Directory submission flow completed."
        },
        submission_status: submissionStatus || "completed",
        submission: {
          brand_profile_id: brand.brand_profile_id,
          manifest_id: manifestRow.manifest_id,
          manifest_version: manifestRow.version,
          site_id: siteRow.site_id,
          site_name: siteRow.site_name,
          site_profile_version: siteRow.version,
          submission_policy: effectivePolicy,
          submit_url: targetUrl,
          final_url: artifacts.final_url,
          listing_url: listingUrl,
          filled_field_count: filledFieldCount,
          uploaded_asset_count: uploadedAssetCount,
          captcha_resolution: captchaResolution,
          skipped_uploads: skippedUploads,
          failed_fields: failedFields
        },
        evidence: {
          screenshots: screenshots.slice(),
          video: null
        },
        next_steps: nextSteps.filter(Boolean)
      },
      artifacts,
      runLog
    };
  } catch (error) {
    appendRunLog(runLog, "directory_submit_failed", {
      message: error?.message || "Directory submission failed"
    });
    return {
      ok: false,
      result: {
        status: "failed",
        submission_status: "failed",
        summary: {
          note: error?.message || "Directory submission failed"
        },
        evidence: {
          screenshots: screenshots.slice(),
          video: null
        },
        next_steps: ["Review the submission evidence, fix the blocking issue, and retry the run."]
      },
      artifacts,
      runLog,
      error
    };
  } finally {
    const runLogPath = writeRunLogFile(outputDir, runLog);
    if (runLogPath) {
      artifacts.run_log_path = runLogPath;
    }
    if (page) {
      try {
        const videoPath =
          videoHandle && typeof videoHandle.path === "function"
            ? sanitizeOptionalString(await videoHandle.path(), 4096)
            : null;
        if (videoPath) {
          artifacts.video_path = videoPath;
        }
      } catch {
        // Ignore video path errors.
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore teardown errors.
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore teardown errors.
      }
    }
  }
}

module.exports = {
  runDirectoryRecon,
  runAssetPrepare,
  runDirectorySubmit,
  __private: {
    applyCaptchaToken,
    attemptTwoCaptchaSolve,
    buildSelfHostedRuntimeConfig,
    chooseCandidateButton,
    classifySubmitOutcome,
    collectAvailableAssets,
    maybeAdvanceSubmissionFlow,
    materializeGeneratedAssetMap,
    resolveSelfHostedRuntimeConfig,
    detectSupportedCaptchaChallenge,
    planBlockingOverlayAction,
    parseTwoCaptchaApiResponse,
    requestTwoCaptchaToken,
    resolvePersistentProfileDir,
    resolveSubmissionAuthConfig,
    sanitizeSubmissionCredentials
  }
};
