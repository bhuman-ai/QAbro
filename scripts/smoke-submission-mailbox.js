#!/usr/bin/env node
"use strict";

const { ImapFlow } = require("imapflow");
const { validateBrandProfileInput } = require("../lib/submission-core");
const {
  loadSubmissionBrandProfile,
  upsertSubmissionBrandProfile
} = require("../lib/submission-brand-profiles");
const {
  buildIdentityOtpInbox,
  buildIdentitySmtpConfig
} = require("../lib/submission-identity");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function sanitizeString(value, max = 4096) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function parseBoolean(value, fallbackValue = false) {
  if (value === undefined || value === null || value === "") {
    return fallbackValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function readOption(args, name, envName, fallbackValue = "") {
  return sanitizeString(args[name] || process.env[envName] || fallbackValue);
}

function readNumber(args, name, envName, fallbackValue) {
  const raw = args[name] ?? process.env[envName];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallbackValue;
}

async function probeImapInbox(otpInbox) {
  if (!otpInbox) {
    return {
      ok: false,
      error: "Derived IMAP inbox config is incomplete."
    };
  }

  let client = null;
  let lock = null;
  try {
    client = new ImapFlow({
      host: otpInbox.host,
      port: otpInbox.port,
      secure: otpInbox.secure !== false,
      logger: false,
      auth: otpInbox.accessToken
        ? {
            user: otpInbox.username,
            accessToken: otpInbox.accessToken
          }
        : {
            user: otpInbox.username,
            pass: otpInbox.password
          }
    });

    await client.connect();
    lock = await client.getMailboxLock(otpInbox.mailbox || "INBOX");
    const mailboxInfo = await client.mailboxOpen(otpInbox.mailbox || "INBOX");
    const exists = Number(mailboxInfo?.exists || 0);
    const recent = Number(mailboxInfo?.recent || 0);
    let latest = null;

    if (exists > 0) {
      const start = Math.max(1, exists - 2);
      const messages = await client.fetchAll(`${start}:*`, {
        uid: true,
        envelope: true,
        internalDate: true
      });
      const last = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : null;
      if (last) {
        const from = Array.isArray(last.envelope?.from) && last.envelope.from[0] ? last.envelope.from[0] : null;
        latest = {
          uid: last.uid || null,
          from_domain: sanitizeString(from?.address || "", 320).split("@").pop() || null,
          internal_date: last.internalDate instanceof Date ? last.internalDate.toISOString() : null
        };
      }
    }

    return {
      ok: true,
      mailbox: otpInbox.mailbox || "INBOX",
      exists,
      recent,
      latest
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (lock) {
      try {
        lock.release();
      } catch {}
    }
    if (client) {
      try {
        await client.logout();
      } catch {}
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const ownerUserId = readOption(args, "owner-user-id", "SUBMISSION_OWNER_USER_ID");
  const ownerEmail = readOption(args, "owner-email", "SUBMISSION_OWNER_EMAIL");
  const brandProfileId = readOption(args, "brand-profile-id", "SUBMISSION_BRAND_PROFILE_ID", "brand_lastb2b_mailbox_probe");
  const displayName = readOption(args, "display-name", "SUBMISSION_DISPLAY_NAME", "LastB2B Mailbox Probe");
  const brandKey = readOption(args, "brand-key", "SUBMISSION_BRAND_KEY", "lastb2b");
  const track = readOption(args, "track", "SUBMISSION_TRACK", "startup");
  const websiteUrl = readOption(args, "website-url", "SUBMISSION_WEBSITE_URL");
  const mailboxEmail = readOption(args, "mailbox-email", "SUBMISSION_MAILBOX_EMAIL");
  const mailboxProvider = readOption(args, "mailbox-provider", "SUBMISSION_MAILBOX_PROVIDER");
  const mailboxAuthMethod = readOption(args, "mailbox-auth-method", "SUBMISSION_MAILBOX_AUTH_METHOD", "app_password");
  const mailboxUsername = readOption(args, "mailbox-username", "SUBMISSION_MAILBOX_USERNAME");
  const mailboxHost = readOption(args, "mailbox-host", "SUBMISSION_MAILBOX_HOST");
  const mailboxPassword = readOption(args, "mailbox-password", "SUBMISSION_MAILBOX_PASSWORD");
  const mailboxSmtpHost = readOption(args, "mailbox-smtp-host", "SUBMISSION_MAILBOX_SMTP_HOST");
  const mailboxSmtpPassword = readOption(args, "mailbox-smtp-password", "SUBMISSION_MAILBOX_SMTP_PASSWORD");
  const mailboxPort = readNumber(args, "mailbox-port", "SUBMISSION_MAILBOX_PORT", 993);
  const mailboxSmtpPort = readNumber(args, "mailbox-smtp-port", "SUBMISSION_MAILBOX_SMTP_PORT", 465);
  const mailboxSecure = parseBoolean(args["mailbox-secure"] ?? process.env.SUBMISSION_MAILBOX_SECURE, true);
  const mailboxSmtpSecure = parseBoolean(args["mailbox-smtp-secure"] ?? process.env.SUBMISSION_MAILBOX_SMTP_SECURE, true);
  const scrubSecret = parseBoolean(args["scrub-secret"] ?? process.env.SUBMISSION_MAILBOX_SCRUB_SECRET, true);

  if (!ownerUserId || !ownerEmail || !mailboxEmail || !mailboxPassword) {
    throw new Error("owner-user-id, owner-email, mailbox-email, and mailbox-password are required.");
  }

  const validation = validateBrandProfileInput({
    brand_profile_id: brandProfileId,
    brand_key: brandKey,
    track,
    display_name: displayName,
    website_url: websiteUrl || null,
    identity_mode: "client_owned",
    mailbox_provider: mailboxProvider || null,
    mailbox_email: mailboxEmail,
    mailbox_username: mailboxUsername || mailboxEmail,
    mailbox_auth_method: mailboxAuthMethod,
    mailbox_host: mailboxHost || null,
    mailbox_port: mailboxPort,
    mailbox_secure: mailboxSecure,
    mailbox_smtp_host: mailboxSmtpHost || null,
    mailbox_smtp_port: mailboxSmtpPort,
    mailbox_smtp_secure: mailboxSmtpSecure,
    mailbox_password: mailboxPassword,
    mailbox_smtp_password: mailboxSmtpPassword || mailboxPassword,
    inbox_ready: true,
    app_password_configured: mailboxAuthMethod === "app_password"
  });
  if (!validation.ok) {
    throw new Error(validation.error || "Failed to validate mailbox probe brand.");
  }

  const saved = await upsertSubmissionBrandProfile(validation.data, {
    ownerUserId,
    ownerEmail,
    includeSecrets: true
  });
  if (!saved.ok) {
    throw new Error(saved.error || "Failed to save submission brand profile.");
  }

  const loaded = await loadSubmissionBrandProfile(brandProfileId, {
    ownerUserId,
    includeSecrets: true
  });
  if (!loaded.ok || !loaded.row) {
    throw new Error(loaded.error || "Failed to reload submission brand profile.");
  }

  const identity = loaded.row.profile?.identity || {};
  const otpInbox = buildIdentityOtpInbox(identity);
  const smtpConfig = buildIdentitySmtpConfig(identity);
  const imapProbe = await probeImapInbox(otpInbox);

  const summary = {
    brand_profile_id: loaded.row.brand_profile_id,
    owner_user_id: loaded.row.owner_user_id,
    display_name: loaded.row.display_name,
    mailbox: {
      provider: sanitizeString(identity?.mailbox?.provider || "", 120) || "custom",
      email: sanitizeString(identity?.mailbox?.email || "", 320),
      auth_method: sanitizeString(identity?.mailbox?.auth_method || "", 64) || "unknown",
      imap: otpInbox
        ? {
            host: otpInbox.host,
            port: otpInbox.port,
            secure: otpInbox.secure !== false
          }
        : null,
      smtp: smtpConfig
        ? {
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure === true
          }
        : null
    },
    imap_probe: imapProbe
  };

  if (scrubSecret) {
    const scrubbedProfile = JSON.parse(JSON.stringify(loaded.row.profile || {}));
    if (scrubbedProfile.identity?.mailbox) {
      delete scrubbedProfile.identity.mailbox.password;
      delete scrubbedProfile.identity.mailbox.smtp_password;
      delete scrubbedProfile.identity.mailbox.access_token;
      delete scrubbedProfile.identity.mailbox.refresh_token;
    }
    await upsertSubmissionBrandProfile(
      {
        ...loaded.row,
        profile: scrubbedProfile
      },
      {
        ownerUserId,
        ownerEmail,
        includeSecrets: false
      }
    );
    summary.secret_scrubbed = true;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
