import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import render, { pickWordOfDay } from "../src/screens/home.js";
import strings from "../src/i18n/home.js";
import { GAME_IDS } from "../src/games/index.js";
import { recordAnswer } from "../src/data/progress.js";
import { todayText } from "../src/games/kit.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton, useFakeStorage, allElements } from "./fake-dom.js";

const FORM_URL = "https://forms.example.org/kadh-new-word";

function word(id, dialects = ["pahari"], hi = `${id}-hi`) {
  const entries = dialects.map((dialect) => [dialect, { text: `${id}-k / ${id}-k2`, forms: [`${id}-k`, `${id}-k2`] }]);
  return { id, en: `${id}-en`, hi, dialects: Object.fromEntries(entries), topic: "nature" };
}

const WORDS = [
  word("cloud"), word("snow"), word("river", ["hamskad"]), word("tree"), word("goat", ["pahari", "navaskad"]),
  word("dog", ["hamskad"]), word("milk", ["pahari"], ""),
];

const builtGame = {
  id: "flashcards",
  title: { en: "Built flashcards", hi: "बने फ़्लैशकार्ड" },
  blurb: { en: "Turn a card.", hi: "कार्ड पलटें।" },
  icon: "🃏",
};

// Only flashcards is built; the other five are still null, as loadGames gives them.
async function fakeLoadGames() {
  return GAME_IDS.map((id) => ({ id, game: id === builtGame.id ? builtGame : null }));
}

async function open({ formUrl = "", lang = "en", dialect = "pahari", words = WORDS } = {}) {
  const doc = makeFakeDocument();
  const el = doc.createElement("main");
  const ctx = { words, settings: { dialect, lang }, t, go() {}, params: {} };
  await render(el, ctx, { loadGames: fakeLoadGames, formUrl });
  return el;
}

const links = (el) => allElements(el).filter((node) => node.tagName === "A");

beforeEach(async () => {
  useFakeStorage();
  setLang("en");
  await loadStrings(["home"]);
});

test("the word of the day is the same for the same day and only from the chosen Kinnauri", () => {
  const first = pickWordOfDay(WORDS, "pahari", "2026-11-17");
  assert.equal(pickWordOfDay(WORDS, "pahari", "2026-11-17"), first);
  assert.ok(first.dialects.pahari);
  for (const day of ["2026-01-01", "2026-06-15", "2027-12-31"]) {
    assert.ok(pickWordOfDay(WORDS, "hamskad", day).dialects.hamskad, day);
  }
});

test("the word of the day changes across days", () => {
  const days = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  const picked = new Set(days.map((day) => pickWordOfDay(WORDS, "pahari", day).id));
  assert.ok(picked.size > 1);
});

test("no word in the chosen Kinnauri gives no word of the day", () => {
  assert.equal(pickWordOfDay(WORDS, "navaskad", "2026-11-17").id, "goat");
  assert.equal(pickWordOfDay([], "pahari", "2026-11-17"), null);
  assert.equal(pickWordOfDay(WORDS.filter((w) => !w.dialects.navaskad), "navaskad", "2026-11-17"), null);
});

test("two renders on the same day show the same word of the day, linked to its word page", async () => {
  const [a, b] = [await open(), await open()];
  const textOf = (el) => findByClass(el, "home-wotd")[0].textContent;
  assert.equal(textOf(a), textOf(b));
  const today = pickWordOfDay(WORDS, "pahari", todayText(new Date()));
  assert.match(textOf(a), new RegExp(`${today.id}-k`));
  assert.match(textOf(a), new RegExp(`${today.id}-en`));
  assert.ok(links(a).some((link) => link.getAttribute("href") === `#/word/${today.id}`));
});

test("in Hindi the word of the day shows its Hindi meaning", async () => {
  setLang("hi");
  const el = await open({ lang: "hi", words: [word("cloud")] });
  assert.match(findByClass(el, "home-wotd")[0].textContent, /cloud-hi/);
});

test("with no word in the chosen Kinnauri home still shows the games", async () => {
  const el = await open({ dialect: "navaskad", words: [word("cloud")] });
  assert.equal(findByClass(el, "home-wotd").length, 0);
  assert.equal(findByClass(el, "home-game").length, 6);
});

test("the home screen shows the six games, each linked to #/play/<id>", async () => {
  const el = await open();
  const cards = findByClass(el, "home-game");
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((card) => card.getAttribute("href")), GAME_IDS.map((id) => `#/play/${id}`));
  assert.match(cards[0].textContent, /Built flashcards/);
  assert.match(cards[0].textContent, /Turn a card/);
  assert.match(cards[1].textContent, /Pick the meaning/);
});

test("a game card shows its title in Hindi when Hindi is chosen", async () => {
  setLang("hi");
  const cards = findByClass(await open({ lang: "hi" }), "home-game");
  assert.match(cards[0].textContent, /बने फ़्लैशकार्ड/);
  assert.match(cards[5].textContent, new RegExp(strings.hi["home.game.true-false.title"]));
});

test("the words to review count counts only due words in the chosen Kinnauri", async () => {
  const today = todayText(new Date());
  assert.match(findByClass(await open(), "home-review")[0].textContent, /0/);
  recordAnswer("cloud", false, today);
  recordAnswer("snow", false, today);
  recordAnswer("river", false, today);
  recordAnswer("tree", true, today);
  assert.match(findByClass(await open(), "home-review-count")[0].textContent, /^2$/);
});

test("with no form link set there is no Submit a word button", async () => {
  const el = await open({ formUrl: "" });
  assert.equal(findButton(el, "Submit a word"), undefined);
  assert.equal(findByClass(el, "home-submit").length, 0);
});

test("with a form link set Submit a word opens the form in a new tab", async () => {
  const link = findButton(await open({ formUrl: FORM_URL }), "Submit a word");
  assert.ok(link);
  assert.equal(link.tagName, "A");
  assert.equal(link.getAttribute("href"), FORM_URL);
  assert.equal(link.getAttribute("target"), "_blank");
  assert.match(link.getAttribute("rel"), /noopener/);
});

test("every English string has a Hindi one and no string is empty", () => {
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
  for (const code of ["en", "hi"]) {
    for (const [key, value] of Object.entries(strings[code])) assert.ok(value.trim(), `${code} ${key}`);
  }
  for (const id of GAME_IDS) assert.ok(strings.en[`home.game.${id}.title`], id);
});
