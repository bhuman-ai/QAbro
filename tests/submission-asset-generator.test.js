const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { validateAssetPrepareRequest } = require("../lib/submission-core");
const {
  buildGenerationTasks,
  generateSubmissionAssets,
  __private: generatorPrivate
} = require("../lib/submission-asset-generator");
const { runAssetPrepare } = require("../lib/submission-runner");

function jsonTextResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name && String(name).toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    async json() {
      return payload;
    }
  };
}

test("validateAssetPrepareRequest accepts built-in OpenAI and Replicate generator config", () => {
  const result = validateAssetPrepareRequest({
    job_id: "asset_prepare_builtin_1",
    brand_profile_id: "brand_clusterseo",
    site_ids: ["saashub"],
    asset_generation_prefer_builtin: true,
    asset_generation_openai_model: "gpt-5.4",
    asset_generation_openai_reasoning: "high",
    asset_generation_replicate_model: "google/nano-banana-2",
    asset_generation_replicate_resolution: "2K"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.metadata.asset_generation_prefer_builtin, true);
  assert.equal(result.data.metadata.asset_generation_openai_model, "gpt-5.4");
  assert.equal(result.data.metadata.asset_generation_openai_reasoning, "high");
  assert.equal(result.data.metadata.asset_generation_replicate_model, "google/nano-banana-2");
  assert.equal(result.data.metadata.asset_generation_replicate_resolution, "2K");
});

test("buildGenerationTasks separates generatable image assets from manual-only assets", () => {
  const generationTasks = buildGenerationTasks({
    available_assets: {
      logo: ["https://cdn.example.com/logo.png"]
    },
    site_profiles: [
      {
        site_id: "saashub",
        site_name: "SaaSHub",
        profile: {
          asset_requirements: [
            { asset_type: "logo", required: true },
            { asset_type: "cover_image", required: true },
            { asset_type: "screenshots", required: true }
          ]
        }
      }
    ]
  });

  assert.equal(generationTasks.tasks.length, 1);
  assert.equal(generationTasks.tasks[0].asset_type, "cover_image");
  assert.deepEqual(generationTasks.tasks[0].required_for, ["saashub"]);
  assert.equal(generationTasks.manual_only_requirements.length, 1);
  assert.equal(generationTasks.manual_only_requirements[0].asset_type, "screenshots");
});

test("OpenAI planner parses structured Responses output for asset planning", async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url, init });
    return jsonTextResponse({
      output_text: JSON.stringify({
        copy_pack: {
          one_liner_60: "ClusterSEO builds contextual backlinks.",
          blurb_160: "Automate contextual backlink acquisition with vetted publishers.",
          blurb_280: "ClusterSEO helps growth teams earn contextual backlinks through a vetted publisher network and credit-based workflow.",
          about_500: "ClusterSEO is a backlink acquisition platform for teams that want contextual placements without cold outreach.",
          long_description_1000: "ClusterSEO helps brands earn contextual backlinks from real publishers using a credit-based workflow instead of manual dealmaking.",
          target_market_description: "B2B SaaS growth teams and SEO operators that need predictable contextual backlinks.",
          ideal_customer_profile: "SEO leads and content marketers at B2B SaaS companies.",
          pricing_summary: "Credit-based pricing for backlink placements.",
          categories: ["SEO", "Link Building"],
          services: ["SEO", "Backlink Acquisition"]
        },
        factual_pack: {
          legal_name: "ClusterSEO",
          website_url: "https://clusterseo.com",
          email: "team@clusterseo.com",
          phone: "",
          linkedin_url: "https://www.linkedin.com/company/clusterseo",
          city: "",
          state: "",
          country: "United States",
          competitors: ["WhitePress", "Collaborator"],
          service_areas: []
        },
        site_plans: [],
        asset_plans: [],
        notes: ["Use an editorial, SEO-forward tone."]
      })
    });
  };

  const result = await generatorPrivate.callOpenAiPlanner(
    {
      openai: {
        enabled: true,
        apiKey: "openai-secret",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
        reasoningEffort: "medium",
        timeoutMs: 30000
      }
    },
    { brand: { display_name: "ClusterSEO" }, generation_tasks: [] },
    [],
    fetchImpl
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.copy_pack.one_liner_60, "ClusterSEO builds contextual backlinks.");
  assert.equal(fetchCalls.length, 1);
  const requestBody = JSON.parse(fetchCalls[0].init.body);
  assert.equal(requestBody.model, "gpt-5.4");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.reasoning.effort, "medium");
});

test("OpenAI planner accepts structured payload returned in parsed content", async () => {
  const result = await generatorPrivate.callOpenAiPlanner(
    {
      openai: {
        enabled: true,
        apiKey: "openai-secret",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
        reasoningEffort: "medium",
        timeoutMs: 30000
      }
    },
    { brand: { display_name: "ClusterSEO" }, generation_tasks: [] },
    [],
    async () =>
      jsonTextResponse({
        output: [
          {
            content: [
              {
                type: "output_json",
                parsed: {
                  copy_pack: {
                    one_liner_60: "ClusterSEO builds contextual backlinks.",
                    blurb_160: "Automate contextual backlink acquisition with vetted publishers.",
                    blurb_280:
                      "ClusterSEO helps growth teams earn contextual backlinks through a vetted publisher network and credit-based workflow.",
                    about_500:
                      "ClusterSEO is a backlink acquisition platform for teams that want contextual placements without cold outreach.",
                    long_description_1000:
                      "ClusterSEO helps brands earn contextual backlinks from real publishers using a credit-based workflow instead of manual dealmaking.",
                    target_market_description:
                      "B2B SaaS growth teams and SEO operators that need predictable contextual backlinks.",
                    ideal_customer_profile: "SEO leads and content marketers at B2B SaaS companies.",
                    pricing_summary: "Credit-based pricing for backlink placements.",
                    categories: ["SEO", "Link Building"],
                    services: ["SEO", "Backlink Acquisition"]
                  },
                  factual_pack: {
                    legal_name: "ClusterSEO",
                    website_url: "https://clusterseo.com",
                    email: "team@clusterseo.com",
                    phone: "",
                    linkedin_url: "https://www.linkedin.com/company/clusterseo",
                    city: "",
                    state: "",
                    country: "United States",
                    competitors: ["WhitePress", "Collaborator"],
                    service_areas: []
                  },
                  site_plans: [],
                  asset_plans: [],
                  notes: ["Use an editorial, SEO-forward tone."]
                }
              }
            ]
          }
        ]
      })
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.copy_pack.one_liner_60, "ClusterSEO builds contextual backlinks.");
  assert.equal(result.payload.factual_pack.legal_name, "ClusterSEO");
});

test("generateSubmissionAssets uses GPT-5.4 planning and Nano Banana 2 image generation", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith("/responses")) {
      return jsonTextResponse({
        output_text: JSON.stringify({
          copy_pack: {
            one_liner_60: "ClusterSEO builds contextual backlinks.",
            blurb_160: "Automate contextual backlink acquisition with vetted publishers.",
            blurb_280: "ClusterSEO helps growth teams earn contextual backlinks through a vetted publisher network and credit-based workflow.",
            about_500: "ClusterSEO is a backlink acquisition platform for teams that want contextual placements without cold outreach.",
            long_description_1000: "ClusterSEO helps brands earn contextual backlinks from real publishers using a credit-based workflow instead of manual dealmaking.",
            target_market_description: "B2B SaaS growth teams and SEO operators.",
            ideal_customer_profile: "SEO leads at growth-stage B2B SaaS companies.",
            pricing_summary: "Credit-based pricing for backlink placements.",
            categories: ["SEO", "Link Building"],
            services: ["SEO", "Backlink Acquisition"]
          },
          factual_pack: {
            legal_name: "ClusterSEO",
            website_url: "https://clusterseo.com",
            email: "team@clusterseo.com",
            phone: "",
            linkedin_url: "https://www.linkedin.com/company/clusterseo",
            city: "",
            state: "",
            country: "United States",
            competitors: ["WhitePress", "Collaborator"],
            service_areas: []
          },
          site_plans: [
            {
              site_id: "saashub",
              notes: "Lean into SEO operators and contextual backlinks.",
              field_overrides: [
                {
                  field_label: "Target Market",
                  field_name: "target_market",
                  suggested_value: "SEO leads at B2B SaaS companies."
                }
              ]
            }
          ],
          asset_plans: [
            {
              asset_type: "cover_image",
              output_bucket: "cover_image",
              should_generate: true,
              reason: "SaaSHub benefits from a polished launch banner.",
              prompt: "A clean editorial banner for ClusterSEO with structured search motifs and warm orange accents.",
              negative_prompt: "photography, people, blurry text",
              aspect_ratio: "16:9",
              variants: 1,
              required_for: ["saashub"],
              use_reference_assets: []
            }
          ],
          notes: ["Use concise SEO language."]
        })
      });
    }

    return jsonResponse({
      status: "succeeded",
      output: ["https://cdn.example.com/generated/clusterseo-cover.png"]
    });
  };

  const result = await generateSubmissionAssets(
    {
      metadata: {
        asset_generation_builtin: true
      }
    },
    {
      brand: {
        brand_profile_id: "brand_clusterseo",
        display_name: "ClusterSEO",
        website_url: "https://clusterseo.com",
        summary: "Backlink acquisition platform for SEO teams."
      },
      available_assets: {},
      requested_site_ids: ["saashub"],
      site_profiles: [
        {
          site_id: "saashub",
          site_name: "SaaSHub",
          profile: {
            asset_requirements: [{ asset_type: "cover_image", required: true }]
          }
        }
      ]
    },
    {
      assetGenerationOpenAiApiKey: "openai-secret",
      assetGenerationReplicateApiKey: "replicate-secret",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.response.provider, "builtin_openai_replicate");
  assert.equal(result.response.copy_pack.one_liner_60, "ClusterSEO builds contextual backlinks.");
  assert.deepEqual(result.response.generated_assets.cover_image, [
    "https://cdn.example.com/generated/clusterseo-cover.png"
  ]);
  assert.equal(result.response.site_plans.saashub.field_overrides[0].field_name, "target_market");
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /replicate\.com\/v1\/models\/google\/nano-banana-2\/predictions$/);
});

test("Replicate aspect ratios are clamped to supported values", () => {
  assert.equal(generatorPrivate.normalizeReplicateAspectRatio("logo", "7:5"), "1:1");
  assert.equal(generatorPrivate.normalizeReplicateAspectRatio("cover_image", "21:9"), "21:9");
});

test("runAssetPrepare applies built-in generated assets and site plan overrides to the manifest", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "submission-asset-prepare-builtin-"));
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/responses")) {
      return jsonTextResponse({
        output_text: JSON.stringify({
          copy_pack: {
            one_liner_60: "ClusterSEO builds contextual backlinks.",
            blurb_160: "Automate contextual backlink acquisition with vetted publishers.",
            blurb_280: "ClusterSEO helps growth teams earn contextual backlinks through a vetted publisher network and credit-based workflow.",
            about_500: "ClusterSEO is a backlink acquisition platform for teams that want contextual placements without cold outreach.",
            long_description_1000: "ClusterSEO helps brands earn contextual backlinks from real publishers using a credit-based workflow instead of manual dealmaking.",
            target_market_description: "B2B SaaS growth teams and SEO operators.",
            ideal_customer_profile: "SEO leads at growth-stage B2B SaaS companies.",
            pricing_summary: "Credit-based pricing for backlink placements.",
            categories: ["SEO", "Link Building"],
            services: ["SEO", "Backlink Acquisition"]
          },
          factual_pack: {
            legal_name: "ClusterSEO",
            website_url: "https://clusterseo.com",
            email: "team@clusterseo.com",
            phone: "",
            linkedin_url: "https://www.linkedin.com/company/clusterseo",
            city: "",
            state: "",
            country: "United States",
            competitors: ["WhitePress", "Collaborator"],
            service_areas: []
          },
          site_plans: [
            {
              site_id: "saashub",
              notes: "Target SEO leaders, not generic marketers.",
              field_overrides: [
                {
                  field_label: "Target Market",
                  field_name: "target_market",
                  suggested_value: "SEO leaders at B2B SaaS companies."
                }
              ]
            }
          ],
          asset_plans: [
            {
              asset_type: "cover_image",
              output_bucket: "cover_image",
              should_generate: true,
              reason: "Need a hero asset for SaaSHub.",
              prompt: "A clean, warm, editorial cover image for ClusterSEO with search analytics motifs.",
              negative_prompt: "people, selfies, office photography",
              aspect_ratio: "16:9",
              variants: 1,
              required_for: ["saashub"],
              use_reference_assets: []
            }
          ],
          notes: ["Generated for structured directory submission."]
        })
      });
    }
    return jsonResponse({
      status: "succeeded",
      output: ["https://cdn.example.com/generated/clusterseo-cover.png"]
    });
  };

  const result = await runAssetPrepare(
    {
      job_id: "asset_prepare_builtin_2",
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"],
      metadata: {
        asset_generation_prefer_builtin: true
      }
    },
    {
      outputRoot,
      assetGenerationOpenAiApiKey: "openai-secret",
      assetGenerationReplicateApiKey: "replicate-secret",
      fetchImpl,
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://clusterseo.com",
          profile: {
            summary: "Backlink acquisition platform for SEO teams.",
            description: "ClusterSEO helps growth teams earn contextual backlinks through vetted publishers.",
            services: ["SEO", "Link Building"],
            tags: ["SEO", "Backlinks"],
            competitors: ["WhitePress", "Collaborator"],
            contact: {
              email: "team@clusterseo.com"
            }
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            submit_url: "https://www.saashub.com/services/submit",
            profile: {
              asset_requirements: [{ asset_type: "cover_image", required: true }],
              fields: [
                { label: "Product Name", name: "service[name]", type: "text", required: true },
                { label: "Target Market", name: "target_market", type: "textarea", required: false }
              ]
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.result.asset_manifest.generation.status, "completed");
  assert.equal(result.result.asset_manifest.generation.hook_url, "builtin_openai_replicate");
  assert.deepEqual(result.result.asset_manifest.available_assets.cover_image, [
    "https://cdn.example.com/generated/clusterseo-cover.png"
  ]);
  assert.equal(
    result.result.asset_manifest.site_manifests[0].generation_notes,
    "Target SEO leaders, not generic marketers."
  );
  const targetMarketSuggestion = result.result.asset_manifest.site_manifests[0].field_suggestions.find(
    (item) => item.field_name === "target_market"
  );
  assert.equal(targetMarketSuggestion.suggested_value, "SEO leaders at B2B SaaS companies.");
});

test("runAssetPrepare prefers built-in generation over legacy hook by default", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "submission-asset-prepare-builtin-default-"));
  let hookCalled = false;
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/responses")) {
      return jsonTextResponse({
        output_text: JSON.stringify({
          copy_pack: {
            one_liner_60: "ClusterSEO builds contextual backlinks.",
            blurb_160: "Automate contextual backlink acquisition with vetted publishers.",
            blurb_280: "ClusterSEO helps growth teams earn contextual backlinks through a vetted publisher network and credit-based workflow.",
            about_500: "Built-in copy wins.",
            long_description_1000: "Built-in generation should win over the legacy hook when both are present.",
            target_market_description: "B2B SaaS growth teams.",
            ideal_customer_profile: "SEO leads at B2B SaaS companies.",
            pricing_summary: "Credit-based pricing.",
            categories: ["SEO"],
            services: ["Link Building"]
          },
          factual_pack: {
            legal_name: "ClusterSEO",
            website_url: "https://clusterseo.com",
            email: "team@clusterseo.com",
            phone: "",
            linkedin_url: "",
            city: "",
            state: "",
            country: "United States",
            competitors: [],
            service_areas: []
          },
          site_plans: [],
          asset_plans: [],
          notes: ["Built-in generator selected."]
        })
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await runAssetPrepare(
    {
      job_id: "asset_prepare_builtin_pref_default",
      brand_profile_id: "brand_clusterseo",
      site_ids: ["saashub"]
    },
    {
      outputRoot,
      assetGenerationOpenAiApiKey: "openai-secret",
      fetchImpl,
      assetGenerationHook: async () => {
        hookCalled = true;
        return {
          ok: true,
          response: {
            copy_pack: {
              about_500: "Legacy hook copy"
            }
          }
        };
      },
      loadBrandProfile: async () => ({
        ok: true,
        row: {
          brand_profile_id: "brand_clusterseo",
          brand_key: "clusterseo",
          track: "startup",
          display_name: "ClusterSEO",
          website_url: "https://clusterseo.com",
          profile: {
            summary: "Backlink acquisition platform for SEO teams.",
            contact: {
              email: "team@clusterseo.com"
            }
          }
        }
      }),
      loadSiteProfiles: async () => ({
        ok: true,
        rows: [
          {
            site_id: "saashub",
            site_name: "SaaSHub",
            submission_policy: "assist",
            submit_url: "https://www.saashub.com/services/submit",
            profile: {
              fields: [{ label: "Description", name: "description", type: "textarea", required: false }]
            }
          }
        ]
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(hookCalled, false);
  assert.equal(result.result.asset_manifest.copy_pack.about_500, "Built-in copy wins.");
  assert.equal(result.result.asset_manifest.generation.hook_url, "builtin_openai_replicate");
});
