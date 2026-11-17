// Match pairs (docs/joins.md J3): six Kinnauri words, their meanings shuffled beside them;
// tap one of each to pair them, against the clock, over three boards.

export const BOARDS = 3;
export const PAIRS_PER_BOARD = 6;
const SHAKE_MS = 600;
const NEXT_BOARD_MS = 900;
const TICK_MS = 1000;
const KINNAURI = "kinnauri";
const MEANING = "meaning";

// Fisher-Yates on a copy, with the random source passed in so tests can fix it.
function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toPair(word, dialect, lang) {
  return { id: word.id, kinnauri: word.dialects[dialect].forms[0], meaning: (lang === "hi" && word.hi) || word.en };
}

// Two cards that read the same are interchangeable, so a pair is judged by what the learner sees.
export function isPair(kinnauriPair, meaningPair) {
  return kinnauriPair.id === meaningPair.id
    || kinnauriPair.meaning === meaningPair.meaning
    || kinnauriPair.kinnauri === meaningPair.kinnauri;
}

// Takes the deck from `start` round to the start again, preferring cards no other card on the board reads like.
function makeBoard(deck, start, rng) {
  const from = start % deck.length;
  const ordered = [...deck.slice(from), ...deck.slice(0, from)];
  const pairs = [];
  const looksTaken = (pair) => pairs.some((taken) => taken.kinnauri === pair.kinnauri || taken.meaning === pair.meaning);
  for (const pair of ordered) if (pairs.length < PAIRS_PER_BOARD && !looksTaken(pair)) pairs.push(pair);
  for (const pair of ordered) if (pairs.length < PAIRS_PER_BOARD && !pairs.includes(pair)) pairs.push(pair);
  return { pairs, meanings: shuffle(pairs, rng) };
}

export function makeRound(words, dialect, lang, rng = Math.random) {
  const usable = words.filter((word) => word.dialects?.[dialect]?.forms?.[0]);
  if (!usable.length) throw new RangeError(`match-pairs: no words in ${dialect}`);
  const deck = shuffle(usable.map((word) => toPair(word, dialect, lang)), rng);
  return Array.from({ length: BOARDS }, (_, index) => makeBoard(deck, index * PAIRS_PER_BOARD, rng));
}

export function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function make(doc, tag, className = "", text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function setClass(el, name, on) {
  const names = el.className.split(" ").filter((part) => part && part !== name);
  if (on) names.push(name);
  el.className = names.join(" ");
}

function mount(el, { words, dialect, lang, t, onAnswer, onFinish }) {
  const doc = el.ownerDocument;
  const game = {
    boards: makeRound(words, dialect, lang), boardIndex: 0, picked: {}, missed: new Set(),
    matched: 0, score: 0, startedAt: Date.now(), endedAt: 0, timeouts: new Set(),
  };
  const later = (ms, fn) => {
    const id = setTimeout(() => { game.timeouts.delete(id); fn(); }, ms);
    game.timeouts.add(id);
  };

  const root = make(doc, "section", "mp");
  const boardCount = make(doc, "p", "mp-board-count");
  const clock = make(doc, "p", "mp-clock");
  clock.setAttribute("role", "timer");
  const status = make(doc, "div", "mp-status");
  status.append(boardCount, clock);
  const columns = make(doc, "div", "mp-columns");
  const feedback = make(doc, "p", "mp-feedback");
  feedback.setAttribute("aria-live", "polite");
  root.append(status, make(doc, "p", "mp-howto muted", t("matchPairs.howTo")), columns, feedback);
  el.replaceChildren(root);

  const showClock = () => { clock.textContent = `${t("matchPairs.time")} ${formatTime(Date.now() - game.startedAt)}`; };
  showClock();
  const ticker = setInterval(showClock, TICK_MS);

  function say(key, mood) {
    feedback.className = `mp-feedback mp-feedback-${mood}`;
    feedback.textContent = t(key);
  }

  function makeColumn(side, pairs) {
    const column = make(doc, "div", `mp-column mp-column-${side}`);
    const label = side === KINNAURI ? "matchPairs.kinnauri" : "matchPairs.meaning";
    column.append(make(doc, "h2", "mp-column-label", t(label)));
    for (const pair of pairs) {
      const card = make(doc, "button", `mp-card mp-${side}`, pair[side]);
      card.setAttribute("type", "button");
      card.setAttribute("data-pair", pair.id);
      if (side === KINNAURI) card.setAttribute("lang", "hi");
      card.addEventListener("click", () => choose(card, side, pair));
      column.append(card);
    }
    return column;
  }

  function drawBoard() {
    const board = game.boards[game.boardIndex];
    game.picked = {};
    game.missed = new Set();
    game.matched = 0;
    boardCount.textContent = `${t("matchPairs.board")} ${game.boardIndex + 1} ${t("matchPairs.of")} ${BOARDS}`;
    feedback.textContent = "";
    columns.replaceChildren(makeColumn(KINNAURI, board.pairs), makeColumn(MEANING, board.meanings));
  }

  function choose(card, side, pair) {
    if (card.disabled) return;
    const before = game.picked[side];
    if (before) setClass(before.card, "mp-picked", false);
    if (before?.card === card) {
      delete game.picked[side];
      return;
    }
    setClass(card, "mp-wrong", false);
    setClass(card, "mp-picked", true);
    game.picked[side] = { card, pair };
    if (game.picked[KINNAURI] && game.picked[MEANING]) judge(game.picked[KINNAURI], game.picked[MEANING]);
  }

  function judge(left, right) {
    game.picked = {};
    const correct = isPair(left.pair, right.pair);
    onAnswer(left.pair.id, correct);
    for (const { card } of [left, right]) {
      setClass(card, "mp-picked", false);
      setClass(card, correct ? "mp-right" : "mp-wrong", true);
      if (correct) card.disabled = true;
    }
    if (!correct) {
      game.missed.add(left.pair.id);
      say("matchPairs.wrong", "wrong");
      later(SHAKE_MS, () => { setClass(left.card, "mp-wrong", false); setClass(right.card, "mp-wrong", false); });
      return;
    }
    if (!game.missed.has(left.pair.id)) game.score += 1;
    game.matched += 1;
    if (game.matched < game.boards[game.boardIndex].pairs.length) return say("matchPairs.right", "right");
    say("matchPairs.boardDone", "right");
    finishBoard();
  }

  function finishBoard() {
    game.boardIndex += 1;
    if (game.boardIndex < BOARDS) return later(NEXT_BOARD_MS, drawBoard);
    game.endedAt = Date.now();
    clearInterval(ticker);
    later(NEXT_BOARD_MS, showDone);
  }

  function showDone() {
    const total = BOARDS * PAIRS_PER_BOARD;
    const done = make(doc, "div", "mp-done");
    const time = make(doc, "p", "mp-time-taken");
    time.append(make(doc, "span", "mp-time-label", t("matchPairs.timeTaken")), make(doc, "span", "mp-time-value", formatTime(game.endedAt - game.startedAt)));
    const firstTry = make(doc, "p", "mp-first-try", `${t("matchPairs.firstTry")}: ${game.score} / ${total}`);
    const next = make(doc, "button", "button mp-see-score", t("matchPairs.seeScore"));
    next.setAttribute("type", "button");
    next.addEventListener("click", () => onFinish({ score: game.score, total }));
    done.append(make(doc, "h2", "mp-done-title", t("matchPairs.doneTitle")), time, firstTry, next);
    root.replaceChildren(done);
    next.focus?.();
  }

  drawBoard();
  return () => {
    clearInterval(ticker);
    for (const id of game.timeouts) clearTimeout(id);
    game.timeouts.clear();
  };
}

export default {
  id: "match-pairs",
  title: { en: "Match pairs", hi: "जोड़ी मिलाओ" },
  blurb: { en: "Pair six Kinnauri words with their meanings, against the clock.", hi: "छह किन्नौरी शब्दों को उनके अर्थ से मिलाएँ, घड़ी के साथ।" },
  icon: "🧩",
  minWords: PAIRS_PER_BOARD,
  mount,
};
