const crypto = require("crypto");

const ALLOWED_FINDING_TYPES = new Set([
  "bug",
  "frustration_point",
  "confusion_point",
  "aha_moment",
  "dead_end",
  "performance_issue",
  "accessibility_issue",
  "copy_issue"
]);

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

const ALLOWED_EMOTIONS = new Set([
  "confidence",
  "uncertainty",
  "frustration",
  "delight",
  "confusion",
  "trust",
  "distrust"
]);

function sanitizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseTimestamp(value) {
  const raw = sanitizeString(value, 100);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function extractToken(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return sanitizeString(
    req.headers["x-callback-secret"] || req.headers["x-qa-callback-secret"],
    512
  );
}

function secureCompare(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function readField(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return object[key];
    }
  }
  return undefined;
}

function validateFindingsArray(value) {
  if (!Array.isArray(value)) {
    return { ok: false, error: "`findings` must be an array" };
  }

  for (let index = 0; index < value.length; index += 1) {
    const finding = value[index];

    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      return { ok: false, error: `findings[${index}] must be an object` };
    }

    const findingId = sanitizeString(readField(finding, ["id"]), 128);
    if (!findingId) {
      return { ok: false, error: `findings[${index}].id is required` };
    }

    const findingType = sanitizeString(readField(finding, ["type"]), 64);
    if (!findingType) {
      return { ok: false, error: `findings[${index}].type is required` };
    }
    if (!ALLOWED_FINDING_TYPES.has(findingType)) {
      return { ok: false, error: `findings[${index}].type is invalid` };
    }

    const severity = sanitizeString(readField(finding, ["severity"]), 32).toLowerCase();
    if (severity && !ALLOWED_SEVERITIES.has(severity)) {
      return { ok: false, error: `findings[${index}].severity is invalid` };
    }

    const expectedBehavior = sanitizeString(
      readField(finding, ["expected_behavior", "expectedBehavior"]),
      4000
    );
    if (!expectedBehavior) {
      return { ok: false, error: `findings[${index}].expected_behavior is required` };
    }

    const observedBehavior = sanitizeString(
      readField(finding, ["observed_behavior", "observedBehavior"]),
      4000
    );
    if (!observedBehavior) {
      return { ok: false, error: `findings[${index}].observed_behavior is required` };
    }

    const emotionalReaction = readField(finding, ["emotional_reaction", "emotionalReaction"]);
    if (!emotionalReaction || typeof emotionalReaction !== "object" || Array.isArray(emotionalReaction)) {
      return { ok: false, error: `findings[${index}].emotional_reaction is required` };
    }

    const primaryEmotion = sanitizeString(
      readField(emotionalReaction, ["primary", "primary_emotion", "primaryEmotion"]),
      64
    ).toLowerCase();
    if (!primaryEmotion) {
      return { ok: false, error: `findings[${index}].emotional_reaction.primary is required` };
    }
    if (!ALLOWED_EMOTIONS.has(primaryEmotion)) {
      return { ok: false, error: `findings[${index}].emotional_reaction.primary is invalid` };
    }

    const intensity = readField(emotionalReaction, ["intensity"]);
    if (intensity !== undefined && intensity !== null) {
      if (typeof intensity !== "number" || Number.isNaN(intensity) || intensity < 1 || intensity > 5) {
        return { ok: false, error: `findings[${index}].emotional_reaction.intensity must be a number between 1 and 5` };
      }
    }

    const signals = readField(emotionalReaction, ["signals"]);
    if (signals !== undefined && signals !== null) {
      if (!Array.isArray(signals)) {
        return { ok: false, error: `findings[${index}].emotional_reaction.signals must be an array` };
      }

      for (let signalIndex = 0; signalIndex < signals.length; signalIndex += 1) {
        const signal = sanitizeString(signals[signalIndex], 120);
        if (!signal) {
          return {
            ok: false,
            error: `findings[${index}].emotional_reaction.signals[${signalIndex}] must be a non-empty string`
          };
        }
      }
    }
  }

  return { ok: true };
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const callbackSecret = sanitizeString(process.env.QA_CALLBACK_SECRET, 512);

  if (!supabaseUrl || !serviceKey || !callbackSecret) {
    return res.status(500).json({ ok: false, error: "Server is not configured" });
  }

  const providedToken = extractToken(req);
  if (!providedToken || !secureCompare(providedToken, callbackSecret)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: "Invalid payload" });
  }

  const runId = sanitizeString(body.run_id || body.runId || body.job_id || body.jobId, 128);
  if (!runId) {
    return res.status(400).json({ ok: false, error: "Missing run_id" });
  }

  const findings = body.findings;
  const findingsValidation = validateFindingsArray(findings);
  if (!findingsValidation.ok) {
    return res.status(400).json({ ok: false, error: findingsValidation.error });
  }

  const summarySource = body.summary;
  const summary =
    typeof summarySource === "string"
      ? sanitizeString(summarySource, 4000)
      : summarySource && typeof summarySource === "object"
        ? sanitizeString(JSON.stringify(summarySource), 4000)
        : "";

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? String(forwardedFor[0]).split(",")[0].trim()
    : String(forwardedFor || "").split(",")[0].trim();

  const row = {
    run_id: runId,
    target: sanitizeString(body.target || body.domain || body.app || body.url, 320) || null,
    status: sanitizeString(body.status, 64) || "completed",
    report_url: sanitizeString(body.report_url || body.reportUrl || body.report_link, 2048) || null,
    findings,
    summary: summary || null,
    source: sanitizeString(body.source, 64) || "qa_bot",
    delivered_at: parseTimestamp(body.delivered_at || body.completed_at || body.finished_at),
    payload: body,
    request_meta: {
      ip,
      user_agent: sanitizeString(req.headers["user-agent"], 512),
      content_type: sanitizeString(req.headers["content-type"], 128),
      origin: sanitizeString(req.headers.origin || req.headers.referer, 512)
    }
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/swarmtest_reports?on_conflict=run_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([row])
  });

  if (!response.ok) {
    let errorBody = {};
    try {
      errorBody = await response.json();
    } catch {
      // Ignore parse errors.
    }
    return res.status(500).json({
      ok: false,
      error: "Failed to save QA report",
      details: errorBody.message || undefined
    });
  }

  let saved = [];
  try {
    saved = await response.json();
  } catch {
    // Ignore parse errors; success already confirmed.
  }

  return res.status(200).json({
    ok: true,
    run_id: runId,
    id: Array.isArray(saved) && saved[0] ? saved[0].id : null
  });
};
