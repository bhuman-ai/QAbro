const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { chromium } = require("playwright");
const { performCredentialedLogin, __private } = require("../lib/qa-auth-playwright");

async function withServer(routes, fn) {
  const server = http.createServer((req, res) => {
    const handler = routes[req.url.split("?")[0]];
    if (!handler) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    handler(req, res);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("private helpers detect google auth and OTP inbox metadata", () => {
  assert.equal(__private.looksLikeGoogleAuthUrl("https://accounts.google.com/v3/signin"), true);
  assert.equal(__private.looksLikeGoogleAuthUrl("https://example.com/login"), false);
  assert.equal(
    __private.shouldAttemptGoogleAuth(
      {
        metadata: { auth_requirement: "google_oauth" }
      },
      { googleVisible: false, passwordVisible: true }
    ),
    true
  );
  assert.deepEqual(
    __private.normalizeOtpInbox({
      otp_inbox: {
        provider: "mailtm",
        email: "qa@example.com",
        token: "secret-token"
      }
    }),
    {
      provider: "mailtm",
      email: "qa@example.com",
      token: "secret-token",
      host: null,
      port: null,
      username: "qa@example.com",
      password: null,
      accessToken: null,
      mailbox: null,
      createdAt: null
    }
  );
  const httpInbox = __private.normalizeOtpInbox({
    otp_inbox: {
      provider: "http",
      email: "qa@example.com",
      externalId: "inbox_123"
    }
  });
  assert.ok(httpInbox);
  assert.equal(httpInbox.provider, "http");
  assert.equal(httpInbox.email, "qa@example.com");
  assert.equal(httpInbox.token, null);
  assert.equal(
    __private.shouldAutoCreateAccount({
      scope_mode: "feature_targeted",
      metadata: {}
    }),
    true
  );
  assert.equal(
    __private.shouldAutoCreateAccount({
      scope_mode: "core_20m",
      metadata: {
        auth_policy: "public_only"
      }
    }),
    false
  );
});

test("OTP helpers detect and fill split decimal PIN inputs", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <h1>Check your email</h1>
          <p>Enter the security code we emailed you to confirm you're not a robot</p>
          <div>
            ${Array.from({ length: 6 }, (_, index) => {
              return `<input id="pin-${index}" type="text" inputmode="decimal" maxlength="1" />`;
            }).join("")}
          </div>
        </body>
      </html>`);

    assert.equal(await __private.detectOtpRequiredUi(page), true);
    assert.equal(await __private.fillOtpCode(page, "654321"), true);
    assert.deepEqual(
      await page.locator("input").evaluateAll((inputs) => inputs.map((input) => input.value)),
      ["6", "5", "4", "3", "2", "1"]
    );
  } finally {
    await browser.close();
  }
});

test("describeAuthFailureForRun recognizes signup submit bounce-backs", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <div>
            <h2>Welcome back</h2>
            <p>Please continue to log in.</p>
            <a href="/login">Go to login</a>
          </div>
        </body>
      </html>`, { url: "https://www.clusterseo.com/login" });

    const runLog = [
      { event: "auth_surface_ready", data: { url: "https://www.clusterseo.com/signup", mode: "signup" } },
      { event: "auth_form_filled", data: { url: "https://www.clusterseo.com/signup", mode: "signup" } },
      { event: "auth_submit_attempted", data: { url: "https://www.clusterseo.com/login", mode: "signup" } }
    ];

    const message = await __private.describeAuthFailureForRun(
      page,
      {
        scope_mode: "feature_targeted",
        metadata: {
          auth_policy: "signup_if_needed",
          auto_create_account: true
        }
      },
      runLog
    );

    assert.equal(
      message,
      "The site sent the tester back to the login screen right after the sign-up form was submitted"
    );
  } finally {
    await browser.close();
  }
});

test("describeAuthFailureForRun recognizes signup surfaces served from login URLs", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <div>
            <h2>Join BetaList</h2>
            <label>Name <input name="name" /></label>
            <label>Email <input type="email" name="email" /></label>
            <label>Password <input type="password" name="password" /></label>
            <label>Password confirmation <input type="password" name="password_confirmation" /></label>
            <button type="submit">Create my account</button>
          </div>
        </body>
      </html>`, { url: "https://betalist.com/sign_in" });

    const message = await __private.describeAuthFailureForRun(
      page,
      {
        scope_mode: "feature_targeted",
        metadata: {
          auth_policy: "signup_if_needed",
          auto_create_account: true
        }
      },
      [
        { event: "auth_surface_ready", data: { url: "https://betalist.com/sign_in", mode: "signup" } },
        { event: "auth_form_filled", data: { url: "https://betalist.com/sign_in", mode: "signup" } },
        { event: "auth_submit_attempted", data: { url: "https://betalist.com/sign_in", mode: "signup" } }
      ]
    );

    assert.equal(
      message,
      "The site kept the tester on the sign-up form after submit instead of creating the account"
    );
  } finally {
    await browser.close();
  }
});

test("detectOtpRequiredUi ignores explanatory copy until a code field is present", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <div role="dialog">
            <h1>Sign in</h1>
            <p>We send a one-time code to your email so you can save projects.</p>
            <label>Email <input autocomplete="email" placeholder="you@company.com" /></label>
            <button type="submit">Send code</button>
          </div>
        </body>
      </html>`);

    assert.equal(await __private.detectOtpRequiredUi(page), false);

    await page.setContent(`<!doctype html>
      <html>
        <body>
          <div role="dialog">
            <p>Sent to qa@example.com</p>
            <input inputmode="numeric" maxlength="1" />
            <input inputmode="numeric" maxlength="1" />
            <input inputmode="numeric" maxlength="1" />
            <input inputmode="numeric" maxlength="1" />
            <input inputmode="numeric" maxlength="1" />
            <input inputmode="numeric" maxlength="1" />
            <button type="button">Verify</button>
          </div>
        </body>
      </html>`);

    assert.equal(await __private.detectOtpRequiredUi(page), true);
  } finally {
    await browser.close();
  }
});

test("collectAuthFailureSignals captures SaaSHub-style notification banners", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <div class="notification is-warning">
            There was something wrong. Please contact us if you think this is our fault. (Error 4.22.1)
          </div>
          <form>
            <label>Email <input type="email" name="email" value="team@enrichanything.com" /></label>
          </form>
        </body>
      </html>`);

    const signals = await __private.collectAuthFailureSignals(page);

    assert.deepEqual(signals.invalidFields, []);
    assert.match(JSON.stringify(signals.errorTexts), /Error 4\.22\.1/);
  } finally {
    await browser.close();
  }
});

test("restoreAuthFormValuesAfterCaptcha refills cleared signup inputs before retry", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <form>
            <label>Name <input name="name" pattern="[A-Za-z0-9_]+" /></label>
            <label>Email <input type="email" name="email" /></label>
            <label>Password <input type="password" name="password" /></label>
            <label>Password confirmation <input type="password" name="password_confirmation" /></label>
            <button type="submit">Create my account</button>
          </form>
        </body>
      </html>`);

    const locators = __private.buildAuthLocators(page);
    const restored = await __private.restoreAuthFormValuesAfterCaptcha(page, locators, {
      autoCreateAccount: true,
      fullName: "Swarm Tester",
      accountHandle: "swarmtester_17748",
      username: "qa@example.com",
      password: "Secret123!"
    });

    assert.deepEqual(
      restored.restored,
      ["full_name", "email", "password", "confirm_password"]
    );
    assert.equal(await page.locator('input[name="name"]').inputValue(), "swarmtester_17748");
    assert.equal(await page.locator('input[name="email"]').inputValue(), "qa@example.com");
    assert.equal(await page.locator('input[name="password"]').inputValue(), "Secret123!");
    assert.equal(await page.locator('input[name="password_confirmation"]').inputValue(), "Secret123!");
  } finally {
    await browser.close();
  }
});

test("retryInvalidAuthFields refills required signup fields reported by the page and resubmits", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <html>
        <body>
          <form id="signup-form">
            <label>Name <input name="user[name]" /></label>
            <label>Email <input type="email" name="subscriber[email]" /></label>
            <label>Phone <input type="tel" name="user[phone]" /></label>
            <label>Username <input name="user[username]" /></label>
            <label>Password <input type="password" name="user[password]" /></label>
            <label>Password confirmation <input type="password" name="user[password_confirmation]" /></label>
            <button type="submit">Create my account</button>
          </form>
          <script>
            window.__submitCount = 0;
            document.getElementById("signup-form").addEventListener("submit", (event) => {
              event.preventDefault();
              window.__submitCount += 1;
            });
          </script>
        </body>
      </html>`);

    const locators = __private.buildAuthLocators(page);
    const result = await __private.retryInvalidAuthFields(
      page,
      {
        invalidFields: [
          {
            label: "",
            name: "subscriber[email]",
            type: "email",
            validationMessage: "Please fill out this field."
          },
          {
            label: "",
            name: "user[name]",
            type: "text",
            validationMessage: "Please fill out this field."
          },
          {
            label: "",
            name: "user[phone]",
            type: "tel",
            validationMessage: "Please fill out this field."
          }
        ],
        errorTexts: []
      },
      locators,
      {
        autoCreateAccount: true,
        fullName: "EnrichAnything",
        phone: "6505550100",
        accountHandle: "team_enrichanything",
        username: "team+betalist@enrichanything.com",
        password: "Secret123!"
      }
    );

    assert.equal(result.retried, true);
    assert.deepEqual(result.restored, ["email", "full_name", "phone"]);
    assert.equal(await page.locator('input[name="subscriber[email]"]').inputValue(), "team+betalist@enrichanything.com");
    assert.equal(await page.locator('input[name="user[name]"]').inputValue(), "EnrichAnything");
    assert.equal(await page.locator('input[name="user[phone]"]').inputValue(), "6505550100");
    assert.equal(await page.evaluate(() => window.__submitCount), 1);
  } finally {
    await browser.close();
  }
});

test("performCredentialedLogin completes a direct username/password login flow", async () => {
  await withServer(
    {
      "/login": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form action="/app" method="get">
                <label>Email <input type="email" name="email" /></label>
                <label>Password <input type="password" name="password" /></label>
                <button type="submit">Sign in</button>
              </form>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Dashboard</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/login`,
              username: "qa@example.com",
              password: "Secret123!",
              otp_mode: "none"
            },
            metadata: {}
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.match(
          JSON.stringify(runLog),
          /auth_flow_completed/
        );
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin fails clearly when OTP is required but no provider is configured", async () => {
  const previousProvider = process.env.QA_OTP_PROVIDER;
  delete process.env.QA_OTP_PROVIDER;

  try {
    await withServer(
      {
        "/magic-login": (_req, res) => {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(`<!doctype html>
            <html>
              <body>
                <form action="/otp" method="get">
                  <label>Email <input type="email" name="email" /></label>
                  <button type="submit">Send code</button>
                </form>
              </body>
            </html>`);
        },
        "/otp": (_req, res) => {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(`<!doctype html>
            <html>
              <body>
                <label>Verification code <input type="text" autocomplete="one-time-code" /></label>
                <button type="button">Verify</button>
              </body>
            </html>`);
        }
      },
      async (baseUrl) => {
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await assert.rejects(
            performCredentialedLogin(page, {
              target_url: `${baseUrl}/app`,
              credentials: {
                login_url: `${baseUrl}/magic-login`,
                username: "qa@example.com",
                password: null,
                otp_mode: "provider_hook"
              },
              metadata: {}
            }),
            /no OTP provider is configured/i
          );
        } finally {
          await browser.close();
        }
      }
    );
  } finally {
    if (previousProvider) {
      process.env.QA_OTP_PROVIDER = previousProvider;
    }
  }
});

test("performCredentialedLogin completes an OTP login flow through the HTTP provider hook", async () => {
  let hookPolls = 0;

  await withServer(
    {
      "/magic-login": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form action="/otp" method="get">
                <label>Email <input type="email" name="email" /></label>
                <button type="submit">Send code</button>
              </form>
            </body>
          </html>`);
      },
      "/otp": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <label>Verification code <input id="otp" type="text" autocomplete="one-time-code" /></label>
              <button id="verify" type="button">Verify</button>
              <script>
                document.getElementById("verify").addEventListener("click", () => {
                  const value = document.getElementById("otp").value;
                  if (value === "654321") {
                    window.location.href = "/app";
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/otp-hook": async (req, res) => {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
        }
        JSON.parse(body || "{}");
        hookPolls += 1;

        res.writeHead(200, { "content-type": "application/json" });
        if (hookPolls === 1) {
          res.end(JSON.stringify({ pending: true }));
          return;
        }

        res.end(
          JSON.stringify({
            ok: true,
            code: "654321",
            message: {
              subject: "Verification code 654321",
              text: "Use code 654321 to sign in."
            }
          })
        );
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Authenticated</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/magic-login`,
              username: "qa@example.com",
              password: null,
              otp_mode: "provider_hook"
            },
            metadata: {
              otp_provider: "http",
              otp_provider_url: `${baseUrl}/otp-hook`,
              otp_inbox: {
                provider: "http",
                email: "qa@example.com"
              }
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(hookPolls, 2);
        assert.match(JSON.stringify(runLog), /otp_message_received/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin waits for a delayed OTP surface after submitting the email step", async () => {
  let hookPolls = 0;

  await withServer(
    {
      "/delayed-otp": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <div id="email-step">
                <p>We send a one-time code to your email so you can sign in.</p>
                <label>Email <input type="email" name="email" /></label>
                <button id="send" type="submit">Send code</button>
              </div>
              <div id="otp-step" hidden>
                <label>Verification code <input id="otp" type="text" autocomplete="one-time-code" /></label>
                <button id="verify" type="button">Verify</button>
              </div>
              <script>
                const emailInput = document.querySelector('input[name="email"]');
                const emailStep = document.getElementById('email-step');
                const otpStep = document.getElementById('otp-step');
                document.getElementById('send').addEventListener('click', (event) => {
                  event.preventDefault();
                  if (!emailInput.value) return;
                  setTimeout(() => {
                    emailStep.hidden = true;
                    otpStep.hidden = false;
                  }, 2500);
                });
                document.getElementById('verify').addEventListener('click', () => {
                  if (document.getElementById('otp').value === '654321') {
                    window.location.href = '/app';
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/otp-hook": async (req, res) => {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
        }
        JSON.parse(body || "{}");
        hookPolls += 1;

        res.writeHead(200, { "content-type": "application/json" });
        if (hookPolls === 1) {
          res.end(JSON.stringify({ pending: true }));
          return;
        }

        res.end(
          JSON.stringify({
            ok: true,
            code: "654321",
            message: {
              subject: "Verification code 654321",
              text: "Use code 654321 to sign in."
            }
          })
        );
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Authenticated</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/delayed-otp`,
              username: "qa@example.com",
              password: null,
              otp_mode: "provider_hook"
            },
            metadata: {
              otp_provider: "http",
              otp_provider_url: `${baseUrl}/otp-hook`,
              otp_inbox: {
                provider: "http",
                email: "qa@example.com"
              }
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(hookPolls, 2);
        assert.match(JSON.stringify(runLog), /otp_gate_detected/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin retries an email-only OTP form with requestSubmit when the first click does not advance", async () => {
  let hookPolls = 0;

  await withServer(
    {
      "/retry-otp": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="login-form" action="/otp" method="get">
                <p>We send a one-time code to your email so you can sign in.</p>
                <label>Email <input type="email" name="email" /></label>
                <button id="send" type="submit">Send code</button>
              </form>
              <script>
                window.__swallowClick = true;
                document.getElementById('send').addEventListener('click', (event) => {
                  if (!window.__swallowClick) {
                    return;
                  }
                  event.preventDefault();
                  window.__swallowClick = false;
                });
              </script>
            </body>
          </html>`);
      },
      "/otp": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <label>Verification code <input id="otp" type="text" autocomplete="one-time-code" /></label>
              <button id="verify" type="button">Verify</button>
              <script>
                document.getElementById('verify').addEventListener('click', () => {
                  if (document.getElementById('otp').value === '654321') {
                    window.location.href = '/app';
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/otp-hook": async (req, res) => {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
        }
        JSON.parse(body || "{}");
        hookPolls += 1;

        res.writeHead(200, { "content-type": "application/json" });
        if (hookPolls === 1) {
          res.end(JSON.stringify({ pending: true }));
          return;
        }

        res.end(
          JSON.stringify({
            ok: true,
            code: "654321",
            message: {
              subject: "Verification code 654321",
              text: "Use code 654321 to sign in."
            }
          })
        );
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Authenticated</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/retry-otp`,
              username: "qa@example.com",
              password: null,
              otp_mode: "provider_hook"
            },
            metadata: {
              otp_provider: "http",
              otp_provider_url: `${baseUrl}/otp-hook`,
              otp_inbox: {
                provider: "http",
                email: "qa@example.com"
              }
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(hookPolls, 2);
        assert.match(JSON.stringify(runLog), /auth_submit_retried/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin prefers explicit auth entry over generic onboarding CTA", async () => {
  await withServer(
    {
      "/login": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <div id="welcome">
                <button type="button" id="start-building">Start building</button>
                <button type="button" id="open-auth">Sign in</button>
              </div>
              <input id="search" type="text" placeholder="Search projects..." />
              <div id="auth-root" hidden>
                <form action="/app" method="get">
                  <label>Email <input type="email" name="email" autocomplete="email" /></label>
                  <button type="submit">Send code</button>
                </form>
              </div>
              <script>
                document.getElementById('start-building').addEventListener('click', () => {
                  document.getElementById('search').value = 'clicked-start-building';
                });
                document.getElementById('open-auth').addEventListener('click', () => {
                  document.getElementById('auth-root').hidden = false;
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Authenticated</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/login`,
              username: "qa@example.com",
              password: null,
              otp_mode: "none"
            },
            metadata: {}
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(await page.locator("#search").inputValue().catch(() => null), null);
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin prefers the actionable auth trigger when duplicate labels are stacked behind an overlay", async () => {
  await withServer(
    {
      "/login": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <head>
              <style>
                body { font-family: sans-serif; margin: 0; }
                header { position: relative; z-index: 1; padding: 16px; background: #fff; }
                .overlay {
                  position: fixed;
                  inset: 0;
                  z-index: 80;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: rgba(15, 23, 42, 0.55);
                }
                .card, .auth-card {
                  width: min(420px, calc(100vw - 32px));
                  background: #fff;
                  border-radius: 20px;
                  padding: 24px;
                  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.2);
                }
                #auth-root[hidden] { display: none; }
                label { display: block; margin-top: 12px; }
                input, button { width: 100%; margin-top: 8px; padding: 12px; }
              </style>
            </head>
            <body>
              <header>
                <button type="button" id="header-signin">Sign in</button>
              </header>
              <main style="padding: 24px;">
                <button type="button" id="sidebar-signin">Sign in</button>
              </main>
              <div id="welcome" class="overlay">
                <div class="card">
                  <h1>Welcome</h1>
                  <p>Choose how to continue.</p>
                  <button type="button" id="overlay-signin">Sign in</button>
                  <button type="button" id="start-building">Start building</button>
                </div>
              </div>
              <div id="auth-root" hidden>
                <div role="dialog" class="auth-card">
                  <form action="/app" method="get">
                    <label>Email <input autocomplete="email" name="email" placeholder="you@company.com" /></label>
                    <button type="submit">Send code</button>
                  </form>
                </div>
              </div>
              <script>
                const showAuth = () => {
                  document.getElementById("welcome").style.display = "none";
                  document.getElementById("auth-root").hidden = false;
                };
                document.getElementById("header-signin").addEventListener("click", () => {
                  document.body.setAttribute("data-wrong-target", "header");
                });
                document.getElementById("sidebar-signin").addEventListener("click", () => {
                  document.body.setAttribute("data-wrong-target", "sidebar");
                });
                document.getElementById("overlay-signin").addEventListener("click", showAuth);
                document.getElementById("start-building").addEventListener("click", () => {
                  document.getElementById("welcome").style.display = "none";
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Authenticated</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            target_url: `${baseUrl}/app`,
            credentials: {
              login_url: `${baseUrl}/login`,
              username: "qa@example.com",
              password: null,
              otp_mode: "none"
            },
            metadata: {}
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(await page.locator("body").getAttribute("data-wrong-target"), null);
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin auto-creates an account when no credentials are provided", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <a href="/signup">Sign up</a>
            </body>
          </html>`);
      },
      "/signup": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form action="/app" method="get">
                <label>Full name <input type="text" name="full_name" /></label>
                <label>Email <input type="email" name="email" /></label>
                <label>Password <input type="password" name="password" /></label>
                <label>Confirm password <input type="password" name="confirm_password" /></label>
                <button type="submit">Sign up</button>
              </form>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>New account</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_default_test",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none"
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.match(JSON.stringify(runLog), /auto_create_account/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin fills separate email, username, and confirmation fields on signup forms", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <a href="/register">Register</a>
            </body>
          </html>`);
      },
      "/register": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form">
                <label>Email <input type="email" name="email" autocomplete="email" /></label>
                <label>Username <input type="text" name="username" autocomplete="username" /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" /></label>
                <div>
                  <span>Confirmation</span>
                  <input type="password" name="confirmation" autocomplete="new-password" />
                </div>
                <button type="submit">Register</button>
              </form>
              <script>
                document.getElementById("signup-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  const email = document.querySelector('input[name="email"]').value;
                  const username = document.querySelector('input[name="username"]').value;
                  const password = document.querySelector('input[name="password"]').value;
                  const confirmation = document.querySelector('input[name="confirmation"]').value;
                  if (email && username && password && confirmation && password === confirmation && username !== email) {
                    window.location.href = "/app";
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Registered</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "saashub_register_shape_test",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true,
              otp_inbox: {
                provider: "imap",
                email: "team@enrichanything.com",
                host: "imap.forwardemail.net",
                port: 993,
                username: "team@enrichanything.com",
                password: "secret"
              }
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin fills separate first and last name fields on signup forms", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <a href="/register">Create account</a>
            </body>
          </html>`);
      },
      "/register": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form">
                <label>First name <input type="text" name="first_name" autocomplete="given-name" required /></label>
                <label>Last name <input type="text" name="last_name" autocomplete="family-name" required /></label>
                <label>Email <input type="email" name="email" autocomplete="email" required /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" required /></label>
                <label>Confirm password <input type="password" name="password_confirmation" autocomplete="new-password" required /></label>
                <button type="submit">Create account</button>
              </form>
              <script>
                document.getElementById("signup-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  const first = document.querySelector('input[name="first_name"]').value;
                  const last = document.querySelector('input[name="last_name"]').value;
                  const email = document.querySelector('input[name="email"]').value;
                  const password = document.querySelector('input[name="password"]').value;
                  const confirmation = document.querySelector('input[name="password_confirmation"]').value;
                  if (first && last && email && password && confirmation && password === confirmation) {
                    window.location.href = "/app?first=" + encodeURIComponent(first) + "&last=" + encodeURIComponent(last);
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Registered</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_split_name_fields_test",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          { runLog }
        );

        const currentUrl = new URL(page.url());
        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(currentUrl.pathname, "/app");
        assert.equal(currentUrl.searchParams.get("first"), "Swarm");
        assert.equal(currentUrl.searchParams.get("last"), "Tester");
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin fills required phone fields on signup forms", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <a href="/register">Create account</a>
            </body>
          </html>`);
      },
      "/register": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form">
                <label>First name <input type="text" name="first_name" autocomplete="given-name" required /></label>
                <label>Last name <input type="text" name="last_name" autocomplete="family-name" required /></label>
                <label>Email <input type="email" name="email" autocomplete="email" required /></label>
                <label>Phone <input type="tel" name="phone" autocomplete="tel" required /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" required /></label>
                <label>Confirm password <input type="password" name="password_confirmation" autocomplete="new-password" required /></label>
                <button type="submit">Register</button>
              </form>
              <script>
                document.getElementById("signup-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  const first = document.querySelector('input[name="first_name"]').value;
                  const last = document.querySelector('input[name="last_name"]').value;
                  const email = document.querySelector('input[name="email"]').value;
                  const phone = document.querySelector('input[name="phone"]').value;
                  const password = document.querySelector('input[name="password"]').value;
                  const confirmation = document.querySelector('input[name="password_confirmation"]').value;
                  if (first && last && email && phone && password && confirmation && password === confirmation) {
                    window.location.href = "/app?phone=" + encodeURIComponent(phone);
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Registered</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_phone_fields_test",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          { runLog }
        );

        const currentUrl = new URL(page.url());
        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(currentUrl.pathname, "/app");
        assert.equal(currentUrl.searchParams.get("phone"), "6505550100");
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin fills separate first and last name fields on signup forms even with provided credentials", async () => {
  await withServer(
    {
      "/register": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form">
                <label>First name <input type="text" name="firstname" required /></label>
                <label>Last name <input type="text" name="lastname" required /></label>
                <label>Email <input type="email" name="email" autocomplete="username" required /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" required /></label>
                <label>Confirm your password <input type="password" name="retypePassword" autocomplete="new-password" required /></label>
                <button type="submit">Sign up</button>
              </form>
              <script>
                document.getElementById("signup-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  const first = document.querySelector('input[name="firstname"]').value;
                  const last = document.querySelector('input[name="lastname"]').value;
                  const email = document.querySelector('input[name="email"]').value;
                  const password = document.querySelector('input[name="password"]').value;
                  const confirmation = document.querySelector('input[name="retypePassword"]').value;
                  if (first && last && email && password && confirmation && password === confirmation) {
                    window.location.href = "/app?first=" + encodeURIComponent(first) + "&last=" + encodeURIComponent(last) + "&email=" + encodeURIComponent(email);
                  }
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Registered</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_split_name_fields_with_credentials_test",
            target_url: `${baseUrl}/register`,
            credentials: {
              login_url: `${baseUrl}/register`,
              username: "qa+icypeas@example.com",
              password: "Secret123!"
            },
            metadata: {
              otp_provider: "none"
            }
          },
          { runLog }
        );

        const currentUrl = new URL(page.url());
        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, false);
        assert.equal(currentUrl.pathname, "/app");
        assert.equal(currentUrl.searchParams.get("first"), "Swarm");
        assert.equal(currentUrl.searchParams.get("last"), "Tester");
        assert.equal(currentUrl.searchParams.get("email"), "qa+icypeas@example.com");
        assert.match(JSON.stringify(runLog), /"mode":"signup"/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin prefers explicit auth nav before hero CTA during auto-create flows", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <header>
                <button type="button" id="nav-signin">Sign in</button>
              </header>
              <main>
                <input type="text" id="site-url" placeholder="https://yourwebsite.com" />
                <button type="button" id="hero-start-free">Start free</button>
              </main>
              <div id="auth-root" hidden data-mode="signin">
                <button type="button" id="tab-signin">Sign in</button>
                <button type="button" id="tab-signup">Sign up</button>
                <form id="signin-form" hidden>
                  <label>Email <input type="email" name="signin_email" autocomplete="email" /></label>
                  <button type="submit">Sign in</button>
                </form>
                <form id="signup-form" action="/app" method="get">
                  <label>Full name <input type="text" name="full_name" /></label>
                  <label>Email <input type="email" name="email" autocomplete="email" /></label>
                  <label>Password <input type="password" name="password" /></label>
                  <label>Confirm password <input type="password" name="confirm_password" /></label>
                  <button type="submit">Create account</button>
                </form>
              </div>
              <script>
                const authRoot = document.getElementById("auth-root");
                const signInForm = document.getElementById("signin-form");
                const signupForm = document.getElementById("signup-form");
                const setMode = (mode) => {
                  authRoot.dataset.mode = mode;
                  signInForm.hidden = mode !== "signin";
                  signupForm.hidden = mode !== "signup";
                };
                setMode("signin");
                document.getElementById("nav-signin").addEventListener("click", () => {
                  localStorage.setItem("auth-entry-clicked", "nav-signin");
                  authRoot.hidden = false;
                });
                document.getElementById("hero-start-free").addEventListener("click", () => {
                  document.body.setAttribute("data-wrong-target", "hero-start-free");
                  localStorage.setItem("auth-entry-clicked", "hero-start-free");
                });
                document.getElementById("tab-signin").addEventListener("click", () => {
                  localStorage.setItem("auth-mode-selected", "signin");
                  setMode("signin");
                });
                document.getElementById("tab-signup").addEventListener("click", () => {
                  localStorage.setItem("auth-mode-selected", "signup");
                  setMode("signup");
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>New account</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_prefers_signin_nav_test",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none"
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(await page.locator("body").getAttribute("data-wrong-target"), null);
        assert.equal(await page.evaluate(() => localStorage.getItem("auth-entry-clicked")), "nav-signin");
        assert.equal(await page.evaluate(() => localStorage.getItem("auth-mode-selected")), "signup");
        assert.match(JSON.stringify(runLog), /auth_flow_completed/);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin switches from login to signup when auto-create is requested on continue-style auth forms", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <button type="button" id="open-auth">Log in</button>
              <div id="auth-root" hidden data-mode="signin">
                <form id="signin-form">
                  <h1>Log in</h1>
                  <label>Email <input type="email" name="signin_email" autocomplete="email" /></label>
                  <label>Password <input type="password" name="signin_password" autocomplete="current-password" /></label>
                  <p>Need an account? <a href="#" id="signup-link">Sign up</a></p>
                  <button type="submit">Continue</button>
                </form>
                <form id="signup-form" action="/app" method="get" hidden>
                  <h1>Sign up</h1>
                  <label>Email <input type="email" name="email" autocomplete="email" /></label>
                  <label>Password <input type="password" name="password" autocomplete="new-password" /></label>
                  <label>Confirm password <input type="password" name="confirm_password" /></label>
                  <button type="submit">Continue</button>
                </form>
              </div>
              <script>
                const authRoot = document.getElementById("auth-root");
                const signInForm = document.getElementById("signin-form");
                const signUpForm = document.getElementById("signup-form");
                const setMode = (mode) => {
                  authRoot.dataset.mode = mode;
                  signInForm.hidden = mode !== "signin";
                  signUpForm.hidden = mode !== "signup";
                  localStorage.setItem("auth-mode-selected", mode);
                };
                document.getElementById("open-auth").addEventListener("click", () => {
                  authRoot.hidden = false;
                  setMode("signin");
                });
                document.getElementById("signup-link").addEventListener("click", (event) => {
                  event.preventDefault();
                  setMode("signup");
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Signed up</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_switch_continue_form",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          { runLog }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(result.autoCreatedAccount, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.equal(await page.evaluate(() => localStorage.getItem("auth-mode-selected")), "signup");
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin stops instead of submitting login when auto-create is requested but signup never opens", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <button type="button" id="open-auth">Log in</button>
              <div id="auth-root" hidden data-mode="signin">
                <form id="signin-form">
                  <h1>Log in</h1>
                  <label>Email <input type="email" name="signin_email" autocomplete="email" /></label>
                  <label>Password <input type="password" name="signin_password" autocomplete="current-password" /></label>
                  <p>Need an account? <a href="#" id="signup-link">Sign up</a></p>
                  <button type="submit">Continue</button>
                </form>
              </div>
              <script>
                document.getElementById("open-auth").addEventListener("click", () => {
                  document.getElementById("auth-root").hidden = false;
                });
                document.getElementById("signup-link").addEventListener("click", (event) => {
                  event.preventDefault();
                });
                document.getElementById("signin-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  window.__loginSubmitted = true;
                });
              </script>
            </body>
          </html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await assert.rejects(
          performCredentialedLogin(
            page,
            {
              run_id: "signup_switch_must_work",
              target_url: `${baseUrl}/`,
              scope_mode: "feature_targeted",
              metadata: {
                otp_provider: "none",
                auto_create_account: true
              }
            },
            {}
          ),
          /sign-up form never opened/i
        );

        assert.equal(await page.evaluate(() => window.__loginSubmitted === true), false);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin follows a signup link route before submitting when auto-create is requested", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signin-form">
                <h1>Log in</h1>
                <label>Email <input type="email" name="signin_email" autocomplete="email" /></label>
                <label>Password <input type="password" name="signin_password" autocomplete="current-password" /></label>
                <p>Need an account? <a href="/signup">Sign up</a></p>
                <button type="submit">Continue</button>
              </form>
            </body>
          </html>`);
      },
      "/signup": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form" action="/app" method="get">
                <h1>Sign up</h1>
                <label>Email <input type="email" name="email" autocomplete="email" /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" /></label>
                <button type="submit">Continue</button>
              </form>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Signed up</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_route_switch",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          {}
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin treats a generic continue form as sign-up when the page exposes a login switch instead", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signin-form">
                <h1>Log in</h1>
                <label>Email <input type="email" name="signin_email" autocomplete="email" /></label>
                <label>Password <input type="password" name="signin_password" autocomplete="current-password" /></label>
                <p>Need an account? <a href="/signup">Sign up</a></p>
                <button type="submit">Continue</button>
              </form>
            </body>
          </html>`);
      },
      "/signup": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form" action="/app" method="get">
                <p>Already have an account? <a href="/">Log in</a></p>
                <label>Email <input type="email" name="email" autocomplete="email" /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" /></label>
                <button type="submit">Continue</button>
              </form>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Signed up</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_generic_continue_switch",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          {}
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
      } finally {
        await browser.close();
      }
    }
  );
});

test("performCredentialedLogin resolves invisible captcha challenges via the captcha probe", async () => {
  await withServer(
    {
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html>
          <html>
            <body>
              <form id="signup-form">
                <h1>Create account</h1>
                <label>Email <input type="email" name="email" autocomplete="email" /></label>
                <label>Password <input type="password" name="password" autocomplete="new-password" /></label>
                <button type="submit">Sign up</button>
              </form>
              <script>
                window.__captchaResolved = false;
                window.__submitCount = 0;
                document.getElementById("signup-form").addEventListener("submit", (event) => {
                  event.preventDefault();
                  window.__submitCount += 1;
                  if (!window.__captchaResolved) {
                    return;
                  }
                  window.location.href = "/app";
                });
              </script>
            </body>
          </html>`);
      },
      "/app": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><body><main><h1>Signed up</h1></main></body></html>`);
      }
    },
    async (baseUrl) => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const runLog = [];
        const result = await performCredentialedLogin(
          page,
          {
            run_id: "signup_invisible_captcha_probe",
            target_url: `${baseUrl}/`,
            scope_mode: "feature_targeted",
            metadata: {
              otp_provider: "none",
              auto_create_account: true
            }
          },
          {
            runLog,
            captchaPostWaitMs: 1,
            hasCaptchaChallenge: async (authPage) =>
              authPage.evaluate(() => window.__submitCount >= 1 && window.__captchaResolved !== true),
            resolveCaptcha: async (authPage) => {
              await authPage.evaluate(() => {
                window.__captchaResolved = true;
              });
              return { ok: true, resolved: true };
            }
          }
        );

        assert.equal(result.attempted, true);
        assert.equal(result.success, true);
        assert.equal(page.url().startsWith(`${baseUrl}/app`), true);
        assert.match(JSON.stringify(runLog), /auth_captcha_detected/);
        assert.match(JSON.stringify(runLog), /challenge_probe/);
        assert.match(JSON.stringify(runLog), /post_captcha_submit/);
      } finally {
        await browser.close();
      }
    }
  );
});
