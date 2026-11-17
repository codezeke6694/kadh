import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import game, { splitSyllables, isPlayable, makeRound, shuffleSyllables, isRightOrder, ROUND_SIZE } from "../src/games/word-builder.js";
import { checkGame } from "../src/games/index.js";
import { parseCsv, toWords } from "../src/data/words.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton } from "./fake-dom.js";

function word(id, form, { hi = `${id}-hi`, forms = [form] } = {}) {
  return { id, en: id, hi, dialects: { pahari: { text: form, forms } }, topic: "nature" };
}

const WORDS = [
  word("goat", "बोस्पा"),
  word("fall", "मुन्न"),
  word("sun", "ञिमा क्योद"),
  word("tree", "शुब्चो", { forms: ["शुब्चो", "शुबचो"] }),
  word("one", "ती"),
];

// A fixed rng: always the first choice, so a shuffle is a known rotation.
const firstPick = () => 0;

beforeEach(async () => {
  setLang("en");
  await loadStrings();
});

test("the game keeps the J3 contract", () => {
  assert.doesNotThrow(() => checkGame(game, "word-builder"));
});

test("a Devanagari letter is never split from its vowel sign", () => {
  assert.deepEqual(splitSyllables("मानुष"), ["मा", "नु", "ष"]);
  assert.deepEqual(splitSyllables("छेल्डू"), ["छे", "ल्डू"]);
  assert.deepEqual(splitSyllables("छ़ेस्मी"), ["छ़े", "स्मी"]);
});

test("a consonant joined by a virama stays with the letter after it", () => {
  assert.deepEqual(splitSyllables("मुन्न"), ["मु", "न्न"]);
  assert.deepEqual(splitSyllables("बोस्पा"), ["बो", "स्पा"]);
  assert.deepEqual(splitSyllables("बान्नोस्या"), ["बा", "न्नो", "स्या"]);
  assert.deepEqual(splitSyllables("स्का"), ["स्का"]);
  assert.deepEqual(splitSyllables("छेक्याम्"), ["छे", "क्याम्"]);
  assert.deepEqual(splitSyllables("क्"), ["क्"]);
  assert.deepEqual(splitSyllables("सोरगङ्ग"), ["सो", "र", "ग", "ङ्ग"]);
});

test("spaces and marks between words are not pieces", () => {
  assert.deepEqual(splitSyllables("ञिमा क्योद"), ["ञि", "मा", "क्यो", "द"]);
  assert.deepEqual(splitSyllables("जुरा- बान"), ["जु", "रा", "बा", "न"]);
  assert.deepEqual(splitSyllables(""), []);
});

test("every real sheet word splits into pieces that join back into the word, never a lone half letter", () => {
  const csv = readFileSync(new URL("../data/sheet.csv", import.meta.url), "utf8");
  const forms = toWords(parseCsv(csv), {}).flatMap((w) => Object.values(w.dialects).map((d) => d.forms[0]));
  assert.ok(forms.length > 100);
  for (const form of forms) {
    const pieces = splitSyllables(form);
    assert.equal(pieces.join(""), form.replace(/[^\p{L}\p{M}]/gu, ""), form);
    for (const piece of pieces) {
      const halfLetter = /^\p{L}\p{M}*्$/u.test(piece);
      assert.ok(!halfLetter || pieces.length === 1, `${form}: ${piece} is a lone half letter`);
      assert.ok(!/^\p{M}/u.test(piece), `${form}: ${piece} starts with a sign`);
    }
  }
});

test("only words of two or more syllables are played", () => {
  assert.equal(isPlayable(word("x", "ती"), "pahari"), false);
  assert.equal(isPlayable(word("x", "स्का"), "pahari"), false);
  assert.equal(isPlayable(word("x", "मुन्न"), "pahari"), true);
  assert.equal(isPlayable({ id: "x", en: "x", hi: "", dialects: {} }, "pahari"), false);
});

test("a round takes up to ROUND_SIZE playable words, each once", () => {
  const round = makeRound(WORDS, "pahari", ROUND_SIZE, Math.random);
  assert.deepEqual(round.map((w) => w.id).sort(), ["fall", "goat", "sun", "tree"]);
  assert.equal(makeRound(WORDS, "pahari", 2, Math.random).length, 2);
  assert.deepEqual(makeRound([], "pahari", 5, Math.random), []);
});

test("shuffled syllables are never already in the right order when another order exists", () => {
  for (let i = 0; i < 50; i++) {
    const shuffled = shuffleSyllables(["बा", "न्नो", "स्या"], Math.random);
    assert.notDeepEqual(shuffled, ["बा", "न्नो", "स्या"]);
    assert.deepEqual([...shuffled].sort(), ["बा", "न्नो", "स्या"].sort());
  }
  assert.deepEqual(shuffleSyllables(["ला", "ला"], Math.random), ["ला", "ला"]);
});

test("the right order is any form of the word", () => {
  const tree = WORDS[3];
  assert.equal(isRightOrder(["शु", "ब्चो"], tree, "pahari"), true);
  assert.equal(isRightOrder(["शु", "ब", "चो"], tree, "pahari"), true);
  assert.equal(isRightOrder(["ब्चो", "शु"], tree, "pahari"), false);
  assert.equal(isRightOrder(["ञि", "मा", "क्यो", "द"], WORDS[2], "pahari"), true);
});

function play(words = WORDS.slice(0, 2), lang = "en") {
  const doc = makeFakeDocument();
  const el = doc.createElement("div");
  // The fake document has no removeEventListener; this one lets the test see the clean-up.
  el.removeEventListener = (type, fn) => (el.listeners[type] = el.listeners[type].filter((f) => f !== fn));
  const answers = [];
  const finished = [];
  const unmount = game.mount(el, {
    words, dialect: "pahari", lang, t, today: "2026-11-17",
    onAnswer: (id, correct) => answers.push([id, correct]),
    onFinish: (result) => finished.push(result),
  }, firstPick);
  return { el, answers, finished, unmount };
}

const pool = (el) => findByClass(el, "wb-pool")[0].children;
const placed = (el) => findByClass(el, "wb-answer")[0].children;
const texts = (tiles) => tiles.map((tile) => tile.textContent);
const meaning = (el) => findByClass(el, "wb-meaning")[0].textContent;

// Taps the pool tiles in the word's own order.
function build(el, syllables) {
  for (const syllable of syllables) pool(el).find((tile) => tile.textContent === syllable).click();
}

test("the meaning is shown with the word's syllables shuffled in the pool", () => {
  const { el } = play();
  assert.ok(["goat", "fall"].includes(meaning(el)));
  assert.equal(pool(el).length, 2);
  assert.equal(placed(el).length, 0);
});

test("the meaning follows the chosen language, English when Hindi is empty", () => {
  setLang("hi");
  const { el } = play([word("goat", "बोस्पा", { hi: "बकरी" })], "hi");
  assert.equal(meaning(el), "बकरी");
  const { el: other } = play([word("goat", "बोस्पा", { hi: "" })], "hi");
  assert.equal(meaning(other), "goat");
});

test("tapping a syllable places it; tapping a placed syllable sends it back", () => {
  const { el } = play([WORDS[1]]);
  pool(el)[0].click();
  assert.equal(placed(el).length, 1);
  assert.equal(pool(el).length, 1);
  placed(el)[0].click();
  assert.equal(placed(el).length, 0);
  assert.equal(pool(el).length, 2);
});

test("the syllables in the right order are marked correct and counted right", () => {
  const { el, answers } = play([WORDS[1]]);
  build(el, ["मु", "न्न"]);
  assert.ok(findByClass(el, "wb-right").length > 0);
  assert.match(el.textContent, /Well done/);
  assert.deepEqual(answers, [["fall", true]]);
});

test("a wrong order says so kindly and lets the learner fix it, but counts as wrong", () => {
  const { el, answers } = play([WORDS[1]]);
  build(el, ["न्न", "मु"]);
  assert.equal(findByClass(el, "wb-right").length, 0);
  assert.match(el.textContent, /Not quite/);
  assert.deepEqual(answers, []);
  placed(el)[0].click();
  placed(el)[0].click();
  build(el, ["मु", "न्न"]);
  assert.deepEqual(answers, [["fall", false]]);
});

test("Show me reveals the word and counts it as wrong", () => {
  const { el, answers } = play([WORDS[0]]);
  findButton(el, "Show me").click();
  assert.deepEqual(texts(placed(el)), ["बो", "स्पा"]);
  assert.equal(pool(el).length, 0);
  assert.deepEqual(answers, [["goat", false]]);
  assert.equal(findButton(el, "Show me"), undefined);
});

test("after the last word the round finishes with the score", () => {
  const { el, finished } = play(WORDS.slice(0, 2));
  const first = meaning(el) === "goat" ? ["बो", "स्पा"] : ["मु", "न्न"];
  const second = meaning(el) === "goat" ? "fall" : "goat";
  build(el, first);
  findButton(el, "Next").click();
  assert.equal(meaning(el), second);
  findButton(el, "Show me").click();
  findButton(el, "See my score").click();
  assert.deepEqual(finished, [{ score: 1, total: 2 }]);
});

test("Backspace sends the last placed syllable back; the listener goes on unmount", () => {
  const { el, unmount } = play([WORDS[1]]);
  pool(el)[0].click();
  for (const fn of el.listeners.keydown) fn({ key: "Backspace", preventDefault() {} });
  assert.equal(placed(el).length, 0);
  unmount();
  assert.equal(el.listeners.keydown?.length ?? 0, 0);
});

test("a topic without a word of two syllables says so instead of playing", () => {
  const { el, finished } = play([WORDS[4]]);
  assert.match(el.textContent, /no words long enough/i);
  assert.deepEqual(finished, []);
});
