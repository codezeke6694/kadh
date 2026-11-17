// Writes the Playwright storage state the engine's browser walk uses for the "learner" role:
// a returning learner who already picked a Kinnauri, so walks reach screens past #/welcome.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STORAGE_KEY = "kadh.v1";
const DEFAULT_STATE_FILE = ".walk/learner.json";
const LEARNER = { dialect: "pahari", lang: "en", words: {}, streak: { days: 0, last: null }, best: {} };

const address = process.env.ENGINE_URL;
if (!address) throw new Error("ENGINE_URL is not set: the engine passes the address it serves the app at");

const file = process.env.KADH_WALK_STATE || DEFAULT_STATE_FILE;
const state = {
  cookies: [],
  origins: [{ origin: new URL(address).origin, localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(LEARNER) }] }],
};
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
