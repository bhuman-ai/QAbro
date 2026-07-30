const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Upload: TusUpload } = require("tus-js-client");

const { sanitizeString } = require("./qa-core");

const DEFAULT_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
const DEFAULT_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const DEFAULT_RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
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
    fetchImpl,
    resumableUpload:
      typeof options.resumableUpload === "function" ? options.resumableUpload : null,
    resumableThresholdBytes: Number(options.resumableThresholdBytes),
    resumableChunkBytes: Number(options.resumableChunkBytes)
  };
}

function resolvePositiveByteSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildResumableUploadEndpoint(supabaseUrl) {
  const parsed = new URL(supabaseUrl);
  if (parsed.hostname.endsWith(".supabase.co") && !parsed.hostname.endsWith(".storage.supabase.co")) {
    parsed.hostname = parsed.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  parsed.pathname = "/storage/v1/upload/resumable";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function hashLocalFile(filePath) {
  const hash = crypto.createHash("sha1");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function readLocalFilePrefix(filePath, maxBytes = 32) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.max(1, maxBytes));
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}

async function uploadLocalFileResumable(filePath, objectPath, stat, contentType, config, options = {}) {
  const uploadOptions = {
    endpoint: buildResumableUploadEndpoint(config.supabaseUrl),
    retryDelays: [0, 3000, 5000, 10000, 20000],
    chunkSize: resolvePositiveByteSetting(
      options.resumableChunkBytes ||
        config.resumableChunkBytes ||
        process.env.QA_EVIDENCE_RESUMABLE_CHUNK_BYTES,
      DEFAULT_RESUMABLE_UPLOAD_CHUNK_BYTES
    ),
    uploadSize: stat.size,
    headers: {
      authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "x-upsert": "true"
    },
    metadata: {
      bucketName: config.bucket,
      objectName: objectPath,
      contentType,
      cacheControl: "3600"
    },
    removeFingerprintOnSuccess: true
  };

  if (typeof config.resumableUpload === "function") {
    await config.resumableUpload({
      filePath,
      objectPath,
      byteLength: stat.size,
      contentType,
      ...uploadOptions
    });
    return;
  }

  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    const upload = new TusUpload(input, {
      ...uploadOptions,
      onError(error) {
        reject(error);
      },
      onSuccess() {
        resolve(upload.url);
      }
    });
    upload.start();
  });
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
  const extension = path.extname(safePath).toLowerCase();
  const hash = await hashLocalFile(safePath);
  const runIdSegment = sanitizeStoragePathSegment(options.runId, "run");
  const kindSegment = sanitizeStoragePathSegment(options.kind, "evidence");
  const fileStem = sanitizeStoragePathSegment(path.basename(safePath, extension), "proof").slice(0, 64);
  const objectPath = normalizeStoragePath(`${runIdSegment}/${kindSegment}/${hash}-${fileStem}${extension}`);
  const resumableThresholdBytes = resolvePositiveByteSetting(
    options.resumableThresholdBytes ||
      config.resumableThresholdBytes ||
      process.env.QA_EVIDENCE_RESUMABLE_THRESHOLD_BYTES,
    DEFAULT_RESUMABLE_UPLOAD_THRESHOLD_BYTES
  );

  if (stat.size > resumableThresholdBytes) {
    await uploadLocalFileResumable(safePath, objectPath, stat, contentType, config, options);
  } else {
    const buffer = fs.readFileSync(safePath);
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
  }

  const uploaded = {
    storage_bucket: config.bucket,
    storage_path: objectPath,
    byte_length: stat.size
  };
  if (options.verifyUpload !== false) {
    const verified = await verifyStoredEvidenceObject(uploaded, {
      ...config,
      expectedByteLength: stat.size,
      expectedPrefix: readLocalFilePrefix(safePath)
    });
    if (!verified) {
      throw new Error("Evidence upload could not be read back from private storage");
    }
  }
  return uploaded;
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

async function verifyStoredEvidenceObject(entry, options = {}) {
  const config = resolveEvidenceStorageConfig(options);
  if (!config) {
    return false;
  }
  const bucket = sanitizeString(
    entry?.storage_bucket || entry?.storageBucket || entry?.bucket,
    128
  );
  const storagePath = normalizeStoragePath(
    entry?.storage_path || entry?.storagePath || entry?.path || entry?.object_path || entry?.objectPath
  );
  if (!bucket || bucket !== config.bucket || !storagePath) {
    return false;
  }

  const expectedPrefix = Buffer.isBuffer(options.expectedPrefix)
    ? options.expectedPrefix
    : Buffer.from(options.expectedPrefix || []);
  const expectedByteLength = Math.max(
    0,
    Number(options.expectedByteLength || options.expected_byte_length || entry?.byte_length || entry?.byteLength) || 0
  );
  const response = await config.fetchImpl(
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStorageObjectPath(storagePath)}`,
    {
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        Range: `bytes=0-${Math.max(0, expectedPrefix.length - 1)}`
      }
    }
  );
  if (!response.ok) {
    return false;
  }

  const contentRange = sanitizeString(response.headers?.get?.("content-range"), 256);
  const rangeTotal = Number(contentRange.match(/\/(\d+)$/)?.[1]);
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (expectedByteLength > 0) {
    if (Number.isFinite(rangeTotal) && rangeTotal !== expectedByteLength) {
      return false;
    }
    if (response.status === 200 && Number.isFinite(contentLength) && contentLength !== expectedByteLength) {
      return false;
    }
  }

  const arrayBuffer = await response.arrayBuffer().catch(() => null);
  if (!arrayBuffer) {
    return false;
  }
  const received = Buffer.from(arrayBuffer);
  if (!received.length) {
    return false;
  }
  return !expectedPrefix.length || received.subarray(0, expectedPrefix.length).equals(expectedPrefix);
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
  DEFAULT_RESUMABLE_UPLOAD_CHUNK_BYTES,
  DEFAULT_RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  deleteStoredEvidenceObjects,
  ensureEvidenceStorageBucket,
  fetchStoredEvidenceObject,
  hasExpectedVideoContainerSignature,
  measureStoredEvidenceForRun,
  resolveEvidenceStorageConfig,
  uploadBufferToEvidenceStorage,
  uploadLocalFileToEvidenceStorage,
  verifyStoredEvidenceObject,
  __private: {
    buildResumableUploadEndpoint,
    encodeStorageObjectPath,
    hashLocalFile,
    normalizeStoragePath,
    readLocalFilePrefix,
    resolvePositiveByteSetting,
    sanitizeStoragePathSegment
  }
};
