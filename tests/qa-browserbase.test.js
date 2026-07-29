const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { executeBrowserbaseQaRun, __private } = require("../lib/qa-browserbase");

const {
  extractYellowBoxFromAnnotatedDiff,
  createCoordinateAwareClickTool,
  resolveBrowserbaseSessionCreateParams,
  resolveVisionOnlyConfig,
  resolveCoordinateClickFallbackConfig,
  executeVisionOnlyModeAttempt,
  requestUiTarsClickLocalization,
  requestVisionCoordinateLocalization,
  requestYellowBoxAnnotationWithOpenRouterImage,
  requestYellowBoxAnnotationWithReplicate,
  requestYellowBoxAnnotationWithOpenAi,
  prepareOcrCandidatesForJudge,
  chooseOcrCandidateWithJudge,
  clickWithVisionLocalization,
  attachBrowserTelemetry,
  buildVisionPlannerPrompt
} = __private;

test("local vision screenshots persist as portable evidence files", () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-vision-screenshot-"));
  const screenshotBuffer = Buffer.from("captured-png");
  const artifacts = {
    local_run_dir: runDir,
    local_screenshots: [],
    captured_screenshots: []
  };
  const runLog = [];

  const stored = __private.storeCapturedScreenshotBuffer(
    artifacts,
    runLog,
    { capturedBytes: 0, maxBytes: 1024 },
    "step 1 before decision",
    screenshotBuffer
  );

  assert.equal(stored, true);
  assert.equal(artifacts.local_screenshots.length, 1);
  assert.equal(fs.readFileSync(artifacts.local_screenshots[0]).toString(), "captured-png");
  assert.match(artifacts.local_screenshots[0], /01-step-1-before-decision\.png$/);
  assert.match(artifacts.captured_screenshots[0], /^data:image\/png;base64,/);
  assert.equal(runLog.at(-1)?.event, "inline_screenshot_captured");
});

test("vision planner treats customer acceptance criteria as authoritative", () => {
  const prompt = buildVisionPlannerPrompt({
    runRequest: {
      target_url: "https://example.com/docs",
      scenario_list: ["Open the docs, then use the create-key action."],
      metadata: {
        instruction_priority: "customer_first",
        task_to_try: "Open the docs and use the create-key action.",
        expected_success: "The create-key action reaches the intended sign-in screen.",
        acceptance_criteria: [
          "The public docs remain readable.",
          "The create-key action reaches sign-in without a blank page."
        ],
        auth_policy: "public_only"
      }
    },
    step: 2,
    currentUrl: "https://example.com/sign-in",
    historyText: "- step 1: action=click, target=Get key, outcome=ok",
    forcedEmail: ""
  });

  assert.match(prompt, /acceptance criteria.*authoritative/i);
  assert.match(prompt, /Expected success: The create-key action reaches the intended sign-in screen\./);
  assert.match(prompt, /Access policy: public_only/);
  assert.match(prompt, /Do not report an explicitly expected authentication.*as a blocker/i);
  assert.match(prompt, /return action=done/i);
});

const REQUIRED_ENV = {
  BROWSERBASE_API_KEY: "test-browserbase-api-key",
  BROWSERBASE_PROJECT_ID: "test-browserbase-project-id",
  OPENAI_API_KEY: "test-openai-api-key"
};

const ISOLATED_TEST_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "QA_COORDINATE_ANNOTATION_API_KEY",
  "QA_COORDINATE_ANNOTATION_BASE_URL",
  "QA_COORDINATE_ANNOTATION_FAL_API_KEY",
  "QA_COORDINATE_ANNOTATION_FAL_BASE_URL",
  "QA_COORDINATE_ANNOTATION_GEMINI_API_KEY",
  "QA_COORDINATE_ANNOTATION_MODEL",
  "QA_COORDINATE_ANNOTATION_OPENROUTER_API_KEY",
  "QA_COORDINATE_ANNOTATION_OPENROUTER_BASE_URL",
  "QA_COORDINATE_ANNOTATION_PROVIDER",
  "QA_COORDINATE_ANNOTATION_QWEN_API_KEY",
  "QA_COORDINATE_ANNOTATION_QWEN_BASE_URL",
  "QA_COORDINATE_ANNOTATION_QWEN_MODEL",
  "QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY",
  "QA_COORDINATE_ANNOTATION_REPLICATE_BASE_URL",
  "QA_COORDINATE_LOCALIZATION_ORDER",
  "QA_COORDINATE_LLM_API_KEY",
  "QA_COORDINATE_LLM_BASE_URL",
  "QA_COORDINATE_LLM_MAX_TOKENS",
  "QA_COORDINATE_LLM_MODEL",
  "QA_COORDINATE_OCR_JUDGE_API_KEY",
  "QA_COORDINATE_OCR_JUDGE_BASE_URL",
  "QA_COORDINATE_OCR_JUDGE_ENABLED",
  "QA_COORDINATE_OCR_JUDGE_MODEL",
  "QA_COORDINATE_UI_TARS_API_KEY",
  "QA_COORDINATE_UI_TARS_ENABLED",
  "QA_COORDINATE_UI_TARS_BASE_URL",
  "QA_COORDINATE_UI_TARS_MAX_TOKENS",
  "QA_COORDINATE_UI_TARS_MODEL",
  "QA_COORDINATE_UI_TARS_MODEL_VERSION",
  "QA_COORDINATE_VISION_API_KEY",
  "QA_COORDINATE_VISION_BASE_URL",
  "QA_COORDINATE_VISION_MAX_TOKENS",
  "QA_COORDINATE_VISION_MODEL",
  "QA_UI_TARS_API_KEY",
  "QA_UI_TARS_BASE_URL",
  "QA_UI_TARS_MAX_TOKENS",
  "QA_UI_TARS_MODEL",
  "QA_UI_TARS_MODEL_VERSION",
  "QA_VISION_API_KEY",
  "QA_VISION_BASE_URL",
  "QA_VISION_MODEL",
  "UI_TARS_API_KEY",
  "UI_TARS_BASE_URL",
  "UI_TARS_MAX_TOKENS",
  "UI_TARS_MODEL",
  "UI_TARS_MODEL_VERSION"
];

function createRunRequest() {
  return {
    run_id: "run_fallback_test",
    target_url: "https://example.com",
    scope_mode: "core_20m",
    scenario_list: [],
    brand_persona: "General user",
    source: "qa_bot"
  };
}

async function withEnv(overrides, callback) {
  const keys = Array.from(new Set([...ISOLATED_TEST_ENV_KEYS, ...Object.keys(overrides)]));
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    const nextValue = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined;
    if (nextValue === undefined || nextValue === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(nextValue);
    }
  }

  try {
    return await callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function createSolidRgbaImage(width, height, rgba) {
  const [r, g, b, a] = rgba;
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  return { width, height, data };
}

function drawRectangleOutline(image, left, top, right, bottom, rgba) {
  const [r, g, b, a] = rgba;
  const { width, height, data } = image;
  const clampedLeft = Math.max(0, Math.min(width - 1, left));
  const clampedTop = Math.max(0, Math.min(height - 1, top));
  const clampedRight = Math.max(0, Math.min(width - 1, right));
  const clampedBottom = Math.max(0, Math.min(height - 1, bottom));

  for (let x = clampedLeft; x <= clampedRight; x += 1) {
    const topOffset = (clampedTop * width + x) * 4;
    const bottomOffset = (clampedBottom * width + x) * 4;
    data[topOffset] = r;
    data[topOffset + 1] = g;
    data[topOffset + 2] = b;
    data[topOffset + 3] = a;
    data[bottomOffset] = r;
    data[bottomOffset + 1] = g;
    data[bottomOffset + 2] = b;
    data[bottomOffset + 3] = a;
  }

  for (let y = clampedTop; y <= clampedBottom; y += 1) {
    const leftOffset = (y * width + clampedLeft) * 4;
    const rightOffset = (y * width + clampedRight) * 4;
    data[leftOffset] = r;
    data[leftOffset + 1] = g;
    data[leftOffset + 2] = b;
    data[leftOffset + 3] = a;
    data[rightOffset] = r;
    data[rightOffset + 1] = g;
    data[rightOffset + 2] = b;
    data[rightOffset + 3] = a;
  }
}

test("extractYellowBoxFromAnnotatedDiff identifies yellow rectangle center from diff", () => {
  const width = 120;
  const height = 80;
  const yellow = [255, 255, 0, 255];

  const beforeImage = createSolidRgbaImage(width, height, [255, 255, 255, 255]);
  const afterImage = {
    width,
    height,
    data: Buffer.from(beforeImage.data)
  };
  drawRectangleOutline(afterImage, 30, 18, 74, 50, yellow);

  const beforeBuffer = Buffer.from("before");
  const afterBuffer = Buffer.from("after");
  const box = extractYellowBoxFromAnnotatedDiff(beforeBuffer, afterBuffer, {
    decodePng: (buffer) => {
      if (buffer === beforeBuffer) return beforeImage;
      if (buffer === afterBuffer) return afterImage;
      throw new Error("Unexpected image buffer");
    }
  });

  assert.equal(box.left, 30);
  assert.equal(box.top, 18);
  assert.equal(box.right, 74);
  assert.equal(box.bottom, 50);
  assert.equal(box.center_x, 52);
  assert.equal(box.center_y, 34);
});

test("attachBrowserTelemetry ignores unsupported page events", () => {
  const artifacts = {};
  const runLog = [];
  const subscribedEvents = [];
  const page = {
    url: () => "https://example.com/",
    on: (eventName) => {
      if (eventName === "pageerror") {
        throw new Error("Unsupported event: pageerror");
      }
      subscribedEvents.push(eventName);
    }
  };

  assert.doesNotThrow(() =>
    attachBrowserTelemetry(page, artifacts, runLog, {
      attachedPages: new WeakSet(),
      requestStartTimes: new WeakMap()
    })
  );

  assert.deepEqual(subscribedEvents, ["console", "request", "response", "requestfailed"]);
  assert.ok(
    runLog.some(
      (entry) =>
        entry.event === "browser_telemetry_event_unsupported" &&
        entry.details?.event === "pageerror" &&
        /Unsupported event/.test(entry.details?.error || "")
    )
  );
});

test("attachBrowserTelemetry records console and network events", () => {
  const artifacts = {};
  const runLog = [];
  const handlers = {};
  const page = {
    url: () => "https://example.com/app",
    on: (eventName, handler) => {
      handlers[eventName] = handler;
    }
  };

  attachBrowserTelemetry(page, artifacts, runLog, {
    attachedPages: new WeakSet(),
    requestStartTimes: new WeakMap()
  });

  handlers.console({
    type: () => "error",
    text: () => "Client exploded",
    location: () => ({ url: "https://example.com/app?token=secret" })
  });

  const request = {
    method: () => "POST",
    url: () => "https://api.example.com/verify?token=secret",
    resourceType: () => "fetch",
    failure: () => ({ errorText: "net::ERR_FAILED" })
  };
  handlers.request(request);
  handlers.response({
    request: () => request,
    url: () => request.url(),
    status: () => 500,
    ok: () => false
  });
  handlers.requestfailed(request);

  assert.equal(artifacts.console_timeline.length, 1);
  assert.equal(artifacts.network_timeline.length, 3);
  assert.equal(artifacts.network_timeline[1].status, 500);
  assert.equal(artifacts.network_timeline[2].error, "net::ERR_FAILED");
  assert.match(artifacts.network_timeline[0].url, /token=%5Bredacted%5D/);
  assert.ok(runLog.some((entry) => entry.event === "browser_console"));
  assert.ok(runLog.some((entry) => entry.event === "browser_network"));
});

test("createCoordinateAwareClickTool falls back to yellow-box coordinates after failed click", async () => {
  const runLog = [];
  const artifacts = {
    coordinate_click_fallback: {
      enabled: true,
      model: "mock-annotator",
      strategy: "yellow_box_diff",
      invoked: 0,
      resolved: 0,
      failed: 0
    }
  };
  const sourceImage = createSolidRgbaImage(100, 60, [255, 255, 255, 255]);
  const annotatedImage = {
    width: sourceImage.width,
    height: sourceImage.height,
    data: Buffer.from(sourceImage.data)
  };
  drawRectangleOutline(annotatedImage, 40, 16, 68, 34, [255, 255, 0, 255]);

  const sourceBuffer = Buffer.from("source");
  const annotatedBuffer = Buffer.from("annotated");
  const clickCalls = [];
  const page = {
    click: async (x, y) => {
      clickCalls.push([x, y]);
      if (clickCalls.length === 1) {
        throw new Error("element obscured");
      }
    },
    screenshot: async (options) => {
      if (options && options.scale === "css") {
        return sourceBuffer;
      }
      return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    },
    waitForTimeout: async () => {}
  };
  const stagehand = {
    context: {
      awaitActivePage: async () => page
    }
  };
  const resolvedModule = {
    tool: (definition) => definition
  };

  const tool = createCoordinateAwareClickTool({
    stagehand,
    runLog,
    artifacts,
    resolvedModule,
    coordinateFallbackConfig: {
      enabled: true,
      model: "mock-annotator",
      strategy: "yellow_box_diff",
      localizationOrder: ["yellow_box_diff"],
      annotateImage: async () => annotatedBuffer,
      decodePng: (buffer) => {
        if (buffer === sourceBuffer) return sourceImage;
        if (buffer === annotatedBuffer) return annotatedImage;
        throw new Error("Unexpected image buffer");
      }
    },
    modelProvider: "openai"
  });

  assert.ok(tool);
  const result = await tool.execute({
    describe: "New Workflow button",
    coordinates: [12, 14]
  });

  assert.equal(result.success, true);
  assert.equal(result.fallback_used, true);
  assert.deepEqual(result.coordinates, [54, 25]);
  assert.deepEqual(clickCalls, [
    [12, 14],
    [54, 25]
  ]);
  assert.equal(artifacts.coordinate_click_fallback.invoked, 1);
  assert.equal(artifacts.coordinate_click_fallback.resolved, 1);
  assert.equal(artifacts.coordinate_click_fallback.failed, 0);
  assert.ok(
    runLog.some((entry) => entry.event === "agent_click_coordinate_fallback_succeeded")
  );
});

test("requestYellowBoxAnnotationWithOpenAi omits deprecated output_format field", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      body: options.body
    });
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            b64_json: Buffer.from("annotated").toString("base64")
          }
        ]
      })
    };
  };

  try {
    const result = await requestYellowBoxAnnotationWithOpenAi({
      imageBuffer: Buffer.from("source"),
      targetDescription: "Start Free button",
      apiKey: "test-openai-api-key",
      model: "dall-e-2",
      baseUrl: "https://api.openai.com/v1",
      timeoutMs: 2000
    });

    assert.equal(Buffer.isBuffer(result), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.has("output_format"), false);
    assert.equal(calls[0].body.get("response_format"), "b64_json");
  } finally {
    global.fetch = originalFetch;
  }
});

test("resolveCoordinateClickFallbackConfig supports fal provider", async () => {
  await withEnv(
    {
      QA_COORDINATE_ANNOTATION_FAL_API_KEY: "test-fal-key",
      QA_COORDINATE_ANNOTATION_PROVIDER: "fal",
      QA_COORDINATE_ANNOTATION_MODEL: undefined,
      QA_COORDINATE_ANNOTATION_BASE_URL: undefined,
      QA_COORDINATE_ANNOTATION_FAL_BASE_URL: undefined,
      QA_COORDINATE_LOCALIZATION_ORDER: "yellow_box_diff"
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, true);
      assert.equal(config.provider, "fal");
      assert.equal(config.model, "fal-ai/nano-banana-2/edit");
      assert.equal(config.baseUrl, "https://fal.run");
      assert.equal(typeof config.annotateImage, "function");
    }
  );
});

test("resolveCoordinateClickFallbackConfig supports replicate provider", async () => {
  await withEnv(
    {
      QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY: "test-replicate-key",
      QA_COORDINATE_ANNOTATION_PROVIDER: "replicate",
      QA_COORDINATE_ANNOTATION_MODEL: undefined,
      QA_COORDINATE_ANNOTATION_BASE_URL: undefined,
      QA_COORDINATE_ANNOTATION_REPLICATE_BASE_URL: undefined,
      QA_COORDINATE_LOCALIZATION_ORDER: "yellow_box_diff"
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, true);
      assert.equal(config.provider, "replicate");
      assert.equal(config.model, "google/nano-banana-2");
      assert.equal(config.baseUrl, "https://api.replicate.com/v1");
      assert.equal(typeof config.annotateImage, "function");
    }
  );
});

test("resolveCoordinateClickFallbackConfig supports OpenRouter image provider", async () => {
  await withEnv(
    {
      QA_COORDINATE_ANNOTATION_PROVIDER: "openrouter_image",
      QA_COORDINATE_ANNOTATION_OPENROUTER_API_KEY: "test-openrouter-key",
      QA_COORDINATE_ANNOTATION_MODEL: undefined,
      QA_COORDINATE_ANNOTATION_OPENROUTER_BASE_URL: undefined
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true,
        coordinateLocalizationOrder: "yellow_box_diff"
      });

      assert.equal(config.enabled, true);
      assert.equal(config.provider, "openrouter_image");
      assert.equal(config.model, "openai/gpt-image-1-mini");
      assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(typeof config.annotateImage, "function");
      assert.deepEqual(config.localizationOrder, ["yellow_box_diff"]);
    }
  );
});

test("resolveVisionOnlyConfig preserves provider model ids for OpenAI-compatible base URLs", async () => {
  await withEnv(
    {
      QA_VISION_MODEL: "google/gemini-2.5-flash",
      QA_VISION_BASE_URL: "https://openrouter.ai/api/v1",
      QA_VISION_API_KEY: "test-openrouter-key"
    },
    async () => {
      const config = resolveVisionOnlyConfig(createRunRequest(), {});

      assert.equal(config.model, "google/gemini-2.5-flash");
      assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(config.apiKey, "test-openrouter-key");
    }
  );
});

test("resolveVisionOnlyConfig strips openai provider for official OpenAI base URL", async () => {
  await withEnv(
    {
      QA_VISION_MODEL: "openai/gpt-4.1-mini",
      QA_VISION_BASE_URL: "https://api.openai.com/v1",
      QA_VISION_API_KEY: "test-openai-key"
    },
    async () => {
      const config = resolveVisionOnlyConfig(createRunRequest(), {});

      assert.equal(config.model, "gpt-4.1-mini");
      assert.equal(config.baseUrl, "https://api.openai.com/v1");
    }
  );
});

test("resolveCoordinateClickFallbackConfig supports explicitly configured UI-TARS localization", async () => {
  await withEnv(
    {
      QA_COORDINATE_UI_TARS_ENABLED: "1",
      QA_COORDINATE_UI_TARS_API_KEY: "test-ui-tars-key",
      QA_COORDINATE_UI_TARS_BASE_URL: "https://ui-tars.example.com/v1/",
      QA_COORDINATE_UI_TARS_MODEL: "bytedance/ui-tars-1.5-7b",
      QA_COORDINATE_ANNOTATION_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_QWEN_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY: undefined,
      QA_COORDINATE_LOCALIZATION_ORDER: "ui_tars"
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, true);
      assert.equal(config.strategy, "ui_tars");
      assert.deepEqual(config.localizationOrder, ["ui_tars"]);
      assert.equal(config.uiTars?.model, "bytedance/ui-tars-1.5-7b");
      assert.equal(config.uiTars?.baseUrl, "https://ui-tars.example.com/v1");
      assert.equal(config.uiTars?.model_version, "1.5");
      assert.equal(typeof config.localizeBox, "function");
    }
  );
});

test("resolveCoordinateClickFallbackConfig does not use UI-TARS by default", async () => {
  await withEnv(
    {
      QA_COORDINATE_UI_TARS_API_KEY: "test-ui-tars-key",
      QA_COORDINATE_UI_TARS_BASE_URL: "https://ui-tars.example.com/v1/",
      QA_COORDINATE_UI_TARS_MODEL: "bytedance/ui-tars-1.5-7b",
      QA_COORDINATE_ANNOTATION_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_QWEN_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_OPENROUTER_API_KEY: undefined,
      QA_COORDINATE_VISION_API_KEY: undefined,
      QA_COORDINATE_LOCALIZATION_ORDER: undefined
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, false);
      assert.equal(config.reason, "missing_localization_clients");
      assert.deepEqual(config.localizationOrder, []);
      assert.equal(config.uiTars, null);
    }
  );
});

test("resolveCoordinateClickFallbackConfig supports direct vision LLM localization", async () => {
  await withEnv(
    {
      QA_COORDINATE_VISION_API_KEY: "test-openrouter-key",
      QA_COORDINATE_VISION_BASE_URL: "https://openrouter.ai/api/v1/",
      QA_COORDINATE_VISION_MODEL: "qwen/qwen2.5-vl-72b-instruct",
      QA_COORDINATE_UI_TARS_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_QWEN_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY: undefined,
      QA_COORDINATE_ANNOTATION_OPENROUTER_API_KEY: undefined,
      QA_COORDINATE_LOCALIZATION_ORDER: undefined
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, true);
      assert.equal(config.strategy, "vision_llm");
      assert.deepEqual(config.localizationOrder, ["vision_llm"]);
      assert.equal(config.visionLlm?.model, "qwen/qwen2.5-vl-72b-instruct");
      assert.equal(config.visionLlm?.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(typeof config.localizeBox, "function");
    }
  );
});

test("resolveCoordinateClickFallbackConfig keeps expensive yellow-box diff out of the default order", async () => {
  await withEnv(
    {
      QA_COORDINATE_ANNOTATION_PROVIDER: "replicate",
      QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY: "test-replicate-key",
      QA_COORDINATE_ANNOTATION_QWEN_API_KEY: "test-qwen-key",
      QA_COORDINATE_LOCALIZATION_ORDER: undefined
    },
    async () => {
      const config = resolveCoordinateClickFallbackConfig({
        coordinateClickFallbackEnabled: true
      });

      assert.equal(config.enabled, true);
      assert.equal(config.provider, "replicate");
      assert.equal(config.model, "google/nano-banana-2");
      assert.equal(config.strategy, "ocr_qwen");
      assert.deepEqual(config.localizationOrder, ["ocr_qwen"]);
      assert.equal(typeof config.localizeBox, "function");
      assert.equal(config.qwen?.model, "qwen-vl-ocr");
    }
  );
});

test("requestUiTarsClickLocalization posts screenshot and parses click box", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      headers: options.headers,
      body: options.body
    });
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Thought: Click the requested button.\nAction: click(start_box='[100,200,300,400]')"
            }
          }
        ]
      })
    };
  };

  try {
    const result = await requestUiTarsClickLocalization({
      imageBuffer: Buffer.from("not-a-png"),
      targetDescription: "Continue button",
      apiKey: "test-ui-tars-key",
      model: "bytedance/ui-tars-1.5-7b",
      baseUrl: "https://ui-tars.example.com/v1/",
      modelVersion: "1.0",
      timeoutMs: 2000
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ui-tars.example.com/v1/chat/completions");
    assert.equal(calls[0].headers.Authorization, "Bearer test-ui-tars-key");
    const body = JSON.parse(calls[0].body);
    assert.equal(body.model, "bytedance/ui-tars-1.5-7b");
    assert.equal(body.temperature, 0);
    assert.equal(body.messages[1].content[1].image_url.url.startsWith("data:image/png;base64,"), true);
    assert.equal(result.box.center_x, 256);
    assert.equal(result.box.center_y, 216);
    assert.match(result.prediction, /click\(start_box=/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("requestVisionCoordinateLocalization posts screenshot and parses JSON point", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      headers: options.headers,
      body: options.body
    });
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                left: 100,
                top: 200,
                right: 300,
                bottom: 260,
                x: 200,
                y: 230
              })
            }
          }
        ],
        usage: {
          cost: 0.00123
        }
      })
    };
  };

  try {
    const result = await requestVisionCoordinateLocalization({
      imageBuffer: Buffer.from("not-a-png"),
      targetDescription: "Continue button",
      apiKey: "test-openrouter-key",
      model: "qwen/qwen2.5-vl-72b-instruct",
      baseUrl: "https://openrouter.ai/api/v1/",
      timeoutMs: 2000
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(calls[0].headers.Authorization, "Bearer test-openrouter-key");
    const body = JSON.parse(calls[0].body);
    assert.equal(body.model, "qwen/qwen2.5-vl-72b-instruct");
    assert.equal(body.temperature, 0);
    assert.equal(body.messages[1].content[1].image_url.url.startsWith("data:image/png;base64,"), true);
    assert.equal(result.box.center_x, 200);
    assert.equal(result.box.center_y, 230);
    assert.equal(result.metadata.usage.cost, 0.00123);
  } finally {
    global.fetch = originalFetch;
  }
});

test("requestYellowBoxAnnotationWithOpenRouterImage posts image request", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      headers: options.headers,
      body: options.body
    });
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            b64_json: Buffer.from("annotated").toString("base64")
          }
        ],
        usage: {
          cost: 0.0042
        }
      })
    };
  };

  try {
    const result = await requestYellowBoxAnnotationWithOpenRouterImage({
      imageBuffer: Buffer.from("source"),
      targetDescription: "Start QA button",
      apiKey: "test-openrouter-key",
      model: "openai/gpt-image-1-mini",
      baseUrl: "https://openrouter.ai/api/v1/",
      timeoutMs: 2000
    });

    assert.equal(Buffer.isBuffer(result), true);
    assert.equal(result.toString(), "annotated");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://openrouter.ai/api/v1/images");
    assert.equal(calls[0].headers.Authorization, "Bearer test-openrouter-key");
    const body = JSON.parse(calls[0].body);
    assert.equal(body.model, "openai/gpt-image-1-mini");
    assert.equal(body.quality, "low");
    assert.equal(body.background, "opaque");
    assert.equal(body.input_references[0].image_url.url.startsWith("data:image/png;base64,"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("requestYellowBoxAnnotationWithReplicate posts prediction request with 1K input", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      headers: options.headers,
      body: options.body
    });
    if (String(url).includes("/predictions")) {
      return {
        ok: true,
        json: async () => ({
          status: "succeeded",
          output: "https://replicate.delivery/annotated.png"
        })
      };
    }
    return {
      ok: true,
      arrayBuffer: async () => Buffer.from("annotated").buffer
    };
  };

  try {
    const result = await requestYellowBoxAnnotationWithReplicate({
      imageBuffer: Buffer.from("source"),
      targetDescription: "Continue button",
      apiKey: "test-replicate-key",
      model: "google/nano-banana-2",
      baseUrl: "https://api.replicate.com/v1",
      timeoutMs: 2000
    });

    assert.equal(Buffer.isBuffer(result), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.replicate.com/v1/models/google/nano-banana-2/predictions");
    assert.equal(calls[0].headers.Authorization, "Bearer test-replicate-key");
    assert.equal(calls[0].headers.Prefer, "wait");
    const body = JSON.parse(calls[0].body);
    assert.equal(body.input.resolution, "1K");
    assert.equal(body.input.output_format, "png");
    assert.equal(body.input.image_search, false);
    assert.equal(body.input.google_search, false);
    assert.equal(Array.isArray(body.input.image_input), true);
    assert.equal(body.input.image_input.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("coordinate localizeBox uses qwen OCR first when target text is matched", async () => {
  let yellowFallbackCalled = false;
  const config = resolveCoordinateClickFallbackConfig({
    coordinateClickFallbackEnabled: true,
    coordinateLocalizationOrder: "ocr_qwen,yellow_box_diff",
    coordinateQwenOcrClient: async () => [
      {
        text: "Start Here",
        location: [
          [100, 200],
          [220, 200],
          [220, 250],
          [100, 250]
        ]
      }
    ],
    coordinateAnnotationClient: async () => {
      yellowFallbackCalled = true;
      throw new Error("yellow fallback should not be called");
    }
  });

  const result = await config.localizeBox({
    imageBuffer: Buffer.from("not-a-png"),
    targetDescription: 'Yellow "Start Here" button in hero section'
  });

  assert.equal(result.strategy, "ocr_qwen");
  assert.equal(result.box.center_x, 160);
  assert.equal(result.box.center_y, 225);
  assert.equal(yellowFallbackCalled, false);
});

test("coordinate localizeBox uses UI-TARS before yellow-box diff when configured", async () => {
  let yellowFallbackCalled = false;
  const config = resolveCoordinateClickFallbackConfig({
    coordinateClickFallbackEnabled: true,
    coordinateUiTarsEnabled: true,
    coordinateLocalizationOrder: "ui_tars,yellow_box_diff",
    coordinateUiTarsClient: async () => ({
      box: {
        left: 40,
        top: 20,
        right: 100,
        bottom: 60,
        width: 61,
        height: 41,
        center_x: 70,
        center_y: 40
      },
      prediction: "Thought: Click it.\nAction: click(start_box='[40,20,100,60]')",
      metadata: {
        parsed_actions: 1
      }
    }),
    coordinateAnnotationClient: async () => {
      yellowFallbackCalled = true;
      throw new Error("yellow fallback should not be called");
    }
  });

  const result = await config.localizeBox({
    imageBuffer: Buffer.from("not-a-png"),
    targetDescription: "Continue button"
  });

  assert.equal(result.strategy, "ui_tars");
  assert.equal(result.provider, "ui_tars");
  assert.equal(result.box.center_x, 70);
  assert.equal(result.box.center_y, 40);
  assert.equal(result.metadata.parsed_actions, 1);
  assert.equal(yellowFallbackCalled, false);
});

test("coordinate localizeBox falls through from UI-TARS to vision LLM before yellow-box diff", async () => {
  let yellowFallbackCalled = false;
  const config = resolveCoordinateClickFallbackConfig({
    coordinateClickFallbackEnabled: true,
    coordinateUiTarsEnabled: true,
    coordinateLocalizationOrder: "ui_tars,vision_llm,yellow_box_diff",
    coordinateUiTarsClient: async () => {
      throw new Error("ui-tars missed");
    },
    coordinateVisionClient: async () => ({
      box: {
        left: 360,
        top: 466,
        right: 509,
        bottom: 528,
        width: 150,
        height: 63,
        center_x: 435,
        center_y: 497
      },
      prediction: '{"x":435,"y":497}'
    }),
    coordinateAnnotationClient: async () => {
      yellowFallbackCalled = true;
      throw new Error("yellow fallback should not be called");
    }
  });

  const result = await config.localizeBox({
    imageBuffer: Buffer.from("not-a-png"),
    targetDescription: "Start QA button"
  });

  assert.equal(result.strategy, "vision_llm");
  assert.equal(result.box.center_x, 435);
  assert.deepEqual(result.attempts, [
    {
      strategy: "ui_tars",
      error: "ui-tars missed"
    }
  ]);
  assert.equal(yellowFallbackCalled, false);
});

test("prepareOcrCandidatesForJudge keeps duplicate labels at different positions", () => {
  const candidates = prepareOcrCandidatesForJudge([
    {
      text: "Create",
      normalized_text: "create",
      box: { center_x: 80, center_y: 40, width: 30, height: 12 }
    },
    {
      text: "Create",
      normalized_text: "create",
      box: { center_x: 220, center_y: 160, width: 30, height: 12 }
    }
  ]);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].text, "Create");
  assert.equal(candidates[1].text, "Create");
  assert.notEqual(candidates[0].box.center_y, candidates[1].box.center_y);
});

test("chooseOcrCandidateWithJudge lets the LLM pick between duplicate OCR candidates", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        candidate_index: 1,
        reason: "The lower Create button aligns with the target area."
      })
    })
  });

  try {
    const result = await chooseOcrCandidateWithJudge({
      apiKey: "test-openai-api-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      targetDescription: "Create button under Personalized Videos",
      candidates: [
        {
          text: "Create",
          normalized_text: "create",
          box: { center_x: 70, center_y: 40, width: 28, height: 12 }
        },
        {
          text: "Create",
          normalized_text: "create",
          box: { center_x: 220, center_y: 170, width: 28, height: 12 }
        }
      ],
      timeoutMs: 2000
    });

    assert.equal(result.candidate.box.center_x, 220);
    assert.match(result.reason, /lower Create button/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("clickWithVisionLocalization retries with yellow-box annotation after OCR click error", async () => {
  const runLog = [];
  const artifacts = {};
  const sourceImage = createSolidRgbaImage(120, 80, [255, 255, 255, 255]);
  const annotatedImage = {
    width: sourceImage.width,
    height: sourceImage.height,
    data: Buffer.from(sourceImage.data)
  };
  drawRectangleOutline(annotatedImage, 60, 24, 98, 44, [255, 255, 0, 255]);

  const sourceBuffer = Buffer.from("source");
  const annotatedBuffer = Buffer.from("annotated");
  const clickCalls = [];
  const page = {
    screenshot: async () => sourceBuffer,
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        clickCalls.push([x, y]);
        if (clickCalls.length === 1) {
          throw new Error("ocr click missed target");
        }
      }
    }
  };

  const result = await clickWithVisionLocalization({
    page,
    targetDescription: "Create button under Personalized Videos",
    coordinateFallbackConfig: {
      enabled: true,
      provider: "openai",
      model: "dall-e-2",
      localizationOrder: ["ocr_qwen", "yellow_box_diff"],
      qwen: {
        model: "qwen-vl-ocr",
        ocrImage: async () => [
          {
            text: "Create",
            location: [
              [20, 20],
              [40, 20],
              [40, 35],
              [20, 35]
            ]
          }
        ]
      },
      annotateImage: async () => annotatedBuffer,
      decodePng: (buffer) => {
        if (buffer === sourceBuffer) return sourceImage;
        if (buffer === annotatedBuffer) return annotatedImage;
        throw new Error("Unexpected image buffer");
      }
    },
    artifacts,
    runLog,
    actionDelayMs: 0
  });

  assert.deepEqual(clickCalls, [
    [30, 28],
    [79, 34]
  ]);
  assert.equal(result.x, 79);
  assert.equal(result.y, 34);
  assert.ok(runLog.some((entry) => entry.event === "agent_click_coordinate_fallback_retrying"));
  const successEvent = runLog.find((entry) => entry.event === "agent_click_coordinate_fallback_succeeded");
  assert.equal(successEvent.details.strategy, "yellow_box_diff");
});

test("clickWithVisionLocalization retries next strategy when UI-TARS points at whitespace", async () => {
  const clicks = [];
  const page = {
    screenshot: async () => Buffer.from("not-a-real-png"),
    evaluate: async () => ({
      valid: false,
      reason: "non_interactive_element_at_point",
      tag: "main",
      text: ""
    }),
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        clicks.push({ x, y });
      }
    }
  };
  const runLog = [];
  const config = {
    enabled: true,
    provider: "ui_tars",
    model: "bytedance/ui-tars-1.5-7b",
    strategy: "ui_tars->ocr_qwen",
    localizationOrder: ["ui_tars", "ocr_qwen"],
    uiTars: {
      model: "bytedance/ui-tars-1.5-7b",
      model_version: "1.5",
      localize: async () => ({
        box: {
          left: 10,
          top: 20,
          right: 10,
          bottom: 20,
          width: 1,
          height: 1,
          center_x: 10,
          center_y: 20,
          pixel_count: 1
        },
        prediction: "Action: click(start_box='(10,20)')"
      })
    },
    qwen: {
      model: "qwen-vl-ocr",
      ocrImage: async () => [
        { text: "Start", location: [400, 450, 430, 470] },
        { text: "QA", location: [435, 450, 470, 470] }
      ]
    }
  };

  const result = await clickWithVisionLocalization({
    page,
    targetDescription: "Start QA button",
    coordinateFallbackConfig: config,
    artifacts: {},
    runLog,
    actionDelayMs: 0
  });

  assert.deepEqual(clicks, [{ x: 435, y: 460 }]);
  assert.equal(result.x, 435);
  assert.equal(result.y, 460);
  assert.ok(
    runLog.some(
      (entry) =>
        entry.event === "agent_click_coordinate_fallback_retrying" &&
        entry.details?.from_strategy === "ui_tars" &&
        entry.details?.retry_strategy === "ocr_qwen"
    )
  );
  const successEvent = runLog.find((entry) => entry.event === "agent_click_coordinate_fallback_succeeded");
  assert.equal(successEvent.details.strategy, "ocr_qwen");
});

test("clickWithVisionLocalization rejects input hits for button targets", async () => {
  const clicks = [];
  const page = {
    screenshot: async () => Buffer.from("not-a-real-png"),
    evaluate: async (_fn, point) => {
      if (point.pointX === 820) {
        return {
          valid: true,
          reason: "interactive_element_at_point",
          tag: "input",
          role: "textbox",
          type: "email",
          text: "test@example.com"
        };
      }
      return {
        valid: true,
        reason: "interactive_element_at_point",
        tag: "button",
        role: "button",
        text: "Continue"
      };
    },
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        clicks.push({ x, y });
      }
    }
  };
  const runLog = [];
  const config = {
    enabled: true,
    provider: "ui_tars",
    model: "bytedance/ui-tars-1.5-7b",
    strategy: "ui_tars->vision_llm",
    localizationOrder: ["ui_tars", "vision_llm"],
    uiTars: {
      model: "bytedance/ui-tars-1.5-7b",
      model_version: "1.5",
      localize: async () => ({
        box: {
          left: 805,
          top: 200,
          right: 835,
          bottom: 230,
          width: 31,
          height: 31,
          center_x: 820,
          center_y: 215,
          pixel_count: 961
        }
      })
    },
    visionLlm: {
      model: "qwen/qwen2.5-vl-72b-instruct",
      baseUrl: "https://openrouter.ai/api/v1",
      localize: async () => ({
        box: {
          left: 745,
          top: 200,
          right: 775,
          bottom: 230,
          width: 31,
          height: 31,
          center_x: 760,
          center_y: 215,
          pixel_count: 961
        },
        prediction: '{"x":760,"y":215}'
      })
    }
  };

  const result = await clickWithVisionLocalization({
    page,
    targetDescription: "circular arrow button",
    coordinateFallbackConfig: config,
    artifacts: {},
    runLog,
    actionDelayMs: 0
  });

  assert.deepEqual(clicks, [{ x: 760, y: 215 }]);
  assert.equal(result.x, 760);
  assert.ok(
    runLog.some(
      (entry) =>
        entry.event === "agent_click_coordinate_fallback_retrying" &&
        entry.details?.from_strategy === "ui_tars" &&
        entry.details?.retry_strategy === "vision_llm" &&
        /target_expected_button_but_hit_input/.test(entry.details?.click_error || "")
    )
  );
  const successEvent = runLog.find((entry) => entry.event === "agent_click_coordinate_fallback_succeeded");
  assert.equal(successEvent.details.strategy, "vision_llm");
});

test("clickWithVisionLocalization does not use yellow-box annotation when it is excluded", async () => {
  let annotationCalls = 0;
  const page = {
    screenshot: async () => Buffer.from("not-a-real-png"),
    evaluate: async () => ({
      valid: false,
      reason: "non_interactive_element_at_point"
    }),
    mouse: {
      move: async () => {},
      click: async () => {}
    }
  };

  await assert.rejects(
    () =>
      clickWithVisionLocalization({
        page,
        targetDescription: "Start QA button",
        coordinateFallbackConfig: {
          enabled: true,
          provider: "ui_tars",
          model: "bytedance/ui-tars-1.5-7b",
          strategy: "ui_tars->ocr_qwen",
          localizationOrder: ["ui_tars", "ocr_qwen"],
          uiTars: {
            model: "bytedance/ui-tars-1.5-7b",
            model_version: "1.5",
            localize: async () => ({
              box: {
                left: 10,
                top: 20,
                right: 10,
                bottom: 20,
                width: 1,
                height: 1,
                center_x: 10,
                center_y: 20,
                pixel_count: 1
              }
            })
          },
          qwen: {
            model: "qwen-vl-ocr",
            ocrImage: async () => {
              throw new Error("qwen unavailable");
            }
          },
          annotateImage: async () => {
            annotationCalls += 1;
            return Buffer.from("annotated");
          }
        },
        artifacts: {},
        runLog: [],
        actionDelayMs: 0
      }),
    /retry failed/
  );

  assert.equal(annotationCalls, 0);
});

test("resolveBrowserbaseSessionCreateParams enables advanced stealth without proxies by default", async () => {
  await withEnv(
    {
      QA_BROWSERBASE_ADVANCED_STEALTH: undefined,
      QA_BROWSERBASE_SOLVE_CAPTCHAS: undefined,
      QA_BROWSERBASE_BLOCK_ADS: undefined,
      QA_BROWSERBASE_USE_PROXIES: undefined
    },
    async () => {
      const params = resolveBrowserbaseSessionCreateParams();
      assert.equal(params.browserSettings.advancedStealth, true);
      assert.equal(params.browserSettings.solveCaptchas, true);
      assert.equal(params.browserSettings.blockAds, undefined);
      assert.equal(params.proxies, false);
    }
  );
});

test("resolveBrowserbaseSessionCreateParams merges env and option overrides", async () => {
  await withEnv(
    {
      QA_BROWSERBASE_ADVANCED_STEALTH: "false",
      QA_BROWSERBASE_SOLVE_CAPTCHAS: "true",
      QA_BROWSERBASE_BLOCK_ADS: "1",
      QA_BROWSERBASE_USE_PROXIES: "false",
      QA_BROWSERBASE_REGION: "eu-central-1",
      QA_BROWSERBASE_SESSION_TIMEOUT_MS: "45000"
    },
    async () => {
      const params = resolveBrowserbaseSessionCreateParams({
        browserbaseSessionCreateParams: {
          browserSettings: {
            viewport: { width: 1024, height: 768 }
          }
        },
        browserbaseAdvancedStealth: true
      });

      assert.equal(params.browserSettings.advancedStealth, true);
      assert.equal(params.browserSettings.solveCaptchas, true);
      assert.equal(params.browserSettings.blockAds, true);
      assert.deepEqual(params.browserSettings.viewport, { width: 1024, height: 768 });
      assert.equal(params.proxies, false);
      assert.equal(params.region, "eu-central-1");
      assert.equal(params.timeout, 45000);
    }
  );
});

test("resolveBrowserbaseSessionCreateParams builds browserbase geolocated proxy when configured", async () => {
  await withEnv(
    {
      QA_BROWSERBASE_USE_PROXIES: "true",
      QA_BROWSERBASE_PROXY_COUNTRY: "us",
      QA_BROWSERBASE_PROXY_STATE: "ca",
      QA_BROWSERBASE_PROXY_CITY: "san francisco"
    },
    async () => {
      const params = resolveBrowserbaseSessionCreateParams();
      assert.deepEqual(params.proxies, [
        {
          type: "browserbase",
          geolocation: {
            country: "US",
            state: "CA",
            city: "SAN FRANCISCO"
          }
        }
      ]);
    }
  );
});

test("executeBrowserbaseQaRun accepts QA_VISION_API_KEY as a model key", async () => {
  class FakeStagehand {
    constructor() {
      this.browserbaseSessionID = "session_vision_key";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
    }

    async init() {}

    async close() {}

    async agent() {
      return {
        execute: async () => ({
          output: {
            status: "completed",
            findings: [],
            summary: {
              coverage: {
                pages_visited: 1,
                flows_tested: 1,
                flows_blocked: 0,
                untested_areas: []
              }
            }
          }
        })
      };
    }
  }

  const result = await withEnv(
    {
      BROWSERBASE_API_KEY: "test-browserbase-api-key",
      BROWSERBASE_PROJECT_ID: "test-browserbase-project-id",
      OPENAI_API_KEY: undefined,
      QA_OPENAI_API_KEY: undefined,
      BROWSERBASE_OPENAI_API_KEY: undefined,
      QA_VISION_API_KEY: "test-openrouter-key"
    },
    async () =>
      executeBrowserbaseQaRun(createRunRequest(), {
        stagehandModule: { Stagehand: FakeStagehand }
      })
  );

  assert.equal(result.report.status, "completed");
  assert.equal(result.runLog.some((entry) => entry.event === "browserbase_config_missing"), false);
});

test("executeBrowserbaseQaRun strips plan-restricted Browserbase features on fallback", async () => {
  const sessionParams = [];

  class FakeStagehand {
    constructor(config) {
      this.browserbaseSessionID = "session_plan_fallback";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
      this.sessionCreateParams = config.browserbaseSessionCreateParams;
      sessionParams.push(this.sessionCreateParams);
    }

    async init() {
      if (this.sessionCreateParams?.browserSettings?.advancedStealth) {
        throw new Error("403 Advanced stealth mode is only available on the Enterprise plan");
      }
    }

    async close() {}

    async agent() {
      return {
        execute: async () => ({
          output: {
            status: "completed",
            findings: [],
            summary: {
              coverage: {
                pages_visited: 1,
                flows_tested: 1,
                flows_blocked: 0,
                untested_areas: []
              }
            }
          }
        })
      };
    }
  }

  const result = await withEnv(
    {
      ...REQUIRED_ENV,
      QA_BROWSERBASE_USE_PROXIES: "true",
      QA_BROWSERBASE_PROXY_COUNTRY: undefined,
      QA_BROWSERBASE_PROXY_STATE: undefined,
      QA_BROWSERBASE_PROXY_CITY: undefined
    },
    async () =>
      executeBrowserbaseQaRun(createRunRequest(), {
        stagehandModule: { Stagehand: FakeStagehand }
      })
  );

  assert.equal(sessionParams[0].browserSettings.advancedStealth, true);
  assert.equal(sessionParams[0].proxies, true);
  assert.equal(sessionParams[1].browserSettings.advancedStealth, false);
  assert.equal(sessionParams[1].proxies, false);
  assert.equal(result.report.status, "completed");
  assert.ok(result.runLog.some((entry) => entry.event === "browserbase_advanced_stealth_unavailable"));
});

test("executeBrowserbaseQaRun falls back from dom to hybrid and stops", async () => {
  const attemptedModes = [];

  class FakeStagehand {
    constructor() {
      this.browserbaseSessionID = "session_123";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
    }

    async init() {}

    async close() {}

    async agent(config) {
      attemptedModes.push(config.mode);
      if (config.mode === "dom") {
        return {
          execute: async () => {
            throw new Error("dom mode blocked");
          }
        };
      }
      if (config.mode === "hybrid") {
        return {
          execute: async () => ({
            output: {
              status: "completed",
              findings: [
                {
                  id: "f1",
                  type: "bug",
                  severity: "medium",
                  title: "CTA button does nothing",
                  expected_behavior: "The CTA should continue to the next step.",
                  observed_behavior: "Clicking the CTA leaves the user on the same page.",
                  emotional_reaction: {
                    primary: "frustration",
                    intensity: 3
                  },
                  evidence: {
                    screenshots: ["https://example.com/evidence.png"]
                  }
                }
              ],
              summary: {
                coverage: {
                  pages_visited: 2,
                  flows_tested: 1,
                  flows_blocked: 0,
                  untested_areas: []
                }
              }
            }
          })
        };
      }
      throw new Error("cua should not be attempted after hybrid success");
    }
  }

  const result = await withEnv(REQUIRED_ENV, async () =>
    executeBrowserbaseQaRun(createRunRequest(), {
      stagehandModule: { Stagehand: FakeStagehand }
    })
  );

  assert.deepEqual(attemptedModes, ["dom", "hybrid"]);
  assert.equal(result.report.status, "completed");
  assert.equal(result.report.artifacts.agent_mode_used, "hybrid");
  assert.deepEqual(result.report.artifacts.agent_mode_attempts, ["dom", "hybrid", "cua"]);
  assert.ok(
    result.runLog.some((entry) => entry.event === "agent_mode_attempt_failed" && entry.details.mode === "dom")
  );
  assert.ok(
    result.runLog.some(
      (entry) => entry.event === "agent_mode_attempt_succeeded" && entry.details.mode === "hybrid"
    )
  );
  assert.equal(
    result.runLog.some((entry) => entry.event === "agent_mode_attempt_started" && entry.details.mode === "cua"),
    false
  );
});

test("executeBrowserbaseQaRun marks failure after dom/hybrid/cua all fail", async () => {
  const attemptedModes = [];

  class FakeStagehand {
    constructor() {
      this.browserbaseSessionID = "session_456";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
    }

    async init() {}

    async close() {}

    async agent(config) {
      attemptedModes.push(config.mode);
      return {
        execute: async () => {
          throw new Error(`${config.mode} mode failed`);
        }
      };
    }
  }

  const result = await withEnv(REQUIRED_ENV, async () =>
    executeBrowserbaseQaRun(createRunRequest(), {
      stagehandModule: { Stagehand: FakeStagehand }
    })
  );

  assert.deepEqual(attemptedModes, ["dom", "hybrid", "cua"]);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.artifacts.agent_mode_used, null);
  assert.ok(result.report.summary.note.includes("cua mode failed"));

  const finalFailureEvent = result.runLog.find((entry) => entry.event === "agent_execution_failed");
  assert.ok(finalFailureEvent);
  assert.deepEqual(finalFailureEvent.details.attempted_modes, ["dom", "hybrid", "cua"]);
});

test("executeBrowserbaseQaRun captures inline screenshots when agent emits none", async () => {
  let screenshotCalls = 0;

  class FakeStagehand {
    constructor() {
      this.browserbaseSessionID = "session_capture";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
      this.context = {
        awaitActivePage: async () => ({
          goto: async () => {},
          screenshot: async () => {
            screenshotCalls += 1;
            return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
          }
        })
      };
    }

    async init() {}

    async close() {}

    async agent() {
      return {
        execute: async () => ({
          output: {
            status: "completed",
            findings: [],
            summary: {
              coverage: {
                pages_visited: 1,
                flows_tested: 1,
                flows_blocked: 0,
                untested_areas: []
              }
            }
          }
        })
      };
    }
  }

  const result = await withEnv(REQUIRED_ENV, async () =>
    executeBrowserbaseQaRun(createRunRequest(), {
      stagehandModule: { Stagehand: FakeStagehand }
    })
  );

  assert.ok(screenshotCalls >= 1);
  assert.ok(Array.isArray(result.report.artifacts.captured_screenshots));
  assert.ok(result.report.artifacts.captured_screenshots.length >= 1);
  assert.match(result.report.artifacts.captured_screenshots[0], /^data:image\/png;base64,/);
  assert.ok(
    result.runLog.some((entry) => entry.event === "inline_screenshot_captured")
  );
});

test("executeBrowserbaseQaRun supports vision_only mode with annotation-based clicking", async () => {
  const sourceImage = createSolidRgbaImage(140, 90, [255, 255, 255, 255]);
  const annotatedImage = {
    width: sourceImage.width,
    height: sourceImage.height,
    data: Buffer.from(sourceImage.data)
  };
  drawRectangleOutline(annotatedImage, 50, 22, 96, 58, [255, 255, 0, 255]);

  const sourceBuffer = Buffer.from("vision_source");
  const annotatedBuffer = Buffer.from("vision_annotated");
  const clickCalls = [];
  const plannerCalls = [];
  let currentUrl = "about:blank";

  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => sourceBuffer,
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        clickCalls.push([x, y]);
      },
      wheel: async () => {}
    },
    keyboard: {
      type: async () => {},
      press: async () => {}
    },
    context: () => ({
      pages: () => [page]
    })
  };

  class FakeStagehand {
    constructor() {
      this.browserbaseSessionID = "session_vision";
      this.browserbaseSessionURL = "https://browserbase.example/session";
      this.browserbaseDebugURL = "https://browserbase.example/debug";
      this.bus = { on() {} };
      this.context = {
        awaitActivePage: async () => page
      };
    }

    async init() {}

    async close() {}

    async agent() {
      throw new Error("stagehand.agent should not be called in vision_only mode");
    }
  }

  const result = await withEnv(REQUIRED_ENV, async () =>
    executeBrowserbaseQaRun(createRunRequest(), {
      stagehandModule: { Stagehand: FakeStagehand },
      agentModeFallbackOrder: ["vision_only"],
      coordinateClickFallbackEnabled: true,
      coordinateClickFallbackMode: "always",
      coordinateLocalizationOrder: "yellow_box_diff",
      coordinateAnnotationClient: async () => annotatedBuffer,
      coordinateAnnotationDecodePng: (buffer) => {
        if (buffer === sourceBuffer) return sourceImage;
        if (buffer === annotatedBuffer) return annotatedImage;
        throw new Error("Unexpected image buffer");
      },
      visionObservationClient: async ({ step }) => {
        if (step === 1) {
          return {
            observation: "I can tell this is about getting my brand talked about, but I still do not know what the free preview actually includes.",
            what_i_think_this_is: "A service that helps brands earn mentions and backlinks",
            skepticism: "The free preview outcome is still vague.",
            missing_information: "What I get right after I submit my site.",
            trust_signal: "The page makes a concrete promise about brand mentions.",
            emotion: "uncertainty",
            continue_state: "continue"
          };
        }
        return {
          observation: "The next step is visible enough for me to keep going.",
          what_i_think_this_is: "The start of the site preview flow",
          trust_signal: "The page stays consistent after I move forward.",
          emotion: "confidence",
          continue_state: "continue"
        };
      },
      visionPlannerClient: async ({ step }) => {
        plannerCalls.push(step);
        if (step === 1) {
          return {
            action: "click",
            target: "Start Here",
            reason: "begin primary flow",
            success_criteria: "The app should open the next screen"
          };
        }
        return {
          action: "done",
          reason: "Primary objective reached"
        };
      }
    })
  );

  assert.deepEqual(plannerCalls, [1, 2]);
  assert.deepEqual(clickCalls, [[73, 40]]);
  assert.equal(result.report.status, "completed");
  assert.equal(result.report.artifacts.agent_mode_used, "vision_only");
  assert.equal(result.report.artifacts.coordinate_click_fallback.invoked, 1);
  assert.equal(result.report.artifacts.coordinate_click_fallback.resolved, 1);
  assert.equal(result.report.artifacts.coordinate_click_fallback.failed, 0);
  assert.ok(
    result.runLog.some((entry) => entry.event === "vision_only_step_decision")
  );
  assert.ok(
    result.runLog.some(
      (entry) =>
        entry.event === "persona_observation" &&
        String(entry.details?.observation || "").includes("free preview")
    )
  );
  assert.match(String(result.report.summary?.persona_overall || ""), /brand talked about/i);
  assert.ok(Array.isArray(result.report.summary?.persona_skepticisms));
});

test("executeVisionOnlyModeAttempt ignores maxSteps and keeps going until the planner says done", async () => {
  const plannerCalls = [];
  let currentUrl = "about:blank";

  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => Buffer.from("vision-loop-source"),
    waitForTimeout: async () => {},
    mouse: {
      wheel: async () => {}
    },
    keyboard: {
      press: async () => {}
    }
  };

  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      metadata: {
        goal: "Generate a personalized video"
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionPlannerClient: async ({ step }) => {
        plannerCalls.push(step);
        if (step === 1) {
          return {
            action: "wait",
            amount: 1,
            reason: "Allow the next view to settle."
          };
        }
        return {
          action: "done",
          reason: "A generated video is visibly present."
        };
      }
    },
    runLog: [],
    artifacts: {
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => ({
        strategy: "mock",
        box: { center_x: 1, center_y: 1 }
      })
    },
    maxSteps: 1
  });

  assert.deepEqual(plannerCalls, [1, 2]);
  assert.equal(result.candidateReport.status, "completed");
  assert.match(result.rawAgentMessage, /status: completed/i);
});

test("executeVisionOnlyModeAttempt overrides invented placeholder emails with the managed inbox email", async () => {
  let currentUrl = "about:blank";
  const typedValues = [];

  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => Buffer.from("vision-email-source"),
    waitForTimeout: async () => {},
    mouse: {
      move: async () => {},
      click: async () => {},
      wheel: async () => {}
    },
    keyboard: {
      type: async (value) => {
        typedValues.push(String(value || ""));
      },
      press: async () => {}
    }
  };

  const plannerDecisions = [
    {
      action: "type",
      target: "Email input field in sign in popup",
      text: "testemail@example.com",
      reason: "Enter email to receive a one-time code"
    },
    {
      action: "done",
      reason: "Email step completed"
    }
  ];
  let plannerIndex = 0;

  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      metadata: {
        goal: "Create a generated AI video",
        vision_forced_email: "real-inbox@mail.tm"
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionPlannerClient: async () => plannerDecisions[plannerIndex++] || plannerDecisions[plannerDecisions.length - 1]
    },
    runLog: [],
    artifacts: {
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => ({
        strategy: "mock",
        box: { center_x: 10, center_y: 10 }
      })
    }
  });

  assert.deepEqual(typedValues, ["real-inbox@mail.tm"]);
  assert.equal(result.candidateReport.status, "completed");
  assert.match(result.rawAgentMessage, /status: completed/i);
});

test("executeVisionOnlyModeAttempt stops after repeated wait decisions on the same state", async () => {
  let currentUrl = "https://speakeasy.example.com/verify";
  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => Buffer.from("vision-wait-source"),
    waitForTimeout: async () => {},
    mouse: {
      wheel: async () => {}
    },
    keyboard: {
      press: async () => {}
    }
  };

  const runLog = [];
  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      metadata: {
        goal: "Finish the verification step and continue."
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionMaxWaitStreak: 4,
      visionPlannerClient: async () => ({
        action: "wait",
        target: "verification process to complete",
        amount: 1,
        reason: "Waiting for verification to finish"
      })
    },
    runLog,
    artifacts: {
      local_video_url: "https://example.com/run.webm",
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => ({
        strategy: "mock",
        box: { center_x: 1, center_y: 1 }
      })
    }
  });

  assert.equal(result.candidateReport.status, "partial");
  assert.match(result.candidateReport.summary.note, /same waiting state/i);
  assert.ok(runLog.some((entry) => entry.event === "vision_only_wait_streak_blocked"));
});

test("executeVisionOnlyModeAttempt stops and deduplicates repeated identical action failures", async () => {
  let currentUrl = "https://tryseconds.example.com/onboarding";
  let plannerCalls = 0;
  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => Buffer.from("vision-action-failure-source"),
    waitForTimeout: async () => {},
    mouse: {
      wheel: async () => {}
    },
    keyboard: {
      press: async () => {}
    }
  };

  const runLog = [];
  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      target_url: currentUrl,
      metadata: {
        goal: "Finish onboarding and view the generated ideas."
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionPlannerClient: async () => {
        plannerCalls += 1;
        return {
          action: "click",
          target: "See ideas button",
          reason: "Continue to the generated ideas"
        };
      }
    },
    runLog,
    artifacts: {
      local_video_url: "https://example.com/run.webm",
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => {
        throw new Error("Coordinate localization point did not match the requested target");
      }
    }
  });

  assert.equal(plannerCalls, 3);
  assert.equal(result.candidateReport.status, "partial");
  assert.match(result.candidateReport.summary.note, /failed the same action 3 times/i);
  assert.equal(result.candidateReport.findings.length, 1);
  assert.equal(result.candidateReport.findings[0].type, "dead_end");
  assert.equal(result.candidateReport.findings[0].diagnostic_details.repeated_action_failure_count, 3);
  assert.ok(runLog.some((entry) => entry.event === "vision_only_repeated_action_blocked"));
});

test("executeVisionOnlyModeAttempt diagnoses blank screen after OTP with final page state", async () => {
  let currentUrl = "https://app.bhuman.ai/";
  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    title: async () => "",
    viewportSize: () => ({ width: 1440, height: 900 }),
    context: () => ({
      browser: () => ({
        version: () => "Chromium 140.0.0.0"
      })
    }),
    evaluate: async (fn) => {
      const source = String(fn || "");
      if (source.includes("elementFromPoint")) {
        return {
          valid: true,
          reason: "interactive_element_at_point",
          tag: "input",
          role: "",
          type: "text",
          text: "",
          rect: { left: 0, top: 0, right: 10, bottom: 10 }
        };
      }
      return {
        document_ready_state: "complete",
        body_text_length: 0,
        visible_text_preview: "",
        dom_snapshot: [],
        resource_urls: ["https://app.bhuman.ai/assets/index-da14f964.js"],
        post_auth_state: {
          token_present: true,
          auth_cookie_present: false,
          need_profile: true,
          serialized_step: "business_profile",
          storage_key_hints: ["auth_token", "onboarding_state"]
        }
      };
    },
    screenshot: async () => Buffer.from("vision-post-otp-blank"),
    waitForTimeout: async () => {},
    mouse: {
      wheel: async () => {},
      move: async () => {},
      click: async () => {}
    },
    keyboard: {
      press: async () => {},
      type: async () => {}
    }
  };
  const plannerDecisions = [
    { action: "type", target: "Verification code input", text: "123456" },
    { action: "press", target: "Enter key", key: "Enter" },
    { action: "wait", target: "page to fully load", amount: 1 },
    { action: "wait", target: "page to fully load", amount: 1 },
    { action: "wait", target: "page to fully load", amount: 1 },
    { action: "wait", target: "page to fully load", amount: 1 }
  ];
  let plannerIndex = 0;
  const runLog = [];

  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      target_url: "https://app.bhuman.ai/",
      metadata: {
        goal: "Pass OTP and reach onboarding."
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionMaxWaitStreak: 4,
      visionPlannerClient: async () => plannerDecisions[plannerIndex++] || plannerDecisions[plannerDecisions.length - 1],
      visionObserverClient: async () => ({
        observation: "This is a blank white screen after successful OTP verification.",
        what_i_think_this_is: "A blank page after email verification.",
        noticed: [],
        skepticism: "The app looks broken after verification.",
        missing_information: "There is no onboarding, dashboard, spinner, or error.",
        trust_signal: "",
        emotion: "frustration",
        continue_state: "abandon"
      })
    },
    runLog,
    artifacts: {
      local_video_url: "https://example.com/run.webm",
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => ({
        strategy: "mock",
        box: { center_x: 1, center_y: 1 }
      })
    }
  });

  const finding = result.candidateReport.findings[0];
  assert.equal(finding.title, "Blank white screen after successful OTP verification");
  assert.match(finding.observed_behavior, /blank white screen/i);
  assert.equal(finding.diagnostic_details.body_text_length, 0);
  assert.equal(finding.diagnostic_details.post_auth_state.token_present, true);
  assert.equal(finding.diagnostic_details.post_auth_state.need_profile, true);
  assert.equal(finding.diagnostic_details.post_auth_state.serialized_step, "business_profile");
  assert.match(finding.diagnostic_details.asset_fingerprints[0].file, /index-da14f964\.js/);
  assert.ok(runLog.some((entry) => entry.event === "vision_final_page_diagnostics_captured"));
});

test("executeVisionOnlyModeAttempt builds a partial blocked report from real vision history", async () => {
  let currentUrl = "about:blank";
  let clickCount = 0;

  const page = {
    goto: async (url) => {
      currentUrl = String(url || "");
    },
    url: () => currentUrl,
    screenshot: async () => Buffer.from("vision-confusion-source"),
    waitForTimeout: async () => {},
    mouse: {
      wheel: async () => {},
      move: async () => {},
      click: async () => {
        clickCount += 1;
        if (clickCount >= 3) {
          currentUrl = "https://speakeasy.example.com/generate";
        }
      }
    },
    keyboard: {
      press: async () => {},
      type: async () => {}
    }
  };

  const plannerDecisions = [
    { action: "click", target: "Start Free" },
    { action: "click", target: "Start building" },
    { action: "click", target: "Describe and generate with AI" },
    { action: "type", target: "Presenter description", text: "A confident presenter" },
    { action: "click", target: "Generate presenter" },
    { action: "wait", target: "Generating presenter", amount: 1 },
    { action: "wait", target: "Generating presenter", amount: 1 },
    { action: "click", target: "Retry generation button" },
    { action: "wait", target: "Generating presenter", amount: 1 },
    {
      action: "fail",
      reason: "Presenter generation timed out after 89 seconds and no completed presenter state appeared."
    }
  ];
  let plannerIndex = 0;

  const result = await executeVisionOnlyModeAttempt({
    stagehand: {
      context: {
        awaitActivePage: async () => page
      }
    },
    runRequest: {
      ...createRunRequest(),
      metadata: {
        goal: "Generate a personalized video"
      }
    },
    options: {
      visionApiKey: "test-openai-api-key",
      visionActionDelayMs: 1,
      visionPlannerClient: async () => plannerDecisions[plannerIndex++] || plannerDecisions[plannerDecisions.length - 1]
    },
    runLog: [],
    artifacts: {
      local_screenshots: [
        "/tmp/auth-entry-loaded.png",
        "/tmp/auth-form-filled.png",
        "/tmp/auth-flow-completed.png"
      ],
      local_video_url: "https://example.com/run.webm",
      captured_screenshots: [],
      screenshot_event_count: 0
    },
    captureState: {
      maxCount: 8,
      maxBytes: 1500000,
      capturedBytes: 0
    },
    coordinateFallbackConfig: {
      enabled: true,
      localizeBox: async () => ({
        strategy: "mock",
        box: { center_x: 1, center_y: 1 }
      })
    }
  });

  assert.equal(result.candidateReport.status, "partial");
  assert.equal(result.candidateReport.tested_journeys[0].status, "blocked");
  assert.match(result.candidateReport.summary.note, /timed out/i);
  assert.equal(result.candidateReport.findings.length, 1);
  assert.match(result.candidateReport.findings[0].title, /presenter/i);
  assert.doesNotMatch(result.candidateReport.findings[0].title, /persona got blocked in the product/i);
  assert.equal(result.candidateReport.findings[0].page.url, "https://speakeasy.example.com/generate");
  assert.equal(result.candidateReport.findings[0].diagnostic_details.current_url, "https://speakeasy.example.com/generate");
  assert.match(result.candidateReport.findings[0].diagnostic_details.last_successful_step, /Generate presenter/i);
  assert.doesNotMatch(result.candidateReport.findings[0].diagnostic_details.last_successful_step, /Retry generation/i);
  assert.equal(result.candidateReport.findings[0].diagnostic_details.attempted_actions[0].action, "click");
  assert.match(
    String(result.candidateReport.findings[0].diagnostic_details.attempted_actions[0].ts || ""),
    /^20\d\d-/
  );
  assert.equal(result.candidateReport.findings[0].diagnostic_details.attempted_actions[3].action, "type");
  assert.ok(
    result.candidateReport.findings[0].diagnostic_details.attempted_actions.some((attempt) =>
      /retry generation/i.test(String(attempt.target || ""))
    )
  );
  assert.ok(
    result.candidateReport.findings[0].diagnostic_details.attempted_actions.some(
      (attempt) => attempt.action === "wait"
    )
  );
  assert.equal(
    result.candidateReport.findings[0].evidence.screenshots.some((item) =>
      /auth-entry|auth-form|auth-flow/i.test(String(item || ""))
    ),
    false
  );
  assert.ok(result.candidateReport.findings[0].evidence.videos.includes("https://example.com/run.webm"));
  assert.equal(result.agentActions.flows_blocked, 1);
  assert.match(result.rawAgentMessage, /status: partial/i);
});
