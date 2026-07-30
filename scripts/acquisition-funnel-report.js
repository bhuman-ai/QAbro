const { sanitizeString } = require("../lib/qa-core");

const FUNNEL_EVENTS = [
  "offer_viewed",
  "primary_cta_clicked",
  "signup_completed",
  "mcp_key_created",
  "mcp_key_first_used",
  "first_qa_requested",
  "first_qa_report_completed"
];

function personKey(event) {
  return sanitizeString(event?.visitor_id, 128) || sanitizeString(event?.owner_user_id, 128);
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number(((100 * numerator) / denominator).toFixed(1)) : null;
}

function summarizeAcquisitionEvents(events = []) {
  const identitiesByEvent = new Map(FUNNEL_EVENTS.map((name) => [name, new Set()]));
  const activationSeconds = [];

  for (const event of Array.isArray(events) ? events : []) {
    const eventName = sanitizeString(event?.event_name, 80);
    const identity = personKey(event);
    if (!identitiesByEvent.has(eventName) || !identity) {
      continue;
    }
    identitiesByEvent.get(eventName).add(identity);
    if (eventName === "first_qa_report_completed") {
      const value = Number(event?.properties?.activation_latency_seconds);
      if (Number.isFinite(value) && value >= 0) {
        activationSeconds.push(value);
      }
    }
  }

  const counts = Object.fromEntries(
    FUNNEL_EVENTS.map((name) => [name, identitiesByEvent.get(name).size])
  );
  activationSeconds.sort((left, right) => left - right);
  const middle = Math.floor(activationSeconds.length / 2);
  const medianActivationSeconds = activationSeconds.length
    ? activationSeconds.length % 2
      ? activationSeconds[middle]
      : Math.round((activationSeconds[middle - 1] + activationSeconds[middle]) / 2)
    : null;

  return {
    counts,
    rates: {
      cta_rate_pct: rate(counts.primary_cta_clicked, counts.offer_viewed),
      signup_rate_pct: rate(counts.signup_completed, counts.primary_cta_clicked),
      key_creation_rate_pct: rate(counts.mcp_key_created, counts.signup_completed),
      mcp_activation_rate_pct: rate(counts.mcp_key_first_used, counts.mcp_key_created),
      qa_request_rate_pct: rate(counts.first_qa_requested, counts.mcp_key_first_used),
      first_report_rate_pct: rate(counts.first_qa_report_completed, counts.first_qa_requested),
      landing_conversion_rate_pct: rate(counts.first_qa_report_completed, counts.offer_viewed)
    },
    median_activation_seconds: medianActivationSeconds
  };
}

async function loadAcquisitionEvents(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supabaseUrl || !serviceKey || typeof fetchImpl !== "function") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }

  const requestUrl = new URL(`${supabaseUrl}/rest/v1/swarmtest_acquisition_events`);
  requestUrl.searchParams.set(
    "select",
    "event_name,visitor_id,owner_user_id,occurred_at,utm_source,utm_medium,utm_campaign,properties"
  );
  requestUrl.searchParams.set("is_test", options.includeTest ? "in.(true,false)" : "eq.false");
  requestUrl.searchParams.set("order", "occurred_at.asc");
  requestUrl.searchParams.set("limit", "10000");

  const response = await fetchImpl(requestUrl.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    throw new Error(sanitizeString(rows?.message || rows?.error, 256) || "Could not load acquisition events");
  }
  return rows;
}

async function main() {
  const includeTest = process.argv.includes("--include-test");
  const json = process.argv.includes("--json");
  const events = await loadAcquisitionEvents({ includeTest });
  const summary = summarizeAcquisitionEvents(events);
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.table(
    FUNNEL_EVENTS.map((eventName) => ({
      event: eventName,
      people: summary.counts[eventName]
    }))
  );
  console.table(summary.rates);
  console.log("Median activation seconds:", summary.median_activation_seconds ?? "n/a");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || "Could not build acquisition report");
    process.exitCode = 1;
  });
}

module.exports = {
  FUNNEL_EVENTS,
  loadAcquisitionEvents,
  summarizeAcquisitionEvents
};
