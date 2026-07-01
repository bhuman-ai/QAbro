const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChromiumLaunchOptions,
  resolveSystemChromeExecutablePath
} = require("../lib/qa-playwright-runtime");

test("playwright launch options prefer installed Chrome on Linux", () => {
  const launchOptions = buildChromiumLaunchOptions(
    { headless: true, channel: "chromium" },
    {
      env: {},
      platform: "linux",
      fileExists: (candidate) => candidate === "/usr/bin/google-chrome-stable"
    }
  );

  assert.equal(launchOptions.channel, undefined);
  assert.equal(launchOptions.executablePath, "/usr/bin/google-chrome-stable");
});

test("playwright launch options keep non-Chrome channels explicit", () => {
  const launchOptions = buildChromiumLaunchOptions(
    { headless: true },
    {
      browserChannel: "msedge",
      env: {},
      platform: "linux",
      fileExists: (candidate) => candidate === "/usr/bin/google-chrome-stable"
    }
  );

  assert.equal(launchOptions.channel, "msedge");
  assert.equal(launchOptions.executablePath, undefined);
});

test("playwright launch options fall back to bundled chromium when no system Chrome exists", () => {
  const launchOptions = buildChromiumLaunchOptions(
    { headless: true },
    {
      env: {},
      platform: "linux",
      fileExists: () => false
    }
  );

  assert.equal(launchOptions.channel, "chromium");
  assert.equal(launchOptions.executablePath, undefined);
});

test("explicit executable path does not need to exist before launch", () => {
  const executablePath = resolveSystemChromeExecutablePath({
    env: {
      QA_CHROMIUM_EXECUTABLE_PATH: "/custom/chrome"
    },
    platform: "linux",
    fileExists: () => false
  });

  assert.equal(executablePath, "/custom/chrome");
});
