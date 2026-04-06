const { sanitizeString } = require("./qa-core");

const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|mdx)$/i;

function splitRepoFullName(value) {
  const safe = sanitizeString(value, 320);
  const [owner, ...nameParts] = safe.split("/").map((part) => part.trim()).filter(Boolean);
  if (!owner || !nameParts.length) {
    return { owner: "", repo: "" };
  }
  return {
    owner,
    repo: nameParts.join("/")
  };
}

function normalizeRoutePath(segments) {
  const filtered = [];
  for (const rawSegment of Array.isArray(segments) ? segments : []) {
    const segment = sanitizeString(rawSegment, 160);
    if (!segment || segment === "index" || segment === "_index") {
      continue;
    }
    if (segment.startsWith("@")) {
      continue;
    }
    if (segment.startsWith("(")) {
      continue;
    }
    if (segment.startsWith("_")) {
      continue;
    }
    if (/^\[\[\.\.\.(.+)\]\]$/.test(segment)) {
      filtered.push(`*:${segment.slice(5, -2)}?`);
      continue;
    }
    if (/^\[\.\.\.(.+)\]$/.test(segment)) {
      filtered.push(`*:${segment.slice(4, -1)}`);
      continue;
    }
    if (/^\[(.+)\]$/.test(segment)) {
      filtered.push(`:${segment.slice(1, -1)}`);
      continue;
    }
    if (segment.startsWith("$")) {
      filtered.push(`:${segment.slice(1)}`);
      continue;
    }
    filtered.push(segment);
  }

  if (!filtered.length) {
    return "/";
  }
  return `/${filtered.join("/")}`;
}

function buildNextAppRoute(filePath) {
  const match = filePath.match(/(?:^|\/)app\/(.*\/)?page\.(?:[cm]?[jt]sx?|mdx)$/i);
  if (!match) {
    return null;
  }
  const stem = String(match[1] || "").replace(/\/$/, "");
  const rawSegments = stem ? stem.split("/").filter(Boolean) : [];
  if (rawSegments[0] === "api") {
    return null;
  }
  return {
    path: normalizeRoutePath(rawSegments),
    framework: "next",
    kind: "app_router",
    confidence: 0.96
  };
}

function buildNextPagesRoute(filePath) {
  const match = filePath.match(/(?:^|\/)pages\/(.+)\.(?:[cm]?[jt]sx?|mdx)$/i);
  if (!match) {
    return null;
  }
  const stem = String(match[1] || "");
  if (!stem || stem.startsWith("api/")) {
    return null;
  }
  const rawSegments = stem.split("/").filter(Boolean);
  const leaf = rawSegments[rawSegments.length - 1] || "";
  if (leaf.startsWith("_")) {
    return null;
  }
  return {
    path: normalizeRoutePath(rawSegments),
    framework: "next",
    kind: "pages_router",
    confidence: 0.92
  };
}

function buildRemixLikeRoute(filePath) {
  const match = filePath.match(/(?:^|\/)(?:app|src)\/routes\/(.+)\.(?:[cm]?[jt]sx?|mdx)$/i);
  if (!match) {
    return null;
  }
  const stem = String(match[1] || "");
  if (!stem) {
    return null;
  }
  const rawSegments = stem
    .split("/")
    .filter(Boolean)
    .flatMap((part) => part.split(".").filter(Boolean));
  return {
    path: normalizeRoutePath(rawSegments),
    framework: "remix_like",
    kind: "routes_directory",
    confidence: 0.82
  };
}

function inferRouteCandidatesFromPath(filePath) {
  const safePath = sanitizeString(filePath, 1024).replace(/\\/g, "/");
  if (!safePath || !CODE_FILE_PATTERN.test(safePath)) {
    return [];
  }

  const candidates = [buildNextAppRoute(safePath), buildNextPagesRoute(safePath), buildRemixLikeRoute(safePath)].filter(Boolean);
  return candidates.map((candidate) => ({
    ...candidate,
    file_path: safePath
  }));
}

function inferRoutesFromGitHubTree(entries) {
  const byPath = new Map();
  const safeEntries = Array.isArray(entries) ? entries : [];

  for (const entry of safeEntries) {
    const filePath = sanitizeString(entry?.path, 1024).replace(/\\/g, "/");
    if (!filePath) {
      continue;
    }
    const type = sanitizeString(entry?.type, 32).toLowerCase();
    if (type && type !== "blob") {
      continue;
    }

    for (const candidate of inferRouteCandidatesFromPath(filePath)) {
      const existing = byPath.get(candidate.path);
      if (!existing || candidate.confidence > existing.confidence || candidate.file_path.length < existing.file_path.length) {
        byPath.set(candidate.path, candidate);
      }
    }
  }

  return Array.from(byPath.values())
    .sort((left, right) => {
      if (left.path === right.path) {
        return left.file_path.localeCompare(right.file_path);
      }
      if (left.path === "/") {
        return -1;
      }
      if (right.path === "/") {
        return 1;
      }
      const depthDiff = left.path.split("/").length - right.path.split("/").length;
      if (depthDiff !== 0) {
        return depthDiff;
      }
      return left.path.localeCompare(right.path);
    })
    .slice(0, 60);
}

module.exports = {
  splitRepoFullName,
  inferRouteCandidatesFromPath,
  inferRoutesFromGitHubTree
};
