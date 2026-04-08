const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const {
  validateBrandProfileInput,
  validateReconRequest,
  validateSubmitRequest
} = require("../lib/submission-core");
const { runAssetPrepare, __private } = require("../lib/submission-runner");
const { normalizeBrandProfileRow } = require("../lib/submission-brand-profiles");
const { buildIdentitySmtpConfig } = require("../lib/submission-identity");
const { __private: authPrivate } = require("../lib/qa-auth-playwright");

test("validateReconRequest carries self-hosted runtime metadata", () => {
  const result = validateReconRequest({
    job_id: "recon_1",
    site_id: "google_business_profile",
    submit_url: "https://example.com/submit",
    proxy_server: "http://proxy.example:8080",
    proxy_username: "proxy-user",
    self_hosted_headless: false,
    submission_stealth_mode: true,
    submission_record_video: false,
    captcha_strategy: "built_in",
    captcha_builtin_wait_ms: 30000,
    twocaptcha_api_key: "two-secret",
    twocaptcha_timeout_ms: 240000,
    twocaptcha_max_attempts: 3,
    twocaptcha_retry_backoff_ms: 1500,
    twocaptcha_recaptcha_v3_min_score: 0.3,
    twocaptcha_recaptcha_v3_action: "signup",
    captcha_hook_url: "https://hooks.example.com/captcha",
    captcha_hook_wait_ms: 45000
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.metadata.self_hosted_proxy_server, "http://proxy.example:8080");
  assert.equal(result.data.metadata.self_hosted_proxy_username, "proxy-user");
  assert.equal(result.data.metadata.self_hosted_headless, false);
  assert.equal(result.data.metadata.submission_stealth_mode, true);
  assert.equal(result.data.metadata.self_hosted_record_video, false);
  assert.equal(result.data.metadata.submission_captcha_strategy, "built_in");
  assert.equal(result.data.metadata.captcha_builtin_wait_ms, 30000);
  assert.equal(result.data.metadata.twocaptcha_api_key, "two-secret");
  assert.equal(result.data.metadata.twocaptcha_timeout_ms, 240000);
  assert.equal(result.data.metadata.twocaptcha_max_attempts, 3);
  assert.equal(result.data.metadata.twocaptcha_retry_backoff_ms, 1500);
  assert.equal(result.data.metadata.twocaptcha_recaptcha_v3_min_score, 0.3);
  assert.equal(result.data.metadata.twocaptcha_recaptcha_v3_action, "signup");
  assert.equal(result.data.metadata.captcha_hook_url, "https://hooks.example.com/captcha");
  assert.equal(result.data.metadata.captcha_hook_wait_ms, 45000);
});

test("validateSubmitRequest accepts self-hosted submit runtime config", () => {
  const result = validateSubmitRequest({
    job_id: "submit_1",
    brand_profile_id: "brand_forney",
    site_id: "yelp",
    manifest_id: "manifest_1",
    do_browser_channel: "chrome",
    selfHostedTimezoneId: "America/Chicago",
    submissionProxyAutoSelect: true,
    submissionProxyRequireGeoMatch: true,
    submissionProxyRotationEnabled: true,
    submissionProxyMaxAttempts: 4,
    submissionProxyAttemptIndex: 1,
    webshareApiKey: "webshare-secret",
    submissionCaptchaStrategy: "pause",
    twoCaptchaPollIntervalMs: 7000,
    captchaHookRequired: true,
    captchaHookHeaders: {
      Authorization: "Bearer hook-secret"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.job_type, "directory_submit");
  assert.equal(result.data.metadata.self_hosted_browser_channel, "chrome");
  assert.equal(result.data.metadata.self_hosted_timezone_id, "America/Chicago");
  assert.equal(result.data.metadata.submission_proxy_auto_select, true);
  assert.equal(result.data.metadata.submission_proxy_require_geo_match, true);
  assert.equal(result.data.metadata.submission_proxy_rotation_enabled, true);
  assert.equal(result.data.metadata.submission_proxy_max_attempts, 4);
  assert.equal(result.data.metadata.submission_proxy_attempt_index, 1);
  assert.equal(result.data.metadata.webshare_api_key, "webshare-secret");
  assert.equal(result.data.metadata.submission_captcha_strategy, "pause");
  assert.equal(result.data.metadata.twocaptcha_poll_interval_ms, 7000);
  assert.equal(result.data.metadata.captcha_hook_required, true);
  assert.equal(result.data.metadata.captcha_hook_headers.Authorization, "Bearer hook-secret");
});

test("validateSubmitRequest accepts credentials and persistent-profile settings", () => {
  const result = validateSubmitRequest({
    job_id: "submit_auth_1",
    brand_profile_id: "brand_forney",
    site_id: "yelp",
    manifest_id: "manifest_1",
    self_hosted_profile_root_dir: "/var/lib/qabro/submission-profiles",
    self_hosted_profile_namespace: "lastb2b",
    auth_policy: "signup_if_needed",
    auto_create_account: true,
    credentials: {
      login_url: "https://biz.yelp.com/login",
      username: "ops@example.com",
      password: "super-secret",
      otp_mode: "provider_hook"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.credentials.login_url, "https://biz.yelp.com/login");
  assert.equal(result.data.credentials.username, "ops@example.com");
  assert.equal(result.data.credentials.password, "super-secret");
  assert.equal(result.data.credentials.otp_mode, "provider_hook");
  assert.equal(result.data.metadata.self_hosted_profile_root_dir, "/var/lib/qabro/submission-profiles");
  assert.equal(result.data.metadata.self_hosted_profile_namespace, "lastb2b");
  assert.equal(result.data.metadata.auth_policy, "signup_if_needed");
  assert.equal(result.data.metadata.auto_create_account, true);
});

test("validateBrandProfileInput normalizes client-owned mailbox identity", () => {
  const result = validateBrandProfileInput({
    brand_profile_id: "brand_clusterseo",
    display_name: "ClusterSEO",
    track: "startup",
    website_url: "https://clusterseo.com",
    identity_mode: "client_owned",
    mailbox_email: "listings@clusterseo.com",
    mailbox_provider: "gmail",
    mailbox_auth_method: "app_password",
    mailbox_username: "listings@clusterseo.com",
    app_password_configured: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.profile.identity.mode, "client_owned");
  assert.equal(result.data.profile.identity.mailbox.email, "listings@clusterseo.com");
  assert.equal(result.data.profile.identity.mailbox.provider, "gmail");
  assert.equal(result.data.profile.identity.mailbox.auth_method, "app_password");
  assert.equal(result.data.profile.identity.mailbox.protocol, "imap");
  assert.equal(result.data.profile.identity.mailbox.host, "imap.gmail.com");
  assert.equal(result.data.profile.identity.mailbox.port, 993);
  assert.equal(result.data.profile.identity.mailbox.smtp_host, "smtp.gmail.com");
  assert.equal(result.data.profile.identity.mailbox.smtp_port, 465);
  assert.equal(result.data.profile.identity.mailbox.smtp_secure, true);
  assert.equal(result.data.profile.identity.mailbox.app_password_configured, true);
  assert.equal(result.data.profile.identity.mailbox.inbox_ready, true);
});

test("validateBrandProfileInput applies Forward Email mailbox defaults", () => {
  const result = validateBrandProfileInput({
    brand_profile_id: "brand_enrichanything",
    display_name: "EnrichAnything",
    track: "startup",
    website_url: "https://www.enrichanything.com",
    identity_mode: "client_owned",
    mailbox_email: "team@enrichanything.com",
    mailbox_provider: "forwardemail",
    mailbox_auth_method: "smtp_imap_password",
    mailbox_username: "team@enrichanything.com"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.profile.identity.mailbox.provider, "forwardemail");
  assert.equal(result.data.profile.identity.mailbox.protocol, "smtp_imap");
  assert.equal(result.data.profile.identity.mailbox.host, "imap.forwardemail.net");
  assert.equal(result.data.profile.identity.mailbox.port, 993);
  assert.equal(result.data.profile.identity.mailbox.smtp_host, "smtp.forwardemail.net");
  assert.equal(result.data.profile.identity.mailbox.smtp_port, 465);
  assert.equal(result.data.profile.identity.mailbox.smtp_secure, true);
});

test("submission runner private helpers derive auth defaults and persistent profile paths", () => {
  const authConfig = __private.resolveSubmissionAuthConfig(
    {
      job_id: "submit_1",
      metadata: {}
    },
    {
      profile: {
        auth: {
          google_business_profile: {
            auth_policy: "public_only"
          }
        }
      }
    },
    "yelp",
    {
      gates: [{ type: "auth" }]
    }
  );

  assert.equal(authConfig.metadata.auth_policy, "signup_if_needed");
  assert.equal(authConfig.metadata.auto_create_account, true);
  assert.equal(authConfig.shouldAttempt, true);

  const profileDir = __private.resolvePersistentProfileDir(
    {
      profileRootDir: "/var/lib/qabro/submission-profiles",
      profileNamespace: "lastb2b"
    },
    {
      brand_profile_id: "brand_lastb2b_forneygroup_agency",
      site_id: "google_business_profile"
    }
  );

  assert.equal(
    profileDir,
    "/var/lib/qabro/submission-profiles/lastb2b/brand-lastb2b-forneygroup-agency/google-business-profile"
  );
});

test("submission runner auth config derives client mailbox OTP inbox", () => {
  const authConfig = __private.resolveSubmissionAuthConfig(
    {
      job_id: "submit_otp_1",
      metadata: {}
    },
    {
      identity: {
        mode: "client_owned",
        owner_name: "ClusterSEO Team",
        mailbox: {
          email: "listings@clusterseo.com",
          provider: "gmail",
          auth_method: "app_password",
          protocol: "imap",
          host: "imap.gmail.com",
          port: 993,
          password: "app-pass-secret",
          inbox_ready: true
        }
      }
    },
    "saashub",
    {
      gates: [{ type: "auth" }]
    }
  );

  assert.equal(authConfig.metadata.default_auth_email, "listings+saashub@clusterseo.com");
  assert.equal(authConfig.metadata.default_auth_name, "ClusterSEO Team");
  assert.equal(authConfig.metadata.otp_provider, "imap");
  assert.equal(authConfig.metadata.otp_inbox.provider, "imap");
  assert.equal(authConfig.metadata.otp_inbox.email, "listings@clusterseo.com");
  assert.equal(authConfig.metadata.otp_inbox.host, "imap.gmail.com");
  assert.equal(authConfig.metadata.otp_inbox.password, "app-pass-secret");
});

test("submission runner auth config prefers raw profile identity over sanitized identity", () => {
  const authConfig = __private.resolveSubmissionAuthConfig(
    {
      job_id: "submit_otp_2",
      metadata: {}
    },
    {
      identity: {
        mode: "client_owned",
        owner_name: "ClusterSEO Team",
        mailbox: {
          email: "listings@clusterseo.com",
          provider: "gmail",
          auth_method: "app_password",
          protocol: "imap",
          host: "imap.gmail.com",
          port: 993,
          inbox_ready: true
        }
      },
      profile: {
        identity: {
          mode: "client_owned",
          owner_name: "ClusterSEO Team",
          mailbox: {
            email: "listings@clusterseo.com",
            provider: "gmail",
            auth_method: "app_password",
            protocol: "imap",
            host: "imap.gmail.com",
            port: 993,
            password: "profile-secret",
            inbox_ready: true
          }
        }
      }
    },
    "betalist",
    {
      gates: [{ type: "auth" }]
    }
  );

  assert.equal(authConfig.metadata.default_auth_email, "listings+betalist@clusterseo.com");
  assert.equal(authConfig.metadata.otp_provider, "imap");
  assert.equal(authConfig.metadata.otp_inbox.provider, "imap");
  assert.equal(authConfig.metadata.otp_inbox.email, "listings@clusterseo.com");
  assert.equal(authConfig.metadata.otp_inbox.host, "imap.gmail.com");
  assert.equal(authConfig.metadata.otp_inbox.password, "profile-secret");
});

test("submission runner collects object-based asset refs without stringifying them", () => {
  const assets = __private.collectAvailableAssets({
    assets: {
      logo: { kind: "remote", url: "https://cdn.example.com/logo.svg" },
      icon: { path: "/tmp/icon.png" },
      banner: [{ href: "https://cdn.example.com/banner.png" }]
    }
  });

  assert.deepEqual(assets.logo, ["https://cdn.example.com/logo.svg"]);
  assert.deepEqual(assets.icon, ["/tmp/icon.png"]);
  assert.deepEqual(assets.banner, ["https://cdn.example.com/banner.png"]);
});

test("identity helpers derive smtp config from client mailbox", () => {
  const smtpConfig = buildIdentitySmtpConfig({
    mode: "client_owned",
    mailbox: {
      email: "listings@clusterseo.com",
      provider: "gmail",
      auth_method: "smtp_imap_password",
      password: "shared-secret"
    }
  });

  assert.equal(smtpConfig.provider, "gmail");
  assert.equal(smtpConfig.host, "smtp.gmail.com");
  assert.equal(smtpConfig.port, 465);
  assert.equal(smtpConfig.secure, true);
  assert.equal(smtpConfig.username, "listings@clusterseo.com");
  assert.equal(smtpConfig.password, "shared-secret");
});

test("auth helpers generate safe account handles for signup forms", () => {
  const handle = authPrivate.buildGeneratedAccountHandle(
    {
      run_id: "betalist_recon_123"
    },
    {},
    "Swarm Tester+Signup@example.com"
  );

  assert.equal(handle, "swarm_tester_signup_example");
  assert.equal(authPrivate.normalizeHandleCandidate("Swarm Tester"), "swarm_tester");
  assert.equal(
    authPrivate.fieldPrefersHandle({
      label: "Name",
      pattern: "^[A-Za-z0-9_]+$",
      title: "Can only contain letters, numbers and underscores"
    }),
    true
  );
  assert.equal(
    authPrivate.fieldPrefersHandle({
      label: "Full name",
      autocomplete: "name"
    }),
    false
  );
});

test("brand profile normalization strips mailbox secrets unless explicitly requested", () => {
  const row = {
    brand_profile_id: "brand_clusterseo",
    track: "startup",
    display_name: "ClusterSEO",
    website_url: "https://clusterseo.com",
    profile: {
      identity: {
        mode: "client_owned",
        mailbox: {
          email: "listings@clusterseo.com",
          auth_method: "app_password",
          protocol: "imap",
          password: "super-secret",
          smtp_password: "super-smtp-secret"
        }
      }
    }
  };

  const safe = normalizeBrandProfileRow(row);
  const withSecrets = normalizeBrandProfileRow(row, { includeSecrets: true });

  assert.equal(safe.profile.identity.mailbox.password, undefined);
  assert.equal(safe.profile.identity.mailbox.smtp_password, undefined);
  assert.equal(withSecrets.profile.identity.mailbox.password, "super-secret");
  assert.equal(withSecrets.profile.identity.mailbox.smtp_password, "super-smtp-secret");
});

test("submission runner runtime config picks up 2Captcha settings", () => {
  const runtime = __private.buildSelfHostedRuntimeConfig({
    job_id: "submit_2",
    metadata: {
      twocaptcha_api_key: "two-secret",
      twocaptcha_timeout_ms: 240000,
      twocaptcha_poll_interval_ms: 6000,
      twocaptcha_post_inject_wait_ms: 9000,
      twocaptcha_max_attempts: 3,
      twocaptcha_retry_backoff_ms: 1500
    }
  });

  assert.equal(runtime.twoCaptcha.enabled, true);
  assert.equal(runtime.twoCaptcha.apiKey, "two-secret");
  assert.equal(runtime.twoCaptcha.timeoutMs, 240000);
  assert.equal(runtime.twoCaptcha.pollIntervalMs, 6000);
  assert.equal(runtime.twoCaptcha.postInjectWaitMs, 9000);
  assert.equal(runtime.twoCaptcha.maxAttempts, 3);
  assert.equal(runtime.twoCaptcha.retryBackoffMs, 1500);
});

test("submission runner runtime config applies connector overrides for BetaList", () => {
  const runtime = __private.buildSelfHostedRuntimeConfig({
    job_id: "submit_betalist_1",
    site_id: "betalist",
    metadata: {
      twocaptcha_api_key: "two-secret"
    }
  });

  assert.equal(runtime.twoCaptcha.enabled, true);
  assert.equal(runtime.twoCaptcha.timeoutMs, 240000);
  assert.equal(runtime.twoCaptcha.postInjectWaitMs, 8000);
  assert.equal(runtime.captchaBuiltInWaitMs, 45000);
});

test("submission runner runtime config lets explicit job metadata override connector defaults", () => {
  const runtime = __private.buildSelfHostedRuntimeConfig({
    job_id: "submit_betalist_2",
    site_id: "betalist",
    metadata: {
      twocaptcha_api_key: "two-secret",
      twocaptcha_timeout_ms: 30000,
      twocaptcha_post_inject_wait_ms: 4000,
      captcha_builtin_wait_ms: 12000
    }
  });

  assert.equal(runtime.twoCaptcha.timeoutMs, 30000);
  assert.equal(runtime.twoCaptcha.postInjectWaitMs, 4000);
  assert.equal(runtime.captchaBuiltInWaitMs, 12000);
});

test("submission runner does not treat Continue as a final submit CTA", () => {
  const candidate = __private.chooseCandidateButton(
    {
      buttons: [
        { text: "Continue", dom_index: 0 },
        { text: "Cancel", dom_index: 1 }
      ]
    },
    [/\bsubmit\b/i, /\badd\b/i, /\blist\b/i, /\blaunch\b/i, /\bclaim\b/i, /\bjoin\b/i]
  );

  assert.equal(candidate, null);
});

test("submission runner prefers in-form CTA buttons over header links", () => {
  const candidate = __private.chooseCandidateButton(
    {
      buttons: [
        { text: "Submit Product", dom_index: 0, tag: "a", href: "/submit", top: 24, within_form: false, within_content: false },
        { text: "Submit Product", dom_index: 1, tag: "button", href: null, top: 620, within_form: true, within_content: true }
      ]
    },
    [/\bsubmit\b/i]
  );

  assert.equal(candidate?.dom_index, 1);
});

test("submission runner ignores weak header nav links as final submit CTAs", () => {
  const candidate = __private.chooseCandidateButton(
    {
      buttons: [
        { text: "Submit Product", dom_index: 0, tag: "a", href: "/submit", top: 24, within_form: false, within_content: false }
      ]
    },
    [/\bsubmit\b/i]
  );

  assert.equal(candidate, null);
});

test("submission runner prefers CTAs near active fields over footer links", () => {
  const candidate = __private.chooseCandidateButton(
    {
      buttons: [
        { text: "Submit List", dom_index: 0, tag: "a", href: "/submit", top: 1100, within_form: false, within_content: false, distance_to_fields: 800 },
        { text: "Continue", dom_index: 1, tag: "button", href: null, top: 640, within_form: true, within_content: true, distance_to_fields: 40 }
      ]
    },
    [/\bcontinue\b/i, /\bsubmit\b/i]
  );

  assert.equal(candidate?.dom_index, 1);
});

test("submission runner classifySubmitOutcome keeps wizard steps out of submitted state", () => {
  const outcome = __private.classifySubmitOutcome({
    title: "Submit a Product - SaaSHub",
    text_hints: ["Successful submission advice", "Website URL"],
    field_count: 1,
    forms_count: 1
  });

  assert.equal(outcome, "incomplete");
});

test("submission runner classifySubmitOutcome treats SaaSHub related alternatives flow as submitted", () => {
  const outcome = __private.classifySubmitOutcome({
    url: "https://www.saashub.com/related-alternatives/enrichanything?flow=submit",
    title: "Select Competitors - SaaSHub",
    text_hints: ["EnrichAnything will appear as verified alternative on the pages of the selected products."],
    field_count: 0,
    forms_count: 0
  });

  assert.equal(outcome, "submitted");
});

test("submission runner 2Captcha client creates and polls task tokens", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method || "GET",
      body: init.body || null
    });
    if (String(url).includes("/in.php")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ status: 1, request: "captcha-task-123" })
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ status: 1, request: "captcha-token-xyz" })
    };
  };

  const result = await __private.requestTwoCaptchaToken(
    {
      type: "recaptcha",
      sitekey: "site-key-123",
      pageurl: "https://example.com/form"
    },
    {
      twoCaptcha: {
        apiKey: "two-secret",
        apiBaseUrl: "https://2captcha.com",
        timeoutMs: 20000,
        pollIntervalMs: 1
      }
    },
    {
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.taskId, "captcha-task-123");
  assert.equal(result.token, "captcha-token-xyz");
  assert.equal(calls.length, 2);
  assert.match(String(calls[0].body), /method=userrecaptcha/);
  assert.match(String(calls[0].body), /googlekey=site-key-123/);
});

test("submission runner 2Captcha client sends recaptcha v3 parameters", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method || "GET",
      body: init.body || null
    });
    if (String(url).includes("/in.php")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ status: 1, request: "captcha-task-v3" })
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ status: 1, request: "captcha-token-v3" })
    };
  };

  const result = await __private.requestTwoCaptchaToken(
    {
      type: "recaptcha",
      version: "v3",
      sitekey: "site-key-v3",
      pageurl: "https://example.com/form",
      action: "signup"
    },
    {
      twoCaptcha: {
        apiKey: "two-secret",
        apiBaseUrl: "https://2captcha.com",
        timeoutMs: 20000,
        pollIntervalMs: 1,
        recaptchaV3MinScore: 0.3
      }
    },
    {
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.taskId, "captcha-task-v3");
  assert.equal(result.token, "captcha-token-v3");
  assert.equal(calls.length, 2);
  assert.match(String(calls[0].body), /method=userrecaptcha/);
  assert.match(String(calls[0].body), /googlekey=site-key-v3/);
  assert.match(String(calls[0].body), /version=v3/);
  assert.match(String(calls[0].body), /action=signup/);
  assert.match(String(calls[0].body), /min_score=0.3/);
});

test("submission runner detects invisible recaptcha iframe challenges", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <html>
        <body>
          <iframe
            src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=site-key-123&co=aHR0cHM6Ly9leGFtcGxlLmNvbTo0NDM.&hl=en&v=test&size=invisible&cb=abc123"
          ></iframe>
        </body>
      </html>
    `);

    const challenge = await __private.detectSupportedCaptchaChallenge(page);
    assert.equal(challenge?.type, "recaptcha");
    assert.equal(challenge?.sitekey, "site-key-123");
    assert.equal(challenge?.invisible, true);
  } finally {
    await browser.close();
  }
});

test("submission runner detects script-only recaptcha v3 challenges", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <html>
        <head>
          <script src="https://www.google.com/recaptcha/api.js?render=site-key-v3"></script>
          <script>
            grecaptcha.execute("site-key-v3", { action: "signup" });
          </script>
        </head>
        <body></body>
      </html>
    `);

    const challenge = await __private.detectSupportedCaptchaChallenge(page);
    assert.equal(challenge?.type, "recaptcha");
    assert.equal(challenge?.sitekey, "site-key-v3");
    assert.equal(challenge?.version, "v3");
    assert.equal(challenge?.action, "signup");
    assert.equal(challenge?.min_score, 0.3);
  } finally {
    await browser.close();
  }
});

test("submission runner retries unsolvable recaptcha challenges before succeeding", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <html>
        <body>
          <form></form>
          <iframe
            src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=site-key-123&co=aHR0cHM6Ly9leGFtcGxlLmNvbTo0NDM.&hl=en&v=test&size=invisible&cb=abc123"
          ></iframe>
          <script>
            window.__resetCount = 0;
            window.grecaptcha = {
              reset() {
                window.__resetCount += 1;
              }
            };
            window.___grecaptcha_cfg = {
              clients: {
                0: {
                  callback(token) {
                    window.__solvedToken = token;
                    const frame = document.querySelector('iframe');
                    if (frame) frame.remove();
                  }
                }
              }
            };
          </script>
        </body>
      </html>
    `);

    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), body: String(init.body || "") });
      const createCalls = calls.filter((entry) => entry.url.includes("/in.php")).length;
      if (String(url).includes("/in.php")) {
        return {
          ok: true,
          text: async () => JSON.stringify({ status: 1, request: `captcha-task-${createCalls}` })
        };
      }
      if (createCalls === 1) {
        return {
          ok: true,
          text: async () => JSON.stringify({ status: 0, request: "ERROR_CAPTCHA_UNSOLVABLE" })
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ status: 1, request: "captcha-token-xyz" })
      };
    };

    const runLog = [];
    const result = await __private.attemptTwoCaptchaSolve(
      page,
      {
        twoCaptcha: {
          apiKey: "two-secret",
          apiBaseUrl: "https://2captcha.com",
          timeoutMs: 20000,
          pollIntervalMs: 1,
          postInjectWaitMs: 1,
          maxAttempts: 2,
          retryBackoffMs: 1
        }
      },
      runLog,
      { fetchImpl }
    );

    assert.equal(result.ok, true);
    assert.equal(result.resolved, true);
    assert.equal(await page.evaluate(() => window.__resetCount), 1);
    assert.equal(await page.evaluate(() => window.__solvedToken), "captcha-token-xyz");
    assert.equal(calls.filter((entry) => entry.url.includes("/in.php")).length, 2);
    assert.ok(runLog.some((entry) => entry.event === "twocaptcha_retry_scheduled"));
  } finally {
    await browser.close();
  }
});

test("submission runner overlay planner prefers explicit country and cookie actions", () => {
  const countryPlan = __private.planBlockingOverlayAction(
    "Select your country before continuing to BBB",
    ["Canada", "United States", "Mexico"]
  );
  assert.equal(countryPlan.kind, "country");
  assert.equal(countryPlan.label, "United States");

  const cookiePlan = __private.planBlockingOverlayAction(
    "We use cookies and privacy controls to improve the experience.",
    ["Manage", "Accept all", "Reject all"]
  );
  assert.equal(cookiePlan.kind, "cookie");
  assert.match(cookiePlan.label, /reject all|accept all/i);
});

test("runAssetPrepare merges hook-generated assets and copy into the manifest", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "submission-asset-prepare-"));
  const result = await runAssetPrepare(
    {
      job_id: "asset_prepare_1",
      brand_profile_id: "brand_forney",
      site_ids: ["google_business_profile"],
      metadata: {
        asset_generation_hook_required: false
      }
    },
    {
      outputRoot,
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_forney",
          brand_key: "forney",
          track: "physical_local",
          display_name: "Forney Group",
          legal_name: "Forney Group Agency",
          website_url: "https://forneygroup.agency",
          profile: {
            summary: "Independent insurance agency serving Forney.",
            description: "Independent insurance agency serving Forney and nearby Texas communities.",
            services: ["Home Insurance", "Auto Insurance"],
            tags: ["insurance", "local"],
            contact: {
              email: "sales@forneygroup.agency",
              phone: "(972) 552-6919"
            },
            location: {
              address_line_1: "201 N Bois D Arc St",
              city: "Forney",
              state: "TX",
              postal_code: "75126"
            },
            assets: {
              logo: ["/tmp/existing-logo.png"]
            }
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "google_business_profile",
            site_name: "Google Business Profile",
            submission_policy: "assist",
            submit_url: "https://example.com/submit",
            profile: {
              asset_requirements: [
                { asset_type: "logo", required: true },
                { asset_type: "cover_image", required: true }
              ],
              fields: [
                { label: "Business Name", name: "business_name", type: "text", required: true },
                { label: "Description", name: "description", type: "textarea", required: false }
              ]
            }
          }
        ]
      }),
      assetGenerationHook: async () => ({
        ok: true,
        response: {
          generated_assets: {
            cover_image: ["https://cdn.example.com/generated-cover.png"]
          },
          copy_pack: {
            about_500: "Generated cover-copy variant for submissions."
          },
          notes: ["generated cover image"]
        }
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.result.asset_manifest.generation.status, "completed");
  assert.equal(result.result.asset_manifest.generation.generated_asset_count, 1);
  assert.ok(
    result.result.asset_manifest.available_assets.cover_image.includes(
      "https://cdn.example.com/generated-cover.png"
    )
  );
  assert.equal(
    result.result.asset_manifest.copy_pack.about_500,
    "Generated cover-copy variant for submissions."
  );
});

test("runAssetPrepare builds useful suggestions for SaaSHub-style fields", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "submission-asset-prepare-saashub-"));
  const result = await runAssetPrepare(
    {
      job_id: "asset_prepare_saashub_1",
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"]
    },
    {
      outputRoot,
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://www.clusterseo.com/",
          profile: {
            summary: "Guest post exchange platform for contextual backlinks.",
            description:
              "Build powerful, contextual backlinks through a curated ecosystem of real publishers powered by credits, not cash.",
            services: ["SEO", "Link Building"],
            tags: ["SEO", "Content Marketing"],
            competitors: ["WhitePress", "Collaborator", "Ahrefs"],
            contact: {
              email: "team@clusterseo.com"
            },
            links: {
              linkedin_url: "https://www.linkedin.com/company/clusterseo/"
            }
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            submit_url: "https://www.saashub.com/services/submit",
            profile: {
              fields: [
                { label: "Product Name", name: "service[name]", type: "text", required: true },
                { label: "Tagline", name: "service[tagline]", type: "textarea", required: true },
                {
                  label: "Categories",
                  name: null,
                  hidden_name: "category_names[]",
                  role: "combobox",
                  widget: "combobox",
                  type: "text",
                  required: true,
                  multiple: true
                },
                {
                  label: "Competitors",
                  name: null,
                  hidden_name: "service_names[]",
                  role: "combobox",
                  widget: "combobox",
                  type: "text",
                  required: true,
                  multiple: true
                },
                { label: "LinkedIn URL", name: "service[linkedin_url]", type: "url", required: false },
                { label: "Contact email", name: "service[contact_email]", type: "text", required: true }
              ]
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  const siteManifest = result.result.asset_manifest.site_manifests[0];
  const getSuggestion = (label) =>
    siteManifest.field_suggestions.find((item) => item.field_label === label)?.suggested_value;

  assert.equal(getSuggestion("Product Name"), "ClusterSEO");
  assert.match(getSuggestion("Tagline"), /Guest post exchange platform/i);
  assert.equal(getSuggestion("Categories"), "SEO, Link Building");
  assert.equal(getSuggestion("Competitors"), "WhitePress, Collaborator, Ahrefs");
  assert.equal(getSuggestion("LinkedIn URL"), "https://www.linkedin.com/company/clusterseo/");
  assert.equal(getSuggestion("Contact email"), "");
});
