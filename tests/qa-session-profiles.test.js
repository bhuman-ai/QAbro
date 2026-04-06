const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  getQaProfileState,
  resolveQaProfileDir
} = require("../lib/qa-session-profiles");

test("resolveQaProfileDir scopes profiles by owner and brand", () => {
  const profileDir = resolveQaProfileDir(
    {
      brand_key: "ClusterSEO.com",
      owner_user_id: "user_123"
    },
    {
      profileRootDir: "/var/tmp/qabro-profiles"
    }
  );

  assert.equal(profileDir, path.resolve("/var/tmp/qabro-profiles", "dashboard", "user_123", "clusterseo.com"));
});

test("getQaProfileState detects reusable saved sessions", () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qa-session-profile-"));
  const profileDir = path.join(profileRoot, "dashboard", "user_123", "acme");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "Cookies"), "sqlite");

  try {
    const state = getQaProfileState(
      {
        brand_key: "acme",
        owner_user_id: "user_123"
      },
      {
        profileRootDir: profileRoot
      }
    );

    assert.equal(state.available, true);
    assert.equal(state.access_method, "saved_session");
    assert.equal(state.profile_dir, profileDir);
  } finally {
    fs.rmSync(profileRoot, { recursive: true, force: true });
  }
});
