import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GAME_IDS, loadGame, checkGame } from "../src/games/index.js";
import render, { topicChoices, todayText, ALL_WORDS } from "../src/games/kit.js";
import { loadTopics } from "../src/data/load.js";
import { getStats } from "../src/data/progress.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton, useFakeStorage, allElements } from "./fake-dom.js";

const TOPICS = [
  { id: "nature", en: "Nature", hi: "प्रकृति", icon: "🏔️" },
  { id: "animals", en: "Animals", hi: "जानवर", icon: "🐐" },
  { id: "food", en: "Food", hi: "खाना", icon: "🍎" },
];

function word(id, topic, dialects = ["pahari"]) {
  const entries = dialects.map((dialect) => [dialect, { text: `${id}-k`, forms: [`${id}-k`] }]);
  return { id, en: id, hi: `${id}-hi`, dialects: Object.fromEntries(entries), topic };
}

// Nature has 4 Pahari words, Animals 3, Food 4 but only one in Pahari.
const WORDS = [
  word("cloud", "nature"), word("snow", "nature"), word("river", "nature"), word("tree", "nature"),
  word("goat", "animals"), word("dog", "animals"), word("cow", "animals"),
  word("apple", "food"), word("rice", "food", ["hamskad"]), word("milk", "food", ["hamskad"]),
  word("bread", "food", ["hamskad"]),
];

// A game that only records what the kit hands it.
function makeFakeGame(id, minWords = 4) {
  const game = {
    id,
    title: { en: "Fake game", hi: "नकली खेल" },
    blurb: { en: "A game for tests.", hi: "जाँच का खेल।" },
    icon: "🎲",
    minWords,
    mounts: [],
    unmounts: 0,
    mount(el, context) {
      game.mounts.push(context);
      el.textContent = "playing";
      return () => (game.unmounts += 1);
    },
  };
  return game;
}

async function open(game, { gameId = game?.id, lang = "en" } = {}) {
  const doc = makeFakeDocument();
  const el = doc.createElement("main");
  const gone = [];
  const ctx = {
    words: WORDS,
    settings: { dialect: "pahari", lang },
    t,
    go: (hash) => gone.push(hash),
    params: { gameId },
  };
  const sources = { loadGame: async () => game, loadTopics: async () => TOPICS };
  const cleanup = await render(el, ctx, sources);
  return { doc, el, gone, cleanup };
}

const topicButtons = (el) => findByClass(el, "kit-topic");

beforeEach(async () => {
  useFakeStorage();
  setLang("en");
  await loadStrings();
});

test("the kit lists the six games of J3", () => {
  assert.deepEqual(GAME_IDS, ["flashcards", "pick-meaning", "match-pairs", "memory-flip", "word-builder", "true-false"]);
});

test("each game file is either not built yet or keeps the J3 contract", async () => {
  for (const id of GAME_IDS) {
    const game = await loadGame(id);
    if (game) assert.doesNotThrow(() => checkGame(game, id), id);
  }
});

test("an unknown game id is refused", async () => {
  await assert.rejects(loadGame("chess"), RangeError);
});

test("a game module missing part of the J3 contract is named with what it misses", () => {
  const game = makeFakeGame("flashcards");
  assert.doesNotThrow(() => checkGame(game, "flashcards"));
  assert.throws(() => checkGame({ ...game, mount: undefined }, "flashcards"), /flashcards\.js.*mount/);
  assert.throws(() => checkGame({ ...game, minWords: 0 }, "flashcards"), /minWords/);
  assert.throws(() => checkGame({ ...game, id: "other" }, "flashcards"), /id/);
  assert.throws(() => checkGame({ ...game, title: { en: "Only English" } }, "flashcards"), /title/);
  assert.throws(() => checkGame(null, "flashcards"), /default export/);
});

test("topic choices: All words first, then each topic with at least minWords words", () => {
  const pahari = WORDS.filter((w) => w.dialects.pahari);
  const choices = topicChoices(pahari, TOPICS, 4);
  assert.deepEqual(choices.map((c) => c.id), [ALL_WORDS, "nature"]);
  assert.equal(choices[0].words.length, pahari.length);
  assert.equal(choices[1].words.length, 4);
  assert.deepEqual(topicChoices(pahari, TOPICS, 3).map((c) => c.id), [ALL_WORDS, "nature", "animals"]);
});

test("too few words for the game leaves no choice at all", () => {
  assert.deepEqual(topicChoices(WORDS.slice(0, 3), TOPICS, 4), []);
  assert.deepEqual(topicChoices([], TOPICS, 1), []);
});

test("a game opens with a topic picker that offers All words", async () => {
  const { el } = await open(makeFakeGame("flashcards"));
  const buttons = topicButtons(el);
  assert.match(buttons[0].textContent, /All words/);
  assert.match(buttons[0].textContent, /8/);
  assert.match(el.textContent, /Fake game/);
});

test("the topic picker offers each topic with enough words for that game, in the chosen Kinnauri", async () => {
  const { el } = await open(makeFakeGame("flashcards"));
  const names = topicButtons(el).map((button) => button.textContent);
  assert.equal(names.length, 2);
  assert.match(names[1], /Nature/);
  assert.ok(!names.some((name) => /Animals|Food/.test(name)));
});

test("the picker speaks the chosen language", async () => {
  setLang("hi");
  const { el } = await open(makeFakeGame("flashcards"), { lang: "hi" });
  assert.match(el.textContent, /नकली खेल/);
  assert.match(topicButtons(el)[1].textContent, /प्रकृति/);
});

test("too few words in this Kinnauri says so and offers the way home", async () => {
  const { el } = await open(makeFakeGame("flashcards", 50));
  assert.equal(topicButtons(el).length, 0);
  assert.match(el.textContent, /Not enough words/);
  assert.equal(findButton(el, "Back home").getAttribute("href"), "#/");
});

test("choosing a topic mounts the game with that topic's words, the Kinnauri and the day", async () => {
  const game = makeFakeGame("flashcards");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  assert.equal(game.mounts.length, 1);
  const context = game.mounts[0];
  assert.deepEqual(context.words.map((w) => w.id), ["cloud", "snow", "river", "tree"]);
  assert.equal(context.dialect, "pahari");
  assert.equal(context.lang, "en");
  assert.equal(context.today, todayText(new Date()));
  assert.equal(typeof context.t, "function");
  assert.match(el.textContent, /playing/);
});

test("every answer the game gives is kept in progress", async () => {
  const game = makeFakeGame("pick-meaning");
  const { el } = await open(game);
  topicButtons(el)[0].click();
  game.mounts[0].onAnswer("cloud", true);
  const saved = JSON.parse(globalThis.localStorage.getItem("kadh.v1"));
  assert.deepEqual({ right: saved.words.cloud.right, box: saved.words.cloud.box }, { right: 1, box: 2 });
});

test("after a game the results screen shows the score and unmounts the game", async () => {
  const game = makeFakeGame("match-pairs");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  game.mounts[0].onFinish({ score: 3, total: 4 });
  assert.equal(game.unmounts, 1);
  assert.equal(findByClass(el, "kit-score")[0].textContent, "3");
  assert.match(findByClass(el, "kit-total")[0].textContent, /4/);
  assert.equal(getStats(todayText(new Date())).best["match-pairs"], 3);
});

test("the results screen shows the best score for that game", async () => {
  const game = makeFakeGame("memory-flip");
  const { el } = await open(game);
  topicButtons(el)[0].click();
  game.mounts[0].onFinish({ score: 7, total: 10 });
  assert.match(findByClass(el, "kit-best")[0].textContent, /7/);
  assert.equal(findByClass(el, "kit-new-best").length, 1);

  findButton(el, "Play again").click();
  game.mounts[1].onFinish({ score: 5, total: 10 });
  assert.equal(findByClass(el, "kit-score")[0].textContent, "5");
  assert.match(findByClass(el, "kit-best")[0].textContent, /7/);
  assert.equal(findByClass(el, "kit-new-best").length, 0);
});

test("Play again starts the same game with the same topic", async () => {
  const game = makeFakeGame("word-builder");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  game.mounts[0].onFinish({ score: 1, total: 4 });
  findButton(el, "Play again").click();
  assert.equal(game.mounts.length, 2);
  assert.deepEqual(game.mounts[1].words, game.mounts[0].words);
});

test("the results lead to other words or back home", async () => {
  const game = makeFakeGame("true-false");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  game.mounts[0].onFinish({ score: 2, total: 4 });
  assert.equal(findButton(el, "Back home").getAttribute("href"), "#/");
  findButton(el, "Choose other words").click();
  assert.equal(topicButtons(el).length, 2);
});

test("a game that finishes twice is counted once", async () => {
  const game = makeFakeGame("flashcards");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  game.mounts[0].onFinish({ score: 1, total: 4 });
  game.mounts[0].onFinish({ score: 4, total: 4 });
  assert.equal(findByClass(el, "kit-score")[0].textContent, "1");
  assert.equal(game.unmounts, 1);
});

test("a score that is not a whole number from 0 to total is the game's bug, named", async () => {
  const game = makeFakeGame("flashcards");
  const { el } = await open(game);
  topicButtons(el)[1].click();
  assert.throws(() => game.mounts[0].onFinish({ score: 5, total: 4 }), /flashcards.*score/);
  assert.throws(() => game.mounts[0].onFinish({ score: -1, total: 4 }), /score/);
  assert.throws(() => game.mounts[0].onFinish({}), /score/);
});

test("leaving the screen mid-game unmounts the game", async () => {
  const game = makeFakeGame("flashcards");
  const { el, cleanup } = await open(game);
  topicButtons(el)[1].click();
  cleanup();
  assert.equal(game.unmounts, 1);
});

test("a game's own stylesheet is linked once", async () => {
  const game = makeFakeGame("pick-meaning");
  const { el, doc } = await open(game);
  topicButtons(el)[0].click();
  findButton(el, "Choose other words").click();
  topicButtons(el)[0].click();
  const links = allElements(doc.head).filter((node) => node.tagName === "LINK");
  assert.equal(links.length, 1);
  assert.match(links[0].getAttribute("href"), /games\/pick-meaning\.css$/);
});

test("a game not built yet shows coming soon with a way home", async () => {
  const { el } = await open(null, { gameId: "flashcards" });
  assert.match(el.textContent, /still being built/);
  assert.equal(findButton(el, "Back home").getAttribute("href"), "#/");
});

test("an unknown game shows not found", async () => {
  const { el } = await open(null, { gameId: "chess" });
  assert.match(el.textContent, /can't find that page/);
});

test("today is the learner's local date as YYYY-MM-DD", () => {
  assert.equal(todayText(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("loadTopics reads the topic list of J5, and gives none when it cannot", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ topics: TOPICS, words: {} }) });
    assert.deepEqual(await loadTopics(), TOPICS);
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    assert.deepEqual(await loadTopics(), []);
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    assert.deepEqual(await loadTopics(), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});
