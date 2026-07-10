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
  return normalized || fallback;
}

function normalizeStoragePath(value) {
  return sanitizeString(value, 4096)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function encodeStorageObjectPath(value) {
  return normalizeStoragePath(value)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

        if (response.ok || response.status === 409) {
          return true;
        }

        let message = "";
        try {
          const parsed = await response.json();
          message = sanitizeString(parsed?.message || parsed?.error, 400);
        } catch {
          message = "";
        }
        if (/already exists|resource exists/i.test(message)) {
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
  if (!bucket || !storagePath) {
    return null;
  }

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

  const contentType = sanitizeString(response.headers.get("content-type"), 256) || sanitizeString(
    entry?.content_type || entry?.contentType,
    128
  ) || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  return {
    contentType,
    data: Buffer.from(arrayBuffer)
  };
}

module.exports = {
  DEFAULT_EVIDENCE_STORAGE_BUCKET,
  ensureEvidenceStorageBucket,
  fetchStoredEvidenceObject,
  resolveEvidenceStorageConfig,
  uploadBufferToEvidenceStorage,
  uploadLocalFileToEvidenceStorage,
  __private: {
    encodeStorageObjectPath,
    normalizeStoragePath,
    sanitizeStoragePathSegment
  }
};
