const { sanitizeOptionalString, sanitizeString } = require("./qa-core");

function parseBoolean(value, fallbackValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function normalizeBaseUrl(value) {
  return sanitizeString(value, 4096).replace(/\/+$/, "");
}

function pickExistingLiveStreamArtifacts(existingArtifacts = {}) {
  const existing = existingArtifacts && typeof existingArtifacts === "object" ? existingArtifacts : {};
  const mode = sanitizeOptionalString(existing.live_stream_mode, 64) || null;
  const publicBaseUrl = normalizeBaseUrl(existing.live_stream_public_base_url || "");
  const embedUrl = sanitizeOptionalString(existing.live_stream_embed_url, 4096) || null;
  const viewerUrl = sanitizeOptionalString(existing.live_stream_viewer_url, 4096) || null;
  const enabled =
    typeof existing.live_stream_enabled === "boolean"
      ? existing.live_stream_enabled
      : Boolean(embedUrl || viewerUrl || publicBaseUrl);

  if (!enabled && !embedUrl && !viewerUrl && !publicBaseUrl) {
    return {};
  }

  return {
    live_stream_enabled: enabled,
    live_stream_mode: mode || "novnc",
    live_stream_public_base_url: publicBaseUrl || null,
    live_stream_view_only: existing.live_stream_view_only !== false,
    live_stream_embed_url: embedUrl,
    live_stream_viewer_url: viewerUrl
  };
}

function buildNoVncUrl(baseUrl, password, options = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("autoconnect", options.autoconnect === false ? "0" : "1");
  params.set("resize", sanitizeOptionalString(options.resize, 32) || "scale");
  params.set("reconnect", options.reconnect === false ? "0" : "1");
  params.set("show_dot", options.showDot === true ? "1" : "0");
  params.set("view_only", options.viewOnly === false ? "0" : "1");
  params.set("path", sanitizeOptionalString(options.path, 64) || "websockify");
  if (password) {
    params.set("password", password);
  }

  return `${normalizedBaseUrl}/vnc.html?${params.toString()}`;
}

function buildLiveStreamArtifacts(existingArtifacts = {}) {
  const existing = pickExistingLiveStreamArtifacts(existingArtifacts);
  const enabled = parseBoolean(
    process.env.QA_LIVE_STREAM_ENABLED,
    existing.live_stream_enabled === true
  );
  const publicBaseUrl = normalizeBaseUrl(
    process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL || existing.live_stream_public_base_url || ""
  );

  if (!enabled || !publicBaseUrl) {
    return existing;
  }

  const password = sanitizeOptionalString(process.env.QA_LIVE_STREAM_PASSWORD, 512) || null;
  const embedUrl = buildNoVncUrl(publicBaseUrl, password, {
    autoconnect: true,
    resize: "scale",
    reconnect: true,
    viewOnly: true,
    showDot: false,
    path: "websockify"
  });
  const viewerUrl = buildNoVncUrl(publicBaseUrl, password, {
    autoconnect: true,
    resize: "remote",
    reconnect: true,
    viewOnly: false,
    showDot: false,
    path: "websockify"
  });

  return {
    live_stream_enabled: true,
    live_stream_mode: "novnc",
    live_stream_public_base_url: publicBaseUrl,
    live_stream_view_only: true,
    live_stream_embed_url: embedUrl,
    live_stream_viewer_url: viewerUrl
  };
}

module.exports = {
  buildLiveStreamArtifacts
};
