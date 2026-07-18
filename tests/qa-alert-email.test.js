const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const {
  buildQaTrialInviteEmailContent,
  buildTesterJobAvailableEmailContent,
  getQaAlertEmailConfigurationError,
  isQaAlertEmailConfigured,
  normalizeAlertEmailList,
  sendQaAlertEmail,
  sendTesterJobAvailableEmail
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

test("isQaAlertEmailConfigured requires SMTP auth and a Before Users Do sender", () => {
  assert.equal(
    isQaAlertEmailConfigured({
      QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
      QA_ALERT_EMAIL_SMTP_PORT: "465",
      QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@beforeusersdo.com",
      QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
      QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>"
    }),
    true
  );
  const unrelatedProject = {
    QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
    QA_ALERT_EMAIL_SMTP_PORT: "465",
    QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@example.com",
    QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
    QA_ALERT_EMAIL_FROM: "Other Project <alerts@otherproject.com>"
  };
  assert.equal(isQaAlertEmailConfigured(unrelatedProject), false);
  assert.match(getQaAlertEmailConfigurationError(unrelatedProject), /must use beforeusersdo\.com/i);
  assert.match(
    getQaAlertEmailConfigurationError({
      ...unrelatedProject,
      QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>"
    }),
    /SMTP account must use beforeusersdo\.com/i
  );
  assert.equal(
    isQaAlertEmailConfigured({
      ...unrelatedProject,
      QA_ALERT_EMAIL_SMTP_USERNAME: "opaque-provider-token",
      QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>"
    }),
    true
  );
  assert.equal(isQaAlertEmailConfigured({}), false);
});

test("sendQaAlertEmail refuses an unrelated project sender before opening SMTP", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transportCreated = false;
  nodemailer.createTransport = () => {
    transportCreated = true;
    throw new Error("transport should not be created");
  };

  try {
    const result = await sendQaAlertEmail(
      {
        schedule: { alert_email_to: "owner@example.com" },
        alert: { title: "Test alert" }
      },
      {
        env: {
          QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
          QA_ALERT_EMAIL_SMTP_PORT: "465",
          QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@otherproject.com",
          QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
          QA_ALERT_EMAIL_FROM: "Other Project <alerts@otherproject.com>"
        }
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.match(result.error, /must use beforeusersdo\.com/i);
    assert.equal(transportCreated, false);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
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
  const queuedLead = buildQaTrialInviteEmailContent({
    role: "lead",
    productName: "Ciaro Pro",
    testFocus: "Try signup and reach the dashboard.",
    trialUrl: "https://beforeusersdo.com/trial?session_id=trial_1&token=bud_trial_lead",
    leadPreapproved: true
  });

  assert.match(tester.subject, /first BUD Verified Trial/i);
  assert.match(tester.text, /Before Users Do/);
  assert.match(tester.text, /bud_trial_secret/);
  assert.doesNotMatch(tester.text, /SwarmTester/i);
  assert.match(lead.subject, /free product test/i);
  assert.match(lead.text, /bud_trial_lead/);
  assert.match(queuedLead.subject, /being assigned/i);
  assert.match(queuedLead.text, /Track test/);
});

test("tester job alert has one public action and does not reveal customer details", () => {
  const content = buildTesterJobAvailableEmailContent({
    name: "Maya",
    durationMinutes: 30,
    jobsUrl: "https://beforeusersdo.com/testers/jobs"
  });

  assert.match(content.subject, /qualification is ready/i);
  assert.match(content.text, /Hi Maya/);
  assert.match(content.text, /unpaid/i);
  assert.match(content.text, /first verified tester score/i);
  assert.match(content.text, /https:\/\/beforeusersdo\.com\/testers\/jobs/);
  assert.doesNotMatch(content.text, /target URL|known issue|benchmark|customer/i);
});

test("paid tester alerts state the exact pay without exposing customer details", () => {
  const content = buildTesterJobAvailableEmailContent({
    name: "Maya",
    durationMinutes: 20,
    assignmentType: "paid",
    testerPayCents: 3500,
    testerPayCurrency: "USD",
    jobsUrl: "https://beforeusersdo.com/testers/jobs"
  });
  const invite = buildQaTrialInviteEmailContent({
    role: "tester",
    productName: "Example App",
    testFocus: "Review signup.",
    durationMinutes: 20,
    assignmentType: "paid",
    testerPayCents: 3500,
    testerPayCurrency: "USD",
    trialUrl: "https://beforeusersdo.com/trial?token=private"
  });

  assert.match(content.subject, /\$35 paid test/i);
  assert.match(content.text, /20-minute paid test/i);
  assert.match(content.text, /payment after reviewing/i);
  assert.doesNotMatch(content.text, /unpaid|customer/i);
  assert.match(invite.subject, /paid test ready/i);
  assert.match(invite.text, /pays? \$35|for \$35/i);
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
        QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@beforeusersdo.com",
        QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
        QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>",
        QA_ALERT_EMAIL_REPLY_TO: "support@beforeusersdo.com"
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
            ui_report_url: "https://beforeusersdo.com/dashboard?view=report&run_id=run_123&brand=clusterseo.com"
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
    assert.match(String(mailPayload.subject || ""), /Before Users Do/);
    assert.doesNotMatch(String(mailPayload.subject || ""), /SwarmTester/i);
    assert.match(String(mailPayload.text || ""), /Open report:/);
    assert.equal(mailPayload.replyTo, "support@beforeusersdo.com");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});

test("sendTesterJobAvailableEmail sends one private tester-board link", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let mailPayload = null;
  nodemailer.createTransport = () => ({
    async sendMail(payload) {
      mailPayload = payload;
      return { messageId: "tester_job_123" };
    }
  });

  try {
    const result = await withEnv(
      {
        QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
        QA_ALERT_EMAIL_SMTP_PORT: "465",
        QA_ALERT_EMAIL_SMTP_SECURE: "true",
        QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@beforeusersdo.com",
        QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
        QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>",
        QA_ALERT_EMAIL_REPLY_TO: "support@beforeusersdo.com"
      },
      () =>
        sendTesterJobAvailableEmail({
          email: "maya@example.com",
          name: "Maya",
          durationMinutes: 30,
          jobsUrl: "https://beforeusersdo.com/testers/jobs"
        })
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "tester_job_123");
    assert.deepEqual(mailPayload.to, ["maya@example.com"]);
    assert.match(mailPayload.text, /https:\/\/beforeusersdo\.com\/testers\/jobs/);
    assert.equal(mailPayload.replyTo, "support@beforeusersdo.com");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});
