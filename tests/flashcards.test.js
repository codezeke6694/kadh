import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import flashcards, { makeDeck, startDeck, answerCard, DECK_SIZE, MAX_RETURNS } from "../src/games/flashcards.js";
import { checkGame } from "../src/games/index.js";
import render from "../src/games/kit.js";
import { recordAnswer } from "../src/data/progress.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton, useFakeStorage } from "./fake-dom.js";

const TODAY = "2026-11-17";
const firstPick = () => 0;

function word(id, hi = `${id}-hi`) {
  return { id, en: id, hi, topic: "nature", dialects: { pahari: { text: `${id}-k`, forms: [`${id}-k`, `${id}-k2`] } } };
}

const twelve = () => Array.from({ length: 12 }, (_, i) => word(`w${i}`));

function mountGame({ words = twelve().slice(0, 4), lang = "en" } = {}) {
  const doc = makeFakeDocument();
  const el = doc.createElement("div");
  const answers = [];
  const finishes = [];
  const unmount = flashcards.mount(el, {
    words, dialect: "pahari", lang, t, today: TODAY,
    onAnswer: (id, correct) => answers.push([id, correct]),
    onFinish: (result) => finishes.push(result),
  });
  return { el, answers, finishes, unmount };
}

const frontText = (el) => findByClass(el, "fc-kinnauri")[0].textContent;
const meaningText = (el) => findByClass(el, "fc-meaning")[0].textContent;
const card = (el) => findByClass(el, "fc-card")[0];

function answer(el, knew) {
  card(el).click();
  findButton(el, t(knew ? "flashcards.knew" : "flashcards.learning")).click();
}

beforeEach(async () => {
  useFakeStorage();
  setLang("en");
  await loadStrings();
});

test("flashcards keeps the J3 game contract", () => {
  assert.doesNotThrow(() => checkGame(flashcards, "flashcards"));
});

test("a deck holds 10 words, words due for review first", () => {
  const words = twelve();
  recordAnswer("w9", false, TODAY);
  recordAnswer("w11", false, "2026-11-10");
  const deck = makeDeck(words, TODAY, DECK_SIZE, firstPick);
  assert.equal(DECK_SIZE, 10);
  assert.equal(deck.length, 10);
  assert.deepEqual(deck.slice(0, 2).map((w) => w.id), ["w11", "w9"]);
  assert.equal(new Set(deck.map((w) => w.id)).size, 10);
});

test("a deck from fewer words than its size holds each word once; none gives an empty deck", () => {
  assert.equal(makeDeck(twelve().slice(0, 4), TODAY).length, 4);
  assert.deepEqual(makeDeck([], TODAY), []);
});

test("I knew it scores a word the first time; Still learning sends it to the back", () => {
  let state = startDeck([word("a"), word("b"), word("c")]);
  state = answerCard(state, false);
  assert.deepEqual(state.queue.map((card) => card.word.id), ["b", "c", "a"]);
  state = answerCard(answerCard(state, true), true);
  state = answerCard(state, true);
  assert.equal(state.queue.length, 0);
  assert.deepEqual({ score: state.score, total: state.total }, { score: 2, total: 3 });
});

test("a word comes back at most MAX_RETURNS times, so a deck always ends", () => {
  let state = startDeck([word("a")]);
  for (let i = 0; i < MAX_RETURNS; i++) state = answerCard(state, false);
  assert.equal(state.queue.length, 1);
  state = answerCard(state, false);
  assert.equal(state.queue.length, 0);
  assert.equal(state.score, 0);
});

test("the card shows the Kinnauri word; tapping it flips to the meaning", () => {
  const { el } = mountGame({ words: [word("snow")] });
  assert.equal(frontText(el), "snow-k");
  assert.ok(!card(el).className.includes("fc-flipped"));
  assert.equal(findButton(el, t("flashcards.knew")), undefined);
  card(el).click();
  assert.ok(card(el).className.includes("fc-flipped"));
  assert.equal(meaningText(el), "snow");
  assert.ok(findButton(el, t("flashcards.knew")));
});

test("the meaning is in Hindi when chosen, English when the Hindi is missing", () => {
  assert.equal(meaningText(mountGame({ words: [word("snow", "बर्फ़")], lang: "hi" }).el), "बर्फ़");
  assert.equal(meaningText(mountGame({ words: [word("snow", "")], lang: "hi" }).el), "snow");
});

test("Still learning brings the word back later in the same deck", () => {
  const { el, answers } = mountGame({ words: [word("a"), word("b")] });
  const first = frontText(el);
  answer(el, false);
  assert.notEqual(frontText(el), first);
  answer(el, true);
  assert.equal(frontText(el), first);
  assert.deepEqual(answers.map(([, correct]) => correct), [false, true]);
});

test("the deck finishes with how many were known out of the deck", () => {
  const { el, finishes, answers } = mountGame({ words: [word("a"), word("b"), word("c")] });
  answer(el, true);
  answer(el, false);
  answer(el, true);
  answer(el, true);
  assert.deepEqual(finishes, [{ score: 2, total: 3 }]);
  assert.equal(answers.length, 4);
});

test("keys: 1 is Still learning, 2 is I knew it, only once flipped; none after unmount", () => {
  const { el, answers, unmount } = mountGame({ words: [word("a"), word("b")] });
  const press = (key) => el.listeners.keydown.forEach((fn) => fn({ key, preventDefault() {} }));
  press("2");
  assert.equal(answers.length, 0, "no answer before the card is flipped");
  card(el).click();
  press("2");
  assert.deepEqual(answers.map(([, correct]) => correct), [true]);
  card(el).click();
  unmount();
  press("1");
  assert.equal(answers.length, 1);
});

test("in the kit, the results screen shows known out of the deck", async () => {
  const doc = makeFakeDocument();
  const el = doc.createElement("main");
  const ctx = { words: twelve(), settings: { dialect: "pahari", lang: "en" }, t, go() {}, params: { gameId: "flashcards", topic: "all" } };
  await render(el, ctx, { loadGame: async () => flashcards, loadTopics: async () => [] });
  answer(el, false);
  for (let i = 0; i < 10; i++) answer(el, true);
  assert.equal(findByClass(el, "kit-score")[0].textContent, "9");
  assert.equal(findByClass(el, "kit-total")[0].textContent, "/ 10");
});
