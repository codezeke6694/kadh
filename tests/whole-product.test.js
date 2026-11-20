// The whole product (KAD-18): every game, on the real sheet and topics, played to its results
// screen with each of the three Kinnauri and in both languages, by a learner tapping at random.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_IDS, loadGame } from "../src/games/index.js";
import render, { ALL_WORDS } from "../src/games/kit.js";
import { parseCsv, toWords, DIALECT_COLUMNS } from "../src/data/words.js";
import { getStats } from "../src/data/progress.js";
import { t, setLang, loadStrings, LANGS } from "../src/i18n.js";
import { makeFakeDocument, allElements, findByClass, useFakeStorage } from "./fake-dom.js";

const TOPICS_FILE = JSON.parse(readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const WORDS = toWords(parseCsv(readFileSync(new URL("../data/sheet.csv", import.meta.url), "utf8")), TOPICS_FILE.words);
const DIALECTS = Object.keys(DIALECT_COLUMNS);
// Enough taps for the slowest game (a full minute of True or false rush, three boards of pairs).
const MAX_TAPS = 3000;
const MS_PER_TAP = 1000;

// A seeded random tapper, so a failing run can be repeated.
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function canTap(el) {
  return el.tagName === "BUTTON" && !el.disabled && el.getAttribute("disabled") === null && el.getAttribute("aria-disabled") !== "true";
}

async function playToResults(gameId, dialect, lang) {
  const doc = makeFakeDocument();
  const el = doc.createElement("main");
  const ctx = { words: WORDS, settings: { dialect, lang }, t, go() {}, params: { gameId, topic: ALL_WORDS } };
  await render(el, ctx, { loadGame, loadTopics: async () => TOPICS_FILE.topics });
  const random = seededRandom(GAME_IDS.indexOf(gameId) + 1);
  for (let tap = 0; tap < MAX_TAPS; tap++) {
    if (findByClass(el, "kit-results").length) return el;
    const play = findByClass(el, "kit-play")[0];
    assert.ok(play, `${gameId} in ${dialect} left its play area: ${el.textContent.slice(0, 120)}`);
    const buttons = allElements(play).filter(canTap);
    if (buttons.length) buttons[Math.floor(random() * buttons.length)].click();
    mock.timers.tick(MS_PER_TAP);
  }
  assert.fail(`${gameId} in ${dialect} (${lang}) did not reach its results after ${MAX_TAPS} taps`);
}

beforeEach(async () => {
  useFakeStorage();
  await loadStrings();
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date(2026, 10, 17, 9) });
});

afterEach(() => {
  mock.timers.reset();
  setLang("en");
});

for (const lang of LANGS) {
  for (const dialect of DIALECTS) {
    test(`every game reaches its results with ${dialect} words, buttons in ${lang}`, async () => {
      setLang(lang);
      for (const gameId of GAME_IDS) {
        const el = await playToResults(gameId, dialect, lang);
        assert.ok(el.textContent.includes(t("kit.resultsTitle")), `${gameId} in ${dialect}`);
      }
      const { best } = getStats("2026-11-17");
      assert.deepEqual(Object.keys(best).sort(), [...GAME_IDS].sort(), "each game's best score is kept");
    });
  }
}
