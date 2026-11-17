import { test, mock } from "node:test";
import assert from "node:assert/strict";
import game, { makeRound, isPair, formatTime, BOARDS, PAIRS_PER_BOARD } from "../src/games/match-pairs.js";
import { checkGame } from "../src/games/index.js";
import { makeFakeDocument, findByClass, findButton } from "./fake-dom.js";
import strings from "../src/i18n/match-pairs.js";

function word(n) {
  return {
    id: `w${n}`,
    en: `Meaning ${n}`,
    hi: n % 2 ? `अर्थ ${n}` : "",
    dialects: { pahari: { text: `किन ${n}/दूसरा`, forms: [`किन ${n}`, "दूसरा"] } },
    topic: "nature",
  };
}

const WORDS = Array.from({ length: 8 }, (_, i) => word(i + 1));
const fixedRng = () => 0.42;

function startGame(words = WORDS, lang = "en") {
  const doc = makeFakeDocument();
  const el = doc.createElement("div");
  const answers = [];
  const finished = [];
  const t = (key) => strings.en[key] ?? key;
  const unmount = game.mount(el, {
    words, dialect: "pahari", lang, t, today: "2026-11-17",
    onAnswer: (id, correct) => answers.push([id, correct]),
    onFinish: (result) => finished.push(result),
  });
  return { el, answers, finished, unmount };
}

const leftCards = (el) => findByClass(el, "mp-kinnauri");
const rightCards = (el) => findByClass(el, "mp-meaning");
const meaningFor = (el, card) => rightCards(el).find((right) => right.getAttribute("data-pair") === card.getAttribute("data-pair"));
const wrongFor = (el, card) => rightCards(el).find((right) => right.getAttribute("data-pair") !== card.getAttribute("data-pair") && !right.disabled);

function solveBoard(el) {
  for (const card of leftCards(el)) {
    card.click();
    meaningFor(el, card).click();
  }
}

test("the game keeps the J3 contract", () => {
  assert.doesNotThrow(() => checkGame(game, "match-pairs"));
  assert.equal(game.minWords, PAIRS_PER_BOARD);
});

test("both languages have the same strings", () => {
  assert.deepEqual(Object.keys(strings.hi).sort(), Object.keys(strings.en).sort());
});

test("makeRound gives three boards of six distinct pairs, Kinnauri from forms[0]", () => {
  const boards = makeRound(WORDS, "pahari", "en", fixedRng);
  assert.equal(boards.length, BOARDS);
  for (const board of boards) {
    assert.equal(board.pairs.length, PAIRS_PER_BOARD);
    assert.equal(new Set(board.pairs.map((pair) => pair.id)).size, PAIRS_PER_BOARD);
    assert.deepEqual(board.meanings.map((pair) => pair.id).sort(), board.pairs.map((pair) => pair.id).sort());
    for (const pair of board.pairs) assert.match(pair.kinnauri, /^किन \d$/);
  }
});

test("makeRound shows Hindi meanings, falling back to English when hi is empty", () => {
  const pairs = makeRound(WORDS, "pahari", "hi", fixedRng).flatMap((board) => board.pairs);
  assert.ok(pairs.some((pair) => pair.meaning.startsWith("अर्थ")));
  assert.ok(pairs.some((pair) => pair.meaning.startsWith("Meaning")));
});

test("makeRound keeps a board free of repeated Kinnauri or meaning when it can", () => {
  const twin = { ...word(9), id: "twin", en: "Meaning 1" };
  const boards = makeRound([...WORDS, twin], "pahari", "en", Math.random);
  for (const board of boards) {
    assert.equal(new Set(board.pairs.map((pair) => pair.meaning)).size, PAIRS_PER_BOARD);
  }
});

test("isPair: same word, same meaning or same Kinnauri is a pair; anything else is not", () => {
  const a = { id: "a", kinnauri: "जू", meaning: "Cloud" };
  assert.equal(isPair(a, a), true);
  assert.equal(isPair(a, { id: "b", kinnauri: "x", meaning: "Cloud" }), true);
  assert.equal(isPair(a, { id: "c", kinnauri: "जू", meaning: "Other" }), true);
  assert.equal(isPair(a, { id: "d", kinnauri: "y", meaning: "Other" }), false);
});

test("formatTime shows minutes and seconds", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(9_999), "0:09");
  assert.equal(formatTime(83_000), "1:23");
  assert.equal(formatTime(-5), "0:00");
});

test("a right pair locks green and counts as right", () => {
  const { el, answers, unmount } = startGame();
  const card = leftCards(el)[0];
  card.click();
  meaningFor(el, card).click();
  assert.ok(card.className.includes("mp-right"));
  assert.ok(meaningFor(el, card).className.includes("mp-right"));
  assert.equal(card.disabled, true);
  assert.deepEqual(answers, [[card.getAttribute("data-pair"), true]]);
  unmount();
});

test("a wrong pair shakes, then clears so both can be tried again", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { el, answers, unmount } = startGame();
    const card = leftCards(el)[0];
    const wrong = wrongFor(el, card);
    card.click();
    wrong.click();
    assert.ok(card.className.includes("mp-wrong") && wrong.className.includes("mp-wrong"));
    assert.notEqual(card.disabled, true);
    assert.deepEqual(answers, [[card.getAttribute("data-pair"), false]]);
    mock.timers.tick(1000);
    assert.ok(!card.className.includes("mp-wrong") && !card.className.includes("mp-picked"));
    assert.ok(!wrong.className.includes("mp-wrong"));
    unmount();
  } finally {
    mock.timers.reset();
  }
});

test("a meaning can be tapped first, and tapping the same column again moves the pick", () => {
  const { el, answers, unmount } = startGame();
  const [first, second] = leftCards(el);
  first.click();
  second.click();
  assert.ok(!first.className.includes("mp-picked") && second.className.includes("mp-picked"));
  second.click();
  meaningFor(el, first).click();
  first.click();
  assert.ok(first.className.includes("mp-right"));
  assert.deepEqual(answers, [[first.getAttribute("data-pair"), true]]);
  unmount();
});

test("the round ends after three boards and shows the time taken before the score", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { el, finished, unmount } = startGame();
    for (let board = 1; board <= BOARDS; board += 1) {
      assert.ok(findByClass(el, "mp-board-count")[0].textContent.includes(String(board)));
      mock.timers.tick(20_000);
      solveBoard(el);
      mock.timers.tick(2000);
    }
    assert.deepEqual(finished, []);
    const time = findByClass(el, "mp-time-taken")[0];
    assert.ok(time, "the time taken is shown");
    assert.ok(time.textContent.includes("1:0"), time.textContent);
    findButton(el, strings.en["matchPairs.seeScore"]).click();
    assert.deepEqual(finished, [{ score: BOARDS * PAIRS_PER_BOARD, total: BOARDS * PAIRS_PER_BOARD }]);
    unmount();
  } finally {
    mock.timers.reset();
  }
});

test("the score counts only pairs right first try", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { el, finished, unmount } = startGame();
    const card = leftCards(el)[0];
    card.click();
    wrongFor(el, card).click();
    mock.timers.tick(1000);
    for (let board = 1; board <= BOARDS; board += 1) {
      solveBoard(el);
      mock.timers.tick(2000);
    }
    findButton(el, strings.en["matchPairs.seeScore"]).click();
    assert.deepEqual(finished, [{ score: BOARDS * PAIRS_PER_BOARD - 1, total: BOARDS * PAIRS_PER_BOARD }]);
    unmount();
  } finally {
    mock.timers.reset();
  }
});

test("unmount stops the timer and pending clears", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { el, unmount } = startGame();
    const card = leftCards(el)[0];
    card.click();
    wrongFor(el, card).click();
    const clock = findByClass(el, "mp-clock")[0];
    unmount();
    const shown = clock.textContent;
    mock.timers.tick(5000);
    assert.equal(clock.textContent, shown);
    assert.ok(card.className.includes("mp-wrong"));
  } finally {
    mock.timers.reset();
  }
});
