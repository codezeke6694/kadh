import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import render, { GAME_IDS, bestScoreRows, localDay } from "../src/screens/progress.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { recordAnswer, recordGame, setSettings } from "../src/data/progress.js";
import { loadGame } from "../src/games/index.js";

// A small stand-in for the browser's document: only what the screen uses.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.ownText = "";
    this.className = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
    this.ownText = "";
  }
  set textContent(text) {
    this.children = [];
    this.ownText = String(text);
  }
  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

const fakeDocument = { createElement: (tagName) => new FakeElement(tagName, fakeDocument) };

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

function findByClass(root, className) {
  return allElements(root).filter((el) => el.className.split(" ").includes(className));
}

function useStorage() {
  const items = new Map();
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

function draw() {
  const view = fakeDocument.createElement("main");
  render(view, { words: [], settings: { dialect: "pahari", lang: "en" }, t, go() {}, params: {} });
  return view;
}

// Today in the learner's own time zone, as the screen reads it.
const TODAY = localDay(new Date());

function learnWord(wordId) {
  for (let i = 0; i < 3; i += 1) recordAnswer(wordId, true, TODAY);
}

beforeEach(async () => {
  useStorage();
  setSettings({ lang: "en" });
  setLang("en");
  await loadStrings();
});

// progress.js keeps what it saved in memory for the rest of the run, so this test comes first.
test("with nothing played yet it invites the learner to play, with a link home", () => {
  const view = draw();
  assert.equal(findByClass(view, "best-row").length, 0);
  assert.ok(view.textContent.includes(t("progress.emptyTitle")));
  const link = allElements(view).find((el) => el.tagName === "A");
  assert.equal(link.getAttribute("href"), "#/");
  assert.equal(link.textContent, t("progress.emptyAction"));
});

test("localDay gives the local date as YYYY-MM-DD", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(localDay(new Date(2026, 10, 17, 0, 0)), "2026-11-17");
});

test("it shows how many words are learned", () => {
  learnWord("cloud");
  learnWord("ant");
  recordAnswer("snow", true, TODAY);
  const [learned] = findByClass(draw(), "stat-learned");
  assert.ok(learned, "a learned figure is drawn");
  assert.equal(findByClass(learned, "stat-number")[0].textContent, "2");
  assert.ok(learned.textContent.includes(t("progress.learned")));
});

test("it shows the day streak", () => {
  recordGame("flashcards", 3, TODAY);
  const [streak] = findByClass(draw(), "stat-streak");
  assert.ok(streak, "a streak figure is drawn");
  assert.equal(findByClass(streak, "stat-number")[0].textContent, "1");
  assert.ok(streak.textContent.includes(t("progress.streak")));
});

test("it shows the best score for each game played", () => {
  recordGame("flashcards", 7, TODAY);
  recordGame("flashcards", 4, TODAY);
  recordGame("true-false", 9, TODAY);
  const rows = findByClass(draw(), "best-row");
  assert.equal(rows.length, GAME_IDS.length, "every game has a row");
  const byGame = Object.fromEntries(rows.map((row) => [row.getAttribute("data-game"), row]));
  assert.match(byGame.flashcards.textContent, /Flashcards/);
  assert.equal(findByClass(byGame.flashcards, "best-score")[0].textContent, "7");
  assert.equal(findByClass(byGame["true-false"], "best-score")[0].textContent, "9");
  assert.equal(findByClass(byGame["match-pairs"], "best-score")[0].textContent, t("progress.notPlayed"));
});

test("bestScoreRows keeps the six games in order and ignores unknown ids", () => {
  const rows = bestScoreRows({ "pick-meaning": 5, "not-a-game": 99, flashcards: 0 });
  assert.deepEqual(rows.map((row) => row.id), GAME_IDS);
  assert.equal(rows.find((row) => row.id === "pick-meaning").score, 5);
  assert.equal(rows.find((row) => row.id === "flashcards").score, 0, "a score of 0 is still a game played");
  assert.equal(rows.find((row) => row.id === "memory-flip").score, null);
  assert.deepEqual(GAME_IDS, ["flashcards", "pick-meaning", "match-pairs", "memory-flip", "word-builder", "true-false"]);
});

test("a damaged best score shows as not played", () => {
  const rows = bestScoreRows({ flashcards: "lots", "pick-meaning": -3 });
  assert.equal(rows.find((row) => row.id === "flashcards").score, null);
  assert.equal(rows.find((row) => row.id === "pick-meaning").score, null);
});

test("every word on the screen has English and Hindi", async () => {
  const { default: strings } = await import("../src/i18n/progress.js");
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
  for (const id of GAME_IDS) assert.ok(strings.en[`progress.game.${id}`] && strings.hi[`progress.game.${id}`], id);
});

test("each game's best score is named as the game names itself, in both languages", async () => {
  const { default: strings } = await import("../src/i18n/progress.js");
  for (const id of GAME_IDS) {
    const { title } = await loadGame(id);
    assert.equal(strings.en[`progress.game.${id}`], title.en, id);
    assert.equal(strings.hi[`progress.game.${id}`], title.hi, id);
  }
});

test("the screen speaks Hindi when chosen", () => {
  setLang("hi");
  recordGame("flashcards", 2, TODAY);
  const view = draw();
  assert.match(view.textContent, /फ़्लैशकार्ड/);
  assert.ok(view.textContent.includes(t("progress.streak")));
});
