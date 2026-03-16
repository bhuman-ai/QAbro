const fs = require("fs");
const path = require("path");
const { loadStoredReportByRunId, sanitizeString } = require("../../lib/qa-core");
const { extractOwnerUserId } = require("../../lib/qa-queue");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

function readEvidenceList(report, kind, payload = null) {
  const safeReport = report && typeof report === "object" ? report : {};
  const gallery =
    safeReport.evidence_gallery && typeof safeReport.evidence_gallery === "object"
      ? safeReport.evidence_gallery
      : {};
  const findings = Array.isArray(safeReport.findings) ? safeReport.findings : [];
  const journeys = Array.isArray(safeReport.tested_journeys) ? safeReport.tested_journeys : [];
  const field = kind === "video" ? "videos" : "screenshots";

  const values = [];
  if (Array.isArray(gallery[field])) {
    values.push(...gallery[field]);
  }

  for (const finding of findings) {
    const evidence = finding && typeof finding.evidence === "object" ? finding.evidence : {};
    if (Array.isArray(evidence[field])) {
      values.push(...evidence[field]);
    }
  }

  for (const journey of journeys) {
    const evidence = journey && typeof journey.evidence === "object" ? journey.evidence : {};
    if (Array.isArray(evidence[field])) {
      values.push(...evidence[field]);
    }
  }

  const safePayload = payload && typeof payload === "object" ? payload : {};
  const artifacts = safePayload.artifacts && typeof safePayload.artifacts === "object" ? safePayload.artifacts : {};
  if (kind === "screenshot" && Array.isArray(artifacts.local_screenshots)) {
    values.push(...artifacts.local_screenshots);
  }
  if (kind === "video" && artifacts.local_video_path) {
    values.push(artifacts.local_video_path);
  }

  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = sanitizeString(value, 2000000);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function isHttpUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyLocalPath(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return false;
  }
  return raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../") || /^[a-zA-Z]:\\/.test(raw);
}

function resolveLocalEvidencePath(value) {
  if (!isLikelyLocalPath(value)) {
    return null;
  }

  const raw = sanitizeString(value, 4096);
  const cwd = path.resolve(process.cwd());
  const configuredRoot = sanitizeString(process.env.QA_LOCAL_EVIDENCE_ROOT, 4096);
  const allowedRoots = [path.resolve(cwd, "output"), path.resolve(cwd, ".playwright-cli")];
  if (configuredRoot) {
    const resolvedConfiguredRoot = path.resolve(configuredRoot);
    allowedRoots.push(resolvedConfiguredRoot);
  }

  const resolved = path.normalize(path.isAbsolute(raw) ? raw : path.resolve(cwd, raw));
  const inAllowedRoot = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`)
  );
  if (!inAllowedRoot) {
    return null;
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return resolved;
}

function buildRemoteEvidenceUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return "";
  }

  const baseUrl = sanitizeString(process.env.QA_REMOTE_EVIDENCE_BASE_URL, 4096).replace(/\/$/, "");
  if (!baseUrl) {
    return "";
  }

  let relativePath = "";
  const normalizedRaw = raw.replaceAll("\\", "/");
  const configuredRoot = sanitizeString(process.env.QA_REMOTE_EVIDENCE_ROOT, 4096).replaceAll("\\", "/").replace(/\/$/, "");
  if (configuredRoot && normalizedRaw.startsWith(`${configuredRoot}/`)) {
    relativePath = normalizedRaw.slice(configuredRoot.length + 1);
  } else {
    const outputIndex = normalizedRaw.toLowerCase().indexOf("/output/");
    if (outputIndex >= 0) {
      relativePath = normalizedRaw.slice(outputIndex + "/output/".length);
    }
  }

  relativePath = relativePath.replace(/^\/+/, "");
  if (!relativePath || relativePath.startsWith("..")) {
    return "";
  }

  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!encodedPath) {
    return "";
  }

  return `${baseUrl}/${encodedPath}`;
}

function getContentTypeFromExtension(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  const imageTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon"
  };
  const videoTypes = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".m3u8": "application/vnd.apple.mpegurl"
  };

  return imageTypes[ext] || videoTypes[ext] || "";
}

function getContentTypeFromUrlPath(value) {
  try {
    const parsed = new URL(String(value || ""));
    return getContentTypeFromExtension(parsed.pathname || "");
  } catch {
    return "";
  }
}

function decodeDataUrl(value) {
  const dataUrl = sanitizeString(value, 2000000);
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  const contentType = sanitizeString(match[1], 256) || "application/octet-stream";
  const base64 = match[2].replace(/\s+/g, "");
  if (!base64) {
    return null;
  }

  try {
    return {
      contentType,
      data: Buffer.from(base64, "base64")
    };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const runId = sanitizeString(req.query?.run_id || req.query?.runId, 128);
  const kind = sanitizeString(req.query?.kind, 32).toLowerCase();
  const index = Number.parseInt(sanitizeString(req.query?.index, 16), 10);

  if (!runId) {
    return res.status(400).json({ ok: false, error: "run_id is required" });
  }
  if (!["screenshot", "video"].includes(kind)) {
    return res.status(400).json({ ok: false, error: "kind must be screenshot or video" });
  }
  if (!Number.isFinite(index) || index < 0) {
    return res.status(400).json({ ok: false, error: "index must be a non-negative integer" });
  }

  const loaded = await loadStoredReportByRunId(runId);
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  if (ownerUserId) {
    const rowOwnerUserId = sanitizeString(extractOwnerUserId(loaded.row), 128);
    if (!rowOwnerUserId || rowOwnerUserId !== ownerUserId) {
      return res.status(404).json({ ok: false, error: "Run not found" });
    }
  }

  const payload = loaded.row && loaded.row.payload && typeof loaded.row.payload === "object"
    ? loaded.row.payload
    : {};
  const report =
    payload.report_json && typeof payload.report_json === "object"
      ? payload.report_json
      : {};

  const values = readEvidenceList(report, kind, payload);
  const source = values[index];
  if (!source) {
    return res.status(404).json({ ok: false, error: "Evidence item not found" });
  }

  const dataUrlPayload = decodeDataUrl(source);
  if (dataUrlPayload) {
    const expectedPrefix = kind === "video" ? "video/" : "image/";
    if (!dataUrlPayload.contentType.toLowerCase().startsWith(expectedPrefix)) {
      return res.status(415).json({ ok: false, error: "Evidence item is not embeddable media" });
    }

    res.setHeader("Content-Type", dataUrlPayload.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(dataUrlPayload.data);
  }

  const localPath = resolveLocalEvidencePath(source);
  if (localPath) {
    const contentType = getContentTypeFromExtension(localPath);
    if (!contentType) {
      return res.status(415).json({ ok: false, error: "Evidence item is not embeddable media" });
    }
    if (kind === "video" && !contentType.startsWith("video/") && contentType !== "application/vnd.apple.mpegurl") {
      return res.status(415).json({ ok: false, error: "Evidence item is not playable video media" });
    }
    if (kind === "screenshot" && !contentType.startsWith("image/")) {
      return res.status(415).json({ ok: false, error: "Evidence item is not image media" });
    }

    try {
      const data = fs.readFileSync(localPath);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.status(200).send(data);
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Failed to read local evidence file" });
    }
  }

  const remoteEvidenceUrl = isLikelyLocalPath(source) ? buildRemoteEvidenceUrl(source) : "";
  const sourceUrl = isHttpUrl(source) ? source : remoteEvidenceUrl;
  if (!isHttpUrl(sourceUrl)) {
    return res.status(415).json({ ok: false, error: "Evidence item is not embeddable media" });
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(sourceUrl, {
      headers: {
        Accept: kind === "video" ? "video/*,*/*;q=0.8" : "image/*,*/*;q=0.8"
      }
    });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || "Failed to fetch evidence media" });
  }

  if (!upstreamResponse.ok) {
    return res.status(502).json({ ok: false, error: "Failed to fetch evidence media" });
  }

  const headerContentType = sanitizeString(upstreamResponse.headers.get("content-type"), 256).toLowerCase();
  const inferredContentType = getContentTypeFromUrlPath(sourceUrl).toLowerCase();
  const contentType =
    headerContentType && headerContentType !== "application/octet-stream"
      ? headerContentType
      : inferredContentType;
  if (kind === "video" && !contentType.startsWith("video/") && contentType !== "application/vnd.apple.mpegurl") {
    return res.status(415).json({ ok: false, error: "Evidence item is not playable video media" });
  }
  if (kind === "screenshot" && !contentType.startsWith("image/")) {
    return res.status(415).json({ ok: false, error: "Evidence item is not image media" });
  }

  const arrayBuffer = await upstreamResponse.arrayBuffer();
  res.setHeader("Content-Type", contentType || headerContentType || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=600");
  return res.status(200).send(Buffer.from(arrayBuffer));
};
