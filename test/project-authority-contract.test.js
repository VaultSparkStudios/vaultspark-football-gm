import assert from "node:assert/strict";
import test from "node:test";

import { checkProjectAuthorityContract } from "../scripts/check-project-authority-contract.mjs";

test("generic propagation cannot erase project parser, status, test, or startup authorities", async () => {
  const result = await checkProjectAuthorityContract();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.errors, []);
});
