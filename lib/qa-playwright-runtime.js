const fs = require("fs");

const { sanitizeOptionalString } = require("./qa-core");

const DISABLED_VALUES = new Set(["", "default", "none", "false", "0", "off", "no"]);
const CHROME_CHANNEL_VALUES = new Set(["chrome", "chromium", "google-chrome", "google-chrome-stable"]);

const LINUX_CHROME_EXECUTABLES = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

const DARWIN_CHROME_EXECUTABLES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

function normalizeBrowserChannel(value) {
  const channel = sanitizeOptionalString(value, 64);
  if (!channel || DISABLED_VALUES.has(channel.toLowerCase())) {
    return null;
  }
  return channel;
}

function shouldUseSystemChromeForChannel(channel) {
  if (!channel) {
    return true;
  }
  return CHROME_CHANNEL_VALUES.has(String(channel).toLowerCase());
}

function resolveSystemChromeExecutablePath(options = {}) {
  const env = options.env && typeof options.env === "object" ? options.env : process.env;
  const fileExists = typeof options.fileExists === "function" ? options.fileExists : fs.existsSync;
  const explicitPath = sanitizeOptionalString(
    options.executablePath ||
      env.QA_PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      env.QA_CHROMIUM_EXECUTABLE_PATH ||
      env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    4096
  );
  if (explicitPath) {
    return explicitPath;
  }

  const useSystemChrome = sanitizeOptionalString(
    options.useSystemChrome ?? env.QA_PLAYWRIGHT_USE_SYSTEM_CHROME ?? env.QA_USE_SYSTEM_CHROME,
    64
  ) || "";
  if (["false", "0", "off", "no"].includes(useSystemChrome.toLowerCase())) {
    return null;
  }

  const platform = sanitizeOptionalString(options.platform || process.platform, 64);
  const candidates = platform === "darwin" ? DARWIN_CHROME_EXECUTABLES : platform === "linux" ? LINUX_CHROME_EXECUTABLES : [];
  return (
    candidates.find((candidate) => {
      try {
        return fileExists(candidate);
      } catch {
        return false;
      }
    }) || null
  );
}

function buildChromiumLaunchOptions(baseOptions = {}, options = {}) {
  const env = options.env && typeof options.env === "object" ? options.env : process.env;
  const launchOptions = { ...(baseOptions && typeof baseOptions === "object" ? baseOptions : {}) };
  const requestedChannel = normalizeBrowserChannel(
    options.browserChannel ?? launchOptions.channel ?? env.QA_PLAYWRIGHT_BROWSER_CHANNEL ?? env.QA_LOCAL_BROWSER_CHANNEL
  );
  const executablePath = resolveSystemChromeExecutablePath(options);

  if (executablePath && options.preferSystemChrome !== false && shouldUseSystemChromeForChannel(requestedChannel)) {
    delete launchOptions.channel;
    launchOptions.executablePath = executablePath;
    return launchOptions;
  }

  if (requestedChannel) {
    launchOptions.channel = requestedChannel;
  } else if (!launchOptions.executablePath && options.defaultChannel !== false) {
    launchOptions.channel = sanitizeOptionalString(options.defaultChannel, 64) || "chromium";
  }

  return launchOptions;
}

module.exports = {
  buildChromiumLaunchOptions,
  normalizeBrowserChannel,
  resolveSystemChromeExecutablePath,
  shouldUseSystemChromeForChannel
};
