const { sanitizeString } = require("../../lib/qa-core");

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_PROVIDER = "local";
const FLUENT_EMOJI_BASE_URL = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets";
const CACHE_VERSION = "memoji-v4";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ITEMS = 300;
const avatarCache = new Map();

function cacheKeyFromPersona(persona, provider) {
  return `${CACHE_VERSION}:${provider}:${sanitizeString(persona, 280).toLowerCase()}`;
}

function getCachedAvatar(key) {
  const entry = avatarCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    avatarCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedAvatar(key, entry) {
  if (!key) {
    return;
  }
  if (avatarCache.size >= CACHE_MAX_ITEMS) {
    const oldestKey = avatarCache.keys().next().value;
    avatarCache.delete(oldestKey);
  }
  avatarCache.set(key, {
    ...entry,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

function hashSeed(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(list, seed, shift = 0) {
  return list[(seed >>> shift) % list.length];
}

function parsePersonaHints(personaName) {
  const value = String(personaName || "").toLowerCase();
  const explicitAgeMatch =
    value.match(/(\d{1,3})\s*[-\s]?(?:year|yr)s?\s*[-\s]?old\b/i) || value.match(/(\d{1,3})\s*yo\b/i);
  const explicitAge = explicitAgeMatch ? Number(explicitAgeMatch[1]) : null;

  let ageGroup = "adult";
  if (
    (explicitAge && explicitAge >= 60) ||
    /(senior|elderly|retired|grandma|grandmother|grandpa|grandfather|older|\bold\b)/i.test(value)
  ) {
    ageGroup = "senior";
  } else if ((explicitAge && explicitAge <= 22) || /(teen|student|college|young|gen z)/i.test(value)) {
    ageGroup = "youth";
  }

  let gender = "neutral";
  if (/(woman|female|mom|mother|lady|girl|grandma|grandmother|wife)/i.test(value)) {
    gender = "female";
  } else if (/(man|male|dad|father|guy|boy|grandpa|grandfather|gentleman|husband)/i.test(value)) {
    gender = "male";
  }

  let mood = "neutral";
  if (/(skeptic|critical|doubt|hesitant|uncertain)/i.test(value)) {
    mood = "skeptical";
  } else if (/(frustrated|angry|annoyed|impatient|strict)/i.test(value)) {
    mood = "serious";
  } else if (/(friendly|happy|optimistic|enthusiastic|playful)/i.test(value)) {
    mood = "smile";
  }

  const hasGlasses =
    /(glasses|spectacles|reader|reading glasses)/i.test(value) ||
    (ageGroup === "senior" && !/(no glasses|without glasses)/i.test(value));
  const hasBeard = /(beard|mustache|stubble)/i.test(value);
  const hasLongHair = /(long hair|ponytail|bob|braid|curly)/i.test(value) || gender === "female";
  const hasShortHair = /(short hair|buzz|crew cut)/i.test(value) || gender === "male";

  return { ageGroup, gender, mood, hasGlasses, hasBeard, hasLongHair, hasShortHair };
}

function buildLocalMemojiAvatarSvg(persona) {
  const seed = hashSeed(persona);
  const hints = parsePersonaHints(persona);
  const isSenior = hints.ageGroup === "senior";
  const isYouth = hints.ageGroup === "youth";
  const isFemale = hints.gender === "female";
  const isMale = hints.gender === "male";

  const [bgA, bgB] = pick(
    [
      ["#0b1221", "#1a365b"],
      ["#07131f", "#27416a"],
      ["#0f172a", "#325180"],
      ["#101827", "#2a446f"],
      ["#0c1326", "#20536b"]
    ],
    seed,
    1
  );
  const [shirtA, shirtB] = pick(
    [
      ["#12d5a0", "#0e9974"],
      ["#45cfff", "#1b7eaf"],
      ["#9b8cff", "#705ddd"],
      ["#ff95c3", "#d86996"],
      ["#f6be73", "#c48845"],
      ["#63e2cf", "#169786"]
    ],
    seed,
    4
  );

  const skinTone = pick(
    ["#f6d8bf", "#edc3a3", "#dca581", "#c38662", "#9d684a", "#7f513a"],
    seed,
    7
  );
  const skinShade = pick(
    ["#e8ba99", "#d8a885", "#c58b69", "#a67256", "#7e4f3a", "#6d3f2f"],
    seed,
    10
  );
  const lipTone = pick(["#bb6667", "#aa5959", "#91515a", "#c4737d"], seed, 12);
  const hairTone = isSenior
    ? pick(["#d8dde7", "#d9d7d2", "#c8ced8", "#bcc2ce"], seed, 14)
    : pick(["#2c2221", "#4a3128", "#634335", "#7f5639", "#413229", "#1a1a1a"], seed, 14);
  const hairShade = isSenior
    ? pick(["#bac2d0", "#b0ada5", "#aab4c8", "#a5adbc"], seed, 16)
    : pick(["#1f1716", "#30211c", "#473027", "#62422f", "#2b201d", "#121212"], seed, 16);
  const irisTone = pick(["#242428", "#18304b", "#472e1e", "#21463e", "#46305c"], seed, 18);
  const beardTone = pick(["#5a3d2f", "#71513d", "#57433c", "#6c6c75"], seed, 20);

  const mouthPath =
    hints.mood === "smile"
      ? "M108 171 Q128 191 148 171"
      : hints.mood === "serious"
        ? "M110 173 Q128 167 146 173"
        : hints.mood === "skeptical"
          ? "M112 173 Q128 180 146 169"
          : "M110 172 Q128 178 146 172";
  const mouthStroke = hints.mood === "serious" ? "#7c3c4a" : lipTone;

  const browLeftPath =
    hints.mood === "skeptical"
      ? "M96 113 Q107 104 120 109"
      : hints.mood === "serious"
        ? "M96 114 Q108 109 120 113"
        : "M96 112 Q108 104 120 110";
  const browRightPath =
    hints.mood === "skeptical"
      ? "M136 109 Q149 103 161 112"
      : hints.mood === "serious"
        ? "M136 113 Q149 109 161 113"
        : "M136 110 Q149 104 161 111";

  let hairPrimaryPath = "";
  let hairAccentPath = "";
  if (hints.hasLongHair && !hints.hasShortHair) {
    hairPrimaryPath = "M70 146V94c0-41 24-64 58-64s58 23 58 64v53c-13-20-26-30-58-30s-45 10-58 30Z";
    hairAccentPath = "M82 86c8-23 25-36 46-36 30 0 47 14 52 38-16-8-34-12-52-12-18 0-33 3-46 10Z";
  } else if (hints.hasShortHair && !hints.hasLongHair) {
    hairPrimaryPath = "M74 118c1-37 24-58 54-58s53 21 54 58v19c-12-13-25-20-54-20s-42 7-54 20v-19Z";
    hairAccentPath = "M85 92c8-19 22-30 43-30s36 11 44 30c-14-7-29-10-44-10s-29 3-43 10Z";
  } else {
    hairPrimaryPath = "M72 132V95c0-40 24-62 56-62s56 22 56 62v40c-11-16-24-24-56-24s-46 8-56 21Z";
    hairAccentPath = "M82 86c9-21 24-33 46-33s38 12 46 33c-14-7-30-10-46-10s-32 3-46 10Z";
  }

  const beardPath =
    (hints.hasBeard || (isMale && !isYouth && ((seed >>> 3) % 3 === 0))) && !isSenior
      ? `<path d="M101 173c8 11 46 11 54 0-5 13-16 20-27 20s-22-7-27-20Z" fill="${beardTone}" opacity="0.4"/>`
      : "";
  const wrinklePaths = isSenior
    ? `
      <path d="M96 140h11M149 140h11" stroke="#a07f73" stroke-width="1.6" stroke-linecap="round" opacity="0.42"/>
      <path d="M118 164q10 5 20 0" stroke="#a07f73" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.34"/>
    `
    : "";
  const glassesMarkup = hints.hasGlasses
    ? `
      <path d="M92 139h24M140 139h24M128 139h4" stroke="#5c6f90" stroke-width="2" stroke-linecap="round"/>
      <rect x="88" y="127" width="30" height="24" rx="10" fill="none" stroke="#5c6f90" stroke-width="2"/>
      <rect x="138" y="127" width="30" height="24" rx="10" fill="none" stroke="#5c6f90" stroke-width="2"/>
    `
    : "";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="QA bot personality avatar">
  <defs>
    <radialGradient id="bg" cx="50%" cy="24%" r="80%">
      <stop offset="0%" stop-color="${bgB}"/>
      <stop offset="100%" stop-color="${bgA}"/>
    </radialGradient>
    <radialGradient id="skin" cx="40%" cy="32%" r="74%">
      <stop offset="0%" stop-color="${skinTone}"/>
      <stop offset="84%" stop-color="${skinShade}"/>
      <stop offset="100%" stop-color="${skinShade}"/>
    </radialGradient>
    <linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${shirtA}"/>
      <stop offset="100%" stop-color="${shirtB}"/>
    </linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${hairTone}"/>
      <stop offset="100%" stop-color="${hairShade}"/>
    </linearGradient>
    <radialGradient id="eyeGlow" cx="50%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f2f5fa"/>
    </radialGradient>
    <filter id="softShadow" x="-40%" y="-35%" width="180%" height="190%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#020617" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="72" fill="url(#bg)"/>
  <ellipse cx="128" cy="225" rx="66" ry="13" fill="#020617" opacity="0.24"/>
  <path d="M58 246c10-35 33-57 70-57s60 22 70 57H58Z" fill="url(#shirt)"/>
  <ellipse cx="128" cy="46" rx="74" ry="24" fill="#8ec7ff" opacity="0.07"/>
  <g filter="url(#softShadow)">
    <ellipse cx="85" cy="129" rx="12.5" ry="17.5" fill="url(#skin)"/>
    <ellipse cx="171" cy="129" rx="12.5" ry="17.5" fill="url(#skin)"/>
    <rect x="113" y="172" width="30" height="24" rx="11" fill="${skinShade}"/>
    <ellipse cx="128" cy="128" rx="56" ry="66" fill="url(#skin)"/>
    <path d="${hairPrimaryPath}" fill="url(#hair)"/>
    <path d="${hairAccentPath}" fill="${hairShade}" opacity="0.75"/>
    <ellipse cx="106" cy="138" rx="11.4" ry="9.8" fill="url(#eyeGlow)"/>
    <ellipse cx="150" cy="138" rx="11.4" ry="9.8" fill="url(#eyeGlow)"/>
    <circle cx="106" cy="139" r="4.6" fill="${irisTone}"/>
    <circle cx="150" cy="139" r="4.6" fill="${irisTone}"/>
    <circle cx="104" cy="137" r="1.35" fill="#fff" opacity="0.88"/>
    <circle cx="148" cy="137" r="1.35" fill="#fff" opacity="0.88"/>
    <path d="${browLeftPath}" stroke="${hairShade}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
    <path d="${browRightPath}" stroke="${hairShade}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
    <path d="M128 143c-5 8-5 16 0 22" stroke="#aa7d6b" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.52"/>
    <path d="${mouthPath}" stroke="${mouthStroke}" stroke-width="3.8" stroke-linecap="round" fill="none"/>
    <ellipse cx="95" cy="153" rx="6.8" ry="3.8" fill="#ee9ca7" opacity="${isYouth ? "0.34" : "0.2"}"/>
    <ellipse cx="161" cy="153" rx="6.8" ry="3.8" fill="#ee9ca7" opacity="${isYouth ? "0.34" : "0.2"}"/>
    ${beardPath}
    ${wrinklePaths}
    ${glassesMarkup}
  </g>
</svg>`;

  return Buffer.from(svg.replace(/\s+/g, " ").trim(), "utf8");
}

function resolveOpenAiApiKey() {
  return (
    sanitizeString(process.env.QA_OPENAI_API_KEY, 512) ||
    sanitizeString(process.env.OPENAI_API_KEY, 512) ||
    sanitizeString(process.env.BROWSERBASE_OPENAI_API_KEY, 512)
  );
}

function resolveOpenAiBaseUrl() {
  const raw = sanitizeString(process.env.QA_COORDINATE_ANNOTATION_BASE_URL || process.env.OPENAI_BASE_URL, 2048);
  if (!raw) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  return raw.replace(/\/+$/, "");
}

function buildOpenAiPrompt(persona) {
  return [
    "Create a premium 3D cartoon avatar portrait for a QA testing bot personality.",
    `Personality description: ${persona}`,
    "Output constraints:",
    "- one head and shoulders avatar, centered",
    "- transparent background",
    "- modern mobile sticker avatar aesthetic",
    "- soft studio lighting with subtle depth",
    "- no text, logos, watermark, UI, or accessories not implied by the persona"
  ].join("\n");
}

async function generateAvatarPngWithOpenAi(persona) {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is missing");
  }

  const baseUrl = resolveOpenAiBaseUrl();
  const model = sanitizeString(process.env.QA_PERSONA_AVATAR_MODEL, 128) || DEFAULT_MODEL;
  const prompt = buildOpenAiPrompt(persona);
  const attempts = [
    {
      model,
      prompt,
      size: "512x512",
      output_format: "png",
      quality: "medium",
      background: "transparent"
    },
    {
      model,
      prompt,
      size: "512x512",
      response_format: "b64_json",
      background: "transparent"
    },
    {
      model,
      prompt,
      size: "512x512"
    }
  ];

  let lastError = "image generation failed";
  for (const body of attempts) {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      lastError = `image generation failed (${response.status}) ${sanitizeString(await response.text(), 500)}`;
      continue;
    }

    const payload = await response.json().catch(() => null);
    const first = payload?.data?.[0] || null;
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (typeof first?.url === "string" && first.url.trim()) {
      const imageResponse = await fetch(first.url);
      if (!imageResponse.ok) {
        lastError = `generated image URL download failed (${imageResponse.status})`;
        continue;
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    lastError = "generated image payload missing data";
  }

  throw new Error(lastError);
}

function buildFluentEmojiAssetCandidates(persona) {
  const seed = hashSeed(persona);
  const hints = parsePersonaHints(persona);

  const names = [];
  if (hints.hasBeard && hints.gender === "male") {
    names.push("Man beard");
  }

  if (hints.ageGroup === "senior") {
    if (hints.gender === "female") {
      names.push("Old woman");
    } else if (hints.gender === "male") {
      names.push("Old man");
    } else {
      names.push("Older person");
    }
  } else if (hints.ageGroup === "youth") {
    if (hints.gender === "female") {
      names.push("Girl", "Woman student");
    } else if (hints.gender === "male") {
      names.push("Boy", "Man student");
    } else {
      names.push("Person");
    }
  } else {
    if (hints.gender === "female") {
      names.push("Woman office worker", "Woman student");
    } else if (hints.gender === "male") {
      names.push("Man office worker", "Man student");
    } else {
      names.push("Person");
    }
  }

  if (hints.hasGlasses) {
    if (hints.gender === "female") {
      names.push("Woman student");
    } else if (hints.gender === "male") {
      names.push("Man student");
    } else {
      names.push("Person");
    }
  }

  names.push("Person", "Woman office worker", "Man office worker", "Older person");

  const uniqueNames = [];
  const seenNames = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      continue;
    }
    seenNames.add(key);
    uniqueNames.push(name);
  }

  const tones = ["Default", "Medium", "Medium-Light", "Light", "Medium-Dark", "Dark"];
  const primaryTone = tones[seed % tones.length];
  const toneOrder = [primaryTone, "Default", "Medium", "Medium-Light", "Light", "Medium-Dark", "Dark"].filter(
    (tone, index, list) => list.indexOf(tone) === index
  );

  const candidates = [];
  for (const name of uniqueNames) {
    const slug = name
      .toLowerCase()
      .replaceAll("-", " ")
      .replace(/[^a-z0-9 ]+/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const encodedName = name.split(" ").map(encodeURIComponent).join("%20");

    for (const tone of toneOrder) {
      const encodedTone = tone.split(" ").map(encodeURIComponent).join("%20");
      const toneSlug = tone.toLowerCase();
      candidates.push(
        `${FLUENT_EMOJI_BASE_URL}/${encodedName}/${encodedTone}/3D/${slug}_3d_${toneSlug}.png`
      );
    }
  }

  return candidates;
}

async function fetchFluentAvatarPng(persona) {
  const candidates = buildFluentEmojiAssetCandidates(persona);
  for (const url of candidates) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SwarmTesterAvatar/1.0"
      }
    });
    if (!response.ok) {
      continue;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("image/png")) {
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 300) {
      continue;
    }

    return buffer;
  }

  throw new Error("Fluent emoji avatar fetch failed");
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const persona = sanitizeString(req.query?.persona || req.query?.name || "General QA personality", 280);
  if (!persona) {
    return res.status(400).json({ ok: false, error: "persona is required" });
  }

  const providerRaw = sanitizeString(req.query?.provider || process.env.QA_PERSONA_AVATAR_PROVIDER || DEFAULT_PROVIDER, 32);
  const provider = providerRaw.toLowerCase() || DEFAULT_PROVIDER;
  const key = cacheKeyFromPersona(persona, provider);
  const cached = getCachedAvatar(key);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("X-Avatar-Source", "cache");
    res.setHeader("X-Avatar-Provider", provider);
    return res.status(200).send(cached.data);
  }

  let openAiError = null;
  if (provider === "openai" || provider === "hybrid") {
    try {
      const pngBuffer = await generateAvatarPngWithOpenAi(persona);
      setCachedAvatar(key, { contentType: "image/png", data: pngBuffer });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      res.setHeader("X-Avatar-Source", "generated-openai");
      res.setHeader("X-Avatar-Provider", provider);
      return res.status(200).send(pngBuffer);
    } catch (error) {
      openAiError = sanitizeString(error?.message || "openai generation failed", 220);
    }
  }

  let fluentError = null;
  try {
    const fluentAvatar = await fetchFluentAvatarPng(persona);
    setCachedAvatar(key, { contentType: "image/png", data: fluentAvatar });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("X-Avatar-Source", "generated-fluent");
    res.setHeader("X-Avatar-Provider", provider);
    if (openAiError) {
      res.setHeader("X-Avatar-OpenAI-Error", openAiError);
    }
    return res.status(200).send(fluentAvatar);
  } catch (error) {
    fluentError = sanitizeString(error?.message || "fluent avatar fetch failed", 220);
  }

  const localAvatarSvg = buildLocalMemojiAvatarSvg(persona);
  setCachedAvatar(key, { contentType: "image/svg+xml; charset=utf-8", data: localAvatarSvg });
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("X-Avatar-Source", "generated-local");
  res.setHeader("X-Avatar-Provider", provider);
  if (openAiError) {
    res.setHeader("X-Avatar-OpenAI-Error", openAiError);
  }
  if (fluentError) {
    res.setHeader("X-Avatar-Fluent-Error", fluentError);
  }
  return res.status(200).send(localAvatarSvg);
};
