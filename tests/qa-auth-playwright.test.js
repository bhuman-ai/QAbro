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
      password: null,
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
