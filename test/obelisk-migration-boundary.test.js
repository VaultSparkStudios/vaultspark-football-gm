import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const removedV1Artifacts = [
  "../obelisk-passport/OBELISK_PASSPORT.md",
  "../obelisk-passport/ObeliskLogin.jsx",
  "../obelisk-passport/obelisk-callback.js",
  "../obelisk-passport/verify.server.js",
  "../src/ObeliskLogin.jsx",
  "../src/obelisk-callback.js"
];

test("deprecated Passport v1 executable artifacts cannot masquerade as current auth", () => {
  for (const relative of removedV1Artifacts) {
    assert.equal(fs.existsSync(new URL(relative, import.meta.url)), false, `${relative} stays removed`);
  }
  const boundary = fs.readFileSync(new URL("../obelisk-passport/README.md", import.meta.url), "utf8");
  assert.match(boundary, /Authorization Code with Proof Key for Code Exchange \(PKCE\)/);
  assert.match(boundary, /no executable authentication code/);
});

test("project status declares an external, honestly not-integrated Obelisk boundary", () => {
  const status = JSON.parse(fs.readFileSync(new URL("../context/PROJECT_STATUS.json", import.meta.url), "utf8"));
  assert.equal(status.obeliskArchitecture, "external");
  assert.equal(status.obeliskIdentity.status, "not-integrated");
  assert.equal(status.obeliskIdentity.localAuth, false);
  assert.equal(status.obeliskIdentity.protocol, "oidc-authorization-code-s256-pkce");
});
