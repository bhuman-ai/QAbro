type AcquisitionEventName =
  | "offer_viewed"
  | "primary_cta_clicked"
  | "agent_install_step_copied"
  | "signup_completed";

type AuthMethod = "email" | "google" | "github" | "unknown";

type AttributionSnapshot = {
  visitor_id: string;
  landing_path: string;
  first_touch_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

const ATTRIBUTION_STORAGE_KEY = "beforeusersdo:first_touch:v1";
const AUTH_METHOD_STORAGE_KEY = "beforeusersdo:auth_method:v1";
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function randomVisitorId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sanitizeAttributionValue(value: string | null) {
  const normalized = String(value || "").trim().slice(0, 160);
  return normalized || null;
}

function sanitizeLandingPath(value: string) {
  const path = String(value || "").split("?")[0].split("#")[0];
  return path.startsWith("/") ? path.slice(0, 512) : "/";
}

function readStoredAttribution(storage = safeStorage()): AttributionSnapshot | null {
  if (!storage) {
    return null;
  }
  try {
    const parsed = JSON.parse(storage.getItem(ATTRIBUTION_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || typeof parsed.visitor_id !== "string") {
      return null;
    }
    return parsed as AttributionSnapshot;
  } catch {
    return null;
  }
}

function captureFirstTouch(
  locationValue: Pick<Location, "pathname" | "search"> = window.location,
  storage = safeStorage()
) {
  const existing = readStoredAttribution(storage);
  if (existing) {
    return existing;
  }

  const params = new URLSearchParams(locationValue.search);
  const snapshot: AttributionSnapshot = {
    visitor_id: randomVisitorId(),
    landing_path: sanitizeLandingPath(locationValue.pathname),
    first_touch_at: new Date().toISOString(),
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null
  };
  for (const field of UTM_FIELDS) {
    snapshot[field] = sanitizeAttributionValue(params.get(field));
  }

  try {
    storage?.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Tracking is optional and must never block the product.
  }
  return snapshot;
}

function buildEventKey(eventName: AcquisitionEventName, visitorId: string, suffix = "") {
  const safeSuffix = String(suffix || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 80);
  return `${eventName}:${visitorId}${safeSuffix ? `:${safeSuffix}` : ""}`;
}

async function postAcquisitionEvent(
  eventName: AcquisitionEventName,
  properties: Record<string, string>,
  suffix = ""
) {
  const snapshot = captureFirstTouch();
  try {
    const response = await fetch("/api/acquisition-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: true,
      body: JSON.stringify({
        event_name: eventName,
        event_key: buildEventKey(eventName, snapshot.visitor_id, suffix),
        visitor_id: snapshot.visitor_id,
        landing_path: snapshot.landing_path,
        attribution: {
          utm_source: snapshot.utm_source,
          utm_medium: snapshot.utm_medium,
          utm_campaign: snapshot.utm_campaign,
          utm_content: snapshot.utm_content,
          utm_term: snapshot.utm_term
        },
        properties
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function rememberAcquisitionAuthMethod(method: AuthMethod, storage = safeStorage()) {
  try {
    storage?.setItem(AUTH_METHOD_STORAGE_KEY, method);
  } catch {
    // Tracking is optional and must never block authentication.
  }
}

function readAcquisitionAuthMethod(storage = safeStorage()): AuthMethod {
  try {
    const method = storage?.getItem(AUTH_METHOD_STORAGE_KEY);
    return method === "email" || method === "google" || method === "github" ? method : "unknown";
  } catch {
    return "unknown";
  }
}

function trackOfferViewed(
  surface: "homepage" | "public_docs" | "qa_mcp",
  path: "/" | "/docs" | "/qa-mcp"
) {
  return postAcquisitionEvent("offer_viewed", { surface, path });
}

function trackInstallClicked(surface: "homepage" | "public_docs" | "qa_mcp") {
  return postAcquisitionEvent(
    "primary_cta_clicked",
    {
      surface,
      cta_label: "Install BeforeUsersDo",
      destination_path: "/dashboard"
    },
    surface
  );
}

function trackAgentInstallStepCopied(step: "mcp_config" | "skill_command") {
  return postAcquisitionEvent("agent_install_step_copied", { step }, step);
}

function trackSignupCompleted() {
  return postAcquisitionEvent(
    "signup_completed",
    { auth_method: readAcquisitionAuthMethod() },
    "authenticated"
  );
}

export {
  ATTRIBUTION_STORAGE_KEY,
  buildEventKey,
  captureFirstTouch,
  readStoredAttribution,
  rememberAcquisitionAuthMethod,
  trackAgentInstallStepCopied,
  trackInstallClicked,
  trackOfferViewed,
  trackSignupCompleted
};
