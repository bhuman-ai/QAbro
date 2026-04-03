const AUTH_MODE_SIGN_IN = "signin";
const AUTH_MODE_SIGN_UP = "signup";
const DEFAULT_AUTH_REDIRECT_ORIGIN = "https://swarmtester.com";

const authElements = {
  authShell: document.getElementById("dashboardAuthShell"),
  signInForm: document.getElementById("authSignInForm"),
  signUpForm: document.getElementById("authSignUpForm"),
  signInModeButton: document.getElementById("authModeSignIn"),
  signUpModeButton: document.getElementById("authModeSignUp"),
  optionalCode: document.querySelector(".dashboard-auth-optional"),
  message: document.getElementById("dashboardAuthMessage"),
  userHint: document.getElementById("dashboardAuthUserHint"),
  userChip: document.getElementById("dashboardAuthUserChip")
};

const protectedAreas = Array.from(document.querySelectorAll("[data-dashboard-protected='true']"));
const signOutButtons = Array.from(document.querySelectorAll("[data-auth-signout='true']"));

const authState = {
  authorized: false,
  user: null,
  mode: AUTH_MODE_SIGN_IN,
  sessionChecked: false
};
let mcpBootstrapSent = false;
let resolveAuthReady = null;
const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

function settleAuthReady() {
  if (!authState.sessionChecked || typeof resolveAuthReady !== "function") {
    return;
  }
  resolveAuthReady({
    authorized: authState.authorized,
    user: authState.user
  });
  resolveAuthReady = null;
}

function dispatchAuthState() {
  window.dispatchEvent(
    new CustomEvent("swarm:auth-state", {
      detail: {
        authorized: authState.authorized,
        user: authState.user,
        sessionChecked: authState.sessionChecked
      }
    })
  );
}

function setAuthMessage(message, state = "") {
  if (!authElements.message) {
    return;
  }

  authElements.message.textContent = String(message || "");
  authElements.message.dataset.state = state || "";
}

function setProtectedAreasVisible(visible) {
  for (const node of protectedAreas) {
    node.hidden = !visible;
    node.setAttribute("aria-hidden", visible ? "false" : "true");
  }
}

function setAuthShellVisible(visible) {
  if (!authElements.authShell) {
    return;
  }

  authElements.authShell.hidden = !visible;
  authElements.authShell.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setSignOutVisible(visible) {
  for (const button of signOutButtons) {
    button.hidden = !visible;
  }
}

function setCurrentUserHint(user) {
  if (!authElements.userHint) {
    return;
  }

  const email = String(user?.email || "").trim();
  authElements.userHint.textContent = email ? `Signed in as ${email}` : "";
  if (authElements.userChip) {
    const initials = email ? email.charAt(0).toUpperCase() : "QA";
    authElements.userChip.textContent = initials;
    authElements.userChip.setAttribute("title", email || "Account");
    authElements.userChip.hidden = !email;
  }
}

function lockDashboard() {
  authState.authorized = false;
  authState.user = null;
  setCurrentUserHint(null);
  setSignOutVisible(false);
  if (isSharedReportRoute()) {
    setProtectedAreasVisible(true);
    setAuthShellVisible(false);
  } else {
    setProtectedAreasVisible(false);
    setAuthShellVisible(true);
  }
  dispatchAuthState();
}

function unlockDashboard(user) {
  authState.authorized = true;
  authState.user = user && typeof user === "object" ? user : null;
  setCurrentUserHint(authState.user);
  setSignOutVisible(true);
  setProtectedAreasVisible(true);
  setAuthShellVisible(false);
  dispatchAuthState();
}

function setMode(mode) {
  const nextMode = mode === AUTH_MODE_SIGN_UP ? AUTH_MODE_SIGN_UP : AUTH_MODE_SIGN_IN;
  authState.mode = nextMode;

  if (authElements.signInForm) {
    authElements.signInForm.hidden = false;
  }
  if (authElements.signUpForm) {
    authElements.signUpForm.hidden = nextMode !== AUTH_MODE_SIGN_UP;
  }
  if (authElements.optionalCode) {
    authElements.optionalCode.open = nextMode === AUTH_MODE_SIGN_UP;
  }
  if (authElements.signInModeButton) {
    authElements.signInModeButton.classList.toggle("active", nextMode === AUTH_MODE_SIGN_IN);
    authElements.signInModeButton.setAttribute("aria-selected", nextMode === AUTH_MODE_SIGN_IN ? "true" : "false");
  }
  if (authElements.signUpModeButton) {
    authElements.signUpModeButton.classList.toggle("active", nextMode === AUTH_MODE_SIGN_UP);
    authElements.signUpModeButton.setAttribute("aria-selected", nextMode === AUTH_MODE_SIGN_UP ? "true" : "false");
  }
}

function getRequestedAuthMode() {
  const params = new URLSearchParams(window.location.search || "");
  const modeRaw = String(params.get("mode") || params.get("auth_mode") || "").trim().toLowerCase();
  const promoCode = getRequestedPromoCode();

  if (modeRaw === "signup" || modeRaw === "sign-up" || modeRaw === "register") {
    return AUTH_MODE_SIGN_UP;
  }
  if (modeRaw === "signin" || modeRaw === "sign-in" || modeRaw === "login") {
    return AUTH_MODE_SIGN_IN;
  }
  if (promoCode) {
    return AUTH_MODE_SIGN_UP;
  }
  return AUTH_MODE_SIGN_IN;
}

function getRequestedPromoCode() {
  const params = new URLSearchParams(window.location.search || "");
  return String(params.get("promo") || params.get("coupon") || params.get("code") || "").trim().toUpperCase();
}

function getRequestedPrefillEmail() {
  const params = new URLSearchParams(window.location.search || "");
  return String(params.get("email") || params.get("prefill_email") || "").trim().toLowerCase();
}

function getRequestedInviteCode() {
  const params = new URLSearchParams(window.location.search || "");
  return String(params.get("invite_code") || params.get("inviteCode") || "").trim();
}

function getRequestedShareRunId() {
  const params = new URLSearchParams(window.location.search || "");
  return String(params.get("share_run_id") || params.get("shareRunId") || "").trim();
}

function isSharedReportRoute() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const runId = String(params.get("run_id") || params.get("runId") || "").trim();
    const shareKey = String(params.get("share_key") || params.get("shareKey") || "").trim();
    const rawView = String(params.get("view") || params.get("mode") || "").trim().toLowerCase();
    const isReportView = rawView === "report" || rawView === "report_only" || rawView === "share" || (!rawView && runId);
    return Boolean(runId && shareKey && isReportView);
  } catch {
    return false;
  }
}

function isLocalCallbackOrigin(origin) {
  try {
    const parsed = new URL(String(origin || ""));
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    return (
      parsed.protocol === "http:" &&
      (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname.endsWith(".localhost"))
    );
  } catch {
    return false;
  }
}

function getRequestedMcpCallbackUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const raw = String(params.get("mcp_callback") || params.get("mcpCallback") || "").trim();
  if (!raw || !isLocalCallbackOrigin(raw)) {
    return "";
  }
  return raw;
}

function getDashboardTargetUrl() {
  const pathname = String(window.location.pathname || "").toLowerCase();
  if (pathname.endsWith("/reports.html")) {
    return "/reports.html";
  }
  if (pathname.endsWith("/dashboard") || pathname.endsWith("/dashboard.html")) {
    return "/dashboard";
  }
  return "/dashboard";
}

function isLocalhostHost(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.endsWith(".localhost");
}

function resolveMagicLinkRedirectOrigin() {
  const configured = window.document.querySelector("meta[name='swarm-auth-redirect-origin']")?.content || "";
  const candidate = String(configured || "").trim();
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Ignore invalid configured value.
    }
  }

  const host = String(window.location.hostname || "").trim().toLowerCase();
  if (isLocalhostHost(host)) {
    return DEFAULT_AUTH_REDIRECT_ORIGIN;
  }
  return window.location.origin;
}

function buildMagicLinkRedirectUrl() {
  const currentPath = getDashboardTargetUrl();
  const url = new URL(currentPath, resolveMagicLinkRedirectOrigin());
  url.searchParams.set("auth_callback", "1");
  const promoCode = getRequestedPromoCode();
  const shareRunId = getRequestedShareRunId();
  const mcpCallback = getRequestedMcpCallbackUrl();
  const email = getRequestedPrefillEmail();
  const inviteCode = getRequestedInviteCode();
  if (promoCode) {
    url.searchParams.set("promo", promoCode);
    url.searchParams.set("mode", "signup");
  }
  if (shareRunId) {
    url.searchParams.set("share_run_id", shareRunId);
  }
  if (mcpCallback) {
    url.searchParams.set("mcp_callback", mcpCallback);
  }
  if (email) {
    url.searchParams.set("email", email);
  }
  if (inviteCode) {
    url.searchParams.set("invite_code", inviteCode);
  }
  return url.toString();
}

function resetUrlAfterAuthCallback() {
  const target = getDashboardTargetUrl();
  window.history.replaceState({}, "", target);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function setFormPending(form, pending, pendingLabel) {
  if (!form) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  if (!submitButton) {
    return;
  }

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent || "";
  }

  submitButton.disabled = Boolean(pending);
  submitButton.textContent = pending ? pendingLabel : submitButton.dataset.defaultLabel;
}

async function refreshSession() {
  try {
    const { response, data } = await fetchJson("/api/auth/session");
    authState.sessionChecked = true;
    if (!response.ok || !data.ok) {
      lockDashboard();
      settleAuthReady();
      return { ok: false };
    }

    unlockDashboard(data.user || null);
    await maybeSendMcpBootstrapTokens();
    settleAuthReady();
    return { ok: true, user: data.user || null };
  } catch {
    authState.sessionChecked = true;
    lockDashboard();
    settleAuthReady();
    return { ok: false };
  }
}

async function postTokensToMcpCallback(accessToken, refreshToken) {
  const mcpCallback = getRequestedMcpCallbackUrl();
  if (!mcpCallback || !accessToken || !refreshToken) {
    return false;
  }

  try {
    const response = await fetch(mcpCallback, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function maybeSendMcpBootstrapTokens() {
  if (mcpBootstrapSent || !getRequestedMcpCallbackUrl() || !authState.authorized) {
    return false;
  }

  let response;
  let data;
  try {
    const result = await fetchJson("/api/auth/mcp-bootstrap");
    response = result.response;
    data = result.data;
  } catch {
    return false;
  }
  if (!response.ok || !data.ok) {
    return false;
  }

  const delivered = await postTokensToMcpCallback(
    String(data.access_token || "").trim(),
    String(data.refresh_token || "").trim()
  );

  if (delivered) {
    mcpBootstrapSent = true;
    setAuthMessage("SwarmTester MCP is connected. You can close this tab.", "ok");
  }

  return delivered;
}

async function consumeMagicLinkTokensFromHash() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (!hash) {
    return { handled: false, ok: false };
  }

  const params = new URLSearchParams(hash);
  const error = params.get("error_description") || params.get("error");
  if (error) {
    resetUrlAfterAuthCallback();
    setAuthMessage(String(error).replaceAll("+", " "), "error");
    return { handled: true, ok: false };
  }

  const accessToken = String(params.get("access_token") || "").trim();
  const refreshToken = String(params.get("refresh_token") || "").trim();
  if (!accessToken || !refreshToken) {
    return { handled: false, ok: false };
  }

  setAuthMessage("Completing sign-in...", "");
  const { response, data } = await fetchJson("/api/auth/exchange", {
    method: "POST",
    body: {
      access_token: accessToken,
      refresh_token: refreshToken
    }
  });

  if (!response.ok || !data.ok) {
    resetUrlAfterAuthCallback();
    setAuthMessage(data.error || "Sign-in link expired. Request a new one.", "error");
    return { handled: true, ok: false };
  }

  await maybeSendMcpBootstrapTokens();
  resetUrlAfterAuthCallback();
  if (!mcpBootstrapSent) {
    setAuthMessage("Sign-in complete.", "ok");
  }
  return { handled: true, ok: true };
}

async function requestSignInMagicLink(email) {
  const { response, data } = await fetchJson("/api/auth/signin", {
    method: "POST",
    body: {
      email,
      redirect_to: buildMagicLinkRedirectUrl()
    }
  });

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not send sign-in link");
  }
}

async function requestSignUpMagicLink(email, inviteCode) {
  const { response, data } = await fetchJson("/api/auth/signup", {
    method: "POST",
    body: {
      email,
      invite_code: inviteCode,
      redirect_to: buildMagicLinkRedirectUrl(),
      share_run_id: getRequestedShareRunId()
    }
  });

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not send sign-up link");
  }
}

async function handleSignInSubmit(event) {
  event.preventDefault();
  const form = authElements.signInForm;
  if (!form) {
    return;
  }

  const email = String(form.querySelector("input[name='email']")?.value || "").trim().toLowerCase();
  const inviteCode = String(form.querySelector("input[name='invite_code']")?.value || "").trim();
  if (!email) {
    setAuthMessage("Enter your email address.", "error");
    return;
  }

  setFormPending(form, true, "Sending link...");
  setAuthMessage("");
  try {
    if (inviteCode) {
      await requestSignUpMagicLink(email, inviteCode);
      setAuthMessage("Team code accepted. Check your email for your sign-in link.", "ok");
    } else {
      await requestSignInMagicLink(email);
      setAuthMessage("Check your email for a sign-in link.", "ok");
    }
  } catch (error) {
    setAuthMessage(error.message || "Could not send sign-in link", "error");
  } finally {
    setFormPending(form, false);
  }
}

async function handleSignUpSubmit(event) {
  event.preventDefault();
  const form = authElements.signUpForm;
  if (!form) {
    return;
  }

  const email = String(form.querySelector("input[name='email']")?.value || "").trim().toLowerCase();
  const inviteCode = String(form.querySelector("input[name='invite_code']")?.value || "").trim();

  if (!email || !inviteCode) {
    setAuthMessage("Email and invite code are required.", "error");
    return;
  }

  setFormPending(form, true, "Sending link...");
  setAuthMessage("");
  try {
    await requestSignUpMagicLink(email, inviteCode);
    setAuthMessage("Invite accepted. Check your email for your sign-in link.", "ok");
  } catch (error) {
    setAuthMessage(error.message || "Could not send sign-up link", "error");
  } finally {
    setFormPending(form, false);
  }
}

async function handleSignOutClick() {
  try {
    await fetchJson("/api/auth/signout", { method: "POST" });
  } catch {
    // Ignore sign-out transport failures and still lock local UI state.
  }

  setMode(AUTH_MODE_SIGN_IN);
  setAuthMessage("Signed out.", "ok");
  lockDashboard();
}

function installAuthHandlers() {
  authElements.signInModeButton?.addEventListener("click", () => {
    setMode(AUTH_MODE_SIGN_IN);
    setAuthMessage("");
  });

  authElements.signUpModeButton?.addEventListener("click", () => {
    setMode(AUTH_MODE_SIGN_UP);
    setAuthMessage("");
  });

  authElements.signInForm?.addEventListener("submit", handleSignInSubmit);
  authElements.signUpForm?.addEventListener("submit", handleSignUpSubmit);

  for (const button of signOutButtons) {
    button.addEventListener("click", async () => {
      await handleSignOutClick();
    });
  }
}

function applyAuthRoutePrefill() {
  const promoCode = getRequestedPromoCode();
  const email = getRequestedPrefillEmail();
  const inviteCode = getRequestedInviteCode();
  const mcpCallback = getRequestedMcpCallbackUrl();
  const note = authElements.authShell?.querySelector(".dashboard-auth-note");

  if (email) {
    const signInEmail = authElements.signInForm?.querySelector("input[name='email']");
    const signUpEmail = authElements.signUpForm?.querySelector("input[name='email']");
    if (signInEmail && !String(signInEmail.value || "").trim()) {
      signInEmail.value = email;
    }
    if (signUpEmail && !String(signUpEmail.value || "").trim()) {
      signUpEmail.value = email;
    }
  }

  if (inviteCode) {
    const inviteInput = authElements.signInForm?.querySelector("input[name='invite_code']");
    if (inviteInput && !String(inviteInput.value || "").trim()) {
      inviteInput.value = inviteCode;
    }
    if (authElements.optionalCode) {
      authElements.optionalCode.open = true;
    }
  }

  if (inviteCode && authElements.signUpForm) {
    const inviteInput = authElements.signUpForm.querySelector("input[name='invite_code']");
    if (inviteInput && !String(inviteInput.value || "").trim()) {
      inviteInput.value = inviteCode;
    }
  }

  if (mcpCallback && note instanceof HTMLElement) {
    note.textContent = "Enter your email to connect SwarmTester MCP to this machine.";
  }

  if (!promoCode || !authElements.signUpForm) {
    if (promoCode) {
      const inviteInput = authElements.signInForm?.querySelector("input[name='invite_code']");
      if (inviteInput && !String(inviteInput.value || "").trim()) {
        inviteInput.value = promoCode;
      }
      if (authElements.optionalCode) {
        authElements.optionalCode.open = true;
      }
      if (note instanceof HTMLElement) {
        note.textContent = `Team code ${promoCode} is already filled in.`;
      }
    }
    return;
  }

  const inviteInput = authElements.signUpForm.querySelector("input[name='invite_code']");
  if (inviteInput && !String(inviteInput.value || "").trim()) {
    inviteInput.value = promoCode;
  }
  if (note instanceof HTMLElement) {
    note.textContent = `Team code ${promoCode} will be used for sign-up.`;
  }
}

function hasAuthUi() {
  return Boolean(
    authElements.authShell &&
      authElements.signInForm &&
      protectedAreas.length
  );
}

window.SwarmAuth = {
  isAuthorized: () => authState.authorized,
  isSessionChecked: () => authState.sessionChecked,
  getUser: () => authState.user,
  whenReady: () =>
    authState.sessionChecked
      ? Promise.resolve({
          authorized: authState.authorized,
          user: authState.user
        })
      : authReadyPromise,
  setUser: (user) => {
    if (!authState.authorized) {
      return;
    }
    authState.user = user && typeof user === "object" ? user : authState.user;
    setCurrentUserHint(authState.user);
    dispatchAuthState();
  },
  refreshSession
};

if (hasAuthUi()) {
  setMode(getRequestedAuthMode());
  applyAuthRoutePrefill();
  lockDashboard();
  installAuthHandlers();
  (async () => {
    await consumeMagicLinkTokensFromHash();
    await refreshSession();
  })();
} else {
  authState.authorized = true;
  authState.sessionChecked = true;
  settleAuthReady();
  dispatchAuthState();
}
