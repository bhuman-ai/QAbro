const { normalizeUrl, sanitizeString } = require("./qa-core");
const { listHumanTestRequests } = require("./human-test-requests");
const { sendTesterJobAvailableEmail } = require("./qa-alert-email");
const { listTesterApplications } = require("./tester-applications");

const ACTIVE_REQUEST_STATUSES = ["assigned", "in_progress", "submitted"];

function selectEligibleTesterApplications(applications = [], activeRequests = []) {
  const busyApplicationIds = new Set();
  const busyEmails = new Set();

  for (const request of activeRequests) {
    const applicationId = sanitizeString(request?.assigned_tester_application_id, 128);
    const email = sanitizeString(request?.assigned_tester_email, 320).toLowerCase();
    if (applicationId) busyApplicationIds.add(applicationId);
    if (email) busyEmails.add(email);
  }

  const byEmail = new Map();
  for (const application of applications) {
    const email = sanitizeString(application?.owner_email, 320).toLowerCase();
    const devices = Array.isArray(application?.devices) ? application.devices : [];
    const eligible =
      application?.status === "applied" &&
      application?.can_record === true &&
      devices.includes("computer") &&
      email &&
      !busyApplicationIds.has(sanitizeString(application?.id, 128)) &&
      !busyEmails.has(email);
    if (eligible && !byEmail.has(email)) byEmail.set(email, application);
  }

  return [...byEmail.values()];
}

async function notifyEligibleTestersAboutJob(request = {}, options = {}) {
  const listApplications = options.listTesterApplications || listTesterApplications;
  const listRequests = options.listHumanTestRequests || listHumanTestRequests;
  const sendEmail = options.sendTesterJobAvailableEmail || sendTesterJobAvailableEmail;
  const publicBaseUrl =
    normalizeUrl(options.publicBaseUrl || process.env.QA_PUBLIC_APP_URL || "https://beforeusersdo.com") ||
    "https://beforeusersdo.com/";
  const jobsUrl = new URL("/testers/jobs", publicBaseUrl).toString();

  const [applicationsResult, ...activeResults] = await Promise.all([
    listApplications({ status: "applied", limit: 200 }, options),
    ...ACTIVE_REQUEST_STATUSES.map((status) => listRequests({ status, limit: 200 }, options))
  ]);
  const failedLookup = [applicationsResult, ...activeResults].find((result) => !result?.ok);
  if (failedLookup) {
    return {
      ok: false,
      skipped: true,
      eligible_count: 0,
      sent_count: 0,
      failed_count: 0,
      error: failedLookup.error || "Could not load eligible testers"
    };
  }

  const activeRequests = activeResults.flatMap((result) => result.items || []);
  const eligible = selectEligibleTesterApplications(applicationsResult.items || [], activeRequests);
  if (!eligible.length) {
    return {
      ok: true,
      skipped: true,
      eligible_count: 0,
      sent_count: 0,
      failed_count: 0
    };
  }

  const deliveries = await Promise.all(
    eligible.map((application) =>
      Promise.resolve()
        .then(() =>
          sendEmail(
            {
              email: application.owner_email,
              name: application.name,
              durationMinutes: request.duration_minutes,
              jobsUrl
            },
            options
          )
        )
        .catch((error) => ({ ok: false, error: error?.message || "Could not send tester email" }))
    )
  );
  const sentCount = deliveries.filter((delivery) => delivery?.ok).length;
  const failedCount = deliveries.length - sentCount;

  return {
    ok: failedCount === 0,
    skipped: false,
    eligible_count: eligible.length,
    sent_count: sentCount,
    failed_count: failedCount,
    ...(failedCount ? { error: `Could not notify ${failedCount} eligible tester${failedCount === 1 ? "" : "s"}` } : {})
  };
}

module.exports = {
  ACTIVE_REQUEST_STATUSES,
  notifyEligibleTestersAboutJob,
  selectEligibleTesterApplications
};
