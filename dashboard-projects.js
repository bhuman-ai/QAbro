(function initSwarmDashboardProjects(globalScope) {
  function fallbackNormalizeBrandKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function fallbackToDisplayProjectName(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }

  function fallbackEscapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeProjectMetadata(value, depth = 0) {
    if (!value || typeof value !== "object") {
      return {};
    }

    if (depth >= 2) {
      return {};
    }

    const metadata = {};
    let count = 0;
    for (const [key, rawValue] of Object.entries(value)) {
      if (count >= 20) {
        break;
      }
      const safeKey = String(key || "").trim().slice(0, 128);
      if (!safeKey) {
        continue;
      }
      if (rawValue === null || ["string", "number", "boolean"].includes(typeof rawValue)) {
        metadata[safeKey] = typeof rawValue === "string" ? String(rawValue).trim().slice(0, 512) : rawValue;
        count += 1;
        continue;
      }
      if (Array.isArray(rawValue)) {
        metadata[safeKey] = rawValue
          .slice(0, 12)
          .map((item) => (typeof item === "string" ? String(item).trim().slice(0, 320) : item))
          .filter((item) => item !== undefined);
        count += 1;
        continue;
      }
      if (typeof rawValue === "object") {
        metadata[safeKey] = normalizeProjectMetadata(rawValue, depth + 1);
        count += 1;
      }
    }

    return metadata;
  }

  function normalizeSavedProject(project, helpers = {}) {
    const normalizeBrandKey =
      typeof helpers.normalizeBrandKey === "function" ? helpers.normalizeBrandKey : fallbackNormalizeBrandKey;
    const key = normalizeBrandKey(project?.brand_key || project?.brandKey);
    if (!key) {
      return null;
    }

    return {
      key,
      name: String(project?.brand_name || project?.brandName || "").trim(),
      targetUrl: String(project?.target_url || project?.targetUrl || "").trim(),
      lastUsedAt: String(project?.last_used_at || project?.lastUsedAt || "").trim(),
      createdAt: String(project?.created_at || project?.createdAt || "").trim(),
      runCount: Math.max(0, Number(project?.run_count || project?.runCount) || 0),
      latestRunAt: String(project?.latest_run_at || project?.latestRunAt || "").trim(),
      metadata: normalizeProjectMetadata(project?.metadata)
    };
  }

  function buildProjectOptions(savedProjects, helpers = {}) {
    const normalizeProject =
      typeof helpers.normalizeProject === "function"
        ? helpers.normalizeProject
        : (project) => normalizeSavedProject(project, helpers);
    const options = [];
    const seen = new Set();

    for (const project of Array.isArray(savedProjects) ? savedProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized || seen.has(normalized.key)) {
        continue;
      }
      options.push({
        key: normalized.key,
        count: normalized.runCount,
        name: normalized.name || "",
        targetUrl: normalized.targetUrl || "",
        lastUsedAt: normalized.lastUsedAt,
        createdAt: normalized.createdAt,
        latestRunAt: normalized.latestRunAt
      });
      seen.add(normalized.key);
    }

    return options;
  }

  function getProjectOptionBaseLabel(optionOrKey, helpers = {}) {
    const findProjectOption = typeof helpers.findProjectOption === "function" ? helpers.findProjectOption : null;
    const toDisplayProjectName =
      typeof helpers.toDisplayProjectName === "function" ? helpers.toDisplayProjectName : fallbackToDisplayProjectName;
    const option =
      optionOrKey && typeof optionOrKey === "object" ? optionOrKey : findProjectOption ? findProjectOption(optionOrKey) : null;
    if (!option) {
      return toDisplayProjectName(optionOrKey) || String(optionOrKey || "").trim();
    }

    const explicitName = String(option.name || "").trim();
    if (explicitName) {
      return explicitName;
    }
    const targetLabel = toDisplayProjectName(option.targetUrl);
    if (targetLabel) {
      return targetLabel;
    }
    return option.key;
  }

  function getProjectOptionLabel(optionOrKey, helpers = {}) {
    const brandOptions = Array.isArray(helpers.brandOptions) ? helpers.brandOptions : [];
    const findProjectOption = typeof helpers.findProjectOption === "function" ? helpers.findProjectOption : null;
    const toDisplayProjectName =
      typeof helpers.toDisplayProjectName === "function" ? helpers.toDisplayProjectName : fallbackToDisplayProjectName;
    const option =
      optionOrKey && typeof optionOrKey === "object" ? optionOrKey : findProjectOption ? findProjectOption(optionOrKey) : null;

    if (option) {
      const baseLabel = getProjectOptionBaseLabel(option, helpers);
      const duplicateCount = brandOptions.filter((candidate) => {
        return getProjectOptionBaseLabel(candidate, helpers).toLowerCase() === baseLabel.toLowerCase();
      }).length;
      if (duplicateCount <= 1) {
        return baseLabel;
      }

      const hostLabel = toDisplayProjectName(option.targetUrl);
      if (hostLabel && hostLabel.toLowerCase() !== baseLabel.toLowerCase()) {
        return `${baseLabel} · ${hostLabel}`;
      }

      const keyLabel = toDisplayProjectName(option.key) || option.key;
      if (keyLabel && keyLabel.toLowerCase() !== baseLabel.toLowerCase()) {
        return `${baseLabel} · ${keyLabel}`;
      }

      return `${baseLabel} · ${option.key}`;
    }

    return toDisplayProjectName(optionOrKey) || String(optionOrKey || "").trim();
  }

  function mergeSavedProjects(currentProjects, incomingProjects, helpers = {}) {
    const normalizeProject =
      typeof helpers.normalizeProject === "function"
        ? helpers.normalizeProject
        : (project) => normalizeSavedProject(project, helpers);
    const next = new Map();

    for (const project of Array.isArray(currentProjects) ? currentProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized) {
        continue;
      }
      next.set(normalized.key, {
        brand_key: normalized.key,
        brand_name: normalized.name || null,
        target_url: normalized.targetUrl || null,
        last_used_at: normalized.lastUsedAt || null,
        created_at: normalized.createdAt || null,
        run_count: normalized.runCount || 0,
        latest_run_at: normalized.latestRunAt || null,
        metadata: normalizeProjectMetadata(normalized.metadata)
      });
    }

    for (const project of Array.isArray(incomingProjects) ? incomingProjects : []) {
      const normalized = normalizeProject(project);
      if (!normalized) {
        continue;
      }
      next.set(normalized.key, {
        brand_key: normalized.key,
        brand_name: normalized.name || null,
        target_url: normalized.targetUrl || null,
        last_used_at: normalized.lastUsedAt || new Date().toISOString(),
        created_at: normalized.createdAt || null,
        run_count: normalized.runCount || 0,
        latest_run_at: normalized.latestRunAt || normalized.lastUsedAt || null,
        metadata: normalizeProjectMetadata(normalized.metadata)
      });
    }

    return Array.from(next.values()).sort((left, right) => {
      const leftTime = Date.parse(left.last_used_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.last_used_at || right.created_at || "") || 0;
      return rightTime - leftTime || String(left.brand_key || "").localeCompare(String(right.brand_key || ""));
    });
  }

  function buildSavedProjectPayload(config = {}, metadata = {}, helpers = {}) {
    const normalizeTargetUrl =
      typeof helpers.normalizeTargetUrl === "function" ? helpers.normalizeTargetUrl : (value) => String(value || "").trim();
    const sanitizeBrandKey =
      typeof helpers.sanitizeBrandKey === "function" ? helpers.sanitizeBrandKey : fallbackNormalizeBrandKey;
    const inferBrandKeyFromTargetUrl =
      typeof helpers.inferBrandKeyFromTargetUrl === "function" ? helpers.inferBrandKeyFromTargetUrl : () => "";
    const inferBrandNameFromTargetUrl =
      typeof helpers.inferBrandNameFromTargetUrl === "function" ? helpers.inferBrandNameFromTargetUrl : fallbackToDisplayProjectName;
    const safeConfig = config && typeof config === "object" ? config : {};
    const targetUrl = normalizeTargetUrl(safeConfig.targetUrl || "");
    const brandKey = sanitizeBrandKey(String(safeConfig.brandKey || inferBrandKeyFromTargetUrl(targetUrl) || ""));
    if (!brandKey) {
      return null;
    }

    const projectMetadata = normalizeProjectMetadata(metadata);
    const source = String(metadata.source || projectMetadata.source || "").trim();
    if (source) {
      projectMetadata.source = source;
    }

    return {
      brand_key: brandKey,
      brand_name: String(safeConfig.brandName || inferBrandNameFromTargetUrl(targetUrl) || "").trim() || null,
      target_url: targetUrl || null,
      metadata: projectMetadata,
      last_used_at: new Date().toISOString()
    };
  }

  function syncProjectFilterInput(config = {}) {
    const selectElement = config.selectElement;
    if (!selectElement) {
      return;
    }

    const normalizeBrandKey =
      typeof config.normalizeBrandKey === "function" ? config.normalizeBrandKey : fallbackNormalizeBrandKey;
    const resolveProjectOptionLabel =
      typeof config.getProjectOptionLabel === "function"
        ? config.getProjectOptionLabel
        : (value) => getProjectOptionLabel(value, config);
    const escapeHtml = typeof config.escapeHtml === "function" ? config.escapeHtml : fallbackEscapeHtml;
    const desiredBrand = normalizeBrandKey(config.selectedBrand);
    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const addNewProjectValue = String(config.addNewProjectValue || "__add_new__").trim();

    if (selectElement.tagName === "SELECT") {
      const hasDesiredBrand = Array.from(selectElement.options || []).some((option) => option.value === desiredBrand);
      if (desiredBrand && !hasDesiredBrand && brandOptions.length > 0) {
        selectElement.innerHTML = [
          `<option value="${escapeHtml(desiredBrand)}">${escapeHtml(resolveProjectOptionLabel(desiredBrand) || desiredBrand)}</option>`,
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ].join("");
      }
      selectElement.value = hasDesiredBrand || brandOptions.length > 0 ? desiredBrand : "";
      return;
    }

    selectElement.value = desiredBrand;
  }

  function renderProjectFilter(config = {}) {
    const selectElement = config.selectElement;
    if (!selectElement || selectElement.tagName !== "SELECT") {
      return;
    }

    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const selectedBrand = String(config.selectedBrand || "").trim();
    const loading = Boolean(config.loading);
    const escapeHtml = typeof config.escapeHtml === "function" ? config.escapeHtml : fallbackEscapeHtml;
    const resolveProjectOptionLabel =
      typeof config.getProjectOptionLabel === "function"
        ? config.getProjectOptionLabel
        : (value) => getProjectOptionLabel(value, config);
    const addNewProjectValue = String(config.addNewProjectValue || "__add_new__").trim();
    const loadingLabel = String(config.loadingLabel || "Loading projects...").trim() || "Loading projects...";
    const emptyLabel = String(config.emptyLabel || "No projects yet").trim() || "No projects yet";

    const options = loading
      ? [`<option value="" disabled selected>${escapeHtml(loadingLabel)}</option>`]
      : brandOptions.length
      ? [
          ...brandOptions.map(
            (brand) =>
              `<option value="${escapeHtml(brand.key)}">${escapeHtml(resolveProjectOptionLabel(brand) || brand.key)}</option>`
          ),
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ]
      : [
          `<option value="" disabled selected>${escapeHtml(emptyLabel)}</option>`,
          `<option value="${addNewProjectValue}">+ Add new project</option>`
        ];
    selectElement.innerHTML = options.join("");
    selectElement.disabled = loading;
    selectElement.setAttribute("aria-busy", loading ? "true" : "false");
    if (loading) {
      selectElement.value = "";
      return;
    }
    const hasSelectedBrand = brandOptions.some((brand) => brand.key === selectedBrand);
    if (brandOptions.length) {
      selectElement.value = hasSelectedBrand ? selectedBrand : brandOptions[0].key;
      return;
    }
    selectElement.value = "";
  }

  function ensureSingleProjectSelection(config = {}) {
    const brandOptions = Array.isArray(config.brandOptions) ? config.brandOptions : [];
    const normalizeBrandKey =
      typeof config.normalizeBrandKey === "function" ? config.normalizeBrandKey : fallbackNormalizeBrandKey;
    const selectedBrand = normalizeBrandKey(config.selectedBrand);

    if (!brandOptions.length) {
      return {
        changed: Boolean(selectedBrand),
        selectedBrand: ""
      };
    }

    const availableProjects = new Set(
      brandOptions.map((brand) => normalizeBrandKey(brand?.key)).filter(Boolean)
    );
    if (availableProjects.has(selectedBrand)) {
      return {
        changed: false,
        selectedBrand
      };
    }

    return {
      changed: true,
      selectedBrand: normalizeBrandKey(brandOptions[0]?.key)
    };
  }

  globalScope.SwarmDashboardProjects = {
    normalizeSavedProject,
    buildProjectOptions,
    getProjectOptionBaseLabel,
    getProjectOptionLabel,
    mergeSavedProjects,
    buildSavedProjectPayload,
    syncProjectFilterInput,
    renderProjectFilter,
    ensureSingleProjectSelection
  };
})(window);
