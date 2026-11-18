// Memory flip (docs/joins.md J3): twelve face-down cards, six Kinnauri words and their six
// meanings; turn two at a time, a pair stays up, and the moves are counted.

export const PAIRS = 6;
export const FLIP_BACK_MS = 900;
export const SIDE = Object.freeze({ WORD: "word", MEANING: "meaning" });
export const TURN = Object.freeze({ FIRST: "first", MATCH: "match", MISS: "miss", IGNORED: "ignored" });

// Each pair after the first try ought to need one more look; past that, two moves cost a point.
const MISSES_PER_POINT = 2;

function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function meaningOf(word, lang) {
  return (lang === "hi" && word.hi) || word.en;
}

// Up to PAIRS words whose card texts are all different, so a card never fits two pairs.
function pickWords(words, { dialect, lang }, rng) {
  const seen = new Set();
  const picked = [];
  for (const word of shuffle(words, rng)) {
    const kinnauri = word.dialects?.[dialect]?.forms?.[0];
    const meaning = meaningOf(word, lang);
    if (!kinnauri || !meaning || seen.has(kinnauri) || seen.has(meaning)) continue;
    seen.add(kinnauri).add(meaning);
    picked.push({ id: word.id, kinnauri, meaning });
    if (picked.length === PAIRS) break;
  }
  return picked;
}

export function makeDeck(words, settings, rng = Math.random) {
  const cards = pickWords(words, settings, rng).flatMap(({ id, kinnauri, meaning }) => [
    { pairId: id, side: SIDE.WORD, text: kinnauri },
    { pairId: id, side: SIDE.MEANING, text: meaning },
  ]);
  return shuffle(cards, rng);
}

export function scoreForMoves(moves, pairs) {
  const extra = Math.max(0, moves - pairs);
  return Math.max(0, pairs - Math.floor(extra / MISSES_PER_POINT));
}

// The cards on the table: which are found, which are showing, and the moves so far.
export class MemoryBoard {
  constructor(cards) {
    this.cards = cards;
    this.found = new Set();
    this.showing = [];
    this.moves = 0;
  }

  get pairs() {
    return this.cards.length / 2;
  }

  get done() {
    return this.found.size === this.cards.length;
  }

  get waiting() {
    return this.showing.length === 2;
  }

  isUp(index) {
    return this.found.has(index) || this.showing.includes(index);
  }

  turn(index) {
    if (this.waiting || this.isUp(index) || !this.cards[index]) return TURN.IGNORED;
    this.showing.push(index);
    if (this.showing.length === 1) return TURN.FIRST;
    this.moves += 1;
    const [a, b] = this.showing.map((i) => this.cards[i]);
    if (a.pairId !== b.pairId) return TURN.MISS;
    this.showing.forEach((i) => this.found.add(i));
    this.showing = [];
    return TURN.MATCH;
  }

  hideMiss() {
    this.showing = [];
  }
}

function make(doc, tag, className = "", text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

// A card holding a word longer than this many letters gets smaller type, so the word stays whole
// on a phone ("Grandparents" was split "Grandparent / s").
export const LONG_WORD = 9;

export function isLongText(text) {
  return String(text).split(/\s+/).some((part) => [...part].length > LONG_WORD);
}

function makeCard(doc, card, index, onTurn) {
  const button = make(doc, "button", "memory-card");
  button.setAttribute("type", "button");
  button.setAttribute("data-pair", card.pairId);
  const back = make(doc, "span", "memory-back");
  const long = isLongText(card.text) ? " memory-long" : "";
  const face = make(doc, "span", `memory-face memory-${card.side}${long}`, card.text);
  if (card.side === SIDE.WORD) face.setAttribute("lang", "hi");
  back.setAttribute("aria-hidden", "true");
  face.setAttribute("aria-hidden", "true");
  button.append(back, face);
  button.addEventListener("click", () => onTurn(index));
  return button;
}

function showCard(button, board, index, t) {
  const up = board.isUp(index);
  const found = board.found.has(index);
  button.className = `memory-card${up ? " is-up" : ""}${found ? " is-matched" : ""}`;
  const label = up ? board.cards[index].text : `${t("memoryFlip.card")} ${index + 1}`;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(up));
}

function showDone(doc, area, board, t, onFinish) {
  const done = make(doc, "div", "memory-done card");
  const tally = make(doc, "p", "memory-done-moves", `${board.moves} ${t("memoryFlip.movesWord")}`);
  const see = make(doc, "button", "button", t("memoryFlip.seeScore"));
  see.setAttribute("type", "button");
  see.addEventListener("click", () => onFinish({ score: scoreForMoves(board.moves, board.pairs), total: board.pairs }));
  done.append(make(doc, "h2", "memory-done-title", t("memoryFlip.allFound")), tally, see);
  area.append(done);
}

function mount(el, { words, dialect, lang, t, onAnswer, onFinish }) {
  const doc = el.ownerDocument;
  const board = new MemoryBoard(makeDeck(words, { dialect, lang }));
  const moves = make(doc, "p", "memory-moves");
  const feedback = make(doc, "p", "memory-feedback");
  feedback.setAttribute("aria-live", "polite");
  const grid = make(doc, "div", "memory-grid");
  const area = make(doc, "div", "memory");
  let timer = null;

  const buttons = board.cards.map((card, index) => makeCard(doc, card, index, turnCard));
  const redraw = (message = "") => {
    buttons.forEach((button, index) => showCard(button, board, index, t));
    moves.textContent = `${t("memoryFlip.moves")}: ${board.moves}`;
    feedback.textContent = message;
  };

  function turnCard(index) {
    const result = board.turn(index);
    if (result === TURN.IGNORED) return;
    if (result === TURN.MATCH) onAnswer(board.cards[index].pairId, true);
    redraw(result === TURN.MATCH ? t("memoryFlip.match") : result === TURN.MISS ? t("memoryFlip.miss") : "");
    if (result === TURN.MISS) timer = setTimeout(flipBack, FLIP_BACK_MS);
    if (board.done) showDone(doc, area, board, t, onFinish);
  }

  function flipBack() {
    timer = null;
    board.hideMiss();
    redraw(feedback.textContent);
  }

  grid.append(...buttons);
  area.append(moves, grid, feedback);
  el.replaceChildren(area);
  redraw(t("memoryFlip.howTo"));
  return () => clearTimeout(timer);
}

export default {
  id: "memory-flip",
  title: { en: "Memory flip", hi: "याद का खेल" },
  blurb: { en: "Turn two cards at a time and find each word with its meaning.", hi: "दो-दो कार्ड पलटें और हर शब्द को उसके अर्थ से मिलाएँ।" },
  icon: "🧠",
  minWords: PAIRS,
  mount,
};
