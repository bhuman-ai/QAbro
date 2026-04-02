const { sanitizeOptionalString, sanitizeString } = require("./qa-core");

const PRODUCT_STATUSES = Object.freeze(["green", "yellow", "red"]);
const STARTUP_STANDARD_RUNTIME_POLICY = Object.freeze({
  twocaptcha_timeout_ms: 180000,
  captcha_builtin_wait_ms: 15000,
  twocaptcha_post_inject_wait_ms: 4000,
  record_video_default: true
});
const STARTUP_DIRECT_RUNTIME_POLICY = Object.freeze({
  twocaptcha_timeout_ms: 180000,
  captcha_builtin_wait_ms: 15000,
  twocaptcha_post_inject_wait_ms: 4000,
  record_video_default: true,
  submission_proxy_auto_select: false,
  self_hosted_proxy_server: ""
});
const STARTUP_EXTENDED_CAPTCHA_RUNTIME_POLICY = Object.freeze({
  twocaptcha_timeout_ms: 240000,
  captcha_builtin_wait_ms: 45000,
  twocaptcha_post_inject_wait_ms: 8000,
  record_video_default: false
});
const LOCAL_PRESENCE_RUNTIME_POLICY = Object.freeze({
  twocaptcha_timeout_ms: 180000,
  captcha_builtin_wait_ms: 20000,
  twocaptcha_post_inject_wait_ms: 5000,
  record_video_default: true
});
const STARTUP_EPHEMERAL_EXECUTION_POLICY = Object.freeze({
  session_mode: "ephemeral_submitter",
  ownership_model: "client_owned_mailbox",
  auth_strategy: "signup_if_needed",
  proxy_policy: "geo_recommended",
  captcha_expectation: "possible"
});
const STARTUP_CAPTCHA_HEAVY_EXECUTION_POLICY = Object.freeze({
  session_mode: "ephemeral_submitter",
  ownership_model: "client_owned_mailbox",
  auth_strategy: "signup_if_needed",
  proxy_policy: "geo_recommended",
  captcha_expectation: "expected"
});
const FOUNDER_PERSONAL_EXECUTION_POLICY = Object.freeze({
  session_mode: "founder_personal",
  ownership_model: "founder_personal",
  auth_strategy: "founder_account_required",
  proxy_policy: "founder_geo_recommended",
  captcha_expectation: "possible"
});
const LOCAL_PERSISTENT_EXECUTION_POLICY = Object.freeze({
  session_mode: "persistent_owner",
  ownership_model: "client_owned_mailbox",
  auth_strategy: "login_or_claim_existing",
  proxy_policy: "same_country_required",
  captcha_expectation: "expected"
});
const CLIENT_OWNED_IDENTITY_REQUIREMENT = Object.freeze({
  allowed_modes: ["client_owned", "brand_mailbox", "managed_transitional"],
  mailbox_required: true,
  editable_after_submit: true,
  preferred_auth_methods: ["oauth", "app_password", "provider_password", "imap_password", "smtp_imap_password"],
  note: "Use a client-owned mailbox so the client retains edit access after launch."
});
const FOUNDER_PERSONAL_IDENTITY_REQUIREMENT = Object.freeze({
  allowed_modes: ["founder_personal"],
  mailbox_required: false,
  editable_after_submit: true,
  preferred_auth_methods: [],
  note: "Use the founder's real identity for community-sensitive launch surfaces."
});

function cloneIdentityRequirement(value) {
  const requirement = value && typeof value === "object" ? value : {};
  return {
    allowed_modes: Array.isArray(requirement.allowed_modes) ? [...requirement.allowed_modes] : [],
    mailbox_required: requirement.mailbox_required === true,
    editable_after_submit: requirement.editable_after_submit !== false,
    preferred_auth_methods: Array.isArray(requirement.preferred_auth_methods)
      ? [...requirement.preferred_auth_methods]
      : [],
    note: sanitizeOptionalString(requirement.note, 240) || null
  };
}

function clonePolicyConfig(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

const SITE_CATALOG = Object.freeze({
  saashub: Object.freeze({
    site_id: "saashub",
    site_name: "SaaSHub",
    track: "startup",
    support_tier: "supported",
    default_policy: "assist",
    product_status: "green",
    product_lane: "launch_starter",
    submit_url: "https://www.saashub.com/services/submit",
    pack_ids: ["startup_core", "startup_ai"],
    category: "software_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: STARTUP_EPHEMERAL_EXECUTION_POLICY,
    runtime_policy: STARTUP_DIRECT_RUNTIME_POLICY,
    notes: ["Structured software directory with categories and competitors."],
    product_notes: ["Core launch connector with a realistic automation path."]
  }),
  betalist: Object.freeze({
    site_id: "betalist",
    site_name: "BetaList",
    track: "startup",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "launch_boosters",
    submit_url: "https://betalist.com/submit",
    pack_ids: ["startup_core"],
    category: "startup_launch",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: STARTUP_CAPTCHA_HEAVY_EXECUTION_POLICY,
    runtime_policy: STARTUP_EXTENDED_CAPTCHA_RUNTIME_POLICY,
    runtime_overrides: Object.freeze({
      twocaptcha_timeout_ms: 240000,
      captcha_builtin_wait_ms: 45000,
      twocaptcha_post_inject_wait_ms: 8000
    }),
    notes: ["Good startup-launch fit; requires a maintained recon profile."],
    product_notes: ["Strong assisted add-on, but not safe enough for the core self-serve promise."]
  }),
  product_hunt: Object.freeze({
    site_id: "product_hunt",
    site_name: "Product Hunt",
    track: "startup",
    support_tier: "manual_only",
    default_policy: "manual",
    product_status: "red",
    product_lane: "community_launch",
    pack_ids: ["startup_core"],
    category: "community_launch",
    identity_requirement: FOUNDER_PERSONAL_IDENTITY_REQUIREMENT,
    execution_policy: FOUNDER_PERSONAL_EXECUTION_POLICY,
    runtime_policy: STARTUP_STANDARD_RUNTIME_POLICY,
    notes: ["Community-sensitive launch flow; keep manual or heavily assisted."],
    product_notes: ["Exclude from the automation promise; sell only as white-glove if ever."]
  }),
  indie_hackers: Object.freeze({
    site_id: "indie_hackers",
    site_name: "Indie Hackers",
    track: "startup",
    support_tier: "manual_only",
    default_policy: "manual",
    product_status: "red",
    product_lane: "community_launch",
    pack_ids: ["startup_core"],
    category: "community_launch",
    identity_requirement: FOUNDER_PERSONAL_IDENTITY_REQUIREMENT,
    execution_policy: FOUNDER_PERSONAL_EXECUTION_POLICY,
    runtime_policy: STARTUP_STANDARD_RUNTIME_POLICY,
    notes: ["Community-oriented; keep operator review in the loop."],
    product_notes: ["Community mechanics make this a bad public automation promise."]
  }),
  futurepedia: Object.freeze({
    site_id: "futurepedia",
    site_name: "Futurepedia",
    track: "startup",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "launch_boosters",
    submit_url: "https://www.futurepedia.io/submit-tool",
    pack_ids: ["startup_ai"],
    category: "ai_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: STARTUP_CAPTCHA_HEAVY_EXECUTION_POLICY,
    runtime_policy: STARTUP_EXTENDED_CAPTCHA_RUNTIME_POLICY,
    notes: ["Best fit for AI-native products."],
    product_notes: ["Keep as an AI-specific add-on rather than a core startup connector."]
  }),
  toolify: Object.freeze({
    site_id: "toolify",
    site_name: "Toolify",
    track: "startup",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "launch_boosters",
    submit_url: "https://www.toolify.ai/submit",
    pack_ids: ["startup_ai"],
    category: "ai_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: STARTUP_CAPTCHA_HEAVY_EXECUTION_POLICY,
    runtime_policy: STARTUP_EXTENDED_CAPTCHA_RUNTIME_POLICY,
    notes: ["AI-focused directory; keep connector maintained."],
    product_notes: ["Useful AI booster, not a broad startup-core promise."]
  }),
  top_ai_tools: Object.freeze({
    site_id: "top_ai_tools",
    site_name: "TopAI.tools",
    track: "startup",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "launch_boosters",
    submit_url: "https://topai.tools/submit",
    pack_ids: ["startup_ai"],
    category: "ai_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: STARTUP_CAPTCHA_HEAVY_EXECUTION_POLICY,
    runtime_policy: STARTUP_EXTENDED_CAPTCHA_RUNTIME_POLICY,
    notes: ["AI-native tool directory."],
    product_notes: ["AI-only launch booster; keep outside the broad startup starter pack."]
  }),
  google_business_profile: Object.freeze({
    site_id: "google_business_profile",
    site_name: "Google Business Profile",
    track: "physical_local",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "presence_pack",
    submit_url: "https://business.google.com/us/business-profile/",
    pack_ids: ["physical_local", "forney_local"],
    category: "maps_local",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: LOCAL_PERSISTENT_EXECUTION_POLICY,
    runtime_policy: LOCAL_PRESENCE_RUNTIME_POLICY,
    notes: ["Claim-or-create with verification and duplicate-review risk."],
    product_notes: ["High-value local connector, but assisted until persistent auth and claim flows are hardened."]
  }),
  apple_business_connect: Object.freeze({
    site_id: "apple_business_connect",
    site_name: "Apple Business Connect",
    track: "physical_local",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "presence_pack",
    submit_url: "https://businessconnect.apple.com/",
    pack_ids: ["physical_local", "forney_local"],
    category: "maps_local",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: LOCAL_PERSISTENT_EXECUTION_POLICY,
    runtime_policy: LOCAL_PRESENCE_RUNTIME_POLICY,
    notes: ["Place-card workflow; expect verification checkpoints."],
    product_notes: ["Good assisted presence connector, but not self-serve safe."]
  }),
  yelp: Object.freeze({
    site_id: "yelp",
    site_name: "Yelp",
    track: "physical_local",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "presence_pack",
    submit_url: "https://biz.yelp.com/claim",
    pack_ids: ["physical_local", "forney_local"],
    category: "local_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: LOCAL_PERSISTENT_EXECUTION_POLICY,
    runtime_policy: LOCAL_PRESENCE_RUNTIME_POLICY,
    notes: ["Claim-or-create local listing with review flow."],
    product_notes: ["Strong local listing, but currently better as assisted due to auth and captcha behavior."]
  }),
  bbb: Object.freeze({
    site_id: "bbb",
    site_name: "BBB",
    track: "physical_local",
    support_tier: "recon_needed",
    default_policy: "assist",
    product_status: "yellow",
    product_lane: "presence_pack",
    submit_url: "https://www.bbb.org/get-listed",
    pack_ids: ["physical_local", "forney_local"],
    category: "credibility_directory",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: LOCAL_PERSISTENT_EXECUTION_POLICY,
    runtime_policy: LOCAL_PRESENCE_RUNTIME_POLICY,
    notes: ["Business profile / accreditation split; keep assisted."],
    product_notes: ["Valuable trust listing, but captcha/editorial friction keeps it out of green."]
  }),
  forney_chamber: Object.freeze({
    site_id: "forney_chamber",
    site_name: "Forney Chamber",
    track: "physical_local",
    support_tier: "manual_only",
    default_policy: "manual",
    product_status: "red",
    product_lane: "presence_pack",
    submit_url: "https://forneychamber.com/member/newmemberapp",
    pack_ids: ["forney_local"],
    category: "local_membership",
    identity_requirement: CLIENT_OWNED_IDENTITY_REQUIREMENT,
    execution_policy: LOCAL_PERSISTENT_EXECUTION_POLICY,
    runtime_policy: LOCAL_PRESENCE_RUNTIME_POLICY,
    notes: ["Local membership directory; likely human-handled."],
    product_notes: ["Keep manual-only; not part of the automated promise."]
  })
});

const SITE_PACKS = Object.freeze([
  Object.freeze({
    pack_id: "launch_starter",
    pack_name: "Launch Starter",
    track: "startup",
    pack_kind: "product",
    description: "Green-only startup launch pack for connectors that are realistic to automate end-to-end.",
    site_ids: ["saashub"]
  }),
  Object.freeze({
    pack_id: "launch_boosters",
    pack_name: "Launch Boosters",
    track: "startup",
    pack_kind: "product",
    description: "Assisted launch add-ons for stronger but less deterministic startup and AI directories.",
    site_ids: ["betalist", "futurepedia", "toolify", "top_ai_tools"]
  }),
  Object.freeze({
    pack_id: "community_launch",
    pack_name: "Community Launch",
    track: "startup",
    pack_kind: "product",
    description: "Manual or white-glove launch destinations with community mechanics.",
    site_ids: ["product_hunt", "indie_hackers"]
  }),
  Object.freeze({
    pack_id: "presence_pack",
    pack_name: "Presence Pack",
    track: "physical_local",
    pack_kind: "product",
    description: "Assisted local-business visibility pack for maps, trust, and review destinations.",
    site_ids: ["google_business_profile", "apple_business_connect", "yelp", "bbb"]
  }),
  Object.freeze({
    pack_id: "startup_core",
    pack_name: "Startup Core",
    track: "startup",
    pack_kind: "legacy",
    description: "Structured startup-launch pack anchored on broadly relevant software directories.",
    site_ids: ["saashub", "betalist", "product_hunt", "indie_hackers"]
  }),
  Object.freeze({
    pack_id: "startup_ai",
    pack_name: "Startup AI",
    track: "startup",
    pack_kind: "legacy",
    description: "AI-native startup pack for products that clearly fit AI tool directories.",
    site_ids: ["saashub", "futurepedia", "toolify", "top_ai_tools"]
  }),
  Object.freeze({
    pack_id: "physical_local",
    pack_name: "Physical Local",
    track: "physical_local",
    pack_kind: "legacy",
    description: "Core local-business visibility pack for maps, reviews, and trust listings.",
    site_ids: ["google_business_profile", "apple_business_connect", "yelp", "bbb"]
  }),
  Object.freeze({
    pack_id: "forney_local",
    pack_name: "Forney Local",
    track: "physical_local",
    pack_kind: "legacy",
    description: "Client-specific local-business pack for the Forney pilot.",
    site_ids: ["google_business_profile", "apple_business_connect", "yelp", "bbb", "forney_chamber"]
  }),
  Object.freeze({
    pack_id: "custom",
    pack_name: "Custom",
    track: "custom",
    pack_kind: "system",
    description: "Bring your own site list on top of the master catalog.",
    site_ids: []
  })
]);

function normalizePackId(value) {
  return sanitizeString(value, 128).toLowerCase();
}

function normalizeTrack(value) {
  return sanitizeString(value, 64).toLowerCase() || "custom";
}

function normalizeProductStatus(value) {
  const safeValue = sanitizeString(value, 32).toLowerCase();
  return PRODUCT_STATUSES.includes(safeValue) ? safeValue : "";
}

function packContainsSite(packId, site) {
  const safePackId = normalizePackId(packId);
  if (!safePackId || !site) {
    return true;
  }

  const pack = SITE_PACKS.find((item) => item.pack_id === safePackId) || null;
  if (pack && Array.isArray(pack.site_ids) && pack.site_ids.length) {
    return pack.site_ids.includes(site.site_id);
  }

  return Array.isArray(site.pack_ids) ? site.pack_ids.includes(safePackId) : false;
}

function cloneSite(site) {
  if (!site) {
    return null;
  }
  return {
    ...site,
    identity_requirement: cloneIdentityRequirement(site.identity_requirement),
    execution_policy: clonePolicyConfig(site.execution_policy),
    runtime_policy: clonePolicyConfig(site.runtime_policy),
    runtime_overrides:
      site.runtime_overrides && typeof site.runtime_overrides === "object"
        ? JSON.parse(JSON.stringify(site.runtime_overrides))
        : undefined
  };
}

function buildProductSummary(sites = []) {
  const summary = {
    total_sites: sites.length,
    green_count: 0,
    yellow_count: 0,
    red_count: 0
  };
  for (const site of sites) {
    const status = normalizeProductStatus(site?.product_status);
    if (status) {
      summary[`${status}_count`] += 1;
    }
  }
  return summary;
}

function buildSiteScorecardEntry(site) {
  const safeSite = cloneSite(site);
  if (!safeSite) {
    return null;
  }
  return {
    site_id: safeSite.site_id,
    site_name: safeSite.site_name,
    track: safeSite.track,
    category: safeSite.category,
    support_tier: safeSite.support_tier,
    default_policy: safeSite.default_policy,
    product_status: safeSite.product_status || "yellow",
    product_lane: safeSite.product_lane || "custom",
    identity_requirement: cloneIdentityRequirement(safeSite.identity_requirement),
    execution_policy: clonePolicyConfig(safeSite.execution_policy),
    runtime_policy: clonePolicyConfig(safeSite.runtime_policy),
    pack_ids: Array.isArray(safeSite.pack_ids) ? [...safeSite.pack_ids] : [],
    submit_url: safeSite.submit_url || null,
    notes: Array.isArray(safeSite.notes) ? [...safeSite.notes] : [],
    product_notes: Array.isArray(safeSite.product_notes) ? [...safeSite.product_notes] : []
  };
}

function getSiteDefinition(siteId) {
  const safeSiteId = sanitizeString(siteId, 128).toLowerCase();
  return SITE_CATALOG[safeSiteId] || null;
}

function getSitePack(packId) {
  const safePackId = normalizePackId(packId);
  const pack = SITE_PACKS.find((item) => item.pack_id === safePackId) || null;
  if (!pack) {
    return null;
  }

  const sites = pack.site_ids.map((siteId) => cloneSite(getSiteDefinition(siteId))).filter(Boolean);

  return {
    ...pack,
    sites,
    product_summary: buildProductSummary(sites)
  };
}

function listSitePacks(filters = {}) {
  const track = normalizeTrack(filters.track);
  const packKind = sanitizeString(filters.pack_kind || filters.packKind, 32).toLowerCase();
  return SITE_PACKS.filter((pack) => track === "custom" || !filters.track || pack.track === track)
    .filter((pack) => (!packKind ? true : sanitizeString(pack.pack_kind, 32).toLowerCase() === packKind))
    .map((pack) => ({
    pack_id: pack.pack_id,
    pack_name: pack.pack_name,
    track: pack.track,
    pack_kind: pack.pack_kind || "legacy",
    description: pack.description,
    site_count: pack.site_ids.length,
    sites: pack.site_ids.map((siteId) => cloneSite(getSiteDefinition(siteId))).filter(Boolean),
    product_summary: buildProductSummary(pack.site_ids.map((siteId) => getSiteDefinition(siteId)).filter(Boolean))
    }));
}

function listSupportedSites(filters = {}) {
  const track = normalizeTrack(filters.track);
  const packId = normalizePackId(filters.pack_id || filters.packId);
  const supportTier = sanitizeString(filters.support_tier || filters.supportTier, 64).toLowerCase();
  const productStatus = normalizeProductStatus(filters.product_status || filters.productStatus);

  return Object.values(SITE_CATALOG)
    .filter((site) => (!filters.track ? true : site.track === track))
    .filter((site) => (!packId ? true : packContainsSite(packId, site)))
    .filter((site) => (!supportTier ? true : site.support_tier === supportTier))
    .filter((site) => (!productStatus ? true : site.product_status === productStatus))
    .map((site) => cloneSite(site));
}

function listSiteScorecard(filters = {}) {
  const track = normalizeTrack(filters.track);
  const packId = normalizePackId(filters.pack_id || filters.packId);
  const supportTier = sanitizeString(filters.support_tier || filters.supportTier, 64).toLowerCase();
  const productStatus = normalizeProductStatus(filters.product_status || filters.productStatus);
  const productLane = sanitizeString(filters.product_lane || filters.productLane, 64).toLowerCase();

  const sites = Object.values(SITE_CATALOG)
    .filter((site) => (!filters.track ? true : site.track === track))
    .filter((site) => (!packId ? true : packContainsSite(packId, site)))
    .filter((site) => (!supportTier ? true : site.support_tier === supportTier))
    .filter((site) => (!productStatus ? true : site.product_status === productStatus))
    .filter((site) => (!productLane ? true : sanitizeString(site.product_lane, 64).toLowerCase() === productLane))
    .map((site) => buildSiteScorecardEntry(site))
    .filter(Boolean);

  const sortOrder = { green: 0, yellow: 1, red: 2 };
  sites.sort((left, right) => {
    const leftWeight = sortOrder[normalizeProductStatus(left.product_status)] ?? 99;
    const rightWeight = sortOrder[normalizeProductStatus(right.product_status)] ?? 99;
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }
    return left.site_name.localeCompare(right.site_name);
  });

  return {
    summary: buildProductSummary(sites),
    sites
  };
}

function expandSiteSelection(selection = {}) {
  const packId = normalizePackId(selection.pack_id || selection.packId);
  const explicitSiteIds = Array.from(
    new Set(
      (Array.isArray(selection.site_ids) ? selection.site_ids : [])
        .map((value) => sanitizeString(value, 128).toLowerCase())
        .filter(Boolean)
    )
  );
  const pack = packId ? getSitePack(packId) : null;
  const siteIds = Array.from(
    new Set([...(pack ? pack.site_ids : []), ...explicitSiteIds])
  );

  return {
    pack_id: pack?.pack_id || (packId || "custom"),
    pack_name: pack?.pack_name || "Custom",
    track: pack?.track || normalizeTrack(selection.track),
    site_ids: siteIds,
    sites: siteIds.map((siteId) => getSiteDefinition(siteId) || {
      site_id: siteId,
      site_name: sanitizeOptionalString(siteId, 180) || siteId,
      track: normalizeTrack(selection.track),
      support_tier: "custom",
      default_policy: "assist",
      product_status: "yellow",
      product_lane: "custom",
      pack_ids: ["custom"],
      category: "custom",
      notes: ["Custom site selection."],
      product_notes: ["Custom site selected outside the maintained catalog."]
    })
  };
}

function recommendSitePack(track, options = {}) {
  const safeTrack = normalizeTrack(track);
  const preferClientPilot = sanitizeString(options.prefer_client_pilot || options.preferClientPilot, 16).toLowerCase() === "true";
  const legacy = sanitizeString(options.legacy || options.useLegacyPacks, 16).toLowerCase() === "true";
  if (safeTrack === "startup") {
    return getSitePack(legacy ? "startup_core" : "launch_starter");
  }
  if (safeTrack === "physical_local") {
    if (preferClientPilot) {
      return getSitePack("forney_local");
    }
    return getSitePack(legacy ? "physical_local" : "presence_pack");
  }
  return getSitePack("custom");
}

module.exports = {
  SITE_CATALOG,
  SITE_PACKS,
  PRODUCT_STATUSES,
  normalizePackId,
  normalizeTrack,
  normalizeProductStatus,
  buildProductSummary,
  buildSiteScorecardEntry,
  getSiteDefinition,
  getSitePack,
  listSitePacks,
  listSupportedSites,
  listSiteScorecard,
  expandSiteSelection,
  recommendSitePack
};
