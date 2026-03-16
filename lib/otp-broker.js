"use strict";

const DEFAULT_MAILTM_BASE_URL = "https://api.mail.tm";
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_OTP_DIGITS_MIN = 4;
const DEFAULT_OTP_DIGITS_MAX = 8;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value, maxLength = 512) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, maxLength);
}

function randomToken(size = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < size; index += 1) {
    const offset = Math.floor(Math.random() * alphabet.length);
    value += alphabet[offset];
  }
  return value;
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIso(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  } catch {
    return null;
  }
}

function parseJsonBestEffort(value) {
  if (!value) {
    return null;
  }
  if (isPlainObject(value)) {
    return value;
  }
  const raw = sanitizeString(value, 20000);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeHeaderBag(value) {
  const source = parseJsonBestEffort(value);
  if (!source) {
    return {};
  }

  const headers = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (count >= 20) {
      break;
    }
    const key = sanitizeString(rawKey, 128);
    const lowerKey = key.toLowerCase();
    if (!key || !/^[a-z0-9-]+$/i.test(key)) {
      continue;
    }
    if (["content-length", "host", "connection"].includes(lowerKey)) {
      continue;
    }
    const headerValue = sanitizeString(rawValue, 2048);
    if (!headerValue) {
      continue;
    }
    headers[key] = headerValue;
    count += 1;
  }

  return headers;
}

function extractUrls(text, limit = 20) {
  const content = sanitizeString(String(text || ""), 100000);
  if (!content) {
    return [];
  }
  const regex = /https?:\/\/[^\s<>"'`)\]]+/gi;
  const urls = [];
  let match = regex.exec(content);
  while (match && urls.length < limit) {
    const candidate = sanitizeString(match[0], 2048);
    if (candidate && !urls.includes(candidate)) {
      urls.push(candidate);
    }
    match = regex.exec(content);
  }
  return urls;
}

function extractOtpCandidates(text, options = {}) {
  const content = String(text || "");
  const minDigits = Number(options.minDigits) > 0 ? Number(options.minDigits) : DEFAULT_OTP_DIGITS_MIN;
  const maxDigits =
    Number(options.maxDigits) >= minDigits ? Number(options.maxDigits) : DEFAULT_OTP_DIGITS_MAX;
  const pattern = new RegExp(`\\b\\d{${minDigits},${maxDigits}}\\b`, "g");
  const values = [];
  let match = pattern.exec(content);
  while (match && values.length < 30) {
    const code = match[0];
    if (!values.includes(code)) {
      values.push(code);
    }
    match = pattern.exec(content);
  }
  return values;
}

function scoreOtpCandidate(code, contextText) {
  const value = String(code || "");
  if (!value) {
    return -1;
  }
  const lower = String(contextText || "").toLowerCase();
  let score = 0;

  // Typical OTP lengths are 6 then 4.
  if (value.length === 6) {
    score += 6;
  } else if (value.length === 4) {
    score += 4;
  } else {
    score += 2;
  }

  // Penalize year-like values.
  if (/^(19|20)\d{2}$/.test(value)) {
    score -= 3;
  }

  // Heuristic boost if OTP language appears near the code.
  const idx = lower.indexOf(value.toLowerCase());
  if (idx >= 0) {
    const start = Math.max(0, idx - 80);
    const end = Math.min(lower.length, idx + value.length + 80);
    const around = lower.slice(start, end);
    if (/otp|code|verification|access|security|passcode|one[-\s]?time/.test(around)) {
      score += 8;
    }
  }

  return score;
}

function extractBestOtp(payload = {}, options = {}) {
  const subject = String(payload.subject || "");
  const text = String(payload.text || "");
  const html = String(payload.html || "");
  const combined = [subject, text, html].filter(Boolean).join("\n");
  const candidates = extractOtpCandidates(combined, options);
  if (!candidates.length) {
    return null;
  }
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreOtpCandidate(candidate, combined);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function resolveFetchClient(fetchClient) {
  if (typeof fetchClient === "function") {
    return fetchClient;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error("Fetch client is unavailable. Use Node.js 18+ or pass options.fetch.");
}

function normalizeMailTmMessage(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return {
    id: sanitizeString(raw.id, 128),
    from: raw.from && typeof raw.from === "object" ? sanitizeString(raw.from.address, 320) : "",
    subject: sanitizeString(raw.subject, 1000),
    intro: sanitizeString(raw.intro, 4000),
    seen: Boolean(raw.seen),
    createdAt: toIso(raw.createdAt)
  };
}

function normalizeMailTmMessageDetail(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return {
    id: sanitizeString(raw.id, 128),
    from: raw.from && typeof raw.from === "object" ? sanitizeString(raw.from.address, 320) : "",
    to: Array.isArray(raw.to)
      ? raw.to
          .map((entry) => (entry && typeof entry === "object" ? sanitizeString(entry.address, 320) : ""))
          .filter(Boolean)
      : [],
    subject: sanitizeString(raw.subject, 1000),
    intro: sanitizeString(raw.intro, 4000),
    text: sanitizeString(raw.text, 100000),
    html: Array.isArray(raw.html) ? raw.html.join("\n") : sanitizeString(raw.html, 100000),
    seen: Boolean(raw.seen),
    createdAt: toIso(raw.createdAt)
  };
}

function createMailTmProvider(options = {}) {
  const fetchClient = resolveFetchClient(options.fetch);
  const baseUrl = sanitizeString(options.baseUrl || DEFAULT_MAILTM_BASE_URL, 1024).replace(/\/+$/, "");

  async function request(pathname, requestOptions = {}) {
    const response = await fetchClient(`${baseUrl}${pathname}`, requestOptions);
    const bodyText = await response.text();
    let json = null;
    if (bodyText) {
      try {
        json = JSON.parse(bodyText);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const message =
        (json && typeof json.message === "string" ? json.message : "") ||
        `Mail.tm request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = json;
      throw error;
    }
    return json;
  }

  async function listDomains() {
    const payload = await request("/domains");
    const members = Array.isArray(payload && payload["hydra:member"]) ? payload["hydra:member"] : [];
    return members
      .map((domain) => sanitizeString(domain && domain.domain ? domain.domain : "", 255).toLowerCase())
      .filter(Boolean);
  }

  async function createInbox(identity = {}) {
    const runTag = sanitizeString(identity.runTag || "qa", 64).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const localPartSeed = sanitizeString(identity.localPart, 120)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const identityPassword = sanitizeString(identity.password, 512);

    const domains = await listDomains();
    if (!domains.length) {
      throw new Error("Mail.tm returned no usable domains.");
    }
    const domain = domains[0];

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const suffix = `${Date.now()}${randomToken(6)}`;
      const localPart = (localPartSeed || `${runTag || "qa"}${suffix}`).replace(/[^a-z0-9]/g, "");
      const address = `${localPart.slice(0, 56)}@${domain}`.slice(0, 320);
      const password =
        identityPassword ||
        `Qa${Date.now()}${randomToken(8)}`
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 64);
      try {
        await request("/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            password
          })
        });

        const tokenPayload = await request("/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            password
          })
        });

        const token = sanitizeString(tokenPayload && tokenPayload.token ? tokenPayload.token : "", 4096);
        if (!token) {
          throw new Error("Mail.tm token response did not include a token.");
        }

        return {
          provider: "mailtm",
          email: address,
          password,
          token
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Mail.tm inbox creation failed.");
  }

  async function listMessages(inbox) {
    const token = sanitizeString(inbox && inbox.token ? inbox.token : "", 4096);
    if (!token) {
      throw new Error("Mail.tm inbox token is missing.");
    }
    const payload = await request("/messages?page=1", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const members = Array.isArray(payload && payload["hydra:member"]) ? payload["hydra:member"] : [];
    return members.map(normalizeMailTmMessage).filter(Boolean);
  }

  async function getMessage(inbox, messageId) {
    const token = sanitizeString(inbox && inbox.token ? inbox.token : "", 4096);
    const id = sanitizeString(messageId, 128);
    if (!token || !id) {
      throw new Error("Mail.tm getMessage requires token and message id.");
    }
    const payload = await request(`/messages/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const normalized = normalizeMailTmMessageDetail(payload);
    if (!normalized) {
      throw new Error("Mail.tm returned an invalid message detail payload.");
    }
    return normalized;
  }

  return {
    id: "mailtm",
    createInbox,
    listMessages,
    getMessage
  };
}

function normalizeHttpOtpInbox(raw) {
  const source = isPlainObject(raw)
    ? raw
    : isPlainObject(raw?.inbox)
      ? raw.inbox
      : isPlainObject(raw?.data)
        ? raw.data
        : null;
  if (!source) {
    return null;
  }

  const email = sanitizeString(source.email || source.address, 320).toLowerCase();
  if (!email) {
    return null;
  }

  const normalized = {
    provider: "http",
    email,
    token: sanitizeString(source.token, 4096) || null,
    password: sanitizeString(source.password, 512) || null,
    createdAt: toIso(source.createdAt || source.created_at) || null
  };

  const externalId = sanitizeString(
    source.externalId || source.external_id || source.inboxId || source.inbox_id || source.id,
    256
  );
  if (externalId) {
    normalized.externalId = externalId;
  }

  return normalized;
}

function normalizeHttpOtpWaitResult(payload = {}, options = {}) {
  const source = isPlainObject(payload?.result)
    ? payload.result
    : isPlainObject(payload?.data)
      ? payload.data
      : isPlainObject(payload)
        ? payload
        : {};

  const messageSource = isPlainObject(source.message) ? source.message : null;
  const message = messageSource
    ? {
        subject: sanitizeString(messageSource.subject, 1000),
        text: sanitizeString(messageSource.text, 100000),
        html: sanitizeString(messageSource.html, 100000)
      }
    : null;
  const status = sanitizeString(source.status, 64).toLowerCase();
  const extractedCode =
    sanitizeString(source.code, 32) ||
    (message
      ? extractBestOtp(message, {
          minDigits: options.minDigits,
          maxDigits: options.maxDigits
        })
      : null);
  const directLink =
    sanitizeString(
      source.link || source.url || source.verificationUrl || source.verification_url,
      4096
    ) || null;
  const messageUrls = message
    ? extractUrls([message.subject, message.text, message.html].filter(Boolean).join("\n"))
    : [];
  const matchedLink = options.linkPattern
    ? messageUrls.find((url) => new RegExp(String(options.linkPattern), "i").test(url)) || null
    : messageUrls[0] || null;
  const link = directLink || matchedLink || null;
  const pending =
    source.pending === true ||
    ["pending", "waiting", "queued", "processing"].includes(status);
  const ready =
    source.ok === true ||
    ["ok", "ready", "found", "complete", "completed", "success"].includes(status) ||
    Boolean(extractedCode || link);
  const error = sanitizeString(source.error || source.messageText || source.detail, 1000) || null;

  return {
    pending: !ready && pending,
    ok: ready,
    code: extractedCode || null,
    link,
    message,
    error,
    fatal: Boolean(error && !pending && !ready && (source.fatal === true || ["error", "failed"].includes(status)))
  };
}

function createHttpOtpProvider(options = {}) {
  const fetchClient = resolveFetchClient(options.fetch);
  const pollUrl = sanitizeString(
    options.hookUrl || options.pollUrl || options.url || options.httpUrl || options.providerUrl,
    2048
  );
  const createUrl = sanitizeString(
    options.createUrl || options.httpCreateUrl || options.providerCreateUrl,
    2048
  );
  const requestMethod = sanitizeString(options.method || options.httpMethod || "POST", 16).toUpperCase() || "POST";
  const baseHeaders = {
    "Content-Type": "application/json",
    ...sanitizeHeaderBag(options.headers || options.httpHeaders)
  };
  const authToken = sanitizeString(options.authToken || options.httpAuthToken, 4096);
  if (authToken && !baseHeaders.Authorization) {
    baseHeaders.Authorization = `Bearer ${authToken}`;
  }

  async function request(url, payload) {
    const response = await fetchClient(url, {
      method: requestMethod,
      headers: baseHeaders,
      body: requestMethod === "GET" ? undefined : JSON.stringify(payload || {})
    });
    const bodyText = await response.text();
    let json = null;
    if (bodyText) {
      try {
        json = JSON.parse(bodyText);
      } catch {
        json = { ok: response.ok, text: bodyText };
      }
    }
    if (!response.ok) {
      const message =
        sanitizeString(json?.error || json?.message || json?.detail, 1000) ||
        `HTTP OTP provider request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = json;
      throw error;
    }
    return isPlainObject(json) ? json : {};
  }

  async function createInbox(identity = {}) {
    const existing = normalizeHttpOtpInbox(identity);
    if (existing) {
      return existing;
    }
    if (!createUrl) {
      throw new Error("HTTP OTP provider requires an email identity or create endpoint");
    }
    const payload = await request(createUrl, {
      action: "create",
      identity
    });
    const created = normalizeHttpOtpInbox(payload);
    if (!created) {
      throw new Error("HTTP OTP provider create response did not include a usable inbox");
    }
    return created;
  }

  async function waitForOtpCode(inbox, waitOptions = {}) {
    if (!pollUrl) {
      throw new Error("HTTP OTP provider poll URL is missing");
    }

    const timeoutMs = Number(waitOptions.timeoutMs) > 0 ? Number(waitOptions.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const pollIntervalMs =
      Number(waitOptions.pollIntervalMs) > 0 ? Number(waitOptions.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    let polls = 0;
    let lastMessage = null;
    let lastError = null;

    while (Date.now() - startedAt < timeoutMs) {
      polls += 1;
      try {
        const payload = await request(pollUrl, {
          action: "poll",
          inbox,
          wait: {
            timeout_ms: timeoutMs,
            poll_interval_ms: pollIntervalMs,
            subject_pattern: waitOptions.subjectPattern || null,
            sender_pattern: waitOptions.senderPattern || null,
            link_pattern: waitOptions.linkPattern || null,
            since: waitOptions.since || null,
            min_digits: waitOptions.minDigits || null,
            max_digits: waitOptions.maxDigits || null
          },
          poll_number: polls
        });
        const normalized = normalizeHttpOtpWaitResult(payload, waitOptions);
        lastMessage = normalized.message || lastMessage;
        if (normalized.ok) {
          return {
            ok: true,
            code: normalized.code || null,
            link: normalized.link || null,
            message: normalized.message || lastMessage,
            polls,
            elapsedMs: Date.now() - startedAt
          };
        }
        if (normalized.fatal) {
          return {
            ok: false,
            code: null,
            link: null,
            message: normalized.message || lastMessage,
            polls,
            elapsedMs: Date.now() - startedAt,
            error: normalized.error || "HTTP OTP provider returned a fatal error"
          };
        }
        lastError = normalized.error || null;
      } catch (error) {
        lastError = error?.message || String(error);
      }
      await sleep(pollIntervalMs);
    }

    return {
      ok: false,
      code: null,
      link: null,
      message: lastMessage,
      polls,
      elapsedMs: Date.now() - startedAt,
      error: lastError || "Timed out waiting for OTP message"
    };
  }

  return {
    id: "http",
    createInbox,
    waitForOtpCode
  };
}

function resolveProvider(providerName, options = {}) {
  const normalized = sanitizeString(providerName || options.provider || "", 64).toLowerCase();
  if (!normalized || normalized === "none" || normalized === "disabled") {
    return null;
  }
  if (["mailtm", "mail.tm", "mail_tm"].includes(normalized)) {
    return createMailTmProvider(options);
  }
  if (["http", "hook", "webhook"].includes(normalized)) {
    return createHttpOtpProvider(options);
  }
  throw new Error(`Unsupported OTP provider: ${providerName}`);
}

function selectMostRecentMessage(messages, options = {}) {
  const subjectRegex =
    options.subjectPattern instanceof RegExp
      ? options.subjectPattern
      : options.subjectPattern
        ? new RegExp(String(options.subjectPattern), "i")
        : null;
  const senderRegex =
    options.senderPattern instanceof RegExp
      ? options.senderPattern
      : options.senderPattern
        ? new RegExp(String(options.senderPattern), "i")
        : null;
  const since = options.since ? new Date(options.since) : null;

  const filtered = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== "object" || !message.id) {
      continue;
    }
    if (since && message.createdAt) {
      const messageDate = new Date(message.createdAt);
      if (Number.isFinite(messageDate.getTime()) && messageDate < since) {
        continue;
      }
    }
    if (subjectRegex && !subjectRegex.test(String(message.subject || ""))) {
      continue;
    }
    if (senderRegex && !senderRegex.test(String(message.from || ""))) {
      continue;
    }
    filtered.push(message);
  }

  filtered.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return filtered[0] || null;
}

async function waitForOtp(inbox, provider, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const pollIntervalMs =
    Number(options.pollIntervalMs) > 0 ? Number(options.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  let polls = 0;
  let lastMessage = null;
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    polls += 1;
    try {
      const messages = await provider.listMessages(inbox);
      const selected = selectMostRecentMessage(messages, {
        subjectPattern: options.subjectPattern,
        senderPattern: options.senderPattern,
        since: options.since
      });
      if (selected && selected.id) {
        const detail = await provider.getMessage(inbox, selected.id);
        lastMessage = detail;
        const otpCode = extractBestOtp(detail, {
          minDigits: options.minDigits,
          maxDigits: options.maxDigits
        });
        const urls = extractUrls([detail.subject, detail.text, detail.html].join("\n"));
        const matchedLink = options.linkPattern
          ? urls.find((url) => new RegExp(String(options.linkPattern), "i").test(url)) || null
          : urls[0] || null;
        if (otpCode || matchedLink) {
          return {
            ok: true,
            code: otpCode || null,
            link: matchedLink || null,
            message: detail,
            polls,
            elapsedMs: Date.now() - startedAt
          };
        }
      }
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    code: null,
    link: null,
    message: lastMessage,
    polls,
    elapsedMs: Date.now() - startedAt,
    error: lastError ? lastError.message || String(lastError) : "Timed out waiting for OTP message"
  };
}

function createOtpBroker(options = {}) {
  const provider = resolveProvider(options.provider || process.env.QA_OTP_PROVIDER, {
    fetch: options.fetch,
    baseUrl: options.mailtmBaseUrl || process.env.QA_OTP_MAILTM_BASE_URL || DEFAULT_MAILTM_BASE_URL,
    url:
      options.httpUrl ||
      options.providerUrl ||
      process.env.QA_OTP_PROVIDER_URL ||
      process.env.QA_OTP_PROVIDER_POLL_URL,
    createUrl: options.httpCreateUrl || process.env.QA_OTP_PROVIDER_CREATE_URL,
    headers: options.httpHeaders || process.env.QA_OTP_PROVIDER_HEADERS,
    authToken: options.httpAuthToken || process.env.QA_OTP_PROVIDER_AUTH_TOKEN,
    method: options.httpMethod || process.env.QA_OTP_PROVIDER_METHOD
  });

  if (!provider) {
    return {
      enabled: false,
      provider: "none",
      async createIdentity() {
        return null;
      },
      async waitForOtpCode() {
        return {
          ok: false,
          code: null,
          link: null,
          message: null,
          polls: 0,
          elapsedMs: 0,
          error: "OTP broker disabled"
        };
      }
    };
  }

  return {
    enabled: true,
    provider: provider.id,
    async createIdentity(identity = {}) {
      const inbox = await provider.createInbox(identity);
      return {
        ...inbox,
        createdAt: new Date().toISOString()
      };
    },
    async waitForOtpCode(inbox, waitOptions = {}) {
      if (typeof provider.waitForOtpCode === "function") {
        return provider.waitForOtpCode(inbox, waitOptions);
      }
      return waitForOtp(inbox, provider, waitOptions);
    }
  };
}

module.exports = {
  createOtpBroker,
  __private: {
    extractUrls,
    extractOtpCandidates,
    extractBestOtp,
    scoreOtpCandidate,
    selectMostRecentMessage,
    createMailTmProvider,
    createHttpOtpProvider,
    normalizeHttpOtpWaitResult,
    waitForOtp
  }
};
