const test = require("node:test");
const assert = require("node:assert/strict");

const { createOtpBroker, __private } = require("../lib/otp-broker");

test("extractUrls returns unique HTTP(S) urls", () => {
  const text = `
    Welcome.
    Verify: https://example.com/verify?token=abc
    Repeat https://example.com/verify?token=abc
    Dashboard: http://foo.bar/path
  `;
  const urls = __private.extractUrls(text);
  assert.deepEqual(urls, ["https://example.com/verify?token=abc", "http://foo.bar/path"]);
});

test("extractOtpCandidates respects digit boundaries", () => {
  const body = "Code 123456 is valid. Ref 2026. Backup code 4321. Ignore 12 and 123456789.";
  const candidates = __private.extractOtpCandidates(body);
  assert.deepEqual(candidates, ["123456", "2026", "4321"]);
});

test("extractBestOtp prefers verification-context six-digit code", () => {
  const message = {
    subject: "Your Workolo Access-OTP is 123456",
    text: "Use OTP 123456 to verify your account. Year 2026 included."
  };
  const code = __private.extractBestOtp(message);
  assert.equal(code, "123456");
});

test("selectMostRecentMessage filters by subject and timestamp", () => {
  const messages = [
    { id: "a", subject: "welcome", createdAt: "2026-03-05T10:00:00.000Z", from: "noreply@example.com" },
    { id: "b", subject: "otp code", createdAt: "2026-03-05T10:01:00.000Z", from: "noreply@example.com" },
    { id: "c", subject: "otp code", createdAt: "2026-03-05T10:02:00.000Z", from: "alerts@example.com" }
  ];

  const selected = __private.selectMostRecentMessage(messages, {
    subjectPattern: /otp/i,
    senderPattern: /noreply/i,
    since: "2026-03-05T09:59:00.000Z"
  });

  assert.ok(selected);
  assert.equal(selected.id, "b");
});

test("createOtpBroker supports HTTP provider hook polling", async () => {
  let polls = 0;
  const fetchStub = async (_url, request) => {
    polls += 1;
    const payload = JSON.parse(String(request?.body || "{}"));
    if (polls === 1) {
      assert.equal(payload?.inbox?.email, "qa@example.com");
      return {
        ok: true,
        async text() {
          return JSON.stringify({ status: "pending" });
        }
      };
    }

    return {
      ok: true,
      async text() {
        return JSON.stringify({
          ok: true,
          message: {
            subject: "Your verification code is 654321",
            text: "Use verification code 654321 to finish sign-in."
          }
        });
      }
    };
  };

  const broker = createOtpBroker({
    provider: "http",
    httpUrl: "https://otp-hook.example.test/poll",
    fetch: fetchStub
  });

  const result = await broker.waitForOtpCode(
    {
      provider: "http",
      email: "qa@example.com"
    },
    {
      timeoutMs: 5000,
      pollIntervalMs: 1
    }
  );

  assert.equal(result.ok, true, result.error || "expected HTTP OTP hook to return a code");
  assert.equal(result.code, "654321");
  assert.equal(polls, 2);
});
