import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const STORAGE_KEY = "kadh.v1";
const DAY_ONE = "2026-11-17";
const DAY_TWO = "2026-11-18";
const DAY_FOUR = "2026-11-20";

function makeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

function makeBlockedStorage() {
  const refuse = () => {
    throw new Error("SecurityError: storage is blocked");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

let reloads = 0;
// A fresh copy of the module stands in for a page reload: nothing is kept in memory.
async function loadProgress() {
  reloads += 1;
  return import(`../src/data/progress.js?reload=${reloads}`);
}

function useStorage(storage) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

function wordState(storage, wordId) {
  return JSON.parse(storage.getItem(STORAGE_KEY)).words[wordId];
}

let storage;
beforeEach(() => {
  storage = makeStorage();
  useStorage(storage);
});

test("a right answer moves a word up one box", async () => {
  const progress = await loadProgress();
  progress.recordAnswer("cloud", true, DAY_ONE);
  assert.equal(wordState(storage, "cloud").box, 2);
  progress.recordAnswer("cloud", true, DAY_ONE);
  assert.equal(wordState(storage, "cloud").box, 3);
  assert.equal(wordState(storage, "cloud").right, 2);
});

test("a word never goes above box 5", async () => {
  const progress = await loadProgress();
  for (let i = 0; i < 8; i += 1) progress.recordAnswer("cloud", true, DAY_ONE);
  assert.equal(wordState(storage, "cloud").box, 5);
});

test("a wrong answer sends a word back to box 1", async () => {
  const progress = await loadProgress();
  progress.recordAnswer("cloud", true, DAY_ONE);
  progress.recordAnswer("cloud", true, DAY_ONE);
  progress.recordAnswer("cloud", false, DAY_ONE);
  const state = wordState(storage, "cloud");
  assert.equal(state.box, 1);
  assert.equal(state.wrong, 1);
  assert.equal(state.due, DAY_ONE);
});

test("a word at box 4 or above counts as learned", async () => {
  const progress = await loadProgress();
  for (let i = 0; i < 2; i += 1) progress.recordAnswer("ant", true, DAY_ONE);
  for (let i = 0; i < 3; i += 1) progress.recordAnswer("cloud", true, DAY_ONE);
  assert.equal(progress.getStats(DAY_ONE).learned, 1);
});

test("the streak counts days in a row", async () => {
  const progress = await loadProgress();
  progress.recordAnswer("cloud", true, DAY_ONE);
  progress.recordAnswer("ant", true, DAY_ONE);
  assert.equal(progress.getStats(DAY_ONE).streak, 1);
  progress.recordGame("flashcards", 3, DAY_TWO);
  assert.equal(progress.getStats(DAY_TWO).streak, 2);
});

test("the streak starts again at 1 after a missed day", async () => {
  const progress = await loadProgress();
  progress.recordAnswer("cloud", true, DAY_ONE);
  progress.recordAnswer("cloud", true, DAY_TWO);
  assert.equal(progress.getStats(DAY_FOUR).streak, 0);
  progress.recordAnswer("cloud", true, DAY_FOUR);
  assert.equal(progress.getStats(DAY_FOUR).streak, 1);
});

test("a game keeps its best score, not its last", async () => {
  const progress = await loadProgress();
  progress.recordGame("flashcards", 7, DAY_ONE);
  progress.recordGame("flashcards", 4, DAY_ONE);
  assert.deepEqual(progress.getStats(DAY_ONE).best, { flashcards: 7 });
});

test("the chosen Kinnauri is still there after a reload", async () => {
  const first = await loadProgress();
  assert.equal(first.getSettings().dialect, null);
  first.setSettings({ dialect: "navaskad" });
  const afterReload = await loadProgress();
  assert.equal(afterReload.getSettings().dialect, "navaskad");
});

test("the chosen language is still there after a reload", async () => {
  const first = await loadProgress();
  assert.equal(first.getSettings().lang, "en");
  first.setSettings({ lang: "hi" });
  const afterReload = await loadProgress();
  assert.deepEqual(afterReload.getSettings(), { dialect: null, lang: "hi" });
});

test("an unknown Kinnauri or language is refused", async () => {
  const progress = await loadProgress();
  assert.throws(() => progress.setSettings({ dialect: "english" }), RangeError);
  assert.throws(() => progress.setSettings({ lang: "fr" }), RangeError);
});

test("a malformed date is refused", async () => {
  const progress = await loadProgress();
  assert.throws(() => progress.recordAnswer("cloud", true, "17/11/2026"), RangeError);
});

test("damaged saved progress starts afresh", async () => {
  storage.setItem(STORAGE_KEY, "{not json");
  const progress = await loadProgress();
  assert.deepEqual(progress.getSettings(), { dialect: null, lang: "en" });
  progress.recordAnswer("cloud", true, DAY_ONE);
  assert.equal(wordState(storage, "cloud").box, 2);
});

test("everything still works when the browser blocks storage", async () => {
  useStorage(makeBlockedStorage());
  const progress = await loadProgress();
  progress.setSettings({ dialect: "pahari", lang: "hi" });
  assert.deepEqual(progress.getSettings(), { dialect: "pahari", lang: "hi" });
  progress.recordAnswer("cloud", false, DAY_ONE);
  progress.recordGame("flashcards", 5, DAY_ONE);
  const stats = progress.getStats(DAY_ONE);
  assert.equal(stats.streak, 1);
  assert.deepEqual(stats.best, { flashcards: 5 });
  assert.deepEqual(progress.dueWords([{ id: "cloud" }], DAY_ONE, 5).map((w) => w.id), ["cloud"]);
});

test("everything still works when there is no storage at all", async () => {
  useStorage(undefined);
  const progress = await loadProgress();
  progress.setSettings({ dialect: "hamskad" });
  assert.equal(progress.getSettings().dialect, "hamskad");
});

test("due words come back earliest first, only once due, at most n", async () => {
  const progress = await loadProgress();
  const words = [{ id: "cloud" }, { id: "ant" }, { id: "sun" }, { id: "never-seen" }];
  progress.recordAnswer("cloud", true, DAY_ONE); // box 2, due two days later
  progress.recordAnswer("ant", false, DAY_ONE); // box 1, due at once
  progress.recordAnswer("sun", false, DAY_TWO);
  assert.deepEqual(progress.dueWords(words, DAY_ONE, 10).map((w) => w.id), ["ant"]);
  assert.deepEqual(progress.dueWords(words, DAY_FOUR, 10).map((w) => w.id), ["ant", "sun", "cloud"]);
  assert.deepEqual(progress.dueWords(words, DAY_FOUR, 2).map((w) => w.id), ["ant", "sun"]);
});
