import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import game, { makePair, isRightAnswer, secondsLeft, mountRush, ROUND_SECONDS } from "../src/games/true-false.js";
import { checkGame } from "../src/games/index.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton } from "./fake-dom.js";

function word(id, hi = `${id}-hi`) {
  return { id, en: id, hi, dialects: { pahari: { text: `${id}-k`, forms: [`${id}-k`, `${id}-k2`] } }, topic: "nature" };
}

const WORDS = [word("cloud"), word("snow"), word("river", ""), word("tree")];

// A random source that walks through the given numbers, round and round.
function sequence(...numbers) {
  let i = 0;
  return () => numbers[i++ % numbers.length];
}

// A clock the test moves by hand, so a 60 second round runs at once.
function makeFakeClock() {
  const timers = new Map();
  let time = 0;
  let nextId = 1;
  return {
    timers,
    now: () => time,
    setInterval: (fn, ms) => (timers.set(nextId, { fn, ms }), nextId++),
    clearInterval: (id) => timers.delete(id),
    advance(ms) {
      for (let passed = 0; passed < ms; passed += 250) {
        time += 250;
        for (const { fn } of [...timers.values()]) fn();
      }
    },
  };
}

function fakeKeyboard(doc) {
  doc.keyListeners = [];
  doc.addEventListener = (type, fn) => type === "keydown" && doc.keyListeners.push(fn);
  doc.removeEventListener = (type, fn) => (doc.keyListeners = doc.keyListeners.filter((f) => f !== fn));
  doc.press = (key) => doc.keyListeners.forEach((fn) => fn({ key, preventDefault() {} }));
}

function play({ rng = sequence(0.1, 0.2, 0.7, 0.4), lang = "en" } = {}) {
  const doc = makeFakeDocument();
  fakeKeyboard(doc);
  const el = doc.createElement("div");
  const answers = [];
  const finishes = [];
  const clock = makeFakeClock();
  const context = {
    words: WORDS, dialect: "pahari", lang, t, today: "2026-11-17",
    onAnswer: (id, correct) => answers.push({ id, correct }),
    onFinish: (result) => finishes.push(result),
  };
  const unmount = mountRush(el, context, { clock, rng });
  return { doc, el, answers, finishes, clock, unmount };
}

const shownWord = (el) => findByClass(el, "tf-word")[0].textContent;
const shownMeaning = (el) => findByClass(el, "tf-meaning")[0].textContent;
const timerText = (el) => findByClass(el, "tf-seconds")[0].textContent;
const card = (el) => findByClass(el, "tf-card")[0];

beforeEach(async () => {
  setLang("en");
  await loadStrings();
});

test("the game keeps the J3 contract", () => {
  assert.doesNotThrow(() => checkGame(game, "true-false"));
  assert.ok(game.minWords >= 2);
});

test("a true pair shows a word with its own meaning", () => {
  const pair = makePair(WORDS, { dialect: "pahari", lang: "en", rng: sequence(0.1, 0.1) });
  assert.equal(pair.isTrue, true);
  assert.equal(pair.meaning, pair.word.en);
  assert.equal(pair.form, `${pair.word.id}-k`);
});

test("a false pair shows another word's meaning, never the word's own", () => {
  for (let i = 0; i < 20; i++) {
    const pair = makePair(WORDS, { dialect: "pahari", lang: "en", rng: sequence(i / 20, 0.9, i / 20) });
    assert.equal(pair.isTrue, false);
    assert.notEqual(pair.meaning, pair.word.en);
  }
});

test("a false pair never uses a meaning that equals the word's own", () => {
  const twins = [word("snow"), { ...word("snow2"), en: "snow" }, word("rain")];
  for (let i = 0; i < 10; i++) {
    const pair = makePair(twins, { dialect: "pahari", lang: "en", rng: sequence(0, 0.9, i / 10) });
    assert.equal(pair.meaning, "rain");
  }
});

test("about half the pairs are true", () => {
  let trues = 0;
  for (let i = 0; i < 400; i++) if (makePair(WORDS, { dialect: "pahari", lang: "en" }).isTrue) trues++;
  assert.ok(trues > 140 && trues < 260, `${trues} of 400 true`);
});

test("the meaning is Hindi in Hindi, English when the Hindi is empty", () => {
  const hindi = makePair([WORDS[0]], { dialect: "pahari", lang: "hi", rng: sequence(0, 0.1) });
  assert.equal(hindi.meaning, "cloud-hi");
  const blank = makePair([WORDS[2]], { dialect: "pahari", lang: "hi", rng: sequence(0, 0.1) });
  assert.equal(blank.meaning, "river");
});

test("a word without a second meaning to borrow is always shown true", () => {
  const pair = makePair([WORDS[0]], { dialect: "pahari", lang: "en", rng: sequence(0, 0.9) });
  assert.equal(pair.isTrue, true);
});

test("an answer is right when it matches the pair", () => {
  assert.equal(isRightAnswer({ isTrue: true }, true), true);
  assert.equal(isRightAnswer({ isTrue: false }, false), true);
  assert.equal(isRightAnswer({ isTrue: true }, false), false);
  assert.equal(isRightAnswer({ isTrue: false }, true), false);
});

test("seconds left counts down from 60 and stops at 0", () => {
  assert.equal(ROUND_SECONDS, 60);
  assert.equal(secondsLeft(0, 0), 60);
  assert.equal(secondsLeft(0, 999), 60);
  assert.equal(secondsLeft(0, 1000), 59);
  assert.equal(secondsLeft(0, 59_999), 1);
  assert.equal(secondsLeft(0, 60_000), 0);
  assert.equal(secondsLeft(0, 90_000), 0);
});

test("the timer shows 60 at the start and counts down", () => {
  const { el, clock } = play();
  assert.equal(timerText(el), "60");
  clock.advance(1000);
  assert.equal(timerText(el), "59");
  clock.advance(29_000);
  assert.equal(timerText(el), "30");
});

test("a pair appears at once and the next one right after an answer", () => {
  const { el, answers } = play();
  assert.ok(shownWord(el).endsWith("-k"));
  assert.ok(shownMeaning(el));
  const firstCard = card(el);
  findButton(el, t("tf.true")).click();
  assert.equal(answers.length, 1);
  assert.notEqual(card(el), firstCard, "a fresh card for the next pair");
  assert.ok(shownWord(el).endsWith("-k"));
});

test("each answer flashes right or wrong and is reported to the kit", () => {
  // 0.1: word cloud, 0.2: true pair; then the next pair.
  const { el, answers } = play({ rng: sequence(0.1, 0.2) });
  findButton(el, t("tf.true")).click();
  assert.deepEqual(answers[0], { id: "cloud", correct: true });
  assert.ok(card(el).className.includes("tf-flash-right"));
  findButton(el, t("tf.false")).click();
  assert.equal(answers[1].correct, false);
  assert.ok(card(el).className.includes("tf-flash-wrong"));
  assert.ok(findByClass(el, "tf-feedback")[0].textContent.includes("cloud"), "a wrong answer shows the real meaning");
});

test("the arrow keys answer: right is True, left is False", () => {
  const { doc, answers } = play({ rng: sequence(0.1, 0.2) });
  doc.press("ArrowRight");
  doc.press("ArrowLeft");
  doc.press("Enter");
  assert.deepEqual(answers.map((a) => a.correct), [true, false]);
});

test("the game ends at 0 with the score out of every pair shown", () => {
  const { el, clock, finishes, doc, answers } = play({ rng: sequence(0.1, 0.2) });
  findButton(el, t("tf.true")).click();
  findButton(el, t("tf.true")).click();
  findButton(el, t("tf.false")).click();
  clock.advance(59_750);
  assert.equal(finishes.length, 0, "not over before 0");
  clock.advance(250);
  // Three answered (two right) and a fourth on screen when time ran out.
  assert.deepEqual(finishes, [{ score: 2, total: 4 }]);
  assert.equal(clock.timers.size, 0, "the timer stops");
  doc.press("ArrowRight");
  assert.equal(answers.length, 3, "no answers after the end");
});

test("unmount stops the timer and the keys", () => {
  const { clock, doc, unmount, finishes, answers } = play();
  unmount();
  assert.equal(clock.timers.size, 0);
  assert.equal(doc.keyListeners.length, 0);
  clock.advance(61_000);
  doc.press("ArrowRight");
  assert.equal(finishes.length, 0);
  assert.equal(answers.length, 0);
});

test("the play area speaks Hindi", async () => {
  setLang("hi");
  const { el } = play({ lang: "hi" });
  assert.ok(findButton(el, "सही"));
  assert.ok(findButton(el, "गलत"));
});
