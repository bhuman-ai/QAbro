const crypto = require("crypto");

const SECRET_BOX_VERSION = 1;
const SECRET_BOX_ALGORITHM = "aes-256-gcm";
const SECRET_BOX_AAD = Buffer.from("beforeusersdo-human-test-v1", "utf8");

function resolveSecret(options = {}) {
  return String(
    options.secret ||
      options.credentialsSecret ||
      process.env.HUMAN_TEST_CREDENTIALS_SECRET ||
      process.env.QA_SERVICE_TOKEN ||
      process.env.SUPABASE_SERVICE_KEY ||
      ""
  ).trim();
}

function resolveKey(options = {}) {
  const secret = resolveSecret(options);
  return secret ? crypto.createHash("sha256").update(secret).digest() : null;
}

function sealSecretObject(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) {
    return { ok: true, envelope: null };
  }
  const key = resolveKey(options);
  if (!key) {
    return {
      ok: false,
      status: 503,
      error: "Secure test-account storage is not configured"
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(SECRET_BOX_ALGORITHM, key, iv);
  cipher.setAAD(SECRET_BOX_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    ok: true,
    envelope: {
      version: SECRET_BOX_VERSION,
      algorithm: SECRET_BOX_ALGORITHM,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64")
    }
  };
}

function openSecretObject(envelope, options = {}) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { ok: true, value: null };
  }
  const key = resolveKey(options);
  if (!key) {
    return {
      ok: false,
      status: 503,
      error: "Secure test-account storage is not configured"
    };
  }
  if (
    Number(envelope.version) !== SECRET_BOX_VERSION ||
    envelope.algorithm !== SECRET_BOX_ALGORITHM ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.ciphertext
  ) {
    return { ok: false, status: 400, error: "Stored test-account access is invalid" };
  }

  try {
    const decipher = crypto.createDecipheriv(
      SECRET_BOX_ALGORITHM,
      key,
      Buffer.from(String(envelope.iv), "base64")
    );
    decipher.setAAD(SECRET_BOX_AAD);
    decipher.setAuthTag(Buffer.from(String(envelope.tag), "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(String(envelope.ciphertext), "base64")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Secret payload is not an object");
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, status: 500, error: "Stored test-account access could not be opened" };
  }
}

module.exports = {
  openSecretObject,
  resolveSecret,
  sealSecretObject
};
