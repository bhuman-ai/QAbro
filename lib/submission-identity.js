const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const IDENTITY_MODES = Object.freeze([
  "client_owned",
  "brand_mailbox",
  "managed_transitional",
  "founder_personal",
  "ephemeral_submitter"
]);

const MAILBOX_AUTH_METHODS = Object.freeze([
  "oauth",
  "app_password",
  "provider_password",
  "imap_password",
  "smtp_imap_password",
  "unknown"
]);

const MAILBOX_PROTOCOLS = Object.freeze([
  "imap",
  "api",
  "oauth",
  "smtp_imap",
  "unknown"
]);

const MAILBOX_PROVIDER_PRESETS = Object.freeze({
  gmail: Object.freeze({
    aliases: ["gmail", "google", "google_workspace", "workspace"],
    domains: ["gmail.com", "googlemail.com"],
    protocol: "imap",
    imap: Object.freeze({
      host: "imap.gmail.com",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.gmail.com",
      port: 465,
      secure: true
    })
  }),
  outlook: Object.freeze({
    aliases: ["outlook", "office365", "microsoft", "microsoft365", "hotmail", "live"],
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    protocol: "imap",
    imap: Object.freeze({
      host: "outlook.office365.com",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.office365.com",
      port: 587,
      secure: false
    })
  }),
  yahoo: Object.freeze({
    aliases: ["yahoo"],
    domains: ["yahoo.com", "ymail.com", "rocketmail.com"],
    protocol: "imap",
    imap: Object.freeze({
      host: "imap.mail.yahoo.com",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.mail.yahoo.com",
      port: 465,
      secure: true
    })
  }),
  zoho: Object.freeze({
    aliases: ["zoho"],
    domains: ["zoho.com", "zohomail.com"],
    protocol: "imap",
    imap: Object.freeze({
      host: "imap.zoho.com",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.zoho.com",
      port: 465,
      secure: true
    })
  }),
  icloud: Object.freeze({
    aliases: ["icloud", "apple", "me", "mac"],
    domains: ["icloud.com", "me.com", "mac.com"],
    protocol: "imap",
    imap: Object.freeze({
      host: "imap.mail.me.com",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.mail.me.com",
      port: 587,
      secure: false
    })
  }),
  mailpool: Object.freeze({
    aliases: ["mailpool"],
    domains: [],
    protocol: "smtp_imap",
    imap: Object.freeze({
      host: "",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "",
      port: 587,
      secure: false
    })
  }),
  forwardemail: Object.freeze({
    aliases: ["forwardemail", "forward_email", "forward-email"],
    domains: ["forwardemail.net"],
    protocol: "smtp_imap",
    imap: Object.freeze({
      host: "imap.forwardemail.net",
      port: 993,
      secure: true
    }),
    smtp: Object.freeze({
      host: "smtp.forwardemail.net",
      port: 465,
      secure: true
    })
  })
});

function normalizeIdentityMode(value) {
  const safeValue = sanitizeString(value, 64).toLowerCase();
  return IDENTITY_MODES.includes(safeValue) ? safeValue : "";
}

function normalizeMailboxAuthMethod(value) {
  const safeValue = sanitizeString(value, 64).toLowerCase();
  return MAILBOX_AUTH_METHODS.includes(safeValue) ? safeValue : "";
}

function normalizeMailboxProtocol(value) {
  const safeValue = sanitizeString(value, 64).toLowerCase();
  return MAILBOX_PROTOCOLS.includes(safeValue) ? safeValue : "";
}

function sanitizePort(value, fallbackValue = null) {
  if (value === undefined || value === null || value === "") {
    return fallbackValue;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(1, Math.min(65535, Math.floor(numeric)));
}

function sanitizeOptionalBoolean(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return parseBoolean(value) === true;
    }
  }
  return null;
}

function inferMailboxProviderFromEmail(email) {
  const safeEmail = sanitizeOptionalString(email, 320) || "";
  const domain = safeEmail.includes("@") ? safeEmail.split("@").pop().toLowerCase() : "";
  if (!domain) {
    return "";
  }
  for (const [providerKey, preset] of Object.entries(MAILBOX_PROVIDER_PRESETS)) {
    if (Array.isArray(preset.domains) && preset.domains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))) {
      return providerKey;
    }
  }
  return "";
}

function normalizeMailboxProvider(value, email) {
  const safeValue = sanitizeString(value, 120).toLowerCase();
  if (!safeValue) {
    return inferMailboxProviderFromEmail(email);
  }

  for (const [providerKey, preset] of Object.entries(MAILBOX_PROVIDER_PRESETS)) {
    if (providerKey === safeValue) {
      return providerKey;
    }
    if (Array.isArray(preset.aliases) && preset.aliases.includes(safeValue)) {
      return providerKey;
    }
  }

  return safeValue;
}

function resolveMailboxProviderPreset(provider, email) {
  const normalizedProvider = normalizeMailboxProvider(provider, email);
  return normalizedProvider ? MAILBOX_PROVIDER_PRESETS[normalizedProvider] || null : null;
}

function inferMailboxHost(identity = {}) {
  const safeIdentity = isPlainObject(identity) ? identity : {};
  const mailbox = isPlainObject(safeIdentity.mailbox) ? safeIdentity.mailbox : {};
  const explicitHost = sanitizeOptionalString(mailbox.host, 320);
  if (explicitHost) {
    return explicitHost;
  }

  const preset = resolveMailboxProviderPreset(mailbox.provider, mailbox.email);
  const presetHost = sanitizeOptionalString(preset?.imap?.host, 320);
  if (presetHost) {
    return presetHost;
  }

  return null;
}

function resolveMailboxConnectionDefaults(identity = {}) {
  const normalized = normalizeSubmissionIdentityProfile(identity, { includeSecrets: true });
  const mailbox = isPlainObject(normalized.mailbox) ? normalized.mailbox : {};
  return {
    provider: sanitizeOptionalString(mailbox.provider, 120) || null,
    protocol: sanitizeOptionalString(mailbox.protocol, 64) || null,
    imap: {
      host: sanitizeOptionalString(mailbox.host, 320) || null,
      port: sanitizePort(mailbox.port, 993),
      secure: mailbox.secure !== false
    },
    smtp: {
      host: sanitizeOptionalString(mailbox.smtp_host, 320) || null,
      port: sanitizePort(mailbox.smtp_port, 587),
      secure: mailbox.smtp_secure === true,
      username: sanitizeOptionalString(mailbox.smtp_username, 320) || sanitizeOptionalString(mailbox.username, 320) || sanitizeOptionalString(mailbox.email, 320) || null
    }
  };
}

function normalizeSubmissionIdentityProfile(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const includeSecrets = options.includeSecrets === true;
  const mailboxSource = isPlainObject(source.mailbox) ? source.mailbox : {};
  const mailboxEmail =
    sanitizeOptionalString(
      mailboxSource.email ||
        mailboxSource.address ||
        source.mailbox_email ||
        source.mailboxEmail ||
        source.email_address ||
        source.emailAddress,
      320
    ) || null;
  const authMethod = normalizeMailboxAuthMethod(
    mailboxSource.auth_method ||
      mailboxSource.authMethod ||
      source.mailbox_auth_method ||
      source.mailboxAuthMethod ||
      source.auth_method ||
      source.authMethod
  );
  const provider = normalizeMailboxProvider(
    mailboxSource.provider || source.mailbox_provider || source.mailboxProvider,
    mailboxEmail
  );
  const preset = resolveMailboxProviderPreset(provider, mailboxEmail);
  const protocol = normalizeMailboxProtocol(
    mailboxSource.protocol ||
      source.mailbox_protocol ||
      source.mailboxProtocol ||
      preset?.protocol ||
      authMethod
  );

  const explicitInboxReady =
    mailboxSource.inbox_ready !== undefined ||
    mailboxSource.inboxReady !== undefined ||
    source.inbox_ready !== undefined ||
    source.inboxReady !== undefined;

  const oauthReady =
    parseBoolean(
      mailboxSource.oauth_ready ??
        mailboxSource.oauthReady ??
        source.oauth_ready ??
        source.oauthReady
    ) === true;
  const appPasswordConfigured =
    parseBoolean(
      mailboxSource.app_password_configured ??
        mailboxSource.appPasswordConfigured ??
        source.app_password_configured ??
        source.appPasswordConfigured
    ) === true;
  const host = sanitizeOptionalString(
    mailboxSource.host ||
      mailboxSource.imap_host ||
      mailboxSource.imapHost ||
      source.mailbox_host ||
      source.mailboxHost,
    320
  ) || sanitizeOptionalString(preset?.imap?.host, 320) || null;
  const portValue =
    mailboxSource.port ??
    mailboxSource.imap_port ??
    mailboxSource.imapPort ??
    source.mailbox_port ??
    source.mailboxPort;
  const port = sanitizePort(portValue, sanitizePort(preset?.imap?.port, null));
  const secure =
    sanitizeOptionalBoolean(
      mailboxSource.secure,
      mailboxSource.imap_secure,
      mailboxSource.imapSecure,
      source.mailbox_secure,
      source.mailboxSecure
    ) ?? (preset?.imap?.secure === true);
  const password = sanitizeOptionalString(
    mailboxSource.password || source.mailbox_password || source.mailboxPassword,
    1024
  ) || null;
  const smtpHost = sanitizeOptionalString(
    mailboxSource.smtp_host ||
      mailboxSource.smtpHost ||
      source.mailbox_smtp_host ||
      source.mailboxSmtpHost,
    320
  ) || sanitizeOptionalString(preset?.smtp?.host, 320) || null;
  const smtpPort = sanitizePort(
    mailboxSource.smtp_port ??
      mailboxSource.smtpPort ??
      source.mailbox_smtp_port ??
      source.mailboxSmtpPort,
    sanitizePort(preset?.smtp?.port, null)
  );
  const smtpSecure =
    sanitizeOptionalBoolean(
      mailboxSource.smtp_secure,
      mailboxSource.smtpSecure,
      source.mailbox_smtp_secure,
      source.mailboxSmtpSecure
    ) ?? (preset?.smtp?.secure === true);
  const smtpUsername =
    sanitizeOptionalString(
      mailboxSource.smtp_username ||
        mailboxSource.smtpUsername ||
        source.mailbox_smtp_username ||
        source.mailboxSmtpUsername,
      320
    ) ||
    sanitizeOptionalString(
      mailboxSource.username || source.mailbox_username || source.mailboxUsername,
      320
    ) ||
    mailboxEmail ||
    null;
  const smtpPassword = sanitizeOptionalString(
    mailboxSource.smtp_password || mailboxSource.smtpPassword || source.mailbox_smtp_password || source.mailboxSmtpPassword,
    1024
  ) || null;
  const accessToken = sanitizeOptionalString(
    mailboxSource.access_token ||
      mailboxSource.accessToken ||
      source.mailbox_access_token ||
      source.mailboxAccessToken,
    4096
  ) || null;
  const refreshToken = sanitizeOptionalString(
    mailboxSource.refresh_token ||
      mailboxSource.refreshToken ||
      source.mailbox_refresh_token ||
      source.mailboxRefreshToken,
    4096
  ) || null;

  const authConfigured =
    oauthReady ||
    appPasswordConfigured ||
    Boolean(password) ||
    Boolean(smtpPassword) ||
    Boolean(accessToken) ||
    authMethod === "provider_password" ||
    authMethod === "imap_password" ||
    authMethod === "smtp_imap_password";

  const inboxReady = explicitInboxReady
    ? parseBoolean(
        mailboxSource.inbox_ready ??
          mailboxSource.inboxReady ??
          source.inbox_ready ??
          source.inboxReady
      ) === true
    : Boolean(mailboxEmail && authConfigured);

  return {
    mode: normalizeIdentityMode(source.mode || source.identity_mode || source.identityMode) || "",
    owner_name: sanitizeOptionalString(source.owner_name || source.ownerName, 180) || null,
    editable_after_submit:
      source.editable_after_submit === undefined && source.editableAfterSubmit === undefined
        ? true
        : parseBoolean(source.editable_after_submit ?? source.editableAfterSubmit) !== false,
    supports_delegation: parseBoolean(source.supports_delegation ?? source.supportsDelegation) === true,
    mailbox: {
      email: mailboxEmail,
      provider: provider || null,
      auth_method: authMethod || "unknown",
      protocol: protocol || "unknown",
      username:
        sanitizeOptionalString(
          mailboxSource.username || source.mailbox_username || source.mailboxUsername,
          320
        ) || mailboxEmail,
      host,
      port,
      secure,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_secure: smtpSecure,
      smtp_username: smtpUsername,
      ...(includeSecrets && password ? { password } : {}),
      ...(includeSecrets && smtpPassword ? { smtp_password: smtpPassword } : {}),
      ...(includeSecrets && accessToken ? { access_token: accessToken } : {}),
      ...(includeSecrets && refreshToken ? { refresh_token: refreshToken } : {}),
      oauth_ready: oauthReady,
      app_password_configured: appPasswordConfigured,
      inbox_ready: inboxReady
    }
  };
}

function hasSubmissionIdentity(identity) {
  const safeIdentity = isPlainObject(identity) ? identity : {};
  const mailbox = isPlainObject(safeIdentity.mailbox) ? safeIdentity.mailbox : {};
  return Boolean(
    normalizeIdentityMode(safeIdentity.mode) ||
      sanitizeOptionalString(safeIdentity.owner_name, 180) ||
      sanitizeOptionalString(mailbox.email, 320)
  );
}

function buildSubmissionIdentityInput(profileSource = {}, body = {}) {
  const existingIdentity = isPlainObject(profileSource.identity) ? profileSource.identity : {};
  const bodyIdentity = isPlainObject(body.identity) ? body.identity : {};
  const merged = {
    ...existingIdentity,
    ...bodyIdentity,
    ...(body.identity_mode !== undefined || body.identityMode !== undefined
      ? { mode: body.identity_mode ?? body.identityMode }
      : {}),
    ...(body.owner_name !== undefined || body.ownerName !== undefined
      ? { owner_name: body.owner_name ?? body.ownerName }
      : {}),
    ...(body.editable_after_submit !== undefined || body.editableAfterSubmit !== undefined
      ? { editable_after_submit: body.editable_after_submit ?? body.editableAfterSubmit }
      : {}),
    ...(body.supports_delegation !== undefined || body.supportsDelegation !== undefined
      ? { supports_delegation: body.supports_delegation ?? body.supportsDelegation }
      : {}),
    mailbox: {
      ...(isPlainObject(existingIdentity.mailbox) ? existingIdentity.mailbox : {}),
      ...(isPlainObject(profileSource.mailbox) ? profileSource.mailbox : {}),
      ...(isPlainObject(body.mailbox) ? body.mailbox : {}),
      ...(isPlainObject(body.mailbox_auth) ? body.mailbox_auth : {}),
      ...(isPlainObject(bodyIdentity.mailbox) ? bodyIdentity.mailbox : {}),
      ...(body.mailbox_email !== undefined || body.mailboxEmail !== undefined
        ? { email: body.mailbox_email ?? body.mailboxEmail }
        : {}),
      ...(body.mailbox_provider !== undefined || body.mailboxProvider !== undefined
        ? { provider: body.mailbox_provider ?? body.mailboxProvider }
        : {}),
      ...(body.mailbox_auth_method !== undefined || body.mailboxAuthMethod !== undefined
        ? { auth_method: body.mailbox_auth_method ?? body.mailboxAuthMethod }
        : {}),
      ...(body.mailbox_protocol !== undefined || body.mailboxProtocol !== undefined
        ? { protocol: body.mailbox_protocol ?? body.mailboxProtocol }
        : {}),
      ...(body.mailbox_username !== undefined || body.mailboxUsername !== undefined
        ? { username: body.mailbox_username ?? body.mailboxUsername }
        : {}),
      ...(body.mailbox_host !== undefined || body.mailboxHost !== undefined
        ? { host: body.mailbox_host ?? body.mailboxHost }
        : {}),
      ...(body.mailbox_port !== undefined || body.mailboxPort !== undefined
        ? { port: body.mailbox_port ?? body.mailboxPort }
        : {}),
      ...(body.mailbox_secure !== undefined || body.mailboxSecure !== undefined
        ? { secure: body.mailbox_secure ?? body.mailboxSecure }
        : {}),
      ...(body.mailbox_smtp_host !== undefined || body.mailboxSmtpHost !== undefined
        ? { smtp_host: body.mailbox_smtp_host ?? body.mailboxSmtpHost }
        : {}),
      ...(body.mailbox_smtp_port !== undefined || body.mailboxSmtpPort !== undefined
        ? { smtp_port: body.mailbox_smtp_port ?? body.mailboxSmtpPort }
        : {}),
      ...(body.mailbox_smtp_secure !== undefined || body.mailboxSmtpSecure !== undefined
        ? { smtp_secure: body.mailbox_smtp_secure ?? body.mailboxSmtpSecure }
        : {}),
      ...(body.mailbox_smtp_username !== undefined || body.mailboxSmtpUsername !== undefined
        ? { smtp_username: body.mailbox_smtp_username ?? body.mailboxSmtpUsername }
        : {}),
      ...(body.mailbox_password !== undefined || body.mailboxPassword !== undefined
        ? { password: body.mailbox_password ?? body.mailboxPassword }
        : {}),
      ...(body.mailbox_smtp_password !== undefined || body.mailboxSmtpPassword !== undefined
        ? { smtp_password: body.mailbox_smtp_password ?? body.mailboxSmtpPassword }
        : {}),
      ...(body.mailbox_access_token !== undefined || body.mailboxAccessToken !== undefined
        ? { access_token: body.mailbox_access_token ?? body.mailboxAccessToken }
        : {}),
      ...(body.mailbox_refresh_token !== undefined || body.mailboxRefreshToken !== undefined
        ? { refresh_token: body.mailbox_refresh_token ?? body.mailboxRefreshToken }
        : {}),
      ...(body.oauth_ready !== undefined || body.oauthReady !== undefined
        ? { oauth_ready: body.oauth_ready ?? body.oauthReady }
        : {}),
      ...(body.app_password_configured !== undefined || body.appPasswordConfigured !== undefined
        ? { app_password_configured: body.app_password_configured ?? body.appPasswordConfigured }
        : {}),
      ...(body.inbox_ready !== undefined || body.inboxReady !== undefined
        ? { inbox_ready: body.inbox_ready ?? body.inboxReady }
        : {})
    }
  };

  return normalizeSubmissionIdentityProfile(merged, { includeSecrets: true });
}

function buildIdentityOtpInbox(identity = {}) {
  const normalized = normalizeSubmissionIdentityProfile(identity, { includeSecrets: true });
  if (!hasSubmissionIdentity(normalized)) {
    return null;
  }

  const mailbox = isPlainObject(normalized.mailbox) ? normalized.mailbox : {};
  const email = sanitizeOptionalString(mailbox.email, 320) || null;
  const username = sanitizeOptionalString(mailbox.username, 320) || email;
  const host = inferMailboxHost(normalized);
  const password = sanitizeOptionalString(mailbox.password, 1024) || null;
  const accessToken = sanitizeOptionalString(mailbox.access_token, 4096) || null;
  if (!email || !username || !host || (!password && !accessToken)) {
    return null;
  }

  return {
    provider: "imap",
    email,
    username,
    host,
    port: Number.isFinite(Number(mailbox.port)) ? Number(mailbox.port) : 993,
    secure: mailbox.secure !== false,
    mailbox: "INBOX",
    ...(password ? { password } : {}),
    ...(accessToken ? { accessToken } : {})
  };
}

function buildIdentitySmtpConfig(identity = {}) {
  const normalized = normalizeSubmissionIdentityProfile(identity, { includeSecrets: true });
  if (!hasSubmissionIdentity(normalized)) {
    return null;
  }

  const mailbox = isPlainObject(normalized.mailbox) ? normalized.mailbox : {};
  const email = sanitizeOptionalString(mailbox.email, 320) || null;
  const username =
    sanitizeOptionalString(mailbox.smtp_username, 320) ||
    sanitizeOptionalString(mailbox.username, 320) ||
    email;
  const host = sanitizeOptionalString(mailbox.smtp_host, 320) || null;
  const password =
    sanitizeOptionalString(mailbox.smtp_password, 1024) ||
    sanitizeOptionalString(mailbox.password, 1024) ||
    null;
  const accessToken = sanitizeOptionalString(mailbox.access_token, 4096) || null;
  if (!email || !username || !host || (!password && !accessToken)) {
    return null;
  }

  return {
    provider: sanitizeOptionalString(mailbox.provider, 120) || "custom",
    email,
    username,
    host,
    port: Number.isFinite(Number(mailbox.smtp_port)) ? Number(mailbox.smtp_port) : 587,
    secure: mailbox.smtp_secure === true,
    ...(password ? { password } : {}),
    ...(accessToken ? { accessToken } : {})
  };
}

module.exports = {
  IDENTITY_MODES,
  MAILBOX_AUTH_METHODS,
  MAILBOX_PROTOCOLS,
  MAILBOX_PROVIDER_PRESETS,
  normalizeIdentityMode,
  normalizeMailboxAuthMethod,
  normalizeMailboxProtocol,
  normalizeMailboxProvider,
  normalizeSubmissionIdentityProfile,
  hasSubmissionIdentity,
  buildSubmissionIdentityInput,
  resolveMailboxConnectionDefaults,
  inferMailboxHost,
  buildIdentityOtpInbox,
  buildIdentitySmtpConfig
};
