const fs = require("fs");
const os = require("os");
const path = require("path");

function sanitizeString(value, maxLength = 512) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 256);
}

function toSafeSlug(value, fallback = "default") {
  const safe = sanitizeString(value, 256)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return safe || fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadata(input) {
  if (!isPlainObject(input)) {
    return {};
  }
  return isPlainObject(input.metadata) ? input.metadata : input;
}

function parseBoolean(value, fallbackValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallbackValue;
}

function resolveFreshProfileReason(input = {}) {
  const metadata = readMetadata(input);
  if (parseBoolean(metadata.new_account_required ?? metadata.newAccountRequired ?? input.new_account_required ?? input.newAccountRequired, false)) {
    return "new_account_required";
  }
  if (parseBoolean(metadata.force_fresh_auth_profile ?? metadata.forceFreshAuthProfile ?? input.force_fresh_auth_profile ?? input.forceFreshAuthProfile, false)) {
    return "force_fresh_auth_profile";
  }
  return "";
}

function resolveQaProfileRootDir(options = {}, env = process.env) {
  const explicitRoot =
    sanitizeString(
      options.profileRootDir ||
        options.rootDir ||
        options.selfHostedProfileRootDir ||
        env.QA_SELF_HOSTED_PROFILE_ROOT_DIR ||
        env.SUBMISSION_SELF_HOSTED_PROFILE_ROOT_DIR ||
        env.SUBMISSION_DO_PROFILE_ROOT_DIR,
      4096
    ) || "";
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  return path.resolve(os.tmpdir(), "qabro-qa-profiles");
}

function resolveQaProfileNamespace(input = {}, env = process.env) {
  const metadata = readMetadata(input);
  return toSafeSlug(
    metadata.self_hosted_profile_namespace ||
      metadata.selfHostedProfileNamespace ||
      env.QA_SELF_HOSTED_PROFILE_NAMESPACE ||
      env.SUBMISSION_SELF_HOSTED_PROFILE_NAMESPACE ||
      "dashboard",
    "dashboard"
  );
}

function resolveQaProfileOwnerSlug(input = {}) {
  const metadata = readMetadata(input);
  const ownerUserId = sanitizeString(
    metadata.owner_user_id || metadata.ownerUserId || input.owner_user_id || input.ownerUserId,
    128
  );
  const ownerEmail = sanitizeString(
    metadata.owner_email || metadata.ownerEmail || input.owner_email || input.ownerEmail,
    320
  ).toLowerCase();
  return toSafeSlug(ownerUserId || ownerEmail, "");
}

function resolveQaProfileBrandKey(input = {}) {
  const metadata = readMetadata(input);
  return sanitizeBrandKey(
    metadata.brand_key || metadata.brandKey || input.brand_key || input.brandKey
  );
}

function resolveQaProfileDir(input = {}, options = {}) {
  const ownerSlug = resolveQaProfileOwnerSlug(input);
  const brandKey = resolveQaProfileBrandKey(input);
  if (!ownerSlug || !brandKey) {
    return null;
  }

  return path.resolve(
    resolveQaProfileRootDir(options),
    resolveQaProfileNamespace(input),
    ownerSlug,
    brandKey
  );
}

function hasProfileArtifacts(profileDir) {
  const safeProfileDir = sanitizeString(profileDir, 4096);
  if (!safeProfileDir) {
    return false;
  }

  try {
    const entries = fs.readdirSync(safeProfileDir, { withFileTypes: true });
    return entries.some((entry) => {
      if (!entry) {
        return false;
      }
      if (entry.isDirectory()) {
        return true;
      }
      if (!entry.isFile()) {
        return false;
      }
      return !entry.name.startsWith(".") && !entry.name.endsWith(".lock");
    });
  } catch {
    return false;
  }
}

function getQaProfileState(input = {}, options = {}) {
  const freshProfileReason = resolveFreshProfileReason(input);
  if (freshProfileReason) {
    return {
      profile_dir: null,
      available: false,
      access_method: null,
      bypassed: true,
      bypass_reason: freshProfileReason
    };
  }

  const profileDir = resolveQaProfileDir(input, options);
  return {
    profile_dir: profileDir,
    available: hasProfileArtifacts(profileDir),
    access_method: profileDir ? "saved_session" : null,
    bypassed: false,
    bypass_reason: null
  };
}

module.exports = {
  getQaProfileState,
  hasProfileArtifacts,
  resolveFreshProfileReason,
  resolveQaProfileBrandKey,
  resolveQaProfileDir,
  resolveQaProfileNamespace,
  resolveQaProfileOwnerSlug,
  resolveQaProfileRootDir,
  toSafeSlug
};
