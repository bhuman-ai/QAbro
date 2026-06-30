"use strict";

const { createOtpBroker } = require("./otp-broker");
const { sanitizeOptionalString, sanitizeString } = require("./qa-core");

const DEFAULT_MANUAL_OTP_TIMEOUT_MS = 120000;
const DEFAULT_OTP_TIMEOUT_MS = 180000;
const DEFAULT_OTP_POLL_INTERVAL_MS = 5000;
const DEFAULT_LOCATOR_POLL_INTERVAL_MS = 100;

function randomToken(size = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < size; index += 1) {
    const offset = Math.floor(Math.random() * alphabet.length);
    value += alphabet[offset];
  }
  return value;
}

function pushRunLog(runLog, event, details = {}) {
  if (!Array.isArray(runLog)) {
    return;
  }
  runLog.push({
    timestamp: new Date().toISOString(),
    event: sanitizeString(event, 128) || "auth_progress",
    details: details && typeof details === "object" ? details : {}
  });
  if (typeof runLog.__progressHook === "function") {
    try {
      const maybePromise = runLog.__progressHook(runLog[runLog.length - 1], runLog.slice());
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore hook failures.
    }
  }
}

async function captureCheckpoint(options, label, page) {
  if (!options || typeof options.captureCheckpoint !== "function") {
    return;
  }
  try {
    await options.captureCheckpoint(label, page);
  } catch {
    // Checkpoint capture should never break auth.
  }
}

function parsePositiveInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return Math.floor(parsed);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function looksLikeGoogleAuthUrl(value) {
  const url = sanitizeString(value, 4096).toLowerCase();
  return url.includes("accounts.google.com") || url.includes("google.com/signin");
}

function looksLikeSignupUrl(value) {
  const url = sanitizeString(value, 4096).toLowerCase();
  return /\/(sign[\-_ ]?up|register|create[\-_ ]account|join)(?:[/?#]|$)/.test(url);
}

function isGoogleAuthRequirement(value) {
  const safe = sanitizeString(value, 128).toLowerCase();
  return safe.includes("google");
}

function parseBoolean(value, fallbackValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallbackValue;
}

function shouldAutoCreateAccount(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const authPolicy = sanitizeString(metadata.auth_policy || metadata.authPolicy, 64).toLowerCase();
  if (["public_only", "public-only", "disabled", "none", "off"].includes(authPolicy)) {
    return false;
  }
  if (
    [
      "signup_if_needed",
      "sign_up_if_needed",
      "auto_signup",
      "auto-signup",
      "auto_create_account",
      "auto-create-account",
      "create_account_if_needed",
      "create-account-if-needed"
    ].includes(authPolicy)
  ) {
    return true;
  }
  if (parseBoolean(metadata.auto_create_account ?? metadata.autoCreateAccount, false)) {
    return true;
  }
  if (isPlainObject(runRequest?.credentials)) {
    return false;
  }
  const scopeMode = sanitizeString(runRequest?.scope_mode, 64).toLowerCase();
  return scopeMode === "feature_targeted" || scopeMode === "deep_45m";
}

function buildGeneratedPassword(runRequest, metadata = {}) {
  return (
    sanitizeOptionalString(
      metadata.default_auth_password ||
        metadata.defaultAuthPassword ||
        process.env.QA_DEFAULT_ACCOUNT_PASSWORD,
      256
    ) ||
    `SwarmTest!${String(Date.now()).slice(-6)}${randomToken(4)}A`
  );
}

function buildGeneratedFullName(runRequest, metadata = {}) {
  return (
    sanitizeOptionalString(
      metadata.default_auth_name ||
        metadata.defaultAuthName ||
        process.env.QA_DEFAULT_ACCOUNT_NAME,
      128
    ) ||
    "Swarm Tester"
  );
}

function buildGeneratedPhone(runRequest, metadata = {}) {
  return (
    sanitizeOptionalString(
      metadata.default_auth_phone ||
        metadata.defaultAuthPhone ||
        process.env.QA_DEFAULT_ACCOUNT_PHONE,
      64
    ) ||
    "6505550100"
  );
}

function splitGeneratedName(fullName) {
  const safeFullName = sanitizeOptionalString(fullName, 128) || "Swarm Tester";
  const parts = safeFullName.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return {
      firstName: "Swarm",
      lastName: "Tester"
    };
  }
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "Tester"
    };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function resolveNameParts(values = {}) {
  const explicitFirstName = sanitizeOptionalString(values.firstName, 64) || "";
  const explicitLastName = sanitizeOptionalString(values.lastName, 64) || "";
  const fallbackParts = splitGeneratedName(values.fullName);
  return {
    firstName: explicitFirstName || fallbackParts.firstName,
    lastName: explicitLastName || fallbackParts.lastName
  };
}

function normalizeHandleCandidate(value) {
  const normalized = sanitizeString(value, 128)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || "";
}

function buildGeneratedAccountHandle(runRequest, metadata = {}, fallbackUsername = null) {
  const explicitHandle =
    sanitizeOptionalString(
      metadata.default_auth_handle ||
        metadata.defaultAuthHandle ||
        process.env.QA_DEFAULT_ACCOUNT_HANDLE,
      320
    ) || "";

  const preferred = explicitHandle || sanitizeOptionalString(fallbackUsername, 320) || "";

  const preferredLocalPart = preferred.includes("@") ? preferred.split("@")[0] : preferred;
  const preferredDomainLabel = preferred.includes("@")
    ? sanitizeString(preferred.split("@")[1]?.split(".")[0], 64)
    : "";
  const normalizedPreferred = normalizeHandleCandidate(preferredLocalPart);
  const normalizedDomainLabel = normalizeHandleCandidate(preferredDomainLabel);
  if (normalizedPreferred) {
    if (!explicitHandle && normalizedDomainLabel && normalizedDomainLabel !== normalizedPreferred) {
      return `${normalizedPreferred}_${normalizedDomainLabel}`.slice(0, 32);
    }
    return normalizedPreferred.slice(0, 32);
  }

  const runIdFragment =
    sanitizeString(runRequest?.run_id, 64)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(-18) || randomToken(8);
  return `swarmtester_${runIdFragment}`.slice(0, 32);
}

function fieldPrefersHandle(fieldMeta = {}) {
  const safeMeta = isPlainObject(fieldMeta) ? fieldMeta : {};
  const combined = [
    safeMeta.label,
    safeMeta.name,
    safeMeta.id,
    safeMeta.placeholder,
    safeMeta.autocomplete,
    safeMeta.title,
    safeMeta.ariaLabel
  ]
    .map((value) => sanitizeString(value, 256).toLowerCase())
    .filter(Boolean)
    .join(" ");
  const pattern = sanitizeString(safeMeta.pattern, 512).toLowerCase();

  if (!combined && !pattern) {
    return false;
  }
  if (/\b(username|user\s*name|login|handle|screen\s*name)\b/.test(combined)) {
    return true;
  }
  if (/\b(full\s*name|first\s*name|last\s*name|display\s*name|your\s*name)\b/.test(combined)) {
    return false;
  }
  if ((combined === "name" || /\bname\b/.test(combined)) && /\b(letter|letters|number|numbers|underscore|underscores|alphanumeric|alpha[-\s]?numeric)\b/.test(combined)) {
    return true;
  }
  if (pattern && !pattern.includes("\\s") && !pattern.includes(" ")) {
    return true;
  }
  return combined === "name";
}

async function describeInputField(locator) {
  if (!locator || typeof locator.evaluate !== "function") {
    return {};
  }
  try {
    return await locator.evaluate((element) => {
      if (!element) {
        return {};
      }
      const read = (value) => (typeof value === "string" ? value.trim() : "");
      const labelText = (() => {
        const id = read(element.getAttribute("id"));
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (label) {
            return read(label.textContent);
          }
        }
        const wrappedLabel = element.closest("label");
        return wrappedLabel ? read(wrappedLabel.textContent) : "";
      })();
      return {
        label: labelText,
        name: read(element.getAttribute("name")),
        id: read(element.getAttribute("id")),
        placeholder: read(element.getAttribute("placeholder")),
        autocomplete: read(element.getAttribute("autocomplete")),
        pattern: read(element.getAttribute("pattern")),
        title: read(element.getAttribute("title")),
        ariaLabel: read(element.getAttribute("aria-label"))
      };
    });
  } catch {
    return {};
  }
}

function buildGeneratedEmail(runRequest, metadata = {}) {
  const configured =
    sanitizeOptionalString(
      metadata.default_auth_email ||
        metadata.defaultAuthEmail ||
        process.env.QA_DEFAULT_ACCOUNT_EMAIL,
      320
    ) || null;
  if (configured) {
    return configured;
  }
  const runIdFragment =
    sanitizeString(runRequest?.run_id, 64)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(-18) || randomToken(6);
  return `swarmtester+${runIdFragment}${randomToken(4)}@example.com`;
}

async function isLocatorVisible(locator) {
  if (!locator || typeof locator.isVisible !== "function") {
    return false;
  }
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function expandLocatorCandidates(locator, maxCandidates = 8) {
  if (!locator || typeof locator.count !== "function") {
    return locator ? [locator] : [];
  }
  try {
    const count = await locator.count();
    if (!Number.isFinite(count) || count <= 0) {
      return [locator];
    }
    const limit = Math.min(count, maxCandidates);
    const candidates = [];
    for (let index = 0; index < limit; index += 1) {
      candidates.push(locator.nth(index));
    }
    return candidates;
  } catch {
    return [locator];
  }
}

async function isLocatorActionable(locator) {
  if (!(await isLocatorVisible(locator))) {
    return false;
  }
  try {
    if (typeof locator.scrollIntoViewIfNeeded === "function") {
      await locator.scrollIntoViewIfNeeded();
    }
  } catch {
    // Ignore scroll failures.
  }
  try {
    return await locator.evaluate((element) => {
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const pointX = rect.left + Math.min(rect.width / 2, Math.max(rect.width - 1, 0));
      const pointY = rect.top + Math.min(rect.height / 2, Math.max(rect.height - 1, 0));
      const topElement = document.elementFromPoint(pointX, pointY);
      return Boolean(topElement && (topElement === element || element.contains(topElement)));
    });
  } catch {
    return true;
  }
}

async function firstVisibleLocator(locators, timeout = 1200) {
  const deadline = Date.now() + Math.max(Number(timeout) || 0, 0);
  let fallbackLocator = null;
  while (true) {
    for (const locator of Array.isArray(locators) ? locators : []) {
      const candidates = await expandLocatorCandidates(locator);
      for (const candidate of candidates) {
        if (!(await isLocatorVisible(candidate))) {
          continue;
        }
        fallbackLocator = fallbackLocator || candidate;
        if (await isLocatorActionable(candidate)) {
          return candidate;
        }
      }
    }

    if (fallbackLocator) {
      return fallbackLocator;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return null;
    }

    await sleep(Math.min(DEFAULT_LOCATOR_POLL_INTERVAL_MS, remainingMs));
  }
}

function fieldLooksLikeEmail(fieldMeta = {}) {
  const safeMeta = isPlainObject(fieldMeta) ? fieldMeta : {};
  const combined = [
    safeMeta.label,
    safeMeta.name,
    safeMeta.id,
    safeMeta.placeholder,
    safeMeta.autocomplete,
    safeMeta.title,
    safeMeta.ariaLabel
  ]
    .map((value) => sanitizeString(value, 256).toLowerCase())
    .filter(Boolean)
    .join(" ");
  return /\b(email|e-mail|work email|email address)\b/.test(combined);
}

async function firstVisibleDistinctLocator(locators, excludedLocators = [], timeout = 1200) {
  const deadline = Date.now() + Math.max(Number(timeout) || 0, 0);
  const exclusions = (Array.isArray(excludedLocators) ? excludedLocators : []).filter(Boolean);
  let fallbackLocator = null;

  while (true) {
    for (const locator of Array.isArray(locators) ? locators : []) {
      const candidates = await expandLocatorCandidates(locator);
      for (const candidate of candidates) {
        if (!(await isLocatorVisible(candidate))) {
          continue;
        }

        const candidateMeta = await describeInputField(candidate);
        if (fieldLooksLikeEmail(candidateMeta) && exclusions.includes("email_like")) {
          continue;
        }

        fallbackLocator = fallbackLocator || candidate;
        if (await isLocatorActionable(candidate)) {
          return candidate;
        }
      }
    }

    if (fallbackLocator) {
      return fallbackLocator;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return null;
    }

    await sleep(Math.min(DEFAULT_LOCATOR_POLL_INTERVAL_MS, remainingMs));
  }
}

async function hasVisibleLocator(locators, timeout = 1200) {
  return Boolean(await firstVisibleLocator(locators, timeout));
}

async function clickBestEffort(locator, options = {}) {
  if (!locator || typeof locator.click !== "function") {
    return false;
  }
  const candidates = await expandLocatorCandidates(locator);
  for (const candidate of candidates) {
    try {
      if (typeof candidate.scrollIntoViewIfNeeded === "function") {
        await candidate.scrollIntoViewIfNeeded();
      }
    } catch {
      // Ignore scroll failures.
    }
    try {
      await candidate.click({
        timeout: Number.isFinite(options.timeout) ? options.timeout : 5000,
        force: options.force === true
      });
      return true;
    } catch {
      // Try the next matching element.
    }
  }
  return false;
}

async function submitFormBestEffort(locator) {
  if (!locator || typeof locator.evaluate !== "function") {
    return false;
  }
  try {
    return await locator.evaluate((element) => {
      if (!element || typeof element !== "object") {
        return false;
      }
      const form =
        element instanceof HTMLButtonElement || element instanceof HTMLInputElement
          ? element.form
          : element instanceof Element
            ? element.closest("form")
            : null;
      if (!form) {
        return false;
      }
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
        return true;
      }
      if (typeof form.submit === "function") {
        form.submit();
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

async function fillBestEffort(locator, value, options = {}) {
  if (!locator || typeof locator.fill !== "function") {
    return false;
  }
  const safeValue = value === undefined || value === null ? "" : String(value);
  const candidates = await expandLocatorCandidates(locator);
  for (const candidate of candidates) {
    try {
      if (typeof candidate.scrollIntoViewIfNeeded === "function") {
        await candidate.scrollIntoViewIfNeeded();
      }
    } catch {
      // Ignore scroll failures.
    }
    try {
      await candidate.fill(safeValue, {
        timeout: Number.isFinite(options.timeout) ? options.timeout : 6000
      });
      return true;
    } catch {
      try {
        await candidate.click({
          timeout: Number.isFinite(options.timeout) ? options.timeout : 3000
        });
        if (typeof candidate.press === "function") {
          await candidate.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        }
        await candidate.fill(safeValue, {
          timeout: Number.isFinite(options.timeout) ? options.timeout : 6000
        });
        return true;
      } catch {
        // Try the next matching element.
      }
    }
  }
  return false;
}

function buildAuthLocators(page) {
  return {
    authEntry: [
      page.getByRole("button", { name: /sign\s*in|log\s*in/i }),
      page.getByRole("link", { name: /sign\s*in|log\s*in/i }),
      page.locator(
        [
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'a:has-text("Sign in")',
          'a:has-text("Log in")'
        ].join(",")
      )
    ],
    signupEntry: [
      page.getByRole("button", { name: /sign\s*up|create account|register/i }),
      page.getByRole("link", { name: /sign\s*up|create account|register/i }),
      page.locator(
        [
          'button:has-text("Sign up")',
          'button:has-text("Create account")',
          'button:has-text("Register")',
          'a:has-text("Sign up")',
          'a:has-text("Create account")',
          'a:has-text("Register")'
        ].join(",")
      )
    ],
    onboardingEntry: [
      page.getByRole("button", { name: /get started|start building|start free|try free|start now/i }),
      page.getByRole("link", { name: /get started|start building|start free|try free|start now/i }),
      page.locator(
        [
          'button:has-text("Get started")',
          'button:has-text("Start building")',
          'button:has-text("Start free")',
          'button:has-text("Try free")',
          'a:has-text("Get started")',
          'a:has-text("Start building")'
        ].join(",")
      )
    ],
    fullName: [
      page.getByLabel(/full\s*name|display\s*name|your\s*name/i),
      page.getByPlaceholder(/full\s*name|display\s*name|your\s*name/i),
      page.getByLabel(/^name$/i),
      page.getByPlaceholder(/^name$/i),
      page.locator(
        'input[name*="full" i],input[id*="full" i],input[name="name" i],input[id="name" i],input[autocomplete="name" i]'
      )
    ],
    firstName: [
      page.getByLabel(/first\s*name|given\s*name/i),
      page.getByPlaceholder(/first\s*name|given\s*name/i),
      page.locator(
        'input[name*="first" i],input[id*="first" i],input[name*="given" i],input[id*="given" i],input[autocomplete="given-name" i]'
      )
    ],
    lastName: [
      page.getByLabel(/last\s*name|family\s*name|surname/i),
      page.getByPlaceholder(/last\s*name|family\s*name|surname/i),
      page.locator(
        'input[name*="last" i],input[id*="last" i],input[name*="family" i],input[id*="family" i],input[name*="surname" i],input[id*="surname" i],input[autocomplete="family-name" i]'
      )
    ],
    email: [
      page.getByLabel(/email|email address|work email|e-mail/i),
      page.getByPlaceholder(/email|email address|work email|e-mail/i),
      page.locator(
        'input[type="email"],input[name*="email" i],input[id*="email" i],input[autocomplete="email" i]'
      )
    ],
    phone: [
      page.getByLabel(/phone|mobile|telephone/i),
      page.getByPlaceholder(/phone|mobile|telephone/i),
      page.locator(
        'input[type="tel"],input[name*="phone" i],input[id*="phone" i],input[name*="mobile" i],input[id*="mobile" i],input[name*="telephone" i],input[id*="telephone" i],input[autocomplete="tel" i]'
      )
    ],
    username: [
      page.getByLabel(/username|user name|login/i),
      page.getByPlaceholder(/username|user name|login/i),
      page.locator('input[name*="user" i],input[id*="user" i],input[autocomplete="username" i]')
    ],
    usernameFallback: [
      page.locator(
        [
          'form input[type="text"]:not([placeholder*="search" i]):not([placeholder*="url" i]):not([placeholder*="website" i]):not([placeholder*="site" i]):not([name*="search" i]):not([id*="search" i]):not([name*="url" i]):not([id*="url" i]):not([name*="site" i]):not([id*="site" i])',
          'form input:not([type]):not([placeholder*="search" i]):not([placeholder*="url" i]):not([placeholder*="website" i]):not([placeholder*="site" i]):not([name*="search" i]):not([id*="search" i]):not([name*="url" i]):not([id*="url" i]):not([name*="site" i]):not([id*="site" i])'
        ].join(",")
      )
    ],
    password: [
      page.getByLabel(/^password$/i),
      page.getByPlaceholder(/^password$/i),
      page.locator('input[type="password"],input[name*="password" i],input[id*="password" i]')
    ],
    confirmPassword: [
      page.getByLabel(/confirm|re-?enter|repeat/i),
      page.getByPlaceholder(/confirm|re-?enter|repeat/i),
      page.locator(
        'input[name*="confirm" i],input[id*="confirm" i],input[name*="confirmation" i],input[id*="confirmation" i]'
      )
    ],
    signInSubmit: [
      page.getByRole("button", { name: /sign\s*in|log\s*in/i }),
      page.locator('button:has-text("Sign in"),button:has-text("Log in")')
    ],
    signUpSubmit: [
      page.locator(
        [
          'button[type="submit"]:has-text("Sign up")',
          'button[type="submit"]:has-text("Create account")',
          'button[type="submit"]:has-text("Register")',
          'input[type="submit"][value*="Sign up" i]',
          'input[type="submit"][value*="Create account" i]',
          'input[type="submit"][value*="Register" i]'
        ].join(",")
      )
    ],
    submit: [
      page.locator('button[type="submit"],input[type="submit"]'),
      page.getByRole("button", {
        name: /sign\s*in|log\s*in|sign\s*up|register|create account|continue|next|submit|send code|verify|confirm|allow|authorize|get started/i
      }),
      page.locator(
        [
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button:has-text("Sign up")',
          'button:has-text("Register")',
          'button:has-text("Continue")',
          'button:has-text("Next")',
          'button:has-text("Send code")',
          'button:has-text("Verify")'
        ].join(",")
      )
    ],
    google: [
      page.getByRole("button", { name: /continue with google|sign in with google|google/i }),
      page.getByRole("link", { name: /continue with google|sign in with google|google/i }),
      page.locator(
        [
          'button:has-text("Continue with Google")',
          'button:has-text("Sign in with Google")',
          'a:has-text("Continue with Google")',
          'a:has-text("Sign in with Google")',
          '[role="button"]:has-text("Google")'
        ].join(",")
      )
    ]
  };
}

function buildOtpLocators(page) {
  return [
    page.getByLabel(/otp|code|verification|passcode|one[-\s]?time/i),
    page.getByPlaceholder(/otp|code|verification|passcode|one[-\s]?time/i),
    page.locator(
      [
        'input[autocomplete="one-time-code" i]',
        'input[inputmode="numeric"]',
        'input[inputmode="decimal"]',
        'input[inputmode="tel"]',
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[name*="pin" i]',
        'input[id*="pin" i]',
        'input[name*="code" i]',
        'input[id*="code" i]',
        'input[maxlength="1"][inputmode]'
      ].join(",")
    )
  ];
}

async function detectOtpRequiredUi(page) {
  return hasVisibleLocator(buildOtpLocators(page), 1200);
}

async function waitForOtpRequiredUi(page, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await detectOtpRequiredUi(page)) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function detectCaptchaRequiredUi(page) {
  return hasVisibleLocator(
    [
      page.getByText(/i'?m not a robot|captcha|recaptcha|hcaptcha/i),
      page.locator("iframe[src*='recaptcha'],iframe[src*='hcaptcha'],iframe[src*='challenges.cloudflare.com']"),
      page.locator(".g-recaptcha,.h-captcha,.cf-turnstile,[data-sitekey],[data-site-key]")
    ],
    1200
  );
}

async function shouldAttemptCaptchaResolution(page, options = {}, context = {}) {
  const uiVisible = await detectCaptchaRequiredUi(page);
  let challengeDetected = false;
  if (typeof options.hasCaptchaChallenge === "function") {
    try {
      challengeDetected = (await options.hasCaptchaChallenge(page, context)) === true;
    } catch {
      challengeDetected = false;
    }
  }

  return {
    shouldResolve: uiVisible || challengeDetected,
    source: uiVisible ? "visible_ui" : challengeDetected ? "challenge_probe" : null
  };
}

async function authSurfaceStillVisible(page) {
  const locators = buildAuthLocators(page);
  return hasVisibleLocator(
    [
      ...locators.fullName,
      ...locators.firstName,
      ...locators.lastName,
      ...locators.email,
      ...locators.phone,
      ...locators.username,
      ...locators.password,
      ...locators.signupEntry,
      page.getByRole("button", { name: /sign\s*in|log\s*in|sign\s*up|register|continue with google|google/i })
    ],
    1000
  );
}

async function collectAuthFailureSignals(page) {
  if (!page || typeof page.evaluate !== "function") {
    return { invalidFields: [], errorTexts: [] };
  }

  try {
    return await page.evaluate(() => {
      const read = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 240) : "");
      const labelFor = (element) => {
        if (!element || !(element instanceof HTMLElement)) {
          return "";
        }
        const id = read(element.getAttribute("id"));
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (label) {
            return read(label.textContent);
          }
        }
        const wrapped = element.closest("label");
        return wrapped ? read(wrapped.textContent) : "";
      };
      const invalidFields = Array.from(document.querySelectorAll("input, textarea, select"))
        .filter((element) => typeof element.checkValidity === "function" && element.checkValidity() === false)
        .map((element) => ({
          label: labelFor(element),
          name: read(element.getAttribute("name")),
          type: read(element.getAttribute("type")) || element.tagName.toLowerCase(),
          validationMessage: read(element.validationMessage)
        }))
        .filter((field) => field.label || field.name || field.validationMessage)
        .slice(0, 8);
      const errorTexts = Array.from(
        document.querySelectorAll(
          [
            "[role='alert']",
            "[aria-live='assertive']",
            ".alert",
            ".notification",
            ".message",
            ".notice",
            ".flash",
            ".error",
            ".errors",
            ".invalid-feedback",
            ".form-error",
            ".field-error",
            "[class*='alert']",
            "[class*='error']",
            "[class*='notice']",
            "[class*='notification']"
          ].join(",")
        )
      )
        .map((element) => read(element.textContent))
        .filter(Boolean)
        .slice(0, 8);
      return { invalidFields, errorTexts };
    });
  } catch {
    return { invalidFields: [], errorTexts: [] };
  }
}

async function restoreAuthFormValuesAfterCaptcha(page, locators, values = {}, options = {}) {
  if (!page || !locators || !isPlainObject(values)) {
    return { restored: [], attempts: 0 };
  }

  const timeout = Number.isFinite(options.timeout) ? options.timeout : 6000;
  const restored = [];
  let attempts = 0;
  const { firstName, lastName } = resolveNameParts(values);
  const shouldFillNameFields = values.allowNameFields === true || values.autoCreateAccount === true;

  const fullNameInput = shouldFillNameFields ? await firstVisibleLocator(locators.fullName, 1200) : null;
  const firstNameInput = shouldFillNameFields ? await firstVisibleLocator(locators.firstName, 1200) : null;
  const lastNameInput = shouldFillNameFields ? await firstVisibleLocator(locators.lastName, 1200) : null;
  const phoneInput = shouldFillNameFields ? await firstVisibleLocator(locators.phone, 1200) : null;
  const emailInput = await firstVisibleLocator(locators.email, 1200);
  const usernameInput = await firstVisibleDistinctLocator(
    locators.username,
    emailInput ? ["email_like"] : [],
    1200
  );
  const usernameFallbackInput =
    !emailInput && !usernameInput && !fullNameInput && !firstNameInput && !lastNameInput
      ? await firstVisibleLocator(locators.usernameFallback, 1200)
      : null;
  const accountIdentifierInput = emailInput || usernameInput || usernameFallbackInput;
  const passwordInput = values.password ? await firstVisibleLocator(locators.password, 1200) : null;
  const confirmPasswordInput = values.password ? await firstVisibleLocator(locators.confirmPassword, 1200) : null;

  if (shouldFillNameFields && firstName && firstNameInput) {
    attempts += 1;
    if (await fillBestEffort(firstNameInput, firstName, { timeout })) {
      restored.push("first_name");
    }
  }

  if (shouldFillNameFields && lastName && lastNameInput) {
    attempts += 1;
    if (await fillBestEffort(lastNameInput, lastName, { timeout })) {
      restored.push("last_name");
    }
  }

  if (shouldFillNameFields && fullNameInput) {
    const fullNameField = await describeInputField(fullNameInput);
    const fullNameValue = fieldPrefersHandle(fullNameField) ? values.accountHandle : values.fullName;
    if (fullNameValue) {
      attempts += 1;
      if (await fillBestEffort(fullNameInput, fullNameValue, { timeout })) {
        restored.push("full_name");
      }
    }
  }

  if (shouldFillNameFields && values.phone && phoneInput) {
    attempts += 1;
    if (await fillBestEffort(phoneInput, values.phone, { timeout })) {
      restored.push("phone");
    }
  }

  if (values.username && accountIdentifierInput) {
    attempts += 1;
    if (await fillBestEffort(accountIdentifierInput, values.username, { timeout })) {
      restored.push(emailInput ? "email" : "username");
    }
  }

  if (values.accountHandle && usernameInput) {
    attempts += 1;
    if (await fillBestEffort(usernameInput, values.accountHandle, { timeout })) {
      restored.push("username");
    }
  }

  if (values.password && passwordInput) {
    attempts += 1;
    if (await fillBestEffort(passwordInput, values.password, { timeout })) {
      restored.push("password");
    }
  }

  if (values.password && confirmPasswordInput) {
    attempts += 1;
    if (await fillBestEffort(confirmPasswordInput, values.password, { timeout })) {
      restored.push("confirm_password");
    }
  }

  return {
    restored,
    attempts
  };
}

function escapeRegex(value) {
  return sanitizeString(value, 240).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssAttributeValue(value) {
  return sanitizeString(value, 320).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function retryInvalidAuthFields(page, failureSignals, locators, values = {}, options = {}) {
  if (!page || !locators || !isPlainObject(values)) {
    return { retried: false, restored: [] };
  }

  const invalidFields = Array.isArray(failureSignals?.invalidFields) ? failureSignals.invalidFields : [];
  if (!invalidFields.length) {
    return { retried: false, restored: [] };
  }

  const timeout = Number.isFinite(options.timeout) ? options.timeout : 6000;
  const restored = [];
  const { firstName, lastName } = resolveNameParts(values);

  for (const field of invalidFields) {
    const fieldName = sanitizeOptionalString(field?.name, 240) || "";
    const fieldLabel = sanitizeOptionalString(field?.label, 240) || "";
    const fieldType = sanitizeString(field?.type, 64).toLowerCase();
    const haystack = `${fieldName} ${fieldLabel} ${fieldType}`.toLowerCase();
    const candidates = [];

    if (fieldName) {
      const safeName = escapeCssAttributeValue(fieldName);
      candidates.push(page.locator(`input[name="${safeName}"],textarea[name="${safeName}"],select[name="${safeName}"]`));
    }
    if (fieldLabel) {
      candidates.push(page.getByLabel(new RegExp(escapeRegex(fieldLabel), "i")));
    }
    if (haystack.includes("email")) {
      candidates.push(...locators.email);
    } else if (/\b(first|given)\b/.test(haystack)) {
      candidates.push(...locators.firstName);
    } else if (/\b(last|family|surname)\b/.test(haystack)) {
      candidates.push(...locators.lastName);
    } else if (haystack.includes("phone") || haystack.includes("mobile") || haystack.includes("telephone")) {
      candidates.push(...locators.phone);
    } else if (haystack.includes("confirm")) {
      candidates.push(...locators.confirmPassword);
    } else if (haystack.includes("password")) {
      candidates.push(...locators.password);
    } else if (haystack.includes("username")) {
      candidates.push(...locators.username);
    } else if (haystack.includes("name")) {
      candidates.push(...locators.fullName, ...locators.username);
    }

    const locator = await firstVisibleLocator(candidates, 1200);
    if (!locator) {
      continue;
    }

    let value = "";
    let key = "";
    if (haystack.includes("email")) {
      value = values.username || "";
      key = "email";
    } else if (/\b(first|given)\b/.test(haystack)) {
      value = firstName || "";
      key = "first_name";
    } else if (/\b(last|family|surname)\b/.test(haystack)) {
      value = lastName || "";
      key = "last_name";
    } else if (haystack.includes("phone") || haystack.includes("mobile") || haystack.includes("telephone")) {
      value = values.phone || "";
      key = "phone";
    } else if (haystack.includes("confirm")) {
      value = values.password || "";
      key = "confirm_password";
    } else if (haystack.includes("password")) {
      value = values.password || "";
      key = "password";
    } else if (haystack.includes("username")) {
      value = values.accountHandle || values.username || "";
      key = "username";
    } else if (haystack.includes("name")) {
      const fieldMeta = await describeInputField(locator);
      value = fieldPrefersHandle(fieldMeta) ? values.accountHandle || values.fullName || "" : values.fullName || "";
      key = "full_name";
    }

    if (!value) {
      continue;
    }

    if (await fillBestEffort(locator, value, { timeout })) {
      restored.push(key || fieldName || fieldLabel || fieldType || "field");
    }
  }

  if (!restored.length) {
    return { retried: false, restored: [] };
  }

  const submitButton = await firstVisibleLocator(locators.submit, 1200);
  if (!submitButton) {
    return { retried: false, restored };
  }

  let submitted = await clickBestEffort(submitButton, { timeout: 8000 });
  if (!submitted) {
    submitted = await submitFormBestEffort(submitButton);
  }
  if (!submitted) {
    return { retried: false, restored };
  }

  await page.waitForTimeout(1500);
  return {
    retried: true,
    restored
  };
}

async function fillOtpCode(page, otpCode) {
  const otpText = sanitizeString(otpCode, 32);
  if (!otpText) {
    return false;
  }

  const singleInputs = page.locator(
    [
      'input[inputmode="numeric"]',
      'input[inputmode="decimal"]',
      'input[inputmode="tel"]',
      'input[autocomplete="one-time-code" i]',
      'input[name*="otp" i]',
      'input[id*="otp" i]',
      'input[name*="pin" i]',
      'input[id*="pin" i]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[maxlength="1"][inputmode]'
    ].join(",")
  );
  let count = 0;
  try {
    count = await singleInputs.count();
  } catch {
    count = 0;
  }

  if (count >= otpText.length && count <= otpText.length + 2) {
    for (let index = 0; index < otpText.length && index < count; index += 1) {
      const field = singleInputs.nth(index);
      if (!(await isLocatorVisible(field, 800))) {
        continue;
      }
      const filled = await fillBestEffort(field, otpText[index], { timeout: 3000 });
      if (!filled) {
        return false;
      }
    }
    return true;
  }

  const combinedField = await firstVisibleLocator([
    page.getByLabel(/otp|code|verification|passcode/i),
    page.getByPlaceholder(/otp|code|verification|passcode/i),
    page.locator(
      [
        'input[autocomplete="one-time-code" i]',
        'input[inputmode="numeric"]',
        'input[inputmode="decimal"]',
        'input[inputmode="tel"]',
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[name*="pin" i]',
        'input[id*="pin" i]',
        'input[name*="code" i]',
        'input[id*="code" i]',
        'input[maxlength="1"][inputmode]'
      ].join(",")
    )
  ]);
  if (!combinedField) {
    return false;
  }
  return fillBestEffort(combinedField, otpText, { timeout: 4000 });
}

function normalizeOtpInbox(metadata = {}) {
  const candidate =
    (isPlainObject(metadata.otp_inbox) && metadata.otp_inbox) ||
    (isPlainObject(metadata.otpInbox) && metadata.otpInbox) ||
    (isPlainObject(metadata.otp_identity) && metadata.otp_identity) ||
    (isPlainObject(metadata.otpIdentity) && metadata.otpIdentity) ||
    null;

  if (!candidate) {
    return null;
  }

  const provider = sanitizeString(candidate.provider, 64).toLowerCase() || "mailtm";
  const email = sanitizeOptionalString(candidate.email || candidate.address, 320);
  if (!email) {
    return null;
  }

  const normalized = {
    ...candidate,
    provider,
    email,
    host: sanitizeOptionalString(candidate.host || candidate.imapHost || candidate.imap_host, 320) || null,
    port: Number.isFinite(Number(candidate.port || candidate.imapPort || candidate.imap_port))
      ? Math.max(1, Math.min(65535, Math.floor(Number(candidate.port || candidate.imapPort || candidate.imap_port))))
      : null,
    username: sanitizeOptionalString(candidate.username || candidate.user, 320) || email,
    token: sanitizeOptionalString(candidate.token, 4096) || null,
    password: sanitizeOptionalString(candidate.password, 512) || null,
    accessToken: sanitizeOptionalString(candidate.accessToken || candidate.access_token, 4096) || null,
    mailbox: sanitizeOptionalString(candidate.mailbox || candidate.folder, 120) || null,
    createdAt: sanitizeOptionalString(candidate.createdAt, 128) || null
  };

  if (provider === "mailtm" && !normalized.token) {
    return null;
  }
  if (provider === "imap" && (!normalized.host || !normalized.username || (!normalized.password && !normalized.accessToken))) {
    return null;
  }

  return normalized;
}

function shouldAttemptGoogleAuth(runRequest, signals = {}) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  if (isGoogleAuthRequirement(metadata.auth_requirement || metadata.authRequirement)) {
    return true;
  }
  return Boolean(signals.googleVisible && !signals.passwordVisible);
}

async function waitForAuthResolution(page, initialUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentUrl = sanitizeString(page.url(), 4096);
    const otpVisible = await detectOtpRequiredUi(page);
    const authVisible = await authSurfaceStillVisible(page);
    if (!otpVisible && !authVisible && !looksLikeGoogleAuthUrl(currentUrl)) {
      return true;
    }
    if (currentUrl && currentUrl !== initialUrl && !otpVisible && !authVisible) {
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function ensureAuthSurface(page, options = {}) {
  const locators = buildAuthLocators(page);
  const alreadyVisible = await hasVisibleLocator(
    [
      ...locators.fullName,
      ...locators.firstName,
      ...locators.lastName,
      ...locators.email,
      ...locators.phone,
      ...locators.username,
      ...locators.password,
      ...locators.google
    ],
    1000
  );
  if (alreadyVisible) {
    return;
  }
  const trigger = await firstVisibleLocator(
    options.preferSignup
      ? [...locators.signupEntry, ...locators.authEntry, ...locators.onboardingEntry]
      : [...locators.authEntry, ...locators.signupEntry, ...locators.onboardingEntry],
    1500
  );
  if (trigger) {
    await clickBestEffort(trigger, { timeout: 5000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}

async function signupModeVisible(page) {
  const locators = buildAuthLocators(page);
  const fullNameInput = await firstVisibleLocator(locators.fullName, 600);
  const firstNameInput = await firstVisibleLocator(locators.firstName, 600);
  const lastNameInput = await firstVisibleLocator(locators.lastName, 600);
  const confirmPasswordInput = await firstVisibleLocator(locators.confirmPassword, 600);
  const signUpSubmit = await firstVisibleLocator(locators.signUpSubmit, 600);
  if (fullNameInput || firstNameInput || lastNameInput || confirmPasswordInput || signUpSubmit) {
    return true;
  }

  if (looksLikeSignupUrl(page.url())) {
    return true;
  }

  const alreadyHaveAccountCopy = await firstVisibleLocator(
    [
      page.getByText(/already have an account|already a member|have an account\?\s*log in/i),
      page.locator("*").filter({ hasText: /already have an account|already a member|have an account\?\s*log in/i })
    ],
    600
  );
  if (alreadyHaveAccountCopy) {
    return true;
  }

  const signupHeading = await firstVisibleLocator(
    [
      page.getByRole("heading", { name: /sign\s*up|create account|register/i }),
      page.locator("h1,h2,h3,[role='heading']").filter({ hasText: /sign\s*up|create account|register/i })
    ],
    600
  );
  return Boolean(signupHeading);
}

async function ensureSignupMode(page) {
  if (await signupModeVisible(page)) {
    return true;
  }

  const locators = buildAuthLocators(page);
  const signUpSwitch = await firstVisibleLocator(locators.signupEntry, 1200);
  if (!signUpSwitch) {
    return false;
  }

  const signUpHref =
    sanitizeOptionalString((await signUpSwitch.getAttribute("href").catch(() => null)), 4096) || null;

  const clickWorked = await clickBestEffort(signUpSwitch, { timeout: 5000 });
  if (clickWorked) {
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    if (await signupModeVisible(page)) {
      return true;
    }
  }

  if (
    signUpHref &&
    !signUpHref.startsWith("#") &&
    !signUpHref.toLowerCase().startsWith("javascript:")
  ) {
    try {
      const resolvedUrl = new URL(signUpHref, page.url()).toString();
      if (resolvedUrl !== page.url()) {
        await page.goto(resolvedUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {
      // Ignore invalid hrefs and fall through to the final visible-state check.
    }
  }

  return signupModeVisible(page);
}

function inferLastAuthMode(runLog = []) {
  const entries = Array.isArray(runLog) ? runLog : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const event = sanitizeString(entry?.event, 64).toLowerCase();
    if (!["auth_submit_attempted", "auth_form_filled", "auth_surface_ready"].includes(event)) {
      continue;
    }
    const mode = sanitizeString(entry?.data?.mode, 32).toLowerCase();
    if (mode === "signup" || mode === "login") {
      return mode;
    }
  }
  return "";
}

async function describeAuthFailureForRun(page, runRequest, runLog = [], failureSignals = null) {
  const autoCreateAccount = shouldAutoCreateAccount(runRequest);
  const currentUrl = sanitizeString(page?.url?.() || "", 4096).toLowerCase();
  const signupStillVisible = await signupModeVisible(page);
  const lastAuthMode = inferLastAuthMode(runLog);
  const entries = Array.isArray(runLog) ? runLog : [];
  const latestCaptchaResolution = [...entries].reverse().find((entry) => {
    return sanitizeString(entry?.event, 64).toLowerCase() === "auth_captcha_resolution_attempted";
  });
  const retriedAfterCaptcha = entries.some((entry) => {
    return (
      sanitizeString(entry?.event, 64).toLowerCase() === "auth_submit_retried" &&
      sanitizeString(entry?.data?.method, 64).toLowerCase() === "post_captcha_submit"
    );
  });
  const sawSignupSurface = entries.some((entry) => {
    const event = sanitizeString(entry?.event, 64).toLowerCase();
    const mode = sanitizeString(entry?.data?.mode, 32).toLowerCase();
    const url = sanitizeString(entry?.data?.url, 4096).toLowerCase();
    return (
      ["auth_surface_ready", "auth_form_filled", "auth_submit_attempted"].includes(event) &&
      (mode === "signup" || looksLikeSignupUrl(url))
    );
  });
  const sawSignupSubmit = entries.some((entry) => {
    const event = sanitizeString(entry?.event, 64).toLowerCase();
    const mode = sanitizeString(entry?.data?.mode, 32).toLowerCase();
    return event === "auth_submit_attempted" && mode === "signup";
  });

  if (autoCreateAccount && signupStillVisible && sawSignupSubmit) {
    return "The site kept the tester on the sign-up form after submit instead of creating the account";
  }
  if (
    autoCreateAccount &&
    !signupStillVisible &&
    currentUrl &&
    !looksLikeSignupUrl(currentUrl) &&
    (lastAuthMode === "signup" || sawSignupSubmit || (sawSignupSurface && entries.some((entry) => sanitizeString(entry?.event, 64).toLowerCase() === "auth_submit_attempted")))
  ) {
    return "The site sent the tester back to the login screen right after the sign-up form was submitted";
  }
  if (autoCreateAccount && !signupStillVisible && currentUrl && !looksLikeSignupUrl(currentUrl) && !sawSignupSurface) {
    return "Auto-create account was requested but the sign-up form never opened";
  }
  if (latestCaptchaResolution) {
    const captchaResolved = latestCaptchaResolution?.data?.resolved === true;
    const captchaOk = latestCaptchaResolution?.data?.ok === true;
    const captchaError = sanitizeOptionalString(latestCaptchaResolution?.data?.error, 240);
    if (!captchaOk && captchaError) {
      return `Captcha resolution failed: ${captchaError}`;
    }
    if (captchaOk && !captchaResolved) {
      return "Captcha token was applied, but the sign-up form still showed an active captcha challenge";
    }
  }
  const invalidFields = Array.isArray(failureSignals?.invalidFields) ? failureSignals.invalidFields : [];
  if (invalidFields.length > 0) {
    const field = invalidFields[0];
    const fieldLabel = sanitizeOptionalString(field.label || field.name || field.type, 120) || "A required field";
    const message = sanitizeOptionalString(field.validationMessage, 240) || "is still invalid";
    return `${fieldLabel} blocked sign-up after submit: ${message}`;
  }
  const errorTexts = Array.isArray(failureSignals?.errorTexts) ? failureSignals.errorTexts : [];
  if (errorTexts.length > 0) {
    return `The sign-up form displayed an error after submit: ${sanitizeOptionalString(errorTexts[0], 240)}`;
  }
  if (retriedAfterCaptcha && looksLikeSignupUrl(currentUrl)) {
    return "The sign-up form was resubmitted after captcha, but the site kept the tester on the sign-up screen";
  }
  return "Auth flow did not resolve to an authenticated surface";
}

async function completeGoogleAuth(page, username, password, runLog) {
  pushRunLog(runLog, "google_auth_started", {
    url: sanitizeString(page.url(), 4096) || null
  });

  const useAnotherAccount = await firstVisibleLocator([
    page.getByRole("button", { name: /use another account/i }),
    page.getByRole("link", { name: /use another account/i }),
    page.locator('div[role="button"]:has-text("Use another account")')
  ]);
  if (useAnotherAccount) {
    await clickBestEffort(useAnotherAccount, { timeout: 5000 });
    await page.waitForTimeout(500);
  }

  const accountChoice = username
    ? await firstVisibleLocator([
        page.getByRole("button", { name: new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }),
        page.getByRole("link", { name: new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }),
        page.locator(`text=${username}`)
      ])
    : null;
  if (accountChoice) {
    await clickBestEffort(accountChoice, { timeout: 5000 });
    await page.waitForTimeout(1200);
  }

  const emailInput = await firstVisibleLocator([
    page.getByLabel(/email|phone/i),
    page.getByPlaceholder(/email|phone/i),
    page.locator('input[type="email"],input[name="identifier"]')
  ]);
  if (emailInput && username) {
    const filled = await fillBestEffort(emailInput, username, { timeout: 6000 });
    if (!filled) {
      throw new Error("Google auth email input could not be filled");
    }
    const nextButton = await firstVisibleLocator([
      page.getByRole("button", { name: /^next$/i }),
      page.locator('button:has-text("Next"),div[role="button"]:has-text("Next")')
    ]);
    if (nextButton) {
      await clickBestEffort(nextButton, { timeout: 5000 });
      await page.waitForTimeout(1500);
    }
  }

  const passwordInput = await firstVisibleLocator([
    page.getByLabel(/^enter your password$/i),
    page.getByLabel(/^password$/i),
    page.getByPlaceholder(/^password$/i),
    page.locator('input[type="password"]')
  ], 4000);
  if (passwordInput && password) {
    const filled = await fillBestEffort(passwordInput, password, { timeout: 6000 });
    if (!filled) {
      throw new Error("Google auth password input could not be filled");
    }
    const nextButton = await firstVisibleLocator([
      page.getByRole("button", { name: /^next$/i }),
      page.locator('button:has-text("Next"),div[role="button"]:has-text("Next")')
    ]);
    if (nextButton) {
      await clickBestEffort(nextButton, { timeout: 5000 });
      await page.waitForTimeout(1500);
    }
  }

  const consentButton = await firstVisibleLocator([
    page.getByRole("button", { name: /continue|allow|yes|accept/i }),
    page.locator('button:has-text("Continue"),button:has-text("Allow"),div[role="button"]:has-text("Continue")')
  ], 2000);
  if (consentButton) {
    await clickBestEffort(consentButton, { timeout: 5000 });
    await page.waitForTimeout(1000);
  }

  pushRunLog(runLog, "google_auth_submitted", {
    url: sanitizeString(page.url(), 4096) || null
  });
}

async function performCredentialedLogin(page, runRequest, options = {}) {
  const requestedCredentials = isPlainObject(runRequest?.credentials) ? runRequest.credentials : null;
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const autoCreateAccount = shouldAutoCreateAccount(runRequest);
  if (!requestedCredentials && !isGoogleAuthRequirement(metadata.auth_requirement || metadata.authRequirement) && !autoCreateAccount) {
    return {
      attempted: false,
      success: false,
      reason: "no_credentials"
    };
  }

  const runLog = Array.isArray(options.runLog) ? options.runLog : null;
  const authRequirement = sanitizeString(metadata.auth_requirement || metadata.authRequirement, 128).toLowerCase();
  const loginUrl = sanitizeString(requestedCredentials?.login_url || runRequest?.target_url, 4096) || null;
  if (!loginUrl) {
    throw new Error("Credentialed auth flow is missing a login URL");
  }
  const otpProviderUrl =
    sanitizeOptionalString(
      metadata.otp_provider_url ||
        metadata.otpProviderUrl ||
        metadata.otp_provider_poll_url ||
        metadata.otpProviderPollUrl ||
        options.otpProviderUrl ||
        process.env.QA_OTP_PROVIDER_URL ||
        process.env.QA_OTP_PROVIDER_POLL_URL,
      4096
    ) || null;
  const requestedOtpProviderName = sanitizeString(
    metadata.otp_provider ||
      metadata.otpProvider ||
      options.otpProvider ||
      process.env.QA_OTP_PROVIDER,
    64
  );
  const otpProviderName =
    requestedOtpProviderName ||
    sanitizeString(normalizeOtpInbox(metadata)?.provider, 64) ||
    (otpProviderUrl ? "http" : "") ||
    (autoCreateAccount ? "mailtm" : "");
  const normalizedOtpInbox = normalizeOtpInbox(metadata);
  const otpBroker = createOtpBroker({
    provider: otpProviderName || undefined,
    mailtmBaseUrl:
      sanitizeOptionalString(
        metadata.otp_mailtm_base_url ||
          metadata.otpMailtmBaseUrl ||
          options.otpMailtmBaseUrl ||
          process.env.QA_OTP_MAILTM_BASE_URL,
        4096
      ) || undefined,
    httpUrl: otpProviderUrl || undefined,
    httpCreateUrl:
      sanitizeOptionalString(
        metadata.otp_provider_create_url ||
          metadata.otpProviderCreateUrl ||
          options.otpProviderCreateUrl ||
          process.env.QA_OTP_PROVIDER_CREATE_URL,
        4096
      ) || undefined,
    httpHeaders:
      metadata.otp_provider_headers ||
      metadata.otpProviderHeaders ||
      options.otpProviderHeaders ||
      process.env.QA_OTP_PROVIDER_HEADERS ||
      undefined,
    httpAuthToken:
      sanitizeOptionalString(
        metadata.otp_provider_auth_token ||
          metadata.otpProviderAuthToken ||
          options.otpProviderAuthToken ||
          process.env.QA_OTP_PROVIDER_AUTH_TOKEN,
        4096
      ) || undefined,
    httpMethod:
      sanitizeOptionalString(
        metadata.otp_provider_method ||
          metadata.otpProviderMethod ||
          options.otpProviderMethod ||
          process.env.QA_OTP_PROVIDER_METHOD,
        32
      ) || undefined
  });
  const generatedCredentials = requestedCredentials
    ? null
    : {
        login_url: loginUrl,
        username: buildGeneratedEmail(runRequest, metadata),
        password: buildGeneratedPassword(runRequest, metadata),
        otp_mode: otpBroker.enabled ? "provider_hook" : "none"
      };
  const credentials = requestedCredentials || generatedCredentials;
  const fullName = buildGeneratedFullName(runRequest, metadata);
  const { firstName, lastName } = splitGeneratedName(fullName);
  const phone = buildGeneratedPhone(runRequest, metadata);
  const otpMode = sanitizeString(credentials?.otp_mode || "none", 64).toLowerCase() || "none";

  let otpInbox = normalizeOtpInbox(metadata);
  let username = sanitizeOptionalString(credentials?.username, 320) || null;
  const accountHandle = buildGeneratedAccountHandle(runRequest, metadata, username);
  const password = sanitizeOptionalString(credentials?.password, 320) || null;

  const shouldProvisionOtpIdentity =
    otpMode === "provider_hook" &&
    otpBroker.enabled &&
    !otpInbox &&
    (!username || !requestedCredentials);
  if (shouldProvisionOtpIdentity) {
    otpInbox = otpInbox || (await otpBroker.createIdentity({
      runTag: sanitizeString(runRequest?.run_id, 64) || "qa"
    }));
    username = sanitizeOptionalString(otpInbox?.email, 320) || null;
  }

  pushRunLog(runLog, "auth_flow_started", {
    login_url: loginUrl,
    auth_requirement: authRequirement || null,
    otp_mode: otpMode || null,
    otp_provider_requested: requestedOtpProviderName || null,
    otp_inbox_provider: normalizedOtpInbox?.provider || null,
    otp_provider: otpBroker.enabled ? otpBroker.provider : null,
    auto_create_account: autoCreateAccount && !requestedCredentials
  });

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await captureCheckpoint(options, "auth-entry-loaded", page);
  await ensureAuthSurface(page, { preferSignup: autoCreateAccount });
  if (autoCreateAccount) {
    const signupReady = await ensureSignupMode(page);
    if (!signupReady) {
      await captureCheckpoint(options, "auth-signup-switch-failed", page);
      throw new Error("Auto-create account was requested but the sign-up form never opened");
    }
  }
  const signupSurfaceReady = await signupModeVisible(page);
  pushRunLog(runLog, "auth_surface_ready", {
    mode: signupSurfaceReady ? "signup" : "login",
    url: sanitizeString(page.url(), 4096) || null
  });
  await captureCheckpoint(options, "auth-surface-ready", page);

  const locators = buildAuthLocators(page);
  const passwordInputVisible = await hasVisibleLocator(locators.password, 1200);
  const googleVisible = await hasVisibleLocator(locators.google, 1200);
  const preferGoogle = shouldAttemptGoogleAuth(runRequest, {
    googleVisible,
    passwordVisible: passwordInputVisible
  });

  if (preferGoogle) {
    const googleTrigger = await firstVisibleLocator(locators.google, 1500);
    if (!googleTrigger) {
      throw new Error("Google auth was requested but no Google sign-in entry was visible");
    }
    const popupPromise = page.context().waitForEvent("page", { timeout: 10000 }).catch(() => null);
    await clickBestEffort(googleTrigger, { timeout: 8000 });
    const popup = await popupPromise;
    const googlePage = popup || page;
    await googlePage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await completeGoogleAuth(googlePage, username, password, runLog);
    if (popup) {
      await popup.waitForEvent("close", { timeout: 45000 }).catch(() => {});
      try {
        await page.bringToFront();
      } catch {
        // Best effort only.
      }
    }
  } else {
    const fullNameInput = await firstVisibleLocator(locators.fullName, 1200);
    const firstNameInput = await firstVisibleLocator(locators.firstName, 1200);
    const lastNameInput = await firstVisibleLocator(locators.lastName, 1200);
    const phoneInput = await firstVisibleLocator(locators.phone, 1200);
    const emailInput = await firstVisibleLocator(locators.email, 1200);
    const usernameInput = await firstVisibleDistinctLocator(
      locators.username,
      emailInput ? ["email_like"] : [],
      1200
    );
    const usernameFallbackInput =
      !emailInput && !usernameInput && !fullNameInput && !firstNameInput && !lastNameInput
        ? await firstVisibleLocator(locators.usernameFallback, 1200)
        : null;
    const accountIdentifierInput = emailInput || usernameInput || usernameFallbackInput;
    const passwordInput = await firstVisibleLocator(locators.password, 1200);
    const confirmPasswordInput = await firstVisibleLocator(locators.confirmPassword, 1200);

    if (!accountIdentifierInput && !passwordInput) {
      await captureCheckpoint(options, "auth-inputs-missing", page);
      throw new Error("Auth form inputs were not detected on the login surface");
    }
    const shouldFillNameFields = autoCreateAccount || signupSurfaceReady;
    if (shouldFillNameFields && firstNameInput) {
      const filled = await fillBestEffort(firstNameInput, firstName, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-first-name-fill-failed", page);
        throw new Error("First name field could not be filled");
      }
    }
    if (shouldFillNameFields && lastNameInput) {
      const filled = await fillBestEffort(lastNameInput, lastName, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-last-name-fill-failed", page);
        throw new Error("Last name field could not be filled");
      }
    }
    if (shouldFillNameFields && fullNameInput) {
      const fullNameField = await describeInputField(fullNameInput);
      const fullNameValue = fieldPrefersHandle(fullNameField) ? accountHandle : fullName;
      const filled = await fillBestEffort(fullNameInput, fullNameValue, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-full-name-fill-failed", page);
        throw new Error("Name field could not be filled");
      }
    }
    if (shouldFillNameFields && phoneInput) {
      const filled = await fillBestEffort(phoneInput, phone, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-phone-fill-failed", page);
        throw new Error("Phone field could not be filled");
      }
    }
    if (username && accountIdentifierInput) {
      const filled = await fillBestEffort(accountIdentifierInput, username, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-username-fill-failed", page);
        throw new Error("Username/email field could not be filled");
      }
    }
    if (autoCreateAccount && accountHandle && usernameInput) {
      const filled = await fillBestEffort(usernameInput, accountHandle, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-account-handle-fill-failed", page);
        throw new Error("Username field could not be filled for sign-up");
      }
    }
    if (password && passwordInput) {
      const filled = await fillBestEffort(passwordInput, password, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-password-fill-failed", page);
        throw new Error("Password field could not be filled");
      }
    }
    if (password && confirmPasswordInput) {
      const filled = await fillBestEffort(confirmPasswordInput, password, { timeout: 6000 });
      if (!filled) {
        await captureCheckpoint(options, "auth-confirm-password-fill-failed", page);
        throw new Error("Password confirmation field could not be filled");
      }
    }
    const authModeBeforeSubmit = (await signupModeVisible(page)) ? "signup" : "login";
    pushRunLog(runLog, "auth_form_filled", {
      mode: authModeBeforeSubmit,
      url: sanitizeString(page.url(), 4096) || null
    });
    await captureCheckpoint(options, "auth-form-filled", page);

    if (autoCreateAccount) {
      const signupStillVisible = authModeBeforeSubmit === "signup";
      if (!signupStillVisible) {
        await captureCheckpoint(options, "auth-signup-mode-lost", page);
        throw new Error("Auto-create account was requested but the sign-up form never opened");
      }
    }

    const submitButton = await firstVisibleLocator(locators.submit, 1500);
    if (!submitButton) {
      await captureCheckpoint(options, "auth-submit-missing", page);
      throw new Error("Auth submit button was not found");
    }
    let submitted = await clickBestEffort(submitButton, { timeout: 8000 });
    if (!submitted && otpMode === "provider_hook" && usernameInput && !passwordInput) {
      submitted = await submitFormBestEffort(submitButton);
      if (submitted) {
        pushRunLog(runLog, "auth_submit_retried", {
          method: "form_request_submit"
        });
      }
    }
    if (!submitted) {
      await captureCheckpoint(options, "auth-submit-blocked", page);
      throw new Error("Auth submit button could not be activated");
    }
    pushRunLog(runLog, "auth_submit_attempted", {
      mode: authModeBeforeSubmit,
      url: sanitizeString(page.url(), 4096) || null
    });
    await page.waitForTimeout(1500);
    await captureCheckpoint(options, "auth-submit-attempted", page);

    const captchaDetection = await shouldAttemptCaptchaResolution(page, options, {
      mode: authModeBeforeSubmit,
      loginUrl
    });
    if (captchaDetection.shouldResolve && typeof options.resolveCaptcha === "function") {
      pushRunLog(runLog, "auth_captcha_detected", {
        mode: authModeBeforeSubmit,
        source: captchaDetection.source
      });
      await captureCheckpoint(options, "auth-captcha-gate", page);
      const captchaResult = await options.resolveCaptcha(page, {
        mode: authModeBeforeSubmit,
        loginUrl
      });
      pushRunLog(runLog, "auth_captcha_resolution_attempted", {
        ok: captchaResult?.ok === true,
        resolved: captchaResult?.resolved === true,
        skipped: captchaResult?.skipped === true,
        error: sanitizeOptionalString(captchaResult?.error, 240) || null
      });
      if (captchaResult?.ok === true) {
        await page.waitForTimeout(parsePositiveInteger(options.captchaPostWaitMs, 4000));
        await captureCheckpoint(options, "auth-captcha-resolved", page);
        if (await authSurfaceStillVisible(page)) {
          const restoredAfterCaptcha = await restoreAuthFormValuesAfterCaptcha(
            page,
            locators,
            {
              autoCreateAccount,
              allowNameFields: authModeBeforeSubmit === "signup",
              fullName,
              firstName,
              lastName,
              phone,
              accountHandle,
              username,
              password
            },
            { timeout: 6000 }
          );
          if (restoredAfterCaptcha.restored.length > 0) {
            pushRunLog(runLog, "auth_fields_restored_after_captcha", {
              fields: restoredAfterCaptcha.restored.slice(0, 10)
            });
            await captureCheckpoint(options, "auth-fields-restored-after-captcha", page);
          }
          const submitAfterCaptcha = await firstVisibleLocator(locators.submit, 1200);
          if (submitAfterCaptcha) {
            let submittedAfterCaptcha = await clickBestEffort(submitAfterCaptcha, { timeout: 8000 });
            if (!submittedAfterCaptcha) {
              submittedAfterCaptcha = await submitFormBestEffort(submitAfterCaptcha);
            }
            if (submittedAfterCaptcha) {
              pushRunLog(runLog, "auth_submit_retried", {
                method: "post_captcha_submit",
                mode: authModeBeforeSubmit
              });
              await page.waitForTimeout(1500);
              await captureCheckpoint(options, "auth-submit-after-captcha", page);
            }
          }
        }
      }
    }

    if (looksLikeGoogleAuthUrl(page.url())) {
      await completeGoogleAuth(page, username, password, runLog);
    }
  }

  let otpUiVisible = await waitForOtpRequiredUi(page, 8000);
  if (!otpUiVisible && otpMode === "provider_hook") {
    const submitButton = await firstVisibleLocator(locators.submit, 800);
    const emailInput = await firstVisibleLocator(locators.email, 600);
    const passwordInput = await firstVisibleLocator(locators.password, 600);
    if (submitButton && emailInput && !passwordInput) {
      const retried = await submitFormBestEffort(submitButton);
      if (retried) {
        pushRunLog(runLog, "auth_submit_retried", {
          method: "post_submit_form_request_submit"
        });
        otpUiVisible = await waitForOtpRequiredUi(page, 8000);
      }
    }
  }
  if (otpUiVisible) {
    pushRunLog(runLog, "otp_gate_detected", {
      otp_mode: otpMode || null
    });
    await captureCheckpoint(options, "auth-otp-gate", page);

    if (otpMode === "manual_prompt") {
      const manualTimeoutMs = parsePositiveInteger(
        metadata.manual_otp_timeout_ms || metadata.manualOtpTimeoutMs || process.env.QA_AUTH_MANUAL_OTP_TIMEOUT_MS,
        DEFAULT_MANUAL_OTP_TIMEOUT_MS
      );
      pushRunLog(runLog, "otp_manual_wait_started", {
        timeout_ms: manualTimeoutMs
      });
      const resolved = await waitForAuthResolution(page, loginUrl, manualTimeoutMs);
      if (!resolved) {
        throw new Error("Manual OTP entry did not complete before timeout");
      }
    } else if (otpMode === "provider_hook") {
      if (!otpBroker.enabled) {
        throw new Error("OTP provider hook requested but no OTP provider is configured");
      }
      if (!otpInbox) {
        throw new Error("OTP provider hook requested but no OTP inbox identity is available");
      }

      const otpWaitResult = await otpBroker.waitForOtpCode(otpInbox, {
        timeoutMs: parsePositiveInteger(
          metadata.otp_timeout_ms || metadata.otpTimeoutMs || process.env.QA_OTP_TIMEOUT_MS,
          DEFAULT_OTP_TIMEOUT_MS
        ),
        pollIntervalMs: parsePositiveInteger(
          metadata.otp_poll_interval_ms || metadata.otpPollIntervalMs || process.env.QA_OTP_POLL_INTERVAL_MS,
          DEFAULT_OTP_POLL_INTERVAL_MS
        ),
        subjectPattern:
          sanitizeOptionalString(
            metadata.otp_subject_pattern || metadata.otpSubjectPattern || process.env.QA_OTP_SUBJECT_PATTERN,
            256
          ) || undefined
      });

      if (!otpWaitResult.ok) {
        throw new Error(otpWaitResult.error || "OTP provider hook timed out");
      }

      pushRunLog(runLog, "otp_message_received", {
        has_code: Boolean(otpWaitResult.code),
        has_link: Boolean(otpWaitResult.link)
      });

      if (otpWaitResult.code) {
        const submitted = await fillOtpCode(page, otpWaitResult.code);
        if (!submitted) {
          throw new Error("OTP code was received but the code field could not be filled");
        }
        pushRunLog(runLog, "otp_code_submitted");
        const otpSubmit = await firstVisibleLocator(locators.submit, 1000);
        if (otpSubmit) {
          await clickBestEffort(otpSubmit, { timeout: 5000 });
        }
      } else if (otpWaitResult.link) {
        await page.goto(otpWaitResult.link, { waitUntil: "domcontentloaded", timeout: 45000 });
      } else {
        throw new Error("OTP message arrived without a usable code or link");
      }
    } else {
      throw new Error("OTP gate detected but credentials.otp_mode is none");
    }
  }

  const authResolved = await waitForAuthResolution(page, loginUrl, 30000);
  if (!authResolved) {
    let failureSignals = await collectAuthFailureSignals(page);
    if (
      Array.isArray(failureSignals?.invalidFields) && failureSignals.invalidFields.length > 0 ||
      Array.isArray(failureSignals?.errorTexts) && failureSignals.errorTexts.length > 0
    ) {
      pushRunLog(runLog, "auth_failure_signals", failureSignals);
    }
    const invalidFieldRetry = await retryInvalidAuthFields(
      page,
      failureSignals,
      locators,
      {
        autoCreateAccount,
        allowNameFields: (await signupModeVisible(page)) === true,
        fullName,
        firstName,
        lastName,
        phone,
        accountHandle,
        username,
        password
      },
      { timeout: 6000 }
    );
    if (invalidFieldRetry.retried) {
      pushRunLog(runLog, "auth_submit_retried", {
        method: "invalid_field_retry_submit",
        fields: invalidFieldRetry.restored.slice(0, 10)
      });
      await captureCheckpoint(options, "auth-invalid-fields-restored", page);
      const authResolvedAfterRetry = await waitForAuthResolution(page, loginUrl, 15000);
      if (authResolvedAfterRetry) {
        pushRunLog(runLog, "auth_flow_completed", {
          final_url: sanitizeString(page.url(), 4096) || null,
          used_google_auth: preferGoogle
        });
        await captureCheckpoint(options, "auth-flow-completed", page);
        return {
          attempted: true,
          success: true,
          username: username || null,
          otpInbox: otpInbox || null,
          otpMode: otpMode || null,
          usedGoogleAuth: preferGoogle,
          autoCreatedAccount: autoCreateAccount && !requestedCredentials
        };
      }
      failureSignals = await collectAuthFailureSignals(page);
      if (
        Array.isArray(failureSignals?.invalidFields) && failureSignals.invalidFields.length > 0 ||
        Array.isArray(failureSignals?.errorTexts) && failureSignals.errorTexts.length > 0
      ) {
        pushRunLog(runLog, "auth_failure_signals", failureSignals);
      }
    }
    throw new Error(await describeAuthFailureForRun(page, runRequest, runLog, failureSignals));
  }

  pushRunLog(runLog, "auth_flow_completed", {
    final_url: sanitizeString(page.url(), 4096) || null,
    used_google_auth: preferGoogle
  });
  await captureCheckpoint(options, "auth-flow-completed", page);

  return {
    attempted: true,
    success: true,
    username: username || null,
    otpInbox: otpInbox || null,
    otpMode: otpMode || null,
    usedGoogleAuth: preferGoogle,
    autoCreatedAccount: autoCreateAccount && !requestedCredentials
  };
}

module.exports = {
  performCredentialedLogin,
  __private: {
    detectOtpRequiredUi,
    waitForOtpRequiredUi,
    fillOtpCode,
    collectAuthFailureSignals,
    inferLastAuthMode,
    describeAuthFailureForRun,
    looksLikeGoogleAuthUrl,
    isGoogleAuthRequirement,
    detectCaptchaRequiredUi,
    buildAuthLocators,
    restoreAuthFormValuesAfterCaptcha,
    normalizeOtpInbox,
    normalizeHandleCandidate,
    buildGeneratedAccountHandle,
    fieldPrefersHandle,
    shouldAttemptGoogleAuth,
    shouldAutoCreateAccount,
    shouldAttemptCaptchaResolution,
    retryInvalidAuthFields
  }
};
