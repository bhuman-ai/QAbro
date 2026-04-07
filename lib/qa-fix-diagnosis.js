const {
  isPlainObject,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const {
  getGitHubInstallationRepositoryBlob,
  getGitHubInstallationRepositoryTree
} = require("./github-app");
const { inferRoutesFromGitHubTree } = require("./qa-github-routes");

const DEFAULT_FIX_DIAGNOSIS_MODEL = "gpt-4.1-mini";
const DEFAULT_FIX_DIAGNOSIS_TIMEOUT_MS = 20000;
const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "before",
  "button",
  "clear",
  "could",
  "earn",
  "exactly",
  "flow",
  "from",
  "help",
  "homepage",
  "into",
  "just",
  "know",
  "look",
  "more",
  "need",
  "next",
  "page",
  "point",
  "product",
  "specific",
  "steps",
  "this",
  "understand",
  "want",
  "with",
  "would"
]);
const REPO_MATCH_STOP_WORDS = new Set([
  "www",
  "com",
  "app",
  "web",
  "site",
  "staging",
  "stage",
  "prod",
  "production",
  "dev",
  "test",
  "qa"
]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mdx",
  ".md",
  ".json",
  ".mjs",
  ".cjs",
  ".css",
  ".html"
]);

function parseStructuredOutput(text) {
  const safeText = sanitizeOptionalString(text, 120000) || "";
  if (!safeText) {
    return null;
  }
  try {
    return JSON.parse(safeText);
  } catch {
    const firstBrace = safeText.indexOf("{");
    const lastBrace = safeText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(safeText.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractResponsesText(payload) {
  if (!isPlainObject(payload)) {
    return "";
  }
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const outputs = Array.isArray(payload.output) ? payload.output : [];
  const textParts = [];
  outputs.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part?.text === "string" && part.text.trim()) {
        textParts.push(part.text.trim());
      } else if (typeof part?.text?.value === "string" && part.text.value.trim()) {
        textParts.push(part.text.value.trim());
      }
    });
  });
  return textParts.join("\n").trim();
}

function extractStructuredResponsesPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }
  const outputs = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.arguments === "string") {
        const parsedArguments = parseStructuredOutput(part.arguments);
        if (isPlainObject(parsedArguments)) {
          return parsedArguments;
        }
      }
      if (typeof part?.text === "string") {
        const parsedText = parseStructuredOutput(part.text);
        if (isPlainObject(parsedText)) {
          return parsedText;
        }
      }
      if (typeof part?.text?.value === "string") {
        const parsedTextValue = parseStructuredOutput(part.text.value);
        if (isPlainObject(parsedTextValue)) {
          return parsedTextValue;
        }
      }
    }
  }
  return null;
}

function buildDiagnosisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      repo_understanding: { type: "string" },
      likely_fix_location: { type: "string" },
      suspected_files: {
        type: "array",
        items: { type: "string" }
      },
      suggested_fixes: {
        type: "array",
        items: { type: "string" }
      },
      implementation_notes: {
        type: "array",
        items: { type: "string" }
      },
      developer_prompt: { type: "string" },
      confidence_note: { type: "string" }
    },
    required: [
      "repo_understanding",
      "likely_fix_location",
      "suspected_files",
      "suggested_fixes",
      "implementation_notes",
      "developer_prompt",
      "confidence_note"
    ]
  };
}

function tokenizeText(value, maxItems = 12) {
  const tokens = [];
  const seen = new Set();
  const raw = sanitizeString(value, 4000).toLowerCase();
  for (const part of raw.split(/[^a-z0-9]+/g)) {
    const token = part.trim();
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= maxItems) {
      break;
    }
  }
  return tokens;
}

function buildTargetPathTokens(targetUrl) {
  const safeUrl = sanitizeString(targetUrl, 4096);
  if (!safeUrl) {
    return [];
  }
  try {
    const parsed = new URL(safeUrl);
    return tokenizeText(parsed.pathname.replaceAll("/", " "), 6);
  } catch {
    return [];
  }
}

function buildRepositoryMatchTokens({ brandKey, targetUrl }) {
  const tokens = new Set();
  const safeBrandKey = sanitizeString(brandKey, 256).toLowerCase();
  tokenizeText(safeBrandKey.replaceAll(".", " "), 8).forEach((token) => {
    if (!REPO_MATCH_STOP_WORDS.has(token)) {
      tokens.add(token);
    }
  });
  if (safeBrandKey) {
    const hostLikeParts = safeBrandKey.split(".").map((item) => item.trim()).filter(Boolean);
    hostLikeParts.forEach((part) => {
      const token = sanitizeString(part, 128).toLowerCase();
      if (token && token.length >= 3 && !REPO_MATCH_STOP_WORDS.has(token)) {
        tokens.add(token);
      }
    });
  }

  const safeUrl = sanitizeString(targetUrl, 4096);
  if (safeUrl) {
    try {
      const parsed = new URL(safeUrl);
      parsed.hostname
        .split(".")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .forEach((token) => {
          if (token.length >= 3 && !REPO_MATCH_STOP_WORDS.has(token)) {
            tokens.add(token);
          }
        });
    } catch {}
  }

  return Array.from(tokens).slice(0, 10);
}

function inferBestRepositoryForBrand({ brandKey, targetUrl, repositories }) {
  const tokens = buildRepositoryMatchTokens({ brandKey, targetUrl });
  if (!tokens.length) {
    return null;
  }

  const ranked = (Array.isArray(repositories) ? repositories : [])
    .map((repo) => {
      const safeRepo = isPlainObject(repo) ? repo : {};
      const name = sanitizeString(safeRepo.name, 200).toLowerCase();
      const fullName = sanitizeString(safeRepo.full_name, 320).toLowerCase();
      let score = 0;

      for (const token of tokens) {
        if (name === token) {
          score += 10;
        } else if (name.startsWith(`${token}-`) || name.endsWith(`-${token}`) || name.includes(`-${token}-`)) {
          score += 7;
        } else if (name.includes(token)) {
          score += 5;
        }

        if (fullName.includes(`/${token}`)) {
          score += 4;
        } else if (fullName.includes(token)) {
          score += 2;
        }
      }

      return {
        repo: safeRepo,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return sanitizeString(left.repo.full_name, 320).localeCompare(sanitizeString(right.repo.full_name, 320));
    });

  if (!ranked.length) {
    return null;
  }
  if (ranked.length === 1) {
    return ranked[0].repo;
  }
  if (ranked[0].score >= ranked[1].score + 3 || ranked[0].score >= 10) {
    return ranked[0].repo;
  }
  return null;
}

function getFileExtension(filePath) {
  const match = String(filePath || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function isLikelyTextFile(entryPath) {
  const lower = String(entryPath || "").toLowerCase();
  if (!lower || lower.includes("node_modules/") || lower.includes("/dist/") || lower.includes("/coverage/")) {
    return false;
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg") || lower.endsWith(".webp")) {
    return false;
  }
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(lower));
}

function isHomepageLikeFile(entryPath) {
  const lower = String(entryPath || "").toLowerCase();
  return (
    lower.endsWith("/page.tsx") ||
    lower.endsWith("/page.jsx") ||
    lower.endsWith("/index.tsx") ||
    lower.endsWith("/index.jsx") ||
    lower.endsWith("/index.js") ||
    lower.endsWith("/home.tsx") ||
    lower.endsWith("/landing.tsx") ||
    lower.includes("/components/home") ||
    lower.includes("/components/landing") ||
    lower.includes("hero")
  );
}

function scoreTreeEntry(entry, context) {
  const filePath = sanitizeString(entry?.path, 512);
  if (!filePath || !isLikelyTextFile(filePath)) {
    return -Infinity;
  }

  const lower = filePath.toLowerCase();
  let score = 0;
  const tokenHits = [];

  for (const token of context.tokens) {
    if (lower.includes(token)) {
      score += lower.includes(`/${token}`) || lower.includes(`${token}.`) ? 4 : 2;
      tokenHits.push(token);
    }
  }

  if (context.targetPath === "/" || context.targetPath === "") {
    if (isHomepageLikeFile(lower)) {
      score += 7;
    }
    if (lower.includes("/app/") || lower.includes("/pages/") || lower.includes("/src/app/")) {
      score += 2;
    }
  }

  if (lower.includes("marketing") || lower.includes("landing") || lower.includes("copy")) {
    score += 2;
  }
  if (lower.includes("component")) {
    score += 1;
  }
  if (Number.isFinite(Number(entry?.size)) && Number(entry.size) > 0 && Number(entry.size) <= 50000) {
    score += 1;
  }

  return {
    score,
    tokenHits
  };
}

function selectCandidateFiles(tree, context, maxItems = 6) {
  const candidates = [];
  const fallbackHomepage = [];

  for (const entry of Array.isArray(tree) ? tree : []) {
    if (String(entry?.type || "").toLowerCase() !== "blob") {
      continue;
    }
    const path = sanitizeString(entry?.path, 512);
    if (!path || !isLikelyTextFile(path)) {
      continue;
    }
    const scoreMeta = scoreTreeEntry(entry, context);
    if (Number.isFinite(scoreMeta.score) && scoreMeta.score > 0) {
      candidates.push({
        path,
        sha: sanitizeString(entry?.sha, 256) || "",
        size: Number.isFinite(Number(entry?.size)) ? Number(entry.size) : null,
        score: scoreMeta.score,
        tokenHits: scoreMeta.tokenHits
      });
    } else if (isHomepageLikeFile(path)) {
      fallbackHomepage.push({
        path,
        sha: sanitizeString(entry?.sha, 256) || "",
        size: Number.isFinite(Number(entry?.size)) ? Number(entry.size) : null,
        score: 1,
        tokenHits: []
      });
    }
  }

  const ranked = candidates
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return left.path.localeCompare(right.path);
    })
    .slice(0, maxItems);

  if (ranked.length >= Math.min(2, maxItems)) {
    return ranked;
  }

  const seen = new Set(ranked.map((item) => item.path));
  for (const candidate of fallbackHomepage) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    ranked.push(candidate);
    if (ranked.length >= maxItems) {
      break;
    }
  }

  return ranked;
}

function trimSnippetText(text, maxChars = 2600) {
  const safe = String(text || "").replace(/\r\n/g, "\n");
  if (!safe) {
    return "";
  }
  const lines = safe.split("\n").slice(0, 120);
  const joined = lines.join("\n").trim();
  if (joined.length <= maxChars) {
    return joined;
  }
  return `${joined.slice(0, maxChars).trim()}\n...`;
}

async function fetchCandidateSnippets(connection, entries, options = {}) {
  const results = [];
  for (const entry of entries.slice(0, 4)) {
    if (!entry.sha) {
      continue;
    }
    const blobResult = await getGitHubInstallationRepositoryBlob(
      connection.installation_id,
      connection.selected_repo_full_name,
      entry.sha,
      {
        ref: connection.default_branch || undefined,
        fetchImpl: options.fetchImpl
      }
    );
    if (!blobResult.ok || !blobResult.blob?.text) {
      continue;
    }
    const snippet = trimSnippetText(blobResult.blob.text);
    if (!snippet) {
      continue;
    }
    results.push({
      path: entry.path,
      snippet
    });
  }
  return results;
}

function buildFallbackDeveloperPrompt(point, suspectedFiles, repoUnderstanding) {
  return [
    `Customer issue: ${point.title}`,
    `Severity: ${point.severity}`,
    `What the customer questioned: ${point.description}`,
    "",
    `Repo understanding: ${repoUnderstanding}`,
    `Likely files to inspect: ${suspectedFiles.length ? suspectedFiles.join(", ") : "No strong file match yet."}`,
    "",
    "Task:",
    "- Inspect the likely landing-page or copy-owning files.",
    "- Update the UI so this concern is answered directly in visible copy or supporting proof.",
    "- Keep the fix specific to the issue above.",
    "- Re-run the flow after the change."
  ].join("\n");
}

function buildFallbackDiagnosis({ point, repoFullName, routes, candidateFiles }) {
  const suspectedFiles = candidateFiles.map((item) => item.path).slice(0, 4);
  const routeSummary = routes.length ? routes.slice(0, 5).map((item) => item.path).join(", ") : "No route hints found.";
  const likelyFixLocation = suspectedFiles.length
    ? `Start in ${suspectedFiles[0]} and adjacent homepage or marketing copy components.`
    : "Start in the main landing page or marketing copy components for the affected flow.";
  const repoUnderstanding = `Connected repo ${repoFullName || "repository"} appears to serve the public marketing and onboarding flow. Route hints: ${routeSummary}`;
  return {
    source: "fallback",
    repo_full_name: repoFullName || null,
    repo_understanding: repoUnderstanding,
    likely_fix_location: likelyFixLocation,
    suspected_files: suspectedFiles,
    suggested_fixes: [
      `Answer this customer concern directly in the visible UI: ${point.description}`,
      "Add concrete next-step explanation, examples, or proof near the point of hesitation.",
      "Keep the clarification close to the main CTA instead of hiding it below the fold."
    ],
    implementation_notes: [
      "Inspect the landing page and copy-owning components first.",
      "Prefer tightening copy, examples, and proof over adding more generic marketing language."
    ],
    developer_prompt: buildFallbackDeveloperPrompt(point, suspectedFiles, repoUnderstanding),
    confidence_note: suspectedFiles.length
      ? "Repo path match is heuristic. Confirm the owning component before editing."
      : "No strong file match was found from the repo tree alone."
  };
}

async function callOpenAiDiagnosis({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  point,
  repoFullName,
  routes,
  snippets,
  reportSummary,
  targetUrl,
  fetchImpl = globalThis.fetch
}) {
  if (!apiKey || typeof fetchImpl !== "function") {
    return null;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_FIX_DIAGNOSIS_TIMEOUT_MS;
  const timeoutId = controller ? setTimeout(() => controller.abort(), effectiveTimeoutMs) : null;

  const userBlocks = [
    `Repo: ${repoFullName || "-"}`,
    `Target URL: ${sanitizeString(targetUrl, 4096) || "-"}`,
    `Report summary: ${sanitizeString(reportSummary, 2000) || "-"}`,
    `Customer issue title: ${point.title}`,
    `Customer issue description: ${point.description}`,
    `Existing suggested fix: ${sanitizeString(point.recommended_fix, 2000) || "-"}`,
    `Likely routes from repo: ${routes.length ? routes.slice(0, 8).map((route) => route.path).join(", ") : "-"}`,
    ...snippets.map((snippet, index) => `Candidate file ${index + 1}: ${snippet.path}\n${snippet.snippet}`)
  ];

  try {
    const response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a senior product engineer. Use the connected repository context to diagnose where a UX issue likely lives and propose a concrete implementation fix. " +
                  "Ground your answer in the provided repo snippets only. Do not invent files or behaviors not supported by the snippets. Return one JSON object."
              }
            ]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userBlocks.join("\n\n") }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "qa_fix_diagnosis",
            schema: buildDiagnosisSchema()
          }
        },
        max_output_tokens: 1200,
        store: false
      }),
      ...(controller ? { signal: controller.signal } : {})
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI fix diagnosis failed (${response.status}): ${sanitizeString(raw, 500)}`);
    }

    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const structured =
      extractStructuredResponsesPayload(payload) ||
      parseStructuredOutput(extractResponsesText(payload));
    return isPlainObject(structured) ? structured : null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sanitizeDiagnosisPayload(payload, repoFullName) {
  const safe = isPlainObject(payload) ? payload : {};
  return {
    source: "github_repo_analysis",
    repo_full_name: repoFullName || null,
    repo_understanding: sanitizeString(safe.repo_understanding, 1200),
    likely_fix_location: sanitizeString(safe.likely_fix_location, 600),
    suspected_files: Array.isArray(safe.suspected_files)
      ? safe.suspected_files.map((item) => sanitizeString(item, 320)).filter(Boolean).slice(0, 6)
      : [],
    suggested_fixes: Array.isArray(safe.suggested_fixes)
      ? safe.suggested_fixes.map((item) => sanitizeString(item, 400)).filter(Boolean).slice(0, 5)
      : [],
    implementation_notes: Array.isArray(safe.implementation_notes)
      ? safe.implementation_notes.map((item) => sanitizeString(item, 400)).filter(Boolean).slice(0, 5)
      : [],
    developer_prompt: sanitizeString(safe.developer_prompt, 6000),
    confidence_note: sanitizeString(safe.confidence_note, 400)
  };
}

async function generateRepoAwareFixDiagnosis({
  connection,
  point,
  runRequest,
  report,
  fetchImpl,
  openAiApiKey,
  openAiBaseUrl = "https://api.openai.com/v1",
  model = DEFAULT_FIX_DIAGNOSIS_MODEL,
  timeoutMs = DEFAULT_FIX_DIAGNOSIS_TIMEOUT_MS
}) {
  const safePoint = {
    title: sanitizeString(point?.title, 240) || "Customer issue",
    severity: sanitizeString(point?.severity, 64) || "medium",
    description: sanitizeString(point?.description, 1200) || "",
    recommended_fix: sanitizeOptionalString(point?.recommended_fix, 4000) || null
  };

  const treeResult = await getGitHubInstallationRepositoryTree(
    connection.installation_id,
    connection.selected_repo_full_name,
    {
      ref: connection.default_branch || undefined,
      fetchImpl
    }
  );
  if (!treeResult.ok) {
    return treeResult;
  }

  const routes = inferRoutesFromGitHubTree(treeResult.tree);
  const targetUrl = sanitizeString(runRequest?.target_url || report?.target || "", 4096);
  const targetPath = (() => {
    try {
      return new URL(targetUrl).pathname || "/";
    } catch {
      return "/";
    }
  })();
  const tokens = Array.from(
    new Set([
      ...tokenizeText(safePoint.title, 8),
      ...tokenizeText(safePoint.description, 10),
      ...tokenizeText(safePoint.recommended_fix || "", 8),
      ...tokenizeText(sanitizeString(report?.summary?.note, 800), 6),
      ...buildTargetPathTokens(targetUrl)
    ])
  );
  const candidateFiles = selectCandidateFiles(treeResult.tree, { tokens, targetPath }, 6);
  const snippets = await fetchCandidateSnippets(connection, candidateFiles, { fetchImpl });

  const modelDiagnosis = await callOpenAiDiagnosis({
    apiKey: sanitizeString(openAiApiKey, 512),
    baseUrl: sanitizeString(openAiBaseUrl, 4096).replace(/\/$/, "") || "https://api.openai.com/v1",
    model: sanitizeString(model, 128) || DEFAULT_FIX_DIAGNOSIS_MODEL,
    timeoutMs,
    point: safePoint,
    repoFullName: connection.selected_repo_full_name,
    routes,
    snippets,
    reportSummary: sanitizeString(report?.summary?.note, 2000),
    targetUrl,
    fetchImpl
  }).catch(() => null);

  if (modelDiagnosis) {
    const sanitized = sanitizeDiagnosisPayload(modelDiagnosis, connection.selected_repo_full_name);
    if (sanitized.repo_understanding && sanitized.developer_prompt) {
      return {
        ok: true,
        diagnosis: sanitized,
        candidate_files: candidateFiles,
        snippets
      };
    }
  }

  return {
    ok: true,
    diagnosis: buildFallbackDiagnosis({
      point: safePoint,
      repoFullName: connection.selected_repo_full_name,
      routes,
      candidateFiles
    }),
    candidate_files: candidateFiles,
    snippets
  };
}

module.exports = {
  DEFAULT_FIX_DIAGNOSIS_MODEL,
  generateRepoAwareFixDiagnosis,
  __private: {
    tokenizeText,
    buildRepositoryMatchTokens,
    inferBestRepositoryForBrand,
    scoreTreeEntry,
    selectCandidateFiles,
    buildFallbackDiagnosis,
    sanitizeDiagnosisPayload
  }
};
