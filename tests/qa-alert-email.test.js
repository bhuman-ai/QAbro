const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const {
  buildQaTrialInviteEmailContent,
  isQaAlertEmailConfigured,
  normalizeAlertEmailList,
  sendQaAlertEmail
} = require("../lib/qa-alert-email");

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("normalizeAlertEmailList dedupes and lowercases recipients", () => {
  assert.deepEqual(normalizeAlertEmailList("Team@Example.com, qa@example.com; team@example.com"), [
    "team@example.com",
    "qa@example.com"
  ]);
});

test("isQaAlertEmailConfigured requires SMTP host, auth, and from address", () => {
  assert.equal(
    isQaAlertEmailConfigured({
      QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
      QA_ALERT_EMAIL_SMTP_PORT: "465",
      QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@example.com",
      QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
      QA_ALERT_EMAIL_FROM: "Swarm Tester <alerts@example.com>"
    }),
    true
  );
  assert.equal(isQaAlertEmailConfigured({}), false);
});

test("trial invitation copy uses Before Users Do branding and the private role link", () => {
  const tester = buildQaTrialInviteEmailContent({
    role: "tester",
    productName: "Ciaro Pro",
    testFocus: "Try signup and reach the dashboard.",
    durationMinutes: 30,
    trialUrl: "https://beforeusersdo.com/trial?session_id=trial_1&token=bud_trial_secret"
  });
  const lead = buildQaTrialInviteEmailContent({
    role: "lead",
    productName: "Ciaro Pro",
    testFocus: "Try signup and reach the dashboard.",
    trialUrl: "https://beforeusersdo.com/trial?session_id=trial_1&token=bud_trial_lead"
  });

  assert.match(tester.subject, /first BUD Verified Trial/i);
  assert.match(tester.text, /Before Users Do/);
  assert.match(tester.text, /bud_trial_secret/);
  assert.doesNotMatch(tester.text, /SwarmTester/i);
  assert.match(lead.subject, /free product test/i);
  assert.match(lead.text, /bud_trial_lead/);
});

test("sendQaAlertEmail sends the scheduled QA alert to the configured recipient", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transportConfig = null;
  let mailPayload = null;

  nodemailer.createTransport = (config) => {
    transportConfig = config;
    return {
      async sendMail(payload) {
        mailPayload = payload;
        return { messageId: "message_123" };
      }
    };
  };

  try {
    const result = await withEnv(
      {
        QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
        QA_ALERT_EMAIL_SMTP_PORT: "465",
        QA_ALERT_EMAIL_SMTP_SECURE: "true",
        QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@example.com",
        QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
        QA_ALERT_EMAIL_FROM: "Swarm Tester <alerts@example.com>",
        QA_ALERT_EMAIL_REPLY_TO: "support@example.com"
      },
      () =>
        sendQaAlertEmail({
          schedule: {
            brand_key: "clusterseo.com",
            target_url: "https://clusterseo.com",
            alert_email_to: "team@example.com"
          },
          alert: {
            title: "Sign-up returned to the login screen",
            message: "The tester clicked Sign up and got sent back to the login page.",
            severity: "high",
            ui_report_url: "https://swarmtester.com/dashboard?view=report&run_id=run_123&brand=clusterseo.com"
          },
          report: {
            run_id: "run_123",
            status: "partial"
          }
        })
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "message_123");
    assert.equal(transportConfig.host, "smtp.example.com");
    assert.equal(transportConfig.port, 465);
    assert.equal(transportConfig.secure, true);
    assert.deepEqual(mailPayload.to, ["team@example.com"]);
    assert.match(String(mailPayload.subject || ""), /Sign-up returned to the login screen/);
    assert.match(String(mailPayload.text || ""), /Open report:/);
    assert.equal(mailPayload.replyTo, "support@example.com");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});
