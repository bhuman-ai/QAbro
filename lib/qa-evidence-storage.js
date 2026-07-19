const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { sanitizeString } = require("./qa-core");

const DEFAULT_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
const ensuredBucketPromises = new Map();

function resolveEvidenceStorageConfig(options = {}) {
  const disabled = options.disabled === true || sanitizeString(process.env.QA_EVIDENCE_STORAGE_DISABLED, 16) === "1";
  if (disabled) {
    return null;
  }

  const supabaseUrl = sanitizeString(
    options.supabaseUrl || process.env.SUPABASE_URL,
    4096
  ).replace(/\/$/, "");
  const serviceKey = sanitizeString(
    options.serviceKey || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    4096
  );
  const bucket = sanitizeString(
    options.bucket || process.env.QA_EVIDENCE_STORAGE_BUCKET,
    128
  ) || DEFAULT_EVIDENCE_STORAGE_BUCKET;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || !serviceKey || typeof fetchImpl !== "function") {
    return null;
  }

  return {
    supabaseUrl,
    serviceKey,
    bucket,
    fetchImpl
  };
}

function sanitizeStoragePathSegment(value, fallback = "proof") {
  const normalized = sanitizeString(value, 256)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return normalized && normalized !== "." && normalized !== ".." ? normalized : fallback;
}

function normalizeStoragePath(value) {
  const normalized = sanitizeString(value, 4096)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
  if (!normalized) return "";
  const segments = normalized.split("/");
  if (segments.some((segment) => {
    if (!segment || segment === "." || segment === "..") return true;
    if (/%(?:2e|2f|5c)/i.test(segment)) return true;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
    } catch {
      return true;
    }
  })) {
    return "";
  }
  return normalized;
}

function encodeStorageObjectPath(value) {
  return normalizeStoragePath(value)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hasExpectedVideoContainerSignature(buffer, contentType) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const normalizedType = sanitizeString(contentType, 128).toLowerCase().split(";")[0].trim();
  if (normalizedType === "video/webm") {
    return data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (["video/mp4", "video/quicktime"].includes(normalizedType)) {
    return data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp";
  }
  return false;
}

async function ensureEvidenceStorageBucket(config) {
  if (!config || !config.supabaseUrl || !config.serviceKey || !config.bucket) {
    return false;
  }

  const cacheKey = `${config.supabaseUrl}::${config.bucket}`;
  if (!ensuredBucketPromises.has(cacheKey)) {
    ensuredBucketPromises.set(
      cacheKey,
      (async () => {
        const response = await config.fetchImpl(`${config.supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.serviceKey,
            Authorization: `Bearer ${config.serviceKey}`
          },
          body: JSON.stringify({
            id: config.bucket,
            name: config.bucket,
            public: false
          })
        });

        if (response.ok) {
          return true;
        }

        let message = "";
        try {
          const parsed = await response.json();
          message = sanitizeString(parsed?.message || parsed?.error, 400);
        } catch {
          message = "";
        }
        if (response.status === 409 || /already exists|resource exists/i.test(message)) {
          const metadataResponse = await config.fetchImpl(
            `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`,
            {
              method: "GET",
              headers: {
                apikey: config.serviceKey,
                Authorization: `Bearer ${config.serviceKey}`
              }
            }
          );
          if (!metadataResponse.ok) {
            throw new Error(
              `Failed to verify evidence bucket privacy (${metadataResponse.status})`
            );
          }
          const metadata = await metadataResponse.json().catch(() => null);
          if (!metadata || typeof metadata !== "object" || metadata.public !== false) {
            throw new Error("Evidence storage bucket must be private");
          }
          return true;
        }

        throw new Error(message || `Failed to ensure evidence bucket (${response.status})`);
      })().catch((error) => {
        ensuredBucketPromises.delete(cacheKey);
        throw error;
      })
    );
  }

  return ensuredBucketPromises.get(cacheKey);
}

async function uploadLocalFileToEvidenceStorage(filePath, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return null;
  }

  const safePath = sanitizeString(filePath, 4096);
  if (!safePath) {
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(safePath);
  } catch {
    return null;
  }
  if (!stat?.isFile() || stat.size <= 0) {
    return null;
  }

  const contentType = sanitizeString(options.contentType, 128);
  if (!contentType) {
    return null;
  }

  await ensureEvidenceStorageBucket(config);
  const buffer = fs.readFileSync(safePath);
  const extension = path.extname(safePath).toLowerCase();
  const hash = crypto.createHash("sha1").update(buffer).digest("hex");
  const runIdSegment = sanitizeStoragePathSegment(options.runId, "run");
  const kindSegment = sanitizeStoragePathSegment(options.kind, "evidence");
  const fileStem = sanitizeStoragePathSegment(path.basename(safePath, extension), "proof").slice(0, 64);
  const objectPath = normalizeStoragePath(`${runIdSegment}/${kindSegment}/${hash}-${fileStem}${extension}`);

  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(
    config.bucket
  )}/${encodeStorageObjectPath(objectPath)}`;
  const response = await config.fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "x-upsert": "true"
    },
    body: buffer
  });

  if (!response.ok) {
    let message = "";
    try {
      const parsed = await response.json();
      message = sanitizeString(parsed?.message || parsed?.error, 400);
    } catch {
      message = "";
    }
    throw new Error(message || `Failed to upload evidence media (${response.status})`);
  }

  return {
    storage_bucket: config.bucket,
    storage_path: objectPath,
    byte_length: stat.size
  };
}

async function uploadBufferToEvidenceStorage(buffer, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return null;
  }

  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!data.length) {
    return null;
  }

  const contentType = sanitizeString(options.contentType, 128);
  if (!contentType) {
    return null;
  }

  await ensureEvidenceStorageBucket(config);
  const rawFilename = sanitizeString(options.filename || options.fileName, 240);
  const extension = path.extname(rawFilename).toLowerCase() || "";
  const hash = crypto.createHash("sha1").update(data).digest("hex");
  const runIdSegment = sanitizeStoragePathSegment(options.runId, "run");
  const kindSegment = sanitizeStoragePathSegment(options.kind, "evidence");
  const fileStem = sanitizeStoragePathSegment(path.basename(rawFilename || "proof", extension), "proof").slice(0, 64);
  const objectPath = normalizeStoragePath(`${runIdSegment}/${kindSegment}/${hash}-${fileStem}${extension}`);

  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(
    config.bucket
  )}/${encodeStorageObjectPath(objectPath)}`;
  const response = await config.fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "x-upsert": "true"
    },
    body: data
  });

  if (!response.ok) {
    let message = "";
    try {
      const parsed = await response.json();
      message = sanitizeString(parsed?.message || parsed?.error, 400);
    } catch {
      message = "";
    }
    throw new Error(message || `Failed to upload evidence media (${response.status})`);
  }

  return {
    storage_bucket: config.bucket,
    storage_path: objectPath,
    byte_length: data.length
  };
}

async function fetchStoredEvidenceObject(entry, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return null;
  }

  const bucket = sanitizeString(
    entry?.storage_bucket || entry?.storageBucket || entry?.bucket,
    128
  );
  const storagePath = normalizeStoragePath(
    entry?.storage_path || entry?.storagePath || entry?.path || entry?.object_path || entry?.objectPath
  );
  if (!bucket || bucket !== config.bucket || !storagePath) {
    return null;
  }
  const requestedMaxBytes = Number(options.maxBytes ?? options.max_bytes);
  const maxBytes = Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.floor(requestedMaxBytes)
    : null;

  const response = await config.fetchImpl(
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStorageObjectPath(storagePath)}`,
    {
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const contentLength = Number(response.headers?.get?.("content-length"));
  if (maxBytes !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    return null;
  }

  const contentType = sanitizeString(response.headers.get("content-type"), 256) || sanitizeString(
    entry?.content_type || entry?.contentType,
    128
  ) || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  if (maxBytes !== null && arrayBuffer.byteLength > maxBytes) {
    return null;
  }
  return {
    contentType,
    data: Buffer.from(arrayBuffer)
  };
}

async function measureStoredEvidenceForRun(runId, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return null;
  }
  const runSegment = sanitizeStoragePathSegment(runId, "");
  if (!runSegment) {
    return null;
  }
  const requestedStopAfterBytes = Number(options.stopAfterBytes ?? options.stop_after_bytes);
  const stopAfterBytes = Number.isFinite(requestedStopAfterBytes) && requestedStopAfterBytes >= 0
    ? Math.floor(requestedStopAfterBytes)
    : Number.POSITIVE_INFINITY;
  const pageSize = 1000;
  const maxObjects = 20000;
  let cursor = null;
  let byteLength = 0;
  let objectCount = 0;

  while (objectCount < maxObjects) {
    const response = await config.fetchImpl(
      `${config.supabaseUrl}/storage/v1/object/list-v2/${encodeURIComponent(config.bucket)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`
        },
        body: JSON.stringify({
          prefix: `${runSegment}/`,
          limit: pageSize,
          ...(cursor ? { cursor } : {}),
          with_delimiter: false,
          sortBy: { column: "name", order: "asc" }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to inspect evidence storage usage (${response.status})`);
    }
    const page = await response.json().catch(() => null);
    const entries = page?.objects;
    if (!page || !Array.isArray(entries) || !Array.isArray(page.folders || [])) {
      throw new Error("Evidence storage usage response was invalid");
    }
    for (const entry of entries) {
      const size = Number(
        entry?.metadata?.size ??
          entry?.metadata?.contentLength ??
          entry?.metadata?.content_length ??
          entry?.size
      );
      if (Number.isFinite(size) && size > 0) {
        byteLength += Math.floor(size);
      }
      objectCount += 1;
      if (byteLength > stopAfterBytes) {
        return { byte_length: byteLength, object_count: objectCount, limit_exceeded: true };
      }
      if (objectCount >= maxObjects) break;
    }
    if (page.hasNext !== true) {
      return { byte_length: byteLength, object_count: objectCount, limit_exceeded: false };
    }
    const nextCursor = sanitizeString(page.nextCursor, 4096);
    if (!nextCursor || nextCursor === cursor) {
      throw new Error("Evidence storage usage cursor was invalid");
    }
    cursor = nextCursor;
  }

  return { byte_length: byteLength, object_count: objectCount, limit_exceeded: true };
}

async function deleteStoredEvidenceObjects(entries, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return false;
  }
  const paths = Array.from(
    new Set(
      (Array.isArray(entries) ? entries : [])
        .filter((entry) => {
          const bucket = sanitizeString(
            entry?.storage_bucket || entry?.storageBucket || entry?.bucket,
            128
          );
          return !bucket || bucket === config.bucket;
        })
        .map((entry) => normalizeStoragePath(entry?.storage_path || entry?.storagePath || entry?.path))
        .filter(Boolean)
    )
  ).slice(0, 1000);
  if (!paths.length) {
    return true;
  }
  const response = await config.fetchImpl(
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`
      },
      body: JSON.stringify({ prefixes: paths })
    }
  );
  return response.ok;
}

module.exports = {
  DEFAULT_EVIDENCE_STORAGE_BUCKET,
  deleteStoredEvidenceObjects,
  ensureEvidenceStorageBucket,
  fetchStoredEvidenceObject,
  hasExpectedVideoContainerSignature,
  measureStoredEvidenceForRun,
  resolveEvidenceStorageConfig,
  uploadBufferToEvidenceStorage,
  uploadLocalFileToEvidenceStorage,
  __private: {
    encodeStorageObjectPath,
    normalizeStoragePath,
    sanitizeStoragePathSegment
  }
};
