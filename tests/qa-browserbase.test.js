const test = require("node:test");
const assert = require("node:assert/strict");

const { executeBrowserbaseQaRun, __private } = require("../lib/qa-browserbase");

const {
  extractYellowBoxFromAnnotatedDiff,
  createCoordinateAwareClickTool,
  resolveBrowserbaseSessionCreateParams,
  resolveCoordinateClickFallbackConfig,
  executeVisionOnlyModeAttempt,
  requestYellowBoxAnnotationWithReplicate,
  requestYellowBoxAnnotationWithOpenAi,
  prepareOcrCandidatesForJudge,
  chooseOcrCandidateWithJudge,
  clickWithVisionLocalization
} = __private;

const REQUIRED_ENV = {
  BROWSERBASE_API_KEY: "test-browserbase-api-key",
  BROWSERBASE_PROJECT_ID: "test-browserbase-project-id",
  OPENAI_API_KEY: "test-openai-api-key"
};

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
  const keys = Object.keys(overrides);
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    const nextValue = overrides[key];
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
      QA_COORDINATE_ANNOTATION_FAL_BASE_URL: undefined
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
      QA_COORDINATE_ANNOTATION_REPLICATE_BASE_URL: undefined
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

test("resolveCoordinateClickFallbackConfig prioritizes qwen OCR before yellow-box diff", async () => {
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
      assert.equal(config.strategy, "ocr_qwen->yellow_box_diff");
      assert.deepEqual(config.localizationOrder, ["ocr_qwen", "yellow_box_diff"]);
      assert.equal(typeof config.localizeBox, "function");
      assert.equal(config.qwen?.model, "qwen-vl-ocr");
    }
  );
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

test("resolveBrowserbaseSessionCreateParams enables advanced stealth by default", async () => {
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
      assert.equal(params.proxies, true);
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
      coordinateAnnotationClient: async () => annotatedBuffer,
      coordinateAnnotationDecodePng: (buffer) => {
        if (buffer === sourceBuffer) return sourceImage;
        if (buffer === annotatedBuffer) return annotatedImage;
        throw new Error("Unexpected image buffer");
      },
      visionPlannerClient: async ({ step }) => {
        plannerCalls.push(step);
        if (step === 1) {
          return {
            action: "click",
            target: "Start Here",
            think_aloud: "I see a Start Here button, but I still want to know what happens after I click it.",
            emotion: "confidence",
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
        entry.event === "persona_thought" &&
        String(entry.details?.text || "").includes("Start Here")
    )
  );
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
