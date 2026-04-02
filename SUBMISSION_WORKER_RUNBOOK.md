# Submission Worker Runbook

Use this worker to process submission jobs from `swarm_jobs`, including:

- `directory_recon`
- `asset_prepare`
- `directory_submit`

## Built-In Asset Generation

`asset_prepare` now prefers the built-in generator by default and only falls back to the legacy hook when built-in generation is unavailable or explicitly disabled.

Built-in planning and copy generation:

- `SUBMISSION_ASSET_OPENAI_API_KEY` or `OPENAI_API_KEY`
- `SUBMISSION_ASSET_OPENAI_MODEL` (default `gpt-5.4`)
- `SUBMISSION_ASSET_OPENAI_BASE_URL`
- `SUBMISSION_ASSET_OPENAI_REASONING`
- `SUBMISSION_ASSET_OPENAI_TIMEOUT_MS`

Built-in visual asset generation:

- `SUBMISSION_ASSET_REPLICATE_API_KEY` or `REPLICATE_API_TOKEN`
- `SUBMISSION_ASSET_REPLICATE_MODEL` (default `google/nano-banana-2`)
- `SUBMISSION_ASSET_REPLICATE_BASE_URL`
- `SUBMISSION_ASSET_REPLICATE_TIMEOUT_MS`
- `SUBMISSION_ASSET_REPLICATE_RESOLUTION`

Behavior:

- GPT-5.4 builds structured copy, factual packs, per-site field overrides, and asset prompts.
- Replicate Nano Banana 2 generates visual assets like banners, cover images, OG cards, icons, and logo refreshes.
- Real trust assets such as screenshots, team photos, office photos, and founder headshots stay manual-only.
- Set `asset_generation_prefer_builtin=false` on a request only if you need to force the legacy hook first.

## Start Manually

```bash
cd /opt/qabro
npm run submission:worker
```

Single job then exit:

```bash
cd /opt/qabro
npm run submission:worker:once
```

Run with a tighter polling interval:

```bash
cd /opt/qabro
node scripts/submission-worker.js --interval-ms 5000
```

## Install As A Service

```bash
cd /opt/qabro
sudo APP_USER=qabro APP_GROUP=qabro APP_ROOT=/opt/qabro scripts/worker/install-submission-worker.sh
```

Optional overrides:

- `NODE_BIN=/usr/bin/node`
- `INTERVAL_MS=5000`
- `SERVICE_NAME=qabro-submission-worker`

## CAPTCHA Solver

The self-hosted submission runner now supports direct 2Captcha solving in `directory_submit`.

Set any of these env vars on the DO worker service:

- `SUBMISSION_SELF_HOSTED_2CAPTCHA_API_KEY`
- `SUBMISSION_DO_2CAPTCHA_API_KEY`
- `TWOCAPTCHA_API_KEY`
- `TWO_CAPTCHA_API_KEY`

Optional tuning:

- `SUBMISSION_SELF_HOSTED_2CAPTCHA_TIMEOUT_MS`
- `SUBMISSION_SELF_HOSTED_2CAPTCHA_POLL_INTERVAL_MS`
- `SUBMISSION_SELF_HOSTED_2CAPTCHA_POST_INJECT_WAIT_MS`
- `SUBMISSION_SELF_HOSTED_2CAPTCHA_API_BASE_URL`
- `SUBMISSION_SELF_HOSTED_2CAPTCHA_SOFT_ID`

Behavior:

- If a 2Captcha API key is present, `submission_captcha_strategy=built_in` will use direct 2Captcha solving first.
- If the page still reports an active captcha after token injection, the runner falls back to the existing built-in wait window.
- `hook` and `pause` strategies still work unchanged.

## Check Status

```bash
systemctl status qabro-submission-worker.service
journalctl -u qabro-submission-worker.service -f
```

## Current Forney Batch

Queued recon batch:

- `pack-recon-forney-local-1774708411398-google-business-profile`
- `pack-recon-forney-local-1774708411398-apple-business-connect`
- `pack-recon-forney-local-1774708411398-yelp`
- `pack-recon-forney-local-1774708411398-bbb`

These will remain `queued` until the submission worker is running.
