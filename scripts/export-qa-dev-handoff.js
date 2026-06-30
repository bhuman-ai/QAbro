#!/usr/bin/env node
const path = require("path");
const { exportQaDevHandoff } = require("../lib/qa-dev-handoff");

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readOption(args, cliKey, envKey, fallbackValue = "") {
  return String(args[cliKey] || process.env[envKey] || fallbackValue || "").trim();
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await exportQaDevHandoff({
    artifactPath: readOption(args, "artifact", "QA_DEV_HANDOFF_ARTIFACT"),
    outputRoot: readOption(args, "output_root", "QA_DEV_HANDOFF_OUTPUT_ROOT", "output/dev-handoffs"),
    searchRoot: readOption(args, "search_root", "QA_DEV_HANDOFF_SEARCH_ROOT", "output"),
    zip: readOption(args, "zip", "QA_DEV_HANDOFF_ZIP", "true")
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        bundle_dir: result.bundleDir,
        zip_path: result.zipPath,
        zip_error: result.zipError,
        console_events: result.consoleEventCount,
        network_events: result.networkEventCount,
        failed_network_events: result.failedNetworkEventCount,
        relevant_failed_network_events: result.relevantFailedNetworkEventCount,
        screenshots: result.screenshotCount,
        videos: result.videoCount,
        readme: path.join(result.bundleDir, "README.md")
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
