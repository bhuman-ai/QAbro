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
      page.getByLabel(/full\s*name|your name|name/i),
      page.getByPlaceholder(/full\s*name|your name|name/i),
      page.locator(
        'input[name*="full" i],input[id*="full" i],input[name*="name" i],input[id*="name" i],input[autocomplete="name" i]'
      )
    ],
    email: [
      page.getByLabel(/email|email address|work email|e-mail/i),
      page.getByPlaceholder(/email|email address|work email|e-mail/i),
      page.locator(
        'input[type="email"],input[name*="email" i],input[id*="email" i],input[autocomplete="email" i]'
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
      page.getByPlaceholder(/confirm|re-?enter|repeat/i)
    ],
    signInSubmit: [
      page.getByRole("button", { name: /sign\s*in|log\s*in/i }),
      page.locator('button:has-text("Sign in"),button:has-text("Log in")')
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
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[name*="code" i]',
        'input[id*="code" i]'
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

async function authSurfaceStillVisible(page) {
  const locators = buildAuthLocators(page);
  return hasVisibleLocator(
    [
      ...locators.fullName,
      ...locators.email,
      ...locators.username,
      ...locators.password,
      ...locators.signupEntry,
      page.getByRole("button", { name: /sign\s*in|log\s*in|sign\s*up|register|continue with google|google/i })
    ],
    1000
  );
}

async function fillOtpCode(page, otpCode) {
  const otpText = sanitizeString(otpCode, 32);
  if (!otpText) {
    return false;
  }

  const singleInputs = page.locator(
    'input[inputmode="numeric"],input[autocomplete="one-time-code" i],input[name*="code" i],input[id*="code" i]'
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
      'input[autocomplete="one-time-code" i],input[name*="otp" i],input[id*="otp" i],input[name*="code" i],input[id*="code" i]'
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
    token: sanitizeOptionalString(candidate.token, 4096) || null,
    password: sanitizeOptionalString(candidate.password, 512) || null,
    createdAt: sanitizeOptionalString(candidate.createdAt, 128) || null
  };

  if (provider === "mailtm" && !normalized.token) {
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
    [...locators.fullName, ...locators.email, ...locators.username, ...locators.password, ...locators.google],
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

async function ensureSignupMode(page) {
  const locators = buildAuthLocators(page);
  const signInSubmit = await firstVisibleLocator(locators.signInSubmit, 800);
  const signUpSwitch = await firstVisibleLocator(locators.signupEntry, 800);
  if (signInSubmit && signUpSwitch) {
    await clickBestEffort(signUpSwitch, { timeout: 5000 });
    await page.waitForTimeout(1000);
  }
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
    (otpProviderUrl ? "http" : "") ||
    (autoCreateAccount ? "mailtm" : "");
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
  const otpMode = sanitizeString(credentials?.otp_mode || "none", 64).toLowerCase() || "none";

  let otpInbox = normalizeOtpInbox(metadata);
  let username = sanitizeOptionalString(credentials?.username, 320) || null;
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
    otp_provider: otpBroker.enabled ? otpBroker.provider : null,
    auto_create_account: autoCreateAccount && !requestedCredentials
  });

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await ensureAuthSurface(page, { preferSignup: autoCreateAccount });
  if (autoCreateAccount) {
    await ensureSignupMode(page);
  }

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
    const emailInput = await firstVisibleLocator(locators.email, 1200);
    const usernameInput =
      emailInput || (await firstVisibleLocator([...locators.username, ...locators.usernameFallback], 1200));
    const passwordInput = await firstVisibleLocator(locators.password, 1200);
    const confirmPasswordInput = await firstVisibleLocator(locators.confirmPassword, 1200);

    if (!usernameInput && !passwordInput) {
      throw new Error("Auth form inputs were not detected on the login surface");
    }
    if (autoCreateAccount && fullNameInput) {
      await fillBestEffort(fullNameInput, fullName, { timeout: 6000 });
    }
    if (username && usernameInput) {
      const filled = await fillBestEffort(usernameInput, username, { timeout: 6000 });
      if (!filled) {
        throw new Error("Username/email field could not be filled");
      }
    }
    if (password && passwordInput) {
      const filled = await fillBestEffort(passwordInput, password, { timeout: 6000 });
      if (!filled) {
        throw new Error("Password field could not be filled");
      }
    }
    if (password && confirmPasswordInput) {
      await fillBestEffort(confirmPasswordInput, password, { timeout: 6000 });
    }

    const submitButton = await firstVisibleLocator(locators.submit, 1500);
    if (!submitButton) {
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
      throw new Error("Auth submit button could not be activated");
    }
    await page.waitForTimeout(1500);

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
    throw new Error("Auth flow did not resolve to an authenticated surface");
  }

  pushRunLog(runLog, "auth_flow_completed", {
    final_url: sanitizeString(page.url(), 4096) || null,
    used_google_auth: preferGoogle
  });

  return {
    attempted: true,
    success: true,
    username: username || null,
    usedGoogleAuth: preferGoogle,
    autoCreatedAccount: autoCreateAccount && !requestedCredentials
  };
}

module.exports = {
  performCredentialedLogin,
  __private: {
    detectOtpRequiredUi,
    waitForOtpRequiredUi,
    looksLikeGoogleAuthUrl,
    isGoogleAuthRequirement,
    normalizeOtpInbox,
    shouldAttemptGoogleAuth,
    shouldAutoCreateAccount
  }
};
