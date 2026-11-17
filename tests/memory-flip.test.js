import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import game, { makeDeck, MemoryBoard, scoreForMoves, PAIRS, FLIP_BACK_MS, TURN } from "../src/games/memory-flip.js";
import { checkGame } from "../src/games/index.js";
import { t, setLang, loadStrings } from "../src/i18n.js";
import { makeFakeDocument, findByClass, findButton } from "./fake-dom.js";

function word(id, hi = `${id}-hi`) {
  return { id, en: id, hi, dialects: { pahari: { text: `${id}-k`, forms: [`${id}-k`, `${id}-alt`] } }, topic: "nature" };
}

const WORDS = ["cloud", "snow", "river", "tree", "goat", "dog", "cow"].map((id) => word(id));
const firstPick = () => 0;

function dealt(words = WORDS.slice(0, PAIRS)) {
  return makeDeck(words, { dialect: "pahari", lang: "en" }, firstPick);
}

function pairOf(cards, index) {
  return cards.findIndex((card, i) => i !== index && card.pairId === cards[index].pairId);
}

function otherPair(cards, index) {
  return cards.findIndex((card) => card.pairId !== cards[index].pairId);
}

beforeEach(async () => {
  setLang("en");
  await loadStrings();
});

test("memory flip keeps the J3 game contract", () => {
  assert.doesNotThrow(() => checkGame(game, "memory-flip"));
  assert.equal(game.minWords, PAIRS);
});

test("the deck holds six words and their six meanings, face down", () => {
  const cards = makeDeck(WORDS, { dialect: "pahari", lang: "en" });
  assert.equal(cards.length, 2 * PAIRS);
  assert.equal(cards.filter((card) => card.side === "word").length, PAIRS);
  assert.equal(cards.filter((card) => card.side === "meaning").length, PAIRS);
  for (const card of cards) assert.equal(cards.filter((other) => other.pairId === card.pairId).length, 2);
  const kinnauri = cards.find((card) => card.side === "word");
  assert.equal(kinnauri.text, `${kinnauri.pairId}-k`, "the first form of the chosen Kinnauri");
});

test("the meaning follows the language, English when the Hindi is empty", () => {
  const hindi = makeDeck([word("a"), word("b", "")], { dialect: "pahari", lang: "hi" });
  const meanings = hindi.filter((card) => card.side === "meaning").map((card) => card.text).sort();
  assert.deepEqual(meanings, ["a-hi", "b"]);
});

test("words that look the same on a card are not dealt twice, so every pair is clear", () => {
  const twins = [word("a"), { ...word("b"), en: "a" }, word("c")];
  const cards = makeDeck(twins, { dialect: "pahari", lang: "en" });
  const meanings = cards.filter((card) => card.side === "meaning").map((card) => card.text);
  assert.equal(meanings.length, 2);
  assert.equal(new Set(meanings).size, 2);
});

test("two cards that match stay face up and count one move", () => {
  const board = new MemoryBoard(dealt());
  assert.equal(board.turn(0), TURN.FIRST);
  assert.equal(board.turn(pairOf(board.cards, 0)), TURN.MATCH);
  assert.equal(board.moves, 1);
  assert.ok(board.isUp(0) && board.isUp(pairOf(board.cards, 0)));
  assert.equal(board.turn(0), TURN.IGNORED, "a found card cannot be turned again");
});

test("two cards that do not match stay up until hidden, then turn back", () => {
  const board = new MemoryBoard(dealt());
  board.turn(0);
  const other = otherPair(board.cards, 0);
  assert.equal(board.turn(other), TURN.MISS);
  assert.equal(board.moves, 1);
  const third = board.cards.findIndex((_, i) => i !== 0 && i !== other);
  assert.equal(board.turn(third), TURN.IGNORED, "no third card while two are showing");
  board.hideMiss();
  assert.ok(!board.isUp(0) && !board.isUp(other));
});

test("turning the same card twice is not a move", () => {
  const board = new MemoryBoard(dealt());
  board.turn(0);
  assert.equal(board.turn(0), TURN.IGNORED);
  assert.equal(board.moves, 0);
});

test("the board is done when every pair is found", () => {
  const board = new MemoryBoard(dealt());
  for (let i = 0; i < PAIRS; i++) {
    assert.ok(!board.done);
    const index = board.cards.findIndex((_, j) => !board.isUp(j));
    board.turn(index);
    board.turn(pairOf(board.cards, index));
  }
  assert.ok(board.done);
  assert.equal(board.moves, PAIRS);
});

test("score: a perfect game scores every pair; each two extra moves cost a point, never below zero", () => {
  assert.equal(scoreForMoves(6, 6), 6);
  assert.equal(scoreForMoves(7, 6), 6);
  assert.equal(scoreForMoves(8, 6), 5);
  assert.equal(scoreForMoves(16, 6), 1);
  assert.equal(scoreForMoves(18, 6), 0);
  assert.equal(scoreForMoves(60, 6), 0);
});

describeMount();

function describeMount() {
  let timers;
  beforeEach(() => {
    timers = mock.timers;
    timers.enable({ apis: ["setTimeout"] });
  });
  afterEach(() => timers.reset());

  function play() {
    const doc = makeFakeDocument();
    const el = doc.createElement("div");
    const answers = [];
    const finished = [];
    const context = {
      words: WORDS.slice(0, PAIRS), dialect: "pahari", lang: "en", t, today: "2026-11-17",
      onAnswer: (id, correct) => answers.push([id, correct]),
      onFinish: (result) => finished.push(result),
    };
    const unmount = game.mount(el, context);
    const cards = () => findByClass(el, "memory-card");
    const pairIds = () => cards().map((card) => card.getAttribute("data-pair"));
    const partner = (i) => pairIds().findIndex((id, j) => j !== i && id === pairIds()[i]);
    const stranger = (i) => pairIds().findIndex((id) => id !== pairIds()[i]);
    const isUp = (i) => cards()[i].className.includes("is-up");
    return { el, cards, partner, stranger, isUp, answers, finished, unmount };
  }

  test("mount deals twelve face-down cards and a move count", () => {
    const { el, cards, isUp } = play();
    assert.equal(cards().length, 2 * PAIRS);
    assert.ok(cards().every((_, i) => !isUp(i)));
    assert.match(el.textContent, /Moves: 0/);
  });

  test("on screen, a matching pair stays face up", () => {
    const { el, cards, partner, isUp, answers } = play();
    const mate = partner(0);
    cards()[0].click();
    cards()[mate].click();
    timers.tick(FLIP_BACK_MS * 2);
    assert.ok(isUp(0) && isUp(mate));
    assert.ok(cards()[0].className.includes("is-matched"));
    assert.match(el.textContent, /Moves: 1/);
    assert.equal(answers.length, 1);
    assert.equal(answers[0][1], true);
  });

  test("on screen, a wrong pair turns back after a moment", () => {
    const { cards, stranger, isUp, answers } = play();
    const other = stranger(0);
    cards()[0].click();
    cards()[other].click();
    assert.ok(isUp(0) && isUp(other), "both show for a moment");
    timers.tick(FLIP_BACK_MS);
    assert.ok(!isUp(0) && !isUp(other));
    assert.equal(answers.length, 0, "a miss is memory, not a wrong answer about the word");
  });

  test("finding every pair ends the game, shows the moves, then reports the score", () => {
    const { el, cards, partner, stranger, finished } = play();
    cards()[0].click();
    cards()[stranger(0)].click();
    timers.tick(FLIP_BACK_MS);
    const seen = new Set();
    for (let i = 0; i < cards().length; i++) {
      if (seen.has(i)) continue;
      const mate = partner(i);
      seen.add(i).add(mate);
      cards()[i].click();
      cards()[mate].click();
    }
    assert.match(el.textContent, /7 moves/);
    assert.equal(finished.length, 0, "the moves show before the results");
    findButton(el, "See my score").click();
    assert.deepEqual(finished, [{ score: scoreForMoves(7, PAIRS), total: PAIRS }]);
  });

  test("unmount stops the flip-back timer", () => {
    const { cards, stranger, isUp, unmount } = play();
    const other = stranger(0);
    cards()[0].click();
    cards()[other].click();
    unmount();
    timers.tick(FLIP_BACK_MS);
    assert.ok(isUp(0), "nothing changed after unmount");
  });
}
