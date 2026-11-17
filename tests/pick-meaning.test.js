import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import game, { makeRound, meaningOf, ROUND_LENGTH, CHOICE_COUNT, REVERSE_EVERY } from "../src/games/pick-meaning.js";
import { checkGame } from "../src/games/index.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, allElements } from "./fake-dom.js";

function word(id, topic, forms, { hi = `${id}-hi`, en = id } = {}) {
  return { id, en, hi, dialects: { pahari: { text: forms.join(" / "), forms } }, topic };
}

const NATURE = ["cloud", "snow", "river", "tree", "rain"].map((id) => word(id, "nature", [`${id}-k`]));
const ANIMALS = ["goat", "dog", "cow", "yak"].map((id) => word(id, "animals", [`${id}-k`]));
const WORDS = [...NATURE, ...ANIMALS];

// A seeded random source, so every run of a test plays the same round.
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const round = (words, options = {}) => makeRound(words, { dialect: "pahari", lang: "en", rng: seeded(options.seed), ...options });

beforeEach(async () => {
  setLang("en");
  await loadStrings();
});

test("the game keeps the J3 contract", () => {
  assert.doesNotThrow(() => checkGame(game, "pick-meaning"));
  assert.ok(game.minWords >= CHOICE_COUNT);
});

test("a round has ten questions, even from a topic of four words", () => {
  assert.equal(ROUND_LENGTH, 10);
  assert.equal(round(WORDS).length, 10);
  assert.equal(round(ANIMALS).length, 10);
});

test("each question has four different choices and exactly one right answer", () => {
  for (let seed = 1; seed < 40; seed += 1) {
    for (const question of round(WORDS, { seed })) {
      assert.equal(question.choices.length, CHOICE_COUNT);
      assert.equal(new Set(question.choices).size, CHOICE_COUNT);
      const asked = WORDS.find((w) => w.id === question.wordId);
      const rightText = question.reverse ? asked.dialects.pahari.forms[0] : asked.en;
      assert.equal(question.choices[question.answer], rightText);
      assert.equal(question.choices.filter((choice) => choice === rightText).length, 1);
    }
  }
});

test("two sheet words with the same meaning, or the same Kinnauri, never make a second right answer", () => {
  const words = [
    word("stone", "nature", ["दोग"], { en: "Stone" }),
    word("rock", "nature", ["पाथर"], { en: "Stone" }),
    word("hill", "nature", ["दोग", "धार"]),
    word("water", "nature", ["ती"]),
    word("fire", "nature", ["मे"]),
    word("sun", "nature", ["ञ्युमा"]),
  ];
  for (let seed = 1; seed < 40; seed += 1) {
    for (const question of round(words, { seed })) {
      const asked = words.find((w) => w.id === question.wordId);
      const alsoRight = words.filter((w) => w !== asked && (w.en === asked.en || w.dialects.pahari.forms.some((f) => asked.dialects.pahari.forms.includes(f))));
      const wrongTexts = question.choices.filter((_, i) => i !== question.answer);
      for (const other of alsoRight) {
        assert.ok(!wrongTexts.includes(question.reverse ? other.dialects.pahari.forms[0] : other.en), `${asked.id} offered ${other.id}`);
      }
      assert.equal(new Set(question.choices).size, CHOICE_COUNT);
    }
  }
});

test("wrong choices come from the asked word's own topic when it has enough words", () => {
  const forward = round(WORDS, { seed: 3 }).filter((q) => !q.reverse);
  for (const question of forward) {
    const topic = WORDS.find((w) => w.id === question.wordId).topic;
    for (const choice of question.choices) assert.equal(WORDS.find((w) => w.en === choice).topic, topic);
  }
});

test("a topic too small for three wrong choices borrows from the other words", () => {
  const words = [...NATURE, word("ant", "animals", ["ant-k"])];
  const asked = round(words).filter((q) => q.wordId === "ant");
  assert.ok(asked.length > 0);
  for (const question of asked) assert.equal(new Set(question.choices).size, CHOICE_COUNT);
});

test("every few questions the other way round: the meaning asked, the Kinnauri chosen", () => {
  const questions = round(WORDS);
  questions.forEach((question, index) => assert.equal(question.reverse, index % REVERSE_EVERY === REVERSE_EVERY - 1, `question ${index}`));
  const reversed = questions.find((q) => q.reverse);
  const asked = WORDS.find((w) => w.id === reversed.wordId);
  assert.equal(reversed.prompt, asked.en);
  assert.ok(reversed.choices.every((choice) => choice.endsWith("-k")));
  const forward = questions.find((q) => !q.reverse);
  assert.equal(forward.prompt, WORDS.find((w) => w.id === forward.wordId).dialects.pahari.forms[0]);
});

test("the same word is never asked twice in a row", () => {
  const questions = round(ANIMALS, { seed: 5 });
  for (let i = 1; i < questions.length; i += 1) assert.notEqual(questions[i].wordId, questions[i - 1].wordId);
});

test("meanings are shown in Hindi when chosen, English when the sheet has no Hindi", () => {
  assert.equal(meaningOf(word("cloud", "nature", ["x"]), "hi"), "cloud-hi");
  assert.equal(meaningOf(word("cloud", "nature", ["x"], { hi: "" }), "hi"), "cloud");
  const question = round(WORDS, { lang: "hi" }).find((q) => !q.reverse);
  assert.ok(question.choices.every((choice) => choice.endsWith("-hi")));
});

test("words that cannot make four different choices give no question at all", () => {
  const same = ["a", "b", "c", "d"].map((id) => word(id, "nature", ["k"], { en: "Same" }));
  assert.deepEqual(round(same), []);
  assert.deepEqual(round([]), []);
});

// Plays the game in a fake page, picking with `pick(question)` the index to tap.
function play(words, pick) {
  const doc = makeFakeDocument();
  const el = doc.createElement("main");
  const answers = [];
  const finishes = [];
  const unmount = game.mount(el, {
    words, dialect: "pahari", lang: "en", t, today: "2026-11-17",
    onAnswer: (id, correct) => answers.push({ id, correct }),
    onFinish: (result) => finishes.push(result),
  });
  return { el, answers, finishes, unmount };
}

const choiceButtons = (el) => findByClass(el, "pm-choice");
const rightIndex = (el) => choiceButtons(el).findIndex((b) => b.getAttribute("data-right") === "true");
const nextButton = (el) => findByClass(el, "pm-next")[0];

test("a right pick is cheered and counted once", () => {
  const { el, answers } = play(WORDS);
  const buttons = choiceButtons(el);
  buttons[rightIndex(el)].click();
  buttons[rightIndex(el)].click();
  assert.equal(answers.length, 1);
  assert.equal(answers[0].correct, true);
  assert.ok(buttons[rightIndex(el)].className.split(" ").includes("right"));
  assert.equal(findByClass(el, "pm-cheer").length, 1);
});

test("a wrong pick shows which one was right", () => {
  const { el, answers } = play(WORDS);
  const buttons = choiceButtons(el);
  const right = rightIndex(el);
  const wrong = (right + 1) % CHOICE_COUNT;
  buttons[wrong].click();
  assert.deepEqual(answers.map((a) => a.correct), [false]);
  assert.ok(buttons[wrong].className.split(" ").includes("wrong"));
  assert.ok(buttons[right].className.split(" ").includes("right"));
  assert.match(findByClass(el, "pm-feedback")[0].textContent, new RegExp(findByClass(buttons[right], "pm-choice-text")[0].textContent));
});

test("the score at the end matches the right answers given", () => {
  const { el, answers, finishes } = play(WORDS);
  for (let i = 0; i < ROUND_LENGTH; i += 1) {
    const right = rightIndex(el);
    choiceButtons(el)[i % 3 === 0 ? (right + 1) % CHOICE_COUNT : right].click();
    nextButton(el).click();
  }
  assert.equal(answers.length, ROUND_LENGTH);
  assert.deepEqual(finishes, [{ score: answers.filter((a) => a.correct).length, total: ROUND_LENGTH }]);
  assert.equal(finishes[0].score, 6);
});

test("number keys pick a choice", () => {
  const { el, answers } = play(WORDS);
  const root = findByClass(el, "pick-meaning")[0];
  for (const fn of root.listeners.keydown) fn({ key: String(rightIndex(el) + 1), preventDefault() {} });
  assert.deepEqual(answers.map((a) => a.correct), [true]);
});

test("unmounting takes the game, and its key listener, off the page", () => {
  const { el, unmount } = play(WORDS);
  unmount();
  assert.equal(allElements(el).length, 1);
});

test("too few usable words says so instead of a broken question", () => {
  const same = ["a", "b", "c", "d"].map((id) => word(id, "nature", ["k"], { en: "Same" }));
  const { el, finishes } = play(same);
  assert.equal(choiceButtons(el).length, 0);
  assert.match(el.textContent, /different/);
  assert.deepEqual(finishes, []);
});
