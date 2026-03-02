module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ ok: false, error: "Server is not configured" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }

  const rawEmail = String(body?.email || "").trim().toLowerCase();
  const email = rawEmail.slice(0, 320);
  const source = String(body?.source || "website").trim().slice(0, 64) || "website";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? String(forwardedFor[0]).split(",")[0].trim()
    : String(forwardedFor || "").split(",")[0].trim();
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 512);

  const payload = [
    {
      email,
      source,
      metadata: {
        ip,
        user_agent: userAgent
      }
    }
  ];

  const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/swarmtest_waitlist`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (supabaseResponse.ok) {
    return res.status(201).json({ ok: true });
  }

  let errorBody = {};
  try {
    errorBody = await supabaseResponse.json();
  } catch {
    // Ignore JSON parse errors and return generic message.
  }

  // Duplicate email (unique index on lower(email)) is treated as success.
  if (errorBody && (errorBody.code === "23505" || String(errorBody.message || "").includes("duplicate"))) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  return res.status(500).json({ ok: false, error: "Failed to save waitlist entry" });
};
