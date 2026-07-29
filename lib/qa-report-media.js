const path = require("path");

const { sanitizeString } = require("./qa-core");

function normalizeEvidenceSource(value) {
  return sanitizeString(value, 4096).replaceAll("\\", "/");
}

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
    if (kind === "video" && Array.isArray(journey?.step_video_clips)) {
      for (const clip of journey.step_video_clips) {
        const ref = sanitizeString(
          clip?.video || clip?.video_url || clip?.videoUrl || clip?.source || clip?.url || clip?.path,
          4096
        );
        if (ref) {
          values.push(ref);
        }
      }
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

function getEmbeddedEvidenceMaxLength(kind) {
  return kind === "video" ? 8000000 : 2000000;
}

function readEvidenceMediaEntry(payload, kind, source) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const evidenceMedia =
    safePayload.evidence_media && typeof safePayload.evidence_media === "object"
      ? safePayload.evidence_media
      : {};
  const field = kind === "video" ? "videos" : "screenshots";
  const entries = Array.isArray(evidenceMedia[field]) ? evidenceMedia[field] : [];
  if (!entries.length) {
    return null;
  }

  const expectedSource = normalizeEvidenceSource(source);
  if (!expectedSource) {
    return null;
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const entrySources = [
      entry.source,
      entry.path,
      entry.raw,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]
      .map(normalizeEvidenceSource)
      .filter(Boolean);
    if (!entrySources.length || !entrySources.includes(expectedSource)) {
      continue;
    }

    const byteLength = Math.max(0, Number(entry.byte_length || entry.byteLength) || 0);
    return {
      source: entrySources[0],
      content_type: sanitizeString(entry.content_type || entry.contentType, 128) || null,
      data_url: sanitizeString(entry.data_url || entry.dataUrl || entry.value, getEmbeddedEvidenceMaxLength(kind)),
      storage_bucket: sanitizeString(entry.storage_bucket || entry.storageBucket || entry.bucket, 128) || null,
      storage_path:
        sanitizeString(entry.storage_path || entry.storagePath || entry.object_path || entry.objectPath, 4096)
          .replaceAll("\\", "/") || null,
      ...(byteLength ? { byte_length: byteLength } : {}),
      ...(entrySources.length > 1 ? { aliases: entrySources.slice(1) } : {})
    };
  }

  return null;
}

function isPortableEvidenceSource(source, entry) {
  if (entry?.data_url) {
    return true;
  }
  if (entry?.storage_bucket && entry?.storage_path) {
    return true;
  }
  return /^https?:\/\//i.test(sanitizeString(source, 4096)) || /^data:/i.test(sanitizeString(source, 4096));
}

function inferContentType(source, kind) {
  const extension = path.extname(String(source || "").split(/[?#]/, 1)[0]).toLowerCase();
  if (extension === ".webm") return "video/webm";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return kind === "video" ? "video/*" : "image/*";
}

function buildEvidenceUrl(runId, kind, index, shareKey) {
  const params = new URLSearchParams({
    run_id: sanitizeString(runId, 128),
    kind,
    index: String(index)
  });
  const safeShareKey = sanitizeString(shareKey, 512);
  if (safeShareKey) {
    params.set("share_key", safeShareKey);
  }
  return `/api/qa/evidence?${params.toString()}`;
}

function buildQaEvidenceManifest(report, payload, options = {}) {
  const runId = sanitizeString(options.runId || report?.run_id, 128);
  if (!runId) {
    return {
      recording: null,
      videos: [],
      screenshots: []
    };
  }

  const buildItems = (kind) =>
    readEvidenceList(report, kind, payload)
      .map((source, index) => {
        const entry = readEvidenceMediaEntry(payload, kind, source);
        if (!isPortableEvidenceSource(source, entry)) {
          return null;
        }
        return {
          index,
          url: buildEvidenceUrl(runId, kind, index, options.shareKey),
          content_type: entry?.content_type || inferContentType(source, kind),
          byte_length: entry?.byte_length || 0,
          _source: normalizeEvidenceSource(source)
        };
      })
      .filter(Boolean);

  const videos = buildItems("video");
  const screenshots = buildItems("screenshot");
  const primaryVideoSource = normalizeEvidenceSource(payload?.artifacts?.local_video_path);
  const recording =
    videos.find((item) => primaryVideoSource && item._source === primaryVideoSource) ||
    videos
      .slice()
      .sort((left, right) => {
        if (right.byte_length !== left.byte_length) {
          return right.byte_length - left.byte_length;
        }
        const leftLooksLikeClip = /(?:blocker|step[-_ ]?clip|clip)/i.test(left._source);
        const rightLooksLikeClip = /(?:blocker|step[-_ ]?clip|clip)/i.test(right._source);
        return Number(leftLooksLikeClip) - Number(rightLooksLikeClip);
      })[0] ||
    null;

  const toPublicItem = (item) => {
    if (!item) return null;
    const { _source, ...safeItem } = item;
    return safeItem;
  };

  return {
    recording: toPublicItem(recording),
    videos: videos.map(toPublicItem),
    screenshots: screenshots.map(toPublicItem)
  };
}

module.exports = {
  buildQaEvidenceManifest,
  getEmbeddedEvidenceMaxLength,
  normalizeEvidenceSource,
  readEvidenceList,
  readEvidenceMediaEntry
};
