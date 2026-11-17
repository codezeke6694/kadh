// Flashcards (docs/joins.md J3): the Kinnauri word on the front, its meaning on the back.
import { dueWords } from "../data/progress.js";

export const DECK_SIZE = 10;
// A "Still learning" word comes back this many times at most, so every deck ends.
export const MAX_RETURNS = 2;
const KEY_LEARNING = "1";
const KEY_KNEW = "2";

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Words due for review first (oldest first), the rest filled in at random.
export function makeDeck(words, today, size = DECK_SIZE, rng = Math.random) {
  const due = dueWords(words, today, size);
  const dueIds = new Set(due.map((word) => word.id));
  const rest = shuffle(words.filter((word) => !dueIds.has(word.id)), rng);
  return [...due, ...rest].slice(0, size);
}

export function startDeck(words) {
  return { queue: words.map((word) => ({ word, returns: 0 })), score: 0, total: words.length };
}

// Only a word known the first time it is shown scores.
export function answerCard({ queue, score, total }, knew) {
  const [card, ...rest] = queue;
  if (knew) return { queue: rest, score: card.returns === 0 ? score + 1 : score, total };
  const back = card.returns < MAX_RETURNS ? [{ word: card.word, returns: card.returns + 1 }] : [];
  return { queue: [...rest, ...back], score, total };
}

function meaningOf(word, lang) {
  return (lang === "hi" && word.hi) || word.en;
}

function make(doc, tag, className, text = "") {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeButton(doc, className, text, onClick) {
  const button = make(doc, "button", className, text);
  button.setAttribute("type", "button");
  button.addEventListener("click", onClick);
  return button;
}

// The card is a button, so Space and Enter flip it as well as a tap.
function makeCard(doc, word, { dialect, lang, t }, flipped, onFlip) {
  const card = makeButton(doc, `fc-card${flipped ? " fc-flipped" : ""}`, "", onFlip);
  card.setAttribute("aria-label", flipped ? t("flashcards.meaningLabel") : t("flashcards.flipLabel"));
  const front = make(doc, "span", "fc-face fc-front");
  const kinnauri = make(doc, "span", "fc-kinnauri", word.dialects[dialect].forms[0]);
  kinnauri.setAttribute("lang", "hi");
  front.append(kinnauri, make(doc, "span", "fc-hint", t("flashcards.tapToFlip")));
  const back = make(doc, "span", "fc-face fc-back");
  back.append(make(doc, "span", "fc-meaning", meaningOf(word, lang)), make(doc, "span", "fc-small", word.dialects[dialect].forms[0]));
  card.append(front, back);
  return card;
}

function makeTally(doc, state, t) {
  const tally = make(doc, "p", "fc-tally");
  tally.append(
    make(doc, "span", "fc-left", `${t("flashcards.left")}: ${state.queue.length}`),
    make(doc, "span", "fc-known", `${t("flashcards.known")}: ${state.score}`),
  );
  return tally;
}

export default {
  id: "flashcards",
  title: { en: "Flashcards", hi: "फ़्लैशकार्ड" },
  blurb: { en: "See the Kinnauri word, guess its meaning, then flip the card.", hi: "किन्नौरी शब्द देखें, अर्थ सोचें, फिर कार्ड पलटें।" },
  icon: "🃏",
  minWords: 4,
  mount(el, context) {
    const { t, today, onAnswer, onFinish } = context;
    const doc = el.ownerDocument;
    let state = startDeck(makeDeck(context.words, today));
    let flipped = false;
    let stopped = false;
    let status = { text: "", kind: "" };

    function draw() {
      const word = state.queue[0].word;
      const card = makeCard(doc, word, context, flipped, flip);
      const play = make(doc, "div", "fc");
      const note = make(doc, "p", `fc-status ${status.kind}`, status.text);
      note.setAttribute("aria-live", "polite");
      play.append(makeTally(doc, state, t), card, note);
      if (flipped) play.append(makeAnswers());
      el.replaceChildren(play);
      card.focus?.();
    }

    function makeAnswers() {
      const answers = make(doc, "div", "fc-answers");
      answers.append(
        makeButton(doc, "button secondary fc-learning", t("flashcards.learning"), () => answer(false)),
        makeButton(doc, "button fc-knew", t("flashcards.knew"), () => answer(true)),
      );
      return answers;
    }

    function flip() {
      if (stopped) return;
      flipped = !flipped;
      draw();
    }

    function answer(knew) {
      if (stopped || !flipped) return;
      onAnswer(state.queue[0].word.id, knew);
      state = answerCard(state, knew);
      flipped = false;
      status = knew ? { text: t("flashcards.cheer"), kind: "fc-cheer" } : { text: t("flashcards.again"), kind: "fc-again" };
      if (state.queue.length) return draw();
      stopped = true;
      onFinish({ score: state.score, total: state.total });
    }

    function onKey(event) {
      if (event.key === KEY_LEARNING || event.key === KEY_KNEW) answer(event.key === KEY_KNEW);
    }

    el.addEventListener("keydown", onKey);
    draw();
    return () => {
      stopped = true;
      el.removeEventListener?.("keydown", onKey);
    };
  },
};
