import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/journey-learner.mjs", import.meta.url));

function runSetup(env) {
  const out = join(mkdtempSync(join(tmpdir(), "kadh-walk-")), "learner.json");
  execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env, KADH_WALK_STATE: out } });
  return JSON.parse(readFileSync(out, "utf8"));
}

test("the walk state picks a Kinnauri for the address the engine serves", () => {
  const state = runSetup({ ENGINE_URL: "http://127.0.0.1:5173/" });
  const [origin] = state.origins;
  assert.equal(origin.origin, "http://127.0.0.1:5173");
  const saved = origin.localStorage.find((item) => item.name === "kadh.v1");
  assert.equal(JSON.parse(saved.value).dialect, "pahari");
  assert.deepEqual(state.cookies, []);
});

test("the walk setup refuses to run without the engine's address", () => {
  assert.throws(() => runSetup({ ENGINE_URL: "" }));
});
